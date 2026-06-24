import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./CpiChart.module.css";
import type { CpiData } from "@/types";

interface NewGraphProps {
  data: CpiData[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  isMobile: boolean;
  CustomTooltip: React.FC<{
    active?: boolean;
    payload?: { name: string; value: number }[];
    label?: string;
    isMobile: boolean;
    tooltipBg: string;
    tooltipText: string;
  }>;
}

interface LineConfig {
  key: string;
  color: string;
  displayName: string;
}

const LINE_CONFIGS: LineConfig[] = [
  { key: "総合", color: "#e11d48", displayName: "給与(総合)" },
  { key: "消費支出(参考)", color: "#0891b2", displayName: "消費支出(総合)" },
  { key: "CPI総合(12MA)", color: "#65a30d", displayName: "CPI総合(12MA)" },
];

export const NewGraph: React.FC<NewGraphProps> = ({
  data,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  CustomTooltip,
}) => (
  <div className={styles.chartSection}>
    <h2 className={styles.chartTitle}>主要指標の12か月移動平均比較</h2>
    <p className={styles.chartNote}>
      ※給与(総合)=所定内給与･所定外給与･特別給与の12か月移動平均の合計、消費支出(総合)とCPI総合(12MA)も全て12か月移動平均
    </p>
    <div className={styles.legendContainer}>
      <div className={styles.legendSection}>
        <div className={styles.legendItems}>
          {LINE_CONFIGS.map(({ key, color, displayName }) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
              aria-pressed={!hiddenKeys.includes(key)}
            >
              <span className={styles.legendIcon} style={{ backgroundColor: color }} />
              <span className={styles.legendLabel}>{displayName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
          {data
            .filter(
              (d) =>
                d.年月.endsWith("年1月") &&
                [2010, 2015, 2020, 2025].includes(parseInt(d.年月.split("年")[0])),
            )
            .map((d) => (
              <ReferenceLine
                key={d.年月}
                x={d.年月}
                stroke={chartColors.gridStroke}
                strokeDasharray="3 3"
                strokeWidth={1}
                strokeOpacity={0.2}
                style={{ pointerEvents: "none" }}
              />
            ))}
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
            cursor={{ stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 }}
            content={
              <CustomTooltip
                isMobile={isMobile}
                tooltipBg={chartColors.tooltipBg}
                tooltipText={chartColors.tooltipText}
              />
            }
          />
          {LINE_CONFIGS.map(({ key, color, displayName }) =>
            !hiddenKeys.includes(key) ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={displayName}
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ) : null,
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);
