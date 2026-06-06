"use client";

import React, { useMemo, useState } from "react";
import type { CpiData } from "@/types";
import { filterDataByYear, mergeChartData } from "../../lib/chartUtils";
import styles from "./CpiChart.module.css";
import { ChartFilters } from "./ChartFilters";
import { useChartTheme } from "../../hooks/useChartTheme";
import { useCpiChartData } from "../../hooks/useCpiChartData";
import { SpendingBarChart } from "./SpendingBarChart";
import { StackedAreaChart } from "./StackedAreaChart";
import { EarningsBreakdownChart } from "./EarningsBreakdownChart";
import { ResidualAreaChart } from "./ResidualAreaChart";
import { MajorIndicesChart } from "./MajorIndicesChart";
import { calculateCategorySum, calculateCAGRValue } from "../../lib/clientCalculations";
import {
  colors,
  keyPairs,
  nominalColorMap,
  nominalKeys,
  stackedColors,
  stackedKeys,
  SUPPORT_SERIES_KEY,
  SUPPORT_SERIES_KEY_REAL,
  targetKeys,
} from "../../lib/chartConstants";

const getColorForNominalKey = (key: string): string => {
  const targetStackedKey = nominalColorMap[key];
  const index = stackedKeys.indexOf(targetStackedKey || "");
  return index !== -1 ? stackedColors[index] : "#64748b";
};

interface CpiChartProps {
  data: CpiData[];
  ctiData: CpiData[];
  totalEarningData: CpiData[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
  isMobile: boolean;
  tooltipBg: string;
  tooltipText: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  isMobile,
  tooltipBg,
  tooltipText,
}) => {
  if (!active || !payload) {
    return null;
  }

  const fontSize = isMobile ? "12px" : "14px";
  const labelFontSize = isMobile ? "11px" : "13px";
  const padding = isMobile ? "8px" : "12px";

  return (
    <div
      style={{
        backgroundColor: tooltipBg,
        border: "none",
        borderRadius: "8px",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
        color: tooltipText,
        padding: padding,
      }}
    >
      <p
        style={{
          color: tooltipText,
          fontSize: labelFontSize,
          fontWeight: "bold",
          margin: 0,
          marginBottom: "4px",
        }}
      >
        {label}
      </p>
      {payload.map((entry, index) => (
        <p
          key={`item-${index}`}
          style={{
            color: tooltipText,
            fontSize: fontSize,
            margin: "2px 0",
          }}
        >
          {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function CpiChart({ data, ctiData, totalEarningData }: CpiChartProps) {
  const { isMobile, chartColors } = useChartTheme();

  // 全ての年を抽出
  const allYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach((item) => {
      const yearMatch = item.年月.match(/^(\d{4})年/);
      if (yearMatch) {
        years.add(parseInt(yearMatch[1], 10));
      }
    });
    return [...years].toSorted((a, b) => a - b);
  }, [data]);

  // 表示範囲のステート
  const initialStartYear = allYears.find((y) => y >= 2005) || allYears[0] || 0;
  const initialEndYear = allYears[allYears.length - 1] || 0;

  const [startYear, setStartYear] = useState(initialStartYear);
  const [endYear, setEndYear] = useState(initialEndYear);

  // データに含まれる最新の年月を特定
  const maxCpiDate = useMemo(() => {
    let maxYear = 0;
    let maxMonth = 0;
    data.forEach((item) => {
      const m = item.年月.match(/^(\d{4})年(\d{1,2})月/);
      if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        if (y > maxYear || (y === maxYear && mo > maxMonth)) {
          maxYear = y;
          maxMonth = mo;
        }
      }
    });
    return { month: maxMonth, year: maxYear };
  }, [data]);

  // ステートに基づいてデータをフィルタリング
  const filteredData = useMemo(
    () => filterDataByYear(data, startYear, endYear),
    [data, startYear, endYear],
  );

  const filteredTotalEarningData = useMemo(
    () => filterDataByYear(totalEarningData, startYear, endYear),
    [totalEarningData, startYear, endYear],
  );

  // データマッピングの統合: CPIと賃金データを年月で結合
  const mergedData = useMemo(
    () => mergeChartData(filteredTotalEarningData, data, startYear, endYear),
    [filteredTotalEarningData, data, startYear, endYear],
  );

  // 表示項目として mergedData を利用するため、明示的に参照を確保
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const displayData = mergedData;

  // 表示・非表示を管理するステート（初期値は全て表示）
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [stackedHiddenKeys, setStackedHiddenKeys] = useState<string[]>([]);

  // 凡例をクリックした時の処理
  const handleLegendClick = (dataKey: string) => {
    setHiddenKeys((prev) =>
      prev.includes(dataKey) ? prev.filter((k) => k !== dataKey) : [...prev, dataKey],
    );
  };

  const handleStackedLegendClick = (dataKey: string) => {
    setStackedHiddenKeys((prev) =>
      prev.includes(dataKey) ? prev.filter((k) => k !== dataKey) : [...prev, dataKey],
    );
  };

  const nominalColors = nominalKeys.map(getColorForNominalKey);
  const realKeys = nominalKeys.map((k) =>
    k === "その他の消費支出（名目）" ? "その他の消費支出（実質）" : k.replace("名目", "実質"),
  );
  const realColors = nominalColors;
  const nominalData = ctiData;

  const [nominalHiddenKeys, setNominalHiddenKeys] = useState<string[]>([]);

  // CAGR計算用のステート
  const [cagrStartYear, setCagrStartYear] = useState<number>(initialStartYear);
  const [cagrEndYear, setCagrEndYear] = useState<number>(initialEndYear);
  const [cagrMonth, setCagrMonth] = useState<number>(1);
  const [cagrResult, setCagrResult] = useState<number | null>(null);

  // 四半期データの集計をカスタムフックに委譲
  const { quarterlyNominalData, quarterlyRealData, hiddenQuarters, toggleQuarter, loading, error } =
    useCpiChartData({
      data,
      endYear,
      maxCpiDate,
      nominalData,
      nominalKeys,
      realKeys,
      startYear,
    });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const handleQuarterLegendClick = (quarter: number) => {
    toggleQuarter(quarter);
  };

  const handleNominalLegendClick = (dataKey: string) => {
    // 民間最終消費支出の場合
    if (dataKey === SUPPORT_SERIES_KEY || dataKey === SUPPORT_SERIES_KEY_REAL) {
      setNominalHiddenKeys((prev) => {
        const next = new Set(prev);
        [SUPPORT_SERIES_KEY, SUPPORT_SERIES_KEY_REAL].forEach((k) => {
          if (next.has(k)) next.delete(k);
          else next.add(k);
        });
        return Array.from(next);
      });
      return;
    }

    // どちらのペアに属しているか検索
    const pair = keyPairs.find((p) => p.nominal === dataKey || p.real === dataKey);
    if (!pair) return;

    // 名目と実質のキーを取得
    const keysToToggle = [pair.nominal, pair.real];

    setNominalHiddenKeys((prev) => {
      const next = new Set(prev);
      keysToToggle.forEach((k) => {
        if (next.has(k)) {
          next.delete(k);
        } else {
          next.add(k);
        }
      });
      return Array.from(next);
    });
  };

  // CAGR計算関数
  const calculateCAGR = (): void => {
    if (cagrStartYear === cagrEndYear) {
      alert("開始年と終了年は異なる年を選択してください（同じ年は指定できません）。");
      return;
    }

    // クライアントライブラリの calculateCategorySum を使用
    const startValue = calculateCategorySum(
      data,
      cagrStartYear,
      cagrMonth,
      stackedHiddenKeys,
      stackedKeys,
    );
    const endValue = calculateCategorySum(
      data,
      cagrEndYear,
      cagrMonth,
      stackedHiddenKeys,
      stackedKeys,
    );

    if (startValue === 0) {
      const monthStr = String(cagrMonth).padStart(2, "0");
      alert(
        `開始年月のデータが見つかりません: ${cagrStartYear}年${monthStr}月。積み上げの凡例で必要な費目が選択されているか確認してください。`,
      );
      return;
    }

    if (endValue === 0) {
      const monthStr = String(cagrMonth).padStart(2, "0");
      alert(
        `終了年月のデータが見つかりません: ${cagrEndYear}年${monthStr}月。積み上げの凡例で必要な費目が選択されているか確認してください。`,
      );
      return;
    }

    const years = cagrEndYear - cagrStartYear;
    const cagr = calculateCAGRValue(startValue, endValue, years);
    setCagrResult(cagr);
  };

  return (
    <div className={styles.chartContainer}>
      <ChartFilters
        allYears={allYears.filter((y) => y >= 2005)}
        startYear={startYear}
        endYear={endYear}
        setStartYear={setStartYear}
        setEndYear={setEndYear}
      />

      {/* CPI 主要指数 */}
      <div className={styles.chartSection}>
        <h2 className={styles.chartTitle}>消費者物価指数 (主要指数)</h2>
        <MajorIndicesChart
          data={filteredData}
          keys={targetKeys}
          colors={colors}
          hiddenKeys={hiddenKeys}
          onToggle={handleLegendClick}
          chartColors={chartColors}
          isMobile={isMobile}
          CustomTooltip={(props: {
            active?: boolean;
            payload?: { name: string; value: number }[];
            label?: string;
            isMobile: boolean;
            tooltipBg: string;
            tooltipText: string;
          }) => <CustomTooltip {...props} />}
        />
      </div>

      {/* CPI 費目別積み上げ */}
      <StackedAreaChart
        title="CPI費目別積み上げ"
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

      <div className={styles.cagrSection}>
        <h2 className={styles.chartTitle}>年率上昇率（CAGR）計算</h2>
        <div className={styles.cagrContainer}>
          <div className={styles.cagrControls}>
            <div className={styles.cagrItem}>
              <label htmlFor="cagrStartYear">開始年:</label>
              <select
                id="cagrStartYear"
                value={cagrStartYear}
                onChange={(e) => setCagrStartYear(parseInt(e.target.value, 10))}
                className={styles.select}
              >
                {allYears
                  .filter((year) => year >= 2005)
                  .map((year) => (
                    <option key={year} value={year} disabled={year > cagrEndYear}>
                      {year}年
                    </option>
                  ))}
              </select>
            </div>

            <div className={styles.cagrItem}>
              <label htmlFor="cagrEndYear">終了年:</label>
              <select
                id="cagrEndYear"
                value={cagrEndYear}
                onChange={(e) => setCagrEndYear(parseInt(e.target.value, 10))}
                className={styles.select}
              >
                {allYears
                  .filter((year) => year >= 2005)
                  .map((year) => (
                    <option key={year} value={year} disabled={year < cagrStartYear}>
                      {year}年
                    </option>
                  ))}
              </select>
            </div>

            <div className={styles.cagrItem}>
              <label htmlFor="cagrMonth">評価月:</label>
              <select
                id="cagrMonth"
                value={cagrMonth}
                onChange={(e) => setCagrMonth(parseInt(e.target.value, 10))}
                className={styles.select}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {String(month).padStart(2, "0")}月
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={calculateCAGR}
              className={styles.calculateButton}
              disabled={cagrStartYear === cagrEndYear}
            >
              Calculate
            </button>
          </div>

          {cagrResult !== null && (
            <div className={styles.cagrResult}>
              <p className={styles.cagrResultLabel}>年率上昇率（CAGR）:</p>
              <p className={styles.cagrResultValue}>{(cagrResult * 100).toFixed(2)}%</p>
              <p className={styles.cagrResultDetail}>
                {cagrStartYear}年{String(cagrMonth).padStart(2, "0")}月 → {cagrEndYear}年
                {String(cagrMonth).padStart(2, "0")}月
              </p>
            </div>
          )}
        </div>
        <p className={styles.cagrNote}>
          ※ 積み上げ棒グラフの凡例で選択された費目の合計を基準に計算します
        </p>
      </div>

      <SpendingBarChart
        title="名目の消費支出（10分類）積み上げ"
        data={quarterlyNominalData}
        keys={[...nominalKeys, SUPPORT_SERIES_KEY]}
        colors={[...nominalColors, "#94a3b8"]}
        hiddenKeys={nominalHiddenKeys}
        onToggle={handleNominalLegendClick}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={CustomTooltip}
        hiddenQuarters={hiddenQuarters}
        onToggleQuarter={handleQuarterLegendClick}
        onReset={() => {
          const allKeys = [...nominalKeys, ...realKeys, SUPPORT_SERIES_KEY];
          setNominalHiddenKeys((prev) => (prev.length === allKeys.length ? [] : allKeys));
        }}
      />

      <SpendingBarChart
        title="実質の消費支出（10分類）積み上げ"
        data={quarterlyRealData}
        keys={realKeys}
        colors={realColors}
        hiddenKeys={nominalHiddenKeys}
        onToggle={handleNominalLegendClick}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={CustomTooltip}
        hiddenQuarters={hiddenQuarters}
        onToggleQuarter={handleQuarterLegendClick}
        onReset={() => {
          const allKeys = [...nominalKeys, ...realKeys];
          setNominalHiddenKeys((prev) => (prev.length === allKeys.length ? [] : allKeys));
        }}
        hideLegend
      />

      <EarningsBreakdownChart
        data={mergedData}
        hiddenKeys={hiddenKeys}
        onToggle={handleLegendClick}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={(props: {
          active?: boolean;
          payload?: { name: string; value: number }[];
          label?: string;
          isMobile: boolean;
          tooltipBg: string;
          tooltipText: string;
        }) => <CustomTooltip {...props} />}
      />

      <ResidualAreaChart
        data={mergedData}
        chartColors={chartColors}
        isMobile={isMobile}
        CustomTooltip={(props: {
          active?: boolean;
          payload?: { name: string; value: number }[];
          label?: string;
          isMobile: boolean;
          tooltipBg: string;
          tooltipText: string;
        }) => <CustomTooltip {...props} />}
      />

      <div className={styles.infoContainer}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={styles.infoIcon}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p>凡例の項目をクリックすると、個別に表示/非表示を切り替えられます</p>
      </div>
    </div>
  );
}
