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

export const SUPPORT_SERIES_KEY_NOMINAL = "民間最終消費支出（名目）";
export const SUPPORT_SERIES_KEY_REAL = "民間最終消費支出（実質）";
export const QUARTERLY_GDP_RAW_NOMINAL_KEY = "GDP名目原値";
export const QUARTERLY_GDP_RAW_REAL_KEY = "GDP実質原値";
export const QUARTERLY_GDP_COMPARISON_NOMINAL_KEY = "GDP名目比較指数";
export const QUARTERLY_GDP_COMPARISON_REAL_KEY = "GDP実質比較指数";

export const DISPLAY_LABEL_OVERRIDES: Record<string, string> = {
  [CANONICAL_NOMINAL_KEY]: "諸雑費・CPI外",
  [CANONICAL_REAL_KEY]: "諸雑費・CPI外",
  [SUPPORT_SERIES_KEY_NOMINAL]: "民間最終消費",
  [SUPPORT_SERIES_KEY_REAL]: "民間最終消費",
  "CTIミクロ基本系列（名目・参考）": "CTIミクロ基本系列（名目・参考）",
  "CTIミクロ基本系列（名目・参考・延長）": "CTIミクロ基本系列（名目・参考・延長）",
  [QUARTERLY_GDP_RAW_NOMINAL_KEY]: "GDP名目原値",
  [QUARTERLY_GDP_RAW_REAL_KEY]: "GDP実質原値",
  [QUARTERLY_GDP_COMPARISON_NOMINAL_KEY]: "GDP名目比較指数（2025Q1-Q4平均=100）",
  [QUARTERLY_GDP_COMPARISON_REAL_KEY]: "GDP実質比較指数（2025Q1-Q4平均=100）",
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

export const CTI_BASIC_SOURCE = "Plan37 official CSV";
export const CTI_BASIC_UNIT = "指数";
export const CTI_BASIC_SERIES_DESCRIPTORS = [
  {
    key: "CTIミクロ基本系列（名目・原数値）",
    label: "CTIミクロ基本系列（名目・原数値）",
    unit: CTI_BASIC_UNIT,
    source: CTI_BASIC_SOURCE,
    valueType: "raw" as const,
    value: null,
  },
  {
    key: "CTIミクロ基本系列（名目・参考）",
    label: "CTIミクロ基本系列(名目・総合)",
    unit: CTI_BASIC_UNIT,
    source: CTI_BASIC_SOURCE,
    valueType: "comparison" as const,
    value: null,
  },
  {
    key: "CTIミクロ基本系列（名目・参考・延長）",
    label: "CTIミクロ基本系列(名目・延長)",
    unit: CTI_BASIC_UNIT,
    source: CTI_BASIC_SOURCE,
    valueType: "comparison" as const,
    value: null,
  },
] as const;
export type CtiBasicSeriesDescriptor = (typeof CTI_BASIC_SERIES_DESCRIPTORS)[number] & {
  status: "valid" | "invalid";
  reason: string | null;
  value: number | null;
};

export function ctiBasicDescriptors(status: "valid" | "invalid", reason: string | null) {
  return CTI_BASIC_SERIES_DESCRIPTORS.map((descriptor) => ({
    ...descriptor,
    status,
    reason,
    value: null,
  }));
}

export type CtiComparisonRegistryState = {
  status: "valid" | "invalid";
  reason: string | null;
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
  status?: "valid" | "invalid";
  reason?: string | null;
  value?: number | null;
  descriptor?: {
    key: string;
    label: string;
    unit: string;
    source: string;
    valueType: "raw" | "comparison";
    status: "valid" | "invalid";
    reason: string | null;
    value: number | null;
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
  status?: "valid" | "invalid";
  reason?: string | null;
  value?: number | null;
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
  {
    color: "#0f766e",
    key: "CTIミクロ基本系列（名目・原数値）",
    label: "CTIミクロ基本系列（名目・原数値）",
    displayName: "CTIミクロ基本系列（名目・原数値）",
    type: "line",
    kind: "line",
    tooltipLabel: "CTIミクロ基本系列（名目・原数値）",
    legendLabel: "CTIミクロ基本系列（名目・原数値）",
    unit: "指数",
    source: CTI_BASIC_SOURCE,
    valueType: "raw",
    status: "valid",
    reason: null,
    descriptor: { ...CTI_BASIC_SERIES_DESCRIPTORS[0], status: "valid", reason: null },
    order: 6,
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
  ctiState: CtiComparisonRegistryState = {
    status: "invalid",
    reason: "CTI基本系列の状態が未提供です",
  },
) {
  const ctiDescriptors = ctiBasicDescriptors(ctiState.status, ctiState.reason);
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
      key: "CTIミクロ基本系列（名目・参考）",
      color: "#2563eb",
      label: "CTIミクロ基本系列(名目・総合)",
      displayName: "CTIミクロ基本系列(名目・総合)",
      tooltipLabel: "CTIミクロ基本系列(名目・総合)",
      legendLabel: "CTIミクロ基本系列(名目・総合)",
      order: 2,
      unit: "指数",
      source: CTI_BASIC_SOURCE,
      valueType: "comparison",
      status: ctiDescriptors[1].status,
      reason: ctiDescriptors[1].reason,
      descriptor: ctiDescriptors[1],
    },
    {
      key: "CTIミクロ基本系列（名目・参考・延長）",
      color: "#7dd3fc",
      label: "CTIミクロ基本系列(名目・延長)",
      displayName: "CTIミクロ基本系列(名目・延長)",
      advanced: true,
      tooltipLabel: "CTIミクロ基本系列(名目・延長)",
      legendLabel: "CTIミクロ基本系列(名目・延長)",
      order: 3,
      strokeDasharray: "6 3",
      unit: "指数",
      source: CTI_BASIC_SOURCE,
      valueType: "comparison",
      status: ctiDescriptors[2].status,
      reason: ctiDescriptors[2].reason,
      descriptor: ctiDescriptors[2],
    },
  ] satisfies SeriesMetadata[];
}

/**
 * Compatibility export for consumers that do not own the request state.
 * It fails closed; request-scoped UI code must use createComparisonSeriesRegistry.
 */
export const COMPARISON_SERIES_REGISTRY = createComparisonSeriesRegistry();

export const LINE_CONFIGS: LineConfig[] = COMPARISON_SERIES_REGISTRY as LineConfig[];
