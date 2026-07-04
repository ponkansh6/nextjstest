import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import styles from "./CpiChart.module.css";
import type { CpiData } from "@/types";

interface EarningsBreakdownChartProps {
  data: CpiData[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  isMobile: boolean;
  CustomTooltip: React.FC<{
    active?: boolean;
    payload?: { name: string; value: number }[];
    label?: string;
    isMobile: boolean;
    tooltipBg: string;
    tooltipText: string;
  }>;
}

export const EarningsBreakdownChart: React.FC<EarningsBreakdownChartProps> = ({
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
    <div className={styles.chartSection}>
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
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ bottom: 20, left: 0, right: 30, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
            {data
              .filter(
                (d) =>
                  d.年月.endsWith("年1月") &&
                  [2010, 2015, 2020, 2025].includes(parseInt(d.年月.split("年")[0])),
              )
              .map((d) => (
                <ReferenceLine
                  key={d.年月}
                  x={d.年月}
                  stroke={chartColors.gridStroke}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  strokeOpacity={0.2}
                  style={{ pointerEvents: "none" }}
                />
              ))}
            <XAxis
              dataKey="年月"
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText, fontSize: 12 }}
              dy={10}
            />
            <YAxis
              domain={[0, yAxisMax]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText, fontSize: 12 }}
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
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
