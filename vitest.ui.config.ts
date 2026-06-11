import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "happy-dom",
    include: ["tests/**/*.ui.test.tsx", "tests/**/*.ui.test.ts"],
    exclude: [],
    setupFiles: ["./tests/utils/setup.ts"],
    isolate: false,
    pool: "threads",
  },
});
