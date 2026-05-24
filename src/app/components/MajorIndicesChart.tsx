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

interface MajorIndicesChartProps {
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
}

export const MajorIndicesChart: React.FC<MajorIndicesChartProps> = ({
  data,
  keys,
  colors,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  CustomTooltip,
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
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
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
          {keys.map((key, index) =>
            !hiddenKeys.includes(key) ? (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index]}
                fill={colors[index]}
                fillOpacity={0.2}
                isAnimationActive={false}
              />
            ) : null,
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </>
);
