import { useSyncExternalStore } from "react";
import { MOBILE_BREAKPOINT_PX } from "@/lib/breakpoints";

const CHART_COLORS = {
  axisText: "var(--chart-text)",
  gridStroke: "var(--chart-grid)",
  tooltipBg: "var(--tooltip-bg)",
  tooltipText: "var(--tooltip-text)",
} as const;

const createMediaQueryStore = (query: string) => ({
  subscribe: (callback: () => void) => {
    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener("change", callback);
    return () => mediaQuery.removeEventListener("change", callback);
  },
  getSnapshot: () => window.matchMedia(query).matches,
});

const mobileStore = createMediaQueryStore(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
const touchStore = createMediaQueryStore("(pointer: coarse)");

export const useChartTheme = () => {
  const isMobile = useSyncExternalStore(
    mobileStore.subscribe,
    mobileStore.getSnapshot,
    () => false,
  );
  const isTouch = useSyncExternalStore(touchStore.subscribe, touchStore.getSnapshot, () => false);
  return { chartColors: CHART_COLORS, isMobile, isTouch };
};
