import * as fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Papa from "papaparse";
import { buildCtiFilePaths } from "../dataIo";
import { parseYearMonth } from "@/lib/yearMonth";
import { resolveQuarterlyNominalArtifactSchema } from "../ctiDomainContract";

export type CtiLoadOptions = { source?: "auto" };
export type CtiPair = {
  baseYear: 2025;
  pair: "2025";
  mainPath: string;
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

export function validateCtiMetadata(
  metadataPath: string,
  expectedFile: string,
): string | Record<string, unknown> {
  const snapshot = acquireCtiMetadataSnapshot(metadataPath);
  if (snapshot.kind === "missing") return "missing metadata";
  if (snapshot.kind === "invalid") return "invalid metadata";
  try {
    return validateCtiMetadataValue(snapshot.metadata, expectedFile);
  } catch {
    return "invalid metadata";
  }
}

type CtiMetadataSnapshot =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "loaded"; metadata: Record<string, unknown> };

function acquireCtiMetadataSnapshot(metadataPath: string): CtiMetadataSnapshot {
  if (!fs.existsSync(metadataPath)) return { kind: "missing" };
  try {
    return {
      kind: "loaded",
      metadata: JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Record<string, unknown>,
    };
  } catch {
    return { kind: "invalid" };
  }
}

function validateCtiMetadataValue(
  metadata: Record<string, unknown>,
  expectedFile: string,
): string | Record<string, unknown> {
  if (metadata === null) return "invalid metadata";
  const declaredFile = metadata.indexFile ?? metadata.outputFile ?? metadata.file;
  if (metadata.status !== "ready" || metadata.baseYear !== 2025)
    return "metadata is not ready for 2025";
  if (declaredFile !== expectedFile) return "metadata file pairing mismatch";
  if (typeof metadata.csvSha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.csvSha256))
    return "metadata SHA-256 is missing or invalid";
  return metadata;
}

type CtiMainCsvValidation =
  | { reason: string }
  | {
      header: string[];
      monthIndex: number;
      dataRows: string[][];
      months: string[];
    };

type CtiMainCsvSnapshot = { content: string; parsedRows: string[][] };

function acquireCtiMainCsvSnapshot(mainPath: string): CtiMainCsvSnapshot {
  const content = fs.readFileSync(mainPath, "utf8");
  return {
    content,
    parsedRows: Papa.parse<string[]>(content, { header: false, skipEmptyLines: true }).data,
  };
}

/** Validate already-parsed main CSV rows without performing I/O or parsing. */
function validateCtiMainCsvRows(parsed: string[][]): CtiMainCsvValidation {
  const headerIndex = parsed.findIndex((row) =>
    row.some((cell) => cell?.trim() === "年月" || cell?.trim() === "月"),
  );
  if (headerIndex < 0) return { reason: "missing CTI 年月 header" };
  const header = parsed[headerIndex].map((cell) => cell.trim());
  if (!header.includes("消費支出（名目）") || !header.includes("消費支出（実質）"))
    return { reason: "missing required CTI total headers" };
  const monthIndex = header.indexOf(header.includes("年月") ? "年月" : "月");
  const dataRows = parsed.slice(headerIndex + 1);
  const months = dataRows.map((row) => row[monthIndex]?.trim() ?? "");
  if (months.length === 0) return { reason: "invalid or discontinuous CTI 年月" };
  if (new Set(months).size !== months.length) return { reason: "invalid or duplicate CTI 年月" };
  if (!isContinuousMonths(months)) return { reason: "invalid or discontinuous CTI 年月" };
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
    return { reason: "invalid CTI required numeric value" };
  return { header, monthIndex, dataRows, months };
}

/** Validate a parsed quarterly period and adopted range without reading files. */
function validateCtiQuarterlyPeriod(
  rows: Record<string, string>[],
  adoptedRange: Record<string, unknown> | undefined,
): string | null {
  const periods = rows.map((row) => row.period?.trim() ?? "");
  if (
    periods[0] !== "2017Q1" ||
    !isContinuousQuarterLabels(periods) ||
    periods.at(-1) !== adoptedRange?.end ||
    adoptedRange?.start !== "2017Q1" ||
    adoptedRange.rows !== periods.length
  )
    return "invalid official quarterly CTI period range";
  return null;
}

type CtiHeaderSnapshot = { headers: string[] };

function acquireCtiHeaderSnapshot(filePath: string): CtiHeaderSnapshot {
  return {
    headers:
      Papa.parse<string[]>(fs.readFileSync(filePath, "utf8"), {
        header: false,
        skipEmptyLines: true,
      }).data[0]?.map((cell) => cell.trim()) ?? [],
  };
}

function validateCtiHeaders(
  kind: "series map" | "official snapshot",
  snapshot: CtiHeaderSnapshot,
): string | null {
  const required =
    kind === "series map"
      ? ["official_code", "official_name", "dashboard_key", "value_type"]
      : ["official_code", "official_name"];
  return required.every((key) => snapshot.headers.includes(key))
    ? null
    : kind === "series map"
      ? "invalid 2025 series map headers"
      : "invalid 2025 official snapshot headers";
}

function validateCtiMetadataBasis(metadata: Record<string, unknown>): string | null {
  return typeof metadata.sourceBasis === "string" &&
    typeof metadata.comparisonNormalization === "string"
    ? null
    : "2025 CTI metadata basis fields are missing";
}

function validateCtiDerivedMapHash(expected: unknown, actual: string): string | null {
  return typeof expected === "string" && expected === actual
    ? null
    : "2025 CTI derived map/snapshot identity or SHA-256 mismatch";
}

function validateCtiDerivedSnapshotIdentity(
  metadata: Record<string, unknown>,
  actualSnapshotHash: string,
): string | null {
  return typeof metadata.officialSeriesSnapshotSha256 === "string" &&
    actualSnapshotHash === metadata.officialSeriesSnapshotSha256 &&
    metadata.officialSeriesSnapshotSourceStatInfId === metadata.statInfId &&
    metadata.officialSeriesSnapshotSourceSha256 === metadata.sourceFileSha256
    ? null
    : "2025 CTI derived map/snapshot identity or SHA-256 mismatch";
}

type CtiQuarterlyArtifactSnapshot = {
  quarterlyCsv: string;
  quarterlyMetadata: Record<string, unknown>;
  annualManifest: Record<string, unknown>;
  quarterlyEntry: Record<string, unknown> | undefined;
  annualEntry: Record<string, unknown> | undefined;
  annualA: { metadata?: Record<string, unknown> };
  annualABytes: Buffer;
  quarterlyHash: string;
  quarterlyMetadataHash: string;
  sourceWorkbookBytes: Buffer;
};

type CtiQuarterlyArtifactAcquisition =
  | { kind: "reason"; reason: string }
  | { kind: "loaded"; snapshot: CtiQuarterlyArtifactSnapshot };

function acquireCtiQuarterlyArtifactSnapshot(
  paths: ReturnType<typeof buildCtiFilePaths>,
): CtiQuarterlyArtifactAcquisition {
  const quarterlyCsv = fs.readFileSync(paths.candidateDistributionAdjustedQuarterly, "utf8");
  let quarterlyMetadata: Record<string, unknown>;
  let annualManifest: Record<string, unknown>;
  try {
    quarterlyMetadata = JSON.parse(
      fs.readFileSync(paths.candidateDistributionAdjustedQuarterlyMetadata, "utf8"),
    ) as Record<string, unknown>;
    annualManifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data/source/cti-adjusted/manifest.json"), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    return {
      kind: "reason",
      reason: "invalid official quarterly metadata or composition-adjusted annual manifest",
    };
  }
  const quarterlyEntry = (
    annualManifest.artifacts as Record<string, Record<string, unknown>> | undefined
  )?.quarterlyNominal;
  const annualEntry = (
    annualManifest.artifacts as Record<string, Record<string, unknown>> | undefined
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
    return { kind: "reason", reason: "missing official quarterly source workbook" };
  }
  return {
    kind: "loaded",
    snapshot: {
      quarterlyCsv,
      quarterlyMetadata,
      annualManifest,
      quarterlyEntry,
      annualEntry,
      annualA,
      annualABytes,
      quarterlyHash,
      quarterlyMetadataHash,
      sourceWorkbookBytes,
    },
  };
}

function validateCtiMetadataPeriod(
  metadata: Record<string, unknown>,
  months: string[],
): string | null {
  const period = metadata.period as Record<string, unknown> | undefined;
  return period &&
    period.start === months[0] &&
    period.end === months.at(-1) &&
    period.monthlyRows === months.length
    ? null
    : "2025 CTI metadata period mismatch";
}

type CtiCsvDigestSnapshot = {
  metadataPath: string;
  expectedFile: string;
  content: string;
};

function acquireCtiCsvDigestSnapshots(
  mainSnapshot: CtiMainCsvSnapshot,
  mainPath: string,
  paths: ReturnType<typeof buildCtiFilePaths>,
): CtiCsvDigestSnapshot[] {
  return [
    {
      metadataPath: paths.metadata,
      expectedFile: path.basename(mainPath),
      content: mainSnapshot.content,
    },
    {
      metadataPath: paths.candidateDistributionAdjustedMetadata,
      expectedFile: path.basename(paths.candidateDistributionAdjusted),
      content: fs.readFileSync(paths.candidateDistributionAdjusted, "utf8"),
    },
  ];
}

type CtiDerivedIdentitySnapshot = { mapBytes: Buffer; snapshotBytes: Buffer };

function acquireCtiDerivedIdentitySnapshot(
  paths: ReturnType<typeof buildCtiFilePaths>,
): CtiDerivedIdentitySnapshot {
  const mapBytes = fs.readFileSync(paths.seriesMap);
  const snapshotBytes = fs.readFileSync(paths.officialSnapshot);
  return { mapBytes, snapshotBytes };
}

function validateCtiCsvDigest(metadata: Record<string, unknown>, csvSha256: string): string | null {
  return csvSha256 === metadata.csvSha256 ? null : "metadata SHA-256 mismatch";
}

function validateCtiQuarterlyArtifact(
  quarterlyMetadata: Record<string, unknown>,
  quarterlyPath: string,
  quarterlyHash: string,
  quarterlyMetadataHash: string,
  quarterlyEntry: Record<string, unknown> | undefined,
  annualEntry: Record<string, unknown> | undefined,
  annualA: unknown,
  manifestRevision: unknown,
  annualAHash: string,
  sourceWorkbookSha256: string,
): string | null {
  const sourceWorkbook = quarterlyMetadata.sourceWorkbook as
    | { path?: unknown; fileName?: unknown }
    | undefined;
  if (
    resolveQuarterlyNominalArtifactSchema(quarterlyMetadata.schemaVersion) === null ||
    quarterlyMetadata.artifact !== path.basename(quarterlyPath) ||
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
    sourceWorkbookSha256 !== quarterlyMetadata.sourceSha256 ||
    quarterlyMetadata.revision !== manifestRevision ||
    quarterlyMetadata.revision !==
      (annualA as { metadata?: Record<string, unknown> }).metadata?.revision ||
    quarterlyMetadata.sourceSha256 !==
      (annualA as { metadata?: Record<string, unknown> }).metadata?.sourceSha256 ||
    annualEntry?.path !== "A.json" ||
    annualEntry?.sha256 !== annualAHash ||
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
  return null;
}

function validateCtiOfficialRows(
  map: Record<string, string>[],
  snapshot: Record<string, string>[],
  header: string[],
  dataRows: string[][],
  metadata: Record<string, unknown>,
): string | null {
  const mapByCode = new Map<string, Record<string, string>>();
  const officialByCode = new Map<string, Record<string, string>>();
  for (const row of map) {
    const code = row.official_code;
    if (!code || mapByCode.has(code) || !row.official_name || !row.dashboard_key)
      return "invalid or duplicate 2025 series map rows";
    if (row.source_stat_inf_id !== metadata.statInfId)
      return "2025 series map source identity mismatch";
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
  const monthIndex = header.indexOf(header.includes("年月") ? "年月" : "月");
  for (const [code, mapped] of mapByCode) {
    const official = officialByCode.get(code)!;
    if (mapped.official_name !== official.official_name)
      return `2025 official name mismatch: ${code}`;
    const month = official.representative_month;
    const expected = official.representative_value;
    if (!month || !expected) return `2025 official representative value missing: ${code}`;
    const row = dataRows.find((candidate) => candidate[monthIndex]?.trim() === month);
    if (!row) return `2025 official representative month missing: ${month}`;
    if (
      !row[header.indexOf(mapped.dashboard_key)]?.trim() ||
      row[header.indexOf(mapped.dashboard_key)]?.trim() !== expected
    )
      return `2025 official representative value mismatch: ${code}`;
  }
  return null;
}

type CtiOfficialRowsSnapshot = {
  map: Record<string, string>[];
  snapshot: Record<string, string>[];
};

function acquireCtiOfficialRowsSnapshot(
  paths: ReturnType<typeof buildCtiFilePaths>,
): CtiOfficialRowsSnapshot {
  const records = (filePath: string) =>
    Papa.parse<Record<string, string>>(fs.readFileSync(filePath, "utf8"), {
      header: true,
      skipEmptyLines: true,
    }).data.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value?.trim()])),
    );
  const map = records(paths.seriesMap);
  const snapshot = records(paths.officialSnapshot);
  return { map, snapshot };
}

function validateCti2025Completeness(
  dataRows: string[][],
  monthIndex: number,
  nominalIndex: number,
): string | null {
  const values2025 = dataRows
    // The earlier continuous-month validation rejects every unparseable month.
    .filter((row) => parseYearMonth(row[monthIndex]!.trim())!.year === 2025)
    .map((row) => Number(row[nominalIndex]?.replace(/,/g, "")))
    .filter(Number.isFinite);
  return values2025.length === 12 ? null : "incomplete 2025 CTI calendar year";
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
  const mainSnapshot = acquireCtiMainCsvSnapshot(pair.mainPath);
  const mainCsv = validateCtiMainCsvRows(mainSnapshot.parsedRows);
  if ("reason" in mainCsv) return mainCsv.reason;
  const { header, monthIndex, dataRows, months } = mainCsv;
  const mapHeaderSnapshot = acquireCtiHeaderSnapshot(paths.seriesMap);
  const mapHeaderReason = validateCtiHeaders("series map", mapHeaderSnapshot);
  if (mapHeaderReason) return mapHeaderReason;
  const officialSnapshotHeader = acquireCtiHeaderSnapshot(paths.officialSnapshot);
  const snapshotHeaderReason = validateCtiHeaders("official snapshot", officialSnapshotHeader);
  if (snapshotHeaderReason) return snapshotHeaderReason;
  const metadata = validateCtiMetadata(paths.metadata, path.basename(pair.mainPath));
  if (typeof metadata === "string") return metadata;
  const metadataBasisReason = validateCtiMetadataBasis(metadata);
  if (metadataBasisReason) return metadataBasisReason;
  const derivedIdentitySnapshot = acquireCtiDerivedIdentitySnapshot(paths);
  if (typeof metadata.officialSeriesMapSha256 !== "string")
    return "2025 CTI derived map/snapshot identity or SHA-256 mismatch";
  const mapDigest = createHash("sha256").update(derivedIdentitySnapshot.mapBytes).digest("hex");
  if (validateCtiDerivedMapHash(metadata.officialSeriesMapSha256, mapDigest))
    return "2025 CTI derived map/snapshot identity or SHA-256 mismatch";
  if (typeof metadata.officialSeriesSnapshotSha256 !== "string")
    return "2025 CTI derived map/snapshot identity or SHA-256 mismatch";
  const snapshotDigest = createHash("sha256")
    .update(derivedIdentitySnapshot.snapshotBytes)
    .digest("hex");
  if (validateCtiDerivedSnapshotIdentity(metadata, snapshotDigest))
    return "2025 CTI derived map/snapshot identity or SHA-256 mismatch";
  const metadataPeriodReason = validateCtiMetadataPeriod(metadata, months);
  if (metadataPeriodReason) return metadataPeriodReason;
  const csvDigestSnapshots = acquireCtiCsvDigestSnapshots(mainSnapshot, pair.mainPath, paths);
  for (const csvSnapshot of csvDigestSnapshots) {
    const checked = validateCtiMetadata(csvSnapshot.metadataPath, csvSnapshot.expectedFile);
    if (typeof checked === "string") return checked;
    const digestReason = validateCtiCsvDigest(
      checked,
      createHash("sha256").update(csvSnapshot.content).digest("hex"),
    );
    if (digestReason) return digestReason;
  }
  const quarterlyAcquisition = acquireCtiQuarterlyArtifactSnapshot(paths);
  if (quarterlyAcquisition.kind === "reason") return quarterlyAcquisition.reason;
  const {
    quarterlyCsv,
    quarterlyMetadata,
    annualManifest,
    quarterlyEntry,
    annualEntry,
    annualA,
    annualABytes,
    quarterlyHash,
    quarterlyMetadataHash,
    sourceWorkbookBytes,
  } = quarterlyAcquisition.snapshot;
  const quarterlyArtifactReason = validateCtiQuarterlyArtifact(
    quarterlyMetadata,
    paths.candidateDistributionAdjustedQuarterly,
    quarterlyHash,
    quarterlyMetadataHash,
    quarterlyEntry,
    annualEntry,
    annualA,
    annualManifest.revision,
    createHash("sha256").update(annualABytes).digest("hex"),
    createHash("sha256").update(sourceWorkbookBytes).digest("hex"),
  );
  if (quarterlyArtifactReason) return quarterlyArtifactReason;
  const quarterlyRows = Papa.parse<Record<string, string>>(quarterlyCsv, {
    header: true,
    skipEmptyLines: true,
  });
  const quarterlyStart = quarterlyMetadata.adoptedRange as Record<string, unknown> | undefined;
  if (quarterlyRows.errors.length) return "invalid official quarterly CTI period range";
  const quarterlyPeriodReason = validateCtiQuarterlyPeriod(quarterlyRows.data, quarterlyStart);
  if (quarterlyPeriodReason) return quarterlyPeriodReason;
  const officialRowsSnapshot = acquireCtiOfficialRowsSnapshot(paths);
  const officialRowsReason = validateCtiOfficialRows(
    officialRowsSnapshot.map,
    officialRowsSnapshot.snapshot,
    header,
    dataRows,
    metadata,
  );
  if (officialRowsReason) return officialRowsReason;
  const complete2025Reason = validateCti2025Completeness(
    dataRows,
    monthIndex,
    header.indexOf("消費支出（名目）"),
  );
  return complete2025Reason ?? pair;
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

    case "missing required CTI total headers":
    case "invalid CTI required numeric value":
    case "invalid or duplicate 2025 series map rows":
    case "invalid or duplicate 2025 official snapshot rows":
    case "2025 series map and official snapshot code set mismatch":
      return "cti_schema_invalid";

    case "invalid or discontinuous CTI 年月":
    case "invalid or duplicate CTI 年月":
    case "2025 CTI metadata period mismatch":
    case "incomplete 2025 CTI calendar year":
      return "cti_period_invalid";

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
