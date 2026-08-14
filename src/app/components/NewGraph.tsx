import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { LINE_CONFIGS } from "../../lib/chartConstants";

interface NewGraphProps {
  sectionId?: string;
  data: CpiData[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  isMobile: boolean;
  chartKey?: string;
  tooltipProps: ChartTooltipProps;
  onClick?: () => void;
  activeDot?: boolean;
  showAdvanced?: boolean;
  advancedToggle?: React.ReactNode;
}

export const NewGraph: React.FC<NewGraphProps> = ({
  sectionId,
  data,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  chartKey,
  tooltipProps,
  onClick,
  activeDot,
  showAdvanced,
  advancedToggle,
}) => {
  const isAdvanced = showAdvanced ?? false;

  return (
    <div id={sectionId} className={styles.chartSection} style={{ scrollMarginTop: "5rem" }}>
      <div className={styles.chartTitleRow}>
        <h2 className={styles.chartTitle}>給与・消費・物価の推移比較(12MA)</h2>
        {chartKey && (
          <ChartInfoContentRenderer
            chartKey={chartKey as never}
            ariaLabel="給与・消費・物価の推移比較のデータソースを表示"
            footer={advancedToggle}
          />
        )}
      </div>
      <div className={styles.legendContainer}>
        <div className={styles.legendSection}>
          <div className={styles.legendItems}>
            {LINE_CONFIGS.filter((c) => !c.advanced || isAdvanced).map(
              ({ key, color, displayName }) => (
                <button
                  key={key}
                  onClick={() => onToggle(key)}
                  className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
                  aria-pressed={!hiddenKeys.includes(key)}
                >
                  <span className={styles.legendIcon} style={{ backgroundColor: color }} />
                  <span className={styles.legendLabel}>{displayName}</span>
                </button>
              ),
            )}
          </div>
        </div>
      </div>
      <div
        className={styles.chartWrapper}
        role="img"
        aria-label="給与・消費・物価の推移比較（12MA）グラフ"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
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
            {LINE_CONFIGS.filter((c) => !c.advanced || isAdvanced).map(
              ({ key, color, strokeDasharray }) =>
                !hiddenKeys.includes(key) ? (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={isMobile ? 2 : 3}
                    dot={false}
                    isAnimationActive={false}
                    activeDot={activeDot}
                    strokeDasharray={strokeDasharray}
                  />
                ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className={styles.chartNote}>
        <a href={`#data-table-${sectionId}`}>データテーブルを表示 ▾</a>
      </p>
    </div>
  );
};
