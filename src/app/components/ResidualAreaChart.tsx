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
import { XAxisEdgeTick } from "./charts/XAxisEdgeTick";
import { computeXAxisTicks } from "./charts/xAxisTicks";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";

interface ResidualAreaChartProps {
  sectionId?: string;
  data: CpiData[];
  chartColors: Record<string, string>;
  tooltipProps: ChartTooltipProps;
  onClick?: () => void;
}

export const ResidualAreaChart: React.FC<ResidualAreaChartProps> = ({
  sectionId,
  data,
  chartColors,
  tooltipProps,
  onClick,
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
            tick={(props) => (
              <XAxisEdgeTick
                {...props}
                fill={chartColors.axisText}
                emphasisFill={chartColors.axisTextEmphasis}
              />
            )}
            dy={10}
            ticks={computeXAxisTicks(data)}
            interval={0}
          />
          <YAxis
            domain={["auto", "auto"]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartColors.axisText }}
            dx={-10}
          />
          <Tooltip {...tooltipProps} />
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
