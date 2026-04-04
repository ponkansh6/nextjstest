"use client";

import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type LegendPayload,
} from "recharts";
import { type CpiData } from "../page";
import styles from "./CpiChart.module.css";

interface CpiChartProps {
  data: CpiData[];
}

export default function CpiChart({ data }: CpiChartProps) {
  // 表示・非表示を管理するステート（初期値は全て表示）
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  // 凡例をクリックした時の処理
  const handleLegendClick = (e: { dataKey: string }) => {
    const { dataKey } = e;
    setHiddenKeys((prev) =>
      prev.includes(dataKey)
        ? prev.filter((k) => k !== dataKey)
        : [...prev, dataKey],
    );
  };

  // 表示したい項目リスト
  const targetKeys = ["総合", "生鮮食品を除く総合", "持家の帰属家賃を除く総合"];
  const colors = ["#8884d8", "#82ca9d", "#ffc658"];

  return (
    <div className={styles.chartContainer}>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
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
            <Legend
              onClick={(entry: LegendPayload) => {
                if (entry && typeof entry.dataKey === "string") {
                  handleLegendClick({ dataKey: entry.dataKey });
                }
              }}
              wrapperStyle={{
                cursor: "pointer",
                paddingTop: "20px",
                fontSize: "14px",
              }}
              align="center"
              verticalAlign="bottom"
              iconType="circle"
            />

            {targetKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index]}
                hide={hiddenKeys.includes(key)}
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                activeDot={{ r: 7, strokeWidth: 0 }}
                animationDuration={1000}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
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
        <p>凡例の項目名をクリックすると、個別に表示/非表示を切り替えられます</p>
      </div>
    </div>
  );
}
