import { SUPPORT_SERIES_KEY_REAL } from "@/lib/chartConstants";
import type { QuarterlyRow } from "@/types/chart";

export interface QuarterlyGdpComparisonRow {
  period: string;
  nominalRaw: number;
  realRaw: number;
  nominalComparison?: number;
  realComparison?: number;
}

export interface QuarterlyGdpComparisonInput {
  rows: QuarterlyGdpComparisonRow[];
  comparisonReady: boolean;
}

/** Return true only for the canonical YYYY-Qn period key. */
export function isQuarterlyPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-Q[1-4]$/.test(value);
}

/** Validate an ordered, gap-free sequence of quarter keys. */
export function hasContinuousQuarterlyPeriods(
  periods: readonly unknown[],
  start = "2005-Q1",
  end = "2025-Q4",
): boolean {
  if (!isQuarterlyPeriod(start) || !isQuarterlyPeriod(end) || periods.length === 0) return false;
  let [year, quarter] = start.split("-Q").map(Number);
  const expected: string[] = [];
  while (
    year < Number(end.slice(0, 4)) ||
    (year === Number(end.slice(0, 4)) && quarter <= Number(end.slice(-1)))
  ) {
    expected.push(`${year}-Q${quarter}`);
    quarter += 1;
    if (quarter === 5) {
      year += 1;
      quarter = 1;
    }
  }
  return (
    expected.length === periods.length &&
    periods.every((period, index) => period === expected[index])
  );
}

/** Compute the display coefficient from the four raw observations of a year. */
export function calculateQuarterlyComparisonFactor(values: readonly number[]): number | undefined {
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value) || value === 0))
    return undefined;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number.isFinite(mean) && mean !== 0 ? 100 / mean : undefined;
}

/** Convert one raw observation without manufacturing values for invalid input. */
export function convertQuarterlyRawToComparison(raw: unknown, factor: unknown): number | undefined {
  return typeof raw === "number" &&
    Number.isFinite(raw) &&
    typeof factor === "number" &&
    Number.isFinite(factor)
    ? raw * factor
    : undefined;
}

export function convertQuarterlyRawRows(
  rows: readonly QuarterlyGdpComparisonRow[],
  factors: { nominal: number; real: number },
): QuarterlyGdpComparisonRow[] {
  return rows.map((row) => {
    const nominalComparison = convertQuarterlyRawToComparison(row.nominalRaw, factors.nominal);
    const realComparison = convertQuarterlyRawToComparison(row.realRaw, factors.real);
    return {
      period: row.period,
      nominalRaw: row.nominalRaw,
      realRaw: row.realRaw,
      ...(nominalComparison === undefined ? {} : { nominalComparison }),
      ...(realComparison === undefined ? {} : { realComparison }),
    };
  });
}

/** Return a key only for a structurally valid CTI year/quarter pair. */
function quarterlyRowPeriod(row: QuarterlyRow): string | undefined {
  return typeof row.年 === "number" &&
    Number.isInteger(row.年) &&
    row.年 >= 1000 &&
    row.年 <= 9999 &&
    typeof row.quarter === "number" &&
    Number.isInteger(row.quarter) &&
    row.quarter >= 1 &&
    row.quarter <= 4
    ? `${row.年}-Q${row.quarter}`
    : undefined;
}

/**
 * Join comparisons by exact YYYY-Qn keys. Invalid pure-transform inputs are
 * preserved as CTI rows, but never become lookup keys or manufactured values.
 */
export function joinQuarterlyGdpRows(
  nominalRows: readonly QuarterlyRow[],
  realRows: readonly QuarterlyRow[],
  gdp: QuarterlyGdpComparisonInput,
): { nominal: QuarterlyRow[]; real: QuarterlyRow[] } {
  const nominal = nominalRows.map((row) => ({ ...row }));
  const real = realRows.map((row) => ({ ...row }));
  const realByPeriod = new Map<string, QuarterlyRow>();
  for (const row of nominal) delete row[SUPPORT_SERIES_KEY_REAL];
  for (const row of real) {
    const period = quarterlyRowPeriod(row);
    if (period && !realByPeriod.has(period)) realByPeriod.set(period, row);
    delete row[SUPPORT_SERIES_KEY_REAL];
  }
  if (!gdp.comparisonReady) return { nominal, real };
  for (const gdpRow of gdp.rows) {
    if (!isQuarterlyPeriod(gdpRow.period)) continue;
    const realValue = convertQuarterlyRawToComparison(gdpRow.realComparison, 1);
    const realRow = realByPeriod.get(gdpRow.period);
    if (realRow && realValue !== undefined) realRow[SUPPORT_SERIES_KEY_REAL] = realValue;
  }
  return { nominal, real };
}
