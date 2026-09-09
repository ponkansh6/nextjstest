/**
 * Support series (民間最終消費支出) handling functions.
 * Consolidates duplicate applySupportSeriesScaling logic from multiple files.
 */

const SUPPORT_SERIES_YEAR_START = 2005;
const SUPPORT_SERIES_YEAR_END = 2016;

export interface SupportSeriesRow {
  [key: string]: string | number | null;
  年: number;
}

export type GdpSupportValue = {
  rawValue: number | null;
  normalizedValue: number | null;
  sourceQuarter: string | null;
};

/** A GDP comparison base is valid only when its annual raw observation exists. */
export function calculateGdp2025NormalizationFactor(values: number[]): number | undefined {
  if (values.length !== 1 || values.some((value) => !Number.isFinite(value) || value === 0)) {
    return undefined;
  }
  return values[0] > 0 ? 100 / values[0] : undefined;
}

/**
 * Apply the established 2020 support-series normalization and coverage.
 *
 * @param rows - Array of data rows to modify
 * @param supportKey - The support series key (e.g., "民間最終消費支出（名目）")
 */
export function applySupportSeriesScaling(rows: SupportSeriesRow[], supportKey: string): void {
  const quarters2020 = rows
    .filter((r) => r.年 === 2020 && (r[supportKey] as number) > 0)
    .map((r) => r[supportKey] as number);
  const avg2020 =
    quarters2020.length > 0 ? quarters2020.reduce((a, b) => a + b, 0) / quarters2020.length : 0;
  const scale = avg2020 > 0 ? 100 / avg2020 : 1;
  rows.forEach((r) => {
    const year = r.年 as number;
    const rawValue = (r[supportKey] as number) || 0;
    r[supportKey] =
      year >= SUPPORT_SERIES_YEAR_START && year <= SUPPORT_SERIES_YEAR_END ? rawValue * scale : 0;
  });
}
