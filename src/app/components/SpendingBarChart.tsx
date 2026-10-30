"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CpiData } from "@/types";
import type { SeriesMetadata } from "../../lib/chartConstants";
import styles from "./CpiChart.module.css";
import {
  getLegendLabel,
  getSpendingSeriesColor,
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
} from "../../lib/chartConstants";
import {
  getSpendingPresentationLabel,
  orderSpendingPresentationKeys,
} from "../../lib/spendingSeriesPresentation";
import type {
  ChartTooltipChartMouseMoveHandler,
  ChartTooltipProps,
} from "./charts/useChartTooltipProps";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import { CHART_INFO, type ChartInfoContent } from "../../lib/chartInfoContent";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import { XAxisEdgeTick } from "./charts/XAxisEdgeTick";
import { ChartDataContract, getPublicSpendingKeys } from "./ChartDataContract";
import { computePeriodXAxisTicks } from "./charts/xAxisTicks";
import { normalizeSpendingChartData, type QuarterlyDataPoint } from "./spendingChartData";

export { normalizeSpendingChartData };

const FIXED_SPENDING_MILESTONE_YEARS = new Set([2010, 2015, 2020, 2025]);

function quarterIndex(value: string): number | null {
  const match = value.match(/^(\d{4})Q([1-4])$/);
  return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : null;
}

function computeSpendingXAxisTicks(data: QuarterlyDataPoint[]): string[] {
  return computePeriodXAxisTicks(data, "label", {
    periodIndex: quarterIndex,
    endpointGapPeriods: 12,
    includeBoundaryTicks: false,
    milestonePredicate: (row) =>
      row.quarter === 1 && FIXED_SPENDING_MILESTONE_YEARS.has(Number(row.年)),
  });
}

interface SpendingBarChartProps {
  title: string;
  sectionId?: string;
  infoKey?: keyof typeof CHART_INFO;
  chartInfoContent?: ChartInfoContent;
  data: QuarterlyDataPoint[];
  keys: string[];
  colors: string[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  tooltipProps: ChartTooltipProps;
  onClick?: () => void;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onChartMouseMove?: ChartTooltipChartMouseMoveHandler;
  onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  hiddenQuarters: number[];
  onToggleQuarter: (q: number) => void;
  onReset: () => void;
  legendMode?: "expanded" | "collapsible";
  defaultLegendOpen?: boolean;
  linkedSectionId?: string;
  testId?: string;
  isMobile?: boolean;
  descriptors?: readonly SeriesMetadata[];
}

export function computeSpendingYAxisMax(
  data: QuarterlyDataPoint[],
  keys: string[],
  hiddenKeys: string[],
): number {
  const chartData = normalizeSpendingChartData(data, keys);
  const visibleKeys = keys.filter(
    (key) => !hiddenKeys.includes(key) && key !== CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
  );
  const maxHeight = chartData.reduce((max, row) => {
    const height = visibleKeys.reduce((sum, key) => {
      const value = row[key];
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
    return Math.max(max, height);
  }, 0);
  return Math.round(maxHeight + 3);
}

export const SpendingBarChart: React.FC<SpendingBarChartProps> = (props) => {
  const {
    title,
    sectionId,
    infoKey,
    chartInfoContent,
    data,
    keys,
    colors,
    hiddenKeys,
    onToggle,
    chartColors,
    tooltipProps,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
    onPointerMove,
    onMouseMove,
    onChartMouseMove,
    onPointerLeave,
    onMouseLeave,
    hiddenQuarters,
    onToggleQuarter,
    onReset,
    legendMode = "expanded",
    defaultLegendOpen = false,
    linkedSectionId,
    testId,
    isMobile = false,
    descriptors = [],
  } = props;
  const [legendOpen, setLegendOpen] = React.useState(defaultLegendOpen);
  const supportKey = keys.includes(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)
    ? CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY
    : undefined;
  const ctiKeys = keys.filter((key) => key !== supportKey);
  const hasPreBoundarySupport = data.some(
    (row) => supportKey && typeof row[supportKey] === "number",
  );
  const orderedCtiKeys = orderSpendingPresentationKeys(ctiKeys);
  const legendKeys = orderSpendingPresentationKeys(
    (hasPreBoundarySupport ? keys : ctiKeys).filter(
      (key) => testId !== "spending-chart-real" || key !== CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
    ),
  );
  const selectedLegendCount = legendKeys.filter((key) => !hiddenKeys.includes(key)).length;
  const visibleCtiKeyCount = ctiKeys.filter((key) => !hiddenKeys.includes(key)).length;
  const hasVisibleExpenseSeries = visibleCtiKeyCount > 0;
  const hasVisibleSupportSeries =
    supportKey !== undefined && hasPreBoundarySupport && !hiddenKeys.includes(supportKey);
  const shouldShowEmptyState = !hasVisibleExpenseSeries && !hasVisibleSupportSeries;
  const selectedQuarterCount = [1, 2, 3, 4].filter((q) => !hiddenQuarters.includes(q)).length;
  const hasActiveLegendFilter = selectedLegendCount < legendKeys.length || selectedQuarterCount < 4;
  const chartData = normalizeSpendingChartData(data, keys);
  const publicKeys = getPublicSpendingKeys(keys);
  const yAxisMax = computeSpendingYAxisMax(data, keys, hiddenKeys);

  const renderLegend = () => (
    <div className={styles.legendContainer}>
      <div className={styles.legendSection} style={{ marginBottom: "1.5rem" }}>
        <div className={styles.legendItems}>
          {[1, 2, 3, 4].map((q) => (
            <button
              key={q}
              onClick={() => onToggleQuarter(q)}
              className={`${styles.legendItem} ${hiddenQuarters.includes(q) ? styles.hidden : ""}`}
              aria-pressed={!hiddenQuarters.includes(q)}
            >
              <span className={styles.legendLabel}>Q{q}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={styles.legendSection}>
        <div className={styles.stackedLegendItems}>
          <button onClick={onReset} className={styles.legendItem}>
            全選択解除
          </button>
          {legendKeys.map((key) => (
            <button
              key={key}
              data-testid={`legend-${key}`}
              onClick={() => onToggle(key)}
              className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
              aria-pressed={!hiddenKeys.includes(key)}
            >
              <span
                className={styles.legendIcon}
                style={{
                  backgroundColor:
                    key === CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY
                      ? chartColors.barFill || "#94a3b8"
                      : getSpendingSeriesColor(key, keys, colors),
                }}
              />

              <span className={styles.legendLabel}>
                {getSpendingPresentationLabel(key) ?? getLegendLabel(key)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div
      id={sectionId}
      className={`${styles.chartSection} ${styles.spendingChartSection}`}
      style={{ scrollMarginTop: "5rem" }}
      data-testid={testId}
      data-support-periods={chartData
        .filter((row) => supportKey && typeof row[supportKey] === "number")
        .map((row) => row.label)
        .join(",")}
      data-cti-periods={chartData
        .filter((row) => ctiKeys.some((key) => typeof row[key] === "number"))
        .map((row) => row.label)
        .join(",")}
    >
      <h2 className={styles.chartTitle}>
        {title}
        {infoKey && (
          <ChartInfoContentRenderer
            chartKey={infoKey}
            content={chartInfoContent}
            ariaLabel={`${title}のデータソースを表示`}
          />
        )}
      </h2>
      <ChartDataContract data={chartData} keys={publicKeys} descriptors={descriptors} />

      {legendMode === "collapsible" && (
        <>
          {linkedSectionId && (
            <p className={styles.chartNote}>
              凡例は「
              <a
                href={`#${linkedSectionId}`}
                data-chart-note-link
                style={{ color: "var(--blue-500)", textDecoration: "underline" }}
              >
                消費支出（名目）
              </a>
              」と連動しています。
            </p>
          )}
          <details
            className={styles.legendAccordion}
            open={legendOpen}
            onToggle={(event) => setLegendOpen(event.currentTarget.open)}
          >
            <summary className={styles.legendAccordionSummary}>
              <span className={styles.legendAccordionLabel}>
                <span className={styles.legendAccordionTitle}>費目・四半期を変更</span>
                <span className={styles.legendAccordionMeta}>
                  <span className={styles.legendAccordionCount}>
                    {`費目 ${selectedLegendCount}/${legendKeys.length} ・ 四半期 ${selectedQuarterCount}/4`}
                  </span>
                  <span className={styles.legendAccordionStatus}>
                    {hasActiveLegendFilter ? "絞り込み中" : "全選択"}
                  </span>
                </span>
              </span>
              <svg
                className={styles.legendAccordionChevron}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>
            {renderLegend()}
          </details>
        </>
      )}

      {legendMode === "expanded" && renderLegend()}
      <div
        className={`${styles.chartWrapper} ${styles.spendingChartWrapper}`}
        style={{ position: "relative" }}
        role="img"
        tabIndex={0}
        aria-label={`${title}の推移グラフ`}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onMouseMove={onMouseMove}
        onPointerLeave={onPointerLeave}
        onMouseLeave={onMouseLeave}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: isMobile ? 10 : 30, left: 0, bottom: 20 }}
            barCategoryGap={isMobile ? "22%" : "10%"}
            barSize={isMobile ? 11 : undefined}
            onClick={onClick}
            onMouseMove={onChartMouseMove}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
            <YearReferenceLines
              data={data as unknown as CpiData[]}
              stroke={chartColors.gridStroke}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={(props) => (
                <XAxisEdgeTick
                  {...props}
                  fill={chartColors.axisText}
                  emphasisFill={chartColors.axisTextEmphasis}
                  fontSize={isMobile ? 12 : undefined}
                  avoidEndpointOverlap={isMobile}
                />
              )}
              dy={10}
              ticks={computeSpendingXAxisTicks(data)}
              interval={0}
            />
            <YAxis
              width={isMobile ? 46 : undefined}
              domain={[0, yAxisMax]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText }}
              dx={-10}
            />
            <Tooltip {...tooltipProps} />
            {orderedCtiKeys.map((key) =>
              !hiddenKeys.includes(key) ? (
                <Bar
                  key={key}
                  dataKey={key}
                  data-key={key}
                  data-testid={`spending-series-${key}`}
                  stackId="a"
                  fill={getSpendingSeriesColor(key, keys, colors)}
                  fillOpacity={0.8}
                  isAnimationActive={false}
                  shape={(shapeProps) => {
                    if (
                      !Number.isFinite(shapeProps.width) ||
                      !Number.isFinite(shapeProps.height) ||
                      shapeProps.width <= 0 ||
                      shapeProps.height <= 0
                    ) {
                      return null;
                    }
                    return (
                      <g data-index={shapeProps.originalDataIndex}>
                        <Rectangle {...shapeProps} />
                      </g>
                    );
                  }}
                />
              ) : null,
            )}
          </BarChart>
        </ResponsiveContainer>
        {shouldShowEmptyState && (
          <div
            role="status"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              padding: "1rem",
              color: "var(--card-text)",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            表示する系列がありません。凡例から費目を1つ以上選択してください。
          </div>
        )}
      </div>
      <p className={styles.chartNote}>
        <a href={`#data-table-${sectionId}`}>データテーブルを表示 ▾</a>
      </p>
    </div>
  );
};
