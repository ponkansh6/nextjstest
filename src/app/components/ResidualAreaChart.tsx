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

interface ResidualAreaChartProps {
  data: Record<string, unknown>[];
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

export const ResidualAreaChart: React.FC<ResidualAreaChartProps> = ({
  data,
  chartColors,
  isMobile,
  CustomTooltip,
}) => (
  <div className={styles.chartSection}>
    <h2 className={styles.chartTitle}>残差（現金給与総額 - CPI総合）</h2>
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
            domain={["auto", "auto"]}
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
          <Area
            type="monotone"
            dataKey="残差"
            stroke={chartColors.barFill || "#94a3b8"}
            fill={chartColors.barFill || "#94a3b8"}
            fillOpacity={0.4}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);
