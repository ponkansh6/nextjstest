"use client";

import type { ReactElement } from "react";
import { useChartTheme } from "@/hooks/useChartTheme";
import { CustomTooltip } from "../CustomTooltip";

export interface ChartTooltipProps {
  cursor: { stroke: string; strokeWidth: number; strokeOpacity: number };
  trigger: "hover" | "click";
  active?: boolean;
  content: ReactElement;
}

export const useChartTooltipProps = ({
  resetKey,
  suppressed,
}: {
  resetKey: number;
  suppressed: boolean;
}): ChartTooltipProps => {
  const { isMobile, isTouch, chartColors } = useChartTheme();
  return {
    cursor: { stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 },
    trigger: isTouch ? "click" : "hover",
    active: suppressed ? false : undefined,
    content: (
      <CustomTooltip
        isMobile={isMobile}
        isTouch={isTouch}
        tooltipBg={chartColors.tooltipBg}
        tooltipText={chartColors.tooltipText}
        resetKey={resetKey}
        suppressed={suppressed}
      />
    ),
  };
};
