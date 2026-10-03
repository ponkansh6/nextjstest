import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("data-loader cache coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.doUnmock("next/cache");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("next/cache");
  });

  it.each([
    ["Vitest", { VITEST: "true", JEST_WORKER_ID: "", NODE_ENV: "production" }],
    ["Jest", { VITEST: "", JEST_WORKER_ID: "1", NODE_ENV: "production" }],
    ["test NODE_ENV", { VITEST: "", JEST_WORKER_ID: "", NODE_ENV: "test" }],
  ])("memoizes arguments in %s mode", async (_mode, env) => {
    vi.stubEnv("VITEST", env.VITEST);
    vi.stubEnv("JEST_WORKER_ID", env.JEST_WORKER_ID);
    vi.stubEnv("NODE_ENV", env.NODE_ENV);
    const { clearTestCache, maybeCache } = await import("../../server/lib/data-loader/cache");
    const loader = vi.fn(async (value: number) => value * 2);
    const cached = maybeCache(loader, "coverage");

    await expect(cached(2)).resolves.toBe(4);
    await expect(cached(2)).resolves.toBe(4);
    await expect(cached(3)).resolves.toBe(6);
    expect(loader).toHaveBeenCalledTimes(2);
    clearTestCache();
    await expect(cached(2)).resolves.toBe(4);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("does not cache rejected loader calls", async () => {
    vi.stubEnv("VITEST", "true");
    const { maybeCache } = await import("../../server/lib/data-loader/cache");
    const loader = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue("ok");
    const cached = maybeCache(loader, "rejected");

    await expect(cached()).rejects.toThrow("temporary");
    await expect(cached()).resolves.toBe("ok");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("uses the Next cache outside test mode", async () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("JEST_WORKER_ID", "");
    vi.stubEnv("NODE_ENV", "production");
    const unstableCache = vi.fn((fn: (...args: unknown[]) => Promise<unknown>, keys: string[]) => {
      expect(keys).toEqual(["production"]);
      return fn;
    });
    vi.doMock("next/cache", () => ({ unstable_cache: unstableCache }));
    const { maybeCache } = await import("../../server/lib/data-loader/cache");
    const loader = vi.fn(async () => "loaded");

    expect(maybeCache(loader, "production")).toBe(loader);
    expect(unstableCache).toHaveBeenCalledWith(loader, ["production"], undefined);
  });

  it("falls back to the loader when Next cache is unavailable or throws", async () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("JEST_WORKER_ID", "");
    vi.stubEnv("NODE_ENV", "production");
    const loader = vi.fn(async () => "loaded");

    vi.doMock("next/cache", () => ({ unstable_cache: undefined }));
    let cache = await import("../../server/lib/data-loader/cache");
    expect(cache.maybeCache(loader, "unavailable")).toBe(loader);

    vi.resetModules();
    const error = new Error("cache setup failed");
    vi.doMock("next/cache", () => ({
      unstable_cache: vi.fn(() => {
        throw error;
      }),
    }));
    cache = await import("../../server/lib/data-loader/cache");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(cache.maybeCache(loader, "throws")).toBe(loader);
    expect(log).toHaveBeenCalledWith("maybeCache unstable_cache error:", error);
  });
});
