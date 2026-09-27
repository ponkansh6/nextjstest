import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { inspectPhase5Interaction } from "./tests/browser-mode/phase5-interaction-feasibility.route.command";

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
    include: ["tests/browser-mode/phase5-interaction-feasibility.browser.test.ts"],
    setupFiles: ["tests/browser-mode/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    browser: {
      enabled: true,
      provider: playwright({ actionTimeout: 10_000 }),
      instances: [{ browser: "chromium", headless: true, viewport: { width: 1280, height: 800 } }],
      commands: { inspectPhase5Interaction },
      trace: { mode: "retain-on-failure", screenshots: true, snapshots: true },
      screenshotFailures: true,
    },
  },
});
