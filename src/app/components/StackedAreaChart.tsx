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
import { getLegendLabel } from "../../lib/chartConstants";
import styles from "./CpiChart.module.css";
import type { CpiData } from "@/types";
import type { ChartTooltipProps } from "./charts/useChartTooltipProps";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import { XAxisEdgeTick } from "./charts/XAxisEdgeTick";
import { computeXAxisTicks } from "./charts/xAxisTicks";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";

interface StackedAreaChartProps {
  title: string;
  sectionId?: string;
  data: CpiData[];
  keys: string[];
  colors: string[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  tooltipProps: ChartTooltipProps;
  onClick?: () => void;
  onReset: () => void;
  activeDot?: boolean;
  belowChartSlot?: React.ReactNode;
}

export const StackedAreaChart: React.FC<StackedAreaChartProps> = ({
  title,
  sectionId,
  data,
  keys,
  colors,
  hiddenKeys,
  onToggle,
  chartColors,
  tooltipProps,
  onClick,
  onReset,
  activeDot,
  belowChartSlot,
}) => {
  return (
    <div id={sectionId} className={styles.chartSection} style={{ scrollMarginTop: "5rem" }}>
      <h2 className={styles.chartTitle}>
        {title}
        <ChartInfoContentRenderer
          chartKey="stacked-area"
          ariaLabel="費目別寄与度のデータソースを表示"
        />
      </h2>
      <div className={styles.legendContainer}>
        <div className={styles.legendSection}>
          <div className={styles.stackedLegendItems}>
            <button onClick={onReset} className={styles.legendItem}>
              全選択解除
            </button>
            {keys.map((key, index) => (
              <button
                key={key}
                onClick={() => onToggle(key)}
                className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
                aria-pressed={!hiddenKeys.includes(key)}
              >
                <span className={styles.legendIcon} style={{ backgroundColor: colors[index] }} />
                <span className={styles.legendLabel}>{getLegendLabel(key)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className={styles.chartWrapper}
        role="img"
        aria-label="物価指数 費目別寄与度の積み上げグラフ"
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
                  dataKey={key}
                  stackId="a"
                  type="monotone"
                  stroke="var(--card-bg)"
                  strokeWidth={2}
                  strokeOpacity={1}
                  fill={colors[index]}
                  fillOpacity={1.0}
                  isAnimationActive={false}
                  activeDot={activeDot}
                />
              ) : null,
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {belowChartSlot}
      <p className={styles.chartNote}>
        <a href={`#data-table-${sectionId}`}>データテーブルを表示 ▾</a>
      </p>
    </div>
  );
};
