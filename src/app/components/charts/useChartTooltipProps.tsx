"use client";

import type { ReactElement } from "react";
import { useState, useEffect, useCallback } from "react";
import { useChartTheme } from "@/hooks/useChartTheme";
import { CustomTooltip } from "../CustomTooltip";

export interface ChartTooltipProps {
  cursor: { stroke: string; strokeWidth: number; strokeOpacity: number };
  trigger: "hover" | "click";
  active?: boolean;
  content: ReactElement;
}

export const useChartTooltipController = ({
  suppressed,
  isTouch,
}: {
  suppressed: boolean;
  isTouch: boolean;
}): {
  bind: (chartId: string) => {
    tooltipProps: ChartTooltipProps;
    onClick: () => void;
    activeDot?: boolean;
  };
} => {
  const { isMobile, chartColors } = useChartTheme();
  const [activeChartId, setActiveChartId] = useState<string | null>(null);

  const dismiss = useCallback(() => {
    setActiveChartId(null);
  }, []);

  // 1. グラフ外 pointerdown による解除
  useEffect(() => {
    if (activeChartId == null) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(".recharts-wrapper") == null) {
        setActiveChartId(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, [activeChartId]);

  // 2. スクロールによる解除 (touch端末のみ)
  useEffect(() => {
    if (activeChartId == null || !isTouch) return;
    const startY = window.scrollY;
    const handleScroll = () => {
      if (Math.abs(window.scrollY - startY) > 40) {
        setActiveChartId(null);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeChartId, isTouch]);

  // 3. 抑制時に activeChartId をクリア (Adjusting state during rendering pattern as recommended by React docs)
  const [prevSuppressed, setPrevSuppressed] = useState(suppressed);
  if (suppressed !== prevSuppressed) {
    setPrevSuppressed(suppressed);
    if (suppressed && activeChartId !== null) {
      setActiveChartId(null);
    }
  }

  const bind = useCallback(
    (chartId: string) => {
      const isThisActive = activeChartId === chartId;
      return {
        tooltipProps: {
          cursor: { stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 },
          trigger: isTouch ? ("click" as const) : ("hover" as const),
          active: isTouch ? (isThisActive ? undefined : false) : suppressed ? false : undefined,
          content: (
            <CustomTooltip
              isMobile={isMobile}
              isTouch={isTouch}
              tooltipBg={chartColors.tooltipBg}
              tooltipText={chartColors.tooltipText}
              onDismiss={dismiss}
            />
          ),
        },
        onClick: () => {
          if (!suppressed) {
            setActiveChartId(chartId);
          }
        },
        activeDot: isTouch ? (isThisActive ? undefined : false) : undefined,
      };
    },
    [chartColors, isMobile, isTouch, suppressed, activeChartId, dismiss],
  );

  return { bind };
};
