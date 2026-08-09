import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import styles from "./CpiChart.module.css";
import { ChartExportButton } from "./ChartExportButton";
import type { CpiData } from "@/types";
import type { CustomTooltipProps } from "@/types/chart";
import { YearReferenceLines } from "./charts/YearReferenceLines";

interface EarningsBreakdownChartProps {
  sectionId?: string;
  data: CpiData[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  isMobile: boolean;
  CustomTooltip: React.FC<CustomTooltipProps>;
}

export const EarningsBreakdownChart: React.FC<EarningsBreakdownChartProps> = ({
  sectionId,
  data,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  CustomTooltip,
}) => {
  const configs: {
    key: string;
    color: string;
    type: "area" | "line";
    displayName?: string;
  }[] = [
    { color: "#1e40af", key: "所定内給与", type: "area" },
    { color: "#3b82f6", key: "所定外給与", type: "area" },
    { color: "#60a5fa", key: "特別給与", type: "area" },
    { color: "#16a34a", key: "時間当たり給与", type: "line" },
    {
      color: "#a3e635",
      key: "15歳以上国民当たり給与",
      type: "line",
    },
    {
      color: "#eab308",
      displayName: "物価指数総合(参考)",
      key: "CPI総合(参考)",
      type: "line",
    },
  ];

  const yAxisMax = React.useMemo(() => {
    const keys = [
      "所定内給与",
      "所定外給与",
      "特別給与",
      "時間当たり給与",
      "15歳以上国民当たり給与",
      "総合",
      "CPI総合(参考)",
    ];
    let maxVal = 0;
    data.forEach((d) => {
      keys.forEach((k) => {
        const val = d[k] as number;
        if (typeof val === "number" && val > maxVal) {
          maxVal = val;
        }
      });
    });
    return Math.ceil(maxVal + 5);
  }, [data]);

  return (
    <div
      id={sectionId}
      className={styles.chartSection}
      style={{ scrollMarginTop: "5rem" }}
    >
      <h2 className={styles.chartTitle}>
        給与指標と関連指標
        <ChartInfoContentRenderer chartKey="earnings" ariaLabel="給与指標のデータソースを表示" />
      </h2>
      <div className={styles.legendContainer}>
        <div className={styles.legendSection}>
          <div className={styles.legendItems}>
            {configs.map(({ key, displayName, color }) => (
              <button
                key={key}
                className={`${styles.legendItem} ${hiddenKeys.includes(key) ? styles.hidden : ""}`}
                onClick={() => onToggle(key)}
                aria-pressed={!hiddenKeys.includes(key)}
              >
                <span className={styles.legendIcon} style={{ backgroundColor: color }} />
                <span className={styles.legendLabel}>{displayName || key}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.chartWrapper} role="img" aria-label="給与指標と関連指標の推移グラフ">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ bottom: 20, left: 0, right: 30, top: 10 }}>
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
              domain={[0, yAxisMax]}
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
            {configs.map(({ key, color, type }) => {
              if (hiddenKeys.includes(key)) {
                return null;
              }
              return type === "area" ? (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="earning"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.8}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={isMobile ? 2 : 4}
                  dot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className={styles.chartDataTable}>
        <summary>データテーブルを表示</summary>
        <div className={styles.chartDataTableActions}>
          <ChartExportButton
            title={"給与内訳"}
            data={data as unknown as Record<string, unknown>[]}
            keys={configs.map((c) => c.key)}
            headers={configs.map((c) => c.displayName || c.key)}
          />
        </div>
        <table>
          <thead><tr><th>年月</th>{configs.map((c) => <th key={c.key}>{c.displayName || c.key}</th>)}</tr></thead>
          <tbody>
            {data.slice(-12).map((d) => (
              <tr key={d.年月}>
                <td>{d.年月}</td>
                {configs.map((c) => <td key={c.key}>{typeof d[c.key] === "number" ? (d[c.key] as number).toFixed(2) : "-"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};
