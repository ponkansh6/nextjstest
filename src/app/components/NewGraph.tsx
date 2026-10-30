import React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import styles from "./CpiChart.module.css";
import type { CpiData } from "@/types";
import type {
  ChartTooltipChartMouseMoveHandler,
  ChartTooltipProps,
} from "./charts/useChartTooltipProps";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import { TimeSeriesXAxis } from "./charts/TimeSeriesXAxis";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import { createComparisonSeriesRegistry, type SeriesMetadata } from "../../lib/chartConstants";
import type { ChartInfoContent } from "@/lib/chartInfoContent";
import { ChartDataContract } from "./ChartDataContract";

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
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onChartMouseMove?: ChartTooltipChartMouseMoveHandler;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  activeDot?: boolean;
  chartInfoContent?: ChartInfoContent;
  comparisonSeriesRegistry?: readonly SeriesMetadata[];
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
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
  onPointerMove,
  onPointerLeave,
  onMouseMove,
  onChartMouseMove,
  onMouseLeave,
  activeDot,
  chartInfoContent,
  comparisonSeriesRegistry = createComparisonSeriesRegistry(),
}) => {
  const visibleLineConfigs = comparisonSeriesRegistry;
  // Keep the established legend and line contracts even when a series is
  // entirely null. Recharts simply has no path to paint for that series.
  const renderedLineConfigs = visibleLineConfigs;
  return (
    <div
      id={sectionId}
      className={`${styles.chartSection} ${sectionId === "section-new-graph" ? styles.lastSectionScrollRunway : ""}`}
      style={{ scrollMarginTop: "5rem" }}
    >
      <div>
        <h2 className={styles.chartTitle}>給与・消費・物価の推移比較(12MA)</h2>
        {chartKey && (
          <ChartInfoContentRenderer
            chartKey={chartKey as never}
            content={chartInfoContent}
            ariaLabel="給与・消費・物価の推移比較のデータソースを表示"
          />
        )}
      </div>
      <ChartDataContract
        data={data}
        keys={visibleLineConfigs.map(({ key }) => key)}
        descriptors={visibleLineConfigs}
      />
      <div className={styles.legendContainer}>
        <div className={styles.legendSection}>
          <div className={styles.legendItems}>
            {visibleLineConfigs.map(({ key, color, displayName, legendLabel }) => (
              <button
                key={key}
                data-testid={`new-graph-legend-${key}`}
                data-key={key}
                onClick={() => onToggle(key)}
                className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
                aria-pressed={!hiddenKeys.includes(key)}
              >
                <span className={styles.legendIcon} style={{ backgroundColor: color }} />
                <span className={styles.legendLabel}>{legendLabel ?? displayName}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className={styles.chartWrapper}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ touchAction: "pan-y" }}
        role="img"
        tabIndex={0}
        aria-label="給与・消費・物価の推移比較（12MA）グラフ"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
            onClick={onClick}
            onMouseMove={onChartMouseMove}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
            <YearReferenceLines data={data} stroke={chartColors.gridStroke} />
            <TimeSeriesXAxis data={data} chartColors={chartColors} />
            <YAxis
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText }}
              dx={-10}
            />
            <Tooltip {...tooltipProps} />
            {renderedLineConfigs.map(({ key, color, strokeDasharray }) =>
              !hiddenKeys.includes(key) ? (
                <Line
                  key={key}
                  data-testid={`new-graph-line-${key}`}
                  data-key={key}
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
