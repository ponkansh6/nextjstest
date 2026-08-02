import type { CpiData } from "@/types";
import type { CpiView, EarningsView } from "@/types/chart";

/**
 * Adapts CpiView (server-side view model) to CpiData for internal chart calculations.
 * This bridges the type gap between external View Model types and internal calculation types.
 */
export function adaptCpiViewToChartData(views: CpiView[]): CpiData[] {
  return views.map((v) => ({
    ...(v as unknown as CpiData),
  }));
}

/**
 * Adapts EarningsView (server-side view model) to CpiData for internal chart calculations.
 */
export function adaptEarningsViewToChartData(views: EarningsView[]): CpiData[] {
  return views.map((v) => ({
    ...(v as unknown as CpiData),
  }));
}
