const DATE_PATTERNS = [
  /^(\d{4})[/-]?(\d{1,2})$/,
  /^(\d{4})年\s*0?(\d{1,2})月$/,
  /^(\d{4})\.\s*0?(\d{1,2})$/,
];

export function detectDateInSeries(values: (string | number | null)[]): [number, number] | null {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    for (const pattern of DATE_PATTERNS) {
      const match = s.match(pattern);
      if (match) {
        return [parseInt(match[1], 10), parseInt(match[2], 10)];
      }
    }
    // Fallback regex: /(\d{4}).*?(\d{1,2})/
    const fallback = s.match(/(\d{4}).*?(\d{1,2})/);
    if (fallback) {
      return [parseInt(fallback[1], 10), parseInt(fallback[2], 10)];
    }
  }
  return null;
}

export function normalizeYearMonth(year: number, month: number): string {
  return `${year}年${String(month).padStart(2, "0")}月`;
}

export function parseColumnHeaderToYM(header: string): string | null {
  const s = header.trim();
  for (const pattern of DATE_PATTERNS) {
    const match = s.match(pattern);
    if (match) {
      return normalizeYearMonth(parseInt(match[1], 10), parseInt(match[2], 10));
    }
  }
  const fallback = s.match(/(\d{4}).*?(\d{1,2})/);
  if (fallback) {
    return normalizeYearMonth(parseInt(fallback[1], 10), parseInt(fallback[2], 10));
  }
  return null;
}

export function ensureYM(value: string): string {
  const ym = detectDateInSeries([value]);
  if (ym) {
    return normalizeYearMonth(ym[0], ym[1]);
  }
  // Try Date.parse / new Date() fallback
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return normalizeYearMonth(d.getFullYear(), d.getMonth() + 1);
  }
  return value;
}
