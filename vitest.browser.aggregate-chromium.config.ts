import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { inspectPhase5Rendering } from "./tests/browser-mode/phase5-rendering-feasibility.route.command";
import { inspectPhase6B03 } from "./tests/browser-mode/phase6-b03.route.command";
import { inspectPhase6B04 } from "./tests/browser-mode/phase6-b04.route.command";
import { inspectPhase6B05 } from "./tests/browser-mode/phase6-b05.route.command";
import { inspectPhase6B06 } from "./tests/browser-mode/phase6-b06.route.command";
import { inspectPhase6B07 } from "./tests/browser-mode/phase6-b07.route.command";
import { inspectPhase6B08 } from "./tests/browser-mode/phase6-b08.route.command";
import { inspectPhase6B09 } from "./tests/browser-mode/phase6-b09.route.command";
import { inspectPhase6B10 } from "./tests/browser-mode/phase6-b10.route.command";
import { inspectPhase6B11 } from "./tests/browser-mode/phase6-b11.route.command";
import { inspectPhase6B12 } from "./tests/browser-mode/phase6-b12.route.command";
import { inspectPhase6B13 } from "./tests/browser-mode/phase6-b13.route.command";
import { inspectPhase6B14 } from "./tests/browser-mode/phase6-b14.route.command";
import { inspectProductionDashboard } from "./tests/browser-mode/next-route-poc.command";
import { inspectBatch1ProductionCase } from "./tests/browser-mode/batch1-route.command";
import { inspectBatch3AProductionCase } from "./tests/browser-mode/batch3-a-route.command";
import { inspectBatch3BProductionCase } from "./tests/browser-mode/batch3-b-route.command";
import { inspectBatch4AProductionCase } from "./tests/browser-mode/batch4-a-route.command";
import { inspectBatch4BProductionCase } from "./tests/browser-mode/batch4-b-route.command";
import { inspectBatch5StandardProductionCase } from "./tests/browser-mode/batch5-standard-route.command";
import { inspectBatch5LazyTab } from "./tests/browser-mode/batch5-lazy-tabs-route.command";
import { AggregateChromiumSequencer } from "./tests/browser-mode/aggregate-chromium.sequencer";

const browserApiPort = Number(process.env.NEXT_ROUTE_POC_BROWSER_API_PORT ?? 63315);
const hasRunLocalBrowserApiPort = process.env.NEXT_ROUTE_POC_BROWSER_API_PORT !== undefined;

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["recharts"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@server": path.resolve(__dirname, "server"),
    },
  },
  test: {
    include: [
      "tests/browser-mode/phase6-b01-cagr-contrast.browser.test.ts",
      "tests/browser-mode/phase6-b02-real-legend-contrast.browser.test.ts",
      "tests/browser-mode/phase6-b03-advanced-series.browser.test.ts",
      "tests/browser-mode/phase6-b04-parity.browser.test.ts",
      "tests/browser-mode/phase6-b05-parity.browser.test.ts",
      "tests/browser-mode/phase6-b06-quarterly.browser.test.ts",
      "tests/browser-mode/phase6-b07-real-consumption.browser.test.ts",
      "tests/browser-mode/phase6-b08-real-consumption.browser.test.ts",
      "tests/browser-mode/phase6-b09-real-consumption.browser.test.ts",
      "tests/browser-mode/phase6-b10-tooltip-dismiss.browser.test.ts",
      "tests/browser-mode/phase6-b11-tooltip-dismiss.browser.test.ts",
      "tests/browser-mode/phase6-b12-chartnote-tooltip.browser.test.ts",
      "tests/browser-mode/phase6-b13-tooltip-dismiss.browser.test.ts",
      "tests/browser-mode/phase6-b14-residual-accessibility.browser.test.ts",
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
    isolate: true,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 90_000,
    sequence: { sequencer: AggregateChromiumSequencer },
    browser: {
      enabled: true,
      api: { port: browserApiPort, strictPort: hasRunLocalBrowserApiPort },
      provider: playwright({ actionTimeout: 10_000 }),
      instances: [{ browser: "chromium", headless: true, viewport: { width: 1280, height: 800 } }],
      commands: {
        inspectPhase5Rendering,
        inspectPhase6B03,
        inspectPhase6B04,
        inspectPhase6B05,
        inspectPhase6B06,
        inspectPhase6B07,
        inspectPhase6B08,
        inspectPhase6B09,
        inspectPhase6B10,
        inspectPhase6B11,
        inspectPhase6B12,
        inspectPhase6B13,
        inspectPhase6B14,
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
