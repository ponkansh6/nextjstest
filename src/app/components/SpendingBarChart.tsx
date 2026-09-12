"use client";

import React, { useEffect, useState } from "react";
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
import styles from "./CpiChart.module.css";
import {
  getLegendLabel,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../lib/chartConstants";
import type { ChartTooltipProps } from "./charts/useChartTooltipProps";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import { CHART_INFO, type ChartInfoContent } from "../../lib/chartInfoContent";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import { XAxisEdgeTick } from "./charts/XAxisEdgeTick";

function computeSpendingXAxisTicks(data: QuarterlyDataPoint[], viewportWidth: number): string[] {
  if (data.length === 0) return [];
  const first = data[0];
  const last = data[data.length - 1];
  const candidates = [first, ...data.filter((row) => row.quarter === 1), last].filter(
    (row, index, rows) => rows.findIndex((candidate) => candidate.label === row.label) === index,
  );
  const priorityTicks = candidates.filter(
    (row) => row === first || row === last || (row.年 - first.年) % 5 === 0,
  );
  // ラベル幅は12pxの「YYYY年Q1」を基準に保守的に見積もる。DOM実測は行わず、
  // 利用可能幅とデータ上の位置だけで決定する。
  const estimatedLabelWidth = 76;
  const chartWidth = Math.max(0, viewportWidth - (isMobileViewport(viewportWidth) ? 56 : 70));
  const position = (row: QuarterlyDataPoint) =>
    (data.indexOf(row) / Math.max(1, data.length - 1)) * chartWidth;
  const selected: QuarterlyDataPoint[] = [first];
  for (const candidate of priorityTicks.slice(1, -1)) {
    const previous = selected[selected.length - 1];
    // The first and last labels are centered on their tick coordinates by
    // XAxisEdgeTick, so keep extra space around both ends.
    const previousGap = previous === first ? estimatedLabelWidth * 1.5 : estimatedLabelWidth;
    const nextGap = estimatedLabelWidth * 1.5;
    if (
      position(candidate) - position(previous) >= previousGap &&
      position(last) - position(candidate) >= nextGap
    ) {
      selected.push(candidate);
    }
  }
  // 開始・終了ラベルは常に残す。通常の表示幅では上の条件により、隣接間隔も保証される。
  selected.push(last);
  return selected.map((row) => row.label);
}

function isMobileViewport(viewportWidth: number): boolean {
  return viewportWidth <= 768;
}

interface QuarterlyDataPoint {
  label: string;
  年: number;
  quarter: number;
  年月: string;
  [key: string]: string | number | null;
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
  hiddenQuarters: number[];
  onToggleQuarter: (q: number) => void;
  onReset: () => void;
  legendMode?: "expanded" | "collapsible";
  linkedSectionId?: string;
  testId?: string;
  isMobile?: boolean;
  showAdvanced?: boolean;
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
    hiddenQuarters,
    onToggleQuarter,
    onReset,
    legendMode = "expanded",
    linkedSectionId,
    testId,
    isMobile = false,
    showAdvanced = false,
  } = props;
  const [viewportWidth, setViewportWidth] = useState(1024);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  const supportKey = keys.includes(SUPPORT_SERIES_KEY_REAL)
    ? SUPPORT_SERIES_KEY_REAL
    : keys.includes(SUPPORT_SERIES_KEY_NOMINAL)
      ? SUPPORT_SERIES_KEY_NOMINAL
      : undefined;
  const ctiKeys = keys.filter((key) => key !== supportKey);
  const advancedSupportKey = supportKey ? `${supportKey}（延長）` : undefined;
  const hasLegacyGdp = data.some(
    (row) => row.年 < 2018 && supportKey && typeof row[supportKey] === "number",
  );
  const legendKeys = hasLegacyGdp ? keys : ctiKeys;
  const selectedLegendCount = legendKeys.filter((key) => !hiddenKeys.includes(key)).length;
  const visibleCtiKeyCount = ctiKeys.filter((key) => !hiddenKeys.includes(key)).length;
  const hasVisibleExpenseSeries = visibleCtiKeyCount > 0;
  const hasVisibleSupportSeries =
    supportKey !== undefined && hasLegacyGdp && !hiddenKeys.includes(supportKey);
  const shouldShowEmptyState = !hasVisibleExpenseSeries && !hasVisibleSupportSeries;
  const selectedQuarterCount = [1, 2, 3, 4].filter((q) => !hiddenQuarters.includes(q)).length;
  const hasActiveLegendFilter = selectedLegendCount < legendKeys.length || selectedQuarterCount < 4;
  // Plan24: GDP is a standalone bar before 2018Q1; CTI is the only stack afterwards.
  const chartData = data.map((row) => {
    const next = { ...row };
    if (
      showAdvanced &&
      supportKey &&
      advancedSupportKey &&
      row.年 >= 2018 &&
      typeof row[supportKey] === "number"
    ) {
      next[advancedSupportKey] = row[supportKey];
    } else if (advancedSupportKey) {
      next[advancedSupportKey] = null;
    }
    if (row.年 < 2018) ctiKeys.forEach((key) => (next[key] = null));
    else if (supportKey) next[supportKey] = null;
    return next;
  });
  const maxHeight = chartData.reduce((max, row) => {
    const visibleKeys = keys.filter((key) => !hiddenKeys.includes(key));
    const height = visibleKeys.reduce((sum, key) => {
      const value = row[key];
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
    return Math.max(max, height);
  }, 0);
  const maxLineValue =
    showAdvanced && advancedSupportKey && supportKey && !hiddenKeys.includes(supportKey)
      ? chartData.reduce((max, row) => {
          const value = row[advancedSupportKey];
          return Math.max(max, typeof value === "number" && Number.isFinite(value) ? value : 0);
        }, 0)
      : 0;
  const yAxisMax = Math.round(Math.max(maxHeight, maxLineValue) + 3);

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
              onClick={() => onToggle(key)}
              className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
              aria-pressed={!hiddenKeys.includes(key)}
            >
              <span
                className={styles.legendIcon}
                style={{
                  backgroundColor:
                    key === SUPPORT_SERIES_KEY_NOMINAL
                      ? chartColors.barFill || "#94a3b8"
                      : colors[keys.indexOf(key)],
                }}
              />

              <span className={styles.legendLabel}>{getLegendLabel(key)}</span>
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
      data-gdp-periods={chartData
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

      {legendMode === "collapsible" && (
        <>
          {linkedSectionId && (
            <p className={styles.chartNote}>
              凡例は「
              <a
                href={`#${linkedSectionId}`}
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
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: isMobile ? 10 : 30, left: 0, bottom: 20 }}
            barCategoryGap={isMobile ? (viewportWidth <= 350 ? "28%" : "22%") : "10%"}
            barSize={isMobile ? (viewportWidth <= 350 ? 9 : 11) : undefined}
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
                />
              )}
              dy={10}
              ticks={computeSpendingXAxisTicks(data, viewportWidth)}
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
            {supportKey && hasLegacyGdp && !hiddenKeys.includes(supportKey) && (
              <Bar
                dataKey={supportKey}
                data-testid={`spending-series-${supportKey}`}
                fill={chartColors.barFill || "#94a3b8"}
                fillOpacity={0.8}
                isAnimationActive={false}
              />
            )}
            {ctiKeys.map((key) =>
              !hiddenKeys.includes(key) ? (
                <Bar
                  key={key}
                  dataKey={key}
                  data-testid={`spending-series-${key}`}
                  stackId="a"
                  fill={
                    key === SUPPORT_SERIES_KEY_NOMINAL
                      ? chartColors.barFill || "#94a3b8"
                      : colors[keys.indexOf(key)]
                  }
                  fillOpacity={0.8}
                  isAnimationActive={false}
                />
              ) : null,
            )}
            {showAdvanced &&
              advancedSupportKey &&
              supportKey &&
              !hiddenKeys.includes(supportKey) &&
              chartData.some((row) => typeof row[advancedSupportKey] === "number") && (
                <Line
                  type="monotone"
                  dataKey={advancedSupportKey}
                  data-testid={`spending-series-${advancedSupportKey}`}
                  stroke={chartColors.barFill || "#94a3b8"}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
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
