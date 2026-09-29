import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { inspectProductionDashboard } from "./tests/browser-mode/next-route-poc.command";
import { inspectBatch1ProductionCase } from "./tests/browser-mode/batch1-route.command";
import { inspectBatch3AProductionCase } from "./tests/browser-mode/batch3-a-route.command";
import { inspectBatch3BProductionCase } from "./tests/browser-mode/batch3-b-route.command";
import { inspectBatch4AProductionCase } from "./tests/browser-mode/batch4-a-route.command";
import { inspectBatch4BProductionCase } from "./tests/browser-mode/batch4-b-route.command";
import { inspectBatch5StandardProductionCase } from "./tests/browser-mode/batch5-standard-route.command";
import { inspectBatch5LazyTab } from "./tests/browser-mode/batch5-lazy-tabs-route.command";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["recharts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@server": path.resolve(__dirname, "server"),
    },
  },
  test: {
    include: [
      "tests/browser-mode/next-route-poc.browser.test.ts",
      "tests/browser-mode/batch1-production-route.browser.test.ts",
      "tests/browser-mode/batch3-a-production-route.browser.test.ts",
      "tests/browser-mode/batch3-b-production-route.browser.test.ts",
      "tests/browser-mode/batch4-a-production-route.browser.test.ts",
      "tests/browser-mode/batch4-b-production-route.browser.test.ts",
      "tests/browser-mode/batch5-standard-chromium-production-route.browser.test.ts",
      "tests/browser-mode/batch5-lazy-tabs-chromium-production-route.browser.test.ts",
    ],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    setupFiles: ["tests/browser-mode/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 45_000,
    hookTimeout: 90_000,
    browser: {
      enabled: true,
      provider: playwright({ actionTimeout: 10_000 }),
      instances: [{ browser: "chromium", headless: true, viewport: { width: 1280, height: 800 } }],
      commands: {
        inspectProductionDashboard,
        inspectBatch1ProductionCase,
        inspectBatch3AProductionCase,
        inspectBatch3BProductionCase,
        inspectBatch4AProductionCase,
        inspectBatch4BProductionCase,
        inspectBatch5StandardProductionCase,
        inspectBatch5LazyTab,
      },
      trace: { mode: "retain-on-failure", screenshots: true, snapshots: true },
      screenshotFailures: true,
    },
  },
});
