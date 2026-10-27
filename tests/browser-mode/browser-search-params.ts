type SearchParamGlobal = typeof globalThis & { __VITEST_BROWSER_SEARCH_PARAMS__?: string };

export function setBrowserTestSearchParams(searchParams: string): void {
  (globalThis as SearchParamGlobal).__VITEST_BROWSER_SEARCH_PARAMS__ = searchParams;
}
