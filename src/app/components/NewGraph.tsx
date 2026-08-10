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
import { ChartExportButton } from "./ChartExportButton";
import type { CpiData } from "@/types";
import type { CustomTooltipProps } from "@/types/chart";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";

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

interface LineConfig {
  key: string;
  color: string;
  displayName: string;
}

const LINE_CONFIGS: LineConfig[] = [
  { key: "総合(12MA)", color: "#e11d48", displayName: "給与(総合)" },
  { key: "消費支出（参考）", color: "#0891b2", displayName: "消費支出(総合)" },
  { key: "CPI総合(12MA)", color: "#65a30d", displayName: "物価指数(総合)" },
];

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
    <details className={styles.chartDataTable}>
      <summary>データテーブルを表示</summary>
      <div className={styles.chartDataTableActions}>
        <ChartExportButton
          title={"移動平均比較"}
          data={data as unknown as Record<string, unknown>[]}
          keys={LINE_CONFIGS.map((c) => c.key)}
          headers={LINE_CONFIGS.map((c) => c.displayName)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>年月</th>
            {LINE_CONFIGS.map((c) => (
              <th key={c.key}>{c.displayName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(-12).map((d) => (
            <tr key={d.年月}>
              <td>{d.年月}</td>
              {LINE_CONFIGS.map((c) => (
                <td key={c.key}>
                  {typeof d[c.key] === "number" ? (d[c.key] as number).toFixed(2) : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  </div>
);
