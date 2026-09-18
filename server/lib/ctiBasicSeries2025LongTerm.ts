import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { SeriesMeasurement } from "@/types/chart";

const ARTIFACT_RELATIVE_ROOT = path.join("data", "source", "official-cti-2025-long-term");
const ARTIFACT_OVERRIDE_ENV = "CTI_BASIC_ARTIFACT_ROOT";

export type CtiArtifactResolution = {
  root: string;
  status: "ready" | "unavailable";
  reason: string | null;
};

function findArtifactRoot(start: string): string | null {
  let current = path.resolve(start);
  while (true) {
    const candidate = path.join(current, ARTIFACT_RELATIVE_ROOT);
    if (
      fs.existsSync(path.join(current, "package.json")) &&
      fs.existsSync(path.join(current, "data", "source")) &&
      fs.existsSync(candidate)
    )
      return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveArtifactRoot(): CtiArtifactResolution {
  const override = process.env[ARTIFACT_OVERRIDE_ENV]?.trim();
  if (override) {
    const root = path.resolve(override);
    return fs.existsSync(root)
      ? { root, status: "ready", reason: null }
      : { root, status: "unavailable", reason: "CTI artifact override directory is missing" };
  }

  // __dirname is stable for Next's server bundle and for the source/test module;
  // walking from it avoids tying artifact lookup to the process launch cwd.
  const root = findArtifactRoot(__dirname) ?? findArtifactRoot(process.cwd());
  return root
    ? { root, status: "ready", reason: null }
    : {
        root: path.join(path.resolve(__dirname), ARTIFACT_RELATIVE_ROOT),
        status: "unavailable",
        reason: "CTI artifact root was not found",
      };
}

export const CTI_BASIC_ARTIFACT_RESOLUTION = resolveArtifactRoot();

export const CTI_BASIC_2025_SERIES = {
  nominal: { kind: "nominal", statInfId: "000040499070", label: "原数値" },
  seasonallyAdjusted: {
    kind: "seasonallyAdjusted",
    statInfId: "000040499082",
    label: "季節調整値",
  },
} as const;
export type CtiBasicSeriesKind = keyof typeof CTI_BASIC_2025_SERIES;
export type CtiBasicMonth = `${number}-${number}`;
export type CtiBasicRecord = {
  variant: CtiBasicSeriesKind;
  seriesIndex: number;
  officialSeriesCode: string | null;
  seriesName: string;
  month: CtiBasicMonth;
  rawValue: number | null;
  isMissing: boolean;
};
export type OfficialCtiMetadata = {
  status: "ready" | "unavailable";
  statisticName: string;
  governmentStatisticsCode: string;
  baseYear: 2025;
  unit: string;
  statInfId: string;
  seriesKind: CtiBasicSeriesKind;
  seriesLabel: string;
  householdScope: "二人以上の世帯";
  valueType: "原数値" | "季節調整値";
  sourceTitle: string;
  frequency: "monthly";
  sourceStart: "2002-01";
  requestedStart: "2005-01";
  availabilityStart: string;
  retrieval: { retrievedAt: string; updatedAt: string | null };
  officialUrl: string;
  encoding: "binary/official";
  rawFile: string;
  normalizedFile: string;
  metadataFile: string;
  rawBytes: number;
  normalizedBytes: number;
  parserVersion: string;
  transformVersion: string;
  sourceHeaders: {
    contentType: string;
    contentDisposition: string | null;
    lastModified: string | null;
  };
  rawSha256: string;
  normalizedSha256: string;
  latestPublishedMonth: CtiBasicMonth | null;
  rowCount: number;
  seriesCount: 22;
  series: Array<{ seriesIndex: number; officialSeriesCode: string | null; seriesName: string }>;
  validation: { ok: true; checks: string[] };
  unavailable: { periods: string[]; reason: string | null };
};
export type CtiBasicManifest = {
  schemaVersion: 1;
  generatedAt: string;
  files: Array<{
    statInfId: string;
    seriesKind: CtiBasicSeriesKind;
    rawFile: string;
    normalizedFile: string;
    metadataFile: string;
    rawSha256: string;
    normalizedSha256: string;
    metadataSha256: string;
  }>;
};
export const CTI_BASIC_2025_ROOT = CTI_BASIC_ARTIFACT_RESOLUTION.root;
export function ctiBasicSeriesPaths(kind: CtiBasicSeriesKind, root = CTI_BASIC_2025_ROOT) {
  const id = CTI_BASIC_2025_SERIES[kind].statInfId;
  return {
    raw: path.join(root, `${id}.raw`),
    normalized: path.join(root, `${id}.normalized.csv`),
    metadata: path.join(root, `${id}.metadata.json`),
  };
}
export function sha256Hex(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
function monthNumber(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`invalid CTI month: ${month}`);
  return Number(match[1]) * 12 + Number(match[2]);
}
export function normalizeCtiMonth(value: string) {
  const match = String(value)
    .trim()
    .replace(/^'(.*)'$/, "$1")
    .match(/^(\d{4})[-年/]([0-9]{1,2})(?:月)?$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12)
    throw new Error(`invalid CTI month: ${value}`);
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` as CtiBasicMonth;
}
const missingValues = new Set(["", "-", "…", "na", "n/a"]);
const normalizedFields = [
  "variant",
  "series_index",
  "official_series_code",
  "series_name",
  "month",
  "raw_value",
  "is_missing",
];
function csvRows(content: string) {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) throw new Error(`CTI CSV schema error: ${parsed.errors[0].message}`);
  if ((parsed.meta.fields ?? []).join(",") !== normalizedFields.join(","))
    throw new Error("CTI CSV has unexpected columns");
  return parsed.data;
}
export function normalizeCtiBasicSeriesCsv(content: string): CtiBasicRecord[] {
  const rows = csvRows(content);
  const records = rows.map((row, index) => {
    const variant = row.variant as CtiBasicSeriesKind;
    if (!(variant in CTI_BASIC_2025_SERIES))
      throw new Error(`unknown CTI variant at row ${index + 2}`);
    const seriesIndex = Number(row.series_index);
    if (!Number.isInteger(seriesIndex) || seriesIndex < 1 || seriesIndex > 22)
      throw new Error(`invalid CTI series index at row ${index + 2}`);
    const month = normalizeCtiMonth(row.month);
    const isMissing = row.is_missing === "true";
    const raw = String(row.raw_value ?? "")
      .trim()
      .replace(/,/g, "");
    if (isMissing !== missingValues.has(raw.toLowerCase()))
      throw new Error(`CTI missing marker mismatch at row ${index + 2}`);
    const rawValue = isMissing ? null : Number(raw);
    if (!isMissing && !Number.isFinite(rawValue))
      throw new Error(`CTI value is not numeric at row ${index + 2}`);
    return {
      variant,
      seriesIndex,
      officialSeriesCode: row.official_series_code || null,
      seriesName: row.series_name,
      month,
      rawValue,
      isMissing,
    };
  });
  const keys = new Set<string>();
  for (const record of records) {
    const key = `${record.variant}:${record.seriesIndex}:${record.month}`;
    if (keys.has(key)) throw new Error(`CTI duplicate key ${key}`);
    keys.add(key);
  }
  const bySeries = new Map<string, CtiBasicRecord[]>();
  for (const record of records) {
    const key = `${record.variant}:${record.seriesIndex}`;
    const list = bySeries.get(key) ?? [];
    list.push(record);
    bySeries.set(key, list);
  }
  if (bySeries.size !== 22) throw new Error("CTI CSV must contain one variant with 22 series");
  let latest: CtiBasicMonth | null = null;
  for (const list of bySeries.values()) {
    list.sort((a, b) => monthNumber(a.month) - monthNumber(b.month));
    if (list[0].month !== "2005-01") throw new Error("CTI series does not start at 2005-01");
    for (let i = 1; i < list.length; i += 1)
      if (monthNumber(list[i].month) !== monthNumber(list[i - 1].month) + 1)
        throw new Error(`CTI months are not continuous at ${list[i].month}`);
    const end = list.at(-1)!.month;
    if (latest && latest !== end) throw new Error("CTI series have different latest months");
    latest = end;
  }
  return records;
}
export function recordsToNormalizedCsv(records: CtiBasicRecord[]): string {
  const fields = records.map((record) => [
    record.variant,
    record.seriesIndex,
    record.officialSeriesCode ?? "",
    record.seriesName,
    record.month,
    record.rawValue === null ? "" : record.rawValue,
    record.isMissing ? "true" : "false",
  ]);
  const quote = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return (
    [normalizedFields.join(","), ...fields.map((row) => row.map(quote).join(","))].join("\n") + "\n"
  );
}
export function validateCtiBasicSeriesArtifact(input: {
  metadata: OfficialCtiMetadata;
  normalizedCsv: string;
  rawCsv?: string | Uint8Array;
  kind?: CtiBasicSeriesKind;
}): CtiBasicRecord[] {
  const { metadata, normalizedCsv, rawCsv, kind } = input;
  const expected = kind ? CTI_BASIC_2025_SERIES[kind] : undefined;
  if (metadata.status !== "ready" || metadata.baseYear !== 2025 || metadata.seriesCount !== 22)
    throw new Error("CTI metadata is not ready");
  if (
    expected &&
    (metadata.statInfId !== expected.statInfId ||
      metadata.seriesKind !== kind ||
      metadata.seriesLabel !== expected.label)
  )
    throw new Error("CTI metadata series identity mismatch");
  if (
    metadata.householdScope !== "二人以上の世帯" ||
    metadata.frequency !== "monthly" ||
    metadata.unit !== "指数"
  )
    throw new Error("CTI metadata scope or source identity mismatch");
  if (metadata.requestedStart !== "2005-01" || metadata.sourceStart !== "2002-01")
    throw new Error("CTI metadata source/request boundary mismatch");
  if (
    !/^[a-f0-9]{64}$/.test(metadata.normalizedSha256) ||
    sha256Hex(normalizedCsv) !== metadata.normalizedSha256
  )
    throw new Error("CTI normalized SHA-256 mismatch");
  if (
    rawCsv !== undefined &&
    (!/^[a-f0-9]{64}$/.test(metadata.rawSha256) || sha256Hex(rawCsv) !== metadata.rawSha256)
  )
    throw new Error("CTI raw SHA-256 mismatch");
  const records = normalizeCtiBasicSeriesCsv(normalizedCsv);
  const latest = records
    .map((record) => record.month)
    .sort()
    .at(-1);
  if (
    records.some((record) => record.variant !== metadata.seriesKind) ||
    records.length !== metadata.rowCount ||
    metadata.latestPublishedMonth !== latest
  )
    throw new Error("CTI metadata latest month or row count mismatch");
  return records;
}
function manifestPath(root: string, file: string): string {
  if (typeof file !== "string" || !file || path.isAbsolute(file))
    throw new Error("CTI manifest file name is invalid");
  const base = path.resolve(root);
  const resolved = path.resolve(base, file);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`))
    throw new Error("CTI manifest file path is outside root");
  return resolved;
}
function validateManifestMetadata(
  meta: OfficialCtiMetadata,
  item: CtiBasicManifest["files"][number],
  records: CtiBasicRecord[],
  raw: Uint8Array,
  normalized: string,
): void {
  const expected = CTI_BASIC_2025_SERIES[item.seriesKind];
  const expectedTitle =
    item.seriesKind === "nominal"
      ? "10大費目別 世帯消費動向指数（原数値）"
      : "10大費目別 世帯消費動向指数（季節調整値）";
  const latest = records
    .map((record) => record.month)
    .sort()
    .at(-1);
  if (
    meta.status !== "ready" ||
    meta.statInfId !== item.statInfId ||
    meta.seriesKind !== item.seriesKind ||
    meta.seriesLabel !== expected.label ||
    meta.valueType !== expected.label ||
    meta.baseYear !== 2025 ||
    meta.householdScope !== "二人以上の世帯" ||
    meta.frequency !== "monthly" ||
    meta.sourceTitle !== expectedTitle ||
    meta.governmentStatisticsCode !== "00200567" ||
    meta.officialUrl !==
      `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${item.statInfId}` ||
    meta.parserVersion !== "xlsx-0.20.3" ||
    meta.transformVersion !== "cti-basic-2025-long-term-v2" ||
    meta.availabilityStart !== "2002-01" ||
    meta.sourceStart !== "2002-01" ||
    meta.requestedStart !== "2005-01" ||
    meta.latestPublishedMonth !== latest ||
    meta.rowCount !== records.length ||
    meta.seriesCount !== 22 ||
    meta.encoding !== "binary/official" ||
    meta.rawFile !== item.rawFile ||
    meta.normalizedFile !== item.normalizedFile ||
    meta.metadataFile !== item.metadataFile ||
    meta.rawBytes !== raw.byteLength ||
    meta.normalizedBytes !== Buffer.byteLength(normalized) ||
    meta.rawSha256 !== item.rawSha256 ||
    meta.normalizedSha256 !== item.normalizedSha256
  )
    throw new Error("CTI metadata fields do not match expected values");
  if (
    !Array.isArray(meta.series) ||
    meta.series.length !== 22 ||
    meta.series.some(
      (series, index) =>
        series.seriesIndex !== index + 1 ||
        series.seriesName !==
          records.find((record) => record.seriesIndex === index + 1)?.seriesName ||
        series.officialSeriesCode !== (item.seriesKind === "nominal" ? String(index + 1) : null),
    )
  )
    throw new Error("CTI metadata series identity mismatch");
}
export function validateCtiBasicManifest(manifest: CtiBasicManifest, root: string): void {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length !== 2)
    throw new Error("CTI manifest is incomplete");
  const ids = new Set<string>();
  for (const item of manifest.files) {
    if (
      ids.has(item.statInfId) ||
      item.metadataFile === "manifest.json" ||
      item.rawFile === "manifest.json" ||
      item.normalizedFile === "manifest.json"
    )
      throw new Error("CTI manifest has a circular reference or duplicate");
    ids.add(item.statInfId);
    const expected = CTI_BASIC_2025_SERIES[item.seriesKind];
    if (!expected || item.statInfId !== expected.statInfId)
      throw new Error("CTI manifest has unexpected series identity");
    const rawPath = manifestPath(root, item.rawFile);
    const normalizedPath = manifestPath(root, item.normalizedFile);
    const metadataPath = manifestPath(root, item.metadataFile);
    if (![rawPath, normalizedPath, metadataPath].every(fs.existsSync))
      throw new Error("CTI manifest artifact is missing");
    const raw = fs.readFileSync(rawPath);
    const normalized = fs.readFileSync(normalizedPath, "utf8");
    const metadataBytes = fs.readFileSync(metadataPath);
    if (
      !/^[a-f0-9]{64}$/.test(item.rawSha256) ||
      sha256Hex(raw) !== item.rawSha256 ||
      !/^[a-f0-9]{64}$/.test(item.normalizedSha256) ||
      sha256Hex(normalized) !== item.normalizedSha256 ||
      !/^[a-f0-9]{64}$/.test(item.metadataSha256) ||
      sha256Hex(metadataBytes) !== item.metadataSha256
    )
      throw new Error("CTI manifest artifact hash mismatch");
    let meta: OfficialCtiMetadata;
    try {
      meta = JSON.parse(metadataBytes.toString("utf8")) as OfficialCtiMetadata;
    } catch {
      throw new Error("CTI metadata is invalid JSON");
    }
    const records = validateCtiBasicSeriesArtifact({
      metadata: meta,
      normalizedCsv: normalized,
      rawCsv: raw,
      kind: item.seriesKind,
    });
    validateManifestMetadata(meta, item, records, raw, normalized);
  }
  if ([...ids].sort().join(",") !== "000040499070,000040499082")
    throw new Error("CTI manifest has unexpected series IDs");
}
export function loadCtiBasicSeries2025(
  kind: CtiBasicSeriesKind,
  root = CTI_BASIC_2025_ROOT,
): CtiBasicRecord[] {
  const files = ctiBasicSeriesPaths(kind, root);
  if (![files.normalized, files.metadata, files.raw].every(fs.existsSync))
    throw new Error(`CTI ${kind} artifact set is incomplete`);
  return validateCtiBasicSeriesArtifact({
    metadata: JSON.parse(fs.readFileSync(files.metadata, "utf8")) as OfficialCtiMetadata,
    normalizedCsv: fs.readFileSync(files.normalized, "utf8"),
    rawCsv: fs.readFileSync(files.raw),
    kind,
  });
}

export type CtiConsumptionOutput = {
  raw: Map<string, number>;
  movingAverage: Map<string, number>;
  comparison: Map<string, number>;
  baseline: number | null;
  valid: boolean;
  status: "valid" | "invalid";
  reason: string | null;
  artifactRoot: string | null;
  artifactStatus: "ready" | "unavailable";
  artifactReason: string | null;
};

export type CtiQuarterlyAggregation = {
  values: Map<string, number>;
  measurements: Map<string, SeriesMeasurement>;
  status: "valid" | "invalid";
  reason: string | null;
};

/** Aggregate the fixed nominal series into strict three-calendar-month quarters. */
export function aggregateCtiBasicNominalQuarterly(
  records: readonly CtiBasicRecord[],
): CtiQuarterlyAggregation {
  const key = "CTIミクロ四半期系列（名目）";
  const base = (
    value: number | null,
    status: "valid" | "invalid",
    reason: string | null,
  ): SeriesMeasurement => ({
    key,
    label: "CTIミクロ（名目・四半期平均）",
    unit: "指数",
    source: "e-Stat 公式CTI長期artifact 000040499070",
    valueType: "raw",
    value,
    status,
    reason,
    frequency: "quarterly",
    aggregation: "simple_mean_of_three_calendar_months",
  });
  const byMonth = new Map<string, CtiBasicRecord>();
  const reasons = new Map<string, string>();
  let globalReason: string | null = null;
  const reasonPriority: Record<string, number> = { series_mismatch: 4, duplicate: 2 };
  const setGlobalReason = (reason: string) => {
    if (
      globalReason === null ||
      (reasonPriority[reason] ?? 0) > (reasonPriority[globalReason] ?? 0)
    ) {
      globalReason = reason;
    }
  };
  for (const record of records) {
    const match = /^(\d{4})-(\d{2})$/.exec(record.month);
    const inRange = Boolean(match) && Number(match![1]) >= 2005 && Number(match![1]) <= 2017;
    const validIdentity =
      record.variant === "nominal" &&
      record.seriesIndex === 1 &&
      record.officialSeriesCode === "1" &&
      record.seriesName === "消費支出（名目）";
    if (!inRange) continue;
    if (!validIdentity) {
      if (match) {
        const year = Number(match[1]);
        const quarter = Math.floor((Number(match[2]) - 1) / 3) + 1;
        reasons.set(`${year}Q${quarter}`, "series_mismatch");
      }
      setGlobalReason("series_mismatch");
      continue;
    }
    if (byMonth.has(record.month)) {
      const year = Number(record.month.slice(0, 4));
      const quarter = Math.floor((Number(record.month.slice(5, 7)) - 1) / 3) + 1;
      reasons.set(`${year}Q${quarter}`, "duplicate");
      setGlobalReason("duplicate");
      continue;
    }
    byMonth.set(record.month, record);
  }
  const values = new Map<string, number>();
  const measurements = new Map<string, SeriesMeasurement>();
  const fatalReason = globalReason === "duplicate" ? null : globalReason;
  for (let year = 2005; year <= 2017; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const months = [1, 2, 3].map(
        (offset) => `${year}-${String((quarter - 1) * 3 + offset).padStart(2, "0")}`,
      );
      const period = `${year}Q${quarter}`;
      const recordsForQuarter = months.map((month) => byMonth.get(month));
      const reason =
        reasons.get(period) ??
        (recordsForQuarter.some((record) => !record) ? "insufficient_months" : null);
      const quarterValues = recordsForQuarter.map((record) => record?.rawValue);
      const hasMissing = recordsForQuarter.some(
        (record) => record?.isMissing || record?.rawValue === null,
      );
      const hasNonFinite = quarterValues.some(
        (value) => value !== null && (typeof value !== "number" || !Number.isFinite(value)),
      );
      const finalReason =
        reason ?? fatalReason ?? (hasMissing ? "missing" : hasNonFinite ? "non_finite" : null);
      if (
        !finalReason &&
        quarterValues.every(
          (value): value is number => typeof value === "number" && Number.isFinite(value),
        )
      ) {
        const value = quarterValues.reduce((sum, current) => sum + current, 0) / 3;
        values.set(period, value);
        measurements.set(period, base(value, "valid", null));
      } else {
        measurements.set(period, base(null, "invalid", finalReason ?? globalReason ?? "invalid"));
      }
    }
  }
  return {
    values,
    measurements,
    status:
      measurements.size === 52 &&
      [...measurements.values()].every((measurement) => measurement.status === "valid") &&
      !globalReason
        ? "valid"
        : "invalid",
    reason:
      globalReason ??
      [...measurements.values()].find((measurement) => measurement.status === "invalid")?.reason ??
      null,
  };
}

export type CtiBasicConsumptionStatus = Pick<
  CtiConsumptionOutput,
  "valid" | "baseline" | "reason" | "artifactRoot" | "artifactStatus" | "artifactReason"
>;

function publicArtifactRoot(root: string): string | null {
  const resolved = path.resolve(root);
  const expected = path.resolve(CTI_BASIC_ARTIFACT_RESOLUTION.root);
  return resolved === expected ? ARTIFACT_RELATIVE_ROOT : null;
}

function artifactMetadata(
  root: string,
): Pick<CtiConsumptionOutput, "artifactRoot" | "artifactStatus" | "artifactReason"> {
  const files = ctiBasicSeriesPaths("nominal", root);
  const rootExists = [root, files.raw, files.normalized, files.metadata].every(fs.existsSync);
  return {
    artifactRoot: rootExists ? (publicArtifactRoot(root) ?? "custom") : null,
    artifactStatus: rootExists ? "ready" : "unavailable",
    artifactReason: rootExists ? null : "CTI artifact set is unavailable",
  };
}

export function buildCtiBasicConsumptionOutput(records: CtiBasicRecord[]): CtiConsumptionOutput {
  try {
    if (records.length === 0) throw new Error("fixed CTI nominal consumption series is missing");
    const raw = new Map<string, number>();
    for (const record of records) {
      if (!record.isMissing && record.rawValue !== null && Number.isFinite(record.rawValue))
        raw.set(record.month, record.rawValue);
    }
    const months = records.map((record) => record.month).sort();
    const movingAverage = new Map<string, number>();
    for (let index = 11; index < months.length; index += 1) {
      const window = months.slice(index - 11, index + 1);
      const values = window.map((month) => raw.get(month));
      if (
        values.length === 12 &&
        values.every(
          (value): value is number => typeof value === "number" && Number.isFinite(value),
        )
      ) {
        movingAverage.set(months[index], values.reduce((sum, value) => sum + value, 0) / 12);
      }
    }
    const baselineValues = Array.from({ length: 12 }, (_, index) =>
      movingAverage.get(`2025-${String(index + 1).padStart(2, "0")}`),
    );
    if (
      !baselineValues.every(
        (value): value is number => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      return {
        raw,
        movingAverage,
        comparison: new Map(),
        baseline: null,
        valid: false,
        status: "invalid",
        reason: "2025年12MA基準の12か月がそろっていません",
        artifactRoot: null,
        artifactStatus: "unavailable",
        artifactReason: null,
      };
    }
    const baseline = baselineValues.reduce((sum, value) => sum + value, 0) / 12;
    if (!Number.isFinite(baseline) || baseline <= 0) {
      return {
        raw,
        movingAverage,
        comparison: new Map(),
        baseline: null,
        valid: false,
        status: "invalid",
        reason: "2025年12MA基準が0以下です",
        artifactRoot: null,
        artifactStatus: "unavailable",
        artifactReason: null,
      };
    }
    const comparison = new Map<string, number>();
    movingAverage.forEach((value, month) => comparison.set(month, (100 * value) / baseline));
    return {
      raw,
      movingAverage,
      comparison,
      baseline,
      valid: true,
      status: "valid",
      reason: null,
      artifactRoot: null,
      artifactStatus: "ready",
      artifactReason: null,
    };
  } catch (error) {
    return {
      raw: new Map(),
      movingAverage: new Map(),
      comparison: new Map(),
      baseline: null,
      valid: false,
      status: "invalid",
      reason: error instanceof Error ? error.message : "CTI長期系列の検証に失敗しました",
      artifactRoot: null,
      artifactStatus: "unavailable",
      artifactReason: null,
    };
  }
}

/** Load only the fixed nominal basic series used by Plan37's comparison line. */
export function loadCtiBasicConsumptionOutput(root = CTI_BASIC_2025_ROOT): CtiConsumptionOutput {
  const artifact = artifactMetadata(root);
  try {
    const records = loadCtiBasicSeries2025("nominal", root).filter(
      (record) =>
        record.seriesIndex === 1 &&
        record.officialSeriesCode === "1" &&
        record.seriesName === "消費支出（名目）",
    );
    return { ...buildCtiBasicConsumptionOutput(records), ...artifact };
  } catch (error) {
    return {
      raw: new Map(),
      movingAverage: new Map(),
      comparison: new Map(),
      baseline: null,
      valid: false,
      status: "invalid",
      reason: error instanceof Error ? error.message : "CTI長期系列の検証に失敗しました",
      ...artifact,
    };
  }
}

export function getCtiBasicConsumptionStatus(
  root = CTI_BASIC_2025_ROOT,
): CtiBasicConsumptionStatus {
  const output = loadCtiBasicConsumptionOutput(root);
  return {
    valid: output.valid,
    baseline: output.baseline,
    reason: output.reason,
    artifactRoot: output.artifactRoot,
    artifactStatus: output.artifactStatus,
    artifactReason: output.artifactReason,
  };
}
