import { unstable_cache } from "next/cache";

const testCache = new Map<string, unknown>();

export function clearTestCache() {
  testCache.clear();
}

export function maybeCache<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string,
  opts?: { revalidate?: number },
): (...args: A) => Promise<R> {
  if (process.env.VITEST || process.env.JEST_WORKER_ID || process.env.NODE_ENV === "test") {
    return async (...args: A) => {
      const cacheKey = key + JSON.stringify(args);
      if (testCache.has(cacheKey)) return testCache.get(cacheKey) as R;
      const result = await fn(...args);
      testCache.set(cacheKey, result);
      return result;
    };
  }
  try {
    if (typeof unstable_cache === "function")
      return unstable_cache(fn, [key], opts) as (...args: A) => Promise<R>;
  } catch (error) {
    console.error("maybeCache unstable_cache error:", error);
    return fn;
  }
  return fn;
}
