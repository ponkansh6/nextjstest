import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();

describe("production Browser Mode aggregate runner", () => {
  it("uses two browser launches: combined Chromium, then WebKit", () => {
    const runner = fs.readFileSync(path.join(root, "scripts/run-next-route-poc.mjs"), "utf8");
    const allConfigs = runner.match(/all:\s*\[([\s\S]*?)\]/)?.[1];

    expect(allConfigs).toBeDefined();
    expect([...allConfigs!.matchAll(/"([^"]+\.config\.ts)"/g)].map((match) => match[1])).toEqual([
      "vitest.browser.aggregate-chromium.config.ts",
      "vitest.browser.webkit.config.ts",
    ]);
  });

  it("adds unique per-config Vitest JSON profiles only when requested", () => {
    const runner = fs.readFileSync(path.join(root, "scripts/run-next-route-poc.mjs"), "utf8");

    expect(runner).toContain('args.includes("--profile-json")');
    expect(runner).toContain('"results", "plan45", "phase6", `profile-${runId}`');
    expect(runner).toContain('`${path.basename(config, ".config.ts")}.json`');
    const profileArgsStart = runner.indexOf("if (profileJsonPath)");
    const childSpawnStart = runner.indexOf("const child = spawnManaged", profileArgsStart);
    const profileArgsBlock = runner.slice(profileArgsStart, childSpawnStart);
    expect(profileArgsStart).toBeGreaterThanOrEqual(0);
    expect(childSpawnStart).toBeGreaterThan(profileArgsStart);
    expect(profileArgsBlock).toContain('"--reporter=default"');
    expect(profileArgsBlock).toContain('"--reporter=json"');
    expect(profileArgsBlock).toContain("`--outputFile.json=${profileJsonPath}`");
    expect(runner).toContain("randomUUID()");
    expect(runner).toContain("JSON profile ${config} -> ${profileJsonPath}");
  });

  it("fails closed when a fixed selection runs zero, missing, or duplicate test results", () => {
    const runner = fs.readFileSync(path.join(root, "scripts/run-next-route-poc.mjs"), "utf8");
    const validator = fs.readFileSync(
      path.join(root, "scripts/browser-selection-validation.mjs"),
      "utf8",
    );

    expect(runner).toContain("Object.keys(selection).length === 0");
    expect(runner).toContain("assertSelectedBrowserCasesPassed(report, selectedFile.names)");
    expect(runner).toContain('"--reporter=default"');
    expect(runner).toContain('"--reporter=json"');
    expect(runner).toContain("if (code === 0 && selectedFile && selectionResultPath)");
    expect(validator).toContain("Expected exactly one result for");
    expect(validator).toContain("Selected browser test did not pass");
  });

  it("keeps all Chromium files in Phase6 then production-route order", () => {
    const config = fs.readFileSync(
      path.join(root, "vitest.browser.aggregate-chromium.config.ts"),
      "utf8",
    );
    const includedFiles = config.match(/include:\s*\[([\s\S]*?)\],\s*exclude:/)?.[1];

    expect(includedFiles).toBeDefined();
    expect(
      [...includedFiles!.matchAll(/"(tests\/browser-mode\/[^"]+\.test\.ts)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "tests/browser-mode/phase6-b01-cagr-contrast.browser.test.ts",
      "tests/browser-mode/phase6-b02-real-legend-contrast.browser.test.ts",
      "tests/browser-mode/phase6-b03-advanced-series.browser.test.ts",
      "tests/browser-mode/phase6-b04-parity.browser.test.ts",
      "tests/browser-mode/phase6-b05-parity.browser.test.ts",
      "tests/browser-mode/phase6-b06-quarterly.browser.test.ts",
      "tests/browser-mode/phase6-b07-real-consumption.browser.test.ts",
      "tests/browser-mode/phase6-b08-real-consumption.browser.test.ts",
      "tests/browser-mode/phase6-b09-real-consumption.browser.test.ts",
      "tests/browser-mode/phase6-b10-tooltip-dismiss.browser.test.ts",
      "tests/browser-mode/phase6-b11-tooltip-dismiss.browser.test.ts",
      "tests/browser-mode/phase6-b12-chartnote-tooltip.browser.test.ts",
      "tests/browser-mode/phase6-b13-tooltip-dismiss.browser.test.ts",
      "tests/browser-mode/phase6-b14-residual-accessibility.browser.test.ts",
      "tests/browser-mode/next-route-poc.browser.test.ts",
      "tests/browser-mode/batch1-production-route.browser.test.ts",
      "tests/browser-mode/batch3-a-production-route.browser.test.ts",
      "tests/browser-mode/batch3-b-production-route.browser.test.ts",
      "tests/browser-mode/batch4-a-production-route.browser.test.ts",
      "tests/browser-mode/batch4-b-production-route.browser.test.ts",
      "tests/browser-mode/batch5-standard-chromium-production-route.browser.test.ts",
      "tests/browser-mode/batch5-lazy-tabs-chromium-production-route.browser.test.ts",
    ]);
    expect(config).toContain('setupFiles: ["tests/browser-mode/setup.ts"]');
    expect(config).toContain("fileParallelism: false");
    expect(config).toContain("maxWorkers: 1");
    expect(config).toContain("isolate: true");
    expect(config).toContain("testTimeout: 90_000");
    expect(config).toContain("hookTimeout: 90_000");
    expect(config).toContain('browser: "chromium"');
    expect(config).toContain("width: 1280, height: 800");
    expect(config).toContain("sequence: { sequencer: AggregateChromiumSequencer }");
    expect(config.match(/\binspectPhase5Rendering,/g)).toHaveLength(1);
    expect(config).not.toMatch(/\binspectBatch2ProductionCase,/);
  });

  it("uses run-local strict Browser API ports only for the full aggregate configs", () => {
    const runner = fs.readFileSync(path.join(root, "scripts/run-next-route-poc.mjs"), "utf8");
    expect(runner).toContain("BROWSER_API_PORT_START = 63_000");
    expect(runner).toContain("BROWSER_API_PORT_END = 63_999");
    expect(runner).toContain("allocateRunLocalBrowserApiPorts(configs)");
    const runVitestStart = runner.indexOf("async function runVitest(");
    const profileOutputsStart = runner.indexOf("const profileOutputs", runVitestStart);
    const browserApiPortSetup = runner.slice(runVitestStart, profileOutputsStart);
    expect(runVitestStart).toBeGreaterThanOrEqual(0);
    expect(profileOutputsStart).toBeGreaterThan(runVitestStart);
    expect(browserApiPortSetup).toContain("configs.length > 1");
    expect(browserApiPortSetup).toContain("allocateRunLocalBrowserApiPorts(configs)");
    expect(runner).toMatch(
      /runVitestConfig\(\s*port,\s*config,\s*timeoutMs,\s*browserApiPorts\[index\],\s*profileJsonPath,\s*selectedFile\s*,?\s*\)/,
    );
    expect(runner).toContain("const shutdownController = new AbortController()");
    expect(runner).toContain("shutdownController.abort(signal)");
    expect(runner).toContain("throwIfInterrupted()");
    expect(runner).toContain("delete childEnv.NEXT_ROUTE_POC_BROWSER_API_PORT");
    expect(runner).toContain("if (browserApiPort !== undefined)");
    expect(runner).toContain("childEnv.NEXT_ROUTE_POC_BROWSER_API_PORT = String(browserApiPort)");

    for (const file of [
      "vitest.browser.aggregate-chromium.config.ts",
      "vitest.browser.webkit.config.ts",
    ]) {
      const config = fs.readFileSync(path.join(root, file), "utf8");
      expect(config).toContain("process.env.NEXT_ROUTE_POC_BROWSER_API_PORT ?? 63315");
      expect(config).toContain("strictPort: hasRunLocalBrowserApiPort");
    }

    const focusedConfig = fs.readFileSync(
      path.join(root, "vitest.browser.next-route.config.ts"),
      "utf8",
    );
    expect(focusedConfig).not.toContain("63422");
  });

  it("bounds each Vitest run and escalates process-group cleanup on timeout or signals", () => {
    const runner = fs.readFileSync(path.join(root, "scripts/run-next-route-poc.mjs"), "utf8");
    expect(runner).toContain("DEFAULT_VITEST_TIMEOUT_MS = 15 * 60 * 1_000");
    expect(runner).toContain("NEXT_ROUTE_POC_VITEST_TIMEOUT_MS");
    expect(runner).toContain('signalChildGroup(child, "SIGTERM")');
    expect(runner).toContain('signalChildGroup(child, "SIGKILL")');
    expect(runner).toContain('process.on("SIGINT"');
    expect(runner).toContain('process.on("SIGTERM"');
  });
});
