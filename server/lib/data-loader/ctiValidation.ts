import * as fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Papa from "papaparse";
import { buildCtiFilePaths } from "../dataIo";
import { parseYearMonth } from "@/lib/yearMonth";
import { calculateQuarterLabel } from "@/lib/math/quarter";

export type CtiLoadOptions = { source?: "auto" };
export type CtiPair = {
  baseYear: 2025;
  pair: "2025";
  mainPath: string;
  supportNominalPath: string;
  supportRealPath: string;
};
export type CtiReasonCode =
  | "cti_source_missing"
  | "cti_metadata_invalid"
  | "cti_hash_mismatch"
  | "cti_schema_invalid"
  | "cti_period_invalid"
  | "cti_required_support_unavailable"
  | "cti_fail_closed";

export type CtiDataStatus = {
  baseYear: 2025 | null;
  pair: "2025" | null;
  valid: boolean;
  reason?: CtiReasonCode;
};

export function isContinuousMonths(months: string[]): boolean {
  return months.every((month, index) => {
    const first = parseYearMonth(month);
    if (index === 0) return Boolean(first && first.month >= 1 && first.month <= 12);
    const previous = parseYearMonth(months[index - 1]);
    const current = parseYearMonth(month);
    return Boolean(
      previous &&
      current &&
      current.month >= 1 &&
      current.month <= 12 &&
      current.year * 12 + current.month === previous.year * 12 + previous.month + 1,
    );
  });
}

function isContinuousQuarterLabels(labels: string[]): boolean {
  return labels.every((label, index) => {
    const current = label.match(/^(\d{4})Q([1-4])$/);
    if (!current) return false;
    if (index === 0) return true;
    const previous = labels[index - 1].match(/^(\d{4})Q([1-4])$/);
    return Boolean(
      previous &&
      Number(current[1]) * 4 + Number(current[2]) ===
        Number(previous[1]) * 4 + Number(previous[2]) + 1,
    );
  });
}

const OFFICIAL_QUARTERLY_WORKBOOK_PATH =
  "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx";
const OFFICIAL_QUARTERLY_COLUMN_MAPPING = [
  { column: "B", header: null, canonicalSeries: "period", sourceRole: "coded_period" },
  { column: "H", header: "時間軸コード", canonicalSeries: "period", sourceRole: "period_code" },
  { column: "I", header: "四半期平均", canonicalSeries: "period", sourceRole: "period_label" },
  ...[
    "総合",
    "食料",
    "住居",
    "光熱・水道",
    "家具・家事用品",
    "被服及び履物",
    "保健医療",
    "交通・通信",
    "教育",
    "教養娯楽",
  ].map((category, index) => ({
    column: String.fromCharCode("J".charCodeAt(0) + index),
    header: `${category === "総合" ? "消費支出" : category}（名目）`,
    canonicalSeries: category,
    normalizedColumn: category,
    sourceRole: category === "総合" ? "official_total" : "official_nominal_observation",
  })),
  {
    column: "T",
    header: "その他の消費支出（名目）",
    canonicalSeries: "その他の消費支出",
    normalizedColumn: "その他の消費支出",
    sourceRole: "unpublished_derived_residual",
    sourceValue: "-",
    derivation: "J (official total) minus K:S (nine official nominal categories)",
  },
];

export function validateCtiLegacySupport(content: string): string | Map<string, number> {
  const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data;
  const headerIndex = rows.findIndex(
    (row) => row.includes("時間軸（四半期）") && row.includes("民間最終消費支出"),
  );
  if (headerIndex < 0) return "missing CTI support period or series header";
  const header = rows[headerIndex].map((cell) => cell.trim());
  const periodIndex = header.indexOf("時間軸（四半期）");
  const valueIndex = header.indexOf("民間最終消費支出");
  const values = new Map<string, number>();
  for (const row of rows.slice(headerIndex + 1)) {
    const rawPeriod = row[periodIndex]?.trim();
    if (!rawPeriod) return "invalid or duplicate CTI support period";
    const periodMatch = rawPeriod.match(/^(\d{4})年(1～3|4～6|7～9|10～12)月期$/);
    if (!periodMatch) return "invalid or duplicate CTI support period";
    const period = calculateQuarterLabel(
      Number(periodMatch[1]),
      ["1～3", "4～6", "7～9", "10～12"].indexOf(periodMatch[2]) + 1,
    );
    if (values.has(period)) return "invalid or duplicate CTI support period";
    const rawValue = row[valueIndex]?.trim();
    const value = Number(rawValue?.replace(/,/g, ""));
    if (!rawValue || rawValue === "-" || !Number.isFinite(value))
      return "invalid CTI support value";
    values.set(period, value);
  }
  if (values.size === 0) return "CTI support contains no values";
  const supportPeriods = [...values.keys()];
  if (
    supportPeriods.some((period, index) => {
      if (index === 0) return false;
      const previous = supportPeriods[index - 1].match(/^(\d{4})年(\d+)～/);
      const current = period.match(/^(\d{4})年(\d+)～/);
      return (
        !previous ||
        !current ||
        Number(current[1]) * 4 + Math.ceil(Number(current[2]) / 3) !==
          Number(previous[1]) * 4 + Math.ceil(Number(previous[2]) / 3) + 1
      );
    })
  )
    return "CTI support periods are not continuous";
  return values;
}

export function validateCtiLegacySupportPair(
  nominalContent: string,
  realContent: string,
): string | { nominal: Map<string, number>; real: Map<string, number> } {
  const nominal = validateCtiLegacySupport(nominalContent);
  const real = validateCtiLegacySupport(realContent);
  if (typeof nominal === "string") return nominal;
  if (typeof real === "string") return real;
  if (nominal.size !== real.size || [...nominal.keys()].some((period) => !real.has(period)))
    return "CTI nominal/real support period set mismatch";
  return { nominal, real };
}

export function validateCtiMetadata(
  metadataPath: string,
  expectedFile: string,
): string | Record<string, unknown> {
  if (!fs.existsSync(metadataPath)) return "missing metadata";
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
    const declaredFile = metadata.indexFile ?? metadata.outputFile ?? metadata.file;
    if (metadata.status !== "ready" || metadata.baseYear !== 2025)
      return "metadata is not ready for 2025";
    if (declaredFile !== expectedFile) return "metadata file pairing mismatch";
    if (typeof metadata.csvSha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.csvSha256))
      return "metadata SHA-256 is missing or invalid";
    return metadata;
  } catch {
    return "invalid metadata";
  }
}

export function validateCtiPair(
  pair: CtiPair,
  paths: ReturnType<typeof buildCtiFilePaths>,
): string | CtiPair {
  const required = [
    pair.mainPath,
    paths.seriesMap,
    paths.officialSnapshot,
    paths.metadata,
    paths.candidateDistributionAdjusted,
    paths.candidateDistributionAdjustedMetadata,
    paths.candidateDistributionAdjustedQuarterly,
    paths.candidateDistributionAdjustedQuarterlyMetadata,
  ];
  if (required.some((filePath) => !fs.existsSync(filePath))) return "missing required CTI set file";
  const content = fs.readFileSync(pair.mainPath, "utf8");
  const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data;
  const headerIndex = parsed.findIndex((row) =>
    row.some((cell) => cell?.trim() === "年月" || cell?.trim() === "月"),
  );
  if (headerIndex < 0) return "missing CTI 年月 header";
  const header = parsed[headerIndex].map((cell) => cell.trim());
  if (!header.includes("消費支出（名目）") || !header.includes("消費支出（実質）"))
    return "missing required CTI total headers";
  const monthIndex = header.indexOf(header.includes("年月") ? "年月" : "月");
  const dataRows = parsed.slice(headerIndex + 1);
  const months = dataRows.map((row) => row[monthIndex]?.trim() ?? "");
  if (months.length === 0) return "invalid or discontinuous CTI 年月";
  if (new Set(months).size !== months.length) return "invalid or duplicate CTI 年月";
  if (!isContinuousMonths(months)) return "invalid or discontinuous CTI 年月";
  const requiredValueIndexes = [
    header.indexOf("消費支出（名目）"),
    header.indexOf("消費支出（実質）"),
  ];
  if (
    requiredValueIndexes.some((index) => index < 0) ||
    dataRows.some((row) =>
      requiredValueIndexes.some((index) => {
        const rawValue = row[index]?.trim();
        return (
          !rawValue || rawValue === "-" || !Number.isFinite(Number(rawValue.replace(/,/g, "")))
        );
      }),
    )
  )
    return "invalid CTI required numeric value";
  // CtiPair only permits 2020 or 2025; the 2020 contract returns above.
  const readHeaders = (filePath: string) =>
    Papa.parse<string[]>(fs.readFileSync(filePath, "utf8"), {
      header: false,
      skipEmptyLines: true,
    }).data[0]?.map((cell) => cell.trim()) ?? [];
  if (
    !["official_code", "official_name", "dashboard_key", "value_type"].every((key) =>
      readHeaders(paths.seriesMap).includes(key),
    )
  )
    return "invalid 2025 series map headers";
  if (
    !["official_code", "official_name"].every((key) =>
      readHeaders(paths.officialSnapshot).includes(key),
    )
  )
    return "invalid 2025 official snapshot headers";
  const metadata = validateCtiMetadata(paths.metadata, path.basename(pair.mainPath));
  if (typeof metadata === "string") return metadata;
  if (
    typeof metadata.sourceBasis !== "string" ||
    typeof metadata.comparisonNormalization !== "string"
  )
    return "2025 CTI metadata basis fields are missing";
  const period = metadata.period as Record<string, unknown> | undefined;
  if (
    !period ||
    period.start !== months[0] ||
    period.end !== months.at(-1) ||
    period.monthlyRows !== months.length
  )
    return "2025 CTI metadata period mismatch";
  for (const [metadataPath, expected, csv] of [
    [paths.metadata, path.basename(pair.mainPath), content],
    [
      paths.candidateDistributionAdjustedMetadata,
      path.basename(paths.candidateDistributionAdjusted),
      fs.readFileSync(paths.candidateDistributionAdjusted, "utf8"),
    ],
  ] as const) {
    const checked = validateCtiMetadata(metadataPath, expected);
    if (typeof checked === "string") return checked;
    if (createHash("sha256").update(csv).digest("hex") !== checked.csvSha256)
      return "metadata SHA-256 mismatch";
  }
  const quarterlyCsv = fs.readFileSync(paths.candidateDistributionAdjustedQuarterly, "utf8");
  let quarterlyMetadata: Record<string, unknown>;
  let plan39Manifest: Record<string, unknown>;
  try {
    quarterlyMetadata = JSON.parse(
      fs.readFileSync(paths.candidateDistributionAdjustedQuarterlyMetadata, "utf8"),
    ) as Record<string, unknown>;
    plan39Manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data/source/cti-adjusted/manifest.json"), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    return "invalid official quarterly metadata or Plan39 manifest";
  }
  const quarterlyEntry = (
    plan39Manifest.artifacts as Record<string, Record<string, unknown>> | undefined
  )?.quarterlyNominal;
  const annualEntry = (
    plan39Manifest.artifacts as Record<string, Record<string, unknown>> | undefined
  )?.A;
  const annualA = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data/source/cti-adjusted/A.json"), "utf8"),
  ) as {
    metadata?: Record<string, unknown>;
  };
  const annualABytes = fs.readFileSync(path.join(process.cwd(), "data/source/cti-adjusted/A.json"));
  const quarterlyHash = createHash("sha256").update(quarterlyCsv).digest("hex");
  const quarterlyMetadataHash = createHash("sha256")
    .update(fs.readFileSync(paths.candidateDistributionAdjustedQuarterlyMetadata))
    .digest("hex");
  let sourceWorkbookBytes: Buffer;
  try {
    sourceWorkbookBytes = fs.readFileSync(OFFICIAL_QUARTERLY_WORKBOOK_PATH);
  } catch {
    return "missing official quarterly source workbook";
  }
  const sourceWorkbook = quarterlyMetadata.sourceWorkbook as
    | { path?: unknown; fileName?: unknown }
    | undefined;
  if (
    quarterlyMetadata.schemaVersion !== "plan39-quarterly-nominal-v1" ||
    quarterlyMetadata.artifact !== path.basename(paths.candidateDistributionAdjustedQuarterly) ||
    quarterlyMetadata.statisticalCode !== "00200567" ||
    quarterlyMetadata.statInfId !== "000040499087" ||
    quarterlyMetadata.valueType !== "原数値（名目指数）" ||
    quarterlyMetadata.householdScope !== "総世帯" ||
    quarterlyMetadata.frequency !== "quarterly" ||
    quarterlyMetadata.sourceSheet !== "総・四(原)" ||
    sourceWorkbook?.path !== OFFICIAL_QUARTERLY_WORKBOOK_PATH ||
    sourceWorkbook?.fileName !== "cti-distribution-adjusted-000040499087.xlsx" ||
    JSON.stringify(quarterlyMetadata.columnMapping) !==
      JSON.stringify(OFFICIAL_QUARTERLY_COLUMN_MAPPING) ||
    createHash("sha256").update(sourceWorkbookBytes).digest("hex") !==
      quarterlyMetadata.sourceSha256 ||
    quarterlyMetadata.revision !== plan39Manifest.revision ||
    quarterlyMetadata.revision !== annualA.metadata?.revision ||
    quarterlyMetadata.sourceSha256 !== annualA.metadata?.sourceSha256 ||
    annualEntry?.path !== "A.json" ||
    annualEntry?.sha256 !== createHash("sha256").update(annualABytes).digest("hex") ||
    quarterlyMetadata.csvSha256 !== quarterlyHash ||
    quarterlyEntry?.path !== "../cti_data2025_distribution_adjusted_quarterly.csv" ||
    quarterlyEntry?.metadataPath !==
      "../cti_data2025_distribution_adjusted_quarterly.metadata.json" ||
    quarterlyEntry?.sha256 !== quarterlyHash ||
    quarterlyEntry?.metadataSha256 !== quarterlyMetadataHash ||
    quarterlyEntry?.revision !== quarterlyMetadata.revision ||
    quarterlyEntry?.sourceSha256 !== quarterlyMetadata.sourceSha256
  )
    return "official quarterly CTI artifact/metadata/manifest mismatch";
  const quarterlyRows = Papa.parse<Record<string, string>>(quarterlyCsv, {
    header: true,
    skipEmptyLines: true,
  });
  const quarterlyPeriod = quarterlyRows.data.map((row) => row.period?.trim() ?? "");
  const quarterlyStart = quarterlyMetadata.adoptedRange as Record<string, unknown> | undefined;
  if (
    quarterlyRows.errors.length ||
    quarterlyPeriod[0] !== "2017Q1" ||
    !isContinuousQuarterLabels(quarterlyPeriod) ||
    quarterlyPeriod.at(-1) !== quarterlyStart?.end ||
    quarterlyStart?.start !== "2017Q1" ||
    quarterlyStart.rows !== quarterlyPeriod.length
  )
    return "invalid official quarterly CTI period range";
  const records = (filePath: string) =>
    Papa.parse<Record<string, string>>(fs.readFileSync(filePath, "utf8"), {
      header: true,
      skipEmptyLines: true,
    }).data.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value?.trim()])),
    );
  const map = records(paths.seriesMap),
    snapshot = records(paths.officialSnapshot);
  const mapByCode = new Map<string, Record<string, string>>(),
    officialByCode = new Map<string, Record<string, string>>();
  for (const row of map) {
    const code = row.official_code;
    if (!code || mapByCode.has(code) || !row.official_name || !row.dashboard_key)
      return "invalid or duplicate 2025 series map rows";
    if (!header.includes(row.dashboard_key))
      return `2025 series map column missing: ${row.dashboard_key}`;
    mapByCode.set(code, row);
  }
  for (const row of snapshot) {
    const code = row.official_code;
    if (!code || officialByCode.has(code) || !row.official_name)
      return "invalid or duplicate 2025 official snapshot rows";
    officialByCode.set(code, row);
  }
  if (
    mapByCode.size === 0 ||
    mapByCode.size !== officialByCode.size ||
    [...mapByCode.keys()].some((code) => !officialByCode.has(code))
  )
    return "2025 series map and official snapshot code set mismatch";
  for (const [code, mapped] of mapByCode) {
    const official = officialByCode.get(code)!;
    if (mapped.official_name !== official.official_name)
      return `2025 official name mismatch: ${code}`;
    const month = official.representative_month,
      expected = official.representative_value;
    if (!month || !expected) return `2025 official representative value missing: ${code}`;
    const row = parsed
      .slice(headerIndex + 1)
      .find((candidate) => candidate[monthIndex]?.trim() === month);
    if (!row) return `2025 official representative month missing: ${month}`;
    if (
      !row[header.indexOf(mapped.dashboard_key)]?.trim() ||
      row[header.indexOf(mapped.dashboard_key)]?.trim() !== expected
    )
      return `2025 official representative value mismatch: ${code}`;
  }
  const values2025 = parsed
    .slice(headerIndex + 1)
    // The earlier continuous-month validation rejects every unparseable month.
    .filter((row) => parseYearMonth(row[monthIndex]!.trim())!.year === 2025)
    .map((row) => Number(row[header.indexOf("消費支出（名目）")]?.replace(/,/g, "")))
    .filter(Number.isFinite);
  return values2025.length === 12 ? pair : "incomplete 2025 CTI calendar year";
}

export function mapCtiReasonToCode(validationMsg: string): CtiReasonCode {
  switch (validationMsg) {
    case "missing metadata":
    case "missing required CTI set file":
    case "missing CTI 年月 header":
      return "cti_source_missing";

    case "metadata is not ready for 2025":
    case "metadata file pairing mismatch":
    case "invalid metadata":
    case "invalid 2025 series map headers":
    case "invalid 2025 official snapshot headers":
    case "2025 CTI metadata basis fields are missing":
      return "cti_metadata_invalid";

    case "metadata SHA-256 is missing or invalid":
    case "metadata SHA-256 mismatch":
      return "cti_hash_mismatch";

    case "invalid or duplicate CTI support period":
    case "invalid CTI support value":
    case "CTI nominal/real support period set mismatch":
    case "missing required CTI total headers":
    case "invalid CTI required numeric value":
    case "invalid or duplicate 2025 series map rows":
    case "invalid or duplicate 2025 official snapshot rows":
    case "2025 series map and official snapshot code set mismatch":
      return "cti_schema_invalid";

    case "CTI support periods are not continuous":
    case "invalid or discontinuous CTI 年月":
    case "invalid or duplicate CTI 年月":
    case "2025 CTI metadata period mismatch":
    case "incomplete 2025 CTI calendar year":
      return "cti_period_invalid";

    case "missing CTI support period or series header":
    case "CTI support contains no values":
    case "missing official quarterly source workbook":
      return "cti_required_support_unavailable";

    default:
      return "cti_fail_closed";
  }
}

export function selectCtiPair(_options: CtiLoadOptions = {}): { pair: CtiPair } | CtiDataStatus {
  const paths = buildCtiFilePaths();
  const pair: CtiPair = {
    baseYear: 2025,
    pair: "2025",
    mainPath: paths.candidateMain,
    supportNominalPath: paths.candidateSupportNominal,
    supportRealPath: paths.candidateSupportReal,
  };
  const validation = validateCtiPair(pair, paths);
  if (typeof validation !== "string") return { pair };
  const rawReason = `2025 pair: ${validation}`;
  console.error(`CTI data pair validation failed (${rawReason})`);
  return {
    baseYear: null,
    pair: null,
    valid: false,
    reason: mapCtiReasonToCode(validation),
  };
}
