import { createHash } from "node:crypto";
import fs from "node:fs";
import type { CpiData } from "@/types";
import Papa from "papaparse";
import {
  SUPPORT_SERIES_KEY_NOMINAL,
  CTI_NOMINAL_DERIVED_TOTAL_KEY,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
} from "@/lib/chartConstants";
import { normalizeYearMonth } from "@/lib/yearMonth";
import { calculateQuarter } from "@/lib/math/quarter";
import type { QuarterlyRow } from "@/types/chart";
import type { QuarterlyGdpData } from "@server/lib/data-loader/cpi";
import { joinQuarterlyGdpRows } from "./quarterlyGdpTransform";
import { isCompleteCtiQuarter } from "@/lib/math/quarterlyCompleteness";
import {
  aggregateCtiBasicNominalQuarterly,
  loadCtiBasicSeries2025,
  type CtiBasicRecord,
  type CtiQuarterlyAggregation,
} from "../ctiBasicSeries2025LongTerm";
import {
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY,
} from "@/lib/chartConstants";
import type { CtiAdjustedV2Result } from "../ctiAdjustedConnectionEstimateV2";
import { loadCtiAdjustedV2Estimate } from "../data-loader/ctiAdjusted";
import type { SeriesMeasurement } from "@/types/chart";
import { buildCtiFilePaths } from "../dataIo";

export type { QuarterlyRow } from "@/types/chart";

const PLAN38_START_YEAR = 2005;
const PLAN38_END_YEAR = 2017;

/** Build the fixed 52-row Plan38 nominal support projection without GDP or zero-fill. */
export function buildPlan38CtiNominalRows(quarterly: CtiQuarterlyAggregation): QuarterlyRow[] {
  const rows: QuarterlyRow[] = [];
  for (let year = PLAN38_START_YEAR; year <= PLAN38_END_YEAR; year += 1) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const label = `${year}Q${quarter}`;
      const measurement = quarterly.measurements.get(label)!;
      rows.push({
        label,
        quarter,
        年: year,
        年月: `${year}年${(quarter - 1) * 3 + 1}月`,
        kind: "legacy-cti",
        [SUPPORT_SERIES_KEY_NOMINAL]: measurement.value,
        measurements: { [SUPPORT_SERIES_KEY_NOMINAL]: measurement },
      } as QuarterlyRow);
    }
  }
  return rows;
}

export function buildPlan38CtiNominalRowsFromRecords(
  records: readonly CtiBasicRecord[],
): QuarterlyRow[] {
  return buildPlan38CtiNominalRows(aggregateCtiBasicNominalQuarterly(records));
}

const PLAN39_START_YEAR = 2005;
const PLAN39_END_YEAR = 2016;
const PLAN39_CATEGORY_SERIES: Record<string, number> = {
  総合: 1,
  食料: 2,
  住居: 3,
  "光熱・水道": 4,
  "家具・家事用品": 5,
  被服及び履物: 6,
  保健医療: 7,
  "交通・通信": 8,
  教育: 9,
  教養娯楽: 10,
  その他の消費支出: 11,
};

const PLAN40_PUBLIC_EXPENSE_CATEGORIES = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
  (category) => category !== "総合",
);

// Plan39's source seriesIndex is an artifact contract, so it remains separate.
// Public key ownership is intentionally derived from the shared Plan40 registry.
const PLAN40_PUBLIC_KEY_BY_CATEGORY = Object.fromEntries(
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY.map((entry) => [entry.category, entry.key]),
) as Record<(typeof CTI_ADJUSTED_V2_PUBLIC_CATEGORIES)[number], string>;

if (
  PLAN40_PUBLIC_EXPENSE_CATEGORIES.map((category) => PLAN40_PUBLIC_KEY_BY_CATEGORY[category]).join(
    "\u0000",
  ) !==
  CTI_ADJUSTED_V2_PUBLIC_REGISTRY.filter((entry) => entry.category !== "総合")
    .map((entry) => entry.key)
    .join("\u0000")
) {
  throw new Error("Plan40 quarterly generation registry/key order mismatch");
}

const plan39InvalidMeasurement = (
  key: string,
  reason: string,
  annualAnchorType: "estimated" | "official",
  inputFingerprint?: string,
  plan40Metadata?: {
    baseYear: number;
    rawRange: { startYear: number; endYear: number };
    adoptedRange: { startYear: number; endYear: number };
  },
): SeriesMeasurement => ({
  key,
  label: key,
  unit: "指数",
  source:
    annualAnchorType === "official"
      ? "e-Stat 公式CTI調整系列 四半期表2-1-1 / 000040499087"
      : "e-Stat 公式CTI長期artifact 000040499070 / Plan39-v2 bottom-up",
  valueType: "comparison",
  value: null,
  status: "unavailable",
  reason,
  frequency: "quarterly",
  aggregation: "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_annual",
  seriesType: "unavailable",
  official: false,
  annualAnchorType,
  quarterlyDerived: true,
  model: "v2-bottom-up",
  estimateVersion: "plan39-v2",
  inputFingerprint,
  ...plan40Metadata,
});

type Plan39QuarterlyOptions = {
  records: readonly CtiBasicRecord[];
  result: CtiAdjustedV2Result;
  officialQuarterly?: readonly OfficialNominalQuarter[] | null;
  /** Legacy call-site compatibility only; runtime/basic monthly data is never used here. */
  runtimeCtiData?: readonly CpiData[];
  runtimeMetadata?: unknown;
};

type OfficialNominalQuarter = {
  label: string;
  year: number;
  quarter: number;
  values: Record<string, number | null>;
};

type OfficialQuarterMetadata = {
  schemaVersion?: string;
  revision?: string;
  source?: string;
  artifact?: string;
  statisticalCode?: string;
  statInfId?: string;
  officialPageUrl?: string;
  downloadUrl?: string;
  baseYear?: number;
  unit?: string;
  valueType?: string;
  seriesClassification?: string;
  householdScope?: string;
  frequency?: string;
  sourceSheet?: string;
  sourceFormat?: string;
  sourceWorkbook?: { path?: string; fileName?: string };
  columnMapping?: unknown;
  sha256?: string;
  sourceSha256?: string;
  csvSha256?: string;
  rawRange?: { start?: string; end?: string; rows?: number };
  adoptedRange?: { start?: string; end?: string; rows?: number };
};

const OFFICIAL_QUARTERLY_CATEGORY_KEYS = [
  "総合",
  ...PLAN40_PUBLIC_EXPENSE_CATEGORIES.filter((category) => category !== "その他の消費支出"),
];
const OFFICIAL_QUARTERLY_SOURCE_WORKBOOK =
  "data/source/official-cti-2025/cti-distribution-adjusted-000040499087.xlsx";
const OFFICIAL_QUARTERLY_COLUMN_MAPPING = [
  { column: "B", header: null, canonicalSeries: "period", sourceRole: "coded_period" },
  { column: "H", header: "時間軸コード", canonicalSeries: "period", sourceRole: "period_code" },
  { column: "I", header: "四半期平均", canonicalSeries: "period", sourceRole: "period_label" },
  ...OFFICIAL_QUARTERLY_CATEGORY_KEYS.map((category, index) => ({
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
const OFFICIAL_QUARTERLY_MAJOR_CATEGORIES = [...OFFICIAL_QUARTERLY_CATEGORY_KEYS];
const officialQuarterlySourceColumn = (category: string) => {
  const index = OFFICIAL_QUARTERLY_MAJOR_CATEGORIES.indexOf(category);
  return index < 0 ? undefined : String.fromCharCode("J".charCodeAt(0) + index);
};
const officialQuarterlyDerivedColumns = Array.from({ length: 10 }, (_, index) =>
  String.fromCharCode("J".charCodeAt(0) + index),
);

function loadOfficialNominalQuarterly(): OfficialNominalQuarter[] | null {
  const paths = buildCtiFilePaths();
  try {
    const csv = fs.readFileSync(paths.candidateDistributionAdjustedQuarterly, "utf8");
    const metadataBytes = fs.readFileSync(paths.candidateDistributionAdjustedQuarterlyMetadata);
    const metadata = JSON.parse(metadataBytes.toString("utf8")) as OfficialQuarterMetadata;
    const manifest = JSON.parse(
      fs.readFileSync("data/source/cti-adjusted/manifest.json", "utf8"),
    ) as { revision?: string; artifacts?: Record<string, Record<string, unknown>> };
    const annualA = JSON.parse(fs.readFileSync("data/source/cti-adjusted/A.json", "utf8")) as {
      metadata?: { revision?: string; sourceSha256?: string };
    };
    const annualABytes = fs.readFileSync("data/source/cti-adjusted/A.json");
    const entry = manifest.artifacts?.quarterlyNominal;
    const annualEntry = manifest.artifacts?.A;
    const csvSha256 = createHash("sha256").update(csv).digest("hex");
    const metadataSha256 = createHash("sha256").update(metadataBytes).digest("hex");
    const expectedUrl =
      "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000040499087";
    if (
      metadata.schemaVersion !== "plan39-quarterly-nominal-v1" ||
      typeof metadata.revision !== "string" ||
      metadata.revision.trim() === "" ||
      metadata.source !== "総務省統計局 e-Stat CTI" ||
      metadata.artifact !== "cti_data2025_distribution_adjusted_quarterly.csv" ||
      metadata.statisticalCode !== "00200567" ||
      metadata.statInfId !== "000040499087" ||
      metadata.officialPageUrl !== expectedUrl ||
      metadata.downloadUrl !== expectedUrl ||
      metadata.baseYear !== 2025 ||
      metadata.unit !== "指数" ||
      metadata.valueType !== "原数値（名目指数）" ||
      metadata.seriesClassification !== "調整系列・分布調整値（原数値）" ||
      metadata.householdScope !== "総世帯" ||
      metadata.frequency !== "quarterly" ||
      metadata.sourceSheet !== "総・四(原)" ||
      metadata.sourceFormat !== "xlsx" ||
      metadata.sourceWorkbook?.path !== OFFICIAL_QUARTERLY_SOURCE_WORKBOOK ||
      metadata.sourceWorkbook?.fileName !== "cti-distribution-adjusted-000040499087.xlsx" ||
      JSON.stringify(metadata.columnMapping) !==
        JSON.stringify(OFFICIAL_QUARTERLY_COLUMN_MAPPING) ||
      typeof metadata.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(metadata.sha256) ||
      metadata.sourceSha256 !== metadata.sha256 ||
      typeof metadata.csvSha256 !== "string" ||
      csvSha256 !== metadata.csvSha256 ||
      createHash("sha256")
        .update(fs.readFileSync(OFFICIAL_QUARTERLY_SOURCE_WORKBOOK))
        .digest("hex") !== metadata.sourceSha256 ||
      metadata.revision !== manifest.revision ||
      metadata.revision !== annualA.metadata?.revision ||
      metadata.sourceSha256 !== annualA.metadata?.sourceSha256 ||
      annualEntry?.path !== "A.json" ||
      annualEntry?.sha256 !== createHash("sha256").update(annualABytes).digest("hex") ||
      entry?.path !== "../cti_data2025_distribution_adjusted_quarterly.csv" ||
      entry?.metadataPath !== "../cti_data2025_distribution_adjusted_quarterly.metadata.json" ||
      entry?.sha256 !== csvSha256 ||
      entry?.metadataSha256 !== metadataSha256 ||
      entry?.revision !== metadata.revision ||
      entry?.sourceSha256 !== metadata.sourceSha256
    )
      return null;
    const parsed = Papa.parse<Record<string, string | number>>(csv, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    if (
      parsed.errors.length ||
      parsed.meta.fields?.join("\u0000") !==
        [
          "period",
          ...[...OFFICIAL_QUARTERLY_CATEGORY_KEYS, "その他の消費支出"].filter(
            (category, index, all) => all.indexOf(category) === index,
          ),
        ].join("\u0000")
    )
      return null;
    const rows: OfficialNominalQuarter[] = [];
    for (const row of parsed.data) {
      const match = typeof row.period === "string" ? row.period.match(/^(\d{4})Q([1-4])$/) : null;
      if (!match) return null;
      const year = Number(match[1]);
      const quarter = Number(match[2]);
      const values: Record<string, number | null> = {};
      for (const category of [...OFFICIAL_QUARTERLY_CATEGORY_KEYS, "その他の消費支出"]) {
        const value = row[category];
        values[category] =
          value === "-" || value === "" ? null : typeof value === "number" ? value : null;
      }
      if (
        OFFICIAL_QUARTERLY_CATEGORY_KEYS.some(
          (category) => typeof values[category] !== "number" || !Number.isFinite(values[category]),
        )
      )
        return null;
      rows.push({ label: match[0], year, quarter, values });
    }
    const indexOf = (row: OfficialNominalQuarter) => row.year * 4 + row.quarter - 1;
    if (
      rows.length === 0 ||
      rows[0].label !== "2017Q1" ||
      rows.some((row, index) => index > 0 && indexOf(row) !== indexOf(rows[index - 1]) + 1) ||
      metadata.rawRange?.start !== rows[0].label ||
      metadata.rawRange?.end !== rows.at(-1)?.label ||
      metadata.rawRange?.rows !== rows.length ||
      metadata.adoptedRange?.start !== rows[0].label ||
      metadata.adoptedRange?.end !== rows.at(-1)?.label ||
      metadata.adoptedRange?.rows !== rows.length
    )
      return null;
    return rows;
  } catch {
    return null;
  }
}

/** Builds historical nominal estimates through 2016 and direct official quarters from 2017. */
export function buildPlan39V2CtiNominalRows({
  records,
  result,
  officialQuarterly,
}: Plan39QuarterlyOptions): QuarterlyRow[] {
  const rowsByYear = new Map(result.rows.map((row) => [row.year, row]));
  const bySeriesMonth = new Map<number, Map<string, number>>();
  const duplicateYears = new Set<number>();
  for (let seriesIndex = 1; seriesIndex <= 10; seriesIndex += 1) {
    const values = new Map<string, number>();
    const seenMonths = new Set<string>();
    for (const record of records) {
      if (record.variant !== "nominal" || record.seriesIndex !== seriesIndex) continue;
      if (!/^20(?:0[5-9]|1[0-6])-\d{2}$/.test(record.month)) continue;
      if (seenMonths.has(record.month)) duplicateYears.add(Number(record.month.slice(0, 4)));
      seenMonths.add(record.month);
      if (
        !record.isMissing &&
        typeof record.rawValue === "number" &&
        Number.isFinite(record.rawValue)
      )
        values.set(record.month, record.rawValue);
    }
    bySeriesMonth.set(seriesIndex, values);
  }

  const byCategoryMonth = new Map<string, Map<string, number>>();
  for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES) {
    const seriesIndex = PLAN39_CATEGORY_SERIES[category];
    if (seriesIndex !== 11)
      byCategoryMonth.set(category, bySeriesMonth.get(seriesIndex) ?? new Map());
  }
  const residualValues = new Map<string, number>();
  for (let year = PLAN39_START_YEAR; year <= PLAN39_END_YEAR; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const total = bySeriesMonth.get(1)?.get(monthKey);
      const components = Array.from({ length: 9 }, (_, index) =>
        bySeriesMonth.get(index + 2)?.get(monthKey),
      );
      if (
        typeof total === "number" &&
        Number.isFinite(total) &&
        components.every((value) => typeof value === "number" && Number.isFinite(value))
      ) {
        residualValues.set(
          monthKey,
          total - components.reduce<number>((sum, value) => sum + (value ?? 0), 0),
        );
      }
    }
  }
  byCategoryMonth.set("その他の消費支出", residualValues);

  const output: QuarterlyRow[] = [];
  for (let year = PLAN39_START_YEAR; year <= PLAN39_END_YEAR; year += 1) {
    const annual = rowsByYear.get(year);
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const label = `${year}Q${quarter}`;
      const candidates = PLAN40_PUBLIC_EXPENSE_CATEGORIES.map((category) => {
        const values = byCategoryMonth.get(category);
        const monthKeys = Array.from(
          { length: 12 },
          (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
        );
        const quarterKeys = [1, 2, 3].map(
          (offset) => `${year}-${String((quarter - 1) * 3 + offset).padStart(2, "0")}`,
        );
        const yearValues = monthKeys.map((month) => values?.get(month));
        const quarterValues = quarterKeys.map((month) => values?.get(month));
        const anchor = annual?.values[category];
        const seasonalValues = [...yearValues, ...quarterValues];
        const invalid = duplicateYears.has(year)
          ? "duplicate_month"
          : seasonalValues.some((value) => typeof value !== "number" || !Number.isFinite(value))
            ? "insufficient_months"
            : category !== "その他の消費支出" && seasonalValues.some((value) => (value ?? 0) <= 0)
              ? "invalid_seasonal_input"
              : result.plan40InputValidation && !result.plan40InputValidation.valid
                ? "v2_annual_anchor_unavailable"
                : !result.publicationGate.accepted ||
                    annual?.status !== "available" ||
                    typeof anchor !== "number" ||
                    !Number.isFinite(anchor) ||
                    (category !== "その他の消費支出" && anchor <= 0)
                  ? "v2_annual_anchor_unavailable"
                  : null;
        if (invalid)
          return {
            category,
            key: PLAN40_PUBLIC_KEY_BY_CATEGORY[category],
            value: null,
            reason: invalid,
          };
        const annualMean = yearValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 12;
        const quarterMean = quarterValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 3;
        const projected =
          (category === "その他の消費支出" ? Math.abs(annualMean) > 0 : annualMean > 0) &&
          typeof anchor === "number"
            ? (anchor * quarterMean) / annualMean
            : null;
        return {
          category,
          key: PLAN40_PUBLIC_KEY_BY_CATEGORY[category],
          value: projected !== null && Number.isFinite(projected) ? projected : null,
          reason:
            projected !== null && Number.isFinite(projected)
              ? null
              : "non_finite_seasonal_projection",
        };
      });
      const commonReason = candidates.find((item) => item.reason)?.reason ?? null;
      const values: Record<string, number | null> = {};
      const measurements: Record<string, SeriesMeasurement> = {};
      for (const candidate of candidates) {
        values[candidate.key] = commonReason ? null : candidate.value;
        measurements[candidate.key] = commonReason
          ? plan39InvalidMeasurement(
              candidate.key,
              commonReason,
              "estimated",
              result.inputFingerprint,
              result.plan40InputMetadata?.A,
            )
          : {
              key: candidate.key,
              label: candidate.key,
              unit: "指数",
              source: "e-Stat 公式CTI長期artifact 000040499070 / Plan39-v2 bottom-up",
              valueType: "comparison",
              value: candidate.value,
              status: "available",
              reason: null,
              frequency: "quarterly",
              aggregation: "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_annual",
              seriesType: "estimated_adjusted",
              official: false,
              annualAnchorType: "estimated",
              quarterlyDerived: true,
              model: "v2-bottom-up",
              estimateVersion: "plan39-v2",
              inputFingerprint: result.inputFingerprint,
              ...result.plan40InputMetadata?.A,
            };
      }
      const totalMonths = Array.from(
        { length: 12 },
        (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
      );
      const totalQuarterMonths = [1, 2, 3].map(
        (offset) => `${year}-${String((quarter - 1) * 3 + offset).padStart(2, "0")}`,
      );
      const totalMonthValues = totalMonths.map((month) => bySeriesMonth.get(1)?.get(month));
      const totalQuarterValues = totalQuarterMonths.map((month) =>
        bySeriesMonth.get(1)?.get(month),
      );
      const totalAnchor = annual?.values.総合;
      const totalMean = totalMonthValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 12;
      const totalReason = duplicateYears.has(year)
        ? "duplicate_month"
        : [...totalMonthValues, ...totalQuarterValues].some(
              (value) => typeof value !== "number" || !Number.isFinite(value),
            )
          ? "insufficient_months"
          : !result.publicationGate.accepted ||
              (result.plan40InputValidation && !result.plan40InputValidation.valid) ||
              annual?.status !== "available" ||
              typeof totalAnchor !== "number" ||
              !Number.isFinite(totalAnchor) ||
              Math.abs(totalMean) <= 0
            ? "v2_annual_anchor_unavailable"
            : null;
      const quarterlyTotal = totalReason
        ? null
        : (totalAnchor! *
            (totalQuarterValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 3)) /
          totalMean;
      const validQuarterlyTotal =
        quarterlyTotal !== null && Number.isFinite(quarterlyTotal) ? quarterlyTotal : null;
      values[CTI_NOMINAL_DERIVED_TOTAL_KEY] = validQuarterlyTotal;
      measurements[CTI_NOMINAL_DERIVED_TOTAL_KEY] = {
        key: CTI_NOMINAL_DERIVED_TOTAL_KEY,
        label: CTI_NOMINAL_DERIVED_TOTAL_KEY,
        unit: "指数",
        source: "e-Stat 公式CTI長期artifact 000040499070 / Plan39-v2 bottom-up",
        valueType: "comparison",
        value: validQuarterlyTotal,
        status: validQuarterlyTotal === null ? "unavailable" : "available",
        reason:
          validQuarterlyTotal === null ? (totalReason ?? "non_finite_seasonal_projection") : null,
        frequency: "quarterly",
        aggregation: "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_annual",
        seriesType: "estimated_adjusted",
        official: false,
        annualAnchorType: "estimated",
        quarterlyDerived: true,
        model: "v2-bottom-up",
        estimateVersion: "plan39-v2",
        inputFingerprint: result.inputFingerprint,
        ...result.plan40InputMetadata?.A,
      };
      output.push({
        label,
        quarter,
        年: year,
        年月: `${year}年${(quarter - 1) * 3 + 1}月`,
        kind: "plan40-v2-cost-stack",
        ...values,
        measurements,
      });
    }
  }

  const officialRows = officialQuarterly ?? [];
  const sourceLabel =
    "e-Stat 公式Excel cti-distribution-adjusted-000040499087.xlsx / 総・四(原) / 000040499087";
  for (const official of officialRows) {
    const total = official.values.総合;
    const componentCategories = PLAN40_PUBLIC_EXPENSE_CATEGORIES.filter(
      (category) => category !== "その他の消費支出",
    );
    const componentValues = componentCategories.map((category) => official.values[category]);
    const residual =
      typeof total === "number" && componentValues.every((value) => typeof value === "number")
        ? Math.round(
            (total - componentValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)) * 10,
          ) / 10
        : null;
    const values: Record<string, number | null> = {};
    const measurements: Record<string, SeriesMeasurement> = {};
    const nominalTotal =
      total !== null && typeof total === "number" && Number.isFinite(total) ? total : null;
    values[CTI_NOMINAL_DERIVED_TOTAL_KEY] = nominalTotal;
    measurements[CTI_NOMINAL_DERIVED_TOTAL_KEY] = {
      key: CTI_NOMINAL_DERIVED_TOTAL_KEY,
      label: CTI_NOMINAL_DERIVED_TOTAL_KEY,
      unit: "指数",
      source: sourceLabel,
      sourceId: "000040499087",
      statInfId: "000040499087",
      householdScope: "総世帯",
      sourceWorkbook: OFFICIAL_QUARTERLY_SOURCE_WORKBOOK,
      sourceSheet: "総・四(原)",
      sourceColumn: officialQuarterlySourceColumn("総合"),
      sourceRole: "official_nominal_total_observation",
      canonicalSeries: "総合",
      valueType: "comparison",
      value: nominalTotal,
      status: nominalTotal === null ? "unavailable" : "available",
      reason: nominalTotal === null ? "official_quarterly_value_unavailable" : null,
      frequency: "quarterly",
      aggregation: "official_quarterly_adjusted_nominal_total_observation",
      official: true,
      annualAnchorType: "official",
      quarterlyDerived: false,
      baseYear: 2025,
    };
    for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES) {
      const key = PLAN40_PUBLIC_KEY_BY_CATEGORY[category];
      const value = category === "その他の消費支出" ? residual : official.values[category];
      const valid =
        typeof value === "number" &&
        Number.isFinite(value) &&
        (category === "その他の消費支出" || value > 0);
      values[key] = valid ? value : null;
      measurements[key] = {
        key,
        label: key,
        unit: "指数",
        source: sourceLabel,
        sourceId: "000040499087",
        statInfId: "000040499087",
        householdScope: "総世帯",
        sourceWorkbook: OFFICIAL_QUARTERLY_SOURCE_WORKBOOK,
        sourceSheet: "総・四(原)",
        sourceColumn: officialQuarterlySourceColumn(category),
        sourceRole:
          category === "その他の消費支出" ? "derived_residual" : "official_nominal_observation",
        sourceDerivedFromColumns:
          category === "その他の消費支出" ? officialQuarterlyDerivedColumns : undefined,
        canonicalSeries: category,
        valueType: "comparison",
        value: valid ? value : null,
        status: valid ? "available" : "unavailable",
        reason: valid ? null : "official_quarterly_value_unavailable",
        frequency: "quarterly",
        aggregation:
          category === "その他の消費支出"
            ? "derived_quarterly_residual_from_official_nominal_total_minus_nine_categories"
            : "official_quarterly_adjusted_nominal_observation",
        seriesType: category === "その他の消費支出" ? "estimated_adjusted" : "official_adjusted",
        official: category !== "その他の消費支出",
        annualAnchorType: "official",
        quarterlyDerived: category === "その他の消費支出",
        baseYear: 2025,
      };
    }
    output.push({
      label: official.label,
      quarter: official.quarter,
      年: official.year,
      年月: `${official.year}年${(official.quarter - 1) * 3 + 1}月`,
      kind: "plan40-official-quarterly",
      ...values,
      measurements,
    });
  }
  if (officialQuarterly === null) {
    // Preserve valid 2005-2016 historical estimates, while making the missing official period explicit.
    const label = "2017Q1";
    const values: Record<string, number | null> = {};
    const measurements: Record<string, SeriesMeasurement> = {};
    for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES) {
      const key = PLAN40_PUBLIC_KEY_BY_CATEGORY[category];
      values[key] = null;
      measurements[key] = {
        key,
        label: key,
        unit: "指数",
        source: sourceLabel,
        sourceId: "000040499087",
        statInfId: "000040499087",
        householdScope: "総世帯",
        sourceWorkbook: OFFICIAL_QUARTERLY_SOURCE_WORKBOOK,
        sourceSheet: "総・四(原)",
        sourceColumn: officialQuarterlySourceColumn(category),
        sourceRole: "official_quarterly_source_unavailable",
        sourceDerivedFromColumns:
          category === "その他の消費支出" ? officialQuarterlyDerivedColumns : undefined,
        canonicalSeries: category,
        valueType: "comparison",
        value: null,
        status: "unavailable",
        reason: "official_quarterly_source_unavailable_latest_period_unknown",
        frequency: "quarterly",
        aggregation: "official_quarterly_source_unavailable_latest_period_unknown",
        seriesType: "unavailable",
        official: false,
        annualAnchorType: "official",
        quarterlyDerived: false,
        baseYear: 2025,
      };
    }
    output.push({
      label,
      quarter: 1,
      年: 2017,
      年月: "2017年1月",
      kind: "plan40-official-quarterly",
      ...values,
      measurements,
    });
  }
  return output;
}

export function loadPlan39V2CtiNominalRows(
  result: CtiAdjustedV2Result,
  _runtimeCtiData?: readonly CpiData[],
  _runtimeMetadata?: unknown,
): QuarterlyRow[] {
  let records: CtiBasicRecord[] = [];
  try {
    records = loadCtiBasicSeries2025("nominal");
  } catch {
    // Official 2017+ quarters remain usable when the historical seasonal input fails.
  }
  return buildPlan39V2CtiNominalRows({
    records,
    result,
    officialQuarterly: loadOfficialNominalQuarterly(),
  });
}

/** Merge quarterly rows for the same period, preferring direct official Plan40 observations by key. */
export function coalesceQuarterlyRowsByPeriod(rows: readonly QuarterlyRow[]): QuarterlyRow[] {
  const byPeriod = new Map<string, QuarterlyRow>();
  for (const row of rows) {
    const period = `${row.年}Q${row.quarter}`;
    const existing = byPeriod.get(period);
    if (!existing) {
      byPeriod.set(period, { ...row, measurements: row.measurements && { ...row.measurements } });
      continue;
    }

    const existingIsOfficial = existing.kind === "plan40-official-quarterly";
    const incomingIsOfficial = row.kind === "plan40-official-quarterly";
    const preferred =
      incomingIsOfficial && !existingIsOfficial ? row : existingIsOfficial ? existing : row;
    const fallback = preferred === row ? existing : row;
    byPeriod.set(period, {
      ...fallback,
      ...preferred,
      kind: preferred.kind ?? fallback.kind,
      measurements: {
        ...fallback.measurements,
        ...preferred.measurements,
      },
    });
  }

  const merged = [...byPeriod.values()];
  const labels = new Set<string>();
  for (const row of merged) {
    if (labels.has(row.label))
      throw new Error(`Duplicate quarterly label after merge: ${row.label}`);
    labels.add(row.label);
  }
  return merged;
}

/** Existing adapter name retained for callers of the aggregation module. */
export function mergeQuarterlyGdpRows(
  nominalRows: QuarterlyRow[],
  realRows: QuarterlyRow[],
  gdp: QuarterlyGdpData,
): { nominal: QuarterlyRow[]; real: QuarterlyRow[] } {
  return joinQuarterlyGdpRows(nominalRows, realRows, gdp);
}

/**
 * Compute quarterly aggregates from monthly CTI data.
 * This is the server-side extraction of computeChartData logic (formerly client-side).
 * @param ctiData Monthly CTI data (388 rows × 30 columns)
 * @param maxCpiDate Latest available date { year, month }
 * @returns { nominal: QuarterlyRow[], real: QuarterlyRow[] }
 */
export function computeQuarterlyAggregates(
  ctiData: CpiData[],
  maxCpiDate: { year: number; month: number },
): { nominal: QuarterlyRow[]; real: QuarterlyRow[] } {
  const nominalKeys = CONSUMPTION_NOMINAL_KEYS;
  const realKeys = CONSUMPTION_REAL_KEYS;

  // Normalize 年月 to canonical form "YYYY年M月"
  const normalizedData: CpiData[] = ctiData.map((d) => ({
    ...d,
    年月: normalizeYearMonth(String(d.年月 || "")),
  }));

  // Determine year range: use all data from 1994 up to maxCpiDate.year
  let minYear = 1994;
  let maxYear = maxCpiDate.year;
  for (const d of normalizedData) {
    const m = String(d.年月).match(/^(\d{4})年/);
    if (m) {
      const y = parseInt(m[1], 10);
      minYear = Math.min(minYear, y);
      maxYear = Math.max(maxYear, y);
    }
  }
  maxYear = Math.min(maxYear, maxCpiDate.year);

  // Create a map of all available months from the data
  const dataMap = new Map(normalizedData.map((d) => [d.年月, d]));
  const allMonths: string[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    for (let m = 1; m <= 12; m++) {
      allMonths.push(`${y}年${m}月`);
    }
  }

  // Fill missing monthly category values for the legacy expense stack only.
  // The pre-2018 CTI nominal support line is built from the dedicated artifact
  // below and must never pass through this compatibility path.
  const filledData: CpiData[] = allMonths.map((yearMonth) => {
    if (dataMap.has(yearMonth)) {
      return dataMap.get(yearMonth)!;
    }
    const emptyItem: CpiData = { 年月: yearMonth } as CpiData;
    [...nominalKeys, ...realKeys].forEach((key) => {
      (emptyItem as Record<string, unknown>)[key] = 0;
    });
    return emptyItem;
  });

  const dataMapFilled = new Map(filledData.map((d) => [d.年月, d]));
  const ctiKeys = [...new Set([...nominalKeys, ...realKeys])];

  // Helper to compute quarterly data
  const getQuarterlyData = (keys: string[]) => {
    const rows: QuarterlyRow[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      const maxQ = y === maxCpiDate.year ? calculateQuarter(maxCpiDate.month) : 4;
      for (let q = 1; q <= maxQ; q++) {
        const months =
          q === 1 ? [1, 2, 3] : q === 2 ? [4, 5, 6] : q === 3 ? [7, 8, 9] : [10, 11, 12];
        const label = `${y}Q${q}`;
        const startMonth = (q - 1) * 3 + 1;
        const item: QuarterlyRow = {
          label,
          quarter: q,
          年: y,
          年月: `${y}年${startMonth}月`,
          kind: "legacy-cti",
        };

        keys.forEach((k) => (item[k] = 0));

        months.forEach((m) => {
          const monthStr = `${y}年${m}月`;
          const row = dataMapFilled.get(monthStr);
          if (row) {
            keys.forEach((k) => {
              const v = row[k as keyof CpiData];
              if (typeof v === "number") {
                item[k] = ((item[k] as number) || 0) + v;
              }
            });
          }
        });

        if (keys.length > 0 && !isCompleteCtiQuarter(dataMap, y, q, ctiKeys)) continue;

        // Divide by 3 to get quarterly average
        keys.forEach((k) => {
          item[k] = ((item[k] as number) || 0) / 3;
        });
        rows.push(item);
      }
    }
    return rows;
  };

  const legacyNominalRows = getQuarterlyData(nominalKeys);
  const nominalRows = legacyNominalRows.filter(
    (row) => row.年 < PLAN38_START_YEAR || row.年 > PLAN38_END_YEAR,
  );
  const realRows = getQuarterlyData(realKeys);

  nominalRows.push(
    ...loadPlan39V2CtiNominalRows(
      loadCtiAdjustedV2Estimate({ contract: "plan39", validatePlan40Inputs: true }),
    ),
  );
  const coalescedNominalRows = coalesceQuarterlyRowsByPeriod(nominalRows);
  coalescedNominalRows.sort((left, right) => left.年 - right.年 || left.quarter - right.quarter);

  return {
    nominal: coalescedNominalRows,
    real: realRows,
  };
}
