"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CpiData } from "@/types";
import type { SeriesMeasurement } from "@/types/chart";
import type { SeriesMetadata } from "../../lib/chartConstants";
import styles from "./CpiChart.module.css";
import {
  getLegendLabel,
  getSpendingSeriesColor,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
} from "../../lib/chartConstants";
import {
  getSpendingPresentationLabel,
  orderSpendingPresentationKeys,
} from "../../lib/spendingSeriesPresentation";
import type { ChartTooltipProps } from "./charts/useChartTooltipProps";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import { CHART_INFO, type ChartInfoContent } from "../../lib/chartInfoContent";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import { XAxisEdgeTick } from "./charts/XAxisEdgeTick";
import { ChartDataContract, getPublicSpendingKeys } from "./ChartDataContract";
import { computePeriodXAxisTicks } from "./charts/xAxisTicks";

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

interface QuarterlyDataPoint {
  label: string;
  年: number;
  quarter: number;
  年月: string;
  measurements?: Record<string, SeriesMeasurement>;
  [key: string]: string | number | null | Record<string, SeriesMeasurement> | undefined;
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
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  hiddenQuarters: number[];
  onToggleQuarter: (q: number) => void;
  onReset: () => void;
  legendMode?: "expanded" | "collapsible";
  linkedSectionId?: string;
  testId?: string;
  isMobile?: boolean;
  descriptors?: readonly SeriesMetadata[];
}

export function normalizeSpendingChartData(
  data: QuarterlyDataPoint[],
  keys: string[],
): QuarterlyDataPoint[] {
  const supportKey = keys.includes(SUPPORT_SERIES_KEY_REAL)
    ? SUPPORT_SERIES_KEY_REAL
    : keys.includes(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)
      ? CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY
      : keys.includes(SUPPORT_SERIES_KEY_NOMINAL)
        ? SUPPORT_SERIES_KEY_NOMINAL
        : undefined;
  const ctiKeys = keys.filter((key) => key !== supportKey);
  return data.map((row) => {
    const next = { ...row };
    const hasPlan39Expense = ctiKeys.some(
      (key) =>
        typeof row[key] === "number" &&
        Number.isFinite(row[key]) &&
        row.measurements?.[key] !== undefined,
    );
    if (row.年 < 2018) {
      // Plan39-v2 supplies the pre-2018 expense stack. Keep the legacy support
      // bar unless both expense values and their measurement metadata are present.
      if (hasPlan39Expense && supportKey && supportKey !== CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)
        next[supportKey] = null;
      else if (!hasPlan39Expense) ctiKeys.forEach((key) => (next[key] = null));
    } else if (supportKey && supportKey !== CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)
      next[supportKey] = null;
    return next;
  });
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
    onPointerMove,
    onMouseMove,
    onPointerLeave,
    onMouseLeave,
    hiddenQuarters,
    onToggleQuarter,
    onReset,
    legendMode = "expanded",
    linkedSectionId,
    testId,
    isMobile = false,
    descriptors = [],
  } = props;
  const supportKey = keys.includes(SUPPORT_SERIES_KEY_REAL)
    ? SUPPORT_SERIES_KEY_REAL
    : keys.includes(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY)
      ? CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY
      : keys.includes(SUPPORT_SERIES_KEY_NOMINAL)
        ? SUPPORT_SERIES_KEY_NOMINAL
        : undefined;
  const ctiKeys = keys.filter((key) => key !== supportKey);
  const hasPreBoundarySupport = data.some(
    (row) =>
      supportKey &&
      (supportKey === CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY || row.年 < 2018) &&
      typeof row[supportKey] === "number",
  );
  const hasIndependentRealTotal =
    supportKey === CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY &&
    data.some((row) => {
      const value = row[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY];
      return typeof value === "number" && Number.isFinite(value);
    });
  const hasPlan39Measurements = data.some(
    (row) => row.年 < 2018 && ctiKeys.some((key) => row.measurements?.[key] !== undefined),
  );
  const officialQuarterlyUnavailable = data.some((row) =>
    Object.values(row.measurements ?? {}).some(
      (measurement) =>
        measurement?.reason === "official_quarterly_source_unavailable_latest_period_unknown",
    ),
  );
  const orderedCtiKeys = orderSpendingPresentationKeys(ctiKeys);
  const legendKeys = orderSpendingPresentationKeys(hasPreBoundarySupport ? keys : ctiKeys);
  const selectedLegendCount = legendKeys.filter((key) => !hiddenKeys.includes(key)).length;
  const visibleCtiKeyCount = ctiKeys.filter((key) => !hiddenKeys.includes(key)).length;
  const hasVisibleExpenseSeries = visibleCtiKeyCount > 0;
  const hasVisibleSupportSeries =
    supportKey !== undefined && hasPreBoundarySupport && !hiddenKeys.includes(supportKey);
  const shouldShowEmptyState = !hasVisibleExpenseSeries && !hasVisibleSupportSeries;
  const selectedQuarterCount = [1, 2, 3, 4].filter((q) => !hiddenQuarters.includes(q)).length;
  const hasActiveLegendFilter = selectedLegendCount < legendKeys.length || selectedQuarterCount < 4;
  const supportReason = supportKey
    ? data.find((row) => row.measurements?.[supportKey]?.status === "invalid")?.measurements?.[
        supportKey
      ]?.reason
    : undefined;
  // Nominal support remains a bar; the independently deflated real total is a separate marker.
  const chartData = normalizeSpendingChartData(data, keys);
  const publicKeys = getPublicSpendingKeys(keys);
  const maxHeight = chartData.reduce((max, row) => {
    const visibleKeys = keys.filter(
      (key) => !hiddenKeys.includes(key) && key !== CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
    );
    const expenseHeight = visibleKeys.reduce((sum, key) => {
      const value = row[key];
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
    const independentTotal = row[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY];
    const height =
      supportKey === CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY &&
      typeof independentTotal === "number" &&
      Number.isFinite(independentTotal)
        ? Math.max(expenseHeight, independentTotal)
        : expenseHeight;
    return Math.max(max, height);
  }, 0);
  const yAxisMax = Math.round(maxHeight + 3);

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
                    key === SUPPORT_SERIES_KEY_NOMINAL || key === CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY
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
      {supportKey === SUPPORT_SERIES_KEY_NOMINAL &&
        !hasPreBoundarySupport &&
        !hasPlan39Measurements && (
          <p role="status" className={styles.chartNote}>
            CTIミクロ名目四半期系列は利用できません（{supportReason ?? "unavailable"}）。
          </p>
        )}
      {supportKey === SUPPORT_SERIES_KEY_NOMINAL && (
        <p
          className={styles.chartNote}
          data-testid="spending-series-switch-note"
          data-series-switch="plan39-v2-bottom-up-to-official-adjusted-quarters"
        >
          2005Q1〜2016Q4：名目接続推計を月次パターンで四半期化。2017Q1以降：総世帯・調整系列の公式名目四半期値（最新公表期まで）。
        </p>
      )}
      {supportKey === SUPPORT_SERIES_KEY_NOMINAL && officialQuarterlyUnavailable && (
        <p role="status" className={styles.chartNote}>
          2005Q1〜2016Q4の名目接続推計は表示しています。2017Q1以降の公式調整済み名目四半期データを検証できず、公式期間と最新対象期は不明です。
        </p>
      )}
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
          <details className={styles.legendAccordion}>
            <summary className={styles.legendAccordionSummary}>
              <span className={styles.legendAccordionLabel}>
                <span>費目・四半期を変更</span>
                <span>
                  （費目 {selectedLegendCount}/{legendKeys.length}・四半期 {selectedQuarterCount}
                  /4）
                </span>
                <span>・{hasActiveLegendFilter ? "絞り込み中" : "全選択"}</span>
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
        aria-label={`${title}の推移グラフ`}
        onClick={onClick}
        onPointerDown={onPointerDown}
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
            {supportKey &&
              supportKey !== CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY &&
              hasPreBoundarySupport &&
              !hiddenKeys.includes(supportKey) && (
                <Bar
                  dataKey={supportKey}
                  data-key={supportKey}
                  data-testid={`spending-series-${supportKey}`}
                  fill={chartColors.barFill || "#94a3b8"}
                  fillOpacity={0.8}
                  isAnimationActive={false}
                />
              )}
            {orderedCtiKeys.map((key) =>
              !hiddenKeys.includes(key) ? (
                <Bar
                  key={key}
                  dataKey={key}
                  data-key={key}
                  data-testid={`spending-series-${key}`}
                  stackId="a"
                  fill={
                    key === SUPPORT_SERIES_KEY_NOMINAL
                      ? chartColors.barFill || "#94a3b8"
                      : getSpendingSeriesColor(key, keys, colors)
                  }
                  fillOpacity={0.8}
                  isAnimationActive={false}
                />
              ) : null,
            )}
            {supportKey === CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY &&
              hasIndependentRealTotal &&
              !hiddenKeys.includes(supportKey) && (
                <Line
                  dataKey={supportKey}
                  data-key={supportKey}
                  data-testid={`spending-series-${supportKey}`}
                  stroke="none"
                  strokeWidth={0}
                  connectNulls={false}
                  dot={(dot) => {
                    const value = dot.payload?.[supportKey];
                    if (
                      typeof value !== "number" ||
                      !Number.isFinite(value) ||
                      dot.cx == null ||
                      dot.cy == null
                    )
                      return null;
                    return (
                      <circle
                        cx={dot.cx}
                        cy={dot.cy}
                        r={4}
                        fill={chartColors.barFill || "#94a3b8"}
                        stroke={chartColors.gridStroke}
                        strokeWidth={1.5}
                        pointerEvents="none"
                        data-key={supportKey}
                        data-testid={`spending-series-marker-${supportKey}`}
                      />
                    );
                  }}
                  activeDot={false}
                  isAnimationActive={false}
                />
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
