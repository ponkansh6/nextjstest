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

  const { bytes } = await fetchFile({ url: SOURCE_URL, allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS });
  const sourceHash = sha256(bytes);
  if (sourceHash !== previousMetadata.sha256) {
    throw provenanceMismatch(
      "Downloaded workbook hash does not match the locally verified source hash.",
    );
  }

  const { rows, headers, sheetCount } = readPopulationWorkbook(bytes);
  const observations = readRuntimeObservations(rows);
  for (const [period, expected] of Object.entries(previousMetadata.verifiedObservations)) {
    if (observations.get(period) !== expected) {
      throw provenanceMismatch(
        `Downloaded workbook does not match the verified ${period} observation.`,
      );
    }
  }

  const coverage = validateCoverage(observations);
  const csv = buildConverterCsv(rows, headers);
  validateCsv(csv, rows, headers, coverage, observations);
  const resultHash = sha256(Buffer.from(csv, "utf8"));
  const retrievedAt = now().toISOString();
  const metadata = {
    ...previousMetadata,
    sourceUrl: SOURCE_URL,
    statInfId: STAT_INF_ID,
    tableId: "1-b-1",
    title: "15歳以上人口（年齢階級（10歳階級）別）",
    unit: "万人",
    retrievedAt,
    file: "data/source/economics_source/lt01-b10.xlsx",
    fileSizeBytes: bytes.byteLength,
    sha256: sourceHash,
    resultSha256: resultHash,
    period: { start: coverage.start, end: coverage.end, monthlyRows: coverage.monthlyRows },
  };

  return {
    artifacts: [
      { path: CSV_PATH, bytes: Buffer.from(csv, "utf8") },
      { path: METADATA_PATH, bytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8") },
    ],
    semanticValue: {
      statInfId: STAT_INF_ID,
      tableId: "1-b-1",
      period: coverage,
      resultSha256: resultHash,
    },
    rawFetches: [{ name: "population-xlsx", bytes }],
    coverage,
    validationSummary: {
      sheetCount,
      monthlyRows: coverage.monthlyRows,
      verifiedObservations: Object.keys(previousMetadata.verifiedObservations).length,
    },
  };
}

function validateIdentity(source) {
  invariant(
    source?.identity?.kind === "file" &&
      source.identity.statInfId === STAT_INF_ID &&
      source.identity.format === "xlsx",
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
      metadata.unit === "万人" &&
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
      /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && Number.isFinite(value) && value > 0,
      "population-metadata-contract-mismatch",
      "Population metadata contains an invalid verified observation.",
    );
  }
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
  invariant(
    workbook.SheetNames?.[0] === EXPECTED_SHEET,
    "population-workbook-contract-mismatch",
    "Population workbook first sheet does not match the verified original-series sheet.",
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
  return { rows, headers: buildHeaders(rows, columnCount), sheetCount: workbook.SheetNames.length };
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
    if (!monthMatch || typeof total !== "number" || !Number.isFinite(total) || total <= 0) continue;
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
    const total = Number.parseFloat(totalText);
    const month = Number(monthMatch[1]);
    if (!Number.isFinite(total) || total <= 0 || month < 1 || month > 12) continue;
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

function provenanceMismatch(message) {
  return new RefreshError("population-source-provenance-mismatch", message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
