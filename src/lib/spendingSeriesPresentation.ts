import { CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY } from "./chartConstants";

/** Legacy official-series display order and labels for both spending charts. */
const SPENDING_CATEGORIES = [
  "住居",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "教育",
  "光熱・水道",
  "教養娯楽",
  "交通・通信",
  "食料",
  "その他の消費支出",
] as const;

const SPENDING_LABELS = {
  住居: "住居",
  "家具・家事用品": "家具・家事用品",
  被服及び履物: "被服履物",
  保健医療: "保健医療",
  教育: "教育",
  "光熱・水道": "光熱水道",
  教養娯楽: "教養娯楽",
  "交通・通信": "交通通信",
  食料: "食料",
  その他の消費支出: "諸雑費・CPI外",
} as const;

const SPENDING_ORDER_BY_KEY = new Map<string, number>(
  SPENDING_CATEGORIES.flatMap((category, index): [string, number][] => [
    [CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category], index],
    [`${category}（実質）`, index],
  ]),
);

const SPENDING_LABEL_BY_KEY = new Map<string, string>(
  SPENDING_CATEGORIES.flatMap((category): [string, string][] => [
    [CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category], SPENDING_LABELS[category]],
    [`${category}（実質）`, SPENDING_LABELS[category]],
  ]),
);

export function orderSpendingPresentationKeys(keys: readonly string[]): string[] {
  return [...keys].sort((left, right) => {
    const leftOrder = SPENDING_ORDER_BY_KEY.get(left) ?? Number.POSITIVE_INFINITY;
    const rightOrder = SPENDING_ORDER_BY_KEY.get(right) ?? Number.POSITIVE_INFINITY;
    return leftOrder - rightOrder;
  });
}

export function getSpendingPresentationLabel(key: string): string | undefined {
  return SPENDING_LABEL_BY_KEY.get(key);
}
