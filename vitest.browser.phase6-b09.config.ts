import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { inspectPhase6B09 } from "./tests/browser-mode/phase6-b09.route.command";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["recharts"] },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src"), "@server": path.resolve(__dirname, "server") },
  },
  test: {
    include: ["tests/browser-mode/phase6-b09-real-consumption.browser.test.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    setupFiles: ["tests/browser-mode/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 90_000,
    browser: {
      enabled: true,
      provider: playwright({ actionTimeout: 10_000 }),
      instances: [{ browser: "chromium", headless: true, viewport: { width: 1280, height: 720 } }],
      commands: { inspectPhase6B09 },
      trace: { mode: "retain-on-failure", screenshots: true, snapshots: true },
      screenshotFailures: true,
    },
  },
});
