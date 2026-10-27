#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PIXEL7_BROWSER_MODE_FULL_NAMES,
  PIXEL7_REQUIRED_INTERACTION_FULL_NAMES,
  STANDARD_BROWSER_MODE_FULL_NAMES,
} from "./browser-mode-case-manifest.mjs";
import { preserveBrowserModeReport } from "./browser-mode-report-output.mjs";
import { assertBrowserModeProjectPassed } from "./browser-mode-report-validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VITEST = path.join(ROOT, "node_modules/vitest/vitest.mjs");
const CONFIG = "tests/config/browser/vitest.browser.config.ts";
const PROJECTS = {
  standard: {
    file: "tests/browser-mode/standard.browser.test.tsx",
    expectedFullNames: STANDARD_BROWSER_MODE_FULL_NAMES,
  },
  pixel7: {
    file: "tests/browser-mode/pixel7.browser.test.tsx",
    expectedFullNames: PIXEL7_BROWSER_MODE_FULL_NAMES,
    requiredFullNames: PIXEL7_REQUIRED_INTERACTION_FULL_NAMES,
  },
};

function parseProject(args) {
  if (args.length !== 1 || !args[0].startsWith("--project="))
    throw new Error("Usage: node scripts/run-browser-mode-project.mjs --project=standard|pixel7");
  const project = args[0].slice("--project=".length);
  if (!Object.hasOwn(PROJECTS, project))
    throw new Error(`Unsupported standalone Browser Mode project: ${project}`);
  return project;
}

async function main() {
  const project = parseProject(process.argv.slice(2));
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "nextjstest-browser-mode-"));
  const reportPath = path.join(temporaryDirectory, "vitest-report.json");
  const child = spawn(
    process.execPath,
    [
      VITEST,
      "run",
      "--config",
      CONFIG,
      `--project=${project}`,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${reportPath}`,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        VITEST_BROWSER_API_PORT: process.env.VITEST_BROWSER_API_PORT ?? "3001",
      },
      stdio: "inherit",
      detached: process.platform !== "win32",
    },
  );

  let exitCode = 1;
  try {
    const status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
          try {
            if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
            else child.kill(signal);
          } catch (error) {
            if (error?.code !== "ESRCH") console.error(error);
          }
        });
      }
    });
    exitCode = status;
    if (existsSync(reportPath) && process.env.BROWSER_MODE_REPORT_PATH) {
      await preserveBrowserModeReport(reportPath, process.env.BROWSER_MODE_REPORT_PATH);
    }
    if (status === 0) {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      const fullNames = assertBrowserModeProjectPassed(
        report,
        PROJECTS[project].file,
        PROJECTS[project].expectedFullNames,
        PROJECTS[project].requiredFullNames,
      );
      console.log(
        `[browser-mode] validated ${fullNames.length} ${project} cases: ${JSON.stringify(fullNames)}`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    exitCode = 1;
  } finally {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch (error) {
      console.error(
        `[browser-mode] temporary report cleanup failed: ${error instanceof Error ? error.message : error}`,
      );
      if (exitCode === 0) exitCode = 1;
    }
  }
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
