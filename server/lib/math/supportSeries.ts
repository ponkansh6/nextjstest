/**
 * Support series (民間最終消費支出) handling functions.
 * Consolidates duplicate applySupportSeriesScaling logic from multiple files.
 */

const SUPPORT_SERIES_YEAR_START = 2005;
const SUPPORT_SERIES_YEAR_END = 2016;

export interface SupportSeriesRow {
  [key: string]: string | number;
  年: number;
}

/**
 * Apply support series scaling based on 2020 average.
 * Scales 2005-2016 data and zeros out other years.
 *
 * @param rows - Array of data rows to modify
 * @param supportKey - The support series key (e.g., "民間最終消費支出（名目）")
 */
export function applySupportSeriesScaling(rows: SupportSeriesRow[], supportKey: string): void {
  // Calculate scale factor based on 2020 average
  const quarters2020 = rows
    .filter((r) => r.年 === 2020 && (r[supportKey] as number) > 0)
    .map((r) => r[supportKey] as number);
  const avg2020 =
    quarters2020.length > 0 ? quarters2020.reduce((a, b) => a + b, 0) / quarters2020.length : 0;
  const scale = avg2020 > 0 ? 100 / avg2020 : 1;

  rows.forEach((r) => {
    const year = r.年 as number;
    const rawVal = (r[supportKey] as number) || 0;

    if (year >= SUPPORT_SERIES_YEAR_START && year <= SUPPORT_SERIES_YEAR_END) {
      r[supportKey] = rawVal * scale;
    } else {
      r[supportKey] = 0;
    }
  });
}
