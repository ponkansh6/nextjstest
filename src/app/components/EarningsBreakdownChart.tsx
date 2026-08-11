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
import type { ChartTooltipProps } from "./charts/useChartTooltipProps";
import { YearReferenceLines } from "./charts/YearReferenceLines";
import { XAxisEdgeTick } from "./charts/XAxisEdgeTick";
import ChartInfoContentRenderer from "./ChartInfoContentRenderer";
import { EARNINGS_TABLE_CONFIGS } from "../../lib/chartConstants";
import styles from "./CpiChart.module.css";
import type { CpiData } from "@/types";

interface EarningsBreakdownChartProps {
  sectionId?: string;
  data: CpiData[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  chartColors: Record<string, string>;
  isMobile: boolean;
  tooltipProps: ChartTooltipProps;
  onClick?: () => void;
}

export const EarningsBreakdownChart: React.FC<EarningsBreakdownChartProps> = ({
  sectionId,
  data,
  hiddenKeys,
  onToggle,
  chartColors,
  isMobile,
  tooltipProps,
  onClick,
}) => {
  const configs = EARNINGS_TABLE_CONFIGS;

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
    <div id={sectionId} className={styles.chartSection} style={{ scrollMarginTop: "5rem" }}>
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
          <AreaChart
            data={data}
            margin={{ bottom: 20, left: 0, right: 30, top: 10 }}
            onClick={onClick}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
            <YearReferenceLines data={data} stroke={chartColors.gridStroke} />
            <XAxis
              dataKey="年月"
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
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, yAxisMax]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: chartColors.axisText }}
              dx={-10}
            />
            <Tooltip {...tooltipProps} />
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
      <p className={styles.chartNote}>
        <a href={`#data-table-${sectionId}`}>データテーブルを表示 ▾</a>
      </p>
    </div>
  );
};
