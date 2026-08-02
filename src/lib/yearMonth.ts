/** Parse year-month string (e.g., "2020年1月" or "2020年01月") to { year, month } */
export function parseYearMonth(ym: string): { year: number; month: number } | null {
  const match = ym.match(/^(\d{4})年0?(\d{1,2})月$/);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
  };
}

/** Compare two year-month strings for sorting */
export function compareYearMonth(a: string, b: string): number {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);
  if (!pa || !pb) return 0;
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.month - pb.month;
}

/** Normalize year-month to standard format (e.g., "2020年1月") */
export function normalizeYearMonth(ym: string): string {
  const parsed = parseYearMonth(ym);
  if (!parsed) return ym;
  return `${parsed.year}年${parsed.month}月`;
}

/** Extract year from year-month string */
export function extractYear(ym: string): number | null {
  const parsed = parseYearMonth(ym);
  return parsed?.year ?? null;
}
