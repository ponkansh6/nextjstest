import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSelectedBrowserCasesPassed } from "./browser-selection-validation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = path.join(projectRoot, "node_modules", "vitest", "vitest.mjs");
const selectedFile = "tests/browser-mode/BottomSheet-focus.browser.test.tsx";
const selectedName =
  "BottomSheet focus containment in Chromium keeps real browser Tab navigation inside the open sheet";
const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "nextjstest-prepush-component-"));
const reportPath = path.join(tempDirectory, "vitest.json");

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

try {
  const result = spawnSync(
    process.execPath,
    [
      vitestCli,
      "run",
      "--config",
      "vitest.browser.config.ts",
      "--testNamePattern",
      `^${escapeRegexLiteral(selectedName)}$`,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${reportPath}`,
      selectedFile,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else {
    try {
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      assertSelectedBrowserCasesPassed(report, [selectedName]);
    } catch (error) {
      console.error(
        `[browser-mode] component pre-push selection verification failed: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }
  }
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
