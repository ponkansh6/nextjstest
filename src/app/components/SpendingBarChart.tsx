import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getLegendLabel } from "../../lib/chartConstants";

export const SpendingBarChart = ({
  title,
  data,
  keys,
  colors,
  hiddenKeys,
  _onToggle,
  chartColors,
  _isMobile,
  CustomTooltip,
  _hiddenQuarters,
  _onToggleQuarter,
  _onReset,
}: any) => {
  return (
    <div className="spending-bar-chart">
      <h3>{title}</h3>
      <div style={{ height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.gridStroke} />
            <XAxis dataKey="label" stroke={chartColors.axisText} />
            <YAxis stroke={chartColors.axisText} />
            <Tooltip
              content={
                <CustomTooltip
                  tooltipBg={chartColors.tooltipBg}
                  tooltipText={chartColors.tooltipText}
                />
              }
            />
            <Legend formatter={(value) => getLegendLabel(value)} />
            {keys.map((key: string, index: number) =>
              !hiddenKeys.includes(key) ? (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={
                    key === "民間最終消費支出_scaled"
                      ? chartColors.barFill || "#94a3b8"
                      : colors[index]
                  }
                  fillOpacity={key === "民間最終消費支出_scaled" ? 0.9 : 0.8}
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
