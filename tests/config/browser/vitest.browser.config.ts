import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { chromiumPlaywrightProvider } from "./chromium-provider";
import {
  desktop1280x800ContextOptions,
  pixel7ContextOptions,
} from "../../../tests/browser-mode/isolated-route-context";

const projectRoot = path.resolve(__dirname, "../../..");
const browserApiPort = Number(process.env.VITEST_BROWSER_API_PORT ?? 63315);

if (!Number.isInteger(browserApiPort) || browserApiPort < 1 || browserApiPort > 65_535) {
  throw new Error("VITEST_BROWSER_API_PORT must be an integer from 1 to 65535");
}

const commonBrowser = {
  enabled: true,
  // The Vitest UI makes the Playwright provider set context viewport to null.
  ui: false,
  api: { host: "127.0.0.1", port: browserApiPort, strictPort: true },
  trace: { mode: "retain-on-failure" as const, screenshots: true, snapshots: true },
  screenshotFailures: true,
};

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  optimizeDeps: { include: ["recharts", "next/navigation"] },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
      "@server": path.resolve(projectRoot, "server"),
    },
  },
  test: {
    setupFiles: ["tests/browser-mode/setup.ts"],
    isolate: true,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 90_000,
    projects: [
      {
        extends: true,
        test: {
          name: "standard",
          include: ["tests/browser-mode/standard.browser.test.tsx"],
          browser: {
            ...commonBrowser,
            provider: chromiumPlaywrightProvider({
              actionTimeout: 5_000,
              contextOptions: desktop1280x800ContextOptions(),
            }),
            instances: [
              { browser: "chromium", headless: true, viewport: { width: 1280, height: 800 } },
            ],
          },
        },
      },
      {
        extends: true,
        test: {
          name: "pixel7",
          include: ["tests/browser-mode/pixel7.browser.test.tsx"],
          browser: {
            ...commonBrowser,
            provider: chromiumPlaywrightProvider({
              actionTimeout: 10_000,
              contextOptions: pixel7ContextOptions(),
            }),
            instances: [
              { browser: "chromium", headless: true, viewport: { width: 412, height: 915 } },
            ],
          },
        },
      },
    ],
  },
});
