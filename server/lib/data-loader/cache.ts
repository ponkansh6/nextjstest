import { unstable_cache } from "next/cache";

const testCache = new Map<string, any>();

export function clearTestCache() {
  testCache.clear();
}

export function maybeCache(fn: any, key: string, opts?: any) {
  if (process.env.VITEST || process.env.JEST_WORKER_ID || process.env.NODE_ENV === "test") {
    return async (...args: any[]) => {
      const cacheKey = key + JSON.stringify(args);
      if (testCache.has(cacheKey)) return testCache.get(cacheKey);
      const result = await fn(...args);
      testCache.set(cacheKey, result);
      return result;
    };
  }
  try {
    if (typeof unstable_cache === "function") return unstable_cache(fn, [key], opts);
  } catch (error) {
    console.error("maybeCache unstable_cache error:", error);
    return fn;
  }
  return fn;
}
