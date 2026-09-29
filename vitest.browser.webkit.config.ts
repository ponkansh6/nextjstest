import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { inspectBatch4BProductionCase } from "./tests/browser-mode/batch4-b-route.command";
import { inspectBatch5StandardProductionCase } from "./tests/browser-mode/batch5-standard-route.command";
import { inspectBatch5LazyTab } from "./tests/browser-mode/batch5-lazy-tabs-route.command";

const browserApiPort = Number(process.env.NEXT_ROUTE_POC_BROWSER_API_PORT ?? 63315);
const hasRunLocalBrowserApiPort = process.env.NEXT_ROUTE_POC_BROWSER_API_PORT !== undefined;

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
      "tests/browser-mode/SectionTabsB3m.browser.test.tsx",
      "tests/browser-mode/batch4-b-webkit-production-route.browser.test.ts",
      "tests/browser-mode/batch5-standard-webkit-production-route.browser.test.ts",
      "tests/browser-mode/batch5-lazy-tabs-webkit-production-route.browser.test.ts",
    ],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    testNamePattern: /webkit/,
    setupFiles: ["tests/browser-mode/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 45_000,
    hookTimeout: 90_000,
    browser: {
      enabled: true,
      api: { port: browserApiPort, strictPort: hasRunLocalBrowserApiPort },
      provider: playwright({ actionTimeout: 5_000 }),
      instances: [{ browser: "webkit", headless: true, viewport: { width: 375, height: 800 } }],
      commands: {
        inspectBatch4BProductionCase,
        inspectBatch5StandardProductionCase,
        inspectBatch5LazyTab,
      },
      trace: { mode: "retain-on-failure", screenshots: true, snapshots: true },
      screenshotFailures: true,
    },
  },
});
