import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  failedRetainableBrowserGates,
  isSafeBrowserScreenshotPath,
  parseTimeOutput,
  sanitizeVitestBrowserReport,
} from "../../scripts/prepush-benchmark.mjs";

const temporaryDirectories: string[] = [];

function writeTimeOutput(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), "prepush-time-metrics-"));
  temporaryDirectories.push(directory);
  const filePath = join(directory, "time.txt");
  writeFileSync(filePath, contents);
  return filePath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("pre-push benchmark resource metrics", () => {
  it("reads explicit GNU time metrics even when the hook exits unsuccessfully", () => {
    const filePath = writeTimeOutput(
      "USER_SECONDS=85.26\nSYSTEM_SECONDS=7.19\nELAPSED_SECONDS=59.83\nMAX_RSS_KB=1017300\nEXIT_STATUS=1\n",
    );

    expect(parseTimeOutput(filePath)).toEqual({
      userCpuSeconds: 85.26,
      systemCpuSeconds: 7.19,
      peakRssKb: 1017300,
      resourceMetricsAvailable: true,
    });
  });

  it("continues to parse existing GNU time verbose artifacts", () => {
    const filePath = writeTimeOutput(
      "\tUser time (seconds): 85.26\n\tSystem time (seconds): 7.19\n\tMaximum resident set size (kbytes): 1017300\n",
    );

    expect(parseTimeOutput(filePath)).toEqual({
      userCpuSeconds: 85.26,
      systemCpuSeconds: 7.19,
      peakRssKb: 1017300,
      resourceMetricsAvailable: true,
    });
  });

  it("reports unavailable metrics only when the time report lacks them", () => {
    const filePath = writeTimeOutput(
      "Command being timed: bash .husky/pre-push.bash\nExit status: 1\n",
    );

    expect(parseTimeOutput(filePath)).toEqual({
      userCpuSeconds: null,
      systemCpuSeconds: null,
      peakRssKb: null,
      resourceMetricsAvailable: false,
    });
  });
});

describe("pre-push benchmark Browser Mode failure artifacts", () => {
  it("retains only failures from the two configured pre-push Browser Mode gates", () => {
    expect(
      failedRetainableBrowserGates([
        { gate: "test:browser:prepush:component", exitCode: 1 },
        { gate: "test:browser:next-route-poc:prepush:built", exitCode: 0 },
        { gate: "test:browser:component:all", exitCode: 1 },
        { gate: "test:browser:unconfigured", exitCode: 1 },
        { gate: "build", exitCode: 1 },
      ]),
    ).toEqual(["test:browser:prepush:component"]);
  });

  it("allows only PNG screenshots with safe path components", () => {
    expect(isSafeBrowserScreenshotPath("tests/browser-mode/__screenshots__/case01.png")).toBe(true);
    expect(isSafeBrowserScreenshotPath("tests/browser-mode/__screenshots__/case01.trace.zip")).toBe(
      false,
    );
    expect(isSafeBrowserScreenshotPath("tests/browser-mode/__screenshots__/secret-token.png")).toBe(
      false,
    );
    expect(isSafeBrowserScreenshotPath("tests/browser-mode/__traces__/case01.png")).toBe(false);
    expect(isSafeBrowserScreenshotPath("tests/browser-mode/__screenshots__/../secret.png")).toBe(
      false,
    );
  });

  it("reduces Vitest output to a fixed summary without raw error or request data", () => {
    expect(
      sanitizeVitestBrowserReport(
        {
          numTotalTests: 1,
          numPassedTests: 0,
          numFailedTests: 1,
          testResults: [
            {
              assertionResults: [
                {
                  fullName: "selected case",
                  status: "failed",
                  failureMessages: ["Authorization: Bearer private-value"],
                },
              ],
            },
          ],
          stdout: "Cookie: private-value",
        },
        "selected case",
      ),
    ).toEqual({
      schemaVersion: "prepush-browser-report-v1",
      selectedTest: "selected case",
      status: "failed",
      selectedTestCount: 1,
      totalTestResults: 1,
      passedTestResults: 0,
      failedTestResults: 1,
    });
  });
});
