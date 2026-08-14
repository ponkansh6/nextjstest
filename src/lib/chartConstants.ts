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

export const CANONICAL_NOMINAL_KEY = "その他の消費支出（名目）";
export const CANONICAL_REAL_KEY = "その他の消費支出（実質）";

export const SUPPORT_SERIES_KEY_NOMINAL = "民間最終消費支出（名目）";
export const SUPPORT_SERIES_KEY_REAL = "民間最終消費支出（実質）";

export const DISPLAY_LABEL_OVERRIDES: Record<string, string> = {
  [CANONICAL_NOMINAL_KEY]: "諸雑費・CPI外支出",
  [CANONICAL_REAL_KEY]: "諸雑費・CPI外支出",
  [SUPPORT_SERIES_KEY_NOMINAL]: "民間最終消費支出",
  [SUPPORT_SERIES_KEY_REAL]: "民間最終消費支出",
  food: "food",
  housing: "housing",
  // CPI_CATEGORIES の値はデータローダーが生成する実データのフィールド名と
  // 一致させる必要があるため正式名称のままにし、凡例表示のみここで短縮する
  // (CPI_CATEGORIES 自体を短縮すると dataKey が実データと一致せず描画されなくなる)。
  被服及び履物: "被服履物",
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

// EarningsBreakdownChart の系列設定(データテーブル集約セクションからも参照するため
// chart component とは独立にここへ定義する。next/dynamic で遅延ロードされる
// EarningsBreakdownChart.tsx から直接importすると、その巨大なrecharts依存モジュールが
// CpiChart.tsx の静的importに巻き込まれコード分割が無効化されるため避ける)
export const EARNINGS_TABLE_CONFIGS: {
  key: string;
  color: string;
  type: "area" | "line";
  displayName?: string;
}[] = [
  { color: "#1e40af", key: "所定内給与", type: "area" },
  { color: "#3b82f6", key: "所定外給与", type: "area" },
  { color: "#60a5fa", key: "特別給与", type: "area" },
  { color: "#16a34a", key: "時間当たり給与", type: "line" },
  {
    color: "#a3e635",
    key: "15歳以上国民当たり給与",
    type: "line",
  },
  {
    color: "#eab308",
    displayName: "物価指数総合(参考)",
    key: "CPI総合(参考)",
    type: "line",
  },
];

// NewGraph の系列設定(理由はEARNINGS_TABLE_CONFIGSと同様)
export interface LineConfig {
  key: string;
  color: string;
  displayName: string;
  advanced?: boolean;
  strokeDasharray?: string;
}

export const LINE_CONFIGS: LineConfig[] = [
  { key: "CPI総合(12MA)", color: "#65a30d", displayName: "物価指数(総合)" },
  { key: "総合(12MA)", color: "#e11d48", displayName: "給与(総合)" },
  { key: "CTI消費支出（参考）", color: "#2563eb", displayName: "CTI消費(総合)" },
  { key: "民間最終消費支出（参考）", color: "#38bdf8", displayName: "民間最終消費(総合)" },
  {
    key: "民間最終消費支出（参考・延長）",
    color: "#7dd3fc",
    displayName: "民間最終消費(延長・参考)",
    advanced: true,
    strokeDasharray: "6 3",
  },
];
