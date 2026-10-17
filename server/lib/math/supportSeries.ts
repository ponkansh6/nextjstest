/**
 * Support series (民間最終消費支出) handling functions.
 * Consolidates duplicate applySupportSeriesScaling logic from multiple files.
 */

import {
  scaleSupportSeriesLegacy,
  type SupportSeriesRow,
} from "../../../src/lib/math/supportSeries";

export type { SupportSeriesRow } from "../../../src/lib/math/supportSeries";

/**
 * Apply the established 2020 support-series normalization and coverage.
 *
 * @param rows - Array of data rows to modify
 * @param supportKey - The support series key to normalize.
 */
export function applySupportSeriesScaling(rows: SupportSeriesRow[], supportKey: string): void {
  // Server callers retain the legacy mutating/void contract at this boundary.
  const scaledRows = scaleSupportSeriesLegacy(rows, supportKey);
  rows.forEach((row, index) => {
    row[supportKey] = scaledRows[index][supportKey];
  });
}
