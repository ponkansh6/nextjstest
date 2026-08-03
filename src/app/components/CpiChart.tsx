"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { CpiView, QuarterlyView, EarningsView } from "@/types/chart";
import { filterDataByYear, mergeChartData } from "../../lib/chartUtils";
import { parseYearMonth } from "../../lib/yearMonth";
import { adaptCpiViewToChartData, adaptEarningsViewToChartData } from "../../lib/chartAdapters";
import styles from "./CpiChart.module.css";
import { ChartFilters } from "./ChartFilters";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useCpiChartData } from "../../hooks/useCpiChartData";
import { useToggleSet } from "../../hooks/useToggleSet";
import { CustomTooltip } from "./CustomTooltip";
import { StackedAreaChart } from "./StackedAreaChart";
import { MajorIndicesChart } from "./MajorIndicesChart";
import { CagrPanel } from "./CagrPanel";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";

const SpendingBarChart = dynamic(
  () => import("./SpendingBarChart").then((m) => m.SpendingBarChart),
  {
    loading: () => <div className={styles.chartSkeleton}>Chart loading...</div>,
  },
);

const EarningsBreakdownChart = dynamic(
  () => import("./EarningsBreakdownChart").then((m) => m.EarningsBreakdownChart),
  {
    loading: () => <div className={styles.chartSkeleton}>Chart loading...</div>,
  },
);

const ResidualAreaChart = dynamic(
  () => import("./ResidualAreaChart").then((m) => m.ResidualAreaChart),
  {
    loading: () => <div className={styles.chartSkeleton}>Chart loading...</div>,
  },
);

const NewGraph = dynamic(() => import("./NewGraph").then((m) => m.NewGraph), {
  loading: () => <div className={styles.chartSkeleton}>Chart loading...</div>,
});
import { calculateCategorySum, calculateCAGRValue } from "../../lib/clientCalculations";
import { createDualResetHandler } from "../../lib/resetLogic";
import {
  colors,
  keyPairs,
  nominalColorMap,
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  stackedColors,
  stackedKeys,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  targetKeys,
  MIN_DISPLAY_YEAR,
} from "../../lib/chartConstants";

const getColorForNominalKey = (key: string): string => {
  const targetStackedKey = nominalColorMap[key];
  const index = stackedKeys.indexOf(targetStackedKey || "");
  return index !== -1 ? stackedColors[index] : "#64748b";
};

interface CpiChartProps {
  data: CpiView[];
  quarterlyNominalData: QuarterlyView[];
  quarterlyRealData: QuarterlyView[];
  totalEarningData: EarningsView[];
  maxCpiDate: { year: number; month: number };
}

export default function CpiChart({
  data,
  quarterlyNominalData,
  quarterlyRealData,
  totalEarningData,
  maxCpiDate: _maxCpiDate,
}: CpiChartProps) {
  const { isMobile, chartColors } = useChartTheme();

  // 全ての年を抽出
  const allYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach((item) => {
      const parsed = parseYearMonth(item.年月);
      if (parsed) {
        years.add(parsed.year);
      }
    });
    return [...years].toSorted((a, b) => a - b);
  }, [data]);

  // 表示範囲のステート
  // 初期値がNaNやundefinedにならないよう、確実に数値(0含む)を返すように修正
  const initialStartYear = allYears.find((y) => y >= MIN_DISPLAY_YEAR) ?? allYears[0] ?? 2025;
  const initialEndYear = (allYears.length > 0 ? allYears[allYears.length - 1] : 2025) ?? 2025;

  const [startYear, setStartYear] = useState(initialStartYear);
  const [endYear, setEndYear] = useState(initialEndYear);

  // View Model 型をチャート計算用の内部型に統一
  const chartData = useMemo(() => adaptCpiViewToChartData(data), [data]);

  // ステートに基づいてデータをフィルタリング
  const filteredData = useMemo(
    () => filterDataByYear(chartData, startYear, endYear),
    [chartData, startYear, endYear],
  );

  const filteredTotalEarningData = useMemo(
    () => filterDataByYear(adaptEarningsViewToChartData(totalEarningData), startYear, endYear),
    [totalEarningData, startYear, endYear],
  );

  // 四半期データのフィルタリング（消費支出グラフ用）
  const filteredQuarterlyNominalData = useMemo(
    () => filterDataByYear(quarterlyNominalData, startYear, endYear),
    [quarterlyNominalData, startYear, endYear],
  );

  const filteredQuarterlyRealData = useMemo(
    () => filterDataByYear(quarterlyRealData, startYear, endYear),
    [quarterlyRealData, startYear, endYear],
  );

  // データマッピングの統合: CPIと賃金データを年月で結合
  const mergedData = useMemo(
    () => mergeChartData(filteredTotalEarningData, chartData, startYear, endYear),
    [filteredTotalEarningData, chartData, startYear, endYear],
  );

  // 表示項目として mergedData を利用するため、明示的に参照を確保
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const displayData = mergedData;

  // 消費支出（参考）はサーバー側で12か月移動平均済みのため、そのまま表示する
  const earningsData = mergedData;

  // 表示・非表示を管理するステート（初期値は全て表示）
  const [hiddenKeys, handleLegendClick] = useToggleSet<string>();
  const [stackedHiddenKeys, handleStackedLegendClick, setStackedHiddenKeys] =
    useToggleSet<string>();
  const [maHiddenKeys, handleMaLegendClick] = useToggleSet<string>();

  const nominalKeys = CONSUMPTION_NOMINAL_KEYS;
  const realKeys = CONSUMPTION_REAL_KEYS;

  const nominalColors = nominalKeys.map(getColorForNominalKey);
  const nominalKeysWithSupport = [...nominalKeys, SUPPORT_SERIES_KEY_NOMINAL];
  const realKeysWithSupport = [...realKeys, SUPPORT_SERIES_KEY_REAL];
  const nominalColorsWithSupport = [...nominalColors, "#94a3b8"];
  const realColors = realKeys.map((key) => {
    const nominalKey = key.replace("（実質）", "（名目）");
    const targetStackedKey = nominalColorMap[nominalKey];
    const index = stackedKeys.indexOf(targetStackedKey || "");
    return index !== -1 ? stackedColors[index] : "#64748b";
  });

  const [nominalHiddenKeys, setNominalHiddenKeys] = useState<string[]>([]);
  const [realHiddenKeys, setRealHiddenKeys] = useState<string[]>([]);

  // CAGR計算用のステート
  const [cagrStartYear, setCagrStartYear] = useState<number>(() => initialStartYear ?? 2025);
  const [cagrEndYear, setCagrEndYear] = useState<number>(() => initialEndYear ?? 2025);
  const [cagrMonth, setCagrMonth] = useState<number>(1);
  const [cagrResult, setCagrResult] = useState<number | null>(null);
  const [cagrError, setCagrError] = useState<string | null>(null);

  // Filter quarterly data by hiddenQuarters
  const { hiddenQuarters, toggleQuarter } = useCpiChartData();

  const handleQuarterLegendClick = (quarter: number) => {
    toggleQuarter(quarter);
  };

  const handleLegendToggle = (dataKey: string) => {
    // ペアを探す
    const supportPair = {
      nominal: SUPPORT_SERIES_KEY_NOMINAL,
      real: SUPPORT_SERIES_KEY_REAL,
      label: "民間最終消費支出",
    };
    const allPairs = [...keyPairs, supportPair];

    const pair = allPairs.find((p) => p.nominal === dataKey || p.real === dataKey);
    if (!pair) return;

    const nominalKey = pair.nominal;
    const realKey = pair.real;

    setNominalHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nominalKey)) {
        next.delete(nominalKey);
      } else {
        next.add(nominalKey);
      }
      return Array.from(next);
    });

    setRealHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(realKey)) {
        next.delete(realKey);
      } else {
        next.add(realKey);
      }
      return Array.from(next);
    });
  };

  // CAGR計算関数
  const calculateCAGR = (): void => {
    setCagrError(null);
    // 状態が NaN の場合は初期値を適用する
    const startYear = isNaN(cagrStartYear) ? initialStartYear : cagrStartYear;
    const endYear = isNaN(cagrEndYear) ? initialEndYear : cagrEndYear;

    if (startYear === endYear) {
      setCagrError("異なる年を選択してください（同じ年は指定できません）。");
      return;
    }

    // クライアントライブラリの calculateCategorySum を使用
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

  return (
    <div className={styles.chartContainer}>
      <ChartFilters
        allYears={allYears.filter((y) => y >= MIN_DISPLAY_YEAR)}
        startYear={startYear}
        endYear={endYear}
        setStartYear={setStartYear}
        setEndYear={setEndYear}
      />

      {/* CPI 主要指数 */}
      <div className={styles.chartSection}>
        <h2 className={styles.chartTitle}>
          消費者物価指数（主要指数）
          <ChartInfoContentRenderer
            chartKey="cpi-major"
            ariaLabel="消費者物価指数のデータソースを表示"
          />
        </h2>
        <MajorIndicesChart
          data={filteredData}
          keys={targetKeys}
          colors={colors}
          hiddenKeys={hiddenKeys}
          onToggle={handleLegendClick}
          chartColors={chartColors}
          isMobile={isMobile}
          CustomTooltip={CustomTooltip}
        />
      </div>

      {/* CPI 費目別積み上げ */}
      <StackedAreaChart
        title="物価指数 費目別寄与度"
        data={filteredData}
        keys={stackedKeys}
        colors={stackedColors}
        hiddenKeys={stackedHiddenKeys}
        onToggle={handleStackedLegendClick}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={CustomTooltip}
        onReset={() =>
          setStackedHiddenKeys((prev) =>
            prev.length === stackedKeys.length ? [] : [...stackedKeys],
          )
        }
      />

      <CagrPanel
        allYears={allYears}
        cagrStartYear={cagrStartYear}
        cagrEndYear={cagrEndYear}
        cagrMonth={cagrMonth}
        cagrResult={cagrResult}
        cagrError={cagrError}
        setCagrStartYear={setCagrStartYear}
        setCagrEndYear={setCagrEndYear}
        setCagrMonth={setCagrMonth}
        calculateCAGR={calculateCAGR}
      />

      <SpendingBarChart
        title="消費支出（名目）"
        infoKey="consumption-expenditure"
        data={filteredQuarterlyNominalData}
        keys={nominalKeysWithSupport}
        colors={nominalColorsWithSupport}
        hiddenKeys={nominalHiddenKeys}
        onToggle={handleLegendToggle}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={CustomTooltip}
        hiddenQuarters={hiddenQuarters}
        onToggleQuarter={handleQuarterLegendClick}
        onReset={createDualResetHandler(
          {
            hiddenKeys: nominalHiddenKeys,
            allKeys: nominalKeysWithSupport,
            setHiddenKeys: setNominalHiddenKeys,
          },
          {
            hiddenKeys: realHiddenKeys,
            allKeys: realKeysWithSupport,
            setHiddenKeys: setRealHiddenKeys,
          },
        )}
      />

      <SpendingBarChart
        title="消費支出（実質）"
        infoKey="consumption-expenditure"
        data={filteredQuarterlyRealData}
        keys={realKeysWithSupport}
        colors={[...realColors, "#94a3b8"]}
        hiddenKeys={realHiddenKeys}
        onToggle={handleLegendToggle}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={CustomTooltip}
        hiddenQuarters={hiddenQuarters}
        onToggleQuarter={handleQuarterLegendClick}
        onReset={createDualResetHandler(
          {
            hiddenKeys: nominalHiddenKeys,
            allKeys: nominalKeysWithSupport,
            setHiddenKeys: setNominalHiddenKeys,
          },
          {
            hiddenKeys: realHiddenKeys,
            allKeys: realKeysWithSupport,
            setHiddenKeys: setRealHiddenKeys,
          },
        )}
        hideLegend
      />

      <EarningsBreakdownChart
        data={earningsData}
        hiddenKeys={hiddenKeys}
        onToggle={handleLegendClick}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={CustomTooltip}
      />

      <ResidualAreaChart
        data={mergedData}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={CustomTooltip}
      />

      <NewGraph
        data={mergedData}
        hiddenKeys={maHiddenKeys}
        onToggle={handleMaLegendClick}
        chartColors={chartColors}
        isMobile={isMobile}
        chartKey="new-graph"
        CustomTooltip={CustomTooltip}
      />
    </div>
  );
}
