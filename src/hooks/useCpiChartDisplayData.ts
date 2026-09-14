import { useMemo } from "react";
import type { CpiView, EarningsView, QuarterlyView } from "@/types/chart";
import { adaptCpiViewToChartData, adaptEarningsViewToChartData } from "../lib/chartAdapters";
import { filterDataByYear, mergeChartData } from "../lib/chartUtils";

interface UseCpiChartDisplayDataProps {
  data: CpiView[];
  quarterlyNominalData: QuarterlyView[];
  quarterlyRealData: QuarterlyView[];
  totalEarningData: EarningsView[];
  startYear: number;
  endYear: number;
  hiddenQuarters: number[];
}

const isPublicQuarterlyRow = (row: QuarterlyView): boolean =>
  /^\d{4}Q[1-4]$/.test(row.label) &&
  Number.isInteger(row.年) &&
  Number.isInteger(row.quarter) &&
  row.quarter >= 1 &&
  row.quarter <= 4;

export function useCpiChartDisplayData({
  data,
  quarterlyNominalData,
  quarterlyRealData,
  totalEarningData,
  startYear,
  endYear,
  hiddenQuarters,
}: UseCpiChartDisplayDataProps) {
  const chartData = useMemo(() => adaptCpiViewToChartData(data), [data]);

  const filteredData = useMemo(
    () => filterDataByYear(chartData, startYear, endYear),
    [chartData, startYear, endYear],
  );

  const filteredTotalEarningData = useMemo(
    () => filterDataByYear(adaptEarningsViewToChartData(totalEarningData), startYear, endYear),
    [totalEarningData, startYear, endYear],
  );

  const filteredQuarterlyNominalData = useMemo(
    () =>
      quarterlyNominalData
        .filter(isPublicQuarterlyRow)
        .filter((row) => row.年 >= startYear && row.年 <= endYear)
        .filter((row) => !hiddenQuarters.includes(row.quarter)),
    [quarterlyNominalData, startYear, endYear, hiddenQuarters],
  );

  const filteredQuarterlyRealData = useMemo(
    () =>
      quarterlyRealData
        .filter(isPublicQuarterlyRow)
        .filter((row) => row.年 >= startYear && row.年 <= endYear)
        .filter((row) => !hiddenQuarters.includes(row.quarter)),
    [quarterlyRealData, startYear, endYear, hiddenQuarters],
  );

  const mergedData = useMemo(
    () => mergeChartData(filteredTotalEarningData, chartData, startYear, endYear),
    [filteredTotalEarningData, chartData, startYear, endYear],
  );

  return {
    chartData,
    filteredData,
    filteredQuarterlyNominalData,
    filteredQuarterlyRealData,
    mergedData,
    earningsData: mergedData,
  };
}
