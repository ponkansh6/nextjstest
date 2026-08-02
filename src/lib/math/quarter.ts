/**
 * Quarter calculation utilities.
 * Consolidates month-to-quarter conversion logic across the codebase.
 */

/**
 * Calculate quarter (1-4) from month (1-12).
 *
 * @param month - Month (1-12)
 * @returns Quarter (1-4)
 */
export function calculateQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Generate quarter label in Japanese format.
 *
 * @param year - Year
 * @param quarter - Quarter (1-4)
 * @returns Label like "2024年1～3月期"
 */
export function calculateQuarterLabel(year: number, quarter: number): string {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  return `${year}年${startMonth}～${endMonth}月期`;
}

/**
 * Get start and end months for a quarter.
 *
 * @param quarter - Quarter (1-4)
 * @returns [startMonth, endMonth]
 */
export function getQuarterMonths(quarter: number): [number, number] {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;
  return [startMonth, endMonth];
}
