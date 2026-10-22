import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";
import Papa from "papaparse";
import {
  fetchDataCatalog,
  fetchMetaInfo,
  fetchStatsData,
  fetchStatsList,
  resolveCatalogResource,
} from "../transport/estat-api.mjs";
import { fetchOfficialFile, OFFICIAL_ESTAT_FILE_HOSTS } from "../transport/file.mjs";
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
  fetchFile = fetchOfficialFile,
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
  const categoryFilter = series.map(({ official_code }) => official_code).join(",");
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
      statInfId: source.candidateIdentity?.fileStatInfId,
      requiredStatInfId: source.candidateIdentity?.fileStatInfId,
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
  const metadataRoot = metadataPayload?.GET_META_INFO?.METADATA_INF ?? metadataPayload;
  const classifications = classMap(table, metadataRoot?.CLASS_INF);
  const timeMapping = validateOfficialMetadata(table, classifications, series, selected, snapshot);
  const startTimeCode = timeMapping.monthlyCodeByPeriod.get("197001");
  invariant(
    startTimeCode,
    "cpi-meta-time-unproven",
    "e-Stat metadata has no official time code for January 1970.",
  );

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
        filters: {
          cdArea: "00000",
          cdTab: "1",
          cdTimeFrom: startTimeCode,
          cdCat01: categoryFilter,
        },
      }))
  )(selectedStatsDataId, {
    cdArea: "00000",
    cdTab: "1",
    cdTimeFrom: startTimeCode,
    cdCat01: categoryFilter,
  });
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
    invariant(
      Number.isSafeInteger(fetched.declaredTotal) && fetched.declaredTotal === records.length,
      "cpi-api-page-count-mismatch",
      "CPI API pagination did not account for every returned observation row.",
    );
  }
  const { rows, coverage, unit: declaredUnit } = buildRows(records, series, timeMapping);
  invariant(
    coverage.endCode >= canonical.endCode,
    "cpi-period-regression",
    "The current CPI API period regresses behind the validated canonical history.",
  );
  const approvedPeriod = source?.approvedPeriod;
  invariant(
    source?.period?.through === "latest-published" &&
      approvedPeriod?.from === "202607" &&
      approvedPeriod?.through === "202608" &&
      coverage.endCode >= approvedPeriod.from &&
      coverage.endCode <= approvedPeriod.through,
    "cpi-period-unapproved",
    "The discovered CPI vintage is outside the explicitly reviewed CPI period.",
  );
  const distributionResponse = await fetchFile({
    url: fileCandidate.url,
    allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
    fetchImpl,
  });
  const distributionBytes = distributionResponse?.bytes;
  invariant(
    distributionBytes instanceof Uint8Array && distributionBytes.byteLength > 0,
    "cpi-distribution-file-invalid",
    "The selected CPI distribution file returned no byte content.",
  );
  const distribution = parseCpiDistributionCsv(distributionBytes, series);
  const distributionApiIdentity = compareApiToDistribution(rows, series, distribution, {
    byteLength: distributionBytes.byteLength,
    sha256: sha256(distributionBytes),
  });
  const revisionSummary = compareOverlappingHistory(rows, canonical, series);
  invariant(
    revisionSummary.comparedValueCount === canonical.records.size * series.length,
    "cpi-canonical-overlap-incomplete",
    "The CPI source did not compare every canonical overlap cell.",
  );
  validateBaseYearIndex(rows, series);
  const unit = declaredUnit || timeMapping.metadataUnit || "2025年=100";
  const unitEvidence = timeMapping.metadataUnitDeclared
    ? "official-metadata"
    : declaredUnit
      ? "official-value-rows"
      : "historical-overlap-plus-2025-base-year";
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
      unitEvidence,
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
      cdTimeFrom: startTimeCode,
      cdCat01: categoryFilter,
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
    distributionFileSha256: sha256(distributionBytes),
    distributionFileByteLength: distributionBytes.byteLength,
    distributionApiIdentity,
    period: {
      start: "1970年1月",
      end: japaneseMonth(coverage.endCode),
      monthlyRows: rows.length - 1,
    },
    approvedPeriod: {
      from: approvedPeriod.from,
      through: approvedPeriod.through,
      discovery: "latest-published is discovery only; extend this reviewed window explicitly",
    },
    seriesCount: series.length,
    revisionSummary,
    valueIdentityEvidence: {
      comparedValueCount: revisionSummary.comparedValueCount,
      startMonth: revisionSummary.startMonth,
      endMonth: revisionSummary.endMonth,
      mismatchCount: revisionSummary.count,
    },
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
  const rawFetches = [
    ...capturedResponses,
    ...(fetched?.rawFetches ?? []),
    {
      name: `estat-cpi-file-${fileCandidate.legacyStatInfId ?? source.distributionIdentity.statInfId}`,
      bytes: distributionBytes,
    },
  ];
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
      actualValuePeriodValidated: true,
      distributionApiIdentityValidated: true,
      distributionComparedValueCount: distributionApiIdentity.comparedValueCount,
      distributionMismatchCount: distributionApiIdentity.mismatchCount,
      unitEvidence,
      overlapComparedValueCount: revisionSummary.comparedValueCount,
      overlapStartMonth: revisionSummary.startMonth,
      overlapEndMonth: revisionSummary.endMonth,
      overlapMismatchCount: revisionSummary.count,
      metadataTimeDimensionFound: timeMapping.diagnostics.timeDimensionFound,
      metadataTimeRowCount: timeMapping.diagnostics.rowCount,
      metadataTimeMonthlyPeriodCount: timeMapping.diagnostics.monthlyPeriodCount,
      metadataTimeAnnualPeriodCount: timeMapping.diagnostics.annualPeriodCount,
      metadataTimeMonthlyContinuity: timeMapping.diagnostics.monthlyContinuity,
      revisions: revisionSummary.count,
    },
    reportSummary: {
      candidateCount: selected.candidateCount,
      discoveryPeriod: source.period.through,
      approvedPeriod: { from: approvedPeriod.from, through: approvedPeriod.through },
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
      filters: { cdArea: "00000", cdTab: "1", cdTimeFrom: startTimeCode, cdCat01: categoryFilter },
      table: selected.title,
      classification: "CPI 2025 base; nationwide monthly index; 78 cat01 series",
      retrievedAt: newMeta.retrievedAt,
      coverageStart: "197001",
      coverageEnd: coverage.endCode,
      coverageCount: rows.length - 1,
      revisionCount: revisionSummary.count,
      revisionHash: sha256(Buffer.from(JSON.stringify(revisionSummary))),
      revisionStartMonth: revisionSummary.revisionStartMonth,
      revisionEndMonth: revisionSummary.revisionEndMonth,
      revisionComparedValueCount: revisionSummary.comparedValueCount,
      revisionSamples: revisionSummary.samples
        .slice(0, 10)
        .map(({ code, month }) => ({ seriesId: code, month })),
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
    expectedTitle: "消費者物価指数（2025年基準）",
    expectedStatisticsName: "消費者物価指数",
    titleIncludes: ["消費者物価指数", "2025年基準"],
    cycleIncludes: ["月次", "毎月"],
    surveyYear: "2025",
  };
  invariant(
    /^\d{8,16}$/.test(String(contract.expectedStatsDataId || "")) &&
      contract.expectedStatsDataId === source?.identity?.statsDataId &&
      typeof contract.expectedTitle === "string" &&
      contract.expectedTitle.length > 0 &&
      typeof contract.expectedStatisticsName === "string" &&
      contract.expectedStatisticsName.length > 0 &&
      Array.isArray(contract.titleIncludes) &&
      contract.titleIncludes.length > 0,
    "cpi-candidate-contract-invalid",
    "CPI candidate semantic identity contract is incomplete.",
  );
  const diagnosticCycleIncludes = Array.isArray(contract.cycleIncludes)
    ? contract.cycleIncludes.filter((value) => typeof value === "string" && value.length > 0)
    : ["月次", "毎月"];
  const diagnosticSurveyYear =
    typeof contract.surveyYear === "string" && /^\d{4}$/.test(contract.surveyYear)
      ? contract.surveyYear
      : "2025";
  const candidateRows = candidates.map((candidate) => {
    const id = safeCandidateText(candidate?.["@id"] ?? candidate?.ID ?? candidate?.statsDataId);
    const title = safeCandidateText(candidate?.TITLE);
    const statistics = safeCandidateText(candidate?.STAT_NAME ?? candidate?.STATISTICS_NAME);
    const cycle = safeCandidateText(candidate?.CYCLE);
    const surveyDate = safeCandidateText(candidate?.SURVEY_DATE);
    const updatedDate = safeCandidateText(candidate?.UPDATED_DATE);
    const openDate = safeCandidateText(candidate?.OPEN_DATE);
    const unit = safeCandidateText(candidate?.UNIT);
    return { id, title, statistics, cycle, surveyDate, updatedDate, openDate, unit };
  });
  const hasRequiredIdentityFields = (candidate) =>
    /^\d{8,16}$/.test(candidate.id) && Boolean(candidate.title && candidate.statistics);
  const hasTitleAndStatNameIdentity = (candidate) =>
    hasRequiredIdentityFields(candidate) &&
    candidate.title === contract.expectedTitle &&
    candidate.statistics === contract.expectedStatisticsName;
  const hasMonthlyFrequency = (candidate) =>
    hasRequiredIdentityFields(candidate) &&
    diagnosticCycleIncludes.some((part) => candidate.cycle.includes(part));
  const hasSurveyDate2025 = (candidate) =>
    hasRequiredIdentityFields(candidate) && candidate.surveyDate.includes(diagnosticSurveyYear);
  const titleAndStatNameMatches = candidateRows.filter(hasTitleAndStatNameIdentity);
  const cycleCategory = (value) => {
    if (!value) return "missing";
    if (/(月次|毎月|monthly)/i.test(value)) return "monthly";
    if (/(年次|毎年|年刊|annual)/i.test(value)) return "annual";
    if (/(四半期|quarter)/i.test(value)) return "quarterly";
    return "other";
  };
  const surveyYears = (value) => {
    const years = new Set();
    for (const match of value.matchAll(/(?:^|[^\d])(\d{4})(?!\d)/g)) {
      const year = Number(match[1]);
      if (year >= 1900 && year <= 2100) years.add(match[1]);
    }
    return [...years].sort((a, b) => Number(a) - Number(b));
  };
  const semantic = candidateRows.filter(
    (candidate) =>
      candidate.id === contract.expectedStatsDataId && hasTitleAndStatNameIdentity(candidate),
  );
  if (semantic.length === 0) {
    const error = new RefreshError(
      "cpi-candidate-not-found",
      "No e-Stat table candidate matches the configured CPI API identity.",
    );
    error.candidateDiagnostics = {
      rowsReturned: candidateRows.length,
      requiredIdentityFields: candidateRows.filter(hasRequiredIdentityFields).length,
      titleAndStatNameIdentityMatch: candidateRows.filter(hasTitleAndStatNameIdentity).length,
      monthlyFrequencyMatch: candidateRows.filter(hasMonthlyFrequency).length,
      surveyDate2025Match: candidateRows.filter(hasSurveyDate2025).length,
      fullMatch: semantic.length,
      identityCandidates: titleAndStatNameMatches.slice(0, 3).map((candidate) => ({
        statsDataId: candidate.id,
        cycleCategory: cycleCategory(candidate.cycle),
        surveyYears: surveyYears(candidate.surveyDate),
      })),
    };
    throw error;
  }
  invariant(
    semantic.length === 1,
    "cpi-candidate-ambiguous",
    "Multiple e-Stat tables match the configured CPI API identity.",
  );
  return {
    ...semantic[0],
    candidateCount: semantic.length,
    identityMarkers: contract.titleIncludes,
  };
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
      Number.isInteger(metadata.period?.monthlyRows) &&
      metadata.approvedPeriod?.from === "202607" &&
      metadata.approvedPeriod?.through === "202608",
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

function classMap(table, siblingClassInf) {
  const objects = asArray(
    siblingClassInf?.CLASS_OBJ ??
      siblingClassInf ??
      table?.CLASS_INF?.CLASS_OBJ ??
      table?.CLASS_INF,
  );
  const result = new Map();
  for (const obj of objects) {
    const id = String(obj?.["@id"] ?? obj?.id ?? "");
    if (id) result.set(id, asArray(obj.CLASS));
  }
  return result;
}

function validateOfficialMetadata(table, classes, series, selected, canonicalSnapshot) {
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
  const tab = classes.get("tab") || classes.get("表章項目");
  const index = tab?.find((row) => codeOf(row) === "1");
  const normalizeTitle = (value) => value.replace(/\s+/g, " ").trim();
  const candidateDiagnostics = {
    selectedPresent: Boolean(selected),
    idExact: Boolean(selected) && String(table?.["@id"] ?? table?.ID ?? "") === selected.id,
    titleContainsSelectedTitle:
      Boolean(selected) && normalizeTitle(title).includes(normalizeTitle(selected.title)),
    identityMarkers:
      Boolean(selected) &&
      Array.isArray(selected.identityMarkers) &&
      selected.identityMarkers.every((marker) => title.includes(marker)),
    statisticsName: Boolean(selected) && statistics.includes(selected.statistics),
  };
  if (Object.values(candidateDiagnostics).some((passed) => !passed)) {
    const error = new RefreshError(
      "cpi-meta-candidate-mismatch",
      "e-Stat metadata title, classification, or ID does not match the selected CPI candidate.",
    );
    error.candidateDiagnostics = candidateDiagnostics;
    throw error;
  }
  const area = classes.get("area") || classes.get("地域");
  const areaRows = Array.isArray(area) ? area : [];
  const nationalCode00000Found = areaRows.some((row) => codeOf(row) === "00000");
  const nationalNameNationalFound = areaRows.some(
    (row) => String(row?.["@name"] ?? row?.name ?? "") === "全国",
  );
  const nationalCodeAndNameSameClass = areaRows.some(
    (row) => codeOf(row) === "00000" && String(row?.["@name"] ?? row?.name ?? "") === "全国",
  );
  const cpiMetadataAreaDiagnostics = {
    areaDimensionFound: Boolean(area),
    nationalCode00000Found,
    nationalNameNationalFound,
    nationalCodeAndNameSameClass,
  };
  if (!nationalCodeAndNameSameClass) {
    const error = new RefreshError(
      "cpi-meta-area-unproven",
      "e-Stat metadata does not prove area 00000 is 全国.",
    );
    error.cpiMetadataAreaDiagnostics = cpiMetadataAreaDiagnostics;
    throw error;
  }
  invariant(
    index && /指数/.test(String(index["@name"] ?? index.name ?? "")),
    "cpi-meta-tab-unproven",
    "e-Stat metadata does not prove tab 1 is the index item.",
  );
  const metadataUnitDeclared = Boolean(index && Object.hasOwn(index, "@unit"));
  const metadataUnit = metadataUnitDeclared ? normalizeCpiUnit(index["@unit"]) : undefined;
  if (metadataUnitDeclared) {
    invariant(
      metadataUnit === "2025年=100",
      "cpi-meta-unit-unproven",
      "e-Stat metadata does not declare the exact 2025=100 CPI unit.",
    );
  }
  const categoryClassObjFound = classes.has("cat01");
  const categories = classes.get("cat01") || [];
  const expectedNames = new Map(canonicalSnapshot.map((row) => [row.code, row.name]));
  const categoryCodes = categories.map(codeOf);
  const nonEmptyCategoryCodes = categoryCodes.filter(Boolean);
  const rawCategoryName = (row) => row?.["@name"] ?? row?.name;
  const normalizedCategoryName = (value, code) => {
    const unwrapped =
      value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "$")
        ? value.$
        : value;
    if (typeof unwrapped !== "string" && typeof unwrapped !== "number") return "";
    let name = String(unwrapped);
    if (code) {
      const exactCodePrefix = String(code);
      const remainingName = name.slice(exactCodePrefix.length);
      if (name.startsWith(exactCodePrefix) && /^\s/u.test(remainingName)) {
        name = remainingName.replace(/^\s+/u, "");
      }
    }
    return name.normalize("NFKC").replace(/\s/gu, "");
  };
  const expectedCodeRows = categories.filter((row) => expectedNames.has(codeOf(row)));
  const categoryDiagnostics = {
    categoryClassObjFound,
    rowCount: categories.length,
    uniqueCodeCount: new Set(nonEmptyCategoryCodes).size,
    expectedCodeMatchCount: categoryCodes.filter((code) => expectedNames.has(code)).length,
    exactNameMatchCount: categories.filter(
      (row) => expectedNames.get(codeOf(row)) === String(row?.["@name"] ?? row?.name ?? ""),
    ).length,
    namePrimitiveCount: categories.filter((row) => {
      const value = rawCategoryName(row);
      return (
        value !== null &&
        value !== undefined &&
        typeof value !== "object" &&
        typeof value !== "function" &&
        String(value).trim() !== ""
      );
    }).length,
    nameDollarWrappedCount: categories.filter((row) => {
      const value = rawCategoryName(row);
      return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.hasOwn(value, "$")
      );
    }).length,
    nameMissingCount: categories.filter(
      (row) => normalizedCategoryName(rawCategoryName(row)) === "",
    ).length,
    normalizedNameMatchCount: expectedCodeRows.filter(
      (row) =>
        normalizedCategoryName(rawCategoryName(row), codeOf(row)) ===
        normalizedCategoryName(expectedNames.get(codeOf(row))),
    ).length,
    expectedCodeNamePresentCount: expectedCodeRows.filter(
      (row) => normalizedCategoryName(rawCategoryName(row), codeOf(row)) !== "",
    ).length,
  };
  if (
    !categoryDiagnostics.categoryClassObjFound ||
    categoryDiagnostics.rowCount !== categoryDiagnostics.uniqueCodeCount ||
    categoryDiagnostics.expectedCodeMatchCount !== 78 ||
    categoryDiagnostics.normalizedNameMatchCount !== 78
  ) {
    const error = new RefreshError(
      "cpi-meta-series-mismatch",
      "e-Stat cat01 categories do not contain all 78 expected CPI code/name identities uniquely.",
    );
    error.cpiMetadataCategoryDiagnostics = categoryDiagnostics;
    throw error;
  }
  return {
    ...mapOfficialTimeClasses(classes),
    metadataUnit,
    metadataUnitDeclared,
  };
}

function mapOfficialTimeClasses(classes) {
  const rows = classes.get("time") || [];
  const byCode = new Map();
  const monthlyCodeByPeriod = new Map();
  const annualCodeByBasisYear = new Map();
  const diagnostics = {
    timeDimensionFound: classes.has("time"),
    rowCount: rows.length,
    monthlyPeriodCount: 0,
    annualPeriodCount: 0,
    malformedLabelCount: 0,
    monthLabelPatternCount: 0,
    calendarYearLabelPatternCount: 0,
    fiscalYearLabelPatternCount: 0,
    annualAverageLabelPatternCount: 0,
    blankLabelCount: 0,
    otherLabelPatternCount: 0,
    malformedUniqueCodeCount: 0,
    duplicateCodeCount: 0,
    duplicatePeriodCount: 0,
    requiredStartMonthFound: false,
    monthlyContinuity: false,
  };
  for (const row of rows) {
    const code = codeOf(row);
    const rawName = row?.["@name"] ?? row?.name;
    const name =
      rawName && typeof rawName === "object" && !Array.isArray(rawName) ? rawName.$ : rawName;
    const label = typeof name === "string" || typeof name === "number" ? String(name) : "";
    const monthLabelPattern = /^\d{4}年\d{1,2}月$/.test(label);
    const calendarYearLabelPattern = /^\d{4}年$/.test(label);
    const fiscalYearLabelPattern = /^\d{4}年度$/.test(label);
    const annualAverageLabelPattern = /^\d{4}(?:年|年度)平均$/.test(label);
    if (monthLabelPattern) diagnostics.monthLabelPatternCount += 1;
    else if (calendarYearLabelPattern) diagnostics.calendarYearLabelPatternCount += 1;
    else if (fiscalYearLabelPattern) diagnostics.fiscalYearLabelPatternCount += 1;
    else if (annualAverageLabelPattern) diagnostics.annualAverageLabelPatternCount += 1;
    else if (!label.trim()) diagnostics.blankLabelCount += 1;
    else diagnostics.otherLabelPatternCount += 1;

    const monthMatch = /^(\d{4})年(\d{1,2})月$/.exec(label);
    const calendarAnnualMatch = /^(\d{4})年(?:平均)?$/.exec(label);
    const fiscalAnnualMatch = /^(\d{4})年度$/.exec(label);
    const codeWasUnique = Boolean(code) && !byCode.has(code);
    if (!codeWasUnique) {
      diagnostics.duplicateCodeCount += code ? 1 : 0;
      if (!code) diagnostics.malformedLabelCount += 1;
      continue;
    }
    if (monthMatch && Number(monthMatch[2]) >= 1 && Number(monthMatch[2]) <= 12) {
      const period = `${monthMatch[1]}${monthMatch[2].padStart(2, "0")}`;
      if (monthlyCodeByPeriod.has(period)) {
        diagnostics.duplicatePeriodCount += 1;
        byCode.set(code, { kind: "invalid" });
        continue;
      }
      const mapping = { kind: "monthly", period };
      byCode.set(code, mapping);
      monthlyCodeByPeriod.set(period, code);
      diagnostics.monthlyPeriodCount += 1;
      continue;
    }
    const annualMatch = calendarAnnualMatch || fiscalAnnualMatch;
    if (annualMatch) {
      const year = annualMatch[1];
      const basis = fiscalAnnualMatch ? "fiscal" : "calendar";
      const basisYear = `${basis}:${year}`;
      if (annualCodeByBasisYear.has(basisYear)) {
        diagnostics.duplicatePeriodCount += 1;
        byCode.set(code, { kind: "invalid" });
        continue;
      }
      byCode.set(code, { kind: "annual", basis, year });
      annualCodeByBasisYear.set(basisYear, code);
      diagnostics.annualPeriodCount += 1;
      continue;
    }
    byCode.set(code, { kind: "invalid" });
    diagnostics.malformedLabelCount += 1;
    diagnostics.malformedUniqueCodeCount += 1;
  }
  const monthlyPeriods = [...monthlyCodeByPeriod.keys()].sort();
  diagnostics.requiredStartMonthFound = monthlyPeriods[0] === "197001";
  diagnostics.monthlyContinuity =
    monthlyPeriods.length > 0 &&
    diagnostics.requiredStartMonthFound &&
    monthlyPeriods.every(
      (period, index) =>
        index === 0 || monthIndex(period) === monthIndex(monthlyPeriods[index - 1]) + 1,
    );
  if (
    !diagnostics.timeDimensionFound ||
    diagnostics.malformedLabelCount > 0 ||
    diagnostics.duplicateCodeCount > 0 ||
    diagnostics.duplicatePeriodCount > 0 ||
    !diagnostics.monthlyContinuity
  ) {
    const error = new RefreshError(
      "cpi-meta-time-unproven",
      "e-Stat time classifications do not provide a unique, continuous monthly code map.",
    );
    error.cpiMetadataTimeDiagnostics = diagnostics;
    throw error;
  }
  return {
    byCode,
    monthlyPeriods,
    monthlyCodeByPeriod,
    latestMonth: monthlyPeriods.at(-1),
    diagnostics,
  };
}

function buildRows(records, series, timeMapping) {
  const seriesByCode = new Map(series.map((row) => [row.official_code, row.existing_key]));
  const data = new Map();
  const categoryMonths = new Map(series.map((row) => [row.official_code, new Set()]));
  const annualRecords = new Set();
  let unit;
  let valueUnitDeclaredCount = 0;
  let valueUnitMissingCount = 0;
  let nonMonthlyObservationCount = 0;
  const recordDiagnostics = cpiApiRecordDiagnostics(records, seriesByCode, timeMapping);
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
    const timePeriod = timeMapping.byCode.get(time);
    const monthCode = timePeriod?.kind === "monthly" ? timePeriod.period : null;
    const annualTime = timePeriod?.kind === "annual";
    if (!seriesByCode.has(code) || (!monthCode && !annualTime)) {
      const error = new RefreshError(
        "cpi-api-record-invalid",
        "e-Stat returned an unexpected CPI category or unsupported time code.",
      );
      error.cpiApiRecordDiagnostics = recordDiagnostics;
      throw error;
    }
    const valueUnitDeclared = Object.hasOwn(record ?? {}, "@unit");
    if (valueUnitDeclared) {
      valueUnitDeclaredCount += 1;
      const normalizedUnit = normalizeCpiUnit(record["@unit"]);
      invariant(
        unit === undefined || normalizedUnit === unit,
        "cpi-api-unit-mismatch",
        "e-Stat CPI value units changed within the returned series.",
      );
      invariant(
        normalizedUnit === "2025年=100",
        "cpi-api-unit-unproven",
        "e-Stat CPI values do not declare the exact 2025=100 index unit.",
      );
      unit = normalizedUnit;
    } else {
      valueUnitMissingCount += 1;
    }
    if (annualTime) {
      const annualKey = `${time}\0${code}`;
      invariant(
        !annualRecords.has(annualKey),
        "cpi-api-duplicate",
        "e-Stat returned duplicate CPI annual observations.",
      );
      annualRecords.add(annualKey);
      nonMonthlyObservationCount += 1;
      continue;
    }
    const value = record?.["$"] ?? record?.value;
    invariant(
      typeof value === "string" || typeof value === "number",
      "cpi-api-value-invalid",
      "e-Stat CPI record has no scalar value.",
    );
    const key = `${monthCode}\0${code}`;
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
    categoryMonths.get(code).add(monthCode);
  }
  invariant(
    valueUnitDeclaredCount === 0 || valueUnitMissingCount === 0,
    "cpi-api-unit-unproven",
    "e-Stat CPI values inconsistently omit their unit declaration.",
  );
  const monthlyTimesByCategory = new Map(
    series.map((item) => [item.official_code, [...categoryMonths.get(item.official_code)].sort()]),
  );
  const observedLatestMonths = series.map((item) =>
    monthlyTimesByCategory.get(item.official_code).at(-1),
  );
  const observedLatestMonth = observedLatestMonths[0];
  const outputPeriods = timeMapping.monthlyPeriods.filter(
    (period) => period <= observedLatestMonth,
  );
  const metadataAxisComplete =
    outputPeriods.length > 0 &&
    outputPeriods[0] === "197001" &&
    outputPeriods.every(
      (period, index) =>
        index === 0 || monthIndex(period) === monthIndex(outputPeriods[index - 1]) + 1,
    );
  const categoryCoverageComplete = series.every((item) => {
    const observed = monthlyTimesByCategory.get(item.official_code);
    if (!observed.length || observed.at(-1) !== observedLatestMonth) return false;
    const firstObserved = observed[0];
    return outputPeriods
      .filter((period) => period >= firstObserved)
      .every((period) => categoryMonths.get(item.official_code).has(period));
  });
  invariant(
    metadataAxisComplete &&
      observedLatestMonth &&
      observedLatestMonth <= timeMapping.latestMonth &&
      observedLatestMonths.every((period) => period === observedLatestMonth) &&
      categoryCoverageComplete,
    "cpi-api-time-coverage",
    "e-Stat CPI category observations have an internal gap, lack the latest month, or fall outside the metadata time axis.",
  );
  const header = ["年月", ...series.map((item) => item.existing_key)];
  const rows = [header];
  for (const time of outputPeriods) {
    const row = [japaneseMonth(time)];
    for (const item of series) {
      const key = `${time}\0${item.official_code}`;
      const firstObserved = monthlyTimesByCategory.get(item.official_code)[0];
      if (time < firstObserved) row.push("");
      else {
        invariant(
          data.has(key),
          "cpi-api-observation-missing",
          "e-Stat omitted a month/category observation after its first observation.",
        );
        row.push(data.get(key));
      }
    }
    rows.push(row);
  }
  return {
    rows,
    coverage: {
      endCode: observedLatestMonth,
      monthlyObservationCount: data.size,
      nonMonthlyObservationCount,
    },
    unit,
  };
}

function cpiApiRecordDiagnostics(records, seriesByCode, timeMapping) {
  const diagnostics = {
    totalRows: records.length,
    unknownCategoryCount: 0,
    unrecognizedTimeCount: 0,
    bothInvalidCount: 0,
  };
  for (const record of records) {
    const categoryKnown = seriesByCode.has(attr(record, "cat01"));
    const time = attr(record, "time");
    const timeKnown =
      timeMapping.byCode.has(time) && timeMapping.byCode.get(time)?.kind !== "invalid";
    if (!categoryKnown) diagnostics.unknownCategoryCount += 1;
    if (!timeKnown) diagnostics.unrecognizedTimeCount += 1;
    if (!categoryKnown && !timeKnown) diagnostics.bothInvalidCount += 1;
  }
  return diagnostics;
}

function normalizeCpiUnit(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s/gu, "");
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

function parseCpiDistributionCsv(bytes, series) {
  const decoded = iconv.decode(Buffer.from(bytes), "windows-31j");
  invariant(
    !decoded.includes("\uFFFD"),
    "cpi-distribution-encoding-invalid",
    "The selected CPI distribution file is not valid CP932 text.",
  );
  const parsed = Papa.parse(decoded.replace(/^\uFEFF/, ""), {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
  });
  invariant(
    !parsed.errors?.length,
    "cpi-distribution-csv-invalid",
    "The selected CPI distribution file is not valid CSV.",
  );
  const rows = parsed.data;
  while (rows.length && rows.at(-1).every((value) => String(value ?? "").trim() === "")) rows.pop();
  invariant(
    rows.length > 4 && rows[2]?.[0]?.trim() === "類・品目符号(Group/Item code)",
    "cpi-distribution-schema-invalid",
    "The selected CPI distribution file does not match the verified four-row header schema.",
  );
  const codeRow = rows[2];
  const codes = codeRow.slice(1).map((code) => String(code ?? "").trim());
  const expectedCodes = new Set(series.map((item) => item.official_code));
  const uniqueCodeCount = new Set(codes.filter(Boolean)).size;
  const expectedCodeMatchCount = codes.filter((code) => expectedCodes.has(code)).length;
  const codeDiagnostics = {
    codeRowColumnCount: codeRow.length,
    totalCodeCount: codes.length,
    nonEmptyCodeCount: codes.filter(Boolean).length,
    uniqueCodeCount,
    emptyCodeCount: codes.filter((code) => !code).length,
    duplicateCodeCount: codes.filter(Boolean).length - uniqueCodeCount,
    expectedCodeMatchCount,
    supplementalCodeCount: codes.filter((code) => Boolean(code) && !expectedCodes.has(code)).length,
    missingExpectedCodeCount:
      expectedCodes.size - new Set(codes.filter((code) => expectedCodes.has(code))).size,
  };
  const failSeriesIdentity = () => {
    const error = new RefreshError(
      "cpi-distribution-series-invalid",
      "The selected CPI distribution file does not contain a unique superset of required CPI codes.",
    );
    error.cpiDistributionSeriesDiagnostics = codeDiagnostics;
    throw error;
  };
  invariant(
    rows[3]?.length === codeRow.length,
    "cpi-distribution-schema-invalid",
    "The selected CPI distribution file has an inconsistent series name row width.",
  );
  if (
    codeDiagnostics.emptyCodeCount > 0 ||
    codeDiagnostics.duplicateCodeCount > 0 ||
    codeDiagnostics.missingExpectedCodeCount > 0 ||
    codeDiagnostics.expectedCodeMatchCount !== expectedCodes.size
  ) {
    failSeriesIdentity();
  }
  const columnByCode = new Map(
    codes.map((code, index) => [code, index + 1]).filter(([code]) => expectedCodes.has(code)),
  );
  const periods = [];
  const valuesByPeriod = new Map();
  const expectedWeightRows = ["ウエイト(Weight)", "ウエイト１万分比(Weight per 10000)"];
  for (let offset = 0; offset < expectedWeightRows.length; offset += 1) {
    const row = rows[4 + offset];
    invariant(
      row?.length === codeRow.length && String(row[0] ?? "").trim() === expectedWeightRows[offset],
      "cpi-distribution-schema-invalid",
      "The selected CPI distribution file does not start with the verified weight metadata rows.",
    );
  }
  for (let rowIndex = 6; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    invariant(
      row.length === codeRow.length,
      "cpi-distribution-row-invalid",
      "The selected CPI distribution file has a row with an unexpected width.",
    );
    const period = String(row[0] ?? "").trim();
    invariant(
      !expectedWeightRows.includes(period),
      "cpi-distribution-schema-invalid",
      "The selected CPI distribution file contains duplicate or misplaced weight metadata rows.",
    );
    invariant(
      /^\d{6}$/.test(period) && Number(period.slice(4)) >= 1 && Number(period.slice(4)) <= 12,
      "cpi-distribution-period-invalid",
      "The selected CPI distribution file has an invalid monthly key.",
    );
    invariant(
      !valuesByPeriod.has(period),
      "cpi-distribution-period-duplicate",
      "The selected CPI distribution file has duplicate monthly keys.",
    );
    const values = new Map();
    for (const { official_code: code } of series) {
      const raw = String(row[columnByCode.get(code)] ?? "").trim();
      if (raw === "" || raw === "-" || raw === "***") {
        values.set(code, "");
      } else {
        const value = Number(raw);
        invariant(
          Number.isFinite(value),
          "cpi-distribution-value-invalid",
          "The selected CPI distribution file contains a non-finite or malformed value.",
        );
        values.set(code, String(value));
      }
    }
    periods.push(period);
    valuesByPeriod.set(period, values);
  }
  invariant(
    periods.length > 0 &&
      periods[0] === "197001" &&
      periods.every(
        (period, index) => index === 0 || monthIndex(period) === monthIndex(periods[index - 1]) + 1,
      ),
    "cpi-distribution-period-coverage",
    "The selected CPI distribution file does not provide continuous monthly coverage from 197001.",
  );
  return { periods, codes, valuesByPeriod, columnByCode };
}

function compareApiToDistribution(apiRows, series, distribution, fileProvenance) {
  const apiPeriods = apiRows.slice(1).map((row) => monthCodeFromJapanese(row[0]));
  const alignedLength = Math.min(distribution.periods.length, apiPeriods.length);
  let positionalMismatchCount = 0;
  let firstMismatchIndex = null;
  for (let index = 0; index < alignedLength; index += 1) {
    if (distribution.periods[index] !== apiPeriods[index]) {
      positionalMismatchCount += 1;
      if (firstMismatchIndex === null) firstMismatchIndex = index;
    }
  }
  const missingApiPeriodCount = apiPeriods.filter(
    (period) => !distribution.valuesByPeriod.has(period),
  ).length;
  const periodDiagnostics = {
    apiPeriodCount: apiPeriods.length,
    apiStartMonth: apiPeriods[0] ?? null,
    apiEndMonth: apiPeriods.at(-1) ?? null,
    distributionPeriodCount: distribution.periods.length,
    distributionStartMonth: distribution.periods[0] ?? null,
    distributionEndMonth: distribution.periods.at(-1) ?? null,
    distributionFileByteLength: fileProvenance.byteLength,
    distributionFileSha256: fileProvenance.sha256,
    positionalMismatchCount,
    firstMismatchIndex,
    firstMismatchApiMonth:
      firstMismatchIndex === null ? null : (apiPeriods[firstMismatchIndex] ?? null),
    firstMismatchDistributionMonth:
      firstMismatchIndex === null ? null : (distribution.periods[firstMismatchIndex] ?? null),
    missingApiPeriodCount,
  };
  const failPeriodIdentity = () => {
    const error = new RefreshError(
      "cpi-distribution-api-period-mismatch",
      "The selected CPI distribution file and API do not cover identical months.",
    );
    error.cpiDistributionPeriodDiagnostics = periodDiagnostics;
    throw error;
  };
  if (
    distribution.periods.length !== apiPeriods.length ||
    positionalMismatchCount > 0 ||
    missingApiPeriodCount > 0
  ) {
    failPeriodIdentity();
  }
  const digest = createHash("sha256");
  const summary = {
    startMonth: apiPeriods[0],
    endMonth: apiPeriods.at(-1),
    periodCount: apiPeriods.length,
    seriesCount: series.length,
    comparedValueCount: 0,
    mismatchCount: 0,
  };
  for (let rowIndex = 0; rowIndex < apiPeriods.length; rowIndex += 1) {
    const period = apiPeriods[rowIndex];
    const distributionValues = distribution.valuesByPeriod.get(period);
    if (!distributionValues) failPeriodIdentity();
    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
      const code = series[seriesIndex].official_code;
      const apiValue = String(apiRows[rowIndex + 1][seriesIndex + 1] ?? "");
      const fileValue = distributionValues.get(code);
      summary.comparedValueCount += 1;
      digest.update(`${period}\0${code}\0${apiValue}\0${fileValue}\n`);
      const same =
        apiValue === "" || fileValue === ""
          ? apiValue === fileValue
          : Number(apiValue) === Number(fileValue);
      if (!same) summary.mismatchCount += 1;
    }
  }
  summary.sha256 = digest.digest("hex");
  if (summary.mismatchCount > 0) {
    const error = new RefreshError(
      "cpi-distribution-api-mismatch",
      "CPI API values do not match the selected official distribution file.",
    );
    error.cpiDistributionApiDiagnostics = summary;
    throw error;
  }
  return summary;
}

function compareOverlappingHistory(refreshedRows, canonical, series) {
  const refreshed = new Map(
    refreshedRows.slice(1).map((row) => [monthCodeFromJapanese(row[0]), row]),
  );
  const digest = createHash("sha256");
  const samples = [];
  let count = 0;
  let comparedValueCount = 0;
  let revisionStartMonth;
  let revisionEndMonth;
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
      comparedValueCount += 1;
      const same =
        previous === "" || current === ""
          ? previous === current
          : Number(previous) === Number(current);
      if (same) continue;
      count += 1;
      revisionStartMonth ??= month;
      revisionEndMonth = month;
      digest.update(`${month}\0${series[index].official_code}\0${previous}\0${current}\n`);
      if (samples.length < 20)
        samples.push({ month, code: series[index].official_code, series: key, previous, current });
    }
  }
  return {
    count,
    samples,
    sha256: digest.digest("hex"),
    comparedValueCount,
    startMonth: canonical.records.keys().next().value,
    endMonth: [...canonical.records.keys()].at(-1),
    revisionStartMonth,
    revisionEndMonth,
  };
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
