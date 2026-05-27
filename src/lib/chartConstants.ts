export const targetKeys = [
  "総合",
  "生鮮食品を除く総合",
  "生鮮食品及びエネルギーを除く総合",
  "食料（酒類を除く）及びエネルギーを除く総合",
];

export const colors = ["#1d4ed8", "#3b82f6", "#60a5fa", "#93c5fd"];

export const stackedKeys = [
  "外食以外食料",
  "外食",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・自動車等関係費",
  "通信",
  "教育",
  "教養娯楽",
  "諸雑費",
];

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

export const nominalKeys = [
  "食料（名目）",
  "住居（名目）",
  "光熱・水道（名目）",
  "家具・家事用品（名目）",
  "被服及び履物（名目）",
  "保健医療（名目）",
  "交通・通信（名目）",
  "教育（名目）",
  "教養娯楽（名目）",
  "諸雑費・CPI外支出等（名目）",
];

export const realKeys = [
  "食料（実質）",
  "住居（実質）",
  "光熱・水道（実質）",
  "家具・家事用品（実質）",
  "被服及び履物（実質）",
  "保健医療（実質）",
  "交通・通信（実質）",
  "教育（実質）",
  "教養娯楽（実質）",
];

// 凡例表示用のクリーンなラベル
export const getDisplayLabel = (key: string) => {
  return key.replace("（名目）", "").replace("（実質）", "");
};

// 名目キーと実質キーのインデックスベースのペアリング
export const keyPairs = nominalKeys.slice(0, realKeys.length).map((key, index) => ({
  nominal: key,
  real: realKeys[index],
  label: getDisplayLabel(key),
}));

export const nominalColorMap: Record<string, string> = {
  "交通・通信（名目）": "交通・自動車等関係費",
  "住居（名目）": "住居",
  "保健医療（名目）": "保健医療",
  "光熱・水道（名目）": "光熱・水道",
  "家具・家事用品（名目）": "家具・家事用品",
  "教育（名目）": "教育",
  "教養娯楽（名目）": "教養娯楽",
  "被服及び履物（名目）": "被服及び履物",
  "諸雑費・CPI外支出等（名目）": "諸雑費",
  "食料（名目）": "外食以外食料",
};
