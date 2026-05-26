import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./CpiChart.module.css";

interface SpendingBarChartProps {
  title: string;
  data: Record<string, unknown>[];
  keys: string[];
  colors: string[];
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
  hiddenQuarters: number[];
  onToggleQuarter: (q: number) => void;
  onReset: () => void;
}

export const SpendingBarChart: React.FC<SpendingBarChartProps> = ({
  title,
  data,
  keys,
  colors,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  CustomTooltip,
  hiddenQuarters,
  onToggleQuarter,
  onReset,
}) => (
  <div className={styles.chartSection}>
    <h2 className={styles.chartTitle}>{title}</h2>
    <div className={styles.legendContainer}>
      <div className={styles.legendSection} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.legendTitle}>四半期</h3>
        <div className={styles.legendItems}>
          {[1, 2, 3, 4].map((q) => (
            <button
              key={q}
              onClick={() => onToggleQuarter(q)}
              className={`${styles.legendItem} ${hiddenQuarters.includes(q) ? styles.hidden : ""}`}
              aria-pressed={!hiddenQuarters.includes(q)}
            >
              <span className={styles.legendLabel}>Q{q}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={styles.legendSection}>
        <div className={styles.legendHeader}>
          <h3 className={styles.legendTitle}>費目</h3>
          <div className={styles.legendActions}>
            <button onClick={onReset} className={styles.actionButton}>
              全選択解除
            </button>
          </div>
        </div>
        <div className={styles.stackedLegendItems}>
          {keys.map((key, index) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
              aria-pressed={!hiddenKeys.includes(key)}
            >
              <span className={styles.legendIcon} style={{ backgroundColor: colors[index] }} />
              <span className={styles.legendLabel}>{key}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
          {data
            .filter(
              (d: any) =>
                d.label.endsWith("Q1") &&
                [2010, 2015, 2020, 2025].includes(parseInt(d.label.split("年")[0])),
            )
            .map((d: any) => (
              <ReferenceLine
                key={d.label}
                x={d.label}
                stroke={chartColors.gridStroke}
                strokeDasharray="3 3"
                strokeWidth={1}
                strokeOpacity={0.3}
                style={{ pointerEvents: "none" }}
              />
            ))}
          <XAxis
            dataKey="label"
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
          {keys.map((key, index) =>
            !hiddenKeys.includes(key) ? (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={colors[index]}
                fillOpacity={0.5}
                isAnimationActive={false}
              />
            ) : null,
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);
