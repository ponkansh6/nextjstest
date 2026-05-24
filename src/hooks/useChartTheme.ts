import { useCallback, useSyncExternalStore } from "react";

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
    axisText: "var(--chart-text)",
    gridStroke: "var(--chart-grid)",
    tooltipBg: "var(--tooltip-bg)",
    tooltipText: "var(--tooltip-text)",
  };

  return { chartColors, isMobile };
};
