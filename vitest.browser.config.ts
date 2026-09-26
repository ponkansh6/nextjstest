import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@server": path.resolve(__dirname, "server"),
    },
  },
  test: {
    include: ["tests/browser-mode/**/*.browser.test.tsx"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
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
