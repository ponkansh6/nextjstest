import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  cacheDir: "./node_modules/.cache/vitest-ui",
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    include: ["tests/components/**/*.test.tsx"],
    environment: "happy-dom",
    setupFiles: ["./tests/utils/setup.ts"],
    pool: "forks",
    testTimeout: 300000,

    // タイムアウトを300秒に延長
    coverage: {
      provider: "v8" as const,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "json", "html"],
    },
    typecheck: {
      enabled: false,
    },
  },
});
