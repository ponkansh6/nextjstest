import type { CpiData } from "@/types";
import {
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  CPI_CATEGORIES,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
} from "./chartConstants";
import { scaleSupportSeriesLegacy } from "./math/supportSeries";
import * as math from "./math/clientCalculations";
import type { ClientCalculationResult, QuarterlyAggregationRow } from "./math/clientCalculations";

const CTI_CATEGORY_KEYS = new Set([...CONSUMPTION_NOMINAL_KEYS, ...CONSUMPTION_REAL_KEYS]);
export { CPI_CATEGORIES };
export const sumCategoryValues = math.sumCategoryValues;
export const calculateCAGRValue = math.calculateCAGRValue;
export const calculateCategorySum = (
  data: CpiData[],
  year: number,
  month: number,
  hiddenKeys: string[] = [],
  stackedKeys: string[] = CPI_CATEGORIES,
) => math.calculateCategorySum(data, year, month, hiddenKeys, stackedKeys);
export interface UseCpiChartDataProps {
  data: CpiData[];
  nominalData: CpiData[];
  startYear: number;
  endYear: number;
  nominalKeys?: string[];
  realKeys?: string[];
  maxCpiDate: { year: number; month: number };
}
export const computeChartData = (
  props: UseCpiChartDataProps,
  hiddenQuarters: number[],
): ClientCalculationResult => {
  const result = math.computeChartData(props, hiddenQuarters, {
    nominalKeys: props.nominalKeys || CONSUMPTION_NOMINAL_KEYS,
    realKeys: props.realKeys || CONSUMPTION_REAL_KEYS,
    ctiKeys: CTI_CATEGORY_KEYS,
    supportNominalKey: SUPPORT_SERIES_KEY_NOMINAL,
    supportRealKey: SUPPORT_SERIES_KEY_REAL,
  });
  const scale = (rows: QuarterlyAggregationRow[], key: string): QuarterlyAggregationRow[] =>
    scaleSupportSeriesLegacy(rows, key) as QuarterlyAggregationRow[];
  return {
    quarterlyNominalData: scale(result.quarterlyNominalData, SUPPORT_SERIES_KEY_NOMINAL),
    quarterlyRealData: scale(result.quarterlyRealData, SUPPORT_SERIES_KEY_REAL),
  };
};
