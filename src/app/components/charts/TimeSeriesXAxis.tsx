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

function useViewportWidth(): number {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("resize", onStoreChange);
      return () => window.removeEventListener("resize", onStoreChange);
    },
    () => window.innerWidth,
    () => 0,
  );
}

export const TimeSeriesXAxis: React.FC<TimeSeriesXAxisProps> = ({
  data,
  chartColors,
  tickKey = "年月",
  tickOptions,
}) => {
  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth > 0 && viewportWidth <= 768;
  const ticks = computeXAxisTicks(data, tickKey, {
    ...tickOptions,
    // The adjacent 2017/12 and 2018/1 labels cannot be readable at any
    // supported chart width. The existing reference lines still expose the
    // hand-off without overlapping axis text.
    preserveAllMilestones: isMobile,
    includeBoundaryTicks: isMobile ? false : tickOptions?.includeBoundaryTicks,
    maxTicks: isMobile ? undefined : tickOptions?.maxTicks,
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
          avoidEndpointOverlap={isMobile}
        />
      )}
      dy={10}
      ticks={ticks}
      interval={0}
    />
  );
};
