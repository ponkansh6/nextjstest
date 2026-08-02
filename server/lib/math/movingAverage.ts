/**
 * Calculate trailing moving average for a numeric array.
 * @param values The numeric values (typically prices, indices, etc.)
 * @param window The window size (e.g., 12 for 12-month MA)
 * @param opts.skipNonPositive If true, skip values <= 0 when calculating average
 * @returns Array of moving averages, same length as input
 */
export function trailingMovingAverage(
  values: readonly number[],
  window: number,
  opts?: { skipNonPositive?: boolean },
): number[] {
  const skipNonPositive = opts?.skipNonPositive ?? false;
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - (window - 1)); j <= i; j++) {
      const val = values[j];
      if (typeof val === "number") {
        if (skipNonPositive && val <= 0) continue;
        sum += val;
        count++;
      }
    }
    result.push(count > 0 ? sum / count : 0);
  }

  return result;
}
