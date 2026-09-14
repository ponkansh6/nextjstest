/**
 * Support series (民間最終消費支出) handling functions.
 * Consolidates duplicate applySupportSeriesScaling logic from multiple files.
 */

import {
  scaleSupportSeriesLegacy,
  type SupportSeriesRow,
} from "../../../src/lib/math/supportSeries";

export { calculateGdp2025NormalizationFactor } from "../../../src/lib/math/supportSeries";
export type { SupportSeriesRow } from "../../../src/lib/math/supportSeries";

export type GdpSupportValue = {
  rawValue: number | null;
  normalizedValue: number | null;
  sourceQuarter: string | null;
};

/**
 * Apply the established 2020 support-series normalization and coverage.
 *
 * @param rows - Array of data rows to modify
 * @param supportKey - The support series key (e.g., "民間最終消費支出（名目）")
 */
export function applySupportSeriesScaling(rows: SupportSeriesRow[], supportKey: string): void {
  // Server callers retain the legacy mutating/void contract at this boundary.
  const scaledRows = scaleSupportSeriesLegacy(rows, supportKey);
  rows.forEach((row, index) => {
    row[supportKey] = scaledRows[index][supportKey];
  });
}
