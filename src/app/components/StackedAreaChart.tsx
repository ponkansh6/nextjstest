import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./CpiChart.module.css";

interface StackedAreaChartProps {
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
  onReset: () => void;
}

export const StackedAreaChart: React.FC<StackedAreaChartProps> = ({
  title,
  data,
  keys,
  colors,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  CustomTooltip,
  onReset,
}) => (
  <div className={styles.chartSection}>
    <h2 className={styles.chartTitle}>{title}</h2>
    <div className={styles.legendContainer}>
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
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
          {data
            .filter(
              (d: any) =>
                d.年月.endsWith("1月") &&
                [2010, 2015, 2020, 2025].includes(parseInt(d.年月.split("年")[0])),
            )
            .map((d: any) => (
              <ReferenceLine
                key={d.年月}
                x={d.年月}
                stroke={chartColors.gridStroke}
                strokeDasharray="3 3"
              />
            ))}
          <XAxis
            dataKey="年月"
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartColors.axisText, fontSize: 12 }}
            dy={10}
            ticks={data
              .filter(
                (d: any) =>
                  d.年月.endsWith("1月") &&
                  [2010, 2015, 2020, 2025].includes(parseInt(d.年月.split("年")[0])),
              )
              .map((d: any) => d.年月)}
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
          {keys.map((key, index) =>
            !hiddenKeys.includes(key) ? (
              <Area
                key={key}
                dataKey={key}
                stackId="a"
                type="monotone"
                stroke="#ffffff"
                strokeWidth={0.5}
                strokeOpacity={0.2}
                fill={colors[index]}
                fillOpacity={0.5}
                isAnimationActive={false}
              />
            ) : null,
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);
