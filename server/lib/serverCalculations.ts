import type { CpiData } from "@/types";

/**
 * 給与指標を特定の分母で割り、給与固定の基準年（2025年）を100としてスケーリングします。
 */
export function calculateAdjustedMetric(
  totalEarnings: number,
  denominator: number,
  scalingFactor: number,
): number | null {
  if (denominator <= 0) {
    return null;
  }
  return (totalEarnings / denominator) * scalingFactor;
}

/**
 * Calculates the smoothed total of earnings.
 * Note: In the current implementation, '特別給与' is already smoothed via a 12-month moving average.
 */
export function calculateSmoothedTotal(item: CpiData): number {
  const scheduled = Number(item["所定内給与"]) || 0;
  const unscheduled = Number(item["所定外給与"]) || 0;
  const special = Number(item["特別給与"]) || 0;
  return scheduled + unscheduled + special;
}

/**
 * Calculates the raw residual: smoothedTotal - CPI.
 */
export function calculateRawResidual(smoothedTotal: number, cpiVal: number): number {
  return cpiVal > 0 ? smoothedTotal - cpiVal : 0;
}

/**
 * Applies a 2-month moving average to the '残差' property of the data array.
 * Starts from 2005年2月.
 */
export function applyResidualMovingAverage(data: CpiData[]): void {
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    // Skip smoothing for 2005年1月 or anything in 2004
    if (item.年月 === "2005年1月" || item.年月.startsWith("2004年")) {
      continue;
    }

    if (i > 0) {
      const prevResidual = data[i - 1]["残差"];
      const currentResidual = item["残差"];
      item["残差"] =
        typeof prevResidual === "number" &&
        Number.isFinite(prevResidual) &&
        typeof currentResidual === "number" &&
        Number.isFinite(currentResidual)
          ? (prevResidual + currentResidual) / 2
          : null;
    }
  }
}

/**
 * Rebases the already-smoothed residual to the selected calendar year's
 * display average. A complete, finite year is required so unavailable data
 * never becomes a fabricated zero.
 */
export function rebaseResidualToYearAverage(data: CpiData[], year: number): void {
  const yearPrefix = `${year}年`;
  const yearItems = data.filter((item) => item.年月.startsWith(yearPrefix));
  const values = yearItems.map((item) => item["残差"]);
  if (
    yearItems.length !== 12 ||
    new Set(yearItems.map((item) => item.年月)).size !== 12 ||
    !values.every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }

  const average = (values as number[]).reduce((sum, value) => sum + value, 0) / values.length;
  data.forEach((item) => {
    const value = item["残差"];
    if (typeof value === "number" && Number.isFinite(value)) {
      item["残差"] = value - average;
    }
  });
}
