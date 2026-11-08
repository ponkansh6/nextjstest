import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import { RefreshError, invariant } from "../lib/errors.mjs";
import { fetchDataCatalog } from "../transport/estat-api.mjs";
import { fetchOfficialFile, OFFICIAL_ESTAT_FILE_HOSTS } from "../transport/file.mjs";

export const MONTHLY_LABOR_ACTUALS_IDENTITY = Object.freeze({
  kind: "file",
  statisticsCode: "00450071",
  statInfId: "000040491571",
  format: "xls",
});

export const MONTHLY_LABOR_ACTUALS_CATALOG_QUERY = Object.freeze({
  statsCode: "00450071",
  searchWord: "毎勤原表",
});

export const MONTHLY_LABOR_ACTUALS_PATHS = Object.freeze({
  csv: "data/source/monthly_labor_statistics_actual_snapshot.csv",
  metadata: "data/source/monthly_labor_statistics_actual_snapshot.metadata.json",
  source: "data/source/monthly_labor_statistics_actual_snapshot.xls",
});

const EXPECTED_SHEET = "実数原表";
const EXPECTED_DATASET_CLASSIFICATION = "実数原表（2012年1月～）";
const SUPPORTED_RESOURCE_FORMATS = new Set(["XLS", "XLS_REP"]);
const TARGET = "調査産業計 / 就業形態計 / 5人以上";
const DIGEST = (bytes) => createHash("sha256").update(bytes).digest("hex");
const EMPTY_CATALOG_DIAGNOSTICS = Object.freeze({
  datasetRows: 0,
  resourceRows: 0,
  statisticsCodeMatches: 0,
  statisticsNameMatches: 0,
  nationwideMatches: 0,
  actualTableMatches: 0,
  monthlyMatches: 0,
  resourceTitleMatches: 0,
  confirmedMatches: 0,
  regularSampleMatches: 0,
  parseablePeriodMatches: 0,
  xlsMatches: 0,
  officialHostMatches: 0,
  candidateMatches: 0,
  latestTieCount: 0,
});
const text = (value) => {
  let candidate = value;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth += 1)
    candidate = candidate.NAME ?? candidate.$ ?? candidate.VALUE ?? candidate.value;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate).trim()
    : "";
};
// Compare workbook labels exactly after Unicode compatibility and whitespace normalization.
const normalized = (value) => text(value).normalize("NFKC").replace(/\s+/gu, "");

const SERIES = Object.freeze([
  {
    series: "total_earning",
    column: 12,
    groupColumn: 12,
    groupHeader: "現金給与額",
    columnHeader: "総額",
    unit: "円",
    target: "現金給与額/総額",
  },
  {
    series: "contractual_earnings",
    column: 13,
    groupColumn: 12,
    groupHeader: "現金給与額",
    columnHeader: "きまって支給する給与",
    unit: "円",
    target: "現金給与額/きまって支給する給与",
  },
  {
    series: "scheduled_earnings",
    column: 14,
    groupColumn: 12,
    groupHeader: "現金給与額",
    columnHeader: "所定内給与",
    unit: "円",
    target: "現金給与額/所定内給与",
  },
  {
    series: "total_worked_hours",
    column: 9,
    groupColumn: 9,
    groupHeader: "実労働時間数",
    columnHeader: "総数",
    unit: "時間",
    target: "実労働時間数/総数",
  },
  {
    series: "employment_indices",
    column: 6,
    groupColumn: 3,
    groupHeader: "常用労働者数",
    columnHeader: "本調査期間末",
    unit: "人",
    target: "常用労働者数/本調査期間末",
  },
]);

/** Select the unique latest confirmed monthly source from the e-Stat catalog. */
export function resolveLatestMonthlyLaborActuals(datasets, { now = new Date() } = {}) {
  invariant(
    Array.isArray(datasets),
    "actuals-catalog-invalid",
    "e-Stat actual-table catalog response is invalid.",
  );
  const diagnostics = { ...EMPTY_CATALOG_DIAGNOSTICS };
  const candidates = [];
  for (const dataset of datasets) {
    if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) continue;
    diagnostics.datasetRows += 1;
    const datasetTitle = text(dataset.TITLE);
    const statisticName = text(dataset.STAT_NAME ?? dataset.STATISTICS_NAME);
    const context = normalized(
      [
        datasetTitle,
        statisticName,
        dataset.TABULATION_CATEGORY,
        dataset.TABULATION_SUB_CATEGORY1,
        dataset.TABULATION_SUB_CATEGORY2,
        dataset.TABULATION_SUB_CATEGORY3,
        dataset.TABULATION_SUB_CATEGORY4,
        dataset.TABULATION_SUB_CATEGORY5,
      ]
        .map(text)
        .filter(Boolean)
        .join(" "),
    );
    invariant(
      datasetTitle.length <= 500 &&
        !/(?:https?:\/\/|appId\s*=|api.?key|token\s*=)/i.test(datasetTitle),
      "actuals-catalog-title-invalid",
      "e-Stat actual-table catalog dataset title is not safe to report.",
    );
    const returnedStatisticsCode = catalogStatisticsCode(dataset);
    if (returnedStatisticsCode !== MONTHLY_LABOR_ACTUALS_IDENTITY.statisticsCode) continue;
    diagnostics.statisticsCodeMatches += 1;
    const normalizedStatisticName = normalized(statisticName).toLowerCase();
    if (
      !normalizedStatisticName.includes("毎月勤労統計調査") &&
      !normalizedStatisticName.includes("monthlylaboursurvey")
    )
      continue;
    diagnostics.statisticsNameMatches += 1;
    if (!context.includes("全国調査")) continue;
    diagnostics.nationwideMatches += 1;
    if (!normalized(datasetTitle).includes(normalized(EXPECTED_DATASET_CLASSIFICATION))) continue;
    if (/従来の公表値|500人以上規模抽出調査系列/u.test(context)) continue;
    diagnostics.actualTableMatches += 1;
    const cycle = normalized(dataset.TITLE?.CYCLE ?? dataset.CYCLE ?? dataset.FREQUENCY);
    if (!cycle.includes("月次") && !cycle.includes("毎月") && !cycle.includes("monthly")) continue;
    diagnostics.monthlyMatches += 1;
    const resources = Array.isArray(dataset.RESOURCE)
      ? dataset.RESOURCE
      : dataset.RESOURCE
        ? [dataset.RESOURCE]
        : Array.isArray(dataset.RESOURCES?.RESOURCE)
          ? dataset.RESOURCES.RESOURCE
          : dataset.RESOURCES?.RESOURCE
            ? [dataset.RESOURCES.RESOURCE]
            : [];
    for (const resource of resources) {
      if (!resource || typeof resource !== "object" || Array.isArray(resource)) continue;
      diagnostics.resourceRows += 1;
      const catalogResourceId = text(resource["@id"]);
      invariant(
        !catalogResourceId || /^[A-Za-z0-9_-]{1,100}$/.test(catalogResourceId),
        "actuals-catalog-resource-id-invalid",
        "e-Stat actual-table catalog resource id is not safe to store.",
      );
      const title = text(resource.TITLE);
      invariant(
        title.length <= 500 && !/(?:https?:\/\/|appId\s*=|api.?key|token\s*=)/i.test(title),
        "actuals-catalog-title-invalid",
        "e-Stat actual-table catalog resource title is not safe to report.",
      );
      const normalizedTitle = normalized(title);
      if (!normalizedTitle.includes("毎勤原表")) continue;
      diagnostics.resourceTitleMatches += 1;
      if (!normalizedTitle.includes("確報") || normalizedTitle.includes("速報")) continue;
      diagnostics.confirmedMatches += 1;
      const sampleContext = normalized(`${context} ${title}`);
      if (sampleContext.includes("旧サンプル") || sampleContext.includes("旧標本")) continue;
      diagnostics.regularSampleMatches += 1;
      const period = periodFromCatalog(resource, title, dataset);
      if (!period) continue;
      diagnostics.parseablePeriodMatches += 1;
      invariant(
        period <= currentMonth(now),
        "actuals-period-in-future",
        "e-Stat actual-table catalog contains a future survey period.",
      );
      const releaseDate = text(resource.RELEASE_DATE ?? resource.OPEN_DATE ?? dataset.RELEASE_DATE);
      const modifiedDate = text(
        resource.LAST_MODIFIED_DATE ??
          resource.UPDATE_DATE ??
          dataset.LAST_MODIFIED_DATE ??
          releaseDate,
      );
      const format = text(resource.FORMAT).toUpperCase();
      if (SUPPORTED_RESOURCE_FORMATS.has(format)) diagnostics.xlsMatches += 1;
      let url;
      try {
        url = new URL(text(resource.URL));
      } catch {
        url = undefined;
      }
      const officialHost = url?.protocol === "https:" && url.hostname === "www.e-stat.go.jp";
      if (officialHost) diagnostics.officialHostMatches += 1;
      diagnostics.candidateMatches += 1;
      candidates.push({
        title,
        datasetTitle,
        catalogResourceId: catalogResourceId || undefined,
        period,
        revision: "確報",
        releaseDate,
        lastModifiedDate: modifiedDate,
        format,
        url: url?.toString(),
        officialHost,
      });
    }
  }
  if (!candidates.length) {
    const error = new RefreshError(
      "actuals-catalog-candidate-missing",
      "No confirmed monthly actual table was found in the e-Stat catalog.",
    );
    error.candidateDiagnostics = diagnostics;
    error.apiPhase = "catalog";
    throw error;
  }
  candidates.sort((a, b) => b.period.localeCompare(a.period));
  const newest = candidates.filter((candidate) => candidate.period === candidates[0].period);
  diagnostics.latestTieCount = newest.length;
  invariant(
    newest.length === 1,
    "actuals-catalog-candidate-ambiguous",
    "Multiple confirmed actual-table resources have the latest survey period.",
  );
  const selected = newest[0];
  invariant(
    validIsoDate(selected.releaseDate) && validIsoDate(selected.lastModifiedDate),
    "actuals-catalog-invalid",
    "Latest confirmed actual-table entry has invalid release metadata.",
  );
  invariant(
    SUPPORTED_RESOURCE_FORMATS.has(selected.format) && selected.officialHost,
    "actuals-catalog-resource-unsupported",
    "The latest confirmed actual-table entry must have one supported official XLS resource.",
  );
  const url = new URL(selected.url);
  invariant(
    !url.username &&
      !url.password &&
      ![...url.searchParams.keys()].some((key) => /(app.?id|api.?key|token)/i.test(key)),
    "actuals-catalog-resource-invalid",
    "e-Stat actual-table resource URL must not contain credentials.",
  );
  const statInfId = url.searchParams.get("statInfId");
  invariant(
    statInfId && /^\d{8,16}$/.test(statInfId),
    "actuals-catalog-resource-invalid",
    "e-Stat actual-table resource has no valid statInfId.",
  );
  return {
    ...selected,
    url: url.toString(),
    statInfId,
    format: selected.format,
    candidateCount: candidates.length,
    candidateDiagnostics: diagnostics,
  };
}

/** Extract the five actual values from the official monthly result workbook. */
export function parseMonthlyLaborActualWorkbook(input, expectedPeriod) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  invariant(bytes.byteLength > 0, "actuals-workbook-empty", "Actual-table workbook is empty.");
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  invariant(
    workbook.SheetNames.length === 1 && workbook.SheetNames[0] === EXPECTED_SHEET,
    "actuals-workbook-sheet-mismatch",
    "Actual-table workbook does not have the expected sheet.",
  );
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[EXPECTED_SHEET], {
    header: 1,
    defval: "",
  });
  const workbookTitle = normalized(rows[0]?.[7]);
  invariant(
    workbookTitle.includes("毎月勤労統計調査") &&
      workbookTitle.includes("全国調査") &&
      workbookTitle.includes("結果原表"),
    "actuals-workbook-header-mismatch",
    "Actual-table workbook does not identify the official nationwide result table.",
  );
  for (const { series, column, groupColumn, groupHeader, columnHeader, unit } of SERIES) {
    invariant(
      normalized(rows[3]?.[groupColumn]) === normalized(groupHeader) &&
        normalized(rows[4]?.[column]) === normalized(columnHeader) &&
        normalized(rows[6]?.[column]) === normalized(unit),
      "actuals-workbook-header-mismatch",
      `Actual-table workbook columns do not match the verified header mapping for ${series}.`,
    );
  }
  const period = periodFromWorkbook(rows[1]);
  invariant(
    period === expectedPeriod,
    "actuals-workbook-period-mismatch",
    "Actual-table workbook period does not match its e-Stat catalog entry.",
  );
  const revision = normalized(rows[1]?.[13]);
  invariant(
    revision.includes("確報") && !revision.includes("速報"),
    "actuals-workbook-revision-unconfirmed",
    "Only confirmed actual-table workbooks may be published.",
  );
  invariant(
    normalized(rows[7]?.[0]) === "T" &&
      normalized(rows[7]?.[1]) === "T" &&
      normalized(rows[7]?.[2]) === "T",
    "actuals-workbook-target-mismatch",
    "The first nationwide total-employment data row does not match the verified target.",
  );
  const sourceRow = rows[7];
  const values = SERIES.map(({ series, column, unit, target }) => {
    const value = sourceRow[column];
    invariant(
      typeof value === "number" && Number.isFinite(value) && value >= 0,
      "actuals-workbook-value-invalid",
      `Actual-table value is missing or invalid for ${series}.`,
    );
    if (unit !== "時間")
      invariant(
        Number.isInteger(value),
        "actuals-workbook-value-invalid",
        `Actual-table value must be an integer for ${series}.`,
      );
    return { series, value, unit, target };
  });
  invariant(
    new Set(values.map(({ series }) => series)).size === SERIES.length,
    "actuals-workbook-series-duplicate",
    "Actual-table mapping contains duplicate series.",
  );
  return { period, values };
}

export async function monthlyLaborActualsAdapter({
  source,
  root = process.cwd(),
  now = () => new Date(),
  fetchFile = fetchOfficialFile,
  fetchImpl = fetch,
  transportConfig = {},
  getDataCatalog,
  approveActualsRevision,
  check = false,
} = {}) {
  validateSourceIdentity(source);
  const catalogResponses = [];
  const captureCatalogFetch = async (input, init) => {
    const response = await fetchImpl(input, init);
    invariant(
      typeof response?.clone === "function",
      "actuals-catalog-invalid",
      "DataCatalog response cannot be captured for refresh evidence.",
    );
    const bytes = Buffer.from(await response.clone().arrayBuffer());
    catalogResponses.push(bytes);
    return response;
  };
  const result = await (
    getDataCatalog ||
    ((query) =>
      fetchDataCatalog({
        appId: transportConfig.appId,
        fetchImpl: captureCatalogFetch,
        query,
        limit: 100,
      }))
  )(source.catalogQuery);
  const datasets = Array.isArray(result) ? result : result?.datasets;
  const candidate = resolveLatestMonthlyLaborActuals(datasets, { now: now() });
  const fetched = await fetchFile({ url: candidate.url, allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS });
  const sourceBytes = Buffer.from(fetched?.bytes ?? []);
  invariant(
    ["application/vnd.ms-excel", "application/octet-stream"].includes(
      String(fetched?.contentType ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase(),
    ),
    "actuals-workbook-media-type-invalid",
    "Latest actual-table resource did not return an approved Excel media type.",
  );
  const parsed = parseMonthlyLaborActualWorkbook(sourceBytes, candidate.period);
  const csv = buildSnapshotCsv(parsed.period, parsed.values);
  const retrievedAt = now().toISOString();
  const csvBytes = Buffer.from(csv, "utf8");
  const sourceHash = DIGEST(sourceBytes);
  const revisionAudit = await validatePeriodAdvance(root, parsed.period, csv, sourceHash, {
    check,
    approveActualsRevision,
  });
  const metadata = {
    source: "厚生労働省 毎月勤労統計調査 全国調査 実数原表",
    sourceUrl: candidate.url,
    sourceCatalogTitle: candidate.title,
    sourceDatasetTitle: candidate.datasetTitle,
    ...(candidate.catalogResourceId ? { catalogResourceId: candidate.catalogResourceId } : {}),
    statInfId: candidate.statInfId,
    statisticsCode: MONTHLY_LABOR_ACTUALS_IDENTITY.statisticsCode,
    format: candidate.format,
    sourceFile: `${candidate.statInfId}.xls`,
    sourcePath: MONTHLY_LABOR_ACTUALS_PATHS.source,
    sourceSha256: sourceHash,
    normalizedCsvSha256: DIGEST(csvBytes),
    bytes: sourceBytes.byteLength,
    contentType: fetched?.contentType ?? "application/octet-stream",
    retrievedAt,
    sheet: EXPECTED_SHEET,
    period: parsed.period,
    releaseDate: candidate.releaseDate,
    lastModifiedDate: candidate.lastModifiedDate,
    revision: "確報",
    target: TARGET,
    mapping: parsed.values.map(({ series, unit, target }) => ({ series, unit, target })),
    note: "Actual-value cross-section; kept separate from the monthly index and rate series.",
  };
  return {
    artifacts: [
      { path: MONTHLY_LABOR_ACTUALS_PATHS.csv, bytes: csvBytes },
      {
        path: MONTHLY_LABOR_ACTUALS_PATHS.metadata,
        bytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
      },
      { path: MONTHLY_LABOR_ACTUALS_PATHS.source, bytes: sourceBytes },
    ],
    semanticValue: {
      identity: MONTHLY_LABOR_ACTUALS_IDENTITY,
      statInfId: candidate.statInfId,
      period: parsed.period,
      revision: "確報",
      sourceSha256: sourceHash,
      normalizedCsvSha256: DIGEST(csvBytes),
    },
    rawFetches: [
      ...catalogResponses.map((bytes, index) => ({
        name: `monthly-labor-actuals-catalog-${index + 1}`,
        bytes,
      })),
      { name: "monthly-labor-actuals-workbook", bytes: sourceBytes },
    ],
    coverage: {
      start: parsed.period,
      end: parsed.period,
      monthlyRows: 1,
      seriesCount: parsed.values.length,
    },
    validationSummary: {
      period: parsed.period,
      revision: "確報",
      seriesCount: parsed.values.length,
      samePeriodRevision: revisionAudit.changedObservationCount > 0,
      samePeriodRevisionApproved: revisionAudit.approved === true,
      changedSeriesCount: revisionAudit.changedObservationCount,
      catalogTitle: candidate.title,
      releaseDate: candidate.releaseDate,
      statInfId: candidate.statInfId,
    },
    revisionAudit: { actualsSnapshot: revisionAudit },
    reportSummary: {
      status: "selected",
      fileCandidateCount: candidate.candidateCount,
      selectedCatalogTitle: candidate.title,
      selectedDatasetTitle: candidate.datasetTitle,
      selectedCatalogFormat: candidate.format,
      selectedCatalogReleaseDate: candidate.releaseDate,
      selectedCatalogLastModifiedDate: candidate.lastModifiedDate,
      fileStatInfId: candidate.statInfId,
    },
  };
}

function validateSourceIdentity(source) {
  invariant(
    source?.sourceKind === "catalog-file" &&
      source?.identity?.kind === "file" &&
      source.identity.statisticsCode === MONTHLY_LABOR_ACTUALS_IDENTITY.statisticsCode &&
      source.identity.statInfId === MONTHLY_LABOR_ACTUALS_IDENTITY.statInfId &&
      source.identity.format === MONTHLY_LABOR_ACTUALS_IDENTITY.format &&
      source.statisticsCode === MONTHLY_LABOR_ACTUALS_IDENTITY.statisticsCode &&
      source.catalogTitleIncludes === EXPECTED_DATASET_CLASSIFICATION &&
      source.catalogQuery?.statsCode === "00450071" &&
      source.catalogQuery?.searchWord === "毎勤原表" &&
      !Object.hasOwn(source.catalogQuery ?? {}, "dataType") &&
      source.frequency === "monthly" &&
      source.period?.through === "latest-confirmed" &&
      source.revision === "latest-confirmed-only",
    "actuals-identity-mismatch",
    "Monthly Labor actual-table source identity does not match the verified catalog contract.",
  );
}

function periodFromCatalog(resource, title, dataset) {
  const fromTitle = parsePeriod(title);
  const fromResourceSurveyDate = parsePeriod(
    text(resource.SURVEY_DATE ?? resource.TITLE?.SURVEY_DATE),
  );
  const datasetSurveyText = text(dataset.TITLE?.SURVEY_DATE ?? dataset.SURVEY_DATE);
  const fromDatasetSurveyDate = /[～〜~]/u.test(datasetSurveyText)
    ? undefined
    : parsePeriod(datasetSurveyText);
  if (fromTitle && fromResourceSurveyDate && fromTitle !== fromResourceSurveyDate) return undefined;
  if (fromTitle && fromDatasetSurveyDate && fromTitle !== fromDatasetSurveyDate) return undefined;
  return fromTitle ?? fromResourceSurveyDate ?? fromDatasetSurveyDate;
}

function catalogStatisticsCode(dataset) {
  for (const value of [
    dataset.STAT_NAME?.["@code"],
    dataset.STATISTICS_NAME?.["@code"],
    dataset.STATISTICS_CODE,
    dataset.STATS_CODE,
    dataset.STAT_CODE,
    dataset.STATISTICS_ID,
  ]) {
    if (value === undefined || value === null || text(value) === "") continue;
    const candidate = text(value);
    invariant(
      /^\d{5,16}$/.test(candidate),
      "actuals-catalog-statistics-code-invalid",
      "e-Stat actual-table catalog statistic code is invalid.",
    );
    return candidate;
  }
  return undefined;
}

function periodFromWorkbook(row) {
  const year = normalized(row?.[5]);
  const month = normalized(row?.[6]);
  const period = parsePeriod(`${year}${month}`);
  invariant(period, "actuals-workbook-period-invalid", "Actual-table workbook period is invalid.");
  return period;
}

function parsePeriod(value) {
  const candidate = normalized(value);
  const era = candidate.match(/令和(\d+)年(0?[1-9]|1[0-2])月/);
  if (era) return `${String(2018 + Number(era[1]))}-${String(Number(era[2])).padStart(2, "0")}`;
  const heisei = candidate.match(/平成(\d+)年(0?[1-9]|1[0-2])月/);
  if (heisei)
    return `${String(1988 + Number(heisei[1]))}-${String(Number(heisei[2])).padStart(2, "0")}`;
  const showa = candidate.match(/昭和(\d+)年(0?[1-9]|1[0-2])月/);
  if (showa)
    return `${String(1925 + Number(showa[1]))}-${String(Number(showa[2])).padStart(2, "0")}`;
  const western = candidate.match(/(20\d{2})年(0?[1-9]|1[0-2])月/);
  if (western) return `${western[1]}-${String(Number(western[2])).padStart(2, "0")}`;
  const compact = candidate.match(/(20\d{2})(0[1-9]|1[0-2])/);
  return compact ? `${compact[1]}-${compact[2]}` : undefined;
}

function validIsoDate(value) {
  if (typeof value !== "string") return false;
  if (/^\d{8}$/.test(value)) {
    const normalizedDate = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return Number.isFinite(Date.parse(normalizedDate));
  }
  return /^\d{4}-\d{2}-\d{2}(?:[ T].+)?$/.test(value) && Number.isFinite(Date.parse(value));
}

function currentMonth(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildSnapshotCsv(period, values) {
  return [
    "series,年月,value,unit,target,revision",
    ...values.map(({ series, value, unit, target }) =>
      [series, period, value, unit, target, "確報"].join(","),
    ),
    "",
  ].join("\n");
}

async function validatePeriodAdvance(
  root,
  period,
  csv,
  sourceSha256,
  { check = false, approveActualsRevision } = {},
) {
  const [metadataResult, csvResult] = await Promise.allSettled([
    readFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.metadata), "utf8"),
    readFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.csv)),
  ]);
  const bothMissing = [metadataResult, csvResult].every(
    (result) => result.status === "rejected" && result.reason?.code === "ENOENT",
  );
  if (bothMissing) {
    invariant(
      approveActualsRevision === undefined,
      "actuals-revision-approval-unused",
      "A same-period revision approval was supplied before a snapshot existed.",
    );
    return emptyRevisionAudit();
  }
  if (metadataResult.status !== "fulfilled" || csvResult.status !== "fulfilled")
    throw new RefreshError(
      "actuals-current-state-invalid",
      "Current actual snapshot is incomplete.",
    );
  let currentMetadata;
  try {
    currentMetadata = JSON.parse(metadataResult.value);
  } catch {
    throw new RefreshError(
      "actuals-current-state-invalid",
      "Current actual snapshot metadata is invalid.",
    );
  }
  const currentCsv = csvResult.value;
  const previousPeriod = currentMetadata?.period;
  invariant(
    typeof previousPeriod === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(previousPeriod),
    "actuals-current-state-invalid",
    "Current actual snapshot metadata has an invalid period.",
  );
  invariant(
    /^[a-f0-9]{64}$/.test(currentMetadata.normalizedCsvSha256 ?? "") &&
      DIGEST(currentCsv) === currentMetadata.normalizedCsvSha256,
    "actuals-current-state-invalid",
    "Current actual snapshot metadata does not match the published CSV.",
  );
  invariant(
    period >= previousPeriod,
    "actuals-period-regression",
    "Latest confirmed actual-table period is older than the currently published snapshot.",
  );
  const oldValues = parseSnapshotCsv(currentCsv.toString("utf8"), previousPeriod);
  const nextValues = parseSnapshotCsv(csv, period);
  const changedSample = [...nextValues].flatMap(([series, next]) => {
    const previous = oldValues.get(series);
    return previous?.value === next.value && previous?.unit === next.unit
      ? []
      : [{ series, month: period, oldValue: previous?.value, newValue: next.value }];
  });
  const audit = {
    overlapCount: period === previousPeriod ? nextValues.size : 0,
    comparedObservationCount: period === previousPeriod ? nextValues.size : 0,
    changedObservationCount: period === previousPeriod ? changedSample.length : 0,
    changedValueCount: period === previousPeriod ? changedSample.length : 0,
    changedSample: period === previousPeriod ? changedSample : [],
  };
  if (period > previousPeriod) {
    invariant(
      approveActualsRevision === undefined,
      "actuals-revision-approval-period-mismatch",
      "Same-period revision approval does not match the latest confirmed period.",
    );
    return audit;
  }
  if (!changedSample.length) {
    invariant(
      approveActualsRevision === undefined,
      "actuals-revision-approval-unused",
      "No same-period value changes were found for the supplied revision approval.",
    );
    return audit;
  }
  if (check) {
    invariant(
      approveActualsRevision === undefined,
      "actuals-revision-approval-check-only",
      "A same-period revision approval may only be used for a normal publish.",
    );
    return {
      ...audit,
      approvalRequired: true,
      approval: { period, sourceSha256 },
    };
  }
  invariant(
    approveActualsRevision?.period === period &&
      approveActualsRevision?.sourceSha256 === sourceSha256,
    "actuals-same-period-revision-approval-required",
    "Changed confirmed values require an explicit matching-period and matching-workbook-SHA publish approval.",
  );
  return { ...audit, approved: true, approval: { period, sourceSha256 } };
}

function emptyRevisionAudit() {
  return {
    overlapCount: 0,
    comparedObservationCount: 0,
    changedObservationCount: 0,
    changedValueCount: 0,
    changedSample: [],
  };
}

function parseSnapshotCsv(csv, expectedPeriod) {
  const lines = csv.trim().split(/\r?\n/);
  invariant(
    lines.length === SERIES.length + 1 && lines[0] === "series,年月,value,unit,target,revision",
    "actuals-current-state-invalid",
    "Actual snapshot CSV does not contain the expected rows.",
  );
  const values = new Map();
  for (const line of lines.slice(1)) {
    const [series, period, rawValue, unit, target, revision] = line.split(",");
    const contract = SERIES.find((item) => item.series === series);
    invariant(
      contract &&
        period === expectedPeriod &&
        unit === contract.unit &&
        target === contract.target &&
        revision === "確報" &&
        Number.isFinite(Number(rawValue)) &&
        !values.has(series),
      "actuals-current-state-invalid",
      "Actual snapshot CSV contains an invalid or duplicate series.",
    );
    values.set(series, { value: Number(rawValue), unit });
  }
  invariant(
    values.size === SERIES.length,
    "actuals-current-state-invalid",
    "Actual snapshot CSV is missing a required series.",
  );
  return values;
}
