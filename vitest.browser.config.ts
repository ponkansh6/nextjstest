import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

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
    include: ["tests/browser-mode/**/*.browser.test.tsx"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    testNamePattern: /^(?!.*-webkit)/,
    setupFiles: ["tests/browser-mode/setup.ts"],
    fileParallelism: true,
    maxWorkers: 2,
    browser: {
      enabled: true,
      provider: playwright({ actionTimeout: 5_000 }),
      instances: [{ browser: "chromium", headless: true, viewport: { width: 1280, height: 800 } }],
      trace: { mode: "retain-on-failure", screenshots: true, snapshots: true },
      screenshotFailures: true,
    },
  },
});
