import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";
import Papa from "papaparse";
import { invariant, RefreshError } from "../lib/errors.mjs";
import { fetchOfficialFile, OFFICIAL_ESTAT_FILE_HOSTS } from "../transport/file.mjs";

export const EARNINGS_SOURCE_ID = "000032189777";
export const EARNINGS_SOURCE_URL = `https://www.e-stat.go.jp/stat-search/file-download?fileKind=1&statInfId=${EARNINGS_SOURCE_ID}`;
export const EARNINGS_CLASSIFICATIONS = Object.freeze({
  type: "指数",
  industry: "TL",
  establishmentSize: "T",
  employmentType: "0",
});
export const EARNINGS_HEADERS = Object.freeze([
  "種別",
  "年",
  "月",
  "産業分類",
  "規模",
  "就業形態",
  "現金給与総額",
  "きまって支給する給与",
  "所定内給与",
  "所定外給与",
  "特別給与",
  "実質賃金指数（現金給与総額）",
  "実質賃金指数（きまって支給する給与）",
  "総実労働時間",
  "所定内労働時間",
  "所定外労働時間",
  "出勤日数",
  "常用雇用",
  "パートタイム労働者比率",
  "入職率",
  "離職率",
]);
export const EARNINGS_VALUE_COLUMNS = Object.freeze({
  total_earning: 6,
  contractual_earnings: 7,
  scheduled_earnings: 8,
  total_worked_hours: 13,
  employment_indices: 17,
  part_time_worker_ratio: 18,
});

const OUTPUT_PATHS = Object.freeze({
  total_earning: "data/source/total_earning.csv",
  contractual_earnings: "data/source/contractual_earnings.csv",
  scheduled_earnings: "data/source/scheduled_earnings.csv",
  total_worked_hours: "data/source/total_worked_hours.csv",
  employment_indices: "data/source/employment_indices.csv",
  part_time_worker_ratio: "data/source/part_time_worker_ratio.csv",
});
const METADATA_PATHS = Object.freeze({
  employment_indices: "data/source/employment_indices.metadata.json",
  part_time_worker_ratio: "data/source/part_time_worker_ratio.metadata.json",
});
const VERIFIED_PRE_MIGRATION_MONTHS = 438;
const VERIFIED_ANNUAL_ROUNDING_CASES = Object.freeze({ total_earning: new Set(["1991", "2010"]) });
const ANNUAL_ROUNDING_RULE = "official-cy-upper-rounding-at-monthly-midpoint";
const ANNUAL_PRECISION_RULE = "official-cy-matches-monthly-mean-at-higher-precision";
const YEAR_HEADERS = Object.freeze([
  "年",
  "1-12",
  "1-6",
  "7-12",
  "1-3",
  "4-6",
  "7-9",
  "10-12",
  ...Array.from({ length: 12 }, (_, i) => String(i + 1)),
  "4-3",
]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const monthly = (period) => `${period.slice(0, 4)}-${period.slice(4)}`;

/** Parse e-Stat's Windows-31J monthly rows and official calendar-year CY rows. */
export function parseEarningsIndexCsv(
  input,
  { classifications = EARNINGS_CLASSIFICATIONS, expectedHeaders = EARNINGS_HEADERS } = {},
) {
  invariant(
    classifications &&
      typeof classifications === "object" &&
      ["type", "industry", "establishmentSize", "employmentType"].every(
        (key) => typeof classifications[key] === "string" && classifications[key].length > 0,
      ),
    "earnings-classification-unverified",
    "Verified earnings source classifications are required.",
  );
  invariant(
    Array.isArray(expectedHeaders) &&
      expectedHeaders.length === 21 &&
      expectedHeaders.every((value) => typeof value === "string" && value.trim()),
    "earnings-header-contract-unverified",
    "The complete official 21-column header contract is required.",
  );

  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  const decoded = Buffer.isBuffer(input)
    ? iconv.decode(bytes, "windows-31j")
    : bytes.toString("utf8");
  invariant(
    !decoded.includes("\uFFFD"),
    "earnings-csv-encoding-invalid",
    "Earnings source could not be decoded as Windows-31J.",
  );
  const parsed = Papa.parse(decoded.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  invariant(
    !parsed.errors?.length,
    "earnings-csv-invalid",
    "Earnings source CSV could not be parsed safely.",
  );
  invariant(
    parsed.data.length > 1,
    "earnings-csv-empty",
    "Earnings source CSV contains no records.",
  );
  const [header, ...records] = parsed.data;
  invariant(
    Array.isArray(header) &&
      header.length === 21 &&
      header.every((cell, index) => cell?.trim() === expectedHeaders[index]),
    "earnings-header-contract-mismatch",
    "Earnings source headers do not match the complete official 21-column contract.",
  );

  const observations = [];
  const annualValues = {};
  const seenAnnualYears = new Set();
  const seen = new Set();
  for (const row of records) {
    invariant(
      Array.isArray(row) && row.length === 21,
      "earnings-row-width-mismatch",
      "Earnings source record does not contain exactly 21 columns.",
    );
    if (
      row[0].trim() !== classifications.type ||
      row[3].trim() !== classifications.industry ||
      row[4].trim() !== classifications.establishmentSize ||
      row[5].trim() !== classifications.employmentType
    )
      continue;
    const year = row[1].trim();
    const month = row[2].trim();
    invariant(
      /^\d{4}$/.test(year),
      "earnings-period-invalid",
      "Earnings source contains an invalid year.",
    );
    if (month === "CY") {
      invariant(
        !seenAnnualYears.has(year),
        "earnings-duplicate-annual-period",
        "Earnings source contains duplicate CY rows for the verified classification and year.",
      );
      seenAnnualYears.add(year);
      annualValues[year] = parseEarningsValues(row);
      continue;
    }
    invariant(
      /^(0?[1-9]|1[0-2])$/.test(month),
      "earnings-period-invalid",
      "Earnings source contains an invalid monthly period.",
    );
    const period = `${year}${month.padStart(2, "0")}`;
    invariant(
      !seen.has(period),
      "earnings-duplicate-period",
      "Earnings source contains duplicate observations for the verified classification and month.",
    );
    seen.add(period);
    observations.push({ period, values: parseEarningsValues(row) });
  }
  invariant(
    observations.length > 0,
    "earnings-classification-empty",
    "Earnings source has no rows matching the verified classification.",
  );
  observations.sort((a, b) => a.period.localeCompare(b.period));
  const firstValue = observations.findIndex(({ values }) =>
    Object.values(values).some((value) => value !== null),
  );
  const lastValue = observations.findLastIndex(({ values }) =>
    Object.values(values).some((value) => value !== null),
  );
  invariant(
    firstValue >= 0 && lastValue >= firstValue,
    "earnings-values-empty",
    "Earnings source has no numeric values for the verified classification.",
  );
  observations.splice(lastValue + 1);
  observations.splice(0, firstValue);
  assertContinuousMonthlyPeriods(observations.map(({ period }) => period));
  const latest = observations.at(-1);
  for (const series of Object.keys(EARNINGS_VALUE_COLUMNS)) {
    invariant(
      latest.values[series] !== null,
      "earnings-latest-series-missing",
      `Latest source month is missing ${series}.`,
    );
  }
  return {
    statInfId: EARNINGS_SOURCE_ID,
    sourceSha256: digest(bytes),
    observations,
    annualValues,
    coverage: {
      start: observations[0].period,
      end: observations.at(-1).period,
      monthlyRows: observations.length,
    },
  };
}

export async function earningsAdapter({
  source,
  root = process.cwd(),
  now = () => new Date(),
  fetchFile = fetchOfficialFile,
} = {}) {
  invariant(
    source?.identity?.kind === "file" &&
      source.identity.statInfId === EARNINGS_SOURCE_ID &&
      source.identity.format === "csv",
    "earnings-identity-mismatch",
    "Earnings file identity does not match the verified e-Stat source.",
  );
  const fetched = await fetchFile({
    url: EARNINGS_SOURCE_URL,
    allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
  });
  const bytes = Buffer.from(fetched?.bytes ?? []);
  invariant(bytes.length > 0, "earnings-source-empty", "e-Stat earnings source returned no bytes.");
  const parsed = parseEarningsIndexCsv(bytes);
  const observations = parsed.observations;
  const revisionAudit = {};
  for (const [series, output] of Object.entries(OUTPUT_PATHS)) {
    const previousBytes = await readFile(path.join(root, output));
    const previous = parseLegacyMonthlyCsv(previousBytes, series);
    revisionAudit[series] = compareMonthlyOverlap(
      series,
      previous,
      observations,
      parsed.annualValues,
    );
  }
  invariant(
    revisionAudit.part_time_worker_ratio.overlapCount >= VERIFIED_PRE_MIGRATION_MONTHS &&
      revisionAudit.employment_indices.overlapCount >= VERIFIED_PRE_MIGRATION_MONTHS,
    "earnings-semantic-migration-coverage-mismatch",
    "The intentional earnings series correction must preserve and verify the 438-month pre-migration history.",
  );

  const stamp = now().toISOString();
  const migration = {
    kind: "employment-series-semantic-correction",
    intentional: true,
    from: { output: "employment_indices.csv", series: "part_time_worker_ratio" },
    to: { output: "part_time_worker_ratio.csv", series: "part_time_worker_ratio" },
    correctedOutput: "employment_indices.csv",
    preservedPreMigrationMonthlyRows: VERIFIED_PRE_MIGRATION_MONTHS,
    verifiedPartTimeOverlapRows: revisionAudit.part_time_worker_ratio.overlapCount,
    verifiedEmploymentOverlapRows: revisionAudit.employment_indices.overlapCount,
  };
  const csvBySeries = Object.fromEntries(
    Object.keys(OUTPUT_PATHS).map((series) => [
      series,
      Buffer.from(buildLegacyWideCsv(observations, series, parsed.annualValues), "utf8"),
    ]),
  );
  const artifacts = Object.entries(OUTPUT_PATHS).map(([series, output]) => ({
    path: output,
    bytes: csvBySeries[series],
  }));
  const monthlyStart = monthly(parsed.coverage.start);
  const monthlyEnd = monthly(parsed.coverage.end);
  for (const [series, output] of Object.entries(METADATA_PATHS)) {
    const csvPath = OUTPUT_PATHS[series];
    const unit = series === "employment_indices" ? "指数（2020年平均=100）" : "％";
    const metadata = {
      source: "e-Stat 毎月勤労統計調査 長期時系列（実数・指数累積データ）",
      sourceUrl: EARNINGS_SOURCE_URL,
      statInfId: EARNINGS_SOURCE_ID,
      sourceSha256: parsed.sourceSha256,
      extraction: {
        industry: EARNINGS_CLASSIFICATIONS.industry,
        establishmentSize: EARNINGS_CLASSIFICATIONS.establishmentSize,
        employmentType: EARNINGS_CLASSIFICATIONS.employmentType,
        sourceType: EARNINGS_CLASSIFICATIONS.type,
        unit,
        series: EARNINGS_HEADERS[EARNINGS_VALUE_COLUMNS[series]],
        sourceColumn: EARNINGS_HEADERS[EARNINGS_VALUE_COLUMNS[series]],
        sourceEncoding: "CP932",
        period: `${monthlyStart} through ${monthlyEnd}`,
        monthlyCoverage: `${monthlyStart} through ${monthlyEnd}`,
        preMonthlyCoverage:
          "1952-01 through 1989-12 is not available in the source and is represented by -",
        aggregation:
          "calendar-year average copied from official CY rows; half-year, quarter, and fiscal-year averages emitted only when every constituent month is present",
        missingDataPolicy:
          "official missing values remain missing; no zero or inferred values are introduced",
      },
      normalizedCsv: csvPath,
      normalizedCsvSha256: digest(csvBySeries[series]),
      excludedCrossSection: "data/source/hon-mks202606.xls",
      period: { start: monthlyStart, end: monthlyEnd, monthlyRows: parsed.coverage.monthlyRows },
      retrievedAt: stamp,
      revisionAudit: revisionAudit[series],
      ...(series === "employment_indices" || series === "part_time_worker_ratio"
        ? { semanticMigration: migration }
        : {}),
    };
    artifacts.push({
      path: output,
      bytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
    });
  }
  return {
    artifacts,
    semanticValue: {
      semanticFingerprintVersion: 2,
      identity: {
        kind: source.identity.kind,
        statInfId: source.identity.statInfId,
        format: source.identity.format,
        url: source.identity.url ?? EARNINGS_SOURCE_URL,
      },
      statInfId: EARNINGS_SOURCE_ID,
      sourceSha256: parsed.sourceSha256,
      coverage: parsed.coverage,
      normalizedOutputSha256: Object.fromEntries(
        Object.entries(csvBySeries).map(([series, bytes]) => [series, digest(bytes)]),
      ),
    },
    rawFetches: [{ name: "earnings-estat-csv", bytes }],
    coverage: parsed.coverage,
    validationSummary: {
      encoding: "Windows-31J",
      headerColumns: EARNINGS_HEADERS.length,
      classifications: EARNINGS_CLASSIFICATIONS,
      monthlyRows: parsed.coverage.monthlyRows,
      outputs: Object.keys(OUTPUT_PATHS).length,
      migration,
    },
    revisionAudit,
  };
}

function assertContinuousMonthlyPeriods(periods) {
  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const expected =
      String(Number(previous.slice(0, 4)) + (previous.slice(4) === "12" ? 1 : 0)) +
      String(previous.slice(4) === "12" ? 1 : Number(previous.slice(4)) + 1).padStart(2, "0");
    invariant(
      periods[index] === expected,
      "earnings-month-missing",
      `Earnings source is missing monthly observation ${expected}.`,
    );
  }
}

function parseEarningsValues(row) {
  return Object.fromEntries(
    Object.entries(EARNINGS_VALUE_COLUMNS).map(([series, column]) => {
      const raw = row[column].trim();
      invariant(
        raw === "" || raw === "-" || (Number.isFinite(Number(raw)) && Number(raw) >= 0),
        "earnings-value-invalid",
        `Earnings source contains an invalid value in ${series}.`,
      );
      const value = raw === "" || raw === "-" ? null : Number(raw);
      if (series === "employment_indices" && value !== null)
        invariant(
          value > 0,
          "earnings-value-unit-invalid",
          "Regular employment index must be positive.",
        );
      if (series === "part_time_worker_ratio" && value !== null)
        invariant(
          value <= 100,
          "earnings-value-unit-invalid",
          "Part-time worker ratio must be a percentage no greater than 100.",
        );
      return [series, value];
    }),
  );
}

function parseLegacyMonthlyCsv(bytes, series) {
  const parsed = Papa.parse(bytes.toString("utf8"), {
    skipEmptyLines: false,
    dynamicTyping: false,
  });
  invariant(
    !parsed.errors?.length && parsed.data.length > 4,
    "earnings-canonical-invalid",
    `Canonical ${series} CSV could not be parsed.`,
  );
  const headerRows = parsed.data
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row?.[0]?.trim() === "年");
  const isValidHeader = (row) =>
    Array.isArray(row) &&
    row.length === 21 &&
    row[0]?.trim() === "年" &&
    row.slice(8, 20).every((v, i) => v?.trim() === String(i + 1));
  const [firstHeader, secondHeader] = headerRows;
  invariant(
    (headerRows.length === 1 || headerRows.length === 2) &&
      isValidHeader(firstHeader?.row) &&
      (headerRows.length === 1 ||
        (isValidHeader(secondHeader?.row) &&
          firstHeader.row.every((cell, index) => cell.trim() === secondHeader.row[index].trim()))),
    "earnings-canonical-invalid",
    `Canonical ${series} CSV does not contain one valid monthly earnings header or two matching valid headers.`,
  );
  const headerIndex = firstHeader.index;
  const values = new Map();
  const annualValues = new Map();
  for (const row of parsed.data.slice(headerIndex + 1, secondHeader?.index ?? parsed.data.length)) {
    if (!row?.[0] || !/^\d{4}$/.test(row[0].trim())) continue;
    invariant(
      row.length === 21,
      "earnings-canonical-invalid",
      `Canonical ${series} year row does not contain exactly 21 columns.`,
    );
    const year = row[0].trim();
    const annualRaw = row[1]?.trim() ?? "";
    if (annualRaw !== "" && annualRaw !== "-") {
      invariant(
        Number.isFinite(Number(annualRaw)),
        "earnings-canonical-invalid",
        `Canonical ${series} contains a non-numeric annual value.`,
      );
      annualValues.set(year, Number(annualRaw));
    }
    for (let month = 1; month <= 12; month += 1) {
      const raw = row[7 + month]?.trim() ?? "";
      if (raw === "" || raw === "-") continue;
      invariant(
        Number.isFinite(Number(raw)),
        "earnings-canonical-invalid",
        `Canonical ${series} contains a non-numeric monthly value.`,
      );
      values.set(`${year}${String(month).padStart(2, "0")}`, Number(raw));
    }
  }
  return { monthlyValues: values, annualValues };
}

function compareMonthlyOverlap(series, previous, observations, sourceAnnualValues) {
  const byPeriod = new Map(observations.map((item) => [item.period, item.values[series]]));
  let overlapCount = 0;
  const revisions = [];
  for (const [period, oldValue] of previous.monthlyValues) {
    invariant(
      byPeriod.has(period),
      "earnings-prior-observation-dropped",
      `Earnings source dropped canonical ${series} observation ${period}.`,
    );
    const current = byPeriod.get(period);
    invariant(
      current !== null && current !== undefined,
      "earnings-overlap-missing",
      `Earnings source has no ${series} value for canonical month ${period}.`,
    );
    overlapCount += 1;
    if (current !== oldValue) revisions.push({ period, previous: oldValue, current });
  }
  invariant(
    revisions.length === 0,
    "earnings-overlap-revision-unverified",
    `Earnings source changed ${revisions.length} overlapping ${series} values; revision evidence is required.`,
  );
  let annualOverlapCount = 0;
  const annualRevisions = [];
  const acceptedAnnualRoundingAdjustments = [];
  for (const [year, oldValue] of previous.annualValues) {
    const current = sourceAnnualValues[year]?.[series];
    invariant(
      current !== null && current !== undefined,
      "earnings-annual-overlap-missing",
      `Earnings source has no official CY value for canonical ${series} year ${year}.`,
    );
    if (current !== oldValue) {
      const adjustment = isVerifiedAnnualRoundingAdjustment({
        series,
        year,
        oldValue,
        newValue: current,
        previousMonthlyValues: previous.monthlyValues,
        sourceByPeriod: byPeriod,
      });
      const precisionAdjustment = isVerifiedPartTimeAnnualPrecisionAdjustment({
        series,
        year,
        oldValue,
        newValue: current,
        previousMonthlyValues: previous.monthlyValues,
        sourceByPeriod: byPeriod,
      });
      if (adjustment) acceptedAnnualRoundingAdjustments.push(adjustment);
      else if (precisionAdjustment) acceptedAnnualRoundingAdjustments.push(precisionAdjustment);
      else annualRevisions.push({ year, oldValue, newValue: current });
    }
    annualOverlapCount += 1;
  }
  if (annualRevisions.length > 0) {
    const error = new RefreshError(
      "earnings-annual-overlap-revision-unverified",
      `Earnings source changed ${annualRevisions.length} overlapping ${series} CY values; revision evidence is required.`,
    );
    error.earningsAnnualOverlapDiagnostics = {
      series,
      mismatchCount: annualRevisions.length,
      sample: annualRevisions.slice(0, 5).map(({ year, oldValue, newValue }) => ({
        year,
        oldValue,
        newValue,
      })),
    };
    throw error;
  }
  return {
    overlapCount,
    annualOverlapCount,
    changedValueCount: 0,
    changedSample: [],
    acceptedAnnualRoundingAdjustmentCount: acceptedAnnualRoundingAdjustments.length,
    acceptedAnnualRoundingAdjustmentSample: acceptedAnnualRoundingAdjustments.slice(0, 5),
  };
}

function isVerifiedPartTimeAnnualPrecisionAdjustment({
  series,
  year,
  oldValue,
  newValue,
  previousMonthlyValues,
  sourceByPeriod,
}) {
  if (series !== "part_time_worker_ratio") return null;
  const oldTenths = toScaledInteger(oldValue, 1);
  const newHundredths = toScaledInteger(newValue, 2);
  if (oldTenths === null || newHundredths === null) return null;
  const periods = Array.from(
    { length: 12 },
    (_, index) => `${year}${String(index + 1).padStart(2, "0")}`,
  );
  const monthlyValues = [];
  for (const period of periods) {
    if (!previousMonthlyValues.has(period) || !sourceByPeriod.has(period)) return null;
    const canonical = previousMonthlyValues.get(period);
    const source = sourceByPeriod.get(period);
    if (canonical === null || source === null || canonical !== source) return null;
    monthlyValues.push(canonical);
  }
  const scaleDigits = Math.max(0, ...monthlyValues.map(decimalPlaces));
  if (scaleDigits > 9) return null;
  const scale = 10n ** BigInt(scaleDigits);
  const scaledMonths = monthlyValues.map((value) => toScaledInteger(value, scaleDigits));
  if (scaledMonths.some((value) => value === null)) return null;
  const sum = scaledMonths.reduce((total, value) => total + value, 0n);
  if (
    roundPositiveRatio(sum * 10n, 12n * scale) !== BigInt(oldTenths) ||
    roundPositiveRatio(sum * 100n, 12n * scale) !== BigInt(newHundredths)
  ) {
    return null;
  }
  return { series, year, oldValue, newValue, reason: ANNUAL_PRECISION_RULE };
}

function decimalPlaces(value) {
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = Number(exponentText ?? 0);
  const decimals = (coefficient.split(".")[1] ?? "").length - exponent;
  return Math.max(0, decimals);
}

function toScaledInteger(value, decimalPlacesCount) {
  if (!Number.isFinite(value) || value < 0) return null;
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = Number(exponentText ?? 0);
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const places = fraction.length - exponent;
  if (places > decimalPlacesCount) return null;
  return BigInt(digits) * 10n ** BigInt(decimalPlacesCount - places);
}

function roundPositiveRatio(numerator, denominator) {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function isVerifiedAnnualRoundingAdjustment({
  series,
  year,
  oldValue,
  newValue,
  previousMonthlyValues,
  sourceByPeriod,
}) {
  if (!VERIFIED_ANNUAL_ROUNDING_CASES[series]?.has(year)) return null;
  const toTenths = (value) => {
    const tenths = Math.round(value * 10);
    return Math.abs(value * 10 - tenths) < 1e-8 ? tenths : null;
  };
  const oldTenths = toTenths(oldValue);
  const newTenths = toTenths(newValue);
  if (oldTenths === null || newTenths !== oldTenths + 1) return null;

  const months = Array.from(
    { length: 12 },
    (_, index) => `${year}${String(index + 1).padStart(2, "0")}`,
  );
  const monthlyTenths = [];
  for (const period of months) {
    if (!previousMonthlyValues.has(period)) return null;
    const canonical = previousMonthlyValues.get(period);
    const source = sourceByPeriod.get(period);
    const canonicalTenths = toTenths(canonical);
    const sourceTenths = toTenths(source);
    if (canonicalTenths === null || sourceTenths === null || canonical !== source) return null;
    monthlyTenths.push(sourceTenths);
  }
  const sumTenths = monthlyTenths.reduce((sum, value) => sum + value, 0);
  if (sumTenths % 12 !== 6) return null;
  const lowerMidpointTenths = Math.floor(sumTenths / 12);
  if (oldTenths !== lowerMidpointTenths || newTenths !== lowerMidpointTenths + 1) return null;
  return {
    series,
    year,
    oldValue,
    newValue,
    reason: ANNUAL_ROUNDING_RULE,
  };
}

function buildLegacyWideCsv(observations, series, annualValues = {}) {
  const byPeriod = new Map(observations.map(({ period, values }) => [period, values[series]]));
  const years = [...new Set(observations.map(({ period }) => Number(period.slice(0, 4))))];
  const start = 1952;
  const end = Math.max(...years);
  const rows = [
    YEAR_HEADERS,
    [
      "year",
      "年平均",
      "上半期",
      "下半期",
      "第１四半期",
      "第２四半期",
      "第３四半期",
      "第４四半期",
      ...Array.from({ length: 12 }, (_, i) => {
        const month = String(i + 1).replace(/\d/g, (digit) =>
          String.fromCharCode(digit.charCodeAt(0) + 0xfee0),
        );
        return `${month}月`;
      }),
      "年度平均",
    ],
    [
      "",
      "year av.",
      "1st Half",
      "2nd Half",
      "1st Qr.",
      "2nd Qr.",
      "3rd Qr.",
      "4th Qr.",
      "Jan.",
      "Feb.",
      "Mar.",
      "Apr.",
      "May",
      "Jun.",
      "Jul.",
      "Aug.",
      "Sep.",
      "Oct.",
      "Nov.",
      "Dec.",
      "fiscal y. av.",
    ],
  ];
  for (let year = start; year <= end; year += 1) {
    const values = Array.from(
      { length: 12 },
      (_, i) => byPeriod.get(`${year}${String(i + 1).padStart(2, "0")}`) ?? null,
    );
    const average = (indices) => meanComplete(indices.map((index) => values[index]));
    rows.push([
      year,
      annualValues[String(year)]?.[series] ?? null,
      average([0, 1, 2, 3, 4, 5]),
      average([6, 7, 8, 9, 10, 11]),
      average([0, 1, 2]),
      average([3, 4, 5]),
      average([6, 7, 8]),
      average([9, 10, 11]),
      ...values,
      meanComplete(
        [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map(
          (month) =>
            byPeriod.get(`${month < 3 ? year + 1 : year}${String(month + 1).padStart(2, "0")}`) ??
            null,
        ),
      ),
    ]);
  }
  return `${rows.map((row) => row.map((value) => (value == null ? "-" : String(value))).join(",")).join("\n")}\n`;
}

function mean(values) {
  const present = values.filter((value) => Number.isFinite(value));
  if (present.length === 0) return null;
  return Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 10) / 10;
}

function meanComplete(values) {
  return values.length > 0 && values.every((value) => Number.isFinite(value)) ? mean(values) : null;
}
