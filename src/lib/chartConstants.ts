// Milestone years for chart reference lines
export const MILESTONE_YEARS = [2010, 2015, 2020, 2025] as const;

// Minimum display year (used for filtering in CpiChart)
export const MIN_DISPLAY_YEAR = 2005;

// CPIの基本カテゴリー
export const CPI_CATEGORIES = [
  "住居",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "教育",
  "光熱・水道",
  "教養娯楽",
  "交通・自動車等関係費",
  "通信",
  "外食以外食料",
  "外食",
  "諸雑費",
];

// --- 消費支出の定義 (名目・実質) ---

// 1. 名目データのキーと、それに対応する表示カテゴリーのマップ (唯一の真実)
const NOMINAL_MAPPING: Record<string, string> = {
  "住居（名目）": "住居",
  "家具・家事用品（名目）": "家具・家事用品",
  "被服及び履物（名目）": "被服履物",
  "保健医療（名目）": "保健医療",
  "教育（名目）": "教育",
  "光熱・水道（名目）": "光熱・水道",
  "教養娯楽（名目）": "教養娯楽",
  "交通・通信（名目）": "交通・通信",
  "食料（名目）": "食料",
  "その他の消費支出（名目）": "諸雑費・CPI外支出",
};

// 2. 実質データのキーと、それに対応する表示カテゴリーのマップ (名目から派生)
const REAL_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(NOMINAL_MAPPING).map(([key, value]) => [
    key.replace("（名目）", "（実質）"),
    value,
  ]),
);

// 3. 外部公開用の定数 (マッピングから派生)
export const CONSUMPTION_NOMINAL_KEYS = Object.keys(NOMINAL_MAPPING);
export const CONSUMPTION_REAL_KEYS = Object.keys(REAL_MAPPING);

export const NOMINAL_CONSUMPTION_CATEGORIES = Array.from(new Set(Object.values(NOMINAL_MAPPING)));
export const REAL_CONSUMPTION_CATEGORIES = Array.from(new Set(Object.values(REAL_MAPPING)));

export const nominalColorMap: Record<string, string> = {
  "交通・通信（名目）": "交通・自動車等関係費",
  "住居（名目）": "住居",
  "保健医療（名目）": "保健医療",
  "光熱・水道（名目）": "光熱・水道",
  "家具・家事用品（名目）": "家具・家事用品",
  "教育（名目）": "教育",
  "教養娯楽（名目）": "教養娯楽",
  "被服及び履物（名目）": "被服及び履物",
  "その他の消費支出（名目）": "諸雑費",
  "食料（名目）": "外食以外食料",
  "通信（名目）": "通信",
};

// 消費支出バーチャート専用の独立色（CPIカテゴリーの色を流用しない）。
// 食料はCPI側の「外食以外食料」(bright tier)をそのまま使うとバーチャート内の
// 隣接カテゴリーとの明度差が最適でないため、0.75/0.45交互のtier原則に沿って
// darker tier (L=0.460/0.501, H=325°は維持)で独立に定義している。
const NOMINAL_COLOR_OVERRIDES: Record<string, string> = {
  "食料（名目）": "var(--nominal-food)",
  "食料（実質）": "var(--nominal-food)",
};

export const getColorForNominalKey = (key: string): string => {
  if (NOMINAL_COLOR_OVERRIDES[key]) {
    return NOMINAL_COLOR_OVERRIDES[key];
  }
  const targetStackedKey = nominalColorMap[key];
  const index = CPI_CATEGORIES.indexOf(targetStackedKey || "");
  return index !== -1 ? stackedColors[index] : "var(--series-1)";
};

// --- 以下、既存の定数とユーティリティ ---

export const targetKeys = [
  "総合",
  "生鮮食品を除く総合",
  "生鮮食品及びエネルギーを除く総合",
  "食料（酒類を除く）及びエネルギーを除く総合",
];

export const colors = ["#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd"];

export const stackedColors = [
  "var(--series-1)", // 住居
  "var(--series-2)", // 家具・家事用品
  "var(--series-3)", // 被服履物
  "var(--series-6)", // 保健医療
  "var(--series-5)", // 教育
  "var(--series-8)", // 光熱・水道
  "var(--series-9)", // 教養娯楽
  "var(--series-4)", // 交通自動車等
  "var(--series-7)", // 通信
  "var(--series-10)", // 外食以外食料
  "var(--series-11)", // 外食
  "var(--series-12)", // 諸雑費
];

// CPI積み上げ用
export const stackedKeys = CPI_CATEGORIES;

// 凡例表示用のクリーンなラベル
export const getDisplayLabel = (key: string) => {
  return key.replace("（名目）", "").replace("（実質）", "");
};

/** Build the CPI tooltip contract from the canonical category/palette pairing. */
export const buildCpiTooltipMetadata = (
  visibleKeys?: ReadonlySet<string> | readonly string[],
): TooltipSeriesProjection[] => {
  const visible = visibleKeys
    ? visibleKeys instanceof Set
      ? visibleKeys
      : new Set(visibleKeys)
    : undefined;
  return CPI_CATEGORIES.flatMap((key, order) =>
    !visible || visible.has(key)
      ? [{ key, label: getDisplayLabel(key), color: stackedColors[order], order }]
      : [],
  );
};

export const CANONICAL_NOMINAL_KEY = "その他の消費支出（名目）";
export const CANONICAL_REAL_KEY = "その他の消費支出（実質）";

export const SUPPORT_SERIES_KEY_NOMINAL = "CTIミクロ四半期系列（名目）";
export const SUPPORT_SERIES_KEY_REAL = "民間最終消費支出（実質）";
export const CTI_BASIC_RAW_KEY = "CTIミクロ基本系列（名目・原数値）";
export const CTI_BASIC_COMPARISON_KEY = "CTIミクロ基本系列（名目・参考）";
export const CTI_BASIC_EXTENSION_KEY = "CTIミクロ基本系列（名目・参考・延長）";
/** Plan39 public annual adjusted-connection series. */
export const CTI_ADJUSTED_PUBLIC_KEY = "CTIミクロ調整系列（総合）";
export const CTI_ADJUSTED_PUBLIC_CATEGORIES = [
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
  "残差",
] as const;
export type CtiAdjustedPublicCategory = (typeof CTI_ADJUSTED_PUBLIC_CATEGORIES)[number];
export const CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY = {
  総合: CTI_ADJUSTED_PUBLIC_KEY,
  食料: "CTIミクロ調整系列（食料）",
  住居: "CTIミクロ調整系列（住居）",
  "光熱・水道": "CTIミクロ調整系列（光熱・水道）",
  "家具・家事用品": "CTIミクロ調整系列（家具・家事用品）",
  被服及び履物: "CTIミクロ調整系列（被服及び履物）",
  保健医療: "CTIミクロ調整系列（保健医療）",
  "交通・通信": "CTIミクロ調整系列（交通・通信）",
  教育: "CTIミクロ調整系列（教育）",
  教養娯楽: "CTIミクロ調整系列（教養娯楽）",
  残差: "CTIミクロ調整系列（残差）",
} as const satisfies Record<CtiAdjustedPublicCategory, string>;
export const CTI_ADJUSTED_PUBLIC_KEYS = CTI_ADJUSTED_PUBLIC_CATEGORIES.map(
  (category) => CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY[category],
);
export type CtiAdjustedPublicKey =
  (typeof CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY)[CtiAdjustedPublicCategory];

/** Plan39-v2 public categories. This registry is intentionally separate from v1. */
export const CTI_ADJUSTED_V2_PUBLIC_CATEGORIES = [
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
  "その他の消費支出",
] as const;
export type CtiAdjustedV2PublicCategory = (typeof CTI_ADJUSTED_V2_PUBLIC_CATEGORIES)[number];
export const CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY = {
  総合: CTI_ADJUSTED_PUBLIC_KEY,
  食料: "CTIミクロ調整系列（食料）",
  住居: "CTIミクロ調整系列（住居）",
  "光熱・水道": "CTIミクロ調整系列（光熱・水道）",
  "家具・家事用品": "CTIミクロ調整系列（家具・家事用品）",
  被服及び履物: "CTIミクロ調整系列（被服及び履物）",
  保健医療: "CTIミクロ調整系列（保健医療）",
  "交通・通信": "CTIミクロ調整系列（交通・通信）",
  教育: "CTIミクロ調整系列（教育）",
  教養娯楽: "CTIミクロ調整系列（教養娯楽）",
  その他の消費支出: "CTIミクロ調整系列（その他の消費支出）",
} as const satisfies Record<CtiAdjustedV2PublicCategory, string>;
export type CtiAdjustedV2PublicKey =
  (typeof CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY)[CtiAdjustedV2PublicCategory];
export const CTI_ADJUSTED_V2_PUBLIC_KEYS = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map(
  (category) => CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
);

/** Public-surface mapping; v1 and v2 must never share a category list. */
export const CTI_ADJUSTED_PUBLIC_MAPPING_BY_VERSION = {
  v1: CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY,
  v2: CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
} as const;

export const CTI_ADJUSTED_V2_PUBLIC_REGISTRY = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map(
  (category, order) => ({
    key: CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
    category,
    label: `CTIミクロ調整系列（${category}）`,
    legendLabel: category,
    tooltipLabel: `CTIミクロ調整系列（${category}）`,
    order,
  }),
);
export const LEGACY_CTI_COMPARISON_KEY = "CTI消費支出（参考）";
export const CTI_BASIC_SOURCE = "e-Stat 公式CTI長期artifact 000040499070";
export const CTI_BASIC_UNIT = "指数";
export const LEGACY_CTI_COMPARISON_SOURCE = "旧 loadCtiDataInternal() の CTI「消費支出（名目）」";
export const CTI_BASIC_SERIES_DESCRIPTORS = [
  {
    key: CTI_BASIC_RAW_KEY,
    label: CTI_BASIC_RAW_KEY,
    unit: CTI_BASIC_UNIT,
    source: CTI_BASIC_SOURCE,
    valueType: "raw" as const,
    frequency: "monthly" as const,
    aggregation: "none",
  },
  {
    key: CTI_BASIC_COMPARISON_KEY,
    label: "CTIミクロ基本系列(名目・総合)",
    unit: CTI_BASIC_UNIT,
    source: CTI_BASIC_SOURCE,
    valueType: "comparison" as const,
    frequency: "monthly" as const,
    aggregation: "12_month_moving_average_rebased_to_2025_raw_average",
  },
  {
    key: CTI_BASIC_EXTENSION_KEY,
    label: "CTIミクロ基本系列(名目・延長)",
    unit: CTI_BASIC_UNIT,
    source: CTI_BASIC_SOURCE,
    valueType: "comparison" as const,
    frequency: "monthly" as const,
    aggregation: "12_month_moving_average_rebased_to_2025_raw_average",
  },
] satisfies readonly Omit<SeriesMetadata, "color">[];

export type CtiAdjustedPublicSeriesDescriptor = SeriesMetadata &
  Required<Pick<SeriesMetadata, "status" | "reason" | "value" | "valueType">>;

export const CTI_ADJUSTED_PUBLIC_SERIES_DESCRIPTOR = {
  key: CTI_ADJUSTED_PUBLIC_KEY,
  label: CTI_ADJUSTED_PUBLIC_KEY,
  displayName: CTI_ADJUSTED_PUBLIC_KEY,
  tooltipLabel: CTI_ADJUSTED_PUBLIC_KEY,
  legendLabel: CTI_ADJUSTED_PUBLIC_KEY,
  color: "#0f766e",
  type: "line",
  kind: "line",
  order: 0,
  unit: "指数",
  source: "CTIミクロ調整接続推計 / 公式CTIミクロ調整系列",
  valueType: "comparison",
  frequency: "annual",
  aggregation: "cti_adjusted_connection_estimate",
  status: "valid",
  reason: null,
  value: null,
} satisfies CtiAdjustedPublicSeriesDescriptor;

export const CTI_ADJUSTED_PUBLIC_SERIES_DESCRIPTORS = CTI_ADJUSTED_PUBLIC_CATEGORIES.map(
  (category, order) => ({
    ...CTI_ADJUSTED_PUBLIC_SERIES_DESCRIPTOR,
    key: CTI_ADJUSTED_PUBLIC_KEY_BY_CATEGORY[category],
    label: `CTIミクロ調整系列（${category}）`,
    displayName: `CTIミクロ調整系列（${category}）`,
    tooltipLabel: `CTIミクロ調整系列（${category}）`,
    legendLabel: category,
    // Reuse the established chart palette so each CTI category remains
    // identifiable in the graph, tooltip, and exported metadata.
    color: stackedColors[order],
    order,
  }),
);

export function ctiBasicDescriptors(status: "valid" | "invalid", reason: string | null) {
  return CTI_BASIC_SERIES_DESCRIPTORS.map((descriptor) => ({
    ...descriptor,
    status,
    reason,
    value: null,
  }));
}
export const QUARTERLY_GDP_RAW_NOMINAL_KEY = "GDP名目原値";
export const QUARTERLY_GDP_RAW_REAL_KEY = "GDP実質原値";
export const QUARTERLY_GDP_COMPARISON_NOMINAL_KEY = "GDP名目比較指数";
export const QUARTERLY_GDP_COMPARISON_REAL_KEY = "GDP実質比較指数";

export const DISPLAY_LABEL_OVERRIDES: Record<string, string> = {
  [CANONICAL_NOMINAL_KEY]: "諸雑費・CPI外",
  [CANONICAL_REAL_KEY]: "諸雑費・CPI外",
  [SUPPORT_SERIES_KEY_NOMINAL]: "CTIミクロ（名目・四半期平均）",
  [SUPPORT_SERIES_KEY_REAL]: "民間最終消費",
  [QUARTERLY_GDP_RAW_NOMINAL_KEY]: "GDP名目原値",
  [QUARTERLY_GDP_RAW_REAL_KEY]: "GDP実質原値",
  [QUARTERLY_GDP_COMPARISON_NOMINAL_KEY]: "GDP名目比較指数（2025Q1-Q4平均=100）",
  [QUARTERLY_GDP_COMPARISON_REAL_KEY]: "GDP実質比較指数（2025Q1-Q4平均=100）",
  [CTI_BASIC_RAW_KEY]: CTI_BASIC_RAW_KEY,
  [CTI_BASIC_COMPARISON_KEY]: "CTIミクロ基本系列(名目・総合)",
  [CTI_BASIC_EXTENSION_KEY]: "CTIミクロ基本系列(名目・延長)",
  food: "food",
  housing: "housing",
  // CPI_CATEGORIES の値はデータローダーが生成する実データのフィールド名と
  // 一致させる必要があるため正式名称のままにし、凡例表示のみここで短縮する
  // (CPI_CATEGORIES 自体を短縮すると dataKey が実データと一致せず描画されなくなる)。
  被服及び履物: "被服履物",
  "被服及び履物（名目）": "被服履物",
  "被服及び履物（実質）": "被服履物",
  "光熱・水道": "光熱水道",
  "光熱・水道（名目）": "光熱水道",
  "光熱・水道（実質）": "光熱水道",
  "交通・通信": "交通通信",
  "交通・通信（名目）": "交通通信",
  "交通・通信（実質）": "交通通信",
  "交通・自動車等関係費": "交通自動車等",
};

export const getLegendLabel = (key: string) => {
  return DISPLAY_LABEL_OVERRIDES[key] || getDisplayLabel(key);
};

export const keyPairs = CONSUMPTION_NOMINAL_KEYS.map((key, index) => ({
  nominal: key,
  real: CONSUMPTION_REAL_KEYS[index],
  label: getDisplayLabel(key),
}));

/** Shared, presentation-only metadata for a rendered series.
 *
 * Chart-specific concerns (renderer, stacking, publication, and initial
 * visibility) deliberately stay with each consumer.
 */
export interface SeriesMetadata {
  key: string;
  color: string;
  label: string;
  /** Legacy consumer-facing names retained on the shared metadata object. */
  displayName?: string;
  type?: "area" | "line";
  pairKey?: string;
  kind?: "area" | "line";
  advanced?: boolean;
  strokeDasharray?: string;
  /** Tooltip's complete visible label. */
  tooltipLabel?: string;
  /** Legend's visible label. */
  legendLabel?: string;
  /** Stable display order shared by legend and tooltip. */
  order?: number;
  unit?: string;
  source?: string;
  valueType?: "raw" | "comparison";
  status?: "valid" | "invalid" | "unavailable" | "available";
  reason?: string | null;
  value?: number | null;
  frequency?: "monthly" | "quarterly" | "annual";
  aggregation?: string;
  seriesType?: "estimated_adjusted" | "official_adjusted" | "unavailable";
  official?: boolean;
  descriptor?: {
    key: string;
    label: string;
    unit: string;
    source: string;
    valueType: "raw" | "comparison";
    status: "valid" | "invalid" | "unavailable" | "available";
    reason: string | null;
    value: number | null;
    frequency?: "monthly" | "quarterly" | "annual";
    aggregation?: string;
    seriesType?: "estimated_adjusted" | "official_adjusted" | "unavailable";
    official?: boolean;
  };
}

export interface TooltipSeriesProjection {
  key: string;
  label: string;
  color: string;
  order: number;
  advanced?: boolean;
  unit?: string;
  source?: string;
  valueType?: "raw" | "comparison";
  status?: "valid" | "invalid" | "unavailable" | "available";
  reason?: string | null;
  value?: number | null;
  frequency?: "monthly" | "quarterly" | "annual";
  aggregation?: string;
  seriesType?: "estimated_adjusted" | "official_adjusted" | "unavailable";
  official?: boolean;
}

/** Project one display contract into the metadata consumed by CustomTooltip. */
export const projectTooltipMetadata = (
  series: readonly SeriesMetadata[],
  visibleKeys?: ReadonlySet<string> | readonly string[],
): TooltipSeriesProjection[] => {
  const visible = visibleKeys
    ? visibleKeys instanceof Set
      ? visibleKeys
      : new Set(visibleKeys)
    : undefined;
  return series
    .filter(({ key }) => !visible || visible.has(key))
    .map(
      (
        {
          key,
          tooltipLabel,
          legendLabel,
          displayName,
          label,
          color,
          order,
          advanced,
          unit,
          source,
          valueType,
          status,
          reason,
          value,
          frequency,
          aggregation,
          seriesType,
          official,
          descriptor,
        },
        index,
      ) => ({
        key,
        label: tooltipLabel ?? legendLabel ?? displayName ?? label ?? key,
        color,
        order: order ?? index,
        ...(advanced === undefined ? {} : { advanced }),
        ...(unit === undefined ? {} : { unit }),
        ...(source === undefined ? {} : { source }),
        ...(valueType === undefined ? {} : { valueType }),
        ...(status === undefined ? {} : { status }),
        ...(reason === undefined ? {} : { reason }),
        ...(value === undefined ? {} : { value }),
        ...(frequency === undefined ? {} : { frequency }),
        ...(aggregation === undefined ? {} : { aggregation }),
        ...((seriesType ?? descriptor?.seriesType) === undefined
          ? {}
          : { seriesType: seriesType ?? descriptor?.seriesType }),
        ...((official ?? descriptor?.official) === undefined
          ? {}
          : { official: official ?? descriptor?.official }),
      }),
    );
};

// EarningsBreakdownChart の系列設定(データテーブル集約セクションからも参照するため
// chart component とは独立にここへ定義する。next/dynamic で遅延ロードされる
// EarningsBreakdownChart.tsx から直接importすると、その巨大なrecharts依存モジュールが
// CpiChart.tsx の静的importに巻き込まれコード分割が無効化されるため避ける)
export const EARNINGS_SERIES_REGISTRY = [
  {
    color: "#1e40af",
    key: "所定内給与",
    label: "所定内給与",
    displayName: "所定内給与",
    type: "area",
    kind: "area",
    tooltipLabel: "所定内給与",
    legendLabel: "所定内給与",
    order: 0,
  },
  {
    color: "#3b82f6",
    key: "所定外給与",
    label: "所定外給与",
    displayName: "所定外給与",
    type: "area",
    kind: "area",
    tooltipLabel: "所定外給与",
    legendLabel: "所定外給与",
    order: 1,
  },
  {
    color: "#60a5fa",
    key: "特別給与",
    label: "特別給与",
    displayName: "特別給与",
    type: "area",
    kind: "area",
    tooltipLabel: "特別給与",
    legendLabel: "特別給与",
    order: 2,
  },
  {
    color: "#16a34a",
    key: "時間当たり給与",
    label: "時間当たり給与",
    displayName: "時間当たり給与",
    type: "line",
    kind: "line",
    tooltipLabel: "時間当たり給与",
    legendLabel: "時間当たり給与",
    order: 3,
  },
  {
    color: "#a3e635",
    key: "15歳以上国民当たり給与",
    label: "15歳以上国民当たり給与",
    displayName: "15歳以上国民当たり給与",
    type: "line",
    kind: "line",
    tooltipLabel: "15歳以上国民当たり給与",
    legendLabel: "15歳以上国民当たり給与",
    order: 3,
  },
  {
    color: "#eab308",
    key: "CPI総合(参考)",
    label: "物価指数総合(参考)",
    displayName: "物価指数総合(参考)",
    type: "line",
    kind: "line",
    tooltipLabel: "物価指数総合(参考)",
    legendLabel: "物価指数総合(参考)",
    order: 5,
  },
] satisfies SeriesMetadata[];

/** 給与区分合計の対象キー。給与registryから投影し、補助系列は含めない。 */
export const EARNINGS_TOTAL_KEYS = EARNINGS_SERIES_REGISTRY.filter(({ key }) =>
  ["所定内給与", "所定外給与", "特別給与"].includes(key),
).map(({ key }) => key);

/** 給与ツールチップの補助系列。合計対象以外を表示順のまま保持する。 */
export const EARNINGS_AUXILIARY_KEYS = EARNINGS_SERIES_REGISTRY.filter(
  ({ key }) => !EARNINGS_TOTAL_KEYS.includes(key),
).map(({ key }) => key);

// Compatibility name retained for existing chart/table consumers.
export const EARNINGS_TABLE_CONFIGS = EARNINGS_SERIES_REGISTRY;

// NewGraph の系列設定(理由はEARNINGS_TABLE_CONFIGSと同様)
export type LineConfig = SeriesMetadata & { displayName: string };

export function createComparisonSeriesRegistry(
  ctiState: { status: "valid" | "invalid"; reason: string | null } = {
    status: "invalid",
    reason: null,
  },
): SeriesMetadata[] {
  const descriptors = ctiBasicDescriptors(ctiState.status, ctiState.reason);
  return [
    {
      key: "CPI総合(12MA)",
      color: "#65a30d",
      label: "物価指数(総合)",
      displayName: "物価指数(総合)",
      tooltipLabel: "物価指数(総合)",
      legendLabel: "物価指数(総合)",
      order: 0,
    },
    {
      key: "総合(12MA)",
      color: "#e11d48",
      label: "給与(総合)",
      displayName: "給与(総合)",
      tooltipLabel: "給与(総合)",
      legendLabel: "給与(総合)",
      order: 1,
    },
    {
      key: LEGACY_CTI_COMPARISON_KEY,
      color: "#0f766e",
      label: "CTI消費支出(参考)",
      displayName: "CTI消費支出(参考)",
      tooltipLabel: "CTI消費支出(参考)",
      legendLabel: "CTI消費支出(参考)",
      order: 2,
      unit: CTI_BASIC_UNIT,
      source: LEGACY_CTI_COMPARISON_SOURCE,
      valueType: "comparison",
      frequency: "monthly",
      aggregation: "adjustment_12_month_moving_average_rebased_to_2025_raw_average",
    },
    {
      key: CTI_BASIC_COMPARISON_KEY,
      color: "#2563eb",
      label: "CTIミクロ基本系列(名目・総合)",
      displayName: "CTIミクロ基本系列(名目・総合)",
      tooltipLabel: "CTIミクロ基本系列(名目・総合)",
      legendLabel: "CTIミクロ基本系列(名目・総合)",
      order: 3,
      unit: CTI_BASIC_UNIT,
      source: CTI_BASIC_SOURCE,
      valueType: "comparison",
      status: descriptors[1].status,
      reason: descriptors[1].reason,
      descriptor: descriptors[1],
    },
    {
      key: CTI_BASIC_EXTENSION_KEY,
      color: "#7dd3fc",
      label: "CTIミクロ基本系列(名目・延長)",
      displayName: "CTIミクロ基本系列(名目・延長)",
      advanced: true,
      tooltipLabel: "CTIミクロ基本系列(名目・延長)",
      legendLabel: "CTIミクロ基本系列(名目・延長)",
      order: 4,
      strokeDasharray: "6 3",
      unit: CTI_BASIC_UNIT,
      source: CTI_BASIC_SOURCE,
      valueType: "comparison",
      status: descriptors[2].status,
      reason: descriptors[2].reason,
      descriptor: descriptors[2],
    },
  ] satisfies SeriesMetadata[];
}

/**
 * Compatibility export for consumers that do not own the request state.
 * It fails closed; request-scoped UI code must use createComparisonSeriesRegistry.
 */
export const COMPARISON_SERIES_REGISTRY = createComparisonSeriesRegistry();

export const LINE_CONFIGS: LineConfig[] = COMPARISON_SERIES_REGISTRY as LineConfig[];
