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
import type { CustomTooltipProps } from "@/types/chart";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";

interface ResidualAreaChartProps {
  sectionId?: string;
  data: CpiData[];
  chartColors: Record<string, string>;
  isMobile: boolean;
  CustomTooltip: React.FC<CustomTooltipProps>;
}

export const ResidualAreaChart: React.FC<ResidualAreaChartProps> = ({
  sectionId,
  data,
  chartColors,
  isMobile,
  CustomTooltip,
}) => (
  <div id={sectionId} className={styles.chartSection} style={{ scrollMarginTop: "5rem" }}>
    <h2 className={styles.chartTitle}>
      給与と物価の差(実質賃金相当)
      <ChartInfoContentRenderer
        chartKey="residual"
        ariaLabel="給与と物価の差のデータソースを表示"
      />
    </h2>
    <div
      className={styles.chartWrapper}
      role="img"
      aria-label="給与と物価の差（実質賃金相当）の推移グラフ"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
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
            domain={["auto", "auto"]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartColors.axisText }}
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
          <Area
            type="monotone"
            dataKey="残差"
            stroke={chartColors.barFill || "#94a3b8"}
            fill={chartColors.barFill || "#94a3b8"}
            fillOpacity={0.8}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <p className={styles.chartNote}>
      <a href={`#data-table-${sectionId}`}>データテーブルを表示 ▾</a>
    </p>
  </div>
);
