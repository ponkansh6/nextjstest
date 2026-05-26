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

interface ChartSectionProps {
  title: string;
  data: Record<string, number | string>[];
  keys: string[];
  colors: string[];
  hiddenKeys: string[];
  chartColors: {
    gridStroke: string;
    axisText: string;
    tooltipBg: string;
    tooltipText: string;
  };
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

export const CpiAreaChart = React.memo(
  ({
    title,
    data,
    keys,
    colors,
    hiddenKeys,
    chartColors,
    isMobile,
    CustomTooltip,
  }: ChartSectionProps) => (
    <div className={styles.chartSection}>
      <h2 className={styles.chartTitle}>{title}</h2>
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
              cursor={{ stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 }}
              content={
                <CustomTooltip
                  isMobile={isMobile}
                  tooltipBg={chartColors.tooltipBg}
                  tooltipText={chartColors.tooltipText}
                />
              }
            />
            {keys.map((key, index) => (
              <Area
                key={key}
                dataKey={key}
                type="monotone"
                stroke="none"
                fill={colors[index]}
                fillOpacity={1}
                hide={hiddenKeys.includes(key)}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  ),
);
CpiAreaChart.displayName = "CpiAreaChart";
