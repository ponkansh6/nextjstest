import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchDataCatalog,
  fetchMetaInfo,
  fetchStatsData,
  fetchStatsList,
  resolveCatalogResource,
} from "../transport/estat-api.mjs";
import { RefreshError, invariant } from "../lib/errors.mjs";

const API_STATS_DATA_ID = "0004052037";
const FILE_STAT_INF_ID = "000040482945";
const META_PATH = "data/source/cpi_data2025_long.metadata.json";
const MAP_PATH = "data/source/cpi-2025-series-map.csv";
const SNAPSHOT_PATH = "data/source/cpi-2025-official-series.csv";
const CONTRIBUTION_PATH = "data/source/contribution2025.csv";
const DATA_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";
const LIST_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList";
const CATALOG_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getDataCatalog";

export async function cpiAdapter({
  source,
  root = process.cwd(),
  now = () => new Date(),
  transportConfig = {},
  fetchImpl = fetch,
  fetchApi,
  getMetaInfo,
  getStatsList,
  getDataCatalog,
  apiLimit = 100_000,
} = {}) {
  validateIdentity(source);
  const appId = transportConfig.appId;
  const capturedResponses = [];
  const statsPageNumbers = new Map();
  const captureFetch = async (input, init) => {
    const response = await fetchImpl(input, init);
    invariant(
      typeof response?.clone === "function",
      "cpi-api-raw-capture-unavailable",
      "CPI API response cannot be captured for source hash evidence.",
    );
    let bytes;
    try {
      bytes = Buffer.from(await response.clone().arrayBuffer());
    } catch {
      throw new RefreshError(
        "cpi-api-raw-capture-unavailable",
        "CPI API response cannot be captured for source hash evidence.",
      );
    }
    let requestUrl;
    try {
      requestUrl = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    } catch {
      throw new RefreshError(
        "cpi-api-raw-capture-unavailable",
        "CPI API response request identity cannot be captured safely.",
      );
    }
    const apiKind = requestUrl.pathname.endsWith("/getMetaInfo")
      ? "meta"
      : requestUrl.pathname.endsWith("/getStatsList")
        ? "list"
        : requestUrl.pathname.endsWith("/getDataCatalog")
          ? "catalog"
          : "stats";
    let page = requestUrl.searchParams.get("startPosition") || "1";
    if (apiKind === "stats") {
      if (!statsPageNumbers.has(page)) statsPageNumbers.set(page, statsPageNumbers.size + 1);
      page = String(statsPageNumbers.get(page));
    }
    capturedResponses.push({
      name: `estat-cpi-${apiKind}-${requestUrl.searchParams.get("statsDataId") || "candidates"}-page-${page}`,
      bytes,
    });
    return response;
  };
  const metadataBytesOld = await readFile(path.join(root, META_PATH));
  let meta;
  try {
    meta = JSON.parse(metadataBytesOld.toString("utf8"));
  } catch {
    throw new RefreshError("cpi-metadata-invalid", "CPI source metadata is missing or invalid.");
  }
  validateLocalMetadata(meta);
  const [mapBytes, snapshotBytes, contributionBytes] = await Promise.all([
    readFile(path.join(root, MAP_PATH)),
    readFile(path.join(root, SNAPSHOT_PATH)),
    readFile(path.join(root, CONTRIBUTION_PATH)),
  ]);
  assertSha(mapBytes, meta.officialSeriesMapSha256, "cpi-series-map-modified");
  assertSha(snapshotBytes, meta.officialSeriesSnapshotSha256, "cpi-series-snapshot-modified");
  assertSha(contributionBytes, meta.contributionSha256, "cpi-contribution-modified");
  const series = parseCsv(mapBytes.toString("utf8"));
  const snapshot = parseCsv(snapshotBytes.toString("utf8"));
  validateLocalSeries(series, snapshot);
  const canonicalBytes = await readFile(path.join(root, "data/source/cpi_data2025_long.csv"));
  const canonical = validateCanonicalCsv(canonicalBytes, meta, series);

  let candidates;
  let selected;
  try {
    const listResult = await (
      getStatsList ||
      (() =>
        fetchStatsList({
          appId,
          fetchImpl: captureFetch,
          endpoint: LIST_ENDPOINT,
          limit: 100,
          query: source.candidateQuery,
        }))
    )();
    candidates = Array.isArray(listResult) ? listResult : listResult?.candidates;
    invariant(
      Array.isArray(candidates),
      "cpi-candidate-list-invalid",
      "e-Stat CPI candidate discovery returned a malformed candidate list.",
    );
    selected = resolveCpiCandidate(candidates, source);
  } catch (error) {
    error.candidateResolutionPending = true;
    error.sourceId = "cpi-long";
    throw error;
  }
  const selectedStatsDataId = selected.id;
  invariant(
    capturedResponses.some(({ name }) => name.startsWith("estat-cpi-list-candidates-page-")) ||
      !!getStatsList,
    "cpi-candidate-raw-capture-incomplete",
    "CPI table-discovery response hash evidence is missing.",
  );
  let fileCandidate;
  const distributionCandidateIdentity = source.distributionCandidateIdentity || {
    format: source.distributionIdentity.format?.toUpperCase() || "CSV",
    titleIncludes: ["消費者物価指数"],
    datasetIncludes: [],
    resourceIncludes: [],
    tableIncludes: ["消費者物価指数"],
    categoryIncludes: [],
    periodIncludes: ["月次"],
    yearIncludes: ["2025"],
  };
  try {
    const usesDefaultDataCatalog = !getDataCatalog;
    const catalogResult = await (
      getDataCatalog ||
      (() =>
        fetchDataCatalog({
          appId,
          fetchImpl: captureFetch,
          endpoint: CATALOG_ENDPOINT,
          limit: 100,
          query: source.distributionCandidateQuery,
        }))
    )();
    if (usesDefaultDataCatalog)
      invariant(
        capturedResponses.some(({ name }) => name.startsWith("estat-cpi-catalog-candidates-")),
        "cpi-catalog-raw-capture-incomplete",
        "CPI file-candidate discovery response hash evidence is missing.",
      );
    const datasets = Array.isArray(catalogResult) ? catalogResult : catalogResult?.datasets;
    fileCandidate = resolveCatalogResource(datasets, {
      expectedFormat: distributionCandidateIdentity.format,
      titleIncludes: distributionCandidateIdentity.titleIncludes,
      datasetIncludes: distributionCandidateIdentity.datasetIncludes,
      resourceIncludes: distributionCandidateIdentity.resourceIncludes,
      tableIncludes: distributionCandidateIdentity.tableIncludes,
      categoryIncludes: distributionCandidateIdentity.categoryIncludes,
      periodIncludes: distributionCandidateIdentity.periodIncludes,
      yearIncludes: distributionCandidateIdentity.yearIncludes,
    });
  } catch (error) {
    error.candidateResolutionPending = true;
    error.sourceId = "cpi-long";
    throw error;
  }
  const usesDefaultMetadataTransport = !getMetaInfo;
  const metadataPayload = await (
    getMetaInfo || ((id) => fetchMetaInfo({ statsDataId: id, appId, fetchImpl: captureFetch }))
  )(selectedStatsDataId);
  if (usesDefaultMetadataTransport) {
    invariant(
      capturedResponses.some(({ name }) =>
        name.startsWith(`estat-cpi-meta-${selectedStatsDataId}-`),
      ),
      "cpi-api-raw-capture-incomplete",
      "CPI API metadata response hash evidence is missing.",
    );
  }
  const table = unwrapTable(metadataPayload, selectedStatsDataId);
  const classifications = classMap(table);
  validateOfficialMetadata(table, classifications, series, selected);

  const usesDefaultDataTransport = !fetchApi;
  const fetched = await (
    fetchApi ||
    ((id) =>
      fetchStatsData({
        statsDataId: id,
        appId,
        fetchImpl: captureFetch,
        endpoint: DATA_ENDPOINT,
        limit: apiLimit,
        filters: { cdArea: "00000", cdTab: "1", cdTimeFrom: "197001" },
      }))
  )(selectedStatsDataId, { cdArea: "00000", cdTab: "1", cdTimeFrom: "197001" });
  const records = Array.isArray(fetched) ? fetched : fetched?.records;
  invariant(
    Array.isArray(records) && records.length > 0,
    "cpi-api-data-invalid",
    "CPI API returned no observation records.",
  );
  if (usesDefaultDataTransport) {
    const pageNumbers = new Set(
      capturedResponses
        .filter(({ name }) => name.startsWith(`estat-cpi-stats-${selectedStatsDataId}-page-`))
        .map(({ name }) => Number(name.slice(name.lastIndexOf("-") + 1)))
        .filter(Number.isSafeInteger),
    );
    invariant(
      Number.isSafeInteger(fetched.pageCount) &&
        fetched.pageCount > 0 &&
        Array.from({ length: fetched.pageCount }, (_, index) => pageNumbers.has(index + 1)).every(
          Boolean,
        ),
      "cpi-api-raw-capture-incomplete",
      "CPI API page response hash evidence is incomplete.",
    );
  }
  const { rows, coverage, unit } = buildRows(records, classifications, series);
  invariant(
    coverage.endCode >= canonical.endCode,
    "cpi-period-regression",
    "The current CPI API period regresses behind the validated canonical history.",
  );
  const revisionSummary = compareOverlappingHistory(rows, canonical, series);
  validateBaseYearIndex(rows, series);
  const csvBytes = Buffer.from(`${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`);
  const snapshotBytesOut = createSeriesSnapshot(rows, series);
  const stamp = now().toISOString().slice(0, 10);
  const newMeta = {
    ...meta,
    status: "ready",
    provider: "総務省統計局/e-Stat",
    statsDataId: selectedStatsDataId,
    statInfId: meta.statInfId,
    selectedDistributionStatInfId: fileCandidate.legacyStatInfId ?? null,
    sourceLineage: { previousStatsDataId: meta.statsDataId, previousStatInfId: meta.statInfId },
    selectedApiSourceIdentity: {
      statsDataId: selectedStatsDataId,
      title: selected.title,
      statistics: selected.statistics,
      cycle: selected.cycle,
      surveyDate: selected.surveyDate,
      updatedDate: selected.updatedDate,
      openDate: selected.openDate,
      unit,
      classification: "nationwide index; tab 1; 78 cat01 series",
      classificationsSha256: sha256(
        Buffer.from(
          JSON.stringify(
            series.map(({ official_code, display_name }) => [official_code, display_name]),
          ),
        ),
      ),
    },
    refreshApiEndpoint: DATA_ENDPOINT,
    refreshApiRetrievalConditions: {
      statsDataId: selectedStatsDataId,
      format: "JSON",
      cdArea: "00000",
      cdTab: "1",
      cdTimeFrom: "197001",
      latestReturnedTime: coverage.endCode,
      limit: apiLimit,
    },
    distributionSourceIdentity: {
      kind: "estat-catalog-resource",
      catalogResourceId: fileCandidate.catalogResourceId,
      logicalSourceStatInfId: source.distributionIdentity.statInfId,
      legacyStatInfId: fileCandidate.legacyStatInfId,
      downloadUrlHash: sha256(Buffer.from(fileCandidate.url)),
      title: fileCandidate.datasetTitle,
      resourceTitle: fileCandidate.resourceTitle,
      format: fileCandidate.format,
      releaseDate: fileCandidate.releaseDate,
      lastModifiedDate: fileCandidate.lastModifiedDate,
      identityMarkers: {
        table: distributionCandidateIdentity.tableIncludes,
        category: distributionCandidateIdentity.categoryIncludes,
        period: distributionCandidateIdentity.periodIncludes,
        year: distributionCandidateIdentity.yearIncludes,
      },
    },
    artifactUpdatedAt: stamp,
    retrievedAt: now().toISOString(),
    csvSha256: sha256(csvBytes),
    officialSeriesMapSha256: sha256(mapBytes),
    contributionFile: "contribution2025.csv",
    contributionSha256: sha256(contributionBytes),
    officialSeriesSnapshotSha256: sha256(snapshotBytesOut),
    period: {
      start: "1970年1月",
      end: japaneseMonth(coverage.endCode),
      monthlyRows: rows.length - 1,
    },
    seriesCount: series.length,
    revisionSummary,
    extraction: {
      area: "全国 (cdArea=00000)",
      frequency: "月次",
      measure: `2025年=100 (${unit})`,
      categories: "2025年基準品目78系列",
      sourceRows: records.length,
      monthlyObservationCount: coverage.monthlyObservationCount,
      nonMonthlyObservationCount: coverage.nonMonthlyObservationCount,
      pages: fetched?.pageCount ?? 1,
      apiTotalNumber: fetched?.declaredTotal ?? records.length,
      missingValuePolicy: "API明示欠測値は空欄として保持",
    },
    sourceCandidate: {
      candidateCount: selected.candidateCount,
      statsDataId: selectedStatsDataId,
      title: selected.title,
      updatedDate: selected.updatedDate,
      openDate: selected.openDate,
      fileCandidate: {
        identityStatInfId: source.distributionIdentity.statInfId,
        catalogResourceId: fileCandidate.catalogResourceId,
        legacyStatInfId: fileCandidate.legacyStatInfId,
        title: fileCandidate.datasetTitle,
        resourceTitle: fileCandidate.resourceTitle,
        format: fileCandidate.format,
        releaseDate: fileCandidate.releaseDate,
        lastModifiedDate: fileCandidate.lastModifiedDate,
        candidateCount: fileCandidate.candidateCount,
      },
    },
  };
  delete newMeta.sourceResponseSha256;
  const metaBytes = Buffer.from(`${JSON.stringify(newMeta, null, 2)}\n`);
  const artifacts = [
    { path: "data/source/cpi_data2025_long.csv", bytes: csvBytes },
    { path: META_PATH, bytes: metaBytes },
    { path: MAP_PATH, bytes: mapBytes },
    { path: CONTRIBUTION_PATH, bytes: contributionBytes },
    { path: SNAPSHOT_PATH, bytes: snapshotBytesOut },
  ];
  invariant(
    fetched?.rawFetches === undefined || Array.isArray(fetched.rawFetches),
    "cpi-api-raw-fetches-invalid",
    "CPI API transport returned malformed raw response evidence.",
  );
  const rawFetches = [...capturedResponses, ...(fetched?.rawFetches ?? [])];
  invariant(
    rawFetches.every((item) => typeof item?.name === "string" && item.bytes instanceof Uint8Array),
    "cpi-api-raw-fetches-invalid",
    "CPI API raw response evidence must contain named byte buffers.",
  );
  return {
    artifacts,
    semanticValue: {
      rows,
      series: series.map(({ official_code, existing_key }) => [official_code, existing_key]),
    },
    coverage: {
      startMonth: "197001",
      endMonth: coverage.endCode,
      monthCount: rows.length - 1,
      seriesCount: series.length,
    },
    validationSummary: {
      metadataValidated: true,
      areaAndTabValidated: true,
      exactSeriesMap: true,
      uniqueMonthlyRows: true,
      missingValuesPreserved: true,
      revisions: revisionSummary.count,
    },
    reportSummary: {
      candidateCount: selected.candidateCount,
      selectedSourceId: selectedStatsDataId,
      selectedTitle: selected.title,
      updatedDate: selected.updatedDate,
      openDate: selected.openDate,
      apiStatsDataId: selectedStatsDataId,
      fileStatInfId: fileCandidate.legacyStatInfId,
      expectedLegacyStatInfId: source.distributionIdentity.statInfId,
      catalogResourceId: fileCandidate.catalogResourceId,
      selectedCatalogResourceId: fileCandidate.catalogResourceId,
      selectedCatalogTitle: fileCandidate.datasetTitle,
      selectedCatalogFormat: fileCandidate.format,
      selectedCatalogReleaseDate: fileCandidate.releaseDate,
      selectedCatalogLastModifiedDate: fileCandidate.lastModifiedDate,
      legacyStatInfId: fileCandidate.legacyStatInfId,
      fileCandidateCount: fileCandidate.candidateCount,
      fileCandidateTitle: fileCandidate.datasetTitle,
      fileResourceTitle: fileCandidate.resourceTitle,
      fileFormat: fileCandidate.format,
      fileReleaseDate: fileCandidate.releaseDate,
      fileLastModifiedDate: fileCandidate.lastModifiedDate,
      filters: { cdArea: "00000", cdTab: "1", cdTimeFrom: "197001" },
      table: selected.title,
      classification: "CPI 2025 base; nationwide monthly index; 78 cat01 series",
      retrievedAt: newMeta.retrievedAt,
      coverageStart: "197001",
      coverageEnd: coverage.endCode,
      coverageCount: rows.length - 1,
      revisionCount: revisionSummary.count,
      revisionHash: sha256(Buffer.from(JSON.stringify(revisionSummary))),
      revisionSamples: revisionSummary.samples
        .slice(0, 10)
        .map(({ seriesIndex, month }) => ({ seriesId: series[seriesIndex]?.official_code, month })),
      outputHashes: artifacts.map(({ path: output, bytes }) => ({
        path: output,
        newSha256: sha256(bytes),
        oldSha256: sha256(
          oldOutputBytes(output, {
            canonicalBytes,
            metadataBytesOld,
            mapBytes,
            snapshotBytes,
            contributionBytes,
          }),
        ),
      })),
      validationResult: "passed",
    },
    rawFetches,
  };
}

function validateIdentity(source) {
  invariant(
    source?.identity?.kind === "api" && source.identity.statsDataId === API_STATS_DATA_ID,
    "cpi-identity-mismatch",
    "CPI API identity does not match the verified statsDataId.",
  );
  invariant(
    source?.distributionIdentity?.kind === "file" &&
      source.distributionIdentity.statInfId === FILE_STAT_INF_ID,
    "cpi-identity-mismatch",
    "CPI distribution identity does not match the verified statInfId.",
  );
}

export function resolveCpiCandidate(candidates, source) {
  invariant(
    Array.isArray(candidates),
    "cpi-candidate-list-invalid",
    "e-Stat CPI candidate discovery returned a malformed candidate list.",
  );
  const contract = source?.candidateIdentity || {
    expectedStatsDataId: source?.identity?.statsDataId,
    statisticsIncludes: "消費者物価指数",
    titleIncludes: ["消費者物価指数", "2025年基準"],
    cycleIncludes: ["月次", "毎月"],
    surveyYear: "2025",
  };
  invariant(
    Array.isArray(contract.titleIncludes) &&
      contract.titleIncludes.length > 0 &&
      Array.isArray(contract.cycleIncludes) &&
      contract.cycleIncludes.length > 0 &&
      typeof contract.surveyYear === "string" &&
      /^\d{4}$/.test(contract.surveyYear),
    "cpi-candidate-contract-invalid",
    "CPI candidate semantic identity contract is incomplete.",
  );
  const semantic = candidates
    .map((candidate) => {
      const id = safeCandidateText(candidate?.["@id"] ?? candidate?.ID ?? candidate?.statsDataId);
      const title = safeCandidateText(candidate?.TITLE);
      const statistics = safeCandidateText(candidate?.STAT_NAME ?? candidate?.STATISTICS_NAME);
      const cycle = safeCandidateText(candidate?.CYCLE);
      const surveyDate = safeCandidateText(candidate?.SURVEY_DATE);
      const updatedDate = safeCandidateText(candidate?.UPDATED_DATE);
      const openDate = safeCandidateText(candidate?.OPEN_DATE);
      const unit = safeCandidateText(candidate?.UNIT);
      return { id, title, statistics, cycle, surveyDate, updatedDate, openDate, unit };
    })
    .filter(
      (candidate) =>
        /^\d{8,16}$/.test(candidate.id) &&
        candidate.title &&
        candidate.statistics &&
        candidate.updatedDate &&
        (contract.titleIncludes || []).every((part) => candidate.title.includes(part)) &&
        candidate.statistics.includes(contract.statisticsIncludes || "消費者物価指数") &&
        (contract.cycleIncludes || []).some((part) => candidate.cycle.includes(part)) &&
        candidate.surveyDate.includes(contract.surveyYear || "2025"),
    );
  invariant(
    semantic.length > 0,
    "cpi-candidate-not-found",
    "No e-Stat table candidate proves the required 2025-base monthly CPI identity.",
  );
  const dateValue = (value) => {
    const japanese = /^(\d{4})年(\d{1,2})月(?:\d{1,2}日)?$/.exec(value);
    const normalized = japanese ? `${japanese[1]}-${japanese[2].padStart(2, "0")}-01` : value;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  if (
    semantic.some(
      (candidate) =>
        !Number.isFinite(dateValue(candidate.updatedDate)) ||
        (candidate.openDate && !Number.isFinite(dateValue(candidate.openDate))),
    )
  ) {
    throw new RefreshError("cpi-candidate-date-invalid", "CPI candidate dates are not comparable.");
  }
  const openValue = (candidate) =>
    candidate.openDate ? dateValue(candidate.openDate) : Number.NEGATIVE_INFINITY;
  semantic.sort(
    (a, b) => dateValue(b.updatedDate) - dateValue(a.updatedDate) || openValue(b) - openValue(a),
  );
  const newest = semantic.filter(
    (candidate) =>
      dateValue(candidate.updatedDate) === dateValue(semantic[0].updatedDate) &&
      openValue(candidate) === openValue(semantic[0]),
  );
  invariant(
    newest.length === 1,
    "cpi-candidate-ambiguous",
    "Multiple equally recent e-Stat tables match the required 2025-base monthly CPI identity.",
  );
  return { ...newest[0], candidateCount: semantic.length, identityMarkers: contract.titleIncludes };
}

function safeCandidateText(value) {
  const text = String(value?.$ ?? value ?? "").trim();
  const hasControl = [...text].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  return text.length <= 240 &&
    !hasControl &&
    !/(?:https?:\/\/|appId\s*=|api.?key|token\s*=)/i.test(text)
    ? text
    : "";
}

function oldOutputBytes(output, inputs) {
  const byPath = {
    "data/source/cpi_data2025_long.csv": inputs.canonicalBytes,
    [META_PATH]: inputs.metadataBytesOld,
    [MAP_PATH]: inputs.mapBytes,
    [SNAPSHOT_PATH]: inputs.snapshotBytes,
    [CONTRIBUTION_PATH]: inputs.contributionBytes,
  };
  const bytes = byPath[output];
  invariant(
    bytes instanceof Uint8Array,
    "cpi-report-output-hash-missing",
    "CPI report could not verify an existing output hash.",
  );
  return bytes;
}

function validateLocalMetadata(metadata) {
  const selectedApi = metadata?.selectedApiSourceIdentity;
  const dynamicApiIdentityValid =
    metadata?.statsDataId === API_STATS_DATA_ID ||
    (selectedApi?.statsDataId === metadata?.statsDataId &&
      /^\d{8,16}$/.test(String(metadata?.statsDataId || "")) &&
      typeof selectedApi?.title === "string" &&
      selectedApi.title.includes("消費者物価指数") &&
      selectedApi.title.includes("2025年基準") &&
      typeof selectedApi?.cycle === "string" &&
      /月次|毎月/.test(selectedApi.cycle) &&
      String(selectedApi?.surveyDate || "").includes("2025") &&
      /^\d{8,16}$/.test(String(metadata?.sourceLineage?.previousStatsDataId || "")));
  invariant(
    metadata?.status === "ready" &&
      dynamicApiIdentityValid &&
      metadata?.statInfId === FILE_STAT_INF_ID &&
      (metadata?.selectedDistributionStatInfId === undefined ||
        metadata.selectedDistributionStatInfId === null ||
        /^\d{8,16}$/.test(String(metadata.selectedDistributionStatInfId))) &&
      metadata?.baseYear === 2025,
    "cpi-metadata-identity-mismatch",
    "CPI local metadata status, identities, or baseline are invalid.",
  );
  invariant(
    metadata.seriesCount === 78 &&
      metadata.period?.start === "1970年1月" &&
      /^\d{4}年\d{1,2}月$/.test(metadata.period?.end || "") &&
      Number.isInteger(metadata.period?.monthlyRows),
    "cpi-metadata-contract-mismatch",
    "CPI local coverage metadata is invalid.",
  );
  for (const field of [
    "csvSha256",
    "officialSeriesMapSha256",
    "officialSeriesSnapshotSha256",
    "contributionSha256",
  ]) {
    invariant(
      /^[a-f0-9]{64}$/.test(metadata[field] || ""),
      "cpi-metadata-hash-missing",
      `CPI local metadata is missing ${field}.`,
    );
  }
}

function validateLocalSeries(series, snapshot) {
  invariant(
    series.length === 78 && snapshot.length === 78,
    "cpi-series-map-invalid",
    "CPI local series map and official snapshot must each contain 78 entries.",
  );
  const map = new Map();
  for (const row of series) {
    invariant(
      /^\d{4}$/.test(row.official_code || "") &&
        row.existing_key &&
        row.display_name === row.existing_key,
      "cpi-series-map-invalid",
      "CPI series map contains an invalid code or key.",
    );
    invariant(
      !map.has(row.official_code) && ![...map.values()].includes(row.existing_key),
      "cpi-series-map-invalid",
      "CPI series map contains duplicate codes or keys.",
    );
    map.set(row.official_code, row.existing_key);
  }
  const snap = new Map(snapshot.map((row) => [row.code, row.name]));
  invariant(
    snap.size === 78 && [...map].every(([code, name]) => snap.get(code) === name),
    "cpi-series-snapshot-mismatch",
    "CPI local series map does not match the pinned official category snapshot.",
  );
}

function unwrapTable(payload, statsDataId = API_STATS_DATA_ID) {
  const result = payload?.GET_META_INFO?.RESULT;
  invariant(
    !result || String(result.STATUS) === "0",
    "cpi-meta-api-error",
    "e-Stat metadata API reported an error.",
  );
  const root = payload?.GET_META_INFO?.METADATA_INF ?? payload;
  const tables = asArray(root?.TABLE_INF);
  invariant(
    tables.length === 1 && String(tables[0]?.["@id"] ?? tables[0]?.ID ?? "") === statsDataId,
    "cpi-meta-table-mismatch",
    "e-Stat metadata does not identify exactly the requested CPI table.",
  );
  return tables[0];
}

function classMap(table) {
  const objects = asArray(table?.CLASS_INF?.CLASS_OBJ ?? table?.CLASS_INF);
  const result = new Map();
  for (const obj of objects) {
    const id = String(obj?.["@id"] ?? obj?.id ?? "");
    if (id) result.set(id, asArray(obj.CLASS));
  }
  return result;
}

function validateOfficialMetadata(table, classes, series, selected) {
  const titleField = table.TITLE ?? table.STAT_NAME ?? table.STATISTICS_NAME ?? "";
  const title = String(titleField?.$ ?? titleField);
  invariant(
    title.includes("2025年基準") && title.includes("消費者物価指数"),
    "cpi-meta-baseline-unproven",
    "e-Stat table metadata does not explicitly prove the 2025-base CPI series.",
  );
  const statistics = String(
    table.STAT_NAME?.$ ??
      table.STAT_NAME ??
      table.STATISTICS_NAME?.$ ??
      table.STATISTICS_NAME ??
      title,
  );
  const cycle = String(table.CYCLE?.$ ?? table.CYCLE ?? "");
  const surveyDate = String(table.SURVEY_DATE?.$ ?? table.SURVEY_DATE ?? "");
  const unit = String(table.UNIT?.$ ?? table.UNIT ?? "");
  const normalizeTitle = (value) => value.replace(/\s+/g, " ").trim();
  invariant(
    selected &&
      String(table?.["@id"] ?? table?.ID ?? "") === selected.id &&
      normalizeTitle(title).includes(normalizeTitle(selected.title)) &&
      selected.identityMarkers.every((marker) => title.includes(marker)) &&
      statistics.includes(selected.statistics) &&
      (!cycle || cycle.includes(selected.cycle) || selected.cycle.includes(cycle)) &&
      (!surveyDate ||
        surveyDate.includes(selected.surveyDate) ||
        selected.surveyDate.includes(surveyDate)) &&
      (!unit || unit.replaceAll("＝", "=").includes("2025年=100")) &&
      (!selected.unit ||
        !unit ||
        unit.replaceAll("＝", "=").includes(selected.unit.replaceAll("＝", "="))),
    "cpi-meta-candidate-mismatch",
    "e-Stat metadata title, classification, unit, or ID does not match the selected CPI candidate.",
  );
  const area = classes.get("area") || classes.get("地域");
  invariant(
    area?.some((row) => codeOf(row) === "00000" && String(row["@name"] ?? row.name) === "全国"),
    "cpi-meta-area-unproven",
    "e-Stat metadata does not prove area 00000 is 全国.",
  );
  const tab = classes.get("tab") || classes.get("表章項目");
  const index = tab?.find((row) => codeOf(row) === "1");
  invariant(
    index && /指数/.test(String(index["@name"] ?? index.name ?? "")),
    "cpi-meta-tab-unproven",
    "e-Stat metadata does not prove tab 1 is the index item.",
  );
  const categories = classes.get("cat01");
  invariant(
    categories?.length,
    "cpi-meta-classification-unproven",
    "e-Stat metadata is missing cat01 classifications.",
  );
  const official = new Map(
    categories.map((row) => [codeOf(row), String(row["@name"] ?? row.name ?? "")]),
  );
  invariant(
    official.size === 78 &&
      series.every((row) => official.get(row.official_code) === row.display_name),
    "cpi-meta-series-mismatch",
    "e-Stat cat01 categories do not exactly match all 78 pinned official series.",
  );
  const times = classes.get("time");
  invariant(
    times?.length && times.some((row) => codeOf(row) === "197001"),
    "cpi-meta-time-unproven",
    "e-Stat metadata does not prove monthly coverage begins at 197001.",
  );
  for (const item of times) {
    const code = codeOf(item);
    if (/^\d{6}$/.test(code))
      invariant(
        isMonthCode(code),
        "cpi-meta-time-unproven",
        "e-Stat metadata contains an invalid monthly time code.",
      );
  }
}

function buildRows(records, classes, series) {
  const seriesByCode = new Map(series.map((row) => [row.official_code, row.existing_key]));
  const data = new Map();
  let endCode = "";
  let unit;
  let nonMonthlyObservationCount = 0;
  const knownTimes = new Set((classes.get("time") || []).map(codeOf));
  for (const record of records) {
    const area = attr(record, "area");
    const tab = attr(record, "tab");
    const code = attr(record, "cat01");
    const time = attr(record, "time");
    invariant(
      area === "00000" && tab === "1",
      "cpi-api-dimension-mismatch",
      "e-Stat returned a CPI record outside the verified nationwide index dimensions.",
    );
    invariant(
      seriesByCode.has(code) && knownTimes.has(time),
      "cpi-api-record-invalid",
      "e-Stat returned an unexpected CPI category or unclassified time code.",
    );
    if (!isMonthCode(time)) {
      nonMonthlyObservationCount += 1;
      continue;
    }
    const value = record?.["$"] ?? record?.value;
    invariant(
      typeof value === "string" || typeof value === "number",
      "cpi-api-value-invalid",
      "e-Stat CPI record has no scalar value.",
    );
    const recordUnit = String(record?.["@unit"] ?? "").trim();
    const normalizedUnit = recordUnit.replaceAll("＝", "=").replace(/\s/g, "");
    invariant(
      normalizedUnit === "2025年=100",
      "cpi-api-unit-unproven",
      "e-Stat CPI values do not declare the exact 2025=100 index unit.",
    );
    if (unit === undefined) unit = recordUnit;
    invariant(
      recordUnit === unit,
      "cpi-api-unit-mismatch",
      "e-Stat CPI value units changed within the returned series.",
    );
    const key = `${time}\0${code}`;
    invariant(
      !data.has(key),
      "cpi-api-duplicate",
      "e-Stat returned duplicate CPI month/category values.",
    );
    const normalized = String(value).trim();
    invariant(
      normalized === "***" || normalized === "-" || /^\d+(?:\.\d+)?$/.test(normalized),
      "cpi-api-value-invalid",
      "e-Stat CPI record contains an invalid index value.",
    );
    data.set(key, normalized === "***" || normalized === "-" ? "" : normalized);
    if (time > endCode) endCode = time;
  }
  const timeClasses = classes.get("time") || [];
  const allMonthlyTimes = timeClasses
    .map(codeOf)
    .filter((code) => /^\d{6}$/.test(code))
    .sort();
  const latestMetadataTime = allMonthlyTimes.at(-1);
  const expectedTimes = allMonthlyTimes.filter((code) => code >= "197001" && code <= endCode);
  invariant(
    expectedTimes.length &&
      expectedTimes[0] === "197001" &&
      expectedTimes.every(
        (time, i) => i === 0 || monthIndex(time) === monthIndex(expectedTimes[i - 1]) + 1,
      ),
    "cpi-api-time-coverage",
    "e-Stat monthly time metadata is discontinuous or incomplete.",
  );
  invariant(
    expectedTimes.at(-1) === endCode && latestMetadataTime === endCode,
    "cpi-api-time-coverage",
    "e-Stat data does not reach the latest monthly metadata period.",
  );
  const header = ["年月", ...series.map((item) => item.existing_key)];
  const rows = [header];
  for (const time of expectedTimes) {
    const row = [japaneseMonth(time)];
    for (const item of series) {
      const key = `${time}\0${item.official_code}`;
      invariant(
        data.has(key),
        "cpi-api-observation-missing",
        "e-Stat omitted a month/category observation instead of providing an explicit value.",
      );
      row.push(data.get(key));
    }
    rows.push(row);
  }
  invariant(unit, "cpi-api-unit-unproven", "e-Stat CPI values do not declare a unit.");
  return {
    rows,
    coverage: { endCode, monthlyObservationCount: data.size, nonMonthlyObservationCount },
    unit,
  };
}

function createSeriesSnapshot(rows, series) {
  const header = new Set(rows[0].slice(1));
  invariant(
    series.every((item) => header.has(item.existing_key)),
    "cpi-series-snapshot-mismatch",
    "Refreshed CPI CSV columns do not match the verified official series map.",
  );
  const lines = [
    "code,name",
    ...series.map((item) => `${csvCell(item.official_code)},${csvCell(item.display_name)}`),
  ];
  return Buffer.from(`${lines.join("\n")}\n`);
}

function validateCanonicalCsv(bytes, metadata, series) {
  assertSha(bytes, metadata.csvSha256, "cpi-canonical-csv-modified");
  const { header, records } = parseCsvTable(bytes.toString("utf8"));
  const expectedHeader = ["年月", ...series.map((item) => item.existing_key)];
  invariant(
    header[0] === "年月" &&
      header.length === expectedHeader.length &&
      new Set(header).size === header.length &&
      expectedHeader.every((key) => header.includes(key)),
    "cpi-canonical-schema-mismatch",
    "Canonical CPI CSV columns do not match the pinned metadata and series map.",
  );
  invariant(
    records.length === metadata.period.monthlyRows,
    "cpi-canonical-coverage-mismatch",
    "Canonical CPI row count does not match pinned metadata.",
  );
  const months = records.map((row) => monthCodeFromJapanese(row.年月));
  invariant(
    months[0] === "197001" && months.at(-1) === monthCodeFromJapanese(metadata.period.end),
    "cpi-canonical-coverage-mismatch",
    "Canonical CPI date coverage does not match pinned metadata.",
  );
  invariant(
    months.every(
      (month, index) => index === 0 || monthIndex(month) === monthIndex(months[index - 1]) + 1,
    ),
    "cpi-canonical-coverage-mismatch",
    "Canonical CPI month history has a gap or duplicate.",
  );
  for (const row of records) {
    for (const key of expectedHeader.slice(1)) {
      const value = row[key];
      invariant(
        value === "" || Number.isFinite(Number(value)),
        "cpi-canonical-value-invalid",
        "Canonical CPI CSV contains a nonnumeric observation.",
      );
    }
  }
  return {
    endCode: months.at(-1),
    records: new Map(months.map((month, index) => [month, records[index]])),
  };
}

function compareOverlappingHistory(refreshedRows, canonical, series) {
  const refreshed = new Map(
    refreshedRows.slice(1).map((row) => [monthCodeFromJapanese(row[0]), row]),
  );
  const digest = createHash("sha256");
  const samples = [];
  let count = 0;
  for (const [month, previousRow] of canonical.records) {
    const currentRow = refreshed.get(month);
    invariant(
      currentRow,
      "cpi-prior-observation-dropped",
      "The refreshed CPI series dropped a previously published month.",
    );
    for (let index = 0; index < series.length; index += 1) {
      const key = series[index].existing_key;
      const previous = previousRow[key];
      const current = currentRow[index + 1];
      const same =
        previous === "" || current === ""
          ? previous === current
          : Number(previous) === Number(current);
      if (same) continue;
      count += 1;
      digest.update(`${month}\0${series[index].official_code}\0${previous}\0${current}\n`);
      if (samples.length < 20)
        samples.push({ month, code: series[index].official_code, series: key, previous, current });
    }
  }
  return { count, samples, sha256: digest.digest("hex") };
}

function validateBaseYearIndex(rows, series) {
  const generalIndex = series.find((item) => item.official_code === "0001");
  invariant(
    generalIndex,
    "cpi-base-year-unproven",
    "CPI metadata has no mapped general index for base-year verification.",
  );
  const column = rows[0].indexOf(generalIndex.existing_key);
  const values = rows
    .slice(1)
    .filter((row) => row[0].startsWith("2025年"))
    .map((row) => Number(row[column]));
  invariant(
    values.length === 12 && values.every(Number.isFinite),
    "cpi-base-year-unproven",
    "The complete 2025 general-index year is unavailable for base-year verification.",
  );
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  invariant(
    average >= 99.9 && average <= 100.1,
    "cpi-base-year-mismatch",
    "2025 general CPI index does not average approximately 100 as required by the 2025 base.",
  );
}

function parseCsv(text) {
  const { header, records } = parseCsvTable(text);
  return records.map((values) => Object.fromEntries(header.map((key) => [key, values[key] ?? ""])));
}

function parseCsvTable(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some(Boolean)) rows.push(row);
  }
  invariant(rows.length > 1, "cpi-csv-invalid", "CPI input CSV is empty.");
  const header = rows[0];
  invariant(
    !quoted &&
      new Set(header).size === header.length &&
      rows.slice(1).every((values) => values.length === header.length),
    "cpi-csv-invalid",
    "CPI input CSV has malformed quoting, duplicate headers, or inconsistent columns.",
  );
  const records = rows
    .slice(1)
    .map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]])));
  return { header, records };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function asArray(value) {
  return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
}
function codeOf(row) {
  return String(row?.["@code"] ?? row?.code ?? "");
}
function attr(record, name) {
  return String(record?.[`@${name}`] ?? record?.[name] ?? "");
}
function isMonthCode(value) {
  return /^\d{6}$/.test(value) && Number(value.slice(4)) >= 1 && Number(value.slice(4)) <= 12;
}
function monthIndex(value) {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(4));
}
function japaneseMonth(value) {
  return `${value.slice(0, 4)}年${Number(value.slice(4))}月`;
}
function monthCodeFromJapanese(value) {
  const match = /^(\d{4})年(\d{1,2})月$/.exec(String(value ?? ""));
  invariant(
    match && Number(match[2]) >= 1 && Number(match[2]) <= 12,
    "cpi-month-invalid",
    "CPI month label is invalid.",
  );
  return `${match[1]}${match[2].padStart(2, "0")}`;
}
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function assertSha(bytes, expected, code) {
  invariant(
    sha256(bytes) === expected,
    code,
    "A pinned CPI input file changed; refresh is refusing to overwrite derived data.",
  );
}
