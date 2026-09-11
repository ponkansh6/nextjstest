import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { computeXAxisTicks } from "./charts/xAxisTicks";

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
  } = props;
  const supportKey = keys.includes(SUPPORT_SERIES_KEY_REAL)
    ? SUPPORT_SERIES_KEY_REAL
    : keys.includes(SUPPORT_SERIES_KEY_NOMINAL)
      ? SUPPORT_SERIES_KEY_NOMINAL
      : undefined;
  const ctiKeys = keys.filter((key) => key !== supportKey);
  const hasLegacyGdp = data.some(
    (row) => row.年 < 2018 && supportKey && typeof row[supportKey] === "number",
  );
  const legendKeys = hasLegacyGdp ? keys : ctiKeys;
  // Plan24: GDP is a standalone bar before 2018Q1; CTI is the only stack afterwards.
  const chartData = data.map((row) => {
    const next = { ...row };
    if (row.年 < 2018) ctiKeys.forEach((key) => (next[key] = null));
    else if (supportKey) next[supportKey] = null;
    return next;
  });

  const renderLegend = () => (
    <div className={styles.legendContainer}>
      <div className={styles.legendSection} style={{ marginBottom: "1.5rem" }}>
        <h3 className={styles.legendTitle}>四半期</h3>
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
      className={styles.chartSection}
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
          <details className={styles.legendAccordion}>
            <summary className={styles.legendAccordionSummary}>
              <span className={styles.legendAccordionLabel}>凡例を表示（費目・四半期）</span>
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
      <div className={styles.chartWrapper} role="img" aria-label={`${title}の推移グラフ`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
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
                />
              )}
              dy={10}
              ticks={computeXAxisTicks(data, "label")}
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
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className={styles.chartNote}>
        <a href={`#data-table-${sectionId}`}>データテーブルを表示 ▾</a>
      </p>
    </div>
  );
};
