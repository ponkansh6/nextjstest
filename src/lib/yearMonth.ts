/** Convert supported public year-month spellings to the canonical YYYY-MM key. */
export function toCanonicalYearMonth(ym: string): string | null {
  const match = String(ym ?? "")
    .trim()
    .match(/^(\d{4})(?:年0?(\d{1,2})月|[-/](\d{1,2}))$/);
  if (!match) return null;
  const month = Number(match[2] ?? match[3]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

/** Parse year-month strings used by public CSVs and dashboard rows. */
export function parseYearMonth(ym: string): { year: number; month: number } | null {
  const canonical = toCanonicalYearMonth(ym);
  if (!canonical) return null;
  const [year, month] = canonical.split("-").map(Number);
  return {
    year,
    month,
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
  const quarterMatch = String(ym ?? "").match(/^(\d{4})Q[1-4]$/);
  if (quarterMatch) return parseInt(quarterMatch[1], 10);

  const parsed = parseYearMonth(ym);
  return parsed?.year ?? null;
}
