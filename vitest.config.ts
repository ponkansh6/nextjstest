import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "./node_modules/.cache/vitest",
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    include: ["tests/**/*.{test.ts,test.tsx}"],
    exclude: ["tests/**/*.ui.test.ts", "tests/**/*.ui.test.tsx"],
    root: "./",
    environment: "node",
    setupFiles: ["./tests/utils/logic-setup.ts"],
    pool: "threads",
    server: {
      deps: {
        inline: ["@reduxjs/toolkit"],
      },
    },
    onConsoleLog(log) {
      if (log.includes("Loader error") || log.includes("Data files not found")) return false;
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "json", "html"],
    },
  },
});
