export function mapColumns(targetCols: string[], sourceCols: string[]): Map<string, string | null> {
  const mapped = new Map<string, string | null>();
  const unmatched: string[] = [];

  for (const tc of targetCols) {
    // 1. Exact match
    if (sourceCols.includes(tc)) {
      mapped.set(tc, tc);
      continue;
    }

    // 2. Case-insensitive
    const ci = sourceCols.find((sc) => sc.trim().toLowerCase() === tc.trim().toLowerCase());
    if (ci) {
      mapped.set(tc, ci);
      continue;
    }

    // 3. Contains (target in source)
    const contains = sourceCols.find((sc) => sc.includes(tc));
    if (contains) {
      mapped.set(tc, contains);
      continue;
    }

    // 4. Unnamed positional mapping handled in merger
    mapped.set(tc, null);
    unmatched.push(tc);
  }
  return mapped;
}
