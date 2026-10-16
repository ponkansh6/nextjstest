import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { RefreshError, invariant } from "../lib/errors.mjs";
import { fetchOfficialFile, OFFICIAL_ESTAT_FILE_HOSTS } from "../transport/file.mjs";
import { fetchDataCatalog, resolveCatalogResource } from "../transport/estat-api.mjs";
import {
  buildCtiBasicArtifacts,
  buildCtiCurrentMonthlyArtifacts,
  parseCtiCurrentHouseholdMonthly,
  parseOfficialFile,
  SERIES,
} from "../../fetch-cti-basic-series-2025.mjs";
import { buildPlan39CtiArtifacts } from "../../plan39/fetch-and-build.mjs";
import {
  CTI_INPUT_IDENTITIES,
  CTI_OUTPUTS,
  CTI_SOURCE_CONTRACT,
} from "../registry/cti-contract.mjs";

const IDS = ["000040499070", "000040499082", "000040499028", "000040499069", "000040499087"];
const PINNED = [
  {
    path: "data/source/cti-adjusted/L.json",
    sha256: "26902849c7d835a1dcf3db130384600d0f853907fac927e7942fb806e2eec076",
  },
  {
    path: "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv",
    sha256: "175dd6a00a17dfdc9cfbedb397e76965ab95d272ee6784a3e1187e432c939b9d",
  },
  {
    path: "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.metadata.json",
    sha256: "898b42896823e6ab3de2c9a45b03b8903e0e5bf58d5b28c978977ccc4f595fe4",
  },
  {
    path: "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.csv",
    sha256: "6d0c1b40674a566a64e23a985456362a4f6950370783c6d37f025934b519e92d",
  },
  {
    path: "data/source/cti-size-composition/lfs-iv4-2004-pi2plus.metadata.json",
    sha256: "e61853588b29e0f02f0fd63cf1e380334783adba7d23c858fb888c31dfe865d0",
  },
];
const BASIC_XLSX = "data/source/official-cti-2025/cti-basic-000040499069.xlsx";
const ADJUSTED_XLSX = "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Refreshes the complete CTI artifact group into caller-owned staging.
 * File downloads use statInfId URLs and do not require an e-Stat API app ID.
 */
export async function ctiAdapter({
  source,
  root = process.cwd(),
  stageRoot,
  now = () => new Date(),
  fetchFile = fetchOfficialFile,
  transportConfig = {},
  fetchImpl = fetch,
  getDataCatalog,
} = {}) {
  invariant(
    source?.identity?.kind === "file" &&
      source.identity.statInfId === "000040499070" &&
      source.identity.format === "xlsx",
    "cti-identity-mismatch",
    "CTI adapter requires the verified 000040499070 XLSX identity.",
  );
  invariant(
    typeof stageRoot === "string" && stageRoot.length > 0,
    "cti-stage-root-required",
    "CTI adapter requires the caller-owned staging root.",
  );
  validateRegistryContract(source);
  if (
    !Array.isArray(source.fileCandidateIdentities) ||
    source.fileCandidateIdentities.length !== IDS.length
  ) {
    throw markCandidatePending(
      new RefreshError(
        "candidate-resolution-pending",
        "CTI registry lacks candidate identity contracts for all source files.",
      ),
      "cti-official",
    );
  }
  if (
    !IDS.every((id) =>
      source.fileCandidateIdentities.some(
        (contract) =>
          contract?.statInfId === id &&
          contract.format === "XLSX" &&
          contract.query?.dataType === "XLS" &&
          Array.isArray(contract.titleIncludes) &&
          contract.titleIncludes.length > 0 &&
          Array.isArray(contract.datasetIncludes) &&
          Array.isArray(contract.resourceIncludes) &&
          Array.isArray(contract.tableIncludes) &&
          Array.isArray(contract.categoryIncludes) &&
          Array.isArray(contract.periodIncludes) &&
          Array.isArray(contract.yearIncludes),
      ),
    )
  ) {
    throw markCandidatePending(
      new RefreshError(
        "candidate-resolution-pending",
        "CTI file candidate identity contracts do not match the five logical source identities.",
      ),
      "cti-official",
    );
  }
  const catalogResponses = [];
  const captureCatalogFetch = async (input, init, contract) => {
    const response = await fetchImpl(input, init);
    invariant(
      typeof response?.clone === "function",
      "candidate-resolution-pending",
      "DataCatalog response cannot be safely captured.",
    );
    let bytes;
    try {
      bytes = Buffer.from(await response.clone().arrayBuffer());
    } catch {
      throw new RefreshError(
        "candidate-resolution-pending",
        "DataCatalog response bytes are unavailable for hash evidence.",
      );
    }
    const requestUrl = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    catalogResponses.push({
      name: `cti-catalog-${contract.statInfId}-page-${requestUrl.searchParams.get("startPosition") || "1"}`,
      bytes,
    });
    return response;
  };
  const selectedFiles = [];
  for (const contract of source.fileCandidateIdentities) {
    let selected;
    try {
      const result = await (
        getDataCatalog ||
        ((query) =>
          fetchDataCatalog({
            appId: transportConfig.appId,
            fetchImpl: (input, init) => captureCatalogFetch(input, init, contract),
            query,
            limit: 100,
          }))
      )(contract.query, contract);
      const datasets = Array.isArray(result) ? result : result?.datasets;
      selected = resolveCatalogResource(datasets, {
        statInfId: contract.statInfId,
        expectedFormat: contract.format,
        titleIncludes: contract.titleIncludes,
        datasetIncludes: contract.datasetIncludes || [],
        resourceIncludes: contract.resourceIncludes || [],
        tableIncludes: contract.tableIncludes || [],
        categoryIncludes: contract.categoryIncludes || [],
        periodIncludes: contract.periodIncludes || [],
        yearIncludes: contract.yearIncludes || [],
      });
    } catch (error) {
      throw markCandidatePending(error, `cti-${contract.statInfId}`);
    }
    selectedFiles.push({
      identityStatInfId: contract.statInfId,
      url: selected.url,
      catalogResourceId: selected.catalogResourceId,
      legacyStatInfId: selected.legacyStatInfId,
      title: selected.datasetTitle,
      resourceTitle: selected.resourceTitle,
      format: selected.format,
      releaseDate: selected.releaseDate,
      lastModifiedDate: selected.lastModifiedDate,
      identityMarkers: {
        table: contract.tableIncludes,
        category: contract.categoryIncludes,
        period: contract.periodIncludes,
        year: contract.yearIncludes,
      },
      candidateCount: selected.candidateCount,
    });
  }
  const sourceBytes = {};
  const responseMetadata = {};
  const rawFetches = [...catalogResponses];
  for (const statInfId of IDS) {
    const selected = selectedFiles.find((item) => item.identityStatInfId === statInfId);
    invariant(
      selected?.url,
      "candidate-resolution-pending",
      `CTI catalog candidate is missing for logical source ${statInfId}.`,
    );
    let response;
    try {
      response = await fetchFile({ url: selected.url, allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS });
    } catch (error) {
      if (error && typeof error === "object") error.sourceId = `cti-${statInfId}`;
      throw error;
    }
    const bytes = Buffer.from(response?.bytes ?? []);
    invariant(bytes.length > 0, "cti-source-empty", `CTI source ${statInfId} returned no bytes.`);
    // Validate each response before requesting the next workbook. This makes a
    // malformed early source fail without contacting later file URLs.
    const longTermSeries = SERIES.find(({ statInfId: id }) => id === statInfId);
    if (longTermSeries) parseOfficialFile(bytes, longTermSeries);
    if (statInfId === "000040499069") {
      parseCtiCurrentHouseholdMonthly(bytes, { kind: "basic", now: now() });
    } else if (statInfId === "000040499087") {
      parseCtiCurrentHouseholdMonthly(bytes, { kind: "distributionAdjusted", now: now() });
    }
    sourceBytes[statInfId] = bytes;
    const identity = {
      kind: "estat-catalog-resource",
      catalogResourceId: selected.catalogResourceId,
      legacyStatInfId: selected.legacyStatInfId ?? null,
      url: selected.url,
      semantic: {
        title: selected.title,
        resourceTitle: selected.resourceTitle,
        format: selected.format,
        releaseDate: selected.releaseDate,
        lastModifiedDate: selected.lastModifiedDate,
        ...selected.identityMarkers,
      },
    };
    responseMetadata[statInfId] = {
      contentType: response.contentType,
      contentDisposition: response.contentDisposition,
      lastModified: response.lastModified,
      sourceIdentity: identity,
    };
    rawFetches.push({ name: `cti-${statInfId}-resource-${selected.catalogResourceId}`, bytes });
  }

  const generatedAt = now().toISOString();
  const canonicalRevision = await readCanonicalRevision(root, sourceBytes);
  const longTermComparisons = await compareLongTermCanonical(root, sourceBytes);
  const currentComparisons = await compareCurrentCanonical(root, sourceBytes, canonicalRevision);
  const revisionAudit = { ...longTermComparisons, ...currentComparisons };
  const longTerm = buildCtiBasicArtifacts(sourceBytes, {
    stageRoot,
    retrievedAt: generatedAt,
    responseMetadata,
    revisionAudit,
  });
  const sourceIdentities = Object.fromEntries(
    selectedFiles.map((item) => [
      item.identityStatInfId,
      {
        kind: "estat-catalog-resource",
        catalogResourceId: item.catalogResourceId,
        legacyStatInfId: item.legacyStatInfId ?? null,
        url: item.url,
        semantic: {
          title: item.title,
          resourceTitle: item.resourceTitle,
          format: item.format,
          releaseDate: item.releaseDate,
          lastModifiedDate: item.lastModifiedDate,
          ...item.identityMarkers,
        },
      },
    ]),
  );
  const monthlyCurrent = buildCtiCurrentMonthlyArtifacts(sourceBytes, {
    stageRoot,
    retrievedAt: generatedAt,
    now: new Date(generatedAt),
    revisionAudit,
    sourceIdentities,
  });
  const pinned = new Map();
  for (const item of PINNED) {
    let bytes;
    try {
      bytes = await readFile(path.join(root, item.path));
    } catch {
      throw new RefreshError(
        "cti-pinned-dependency-missing",
        `Pinned CTI dependency is missing: ${item.path}`,
      );
    }
    if (digest(bytes) !== item.sha256)
      throw new RefreshError(
        "cti-pinned-dependency-changed",
        `Pinned CTI dependency hash is unknown: ${item.path}`,
      );
    pinned.set(item.path, bytes);
  }
  verifyPinnedPrehistory(
    sourceBytes["000040499070"],
    pinned.get("data/source/official-cti-2025-long-term/000040499070.2004-prehistory.csv"),
    pinned.get(
      "data/source/official-cti-2025-long-term/000040499070.2004-prehistory.metadata.json",
    ),
  );
  const plan39 = buildPlan39CtiArtifacts({
    stageRoot,
    sources: { B: sourceBytes["000040499069"], A: sourceBytes["000040499087"] },
    sourceIdentities,
    pinnedLegacyArtifactBytes: pinned.get("data/source/cti-adjusted/L.json"),
    sourceRevisionAudit: revisionAudit,
    revision: generatedAt.slice(0, 10),
    retrievedAt: generatedAt,
  });
  const officialWorkbooks = [
    { path: BASIC_XLSX, bytes: sourceBytes["000040499069"] },
    { path: ADJUSTED_XLSX, bytes: sourceBytes["000040499087"] },
  ];
  const immutableArtifacts = [...pinned]
    .filter(([artifactPath]) => !artifactPath.endsWith("/L.json"))
    .map(([artifactPath, bytes]) => ({ path: artifactPath, bytes }));
  const artifacts = [
    ...longTerm.artifacts,
    ...monthlyCurrent.artifacts,
    ...officialWorkbooks,
    ...plan39.artifacts,
    ...immutableArtifacts,
  ];
  const duplicatePaths = new Set();
  for (const item of artifacts) {
    if (duplicatePaths.has(item.path))
      throw new RefreshError(
        "cti-duplicate-output",
        `CTI adapter generated duplicate output: ${item.path}`,
      );
    duplicatePaths.add(item.path);
  }
  const actualOutputs = [...duplicatePaths].sort();
  const expectedOutputs = [...CTI_OUTPUTS].sort();
  if (JSON.stringify(actualOutputs) !== JSON.stringify(expectedOutputs)) {
    throw new RefreshError(
      "cti-output-contract-mismatch",
      `CTI adapter output contract mismatch; missing=${expectedOutputs.filter((item) => !duplicatePaths.has(item)).join("|")}; unexpected=${actualOutputs.filter((item) => !CTI_OUTPUTS.includes(item)).join("|")}`,
    );
  }
  const registryOutputs = [...source.outputs].sort();
  if (JSON.stringify(registryOutputs) !== JSON.stringify(expectedOutputs))
    throw new RefreshError(
      "cti-registry-output-mismatch",
      "CTI registry outputs do not exactly match the adapter artifact set.",
    );
  const revisionStats = summarizeRevisions(revisionAudit);
  const artifactByPath = new Map(
    artifacts.map(({ path: artifactPath, bytes }) => [artifactPath, bytes]),
  );
  const plan39Rows = ["A", "B"].map((kind) => {
    const bytes = artifactByPath.get(`data/source/cti-adjusted/${kind}.json`);
    invariant(
      bytes,
      "cti-semantic-artifact-missing",
      `CTI semantic artifact is missing: ${kind}.json`,
    );
    const body = JSON.parse(bytes.toString("utf8"));
    return { kind, categoryOrder: body.categoryOrder, rows: body.rows };
  });
  const semanticCsvHashes = (paths) =>
    paths.map((artifactPath) => {
      const bytes = artifactByPath.get(artifactPath);
      invariant(
        bytes,
        "cti-semantic-artifact-missing",
        `CTI semantic artifact is missing: ${artifactPath}`,
      );
      return { path: artifactPath, sha256: digest(bytes) };
    });
  const outputHashes = await Promise.all(
    artifacts.map(async ({ path: artifactPath, bytes }) => {
      let oldSha256;
      try {
        oldSha256 = digest(await readFile(path.join(root, artifactPath)));
      } catch {
        oldSha256 = null;
      }
      return { path: artifactPath, oldSha256, newSha256: digest(bytes) };
    }),
  );
  const monthlyEnd = monthlyCurrent.coverage.end;
  return {
    artifacts,
    semanticValue: {
      // Fingerprint normalized observations and classifications, never container bytes.
      longTerm: semanticCsvHashes([
        ...SERIES.map(({ statInfId }) => `${LONG_TERM_PATH}/${statInfId}.normalized.csv`),
        `${LONG_TERM_PATH}/series-map.csv`,
        `${LONG_TERM_PATH}/representative-snapshot.csv`,
      ]),
      monthlyCurrent: semanticCsvHashes([
        "data/source/cti_data2025.csv",
        "data/source/cti_data2025_distribution_adjusted.csv",
      ]),
      plan39: {
        annual: plan39Rows,
        quarterlyNominal: semanticCsvHashes([
          "data/source/cti_data2025_distribution_adjusted_quarterly.csv",
        ]),
      },
      revisionAudit: Object.fromEntries(
        Object.entries(revisionAudit).map(([id, value]) => [id, value.sha256]),
      ),
      pinnedSemantic: semanticCsvHashes(
        immutableArtifacts.map(({ path: artifactPath }) => artifactPath),
      ),
    },
    rawFetches,
    coverage: {
      monthlySeries: 66,
      currentHouseholdMonths: monthlyCurrent.coverage.monthlyRows,
      currentHouseholdEnd: monthlyCurrent.coverage.end,
      annualStart: 2002,
      quarterlyStart: "2017Q1",
    },
    validationSummary: {
      sourceFiles: IDS.length,
      longTermSeries: 66,
      currentHouseholdSeries: 22,
      currentHouseholdMonths: monthlyCurrent.coverage.monthlyRows,
      pinnedDependencies: pinned.size,
      quarterlyNominal: true,
      revisedSourceCount: revisionStats.revisedSourceCount,
      revisionChangedObservations: revisionStats.changedObservations,
      revisionChangedValues: revisionStats.changedValues,
      revisionAuditDigest: revisionStats.digest,
    },
    revisionAudit,
    reportSummary: {
      candidateCount: selectedFiles.length,
      fileCandidates: selectedFiles.map(({ url: _url, ...summary }) => summary),
      retrievedAt: generatedAt,
      coverage: {
        start: "2002-01",
        end: monthlyEnd,
        monthCount: monthlyCurrent.coverage.monthlyRows,
        seriesCount: 66,
      },
      revisionCount: revisionStats.revisedSourceCount,
      revisionHash: revisionStats.digest,
      validationResult: "passed",
      outputHashes,
    },
  };
}

function markCandidatePending(error, sourceId) {
  if (error && typeof error === "object") {
    error.candidateResolutionPending = true;
    error.sourceId = sourceId;
  }
  return error;
}

function verifyPinnedPrehistory(sourceBytes, csvBytes, metadataBytes) {
  let rows;
  let metadata;
  try {
    rows = Papa.parse(csvBytes.toString("utf8"), { header: true, skipEmptyLines: true }).data;
    metadata = JSON.parse(metadataBytes.toString("utf8"));
  } catch {
    throw new RefreshError(
      "cti-pinned-lineage-invalid",
      "Pinned 2004 CTI prehistory data or metadata is invalid.",
    );
  }
  const series = SERIES.find(({ statInfId }) => statInfId === "000040499070");
  const records = parseOfficialFile(sourceBytes, series).records.filter(
    (record) => record.seriesIndex === 1 && record.month.startsWith("2004-"),
  );
  const pinnedValues = new Map(
    rows.map((row) => [
      String(row.month),
      row.is_missing === "true" ? null : Number(row.raw_value),
    ]),
  );
  invariant(
    metadata.sourceId === "000040499070" &&
      metadata.seriesIndex === 1 &&
      metadata.sourceSheet === series.sheet &&
      metadata.months === "2004-01..2004-12",
    "cti-pinned-lineage-mismatch",
    "Pinned 2004 CTI prehistory metadata does not match the source identity.",
  );
  // The pinned derivation retains four decimal places, while the current XLSX
  // publishes these historical cells to one decimal place. Compare at the
  // source's published precision while still requiring all 12 exact month keys.
  const samePublishedValue = (current, pinned) =>
    current === null
      ? pinned === null
      : Number.isFinite(current) &&
        Number.isFinite(pinned) &&
        current.toFixed(1) === pinned.toFixed(1);
  invariant(
    records.length === 12 &&
      pinnedValues.size === 12 &&
      records.every(
        (record) =>
          pinnedValues.has(record.month) &&
          samePublishedValue(record.rawValue, pinnedValues.get(record.month)),
      ),
    "cti-pinned-lineage-mismatch",
    "Current 000040499070 source values differ from the immutable 2004 prehistory artifact.",
  );
}

export const ctiAdapterContract = Object.freeze({
  sourceIds: ["000040499070", ...CTI_INPUT_IDENTITIES.map(({ statInfId }) => statInfId)],
  outputs: CTI_OUTPUTS,
  outputGroups: [
    "official-cti-2025-long-term",
    "official-cti-2025",
    "cti-adjusted",
    "cti_data2025_distribution_adjusted_quarterly",
    "current-household-monthly",
    "cti-size-composition/pinned-2004",
  ],
});

function validateRegistryContract(source) {
  const normalize = (identity) => `${identity?.kind}:${identity?.statInfId}:${identity?.format}`;
  const expected = CTI_INPUT_IDENTITIES.map(normalize).sort();
  const received = Array.isArray(source.inputIdentities)
    ? source.inputIdentities.map(normalize).sort()
    : [];
  invariant(
    JSON.stringify(received) === JSON.stringify(expected),
    "cti-input-identity-contract-mismatch",
    "CTI registry companion identities do not match the adapter inputs.",
  );
  invariant(
    Array.isArray(source.outputs) && new Set(source.outputs).size === source.outputs.length,
    "cti-registry-output-mismatch",
    "CTI registry output allowlist is missing or duplicated.",
  );
  invariant(
    source.title === CTI_SOURCE_CONTRACT.title &&
      JSON.stringify(source.classifications) ===
        JSON.stringify(CTI_SOURCE_CONTRACT.classifications),
    "cti-registry-metadata-mismatch",
    "CTI registry title/classifications do not match the verified source contract.",
  );
  invariant(
    JSON.stringify(source.filters) === JSON.stringify(CTI_SOURCE_CONTRACT.filters),
    "cti-registry-metadata-mismatch",
    "CTI registry filters do not match the verified source contract.",
  );
  invariant(
    source.period?.from === "2002-01" &&
      source.period?.through === "latest-published" &&
      source.frequency === "monthly" &&
      source.unit === "指数" &&
      source.baseline === CTI_SOURCE_CONTRACT.filters.baseline,
    "cti-registry-metadata-mismatch",
    "CTI registry period/frequency/unit/baseline do not match the verified source contract.",
  );
}

const LONG_TERM_PATH = "data/source/official-cti-2025-long-term";
const currentFiles = {
  basic: {
    id: "000040499069",
    csv: "data/source/cti_data2025.csv",
    metadata: "data/source/cti_data2025.metadata.json",
    kind: "basic",
  },
  adjusted: {
    id: "000040499087",
    csv: "data/source/cti_data2025_distribution_adjusted.csv",
    metadata: "data/source/cti_data2025_distribution_adjusted.metadata.json",
    kind: "distributionAdjusted",
  },
};

async function compareLongTermCanonical(root, sourceBytes) {
  const result = {};
  for (const series of SERIES) {
    const sourceId = series.statInfId;
    const normalizedPath = `${LONG_TERM_PATH}/${sourceId}.normalized.csv`;
    const metadataPath = `${LONG_TERM_PATH}/${sourceId}.metadata.json`;
    const rawPath = `${LONG_TERM_PATH}/${sourceId}.raw`;
    const [csvBytes, metadataBytes, rawBytes] = await Promise.all([
      readCanonical(root, normalizedPath),
      readCanonical(root, metadataPath),
      readCanonical(root, rawPath),
    ]);
    let oldMetadata;
    try {
      oldMetadata = JSON.parse(metadataBytes.toString("utf8"));
    } catch {
      throw new RefreshError(
        "cti-canonical-metadata-invalid",
        `Existing CTI metadata is invalid: ${metadataPath}`,
      );
    }
    if (
      oldMetadata.statInfId !== sourceId ||
      oldMetadata.normalizedSha256 !== digest(csvBytes) ||
      oldMetadata.rawSha256 !== digest(rawBytes)
    ) {
      throw new RefreshError(
        "cti-canonical-hash-mismatch",
        `Existing CTI source/hash contract is invalid: ${sourceId}`,
      );
    }
    const oldRows = parseNormalizedRows(csvBytes, sourceId);
    const parsed = parseOfficialFile(sourceBytes[sourceId], series);
    const candidate = parsed.records.filter((row) => row.month >= series.requestedStart);
    result[sourceId] = compareSeriesHistory(
      sourceId,
      oldRows,
      candidate,
      digest(rawBytes),
      digest(sourceBytes[sourceId]),
    );
  }
  return result;
}

async function readCanonicalRevision(root) {
  const output = {};
  for (const item of Object.values(currentFiles)) {
    const [csvBytes, metadataBytes] = await Promise.all([
      readCanonical(root, item.csv),
      readCanonical(root, item.metadata),
    ]);
    let metadata;
    try {
      metadata = JSON.parse(metadataBytes.toString("utf8"));
    } catch {
      throw new RefreshError(
        "cti-canonical-metadata-invalid",
        `Existing CTI current metadata is invalid: ${item.metadata}`,
      );
    }
    if (
      metadata.status !== "ready" ||
      metadata.baseYear !== 2025 ||
      metadata.statInfId !== item.id ||
      metadata.outputFile !== path.basename(item.csv) ||
      metadata.csvSha256 !== digest(csvBytes)
    ) {
      throw new RefreshError(
        "cti-canonical-hash-mismatch",
        `Existing CTI current artifact identity/hash is invalid: ${item.id}`,
      );
    }
    const sourceWorkbook = item.id === "000040499069" ? BASIC_XLSX : ADJUSTED_XLSX;
    const sourceWorkbookBytes = await readCanonical(root, sourceWorkbook);
    if (metadata.sourceFileSha256 !== digest(sourceWorkbookBytes))
      throw new RefreshError(
        "cti-canonical-hash-mismatch",
        `Existing CTI current workbook hash is invalid: ${item.id}`,
      );
    if (item.id === "000040499069") {
      const mapBytes = await readCanonical(root, "data/source/cti-2025-series-map.csv");
      const snapshotBytes = await readCanonical(root, "data/source/cti-2025-official-series.csv");
      if (
        metadata.officialSeriesMapSha256 !== digest(mapBytes) ||
        metadata.officialSeriesSnapshotSha256 !== digest(snapshotBytes) ||
        metadata.officialSeriesSnapshotSourceStatInfId !== item.id ||
        metadata.officialSeriesSnapshotSourceSha256 !== digest(sourceWorkbookBytes)
      ) {
        throw new RefreshError(
          "cti-canonical-hash-mismatch",
          `Existing CTI derived map/snapshot hash or identity is invalid: ${item.id}`,
        );
      }
    }
    output[item.id] = { item, csvBytes, metadata, sourceWorkbookBytes };
  }
  return output;
}

async function compareCurrentCanonical(root, sourceBytes, canonical) {
  const result = {};
  for (const item of Object.values(currentFiles)) {
    const prior = canonical[item.id];
    const candidate = parseCtiCurrentHouseholdMonthly(sourceBytes[item.id], { kind: item.kind });
    result[item.id] = compareCurrentRows(
      item.id,
      prior.csvBytes,
      candidate,
      prior.metadata,
      prior.sourceWorkbookBytes,
      sourceBytes[item.id],
    );
  }
  return result;
}

async function readCanonical(root, relative) {
  try {
    return await readFile(path.join(root, relative));
  } catch {
    throw new RefreshError(
      "cti-canonical-output-missing",
      `Required canonical CTI history is missing: ${relative}`,
    );
  }
}

function parseNormalizedRows(bytes, sourceId) {
  const parsed = Papa.parse(bytes.toString("utf8"), { header: true, skipEmptyLines: true });
  if (
    parsed.errors.length ||
    parsed.meta.fields?.join(",") !==
      "variant,series_index,official_series_code,series_name,month,raw_value,is_missing"
  )
    throw new RefreshError(
      "cti-canonical-schema-invalid",
      `Existing CTI normalized schema is invalid: ${sourceId}`,
    );
  const rows = new Map();
  for (const row of parsed.data) {
    const seriesIndex = Number(row.series_index),
      month = String(row.month ?? "").trim();
    if (
      !Number.isInteger(seriesIndex) ||
      seriesIndex < 1 ||
      seriesIndex > 22 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    )
      throw new RefreshError(
        "cti-canonical-schema-invalid",
        `Existing CTI normalized identity is invalid: ${sourceId}`,
      );
    const key = `${seriesIndex}:${month}`;
    if (rows.has(key))
      throw new RefreshError(
        "cti-canonical-schema-invalid",
        `Existing CTI normalized data has a duplicate: ${sourceId}`,
      );
    rows.set(key, normalizedValue(row.raw_value, row.is_missing));
  }
  return rows;
}

function compareSeriesHistory(sourceId, priorRows, candidateRows, priorRawSha256, sourceRawSha256) {
  const candidate = new Map(
    candidateRows.map((row) => [`${row.seriesIndex}:${row.month}`, row.rawValue]),
  );
  assertNoHistoryDrop(sourceId, priorRows, candidate);
  const revisions = [];
  for (const [key, before] of priorRows) {
    const after = candidate.get(key);
    if (!sameValue(before, after)) {
      const [seriesIndex, month] = key.split(":");
      revisions.push({ seriesIndex: Number(seriesIndex), month, before, after });
    }
  }
  return revisionEntry(sourceId, priorRows.size, revisions, priorRawSha256, sourceRawSha256);
}

function compareCurrentRows(
  sourceId,
  previousCsvBytes,
  candidate,
  previousMetadata,
  previousSourceBytes,
  sourceBytes,
) {
  const parsed = Papa.parse(previousCsvBytes.toString("utf8"), {
    header: true,
    skipEmptyLines: true,
  });
  const fields = parsed.meta.fields?.map((field) => field.trim()) ?? [];
  const expectedFields = ["時間軸コード", "月", ...candidate.series];
  if (parsed.errors.length || JSON.stringify(fields) !== JSON.stringify(expectedFields))
    throw new RefreshError(
      "cti-canonical-schema-invalid",
      `Existing current CTI CSV schema is invalid: ${sourceId}`,
    );
  const priorRows = new Map();
  for (const row of parsed.data) {
    const month = String(row["月"] ?? "").trim();
    if (!/^\d{4}年\d{1,2}月$/.test(month) || priorRows.has(month))
      throw new RefreshError(
        "cti-canonical-schema-invalid",
        `Existing current CTI period is invalid: ${sourceId}`,
      );
    priorRows.set(
      month,
      expectedFields.slice(2).map((field) => normalizedValue(row[field], row[field] === "-")),
    );
  }
  if (!priorRows.size)
    throw new RefreshError(
      "cti-canonical-period-invalid",
      `Existing current CTI history is empty: ${sourceId}`,
    );
  const candidateByMonth = new Map(
    candidate.observations.map((row) => [
      row.label,
      row.values.map((value) => normalizedValue(value, value === "-")),
    ]),
  );
  const priorMonths = [...priorRows.keys()];
  const candidateMonths = candidate.observations.map(({ label }) => label);
  if (
    previousMetadata.period?.end !== priorMonths.at(-1) ||
    previousMetadata.period?.monthlyRows !== priorMonths.length ||
    previousMetadata.period?.start !== priorMonths[0]
  )
    throw new RefreshError(
      "cti-canonical-period-invalid",
      `Existing CTI metadata coverage is inconsistent: ${sourceId}`,
    );
  const priorStart = normalizeJapaneseMonth(priorMonths[0]),
    priorEnd = normalizeJapaneseMonth(priorMonths.at(-1));
  const candidateStart = normalizeJapaneseMonth(candidateMonths[0]),
    candidateEnd = normalizeJapaneseMonth(candidateMonths.at(-1));
  if (
    !priorStart ||
    !priorEnd ||
    !candidateStart ||
    !candidateEnd ||
    candidateEnd < priorEnd ||
    candidateStart > priorStart
  )
    throw new RefreshError(
      "cti-period-regression",
      `CTI current monthly coverage regressed: ${sourceId}`,
    );
  for (const month of priorMonths)
    if (!candidateByMonth.has(month))
      throw new RefreshError(
        "cti-history-drop",
        `CTI current monthly history dropped ${sourceId} ${month}.`,
      );
  const revisions = [];
  for (const month of priorMonths) {
    const before = priorRows.get(month),
      after = candidateByMonth.get(month);
    if (!after || before.length !== after.length)
      throw new RefreshError(
        "cti-history-drop",
        `CTI current monthly series lost history: ${sourceId}`,
      );
    for (let index = 0; index < before.length; index += 1)
      if (!sameValue(before[index], after[index]))
        revisions.push({
          month,
          seriesIndex: index + 1,
          seriesName: candidate.series[index],
          before: before[index],
          after: after[index],
        });
  }
  return revisionEntry(
    sourceId,
    priorMonths.length * candidate.series.length,
    revisions,
    digest(previousSourceBytes),
    digest(sourceBytes),
  );
}

function normalizeJapaneseMonth(label) {
  const match = String(label).match(/^(\d{4})年(\d{1,2})月$/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : null;
}

function assertNoHistoryDrop(sourceId, priorRows, candidateRows) {
  const previousLatest = latestBySeries(priorRows),
    candidateLatest = latestBySeries(candidateRows);
  for (const [series, months] of previousLatest) {
    const next = candidateLatest.get(series);
    if (!next || next < months)
      throw new RefreshError(
        "cti-period-regression",
        `CTI source ${sourceId} latest period regressed for series ${series}.`,
      );
  }
  for (const key of priorRows.keys())
    if (!candidateRows.has(key))
      throw new RefreshError(
        "cti-history-drop",
        `CTI source ${sourceId} dropped historical observation ${key}.`,
      );
}

function latestBySeries(rows) {
  const latest = new Map();
  for (const key of rows.keys()) {
    const separator = key.indexOf(":");
    const series = key.slice(0, separator),
      period = key.slice(separator + 1);
    if (!latest.has(series) || period > latest.get(series)) latest.set(series, period);
  }
  return latest;
}

function normalizedValue(raw, missing) {
  if (missing || raw === null || raw === undefined || raw === "") return null;
  const number = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : `invalid:${raw}`;
}

function sameValue(left, right) {
  return left === right;
}

function revisionEntry(sourceId, overlapCount, revisions, previousSha256, sourceSha256) {
  const serialized = JSON.stringify(revisions);
  return {
    sourceId,
    overlapCount,
    changedObservationCount: new Set(
      revisions.map(({ seriesIndex, month }) => `${seriesIndex}:${month}`),
    ).size,
    changedValueCount: revisions.length,
    changedSample: revisions.slice(0, 10),
    sha256: digest(Buffer.from(serialized)),
    previousSha256,
    sourceSha256,
  };
}

function summarizeRevisions(revisionAudit) {
  const values = Object.values(revisionAudit);
  return {
    revisedSourceCount: values.filter((value) => value.changedValueCount > 0).length,
    changedObservations: values.reduce((sum, value) => sum + value.changedObservationCount, 0),
    changedValues: values.reduce((sum, value) => sum + value.changedValueCount, 0),
    digest: digest(Buffer.from(JSON.stringify(revisionAudit))),
  };
}
