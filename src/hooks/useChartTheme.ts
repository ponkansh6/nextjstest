import { useSyncExternalStore, useCallback } from "react";

export const useChartTheme = () => {
  const isMobile = useSyncExternalStore(
    useCallback((callback: () => void) => {
      const mediaQuery = window.matchMedia("(max-width: 768px)");
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    }, []),
    () => window.matchMedia("(max-width: 768px)").matches,
    () => false,
  );

  const chartColors = {
    gridStroke: "var(--chart-grid)",
    axisText: "var(--chart-text)",
    tooltipBg: "var(--tooltip-bg)",
    tooltipText: "var(--tooltip-text)",
  };

  return { isMobile, chartColors };
};
