import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CpiData } from "@/types";
import styles from "./CpiChart.module.css";
import { ChartExportButton } from "./ChartExportButton";
import { getLegendLabel, SUPPORT_SERIES_KEY_NOMINAL } from "../../lib/chartConstants";
import type { CustomTooltipProps } from "@/types/chart";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import { CHART_INFO } from "../../lib/chartInfoContent";
import { YearReferenceLines } from "./charts/YearReferenceLines";

interface QuarterlyDataPoint {
  label: string;
  年: number;
  quarter: number;
  年月: string;
  [key: string]: string | number;
}

interface SpendingBarChartProps {
  title: string;
  sectionId?: string;
  infoKey?: keyof typeof CHART_INFO;
  data: QuarterlyDataPoint[];
  keys: string[];
  colors: string[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  isMobile: boolean;
  CustomTooltip: React.FC<CustomTooltipProps>;
  hiddenQuarters: number[];
  onToggleQuarter: (q: number) => void;
  onReset: () => void;
  hideLegend?: boolean;
  testId?: string;
}

export const SpendingBarChart: React.FC<SpendingBarChartProps> = (props) => {
  const {
    title,
    sectionId,
    infoKey,
    data,
    keys,
    colors,
    hiddenKeys,
    onToggle,
    chartColors,
    isMobile,
    CustomTooltip,
    hiddenQuarters,
    onToggleQuarter,
    onReset,
    hideLegend = false,
    testId,
  } = props;

  return (
    <div
      id={sectionId}
      className={styles.chartSection}
      style={{ scrollMarginTop: "5rem" }}
      data-testid={testId}
    >
      <h2 className={styles.chartTitle}>
        {title}
        {infoKey && (
          <ChartInfoContentRenderer chartKey={infoKey} ariaLabel={`${title}のデータソースを表示`} />
        )}
      </h2>

      {hideLegend && (
        <div className={styles.legendContainer}>
          <div className={styles.legendSection}>
            <div className={styles.legendHeader}>
              <h3 className={styles.legendTitle}>費目（読み取り専用凡例）</h3>
            </div>
            <div className={styles.stackedLegendItems}>
              {keys.map((key, index) => (
                <div
                  key={key}
                  className={`${styles.legendItemReadonly} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
                  aria-hidden="true"
                >
                  <span
                    className={styles.legendIcon}
                    style={{
                      backgroundColor: colors[index],
                    }}
                  />
                  <span className={styles.legendLabel}>{getLegendLabel(key)}</span>
                </div>
              ))}
            </div>
            <p className={styles.chartNote} style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              凡例は「<a href="#spending-chart-nominal" style={{ color: "var(--blue-500)", textDecoration: "underline" }}>消費支出（名目）</a>」と連動しています。
            </p>
          </div>
        </div>
      )}

      {!hideLegend && (
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
            <div className={styles.legendHeader}>
              <h3 className={styles.legendTitle}>費目</h3>
              <div className={styles.legendActions}>
                <button onClick={onReset} className={styles.actionButton}>
                  全選択解除
                </button>
              </div>
            </div>
            <div className={styles.stackedLegendItems}>
              {keys.map((key, index) => (
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
                          : colors[index],
                    }}
                  />

                  <span className={styles.legendLabel}>{getLegendLabel(key)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className={styles.chartWrapper} role="img" aria-label={`${title}の推移グラフ`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
            <YearReferenceLines
              data={data as unknown as CpiData[]}
              stroke={chartColors.gridStroke}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText }}
              dy={10}
            />
            <YAxis
              domain={[0, "auto"]}
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
            {keys.map((key, index) =>
              !hiddenKeys.includes(key) ? (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={
                    key === SUPPORT_SERIES_KEY_NOMINAL
                      ? chartColors.barFill || "#94a3b8"
                      : colors[index]
                  }
                  fillOpacity={0.8}
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className={styles.chartDataTable}>
        <summary>データテーブルを表示</summary>
        <div className={styles.chartDataTableActions}>
          <ChartExportButton
            title={title}
            data={data as unknown as Record<string, unknown>[]}
            keys={keys}
            headers={keys.map(getLegendLabel)}
          />
        </div>
        <table>
          <thead><tr><th>年月</th>{keys.map((k) => <th key={k}>{getLegendLabel(k)}</th>)}</tr></thead>
          <tbody>
            {data.slice(-12).map((d) => (
              <tr key={d.年月 || d.label}>
                <td>{d.年月 || d.label}</td>
                {keys.map((k) => <td key={k}>{typeof d[k] === "number" ? (d[k] as number).toFixed(2) : "-"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};
