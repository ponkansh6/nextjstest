export interface CustomTooltipProps {
  active?: boolean;
  payload?: {
    name: string;
    value: number | null | undefined;
    color?: string;
    dataKey?: string;
    payload?: Record<string, unknown>;
  }[];
  seriesMeta?: TooltipSeriesMetadata[];
  label?: string;
  isMobile: boolean;
  isTouch: boolean;
  tooltipBg: string;
  tooltipText: string;
  onDismiss?: () => void;
  /** 積み上げチャート向け: 描画中系列の合計を先頭に表示する */
  showTotal?: boolean;
  /** 合計から除外する独立比較系列 */
  totalExcludedKeys?: string[];
  /** 合計対象を明示する場合のキー集合。指定時は除外リストより優先する。 */
  totalIncludedKeys?: string[];
  /** 合計行の表示ラベル */
  totalLabel?: string;
  /** 表示中の2グループ間に装飾的な区切り線を表示する設定 */
  separatorBetweenGroups?: {
    firstGroupKeys: string[];
    secondGroupKeys: string[];
  };
  showAllPayload?: boolean;
  /** Keep measurement metadata but omit repeated inline provenance notes. */
  showMeasurementNotes?: boolean;
  /** Omit measurement/provenance notes for selected series while retaining them for other rows. */
  suppressMeasurementNotesForKeys?: string[];
  /** Explicit visible-series contract; a function may switch keys by period. */
  allowedKeys?: string[] | ((label?: string) => string[]);
  /** Opt in to the raw-payload fallback only when no allowed-key contract is supplied. */
  includeUnmappedPayload?: boolean;
  valueFormatter?: (value: number | null | undefined) => string;
  totalFormatter?: (value: number) => string;
}

export interface TooltipSeriesMetadata {
  key: string;
  label: string;
  color?: string;
  order?: number;
  advanced?: boolean;
  unit?: string;
  source?: string;
  sourceId?: string;
  statInfId?: string;
  householdScope?: string;
  sourceWorkbook?: string;
  sourceSheet?: string;
  sourceColumn?: string;
  sourceRole?: string;
  sourceDerivedFromColumns?: string[];
  canonicalSeries?: string;
  seasonalitySourceId?: string;
  targetSourceId?: string;
  targetHouseholdScope?: string;
  bridgeAppliedRange?: { startYear: number; endYear: number };
  bridgeCoefficient?: number;
  valueType?: "raw" | "comparison";
  status?: MeasurementStatus;
  reason?: string | null;
  frequency?: "monthly" | "quarterly" | "annual";
  aggregation?: string;
  seriesType?: SeriesType;
  official?: boolean;
  annualAnchorType?: "estimated" | "official";
  quarterlyDerived?: boolean;
  model?: "v2-bottom-up";
  estimateVersion?: "plan39-v2";
  inputFingerprint?: string;
  baseYear?: number | null;
  /** CPI source used to deflate a nominal CTI quarterly measurement. */
  cpiSeries?: string;
  cpiPeriod?: string;
  cpiAggregation?: string;
  nominalSource?: string;
  measurementNote?: string;
}

export type SeriesType =
  | "estimated_adjusted"
  | "official_adjusted"
  | "derived_adjusted"
  | "unavailable";
export type MeasurementStatus = "valid" | "invalid" | "unavailable" | "available";

/** Public measurement metadata shared by chart, table, tooltip and CSV. */
export interface SeriesMeasurement {
  key: string;
  label: string;
  unit: string;
  source: string;
  /** Machine-readable source identifiers for Plan41 bridge provenance. */
  sourceId?: string;
  statInfId?: string;
  householdScope?: string;
  sourceWorkbook?: string;
  sourceSheet?: string;
  sourceColumn?: string;
  sourceRole?: string;
  sourceDerivedFromColumns?: string[];
  canonicalSeries?: string;
  seasonalitySourceId?: string;
  /** Plan41 target T and fixed-bridge coverage for derived historical values. */
  targetSourceId?: string;
  targetHouseholdScope?: string;
  bridgeAppliedRange?: { startYear: number; endYear: number };
  bridgeCoefficient?: number;
  valueType: "raw" | "comparison";
  value: number | null;
  status: MeasurementStatus;
  reason: string | null;
  frequency: "monthly" | "quarterly" | "annual";
  aggregation: string;
  /** Plan39 annual adjusted-series provenance. Optional for legacy series. */
  seriesType?: SeriesType;
  /** Whether the value is an official adjusted observation. */
  official?: boolean;
  /** Annual anchor provenance for derived quarterly Plan39 observations. */
  annualAnchorType?: "estimated" | "official";
  /** True when this measurement is derived from monthly seasonality. */
  quarterlyDerived?: boolean;
  /** Plan39-v2 provenance, retained across all public surfaces. */
  model?: "v2-bottom-up";
  estimateVersion?: "plan39-v2";
  /** Fingerprint of the exact B/A/L/Pi input snapshot used for Plan39. */
  inputFingerprint?: string;
  cpiSeries?: string;
  cpiPeriod?: string;
  cpiAggregation?: string;
  nominalSource?: string;
  measurementNote?: string;
  /** Plan40 annual-anchor contract provenance for derived quarterly rows. */
  baseYear?: number | null;
  rawRange?: { startYear: number; endYear: number };
  adoptedRange?: { startYear: number; endYear: number };
  /** Source and household definition of the monthly level used by consumption 12MA. */
  monthlyProvenance?: {
    sourceId: string;
    householdScope: "二人以上の世帯" | "総世帯";
    seriesType: "historical_estimate" | "official_monthly_observed" | "unavailable";
    description: string;
  };
  /** Exact inclusive 12-month window and the source/status classes represented in it. */
  ma12Provenance?: {
    windowStart: string;
    windowEnd: string;
    sources: string[];
    statuses: string[];
  };
}

/** Shared metadata for a declared series that has no observation in a row. */
export function createMissingSeriesMeasurement(
  key: string,
  descriptor?: Partial<SeriesMeasurement>,
): SeriesMeasurement {
  const isPlan39V2 =
    descriptor?.estimateVersion === "plan39-v2" || key.startsWith("CTIミクロ調整系列（");
  return {
    key,
    label: descriptor?.label ?? key,
    // Legacy missing rows retain the established blank unit/source metadata;
    // only the Plan39-v2 descriptor carries its explicit provenance fields.
    unit: isPlan39V2 ? (descriptor?.unit ?? "") : "",
    source: "",
    valueType: descriptor?.valueType ?? "raw",
    value: null,
    status: isPlan39V2 ? "unavailable" : "invalid",
    reason: isPlan39V2 ? "outside_period" : "unavailable",
    frequency: descriptor?.frequency ?? "quarterly",
    aggregation: isPlan39V2 ? (descriptor?.aggregation ?? "") : "",
    seriesType: "unavailable",
    baseYear: descriptor?.baseYear,
  };
}

export const getMeasurementNote = (
  measurement: Partial<
    Pick<
      SeriesMeasurement,
      | "seriesType"
      | "official"
      | "status"
      | "reason"
      | "annualAnchorType"
      | "quarterlyDerived"
      | "bridgeCoefficient"
      | "aggregation"
      | "measurementNote"
    >
  >,
): string | null => {
  if (
    measurement.seriesType === "unavailable" ||
    measurement.status === "invalid" ||
    measurement.status === "unavailable"
  ) {
    if (measurement.reason === "official_quarterly_source_unavailable_latest_period_unknown")
      return "公式四半期値を確認できず、最新対象期は不明";
    if (measurement.reason === "outside_period") return "対象期間外";
    return measurement.reason ? `利用不可: ${measurement.reason}` : "利用不可";
  }
  if (measurement.measurementNote) return measurement.measurementNote;
  if (
    measurement.aggregation ===
    "derived_quarterly_residual_from_official_nominal_total_minus_nine_categories"
  )
    return "公式公表のその他値はなく、公式総合から他9費目を引いた残差（名目指数の公表桁に合わせ0.1単位に丸め）";
  if (measurement.quarterlyDerived) {
    if (
      typeof measurement.bridgeCoefficient === "number" &&
      Number.isFinite(measurement.bridgeCoefficient)
    ) {
      return measurement.annualAnchorType === "official"
        ? "公式Tへ接続補正した年次値を月次系列から四半期化（公式四半期値ではない）"
        : "接続補正済み年次値を月次系列から四半期化（公式四半期値ではない）";
    }
    return measurement.annualAnchorType === "official"
      ? "公式年次値を月次系列から四半期化（公式四半期値ではない）"
      : "接続推計の年次値を月次系列から四半期化（公式四半期値ではない）";
  }
  if (measurement.seriesType === "estimated_adjusted") {
    return "2016年以前は接続推計。公式遡及値ではない";
  }
  if (measurement.seriesType === "official_adjusted" || measurement.official === true) {
    return "公式調整値";
  }
  return null;
};

/** Descriptor and row measurement intentionally share the complete public shape. */
export type SeriesDescriptor = SeriesMeasurement;

export interface CpiView extends Record<string, string | number | null> {
  年月: string;
}

export type QuarterlyRowKind = "legacy-cti" | "plan40-v2-cost-stack" | "plan40-official-quarterly";

export interface QuarterlyRow {
  年: number;
  quarter: number;
  label: string;
  年月: string;
  /** Internal routing metadata; omitted from the established public JSON shape. */
  kind?: QuarterlyRowKind;
  measurements?: Record<string, SeriesMeasurement>;
  [key: string]:
    | number
    | string
    | null
    | QuarterlyRowKind
    | Record<string, SeriesMeasurement>
    | undefined;
}

export interface QuarterlyView {
  label: string;
  quarter: number;
  年: number;
  年月: string;
  measurements?: Record<string, SeriesMeasurement>;
  [key: string]: number | string | null | Record<string, SeriesMeasurement> | undefined;
}

export interface EarningsView extends Record<string, string | number | null> {
  年月: string;
}

export type EarningsViewWithMeasurements = EarningsView & {
  measurements?: Record<string, SeriesMeasurement>;
};
