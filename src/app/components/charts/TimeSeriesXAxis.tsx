"use client";

import React from "react";
import { XAxis } from "recharts";
import { XAxisEdgeTick } from "./XAxisEdgeTick";
import { computeXAxisTicks, type XAxisTickOptions } from "./xAxisTicks";

interface TimeSeriesXAxisProps {
  data: Array<{ 年月: string; [key: string]: unknown }>;
  chartColors: Record<string, string>;
  tickKey?: string;
  tickOptions?: XAxisTickOptions;
}

function useIsNarrowViewport(): boolean {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("resize", onStoreChange);
      return () => window.removeEventListener("resize", onStoreChange);
    },
    () => window.matchMedia("(max-width: 390px)").matches,
    () => false,
  );
}

export const TimeSeriesXAxis: React.FC<TimeSeriesXAxisProps> = ({
  data,
  chartColors,
  tickKey = "年月",
  tickOptions,
}) => {
  const isNarrowViewport = useIsNarrowViewport();
  const ticks = computeXAxisTicks(data, tickKey, {
    ...tickOptions,
    includeBoundaryTicks: isNarrowViewport ? false : tickOptions?.includeBoundaryTicks,
    maxTicks: isNarrowViewport ? 5 : tickOptions?.maxTicks,
  });

  return (
    <XAxis
      dataKey={tickKey}
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
      ticks={ticks}
      interval={0}
    />
  );
};
