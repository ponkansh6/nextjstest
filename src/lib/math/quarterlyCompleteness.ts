import { normalizeYearMonth } from "../yearMonth";

const QUARTER_MONTHS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
] as const;

/** CTI consumption completeness starts with the first official CTI quarter. */
export const CTI_COMPLETENESS_START_YEAR = 2018;

export function isCompleteCtiQuarter(
  dataMap: ReadonlyMap<string, Record<string, unknown>>,
  year: number,
  quarter: number,
  keys: readonly string[],
): boolean {
  if (year < CTI_COMPLETENESS_START_YEAR) return true;
  const months = QUARTER_MONTHS[quarter - 1];
  if (!months) return false;

  return months.every((month) => {
    const row = dataMap.get(normalizeYearMonth(`${year}年${month}月`));
    return (
      row !== undefined &&
      keys.every((key) => {
        const value = row[key];
        return typeof value === "number" && Number.isFinite(value);
      })
    );
  });
}
