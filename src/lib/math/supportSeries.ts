/** Environment-independent support-series calculations. */

const SUPPORT_SERIES_YEAR_START = 2005;
const SUPPORT_SERIES_YEAR_END = 2016;

export interface SupportSeriesRow {
  [key: string]: string | number | null | undefined;
  年: number;
}

/** A GDP comparison base is valid only when its annual raw observation exists. */
export function calculateGdp2025NormalizationFactor(values: number[]): number | undefined {
  if (values.length !== 1 || values.some((value) => !Number.isFinite(value) || value === 0)) {
    return undefined;
  }
  return values[0] > 0 ? 100 / values[0] : undefined;
}

/**
 * Normalize finite support-series values from 2005 through 2016 without
 * changing either the input array or its rows. Missing and non-finite values,
 * including out-of-period observations, remain untouched.
 */
export function scaleSupportSeries(
  rows: ReadonlyArray<SupportSeriesRow>,
  supportKey: string,
): SupportSeriesRow[] {
  const quarters2020 = rows
    .filter((row) => row.年 === 2020)
    .map((row) => row[supportKey])
    .filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
    );
  const avg2020 =
    quarters2020.length > 0 ? quarters2020.reduce((a, b) => a + b, 0) / quarters2020.length : 0;
  const scale = avg2020 > 0 ? 100 / avg2020 : 1;

  return rows.map((row) => {
    const rawValue = row[supportKey];
    return {
      ...row,
      [supportKey]:
        row.年 >= SUPPORT_SERIES_YEAR_START &&
        row.年 <= SUPPORT_SERIES_YEAR_END &&
        typeof rawValue === "number" &&
        Number.isFinite(rawValue)
          ? rawValue * scale
          : rawValue,
    };
  });
}

/**
 * Legacy/view compatibility adapter. Keep the pre-Phase 3-1 behavior here;
 * domain callers must use scaleSupportSeries instead.
 */
export function scaleSupportSeriesLegacy(
  rows: ReadonlyArray<SupportSeriesRow>,
  supportKey: string,
): SupportSeriesRow[] {
  // Establish the shared helper as the common calculation boundary. The
  // explicit legacy projection below intentionally restores its old coverage
  // and special-value semantics for existing server/client views.
  const domainRows = scaleSupportSeries(rows, supportKey);

  const quarters2020 = rows
    .filter((row) => row.年 === 2020 && (row[supportKey] as number) > 0)
    .map((row) => row[supportKey] as number);
  const avg2020 =
    quarters2020.length > 0 ? quarters2020.reduce((a, b) => a + b, 0) / quarters2020.length : 0;
  const scale = avg2020 > 0 ? 100 / avg2020 : 1;

  return domainRows.map((row, index) => {
    const sourceRow = rows[index];
    const rawValue = (sourceRow[supportKey] as number) || 0;
    return {
      ...row,
      [supportKey]:
        sourceRow.年 >= SUPPORT_SERIES_YEAR_START && sourceRow.年 <= SUPPORT_SERIES_YEAR_END
          ? rawValue * scale
          : 0,
    };
  });
}
