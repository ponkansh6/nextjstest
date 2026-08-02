import { useSyncExternalStore } from "react";

const CHART_COLORS = {
  axisText: "var(--chart-text)",
  gridStroke: "var(--chart-grid)",
  tooltipBg: "var(--tooltip-bg)",
  tooltipText: "var(--tooltip-text)",
} as const;

const subscribe = (callback: () => void) => {
  const mediaQuery = window.matchMedia("(max-width: 768px)");
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
};

const getSnapshot = () => window.matchMedia("(max-width: 768px)").matches;

export const useChartTheme = () => {
  const isMobile = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return { chartColors: CHART_COLORS, isMobile };
};
