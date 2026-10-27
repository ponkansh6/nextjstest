import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();

describe("Pixel 7 production-route Browser Mode runner", () => {
  const runner = fs.readFileSync(path.join(root, "scripts/run-next-route-poc.mjs"), "utf8");

  it("runs only the Pixel 7 inline project from the canonical Browser Mode config", () => {
    expect(runner).toContain(
      'const VITEST_CONFIG = "tests/config/browser/vitest.browser.config.ts"',
    );
    expect(runner).toContain('project !== "pixel7"');
    expect(runner).toContain("`--project=${project}`");
    expect(runner).toContain(
      'assertBrowserModeProjectPassed(\n            report,\n            "tests/browser-mode/pixel7.browser.test.tsx"',
    );
    expect(runner).toContain("PIXEL7_BROWSER_MODE_FULL_NAMES");
  });

  it("validates the complete JSON report instead of selecting individual cases", () => {
    const validator = fs.readFileSync(
      path.join(root, "scripts/browser-mode-report-validation.mjs"),
      "utf8",
    );
    expect(runner).toContain('"--reporter=json"');
    expect(runner).toContain("`--outputFile.json=${reportPath}`");
    expect(runner).toContain("if (code === 0)");
    expect(validator).toContain("Expected exactly one Browser Mode test file");
    expect(validator).toContain("ran zero tests");
    expect(validator).toContain('assertion.status !== "passed"');
    expect(validator).toContain("manifest mismatch");
    expect(validator).toContain("Observed fullNames:");
    expect(runner).not.toContain("--selection-file");
    expect(runner).not.toContain("--testNamePattern");
    expect(runner).not.toContain("--only=phase6");
  });

  it("requires every migrated B12/B13 route test in the Pixel 7 report", () => {
    const source = fs.readFileSync(
      path.join(root, "tests/browser-mode/pixel7.browser.test.tsx"),
      "utf8",
    );
    const manifest = fs.readFileSync(
      path.join(root, "scripts/browser-mode-case-manifest.mjs"),
      "utf8",
    );
    const requiredCases = [
      "B12 #307: deliberately engineered actual link overlap is hit-tested by tooltip and blocks navigation",
      "B13 #473: outside-heading touch clears stacked chart cursor and active dots",
      "B13 #508: close touch clears stacked chart active dots",
      "B13 #535: close button is hidden after salary-tab touch and scroll settle",
    ];
    for (const title of requiredCases) {
      expect(manifest).toContain(title);
      expect(source).toContain(title);
    }
  });

  it("requires a source/config-matched production build before starting Next", () => {
    const fingerprint = fs.readFileSync(
      path.join(root, "scripts/browser-route-build-fingerprint.mjs"),
      "utf8",
    );
    expect(runner).toContain("await assertBrowserRouteBuildCurrent()");
    expect(fingerprint).toContain("browser-route-build-fingerprint.json");
    expect(fingerprint).toContain("sourceSha256");
    expect(fingerprint).toContain('"tsconfig.json"');
    expect(fingerprint).toContain('"public"');
    expect(fingerprint).toContain("browser-mode-case-manifest.mjs");
    expect(fingerprint).toContain("The production build does not match the current source");
  });

  it("preserves explicit JSON reports for orchestrator inspection", () => {
    expect(runner).toContain("BROWSER_MODE_REPORT_PATH");
    expect(runner).toContain("preserveBrowserModeReport");
  });

  it("keeps Next and Browser Mode API listeners on approved loopback ports", () => {
    expect(runner).toContain('const HOST = "127.0.0.1"');
    expect(runner).toContain("BROWSER_API_PORT_START = 63_000");
    expect(runner).toContain("BROWSER_API_PORT_END = 63_999");
    expect(runner).toContain(
      "NEXT_ROUTE_POC_PORT may only be set to the approved 127.0.0.1 port 3001.",
    );
    expect(runner).toContain("childEnv.VITEST_BROWSER_API_PORT = String(browserApiPort)");
  });

  it("bounds each Vitest run and preserves managed-server cleanup on every result", () => {
    expect(runner).toContain("DEFAULT_VITEST_TIMEOUT_MS = 15 * 60 * 1_000");
    expect(runner).toContain("NEXT_ROUTE_POC_VITEST_TIMEOUT_MS");
    expect(runner).toContain('signalChildGroup(child, "SIGTERM")');
    expect(runner).toContain('signalChildGroup(child, "SIGKILL")');
    expect(runner).toContain('process.on("SIGINT"');
    expect(runner).toContain('process.on("SIGTERM"');
    expect(runner).toContain("const finish = async (code) => {");
    expect(runner).toContain("await stopChild(server.child);");
    expect(runner).toContain("[browser-mode] Next server cleanup failed:");
    expect(runner).toContain("if (!primaryError) primaryError = cleanupError;");
  });
});
