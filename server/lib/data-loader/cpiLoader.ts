import type { CpiData } from "@/types";
import { parseYearMonth } from "@/lib/yearMonth";
import type { ValidatedCpiPair } from "./cpiValidation";

const CPI_MAJOR_CATEGORIES = [
  "食料",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・通信",
  "教育",
  "教養娯楽",
  "諸雑費",
] as const;
const CPI_COMPARISON_COMPONENTS = new Set([
  "住居",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "教育",
  "光熱・水道",
  "教養娯楽",
  "交通",
  "自動車等関係費",
  "通信",
  "食料",
  "外食",
  "諸雑費",
]);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function getCpiMajorWeightTotal(weights: Record<string, number>): number {
  const total = CPI_MAJOR_CATEGORIES.reduce((sum, key) => sum + weights[key], 0);
  return Number.isFinite(total) && total > 0 ? total : 10_000;
}

export function transformCpiData(validated: ValidatedCpiPair): CpiData[] {
  const comparisonWeightTotal = getCpiMajorWeightTotal(validated.weights);
  return validated.data
    .filter((row) => {
      if (!row["年月"]) return false;
      const parsed = parseYearMonth(row["年月"] as string);
      return parsed ? parsed.year >= 2004 : false;
    })
    .map((row) => {
      const newRow: CpiData = { ...row };
      Object.keys(validated.weights).forEach((key) => {
        const value = row[key];
        if (isFiniteNumber(value)) {
          const denominator = CPI_COMPARISON_COMPONENTS.has(key) ? comparisonWeightTotal : 10_000;
          newRow[key] = (value * validated.weights[key]) / denominator;
        } else {
          newRow[key] = undefined;
        }
      });
      newRow["外食以外食料"] =
        isFiniteNumber(newRow.食料) && isFiniteNumber(newRow.外食)
          ? newRow.食料 - newRow.外食
          : undefined;
      newRow["交通・自動車等関係費"] =
        isFiniteNumber(newRow.交通) && isFiniteNumber(newRow["自動車等関係費"])
          ? newRow.交通 + newRow["自動車等関係費"]
          : undefined;
      delete newRow["教養娯楽サービス"];
      delete newRow["教養娯楽用品"];
      delete newRow["交通"];
      delete newRow["自動車等関係費"];
      return newRow;
    });
}
