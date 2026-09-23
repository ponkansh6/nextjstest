import type { CpiData } from "@/types";
import {
  SUPPORT_SERIES_KEY_NOMINAL,
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
import type { CtiRuntimeMetadata } from "../data-loader/cpi";

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
const PLAN39_END_YEAR = 2017;
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
  plan40Metadata?: {
    baseYear: number;
    rawRange: { startYear: number; endYear: number };
    adoptedRange: { startYear: number; endYear: number };
  },
  runtimeSource = false,
  runtimeMetadata?: CtiRuntimeMetadata,
  bridgeCoefficient?: number,
): SeriesMeasurement => ({
  key,
  label: key,
  unit: "指数",
  source: runtimeSource
    ? `e-Stat 公式CTI runtime T ${runtimeMetadata?.statInfId ?? "unavailable"} / Plan41 bridge`
    : annualAnchorType === "official"
      ? "e-Stat 公式CTIミクロ調整系列 A / Plan39-v2"
      : "e-Stat 公式CTI長期artifact 000040499070 / Plan39-v2 bottom-up",
  valueType: "comparison",
  value: null,
  status: "unavailable",
  reason,
  frequency: "quarterly",
  aggregation:
    bridgeCoefficient !== undefined
      ? "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_plan41_bridge"
      : "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_annual",
  seriesType: "unavailable",
  official: false,
  annualAnchorType,
  quarterlyDerived: true,
  model: "v2-bottom-up",
  estimateVersion: "plan39-v2",
  ...(runtimeSource
    ? {
        sourceId: runtimeMetadata?.statInfId,
        statInfId: runtimeMetadata?.statInfId,
        householdScope: runtimeMetadata?.householdScope,
        seasonalitySourceId: runtimeSource ? runtimeMetadata?.statInfId : "000040499070",
        targetSourceId: runtimeMetadata?.statInfId,
        targetHouseholdScope: runtimeMetadata?.householdScope,
        bridgeAppliedRange: runtimeMetadata ? { startYear: 2005, endYear: 2017 } : undefined,
        bridgeCoefficient,
      }
    : {}),
  ...plan40Metadata,
  ...(runtimeSource
    ? {
        baseYear: runtimeMetadata?.baseYear,
        rawRange: runtimeMetadata?.rawRange,
        adoptedRange: runtimeMetadata?.adoptedRange,
      }
    : {}),
});

type Plan39QuarterlyOptions = {
  records: readonly CtiBasicRecord[];
  result: CtiAdjustedV2Result;
  /** Runtime-selected CTI (T) used for the 2017 bridge and 2017 seasonality. */
  runtimeCtiData?: readonly CpiData[];
  runtimeMetadata?: CtiRuntimeMetadata;
};

const PLAN41_RUNTIME_CATEGORY_KEYS: Record<string, string> = {
  総合: "消費支出（名目）",
  食料: "食料（名目）",
  住居: "住居（名目）",
  "光熱・水道": "光熱・水道（名目）",
  "家具・家事用品": "家具・家事用品（名目）",
  被服及び履物: "被服及び履物（名目）",
  保健医療: "保健医療（名目）",
  "交通・通信": "交通・通信（名目）",
  教育: "教育（名目）",
  教養娯楽: "教養娯楽（名目）",
};

type RuntimeBridge = {
  byCategoryMonth: Map<string, Map<string, number>>;
  invalid2017: Set<string>;
  coefficients: Map<string, number>;
  valid: boolean;
  reason: string;
  reasonByCategory: Map<string, string>;
};

function buildPlan41RuntimeBridge(
  data: readonly CpiData[] | undefined,
  metadata: CtiRuntimeMetadata | undefined,
  annualAnchors: Record<string, number | null | undefined> | undefined,
): RuntimeBridge {
  const byCategoryMonth = new Map<string, Map<string, number>>();
  const invalid2017 = new Set<string>();
  const coefficients = new Map<string, number>();
  const reasonByCategory = new Map<string, string>();
  const all2017Rows = (data ?? []).filter((row) => String(row.年月).startsWith("2017年"));
  const malformed2017Rows = all2017Rows.some(
    (row) => !/^2017年(?:[1-9]|1[0-2])月$/.test(String(row.年月)),
  );
  const rows = all2017Rows.filter((row) => /^2017年(?:[1-9]|1[0-2])月$/.test(String(row.年月)));
  let reason = "runtime_t_unavailable";
  if (
    metadata &&
    metadata.statInfId === "000040499069" &&
    metadata.baseYear === 2025 &&
    metadata.householdScope === "総世帯" &&
    metadata.unit === "指数" &&
    (metadata.frequency === "月次" || metadata.frequency === "monthly") &&
    metadata.rawRange?.startYear === 2017 &&
    Number.isInteger(metadata.rawRange.endYear) &&
    metadata.rawRange.endYear >= 2017 &&
    metadata.adoptedRange?.startYear === 2017 &&
    Number.isInteger(metadata.adoptedRange.endYear) &&
    metadata.adoptedRange.endYear >= 2017
  ) {
    reason = "";
  } else if (metadata) {
    reason = "runtime_t_metadata_mismatch";
  }
  if (reason) {
    for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES) {
      invalid2017.add(category);
      reasonByCategory.set(category, reason);
    }
  }
  if (malformed2017Rows && !reason) {
    for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES) {
      invalid2017.add(category);
      reasonByCategory.set(category, "runtime_t_invalid");
    }
  }
  for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES.filter(
    (item) => item !== "その他の消費支出",
  )) {
    const key = PLAN41_RUNTIME_CATEGORY_KEYS[category];
    const values = new Map<string, number>();
    for (const row of rows) {
      const month = String(row.年月);
      if (values.has(month)) {
        invalid2017.add(category);
        reasonByCategory.set(category, "duplicate_month");
        continue;
      }
      const value = row[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        invalid2017.add(category);
        reasonByCategory.set(category, "runtime_t_invalid");
        continue;
      }
      values.set(month, value);
    }
    if (values.size !== 12) {
      invalid2017.add(category);
      if (!reasonByCategory.has(category))
        reasonByCategory.set(category, "runtime_t_insufficient_months");
    }
    byCategoryMonth.set(category, values);
  }
  const total = new Map<string, number>();
  const componentMaps = PLAN40_PUBLIC_EXPENSE_CATEGORIES.filter(
    (category) => category !== "その他の消費支出",
  ).map((category) => byCategoryMonth.get(category) ?? new Map());
  for (let month = 1; month <= 12; month += 1) {
    const monthKey = `2017年${month}月`;
    const values = componentMaps.map((map) => map.get(monthKey));
    const totalValue = rows.find((row) => String(row.年月) === monthKey)?.[
      PLAN41_RUNTIME_CATEGORY_KEYS.総合
    ];
    if (
      typeof totalValue === "number" &&
      Number.isFinite(totalValue) &&
      totalValue > 0 &&
      values.every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      total.set(monthKey, totalValue - values.reduce((sum, value) => sum + (value as number), 0));
    }
  }
  if (
    total.size !== 12 ||
    [...total.values()].some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    invalid2017.add("その他の消費支出");
    if (!reasonByCategory.has("その他の消費支出")) {
      reasonByCategory.set(
        "その他の消費支出",
        total.size !== 12 ? "runtime_t_insufficient_months" : "runtime_t_invalid",
      );
    }
  }
  byCategoryMonth.set("その他の消費支出", total);
  for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES) {
    const anchor = annualAnchors?.[category];
    const values = byCategoryMonth.get(category);
    const mean =
      values && values.size === 12
        ? Array.from(values.values()).reduce((sum, value) => sum + value, 0) / 12
        : null;
    if (
      typeof anchor !== "number" ||
      !Number.isFinite(anchor) ||
      anchor <= 0 ||
      typeof mean !== "number" ||
      !Number.isFinite(mean) ||
      mean <= 0
    ) {
      continue;
    }
    coefficients.set(category, mean / anchor);
  }
  const valid = !reason && invalid2017.size === 0;
  return {
    byCategoryMonth,
    invalid2017,
    coefficients,
    valid,
    reason:
      reason || (valid ? "" : (reasonByCategory.values().next().value ?? "runtime_t_invalid")),
    reasonByCategory,
  };
}

/**
 * Converts the official monthly CTI category pattern into quarterly values while
 * preserving each Plan39-v2 annual category anchor. Missing or duplicate months
 * invalidate the entire affected year because every quarter uses that year's monthly
 * mean; no zero-fill or total-proportional fallback is allowed on this public path.
 */
export function buildPlan39V2CtiNominalRows({
  records,
  result,
  runtimeCtiData,
  runtimeMetadata,
}: Plan39QuarterlyOptions): QuarterlyRow[] {
  const rowsByYear = new Map(result.rows.map((row) => [row.year, row]));
  const bridgeAnnualAnchors = rowsByYear.get(2017)?.values;
  const byCategoryMonth = new Map<string, Map<string, number>>();
  const duplicateYears = new Set<number>();
  const bySeriesMonth = new Map<number, Map<string, number>>();
  const runtimeBridge = buildPlan41RuntimeBridge(
    runtimeCtiData,
    runtimeMetadata,
    bridgeAnnualAnchors,
  );
  // The source artifact does not publish a usable series 11 value. Collect
  // the total and component series first so that series 11 can be derived as
  // the residual of the same monthly observations.
  for (let seriesIndex = 1; seriesIndex <= 10; seriesIndex += 1) {
    const values = new Map<string, number>();
    const seenMonths = new Set<string>();
    for (const record of records) {
      if (record.variant !== "nominal" || record.seriesIndex !== seriesIndex) continue;
      if (!/^20(?:0[5-9]|1[0-7])-\d{2}$/.test(record.month)) continue;
      if (seenMonths.has(record.month)) {
        duplicateYears.add(Number(record.month.slice(0, 4)));
      }
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

  for (const category of PLAN40_PUBLIC_EXPENSE_CATEGORIES) {
    const seriesIndex = PLAN39_CATEGORY_SERIES[category];
    if (seriesIndex !== 11) {
      byCategoryMonth.set(category, bySeriesMonth.get(seriesIndex) ?? new Map());
    }
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

  const rows: QuarterlyRow[] = [];
  for (let year = PLAN39_START_YEAR; year <= PLAN39_END_YEAR; year += 1) {
    const annual = rowsByYear.get(year);
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const period = `${year}Q${quarter}`;
      const measurements: Record<string, SeriesMeasurement> = {};
      const values: Record<string, number | null> = {};
      const candidates = PLAN40_PUBLIC_EXPENSE_CATEGORIES.map((category) => {
        const key = PLAN40_PUBLIC_KEY_BY_CATEGORY[category];
        const monthValues = byCategoryMonth.get(category);
        const months = [1, 2, 3].map((offset) => (quarter - 1) * 3 + offset);
        const yearValues = Array.from({ length: 12 }, (_, index) =>
          monthValues?.get(`${year}-${String(index + 1).padStart(2, "0")}`),
        );
        const quarterValues = months.map((month) =>
          monthValues?.get(`${year}-${String(month).padStart(2, "0")}`),
        );
        const annualAnchor = annual?.values[category];
        const seasonalValues =
          runtimeBridge && year === 2017
            ? runtimeBridge.byCategoryMonth.get(category)
            : monthValues;
        const missing = [...yearValues, ...quarterValues].some(
          (value) => typeof value !== "number" || !Number.isFinite(value),
        );
        const validateLegacyMonthlyInput = runtimeBridge === null || year !== 2017;
        const duplicate = validateLegacyMonthlyInput && duplicateYears.has(year);
        const usesRuntimeSeasonality = runtimeBridge !== null && year === 2017;
        const sourceYearValues = usesRuntimeSeasonality
          ? Array.from({ length: 12 }, (_, index) => seasonalValues?.get(`2017年${index + 1}月`))
          : yearValues;
        const sourceQuarterValues = usesRuntimeSeasonality
          ? months.map((month) => seasonalValues?.get(`2017年${month}月`))
          : quarterValues;
        const sourceMissing = [...sourceYearValues, ...sourceQuarterValues].some(
          (value) => typeof value !== "number" || !Number.isFinite(value),
        );
        const invalidSeasonalInput = [...sourceYearValues, ...sourceQuarterValues].some(
          (value) => typeof value === "number" && Number.isFinite(value) && value <= 0,
        );
        const annualInvalid =
          result.plan40InputValidation && !result.plan40InputValidation.valid
            ? "v2_annual_anchor_unavailable"
            : (year < 2017 &&
                  result.plan40InputValidation?.valid !== true &&
                  !result.publicationGate.accepted) ||
                annual?.status !== "available" ||
                typeof annualAnchor !== "number" ||
                !Number.isFinite(annualAnchor) ||
                annualAnchor <= 0
              ? "v2_annual_anchor_unavailable"
              : null;
        const runtimeReason = !runtimeBridge.valid
          ? runtimeBridge.reason
          : (runtimeBridge.reasonByCategory.get(category) ?? null);
        const reason = runtimeReason
          ? runtimeReason
          : duplicate
            ? "duplicate_month"
            : sourceMissing
              ? year === 2017
                ? "runtime_t_insufficient_months"
                : "insufficient_months"
              : invalidSeasonalInput
                ? "invalid_seasonal_input"
                : validateLegacyMonthlyInput && missing
                  ? "insufficient_months"
                  : annualInvalid;
        const bridgeCoefficient = runtimeBridge.coefficients.get(category);
        const displayAnnualAnchor =
          typeof annualAnchor === "number" &&
          Number.isFinite(annualAnchor) &&
          typeof bridgeCoefficient === "number" &&
          Number.isFinite(bridgeCoefficient)
            ? annualAnchor * bridgeCoefficient
            : undefined;
        return {
          category,
          key,
          yearValues: sourceYearValues,
          quarterValues: sourceQuarterValues,
          annualAnchor,
          reason,
          runtimeSource: runtimeBridge !== null && year === 2017,
          bridgeCoefficient,
          displayAnnualAnchor,
        };
      });
      // Other uses its dedicated Plan39-v2 annual anchor; its monthly seasonal
      // profile comes from the total-minus-components residual above.
      const quarterReason = candidates.find((candidate) => candidate.reason)?.reason ?? null;
      const plan40Metadata = result.plan40InputMetadata?.A;
      for (const candidate of candidates) {
        const { key, yearValues, quarterValues, bridgeCoefficient, displayAnnualAnchor } =
          candidate;
        if (quarterReason) {
          values[key] = null;
          measurements[key] = plan39InvalidMeasurement(
            key,
            quarterReason,
            year === 2017 ? "official" : "estimated",
            plan40Metadata,
            runtimeBridge !== null && year === 2017,
            runtimeMetadata,
            bridgeCoefficient,
          );
          continue;
        }
        const annualMean = yearValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 12;
        const quarterMean = quarterValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 3;
        const value =
          annualMean > 0 &&
          typeof displayAnnualAnchor === "number" &&
          Number.isFinite(displayAnnualAnchor)
            ? displayAnnualAnchor * (quarterMean / annualMean)
            : null;
        if (value === null || !Number.isFinite(value)) {
          values[key] = null;
          measurements[key] = plan39InvalidMeasurement(
            key,
            "non_finite_seasonal_projection",
            year === 2017 ? "official" : "estimated",
            plan40Metadata,
            runtimeBridge !== null && year === 2017,
            runtimeMetadata,
            bridgeCoefficient,
          );
          continue;
        }
        const annualAnchorType = year === 2017 ? "official" : "estimated";
        values[key] = value;
        measurements[key] = {
          key,
          label: key,
          unit: "指数",
          source:
            runtimeBridge && year === 2017
              ? `e-Stat 公式CTI runtime T ${runtimeMetadata?.statInfId ?? "unavailable"} / Plan41 bridge`
              : annualAnchorType === "official"
                ? "e-Stat 公式CTIミクロ調整系列 A / Plan39-v2"
                : "e-Stat 公式CTI長期artifact 000040499070 / Plan39-v2 bottom-up",
          valueType: "comparison",
          value,
          status: "available",
          reason: null,
          frequency: "quarterly",
          aggregation:
            bridgeCoefficient !== undefined
              ? "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_plan41_bridge"
              : "derived_quarterly_mean_seasonal_pattern_anchored_to_plan39_v2_annual",
          seriesType: annualAnchorType === "official" ? "official_adjusted" : "estimated_adjusted",
          official: false,
          annualAnchorType,
          quarterlyDerived: true,
          model: "v2-bottom-up",
          estimateVersion: "plan39-v2",
          ...(runtimeBridge
            ? {
                sourceId: year === 2017 ? runtimeMetadata?.statInfId : "000040499070",
                statInfId: year === 2017 ? runtimeMetadata?.statInfId : "000040499070",
                householdScope: year === 2017 ? runtimeMetadata?.householdScope : "二人以上の世帯",
                seasonalitySourceId: year === 2017 ? runtimeMetadata?.statInfId : "000040499070",
                targetSourceId: runtimeMetadata?.statInfId,
                targetHouseholdScope: runtimeMetadata?.householdScope,
                bridgeAppliedRange: runtimeMetadata
                  ? { startYear: 2005, endYear: 2017 }
                  : undefined,
                bridgeCoefficient,
              }
            : {}),
          ...plan40Metadata,
          ...(runtimeBridge && year === 2017
            ? {
                baseYear: runtimeMetadata?.baseYear,
                rawRange: runtimeMetadata?.rawRange,
                adoptedRange: runtimeMetadata?.adoptedRange,
              }
            : {}),
        };
      }
      rows.push({
        label: period,
        quarter,
        年: year,
        年月: `${year}年${(quarter - 1) * 3 + 1}月`,
        kind: "plan40-v2-cost-stack",
        ...values,
        measurements,
      });
    }
  }
  return rows;
}

export function loadPlan39V2CtiNominalRows(
  result: CtiAdjustedV2Result,
  runtimeCtiData?: readonly CpiData[],
  runtimeMetadata?: CtiRuntimeMetadata,
): QuarterlyRow[] {
  try {
    return buildPlan39V2CtiNominalRows({
      records: loadCtiBasicSeries2025("nominal"),
      result,
      runtimeCtiData,
      runtimeMetadata,
    });
  } catch {
    return buildPlan39V2CtiNominalRows({ records: [], result, runtimeCtiData, runtimeMetadata });
  }
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
      loadCtiAdjustedV2Estimate({ contract: "plan40" }),
      ctiData,
      (ctiData as CpiData[] & { ctiMetadata?: CtiRuntimeMetadata }).ctiMetadata,
    ),
  );
  nominalRows.sort((left, right) => left.年 - right.年 || left.quarter - right.quarter);

  return {
    nominal: nominalRows,
    real: realRows,
  };
}
