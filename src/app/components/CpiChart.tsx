"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { type CpiData } from "../page";
import styles from "./CpiChart.module.css";

interface CpiChartProps {
  data: CpiData[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
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
  if (!active || !payload) return null;

  const fontSize = isMobile ? "12px" : "14px";
  const labelFontSize = isMobile ? "11px" : "13px";
  const padding = isMobile ? "8px" : "12px";

  return (
    <div
      style={{
        backgroundColor: tooltipBg,
        borderRadius: "8px",
        border: "none",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
        color: tooltipText,
        padding: padding,
      }}
    >
      <p
        style={{
          fontWeight: "bold",
          marginBottom: "4px",
          margin: 0,
          fontSize: labelFontSize,
          color: tooltipText,
        }}
      >
        {label}
      </p>
      {payload.map((entry, index) => (
        <p
          key={`item-${index}`}
          style={{
            margin: "2px 0",
            fontSize: fontSize,
            color: tooltipText,
          }}
        >
          {entry.name}:{" "}
          {typeof entry.value === "number"
            ? entry.value.toFixed(2)
            : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function CpiChart({ data }: CpiChartProps) {
  // Detect dark mode
  const isDarkMode = React.useSyncExternalStore(
    React.useCallback((callback: () => void) => {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    }, []),
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false
  );

  // Detect mobile
  const isMobile = React.useSyncExternalStore(
    React.useCallback((callback: () => void) => {
      const mediaQuery = window.matchMedia("(max-width: 768px)");
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    }, []),
    () => window.matchMedia("(max-width: 768px)").matches,
    () => false
  );

  // Chart theme colors
  const chartColors = {
    gridStroke: isDarkMode ? "#2a2a2a" : "#f0f0f0",
    axisText: isDarkMode ? "#a3a3a3" : "#6b7280",
    tooltipBg: isDarkMode
      ? "rgba(26, 26, 26, 0.95)"
      : "rgba(255, 255, 255, 0.95)",
    tooltipText: isDarkMode ? "#e5e5e5" : "#000000",
  };
  // 全ての年を抽出
  const allYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach((item) => {
      const yearMatch = item.年月.match(/^(\d{4})年/);
      if (yearMatch) {
        years.add(parseInt(yearMatch[1], 10));
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [data]);

  // 表示範囲のステート（初期値は2005年以降、またはデータ全体の範囲）
  const initialStartYear = allYears.find((y) => y >= 2005) || allYears[0] || 0;
  const initialEndYear = allYears[allYears.length - 1] || 0;

  const [startYear, setStartYear] = useState(initialStartYear);
  const [endYear, setEndYear] = useState(initialEndYear);

  // ステートに基づいてデータをフィルタリング（派生データはサーバー側で計算済み）
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const yearMatch = item.年月.match(/^(\d{4})年/);
      if (!yearMatch) return false;
      const year = parseInt(yearMatch[1], 10);
      return year >= startYear && year <= endYear;
    });
  }, [data, startYear, endYear]);

  // 表示・非表示を管理するステート（初期値は全て表示）
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [stackedHiddenKeys, setStackedHiddenKeys] = useState<string[]>([]);

  // 凡例をクリックした時の処理
  const handleLegendClick = (dataKey: string) => {
    setHiddenKeys((prev) =>
      prev.includes(dataKey)
        ? prev.filter((k) => k !== dataKey)
        : [...prev, dataKey],
    );
  };

  const handleStackedLegendClick = (dataKey: string) => {
    setStackedHiddenKeys((prev) =>
      prev.includes(dataKey)
        ? prev.filter((k) => k !== dataKey)
        : [...prev, dataKey],
    );
  };

  // 表示したい項目リスト
  const targetKeys = [
    "総合",
    "生鮮食品を除く総合",
    "生鮮食品及びエネルギーを除く総合",
    "食料（酒類を除く）及びエネルギーを除く総合",
  ];
  // 色をより識別しやすいパレットに更新（コントラストと色相の差を重視）
  const colors = ["#2b8cbe", "#e66101", "#4daf4a", "#984ea3"];

  // 10大費目のリストとカラー（細分化版）
  const stackedKeys = [
    "外食以外食料",
    "外食",
    "住居",
    "光熱・水道",
    "家具・家事用品",
    "被服及び履物",
    "保健医療",
    "交通",
    "自動車等関係費",
    "通信",
    "教育",
    "教養娯楽用品",
    "教養娯楽サービス",
    "諸雑費",
  ];
  const stackedColors = [
    "#ef4444", // 外食以外食料
    "#dc2626", // 外食
    "#3b82f6", // 住居
    "#f59e0b", // 光熱・水道
    "#10b981", // 家具・家事用品
    "#6366f1", // 被服及び履物
    "#ec4899", // 保健医療
    "#06b6d4", // 交通
    "#d946ef", // 自動車等関係費
    "#0891b2", // 通信
    "#8b5cf6", // 教育
    "#f97316", // 教養娯楽用品
    "#fb923c", // 教養娯楽サービス
    "#64748b", // 諸雑費
  ];

  // CAGR計算用のステート
  const [cagrStartYear, setCagrStartYear] = useState<number>(initialStartYear);
  const [cagrEndYear, setCagrEndYear] = useState<number>(initialEndYear);
  const [cagrMonth, setCagrMonth] = useState<number>(1);
  const [cagrResult, setCagrResult] = useState<number | null>(null);

  // 選択中のカテゴリで特定の年月データの合計を計算
  // 注: CAGR計算では年月がフィルタリング範囲外の場合もあるため、元のdataを使用
  const calculateCategorySum = (year: number, month: number): number => {
    const dataPoint = data.find((item) => {
      if (!item.年月 || typeof item.年月 !== "string") return false;
      const m = item.年月.match(/^\s*(\d{4})年\s*0?(\d{1,2})月/);
      if (!m) return false;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      return y === year && mo === month;
    });
    if (!dataPoint) return 0;

    let sum = 0;
    stackedKeys.forEach((key) => {
      if (!stackedHiddenKeys.includes(key)) {
        const value = dataPoint[key];
        if (typeof value === "number") {
          sum += value;
        }
      }
    });
    return sum;
  };

  // CAGR計算関数
  const calculateCAGR = (): void => {
    if (cagrStartYear === cagrEndYear) {
      alert("開始年と終了年は異なる年を選択してください（同じ年は指定できません）。");
      return;
    }

    const startValue = calculateCategorySum(cagrStartYear, cagrMonth);
    const endValue = calculateCategorySum(cagrEndYear, cagrMonth);

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
    const cagr = Math.pow(endValue / startValue, 1 / years) - 1;
    setCagrResult(cagr);
  };

  return (
    <div className={styles.chartContainer}>
      <div className={styles.filterContainer}>
        <div className={styles.filterItem}>
          <label htmlFor="startYear">開始年:</label>
          <select
            id="startYear"
            value={startYear}
            onChange={(e) => setStartYear(parseInt(e.target.value, 10))}
            className={styles.select}
          >
            {allYears.map((year) => (
              <option key={year} value={year} disabled={year > endYear}>
                {year}年
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterItem}>
          <label htmlFor="endYear">終了年:</label>
          <select
            id="endYear"
            value={endYear}
            onChange={(e) => setEndYear(parseInt(e.target.value, 10))}
            className={styles.select}
          >
            {allYears.map((year) => (
              <option key={year} value={year} disabled={year < startYear}>
                {year}年
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.legendContainer}>
        <div className={styles.legendSection}>
          <h3 className={styles.legendTitle}>主要指数</h3>
          <div className={styles.legendItems}>
            {targetKeys.map((key, index) => (
              <button
                key={key}
                onClick={() => handleLegendClick(key)}
                className={`${styles.legendItem} ${
                  hiddenKeys.includes(key) ? styles.hidden : ""
                }`}
                aria-pressed={!hiddenKeys.includes(key)}
              >
                <span
                  className={styles.legendIcon}
                  style={{ backgroundColor: colors[index] }}
                />
                <span className={styles.legendLabel}>{key}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.chartSection}>
        <h2 className={styles.chartTitle}>消費者物価指数 (主要指数)</h2>
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredData}
              margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
              barGap={0}
              barCategoryGap={0}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={chartColors.gridStroke}
              />
              <XAxis
                dataKey="年月"
                axisLine={false}
                tickLine={false}
                tick={{ fill: chartColors.axisText, fontSize: 12 }}
                dy={10}
              />
              <YAxis
                domain={[0, "auto"]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: chartColors.axisText, fontSize: 12 }}
                dx={-10}
              />
              <Tooltip
                content={
                  <CustomTooltip
                    isMobile={isMobile}
                    tooltipBg={chartColors.tooltipBg}
                    tooltipText={chartColors.tooltipText}
                  />
                }
              />

              {targetKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[index]}
                  fillOpacity={0.9}
                  hide={hiddenKeys.includes(key)}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.chartSection}>
        <h2 className={styles.chartTitle}>CPI費目別積み上げ</h2>
        <div className={styles.legendContainer}>
          <div className={styles.legendSection}>
            <div className={styles.legendHeader}>
              <h3 className={styles.legendTitle}>費目</h3>
              <div className={styles.legendActions}>
                <button
                  onClick={() =>
                    setStackedHiddenKeys((prev) =>
                      prev.length === stackedKeys.length
                        ? []
                        : [...stackedKeys],
                    )
                  }
                  className={styles.actionButton}
                  aria-label="全選択解除"
                >
                  全選択解除
                </button>
              </div>
            </div>
            <div className={styles.stackedLegendItems}>
              {stackedKeys.map((key, index) => (
                <button
                  key={key}
                  onClick={() => handleStackedLegendClick(key)}
                  className={`${styles.legendItem} ${
                    stackedHiddenKeys.includes(key) ? styles.hidden : ""
                  }`}
                  aria-pressed={!stackedHiddenKeys.includes(key)}
                >
                  <span
                    className={styles.legendIcon}
                    style={{ backgroundColor: stackedColors[index] }}
                  />
                  <span className={styles.legendLabel}>{key}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={filteredData}
              margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={chartColors.gridStroke}
              />
              <XAxis
                dataKey="年月"
                axisLine={false}
                tickLine={false}
                tick={{ fill: chartColors.axisText, fontSize: 12 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: chartColors.axisText, fontSize: 12 }}
                dx={-10}
              />
              <Tooltip
                content={
                  <CustomTooltip
                    isMobile={isMobile}
                    tooltipBg={chartColors.tooltipBg}
                    tooltipText={chartColors.tooltipText}
                  />
                }
              />

              {stackedKeys.map((key, index) => (
                <Area
                  key={key}
                  dataKey={key}
                  stackId="a"
                  type="monotone"
                  stroke="none"
                  fill={stackedColors[index]}
                  hide={stackedHiddenKeys.includes(key)}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

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
                {allYears.map((year) => (
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
                {allYears.map((year) => (
                  <option
                    key={year}
                    value={year}
                    disabled={year < cagrStartYear}
                  >
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
              <p className={styles.cagrResultValue}>
                {(cagrResult * 100).toFixed(2)}%
              </p>
              <p className={styles.cagrResultDetail}>
                {cagrStartYear}年{String(cagrMonth).padStart(2, "0")}月 →{" "}
                {cagrEndYear}年{String(cagrMonth).padStart(2, "0")}月
              </p>
            </div>
          )}
        </div>
        <p className={styles.cagrNote}>
          ※ 積み上げ棒グラフの凡例で選択された費目の合計を基準に計算します
        </p>
      </div>

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
