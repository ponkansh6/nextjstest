// CPIの基本カテゴリー
export const CPI_CATEGORIES = [
  "住居",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "教育",
  "交通・自動車等関係費",
  "通信",
  "光熱・水道",
  "教養娯楽",
  "外食以外食料",
  "外食",
  "諸雑費",
];

// --- 消費支出の定義 (名目・実質) ---

// 1. 名目データのキーと、それに対応する表示カテゴリーのマップ (唯一の真実)
const NOMINAL_MAPPING: Record<string, string> = {
  "住居（名目）": "住居",
  "家具・家事用品（名目）": "家具・家事用品",
  "被服及び履物（名目）": "被服及び履物",
  "保健医療（名目）": "保健医療",
  "教育（名目）": "教育",
  "交通・通信（名目）": "交通・通信",
  "光熱・水道（名目）": "光熱・水道",
  "教養娯楽（名目）": "教養娯楽",
  "食料（名目）": "食料",
  "その他の消費支出（名目）": "諸雑費・CPI外支出",
};

// 2. 実質データのキーと、それに対応する表示カテゴリーのマップ (名目から派生)
const REAL_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(NOMINAL_MAPPING).map(([key, value]) => [
    key.replace("（名目）", "（実質）"),
    value,
  ])
);

// 3. 外部公開用の定数 (マッピングから派生)
export const CONSUMPTION_NOMINAL_KEYS = Object.keys(NOMINAL_MAPPING);
export const CONSUMPTION_REAL_KEYS = Object.keys(REAL_MAPPING);

export const NOMINAL_CONSUMPTION_CATEGORIES = Array.from(new Set(Object.values(NOMINAL_MAPPING)));
export const REAL_CONSUMPTION_CATEGORIES = Array.from(new Set(Object.values(REAL_MAPPING)));

export const nominalColorMap = NOMINAL_MAPPING;

// --- 以下、既存の定数とユーティリティ ---

export const targetKeys = [
  "総合",
  "生鮮食品を除く総合",
  "生鮮食品及びエネルギーを除く総合",
  "食料（酒類を除く）及びエネルギーを除く総合",
];

export const colors = ["#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd"];

export const stackedColors = [
  "#2a2080",
  "#4647ea",
  "#3481fe",
  "#18b3ec",
  "#00d0a5",
  "#22c55e",
  "#85e022",
  "#fbe020",
  "#fb923c",
  "#c21a00",
  "#b01500",
  "#550500",
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
};

export const getLegendLabel = (key: string) => {
  return DISPLAY_LABEL_OVERRIDES[key] || getDisplayLabel(key);
};

export const keyPairs = CONSUMPTION_NOMINAL_KEYS.map((key, index) => ({
  nominal: key,
  real: CONSUMPTION_REAL_KEYS[index],
  label: getDisplayLabel(key),
}));
