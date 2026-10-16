import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import XLSX from "xlsx";
import Papa from "papaparse";
import { RefreshError, invariant } from "../lib/errors.mjs";
import { fetchOfficialFile, OFFICIAL_ESTAT_FILE_HOSTS } from "../transport/file.mjs";

const STAT_INF_ID = "000031831366";
const METADATA_PATH = "data/source/population_statistics.metadata.json";
const CSV_PATH = "data/source/population_statistics.csv";
const SOURCE_URL = `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${STAT_INF_ID}`;
const EXPECTED_SHEET = "原数値";
const OPTIONAL_SHEETS = new Set(["原数値 (沖縄県除く1968-1972)", "※注_Notes"]);
const SOURCE_CONTRACT = Object.freeze({
  statInfId: STAT_INF_ID,
  tableId: "1-b-1",
  title: "15歳以上人口（年齢階級（10歳階級）別）",
  frequency: "monthly",
  unit: "万人",
  baseline: "not-applicable",
  series: "nationwide-original-values",
});

export async function populationAdapter({
  source,
  root = process.cwd(),
  now = () => new Date(),
  fetchFile = fetchOfficialFile,
} = {}) {
  validateIdentity(source);

  const metadataPath = path.join(root, METADATA_PATH);
  let previousMetadata;
  try {
    previousMetadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch {
    throw new RefreshError(
      "population-metadata-invalid",
      "Population source metadata is missing or invalid.",
    );
  }
  validateMetadata(previousMetadata);
  let retainedWorkbook;
  try {
    retainedWorkbook = await readFile(path.join(root, previousMetadata.file));
  } catch {
    throw new RefreshError(
      "population-retained-source-missing",
      "The retained population workbook is missing.",
    );
  }
  invariant(
    retainedWorkbook.byteLength === previousMetadata.fileSizeBytes &&
      sha256(retainedWorkbook) === previousMetadata.sha256,
    "population-retained-source-mismatch",
    "Population metadata does not match the retained local workbook.",
  );

  const { bytes, contentType } = await fetchFile({
    url: SOURCE_URL,
    allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
  });
  const normalizedContentType = validateWorkbookMediaType(contentType);
  const sourceHash = sha256(bytes);

  const { rows, headers, sheetCount } = readPopulationWorkbook(bytes);
  const observations = readRuntimeObservations(rows);
  const coverage = validateCoverage(observations);
  validateCoverageAgainstBaseline(coverage, previousMetadata.period);
  const priorObservations = await readPriorObservations(
    root,
    previousMetadata.verifiedObservations,
  );
  const retrievedAt = now().toISOString();
  const revisionAudit = {
    ...auditVerifiedObservations(observations, priorObservations),
    previousSha256: previousMetadata.lastFetchedSource?.sha256 ?? previousMetadata.sha256,
    currentSha256: sourceHash,
    previousRetrievedAt:
      previousMetadata.lastFetchedSource?.retrievedAt ?? previousMetadata.retrievedAt ?? null,
    retrievedAt,
  };
  const csv = buildConverterCsv(rows, headers);
  validateCsv(csv, rows, headers, coverage, observations);
  const resultHash = sha256(Buffer.from(csv, "utf8"));
  const metadata = {
    ...previousMetadata,
    sourceUrl: SOURCE_URL,
    ...SOURCE_CONTRACT,
    baselineDefinition: SOURCE_CONTRACT.baseline,
    file: "data/source/economics_source/lt01-b10.xlsx",
    lastFetchedSource: {
      sourceUrl: SOURCE_URL,
      sha256: sourceHash,
      fileSizeBytes: bytes.byteLength,
      contentType: normalizedContentType,
      retrievedAt,
    },
    resultSha256: resultHash,
    period: { start: coverage.start, end: coverage.end, monthlyRows: coverage.monthlyRows },
    baselineEvidence: previousMetadata.baselineEvidence ?? {
      sha256: previousMetadata.sha256,
      period: previousMetadata.period,
      verifiedObservations: previousMetadata.verifiedObservations,
    },
    revisionAudit,
  };

  return {
    artifacts: [
      { path: CSV_PATH, bytes: Buffer.from(csv, "utf8") },
      { path: METADATA_PATH, bytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8") },
    ],
    semanticValue: {
      statInfId: STAT_INF_ID,
      tableId: "1-b-1",
      frequency: SOURCE_CONTRACT.frequency,
      unit: SOURCE_CONTRACT.unit,
      baseline: SOURCE_CONTRACT.baseline,
      series: SOURCE_CONTRACT.series,
      period: coverage,
      resultSha256: resultHash,
    },
    rawFetches: [{ name: "population-xlsx", bytes }],
    coverage,
    revisionAudit: { population: revisionAudit },
    validationSummary: {
      sheetCount,
      monthlyRows: coverage.monthlyRows,
      verifiedObservations: Object.keys(previousMetadata.verifiedObservations).length,
      overlapCompared: revisionAudit.comparedObservationCount,
      revisedObservations: revisionAudit.changedObservationCount,
    },
  };
}

function validateIdentity(source) {
  invariant(
    source?.identity?.kind === "file" &&
      source.identity.statInfId === STAT_INF_ID &&
      source.identity.format === "xlsx" &&
      source.title ===
        "Labor Force Survey table 1-b-1, nationwide monthly population aged 15 or older" &&
      JSON.stringify(source.classifications) ===
        JSON.stringify(["total population aged 15 or older"]) &&
      source.frequency === SOURCE_CONTRACT.frequency &&
      source.unit === SOURCE_CONTRACT.unit &&
      source.baseline === SOURCE_CONTRACT.baseline &&
      source.revision === "full-history-revision-required" &&
      source.period?.from === "2004-01" &&
      source.period?.through === "latest-published",
    "population-identity-mismatch",
    "Population file identity does not match the verified statInfId.",
  );
}

function validateMetadata(metadata) {
  invariant(
    metadata && typeof metadata === "object",
    "population-metadata-invalid",
    "Population metadata is invalid.",
  );
  invariant(
    metadata.statInfId === STAT_INF_ID &&
      metadata.tableId === "1-b-1" &&
      metadata.sourceUrl === SOURCE_URL &&
      metadata.file === "data/source/economics_source/lt01-b10.xlsx" &&
      Number.isInteger(metadata.fileSizeBytes) &&
      metadata.fileSizeBytes > 0 &&
      metadata.title === SOURCE_CONTRACT.title &&
      metadata.unit === "万人" &&
      (metadata.frequency === undefined || metadata.frequency === SOURCE_CONTRACT.frequency) &&
      (metadata.baselineDefinition === undefined ||
        metadata.baselineDefinition === SOURCE_CONTRACT.baseline) &&
      typeof metadata.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(metadata.sha256) &&
      metadata.verifiedObservations &&
      typeof metadata.verifiedObservations === "object" &&
      Object.keys(metadata.verifiedObservations).length >= 2,
    "population-metadata-contract-mismatch",
    "Population metadata does not contain the verified source identity, unit, hash, and observations.",
  );
  for (const [period, value] of Object.entries(metadata.verifiedObservations)) {
    invariant(
      /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && Number.isInteger(value) && value > 0,
      "population-metadata-contract-mismatch",
      "Population metadata contains an invalid verified observation.",
    );
  }
  if (metadata.period !== undefined) validateBaselinePeriod(metadata.period);
  if (metadata.lastFetchedSource !== undefined) {
    invariant(
      metadata.lastFetchedSource?.sourceUrl === SOURCE_URL &&
        /^[a-f0-9]{64}$/.test(metadata.lastFetchedSource.sha256 ?? "") &&
        Number.isInteger(metadata.lastFetchedSource.fileSizeBytes) &&
        metadata.lastFetchedSource.fileSizeBytes > 0 &&
        typeof metadata.lastFetchedSource.retrievedAt === "string" &&
        [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/octet-stream",
          "application/zip",
        ].includes(metadata.lastFetchedSource.contentType),
      "population-metadata-contract-mismatch",
      "Population metadata contains invalid last-fetch evidence.",
    );
  }
  if (metadata.baselineEvidence !== undefined) {
    invariant(
      metadata.baselineEvidence &&
        /^[a-f0-9]{64}$/.test(metadata.baselineEvidence.sha256 ?? "") &&
        metadata.baselineEvidence.verifiedObservations &&
        typeof metadata.baselineEvidence.verifiedObservations === "object" &&
        Object.keys(metadata.baselineEvidence.verifiedObservations).length >= 2,
      "population-metadata-contract-mismatch",
      "Population metadata contains invalid preserved baseline evidence.",
    );
    if (metadata.baselineEvidence.period) validateBaselinePeriod(metadata.baselineEvidence.period);
  }
}

function validateBaselinePeriod(period) {
  const [year, month] = /^\d{4}-(\d{2})$/.test(period?.end ?? "")
    ? [Number(period.end.slice(0, 4)), Number(period.end.slice(5, 7))]
    : [0, 0];
  invariant(
    period &&
      period.start === "2004-01" &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(period.end) &&
      period.end >= period.start &&
      Number.isInteger(period.monthlyRows) &&
      period.monthlyRows === (year - 2004) * 12 + month,
    "population-metadata-contract-mismatch",
    "Population metadata contains an invalid baseline coverage period.",
  );
}

function validateWorkbookMediaType(contentType) {
  const mediaType =
    typeof contentType === "string" ? contentType.split(";", 1)[0].trim().toLowerCase() : "";
  invariant(
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
      "application/zip",
    ].includes(mediaType),
    "population-workbook-invalid",
    "Population download does not have an accepted XLSX media type.",
  );
  return mediaType;
}

function validateCoverageAgainstBaseline(coverage, baseline) {
  if (!baseline) return;
  validateBaselinePeriod(baseline);
  invariant(
    coverage.start === baseline.start &&
      coverage.end >= baseline.end &&
      coverage.monthlyRows >= baseline.monthlyRows,
    "population-coverage-regression",
    "Population source coverage regressed from the previously verified monthly range.",
  );
}

async function readPriorObservations(root, verifiedObservations) {
  let csv;
  try {
    csv = await readFile(path.join(root, CSV_PATH), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  let prior = new Map();
  if (csv) {
    const parsed = Papa.parse(csv, { header: false });
    invariant(
      !parsed.errors.length,
      "population-metadata-contract-mismatch",
      "Existing population CSV baseline cannot be parsed for revision comparison.",
    );
    prior = readRuntimeObservationsFromCsv(parsed.data);
  }
  for (const [period, value] of Object.entries(verifiedObservations)) {
    if (!prior.has(period)) prior.set(period, value);
  }
  return prior;
}

function auditVerifiedObservations(observations, priorObservations) {
  const overlap = [...priorObservations].filter(([period]) => observations.has(period));
  const revisions = overlap
    .filter(([period, previous]) => observations.get(period) !== previous)
    .map(([period, previous]) => ({ period, previous, current: observations.get(period) }));
  return {
    comparedObservationCount: overlap.length,
    changedObservationCount: revisions.length,
    changedSample: revisions.slice(0, 10),
  };
}

function readPopulationWorkbook(bytes) {
  let workbook;
  try {
    workbook = XLSX.read(bytes, { type: "buffer" });
  } catch {
    throw new RefreshError(
      "population-workbook-invalid",
      "Population source is not a readable XLSX workbook.",
    );
  }
  const sheetNames = workbook.SheetNames;
  invariant(
    Array.isArray(sheetNames) &&
      sheetNames.length > 0 &&
      sheetNames[0] === EXPECTED_SHEET &&
      new Set(sheetNames).size === sheetNames.length &&
      sheetNames.slice(1).every((name) => OPTIONAL_SHEETS.has(name)),
    "population-workbook-contract-mismatch",
    "Population workbook sheets do not match the verified original-series sheet contract.",
  );
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[EXPECTED_SHEET], { header: 1 });
  const title = rows[0]?.[4];
  const englishTitle = rows[1]?.[4];
  invariant(
    typeof title === "string" &&
      /長期時系列表１.*ｂ－１/.test(title) &&
      title.includes("15歳以上人口") &&
      title.includes("全国、月別結果") &&
      typeof englishTitle === "string" &&
      /Historical data 1\s+b-1/.test(englishTitle) &&
      /Whole Japan, Monthly Data/.test(englishTitle),
    "population-workbook-contract-mismatch",
    "Population workbook title does not match nationwide monthly table 1-b-1.",
  );
  const header = rows[6] ?? [];
  const qualifier = rows[7] ?? [];
  const units = rows[3] ?? [];
  invariant(
    header[0] === "年　月" &&
      header[4] === "総数" &&
      qualifier[0] === "Year and month " &&
      rows[8]?.[4] === "Total" &&
      units[4] === "(万人)",
    "population-workbook-contract-mismatch",
    "Population workbook headers or unit do not match the verified mapping.",
  );
  const columnCount = Math.max(rows[6]?.length ?? 0, rows[7]?.length ?? 0, rows[8]?.length ?? 0);
  invariant(
    columnCount === 31,
    "population-workbook-contract-mismatch",
    "Population workbook column count changed.",
  );
  return { rows, headers: buildHeaders(rows, columnCount), sheetCount: sheetNames.length };
}

function buildHeaders(rows, columnCount) {
  const seen = new Map();
  return Array.from({ length: columnCount }, (_, index) => {
    const raw = rows[6]?.[index];
    let name = raw == null || String(raw).trim() === "" ? `Unnamed: ${index}` : String(raw);
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) name = `${name}.${count}`;
    return name;
  });
}

function buildConverterCsv(rows, headers) {
  const lines = [headers.map(escapeCsv).join(",")];
  const columnCount = headers.length;
  for (let index = 7; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    lines.push(
      Array.from({ length: columnCount }, (_, column) =>
        escapeCsv(column < row.length ? row[column] : null),
      ).join(","),
    );
  }
  return `\ufeff${lines.join("\n")}\n`;
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  return /[,"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function readRuntimeObservations(rows) {
  const observations = new Map();
  let year = 0;
  for (let index = 10; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const yearValue = row[0];
    if (yearValue != null && String(yearValue).trim() !== "") {
      const match = String(yearValue)
        .trim()
        .match(/(\d{4})|(\d+)年/);
      if (match) {
        if (match[1]) year = Number(match[1]);
        else {
          const eraYear = Number(match[2]);
          const eraOffset = String(yearValue).includes("令和")
            ? 2018
            : String(yearValue).includes("平成")
              ? 1988
              : String(yearValue).includes("昭和")
                ? 1925
                : 0;
          year = eraOffset ? eraOffset + eraYear : eraYear;
        }
      }
    }
    if (year < 2004) continue;
    const monthMatch = String(row[1] ?? "")
      .trim()
      .match(/(\d+)月/);
    const total = row[4];
    if (!monthMatch || typeof total !== "number" || !Number.isInteger(total) || total <= 0)
      continue;
    const month = Number(monthMatch[1]);
    if (month < 1 || month > 12) continue;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    invariant(
      !observations.has(period),
      "population-coverage-invalid",
      `Population workbook contains duplicate ${period} observations.`,
    );
    observations.set(period, total);
  }
  return observations;
}

function validateCoverage(observations) {
  const periods = [...observations.keys()].sort();
  invariant(
    periods.length > 0,
    "population-coverage-invalid",
    "Population workbook has no runtime observations.",
  );
  const start = periods[0];
  const end = periods.at(-1);
  invariant(
    start === "2004-01",
    "population-coverage-invalid",
    "Population runtime coverage must begin in 2004-01.",
  );
  let [year, month] = start.split("-").map(Number);
  for (const period of periods) {
    invariant(
      period === `${year}-${String(month).padStart(2, "0")}`,
      "population-coverage-invalid",
      "Population monthly runtime coverage has a gap or duplicate.",
    );
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return { start, end, monthlyRows: periods.length };
}

function validateCsv(csv, rows, headers, coverage, expectedObservations) {
  invariant(
    csv.startsWith("\ufeff") && csv.endsWith("\n"),
    "population-output-invalid",
    "Population CSV is missing the converter BOM or trailing newline.",
  );
  const lines = csv.slice(1).split("\n");
  const outputRowCount = lines.length - 1; // split() adds one empty item for the required final newline.
  invariant(
    outputRowCount === rows.length - 6,
    "population-output-invalid",
    "Population CSV row count does not match the converter output.",
  );
  invariant(
    lines[0] === headers.map(escapeCsv).join(","),
    "population-output-invalid",
    "Population CSV header does not match the converter output.",
  );
  invariant(
    coverage.monthlyRows > 0,
    "population-output-invalid",
    "Population CSV contains no validated runtime coverage.",
  );
  const parsed = Papa.parse(csv, { header: false, skipEmptyLines: false });
  invariant(
    !parsed.errors.length,
    "population-output-invalid",
    "Population CSV could not be parsed in memory.",
  );
  const actualObservations = readRuntimeObservationsFromCsv(parsed.data);
  invariant(
    actualObservations.size === expectedObservations.size &&
      [...expectedObservations].every(
        ([period, value]) => actualObservations.get(period) === value,
      ),
    "population-output-invalid",
    "Population CSV runtime observations do not match the workbook input.",
  );
}

function readRuntimeObservationsFromCsv(rows) {
  const observations = new Map();
  let year = 0;
  for (let index = 4; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const yearValue = String(row[0] ?? "").trim();
    if (yearValue) {
      const match = yearValue.match(/(\d{4})|(\d+)年/);
      if (match) {
        if (match[1]) year = Number(match[1]);
        else {
          const eraYear = Number(match[2]);
          const eraOffset = yearValue.includes("令和")
            ? 2018
            : yearValue.includes("平成")
              ? 1988
              : yearValue.includes("昭和")
                ? 1925
                : 0;
          year = eraOffset ? eraOffset + eraYear : eraYear;
        }
      }
    }
    if (year < 2004) continue;
    const monthMatch = String(row[1] ?? "")
      .trim()
      .match(/(\d+)月/);
    const totalText = String(row[4] ?? "")
      .trim()
      .replaceAll(",", "");
    if (!monthMatch || !totalText || totalText === "-" || totalText === "…") continue;
    const total = Number(totalText);
    const month = Number(monthMatch[1]);
    if (!Number.isInteger(total) || total <= 0 || month < 1 || month > 12) continue;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    invariant(
      !observations.has(period),
      "population-output-invalid",
      `Population CSV contains duplicate ${period} observations.`,
    );
    observations.set(period, total);
  }
  return observations;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
