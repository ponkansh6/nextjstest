import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./CpiChart.module.css";
import type { CpiData } from "@/types";
import type { ChartTooltipProps } from "./charts/useChartTooltipProps";
import { YearReferenceLines } from "./charts/YearReferenceLines";

interface MajorIndicesChartProps {
  data: CpiData[];
  keys: string[];
  colors: string[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  tooltipProps: ChartTooltipProps;
  onClick?: () => void;
}

export const MajorIndicesChart: React.FC<MajorIndicesChartProps> = ({
  data,
  keys,
  colors,
  hiddenKeys,
  onToggle,
  chartColors,
  tooltipProps,
  onClick,
}) => (
  <>
    <div className={styles.legendContainer}>
      <div className={styles.legendSection}>
        <div className={styles.legendItems}>
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
    <div
      className={styles.chartWrapper}
      role="img"
      aria-label="消費者物価指数 主要指数の推移グラフ"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
          onClick={onClick}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
          <YearReferenceLines data={data} stroke={chartColors.gridStroke} />
          <XAxis
            dataKey="年月"
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartColors.axisText }}
            dy={10}
          />
          <YAxis
            domain={[0, "auto"]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartColors.axisText }}
            dx={-10}
          />
          <Tooltip {...tooltipProps} />
          {keys.map((key, index) =>
            !hiddenKeys.includes(key) ? (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index]}
                fill={colors[index]}
                fillOpacity={0.8}
                isAnimationActive={false}
              />
            ) : null,
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </>
);
