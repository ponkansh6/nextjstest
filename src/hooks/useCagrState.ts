import { useState } from "react";
import type { CpiData } from "@/types";
import { calculateCategorySum, calculateCAGRValue } from "../lib/clientCalculations";

interface UseCagrStateProps {
  initialStartYear: number;
  initialEndYear: number;
  chartData: CpiData[];
  stackedHiddenKeys: string[];
  stackedKeys: string[];
}

export function useCagrState({
  initialStartYear,
  initialEndYear,
  chartData,
  stackedHiddenKeys,
  stackedKeys,
}: UseCagrStateProps) {
  const [cagrStartYear, setCagrStartYear] = useState<number>(() => initialStartYear ?? 2025);
  const [cagrEndYear, setCagrEndYear] = useState<number>(() => initialEndYear ?? 2025);
  const [cagrMonth, setCagrMonth] = useState<number>(1);
  const [cagrResult, setCagrResult] = useState<number | null>(null);
  const [cagrError, setCagrError] = useState<string | null>(null);

  const [prevCagrDeps, setPrevCagrDeps] = useState({
    cagrStartYear,
    cagrEndYear,
    cagrMonth,
    stackedHiddenKeys,
  });
  if (
    prevCagrDeps.cagrStartYear !== cagrStartYear ||
    prevCagrDeps.cagrEndYear !== cagrEndYear ||
    prevCagrDeps.cagrMonth !== cagrMonth ||
    prevCagrDeps.stackedHiddenKeys !== stackedHiddenKeys
  ) {
    setPrevCagrDeps({ cagrStartYear, cagrEndYear, cagrMonth, stackedHiddenKeys });
    if (cagrResult !== null) {
      setCagrResult(null);
    }
  }

  const calculateCAGR = (): void => {
    setCagrError(null);

    const startYear = isNaN(cagrStartYear) ? initialStartYear : cagrStartYear;
    const endYear = isNaN(cagrEndYear) ? initialEndYear : cagrEndYear;

    if (startYear === endYear) {
      setCagrError("異なる年を選択してください（同じ年は指定できません）。");
      return;
    }

    let startValue = 0;
    try {
      startValue = calculateCategorySum(
        chartData,
        startYear,
        cagrMonth,
        stackedHiddenKeys,
        stackedKeys,
      );
    } catch {
      const monthStr = String(cagrMonth).padStart(2, "0");
      setCagrError(
        `開始年月のデータが見つかりません: ${startYear}年${monthStr}月。積み上げの凡例で必要な費目が選択されているか確認してください。`,
      );
      return;
    }

    let endValue = 0;
    try {
      endValue = calculateCategorySum(
        chartData,
        endYear,
        cagrMonth,
        stackedHiddenKeys,
        stackedKeys,
      );
    } catch {
      const monthStr = String(cagrMonth).padStart(2, "0");
      setCagrError(
        `終了年月のデータが見つかりません: ${endYear}年${monthStr}月。積み上げの凡例で必要な費目が選択されているか確認してください。`,
      );
      return;
    }

    const years = endYear - startYear;
    const cagr = calculateCAGRValue(startValue, endValue, years);
    setCagrResult(cagr);
  };

  return {
    cagrStartYear,
    cagrEndYear,
    cagrMonth,
    cagrResult,
    cagrError,
    setCagrStartYear,
    setCagrEndYear,
    setCagrMonth,
    calculateCAGR,
  };
}
