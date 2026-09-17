import type { CpiData } from "@/types";
import { parseYearMonth, normalizeYearMonth } from "../yearMonth";
import type { SupportSeriesRow } from "./supportSeries";
import { isCompleteCtiQuarter } from "./quarterlyCompleteness";

export interface ClientCalculationConfig {
  nominalKeys: string[];
  realKeys: string[];
  ctiKeys: Set<string>;
  supportNominalKey: string;
  supportRealKey: string;
}

export interface ChartCalculationProps {
  nominalData: CpiData[];
  startYear: number;
  endYear: number;
  nominalKeys?: string[];
  realKeys?: string[];
  maxCpiDate: { year: number; month: number };
}

export interface QuarterlyAggregationRow extends SupportSeriesRow {
  [key: string]: string | number | null | undefined;
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
  config: ClientCalculationConfig,
): ClientCalculationResult {
  const nominalKeys = props.nominalKeys || config.nominalKeys;
  const realKeys = props.realKeys || config.realKeys;
  const normalized = props.nominalData.map((d) => ({
    ...d,
    年月: normalizeYearMonth(String(d.年月)),
  }));
  const allMonths: string[] = [];
  for (let y = props.startYear; y <= props.endYear; y++)
    for (let m = 1; m <= 12; m++) allMonths.push(`${y}年${m}月`);
  const sourceMap = new Map(normalized.map((d) => [d.年月, d]));
  const filled = allMonths.map((period) => {
    const existing = sourceMap.get(period);
    if (existing)
      return {
        ...existing,
        [config.supportNominalKey]: readNumericValue(existing, config.supportNominalKey),
      };
    const empty = { 年月: period } as CpiData;
    [...nominalKeys, ...realKeys, config.supportNominalKey].forEach((key) => {
      empty[key as keyof CpiData] = 0;
    });
    return empty;
  });
  const endYear = Math.min(props.endYear, props.maxCpiDate.year);
  const map = new Map(filled.map((d) => [d.年月, d]));
  const quarterly = (keys: string[]) => {
    const categoryKeys = keys.filter((key) => config.ctiKeys.has(key));
    const completenessKeys = [...new Set([...nominalKeys, ...realKeys])].filter((key) =>
      config.ctiKeys.has(key),
    );
    const rows: QuarterlyAggregationRow[] = [];
    for (let y = props.startYear; y <= endYear; y++) {
      const maxQ = y === props.maxCpiDate.year ? Math.ceil(props.maxCpiDate.month / 3) : 4;
      for (let q = 1; q <= maxQ; q++) {
        const months = [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
          [10, 11, 12],
        ][q - 1];
        const item: QuarterlyAggregationRow = {
          label: `${y}Q${q}`,
          quarter: q,
          年: y,
          [config.supportNominalKey]: 0,
          [config.supportRealKey]: 0,
        };
        categoryKeys.forEach((key) => {
          item[key] = 0;
        });
        months.forEach((m) => {
          const row = map.get(`${y}年${m}月`);
          if (!row) return;
          [...new Set([...categoryKeys, config.supportNominalKey, config.supportRealKey])].forEach(
            (key) => {
              const value = readNumericValue(row, key);
              if (value === undefined) return;
              if (key === config.supportNominalKey || key === config.supportRealKey) {
                if (!(item[key] as number)) item[key] = value;
              } else item[key] = (item[key] as number) + value;
            },
          );
        });
        if (categoryKeys.length && !isCompleteCtiQuarter(sourceMap, y, q, completenessKeys))
          continue;
        if (hiddenQuarters.includes(q)) continue;
        categoryKeys.forEach((key) => {
          item[key] = (item[key] as number) / 3;
        });
        rows.push(item);
      }
    }
    return rows;
  };
  return { quarterlyNominalData: quarterly(nominalKeys), quarterlyRealData: quarterly(realKeys) };
}
