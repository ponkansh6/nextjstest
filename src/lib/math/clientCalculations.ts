import type { CpiData } from "@/types";
import { parseYearMonth } from "../yearMonth";

export interface ClientCalculationConfig {
  nominalKeys: string[];
  realKeys: string[];
}

export interface ChartCalculationProps {
  nominalData: CpiData[];
  startYear: number;
  endYear: number;
  nominalKeys?: string[];
  realKeys?: string[];
  maxCpiDate: { year: number; month: number };
  /** Quarterly rows are already projected by the server; the client only filters them for display. */
  quarterlyNominalData?: QuarterlyAggregationRow[];
  quarterlyRealData?: QuarterlyAggregationRow[];
}

export interface QuarterlyAggregationRow {
  [key: string]: string | number | null | Record<string, unknown> | undefined;
  label: string;
  quarter: number;
}

export interface ClientCalculationResult {
  quarterlyNominalData: QuarterlyAggregationRow[];
  quarterlyRealData: QuarterlyAggregationRow[];
}

const readNumericValue = (row: CpiData, key: string): number | undefined => {
  const value = (row as unknown as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
};

export const sumCategoryValues = (
  row: CpiData,
  keys: string[],
  hiddenKeys: string[] = [],
): number =>
  keys.reduce((sum, key) => {
    const value = readNumericValue(row, key);
    return !hiddenKeys.includes(key) && typeof value === "number" ? sum + value : sum;
  }, 0);

export const calculateCategorySum = (
  data: CpiData[],
  year: number,
  month: number,
  hiddenKeys: string[] = [],
  stackedKeys: string[],
): number => {
  const dataPoint = data.find((item) => {
    const parsed = typeof item.年月 === "string" ? parseYearMonth(item.年月) : undefined;
    return parsed?.year === year && parsed.month === month;
  });
  if (!dataPoint)
    throw new Error(
      `指定された年月のデータが見つかりません: ${year}年${String(month).padStart(2, "0")}月`,
    );
  return sumCategoryValues(dataPoint, stackedKeys, hiddenKeys);
};

export const calculateCAGRValue = (startValue: number, endValue: number, years: number): number =>
  startValue <= 0 || years <= 0 ? 0 : (endValue / startValue) ** (1 / years) - 1;

export function computeChartData(
  props: ChartCalculationProps,
  hiddenQuarters: number[],
  _config?: ClientCalculationConfig,
): ClientCalculationResult {
  const filterHidden = (rows: QuarterlyAggregationRow[] = []) =>
    rows.filter((row) => !hiddenQuarters.includes(row.quarter));

  // CTI quarterly aggregation, zero filling, first-value selection, and row
  // deletion are server responsibilities. This API only forwards the public
  // projection supplied by the server for rendering.
  return {
    quarterlyNominalData: filterHidden(props.quarterlyNominalData),
    quarterlyRealData: filterHidden(props.quarterlyRealData),
  };
}
