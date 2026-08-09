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
import { ChartExportButton } from "./ChartExportButton";
import type { CpiData } from "@/types";
import type { CustomTooltipProps } from "@/types/chart";
import { YearReferenceLines } from "./charts/YearReferenceLines";
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
  isMobile: boolean;
  CustomTooltip: React.FC<CustomTooltipProps>;
  onReset: () => void;
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
  isMobile,
  CustomTooltip,
  onReset,
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
          <div className={styles.legendHeader}>
            <h3 className={styles.legendTitle}>費目</h3>
            <div className={styles.legendActions}>
              <button onClick={onReset} className={styles.actionButton}>
                全選択解除
              </button>
            </div>
          </div>
          <div className={`${styles.stackedLegendItems} ${styles.stackedLegendItemsDense}`}>
            {keys.map((key, index) => (
              <button
                key={key}
                onClick={() => onToggle(key)}
                className={`${styles.legendItem} ${styles.legendItemDense} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
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
                <Area
                  key={key}
                  dataKey={key}
                  stackId="a"
                  type="monotone"
                  stroke={chartColors.gridStroke}
                  strokeWidth={1}
                  strokeOpacity={0.4}
                  fill={colors[index]}
                  fillOpacity={0.8}
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className={styles.chartDataTable}>
        <summary>データテーブルを表示</summary>
        <div className={styles.chartDataTableActions}>
          <ChartExportButton
            title={"物価指数_費目別寄与度"}
            data={data as unknown as Record<string, unknown>[]}
            keys={keys}
            headers={keys.map(getLegendLabel)}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>年月</th>
              {keys.map((k) => (
                <th key={k}>{getLegendLabel(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(-12).map((d) => (
              <tr key={d.年月}>
                <td>{d.年月}</td>
                {keys.map((k) => (
                  <td key={k}>{typeof d[k] === "number" ? (d[k] as number).toFixed(2) : "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};
