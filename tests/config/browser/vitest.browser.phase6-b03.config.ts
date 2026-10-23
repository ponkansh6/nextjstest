import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { chromiumPlaywrightProvider } from "./chromium-provider";
import { inspectPhase6B03 } from "../../../tests/browser-mode/phase6-b03.route.command";

const projectRoot = path.resolve(__dirname, "../../..");

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  optimizeDeps: { include: ["recharts"] },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
      "@server": path.resolve(projectRoot, "server"),
    },
  },
  test: {
    include: ["tests/browser-mode/phase6-b03-advanced-series.browser.test.ts"],
    setupFiles: ["tests/browser-mode/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 45_000,
    hookTimeout: 90_000,
    browser: {
      enabled: true,
      provider: chromiumPlaywrightProvider({ actionTimeout: 10_000 }),
      instances: [{ browser: "chromium", headless: true, viewport: { width: 1280, height: 800 } }],
      commands: { inspectPhase6B03 },
      trace: { mode: "retain-on-failure", screenshots: true, snapshots: true },
      screenshotFailures: true,
    },
  },
});
