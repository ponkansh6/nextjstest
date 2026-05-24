import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./CpiChart.module.css";

interface BarChartSectionProps {
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
  stackId: string;
}

export const CpiBarChart = React.memo(
  ({
    title,
    data,
    keys,
    colors,
    hiddenKeys,
    chartColors,
    isMobile,
    CustomTooltip,
    stackId,
  }: BarChartSectionProps) => (
    <div className={styles.chartSection}>
      <h2 className={styles.chartTitle}>{title}</h2>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
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
                  stackId={stackId}
                  fill={colors[index]}
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  ),
);
CpiBarChart.displayName = "CpiBarChart";
