"use client";

import type { CSSProperties, ReactElement, PointerEvent as ReactPointerEvent } from "react";
import { useState, useEffect, useCallback } from "react";
import { useChartTheme } from "@/hooks/useChartTheme";
import { CustomTooltip } from "../CustomTooltip";

export interface ChartTooltipProps {
  cursor: { stroke: string; strokeWidth: number; strokeOpacity: number };
  trigger: "hover" | "click";
  active?: boolean;
  content: ReactElement;
  defaultIndex?: number;
  position?: { x: number; y: number };
  wrapperStyle?: CSSProperties;
}

export interface ChartTooltipBindOptions {
  showTotal?: boolean;
  totalExcludedKeys?: string[];
  showAllPayload?: boolean;
}

export const useChartTooltipController = ({
  suppressed,
  isTouch,
}: {
  suppressed: boolean;
  isTouch: boolean;
}): {
  bind: (
    chartId: string,
    options?: ChartTooltipBindOptions & { dataLength?: number },
  ) => {
    tooltipProps: ChartTooltipProps;
    onClick: () => void;
    activeDot?: boolean;
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  };
} => {
  const { isMobile, chartColors } = useChartTheme();
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  // Each chart owns its selected row.  A single index is incorrect because
  // charts can have different filtered lengths (and NewGraph is range-filtered).
  const [activeIndices, setActiveIndices] = useState<Record<string, number | undefined>>({});

  const dismiss = useCallback(() => {
    setActiveChartId(null);
    setActiveIndices({});
  }, []);

  // 1. グラフ外 pointerdown による解除
  useEffect(() => {
    if (activeChartId == null) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.(".recharts-wrapper") == null) {
        setActiveChartId(null);
        setActiveIndices({});
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
        setActiveIndices({});
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeChartId, isTouch]);

  const bind = useCallback(
    (chartId: string, options?: ChartTooltipBindOptions & { dataLength?: number }) => {
      const isThisActive = activeChartId === chartId;
      const selectIndex = (event: ReactPointerEvent<HTMLElement>) => {
        const length = options?.dataLength ?? 0;
        if (suppressed || length < 1) return;
        const svg = event.currentTarget.querySelector("svg");
        const surface = svg?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        const viewBoxWidth = svg?.viewBox.baseVal.width || surface.width;
        const scale = surface.width > 0 ? viewBoxWidth / surface.width : 1;
        // LineChart's right margin is outside the data coordinates. Convert
        // the actual pointer position on the SVG into that coordinate space.
        const plotRight = Math.max(1, viewBoxWidth - 30);
        const x = Math.max(0, Math.min(plotRight, (event.clientX - surface.left) * scale));
        setActiveChartId(chartId);
        setActiveIndices((current) => ({
          ...current,
          [chartId]: Math.max(0, Math.min(length - 1, Math.round((x / plotRight) * (length - 1)))),
        }));
      };
      return {
        tooltipProps: {
          cursor: { stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 },
          trigger: isTouch ? ("click" as const) : ("hover" as const),
          active: isTouch ? (isThisActive ? undefined : false) : suppressed ? false : undefined,
          defaultIndex: isThisActive ? activeIndices[chartId] : undefined,
          position: isTouch && isThisActive ? { x: 0, y: 0 } : undefined,
          wrapperStyle:
            isTouch && isThisActive
              ? {
                  visibility: "visible" as const,
                  width: "100%",
                  minHeight: 1,
                  // Recharts positions the wrapper with translate3d(). That
                  // transform creates a containing block for the fixed
                  // CustomTooltip, making it move with the chart/scrollport.
                  // Keep the wrapper as a viewport-level layer so the
                  // tooltip's own fixed bottom positioning remains stable.
                  position: "fixed" as const,
                  top: 0,
                  left: 0,
                  transform: "none",
                }
              : undefined,
          content: (
            <CustomTooltip
              isMobile={isMobile}
              isTouch={isTouch}
              tooltipBg={chartColors.tooltipBg}
              tooltipText={chartColors.tooltipText}
              onDismiss={dismiss}
              showTotal={options?.showTotal}
              totalExcludedKeys={options?.totalExcludedKeys}
              showAllPayload={options?.showAllPayload}
            />
          ),
        },
        onClick: () => {
          if (!suppressed) {
            setActiveChartId(chartId);
          }
        },
        onPointerDown: selectIndex,
        onPointerMove: selectIndex,
        activeDot: isTouch ? (isThisActive ? undefined : false) : undefined,
      };
    },
    [chartColors, isMobile, isTouch, suppressed, activeChartId, activeIndices, dismiss],
  );

  return { bind };
};
