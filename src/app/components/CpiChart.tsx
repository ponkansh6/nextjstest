"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
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

export default function CpiChart({ data }: CpiChartProps) {
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
  ];
  const colors = ["#8884d8", "#82ca9d", "#ffc658"];

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
    "#0891b2", // 通信
    "#8b5cf6", // 教育
    "#f97316", // 教養娯楽用品
    "#fb923c", // 教養娯楽サービス
    "#64748b", // 諸雑費
  ];

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
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f0f0f0"
              />
              <XAxis
                dataKey="年月"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 12 }}
                dy={10}
              />
              <YAxis
                domain={["auto", "auto"]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 12 }}
                dx={-10}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
              />

              {targetKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={colors[index]}
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
            <h3 className={styles.legendTitle}>費目</h3>
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
            <BarChart
              data={filteredData}
              margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#f0f0f0"
              />
              <XAxis
                dataKey="年月"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 12 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 12 }}
                dx={-10}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
                labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
              />

              {stackedKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={stackedColors[index]}
                  hide={stackedHiddenKeys.includes(key)}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
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
