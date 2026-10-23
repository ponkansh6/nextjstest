import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { chromiumPlaywrightProvider } from "./chromium-provider";

const projectRoot = path.resolve(__dirname, "../../..");
const browserApiPortValue = process.env.VITEST_BROWSER_API_PORT;
const browserApiPort = browserApiPortValue === undefined ? 63315 : Number(browserApiPortValue);

if (!Number.isInteger(browserApiPort) || browserApiPort < 1 || browserApiPort > 65_535) {
  throw new Error("VITEST_BROWSER_API_PORT must be an integer from 1 to 65535");
}

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  optimizeDeps: {
    include: ["recharts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
      "@server": path.resolve(projectRoot, "server"),
    },
  },
  test: {
    include: ["tests/browser-mode/**/*.browser.test.tsx"],
    testNamePattern: /^(?!.*-webkit)/,
    setupFiles: ["tests/browser-mode/setup.ts"],
    fileParallelism: true,
    maxWorkers: 2,
    browser: {
      // Vitest rereads this browser config, which can lose CLI port overrides.
      api: { port: browserApiPort, strictPort: true },
      enabled: true,
      provider: chromiumPlaywrightProvider({ actionTimeout: 5_000 }),
      instances: [{ browser: "chromium", headless: true, viewport: { width: 1280, height: 800 } }],
      trace: { mode: "retain-on-failure", screenshots: true, snapshots: true },
      screenshotFailures: true,
    },
  },
});
