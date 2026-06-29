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
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import { NewGraph } from "./NewGraph";
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

  console.log("DEBUG allYears:", allYears);

  // 表示範囲のステート
  // 初期値がNaNやundefinedにならないよう、確実に数値(0含む)を返すように修正
  const initialStartYear = allYears.find((y) => y >= 2005) ?? allYears[0] ?? 2025;
  const initialEndYear = (allYears.length > 0 ? allYears[allYears.length - 1] : 2025) ?? 2025;

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

  // 消費支出(参考)はサーバー側で12か月移動平均済みのため、そのまま表示する
  const earningsData = mergedData;

  // 表示・非表示を管理するステート（初期値は全て表示）
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [stackedHiddenKeys, setStackedHiddenKeys] = useState<string[]>([]);
  const [maHiddenKeys, setMaHiddenKeys] = useState<string[]>([]);

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

  const handleMaLegendClick = (dataKey: string) => {
    setMaHiddenKeys((prev) =>
      prev.includes(dataKey) ? prev.filter((k) => k !== dataKey) : [...prev, dataKey],
    );
  };

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
  const nominalData = ctiData;

  const [nominalHiddenKeys, setNominalHiddenKeys] = useState<string[]>([]);
  const [realHiddenKeys, setRealHiddenKeys] = useState<string[]>([]);

  // CAGR計算用のステート
  const [cagrStartYear, setCagrStartYear] = useState<number>(() => initialStartYear ?? 2025);
  const [cagrEndYear, setCagrEndYear] = useState<number>(() => initialEndYear ?? 2025);
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
    // 状態が NaN の場合は初期値を適用する
    const startYear = isNaN(cagrStartYear) ? initialStartYear : cagrStartYear;
    const endYear = isNaN(cagrEndYear) ? initialEndYear : cagrEndYear;

    if (startYear === endYear) {
      alert("異なる年を選択してください（同じ年は指定できません）。");
      return;
    }

    // クライアントライブラリの calculateCategorySum を使用
    let startValue = 0;
    try {
      startValue = calculateCategorySum(data, startYear, cagrMonth, stackedHiddenKeys, stackedKeys);
    } catch {
      const monthStr = String(cagrMonth).padStart(2, "0");
      alert(
        `開始年月のデータが見つかりません: ${startYear}年${monthStr}月。積み上げの凡例で必要な費目が選択されているか確認してください。`,
      );
      return;
    }

    let endValue = 0;
    try {
      endValue = calculateCategorySum(data, endYear, cagrMonth, stackedHiddenKeys, stackedKeys);
    } catch {
      const monthStr = String(cagrMonth).padStart(2, "0");
      alert(
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
        allYears={allYears.filter((y) => y >= 2005)}
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

      <div className={styles.cagrSection}>
        <h2 className={styles.chartTitle}>年率上昇率（CAGR）</h2>
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
        <p className={styles.cagrNote}>※凡例で選択した費目の合計を基準にCAGRを算出</p>
      </div>

      <SpendingBarChart
        title="消費支出（名目・10分類）"
        data={quarterlyNominalData}
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
        title="消費支出（実質・10分類）"
        data={quarterlyRealData}
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

      <NewGraph
        data={mergedData}
        hiddenKeys={maHiddenKeys}
        onToggle={handleMaLegendClick}
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
  );
}
