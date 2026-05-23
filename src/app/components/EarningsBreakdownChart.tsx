import React from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./CpiChart.module.css";

interface EarningsBreakdownChartProps {
  data: Record<string, unknown>[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  isMobile: boolean;
  CustomTooltip: React.FC<{
    active?: boolean;
    payload?: Array<{ name: string; value: number }>;
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
  const configs: Array<{
    key: string;
    color: string;
    type: "area" | "line";
    displayName?: string;
  }> = [
    { key: "所定内給与", color: "#1e40af", type: "area" },
    { key: "所定外給与", color: "#3b82f6", type: "area" },
    { key: "特別給与", color: "#60a5fa", type: "area" },
    { key: "時間当たり給与", color: "#16a34a", type: "line" },
    {
      key: "15歳以上国民一人当たり給与",
      color: "#a3e635",
      type: "line",
    },
    {
      key: "総合(MA)",
      displayName: "CPI総合(12か月MA)",
      color: "#f59e0b",
      type: "line",
    },
    {
      key: "総合",
      displayName: "CPI総合(参考)",
      color: "#facc15",
      type: "line",
    },
  ];

  return (
    <div className={styles.chartSection}>
      <h2 className={styles.chartTitle}>
        現金給与総額の動向（所定内・所定外・特別給与・各種指標）
      </h2>
      <p className={styles.chartNote}>
        ※給与関連指標は12か月移動平均を用いています。
      </p>
      <div className={styles.legendContainer}>
        <div className={styles.legendSection}>
          <div className={styles.legendItems}>
            {configs.map(({ key, displayName, color }) => (
              <button
                key={key}
                className={`${styles.legendItem} ${
                  hiddenKeys.includes(key) ? styles.hidden : ""
                }`}
                onClick={() => onToggle(key)}
                aria-pressed={!hiddenKeys.includes(key)}
              >
                <span
                  className={styles.legendIcon}
                  style={{ backgroundColor: color }}
                />
                <span className={styles.legendLabel}>{displayName || key}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={chartColors.gridStroke}
            />
            <XAxis
              dataKey="年月"
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText, fontSize: 12 }}
              dy={10}
            />
            <YAxis
              domain={[0, "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText, fontSize: 12 }}
              dx={-10}
            />
            <Tooltip
              content={
                <CustomTooltip
                  isMobile={isMobile}
                  tooltipBg={chartColors.tooltipBg}
                  tooltipText={chartColors.tooltipText}
                />
              }
            />
            {configs.map(({ key, color, type }) => {
              if (hiddenKeys.includes(key)) return null;
              return type === "area" ? (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="earning"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.6}
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
