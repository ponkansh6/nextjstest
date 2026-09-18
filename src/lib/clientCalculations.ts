import type { CpiData } from "@/types";
import { CPI_CATEGORIES } from "./chartConstants";
import * as math from "./math/clientCalculations";
import type { ClientCalculationResult } from "./math/clientCalculations";

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
  quarterlyNominalData?: ClientCalculationResult["quarterlyNominalData"];
  quarterlyRealData?: ClientCalculationResult["quarterlyRealData"];
}
export const computeChartData = (
  props: UseCpiChartDataProps,
  hiddenQuarters: number[],
): ClientCalculationResult => {
  const result = math.computeChartData(props, hiddenQuarters);
  return {
    quarterlyNominalData: result.quarterlyNominalData,
    quarterlyRealData: result.quarterlyRealData,
  };
};
