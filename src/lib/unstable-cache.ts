type UnstableCache = <T extends (...args: any[]) => any>(fn: T, key: string[], opts?: any) => T;

let unstableCacheImpl: UnstableCache | null = null;

function getUnstableCache(): UnstableCache {
  if (!unstableCacheImpl) {
    if (process.env.NODE_ENV === "production") {
      // In production, dynamically import and use the real implementation
      // This will be evaluated at build time in Next.js
      const mod = require("next/cache");
      unstableCacheImpl = mod.unstable_cache;
    } else {
      // In development/test, return the function as-is (no caching)
      unstableCacheImpl = <T extends (...args: any[]) => any>(
        fn: T,
        _key: string[],
        _opts?: any,
      ): T => fn as T;
    }
  }
  return unstableCacheImpl!;
}

// Export a synchronous function that matches the real unstable_cache signature
export const unstable_cache = <T extends (...args: any[]) => any>(
  fn: T,
  key: string[],
  opts?: any,
): T => {
  return getUnstableCache()(fn, key, opts);
};
