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
import type { CustomTooltipProps } from "@/types/chart";
import { YearReferenceLines } from "./charts/YearReferenceLines";
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
  CustomTooltip: React.FC<CustomTooltipProps>;
}

export const NewGraph: React.FC<NewGraphProps> = ({
  sectionId,
  data,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  chartKey,
  CustomTooltip,
}) => (
  <div id={sectionId} className={styles.chartSection} style={{ scrollMarginTop: "5rem" }}>
    <div className={styles.chartTitleRow}>
      <h2 className={styles.chartTitle}>給与・消費・物価の推移比較(12MA)</h2>
      {chartKey && (
        <ChartInfoContentRenderer
          chartKey={chartKey as never}
          ariaLabel="給与・消費・物価の推移比較のデータソースを表示"
        />
      )}
    </div>
    <div className={styles.legendContainer}>
      <div className={styles.legendSection}>
        <div className={styles.legendItems}>
          {LINE_CONFIGS.map(({ key, color, displayName }) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
              aria-pressed={!hiddenKeys.includes(key)}
            >
              <span className={styles.legendIcon} style={{ backgroundColor: color }} />
              <span className={styles.legendLabel}>{displayName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
    <div
      className={styles.chartWrapper}
      role="img"
      aria-label="給与・消費・物価の推移比較（12MA）グラフ"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
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
            domain={["auto", "auto"]}
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
          {LINE_CONFIGS.map(({ key, color }) =>
            !hiddenKeys.includes(key) ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={isMobile ? 2 : 3}
                dot={false}
                isAnimationActive={false}
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
