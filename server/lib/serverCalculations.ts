import type { CpiData } from "@/types";

/**
 * 給与指標を特定の分母（労働者数や人口など）で割り、基準年（2020年）を100としてスケーリングします。
 */
export function calculateAdjustedMetric(
  totalEarnings: number,
  denominator: number,
  scalingFactor: number,
): number {
  if (denominator <= 0) {
    return 0;
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
      const prevResidual = data[i - 1]["残差"] as number;
      const currentResidual = item["残差"] as number;
      item["残差"] = (prevResidual + currentResidual) / 2;
    }
  }
}

/**
 * Generic moving average calculator for a specific key.
 * Used for smoothing '特別給与' with a 12-month window.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyMovingAverage(data: any[], key: string, windowSize: number): void {
  const originalValues = data.map((d) => d[key]);

  data.forEach((item, index) => {
    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, index - (windowSize - 1)); i <= index; i++) {
      const val = originalValues[i];
      if (typeof val === "number") {
        sum += val;
        count++;
      }
    }
    item[key] = count > 0 ? sum / count : 0;
  });
}
