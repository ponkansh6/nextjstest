import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();

describe("pre-push component Browser Mode selection runner", () => {
  it("fails closed when the fixed component selection does not execute exactly the selected test", () => {
    const runner = fs.readFileSync(
      path.join(root, "scripts/run-prepush-component-browser.mjs"),
      "utf8",
    );

    expect(runner).toContain("assertSelectedBrowserCasesPassed(report, [selectedName])");
    expect(runner).toContain("if (result.status !== 0) process.exitCode = result.status ?? 1;");
    expect(runner).toContain("[browser-mode] component pre-push selection verification failed:");
    expect(runner).toContain("process.exitCode = 1;");
    expect(runner).toContain('"--testNamePattern"');
    expect(runner).toContain('"--reporter=json"');
    expect(runner).toContain("escapeRegexLiteral");
    expect(runner).toContain("`^${escapeRegexLiteral(selectedName)}$`");
    expect(runner).toContain("if (process.exitCode && retainedReportPath)");
    expect(runner).toContain('"component-report.json"');
    expect(runner).toContain("writeFileSync(retainedReportPath");
    expect(runner).toContain("rmSync(tempDirectory, { recursive: true, force: true })");
  });

  it("keeps the selected component case present in its browser test file", () => {
    const runner = fs.readFileSync(
      path.join(root, "scripts/run-prepush-component-browser.mjs"),
      "utf8",
    );

    const fileMatch = runner.match(/const selectedFile =\s*"([^"]+)"/);
    const nameMatch = runner.match(/const selectedName =\s*\n?\s*"([^"]+)"/);

    expect(fileMatch).toBeDefined();
    expect(fileMatch![1]).toBeDefined();

    expect(nameMatch).toBeDefined();
    expect(nameMatch![1]).toBeDefined();

    const selectedFile = fileMatch![1];
    const selectedName = nameMatch![1];

    const targetPath = path.join(root, selectedFile);
    expect(fs.existsSync(targetPath)).toBe(true);

    const targetContent = fs.readFileSync(targetPath, "utf8");
    const describeMatch = targetContent.match(/describe\("([^"]+)"/);
    const itMatch = targetContent.match(/\bit\("([^"]+)"/);

    expect(describeMatch).toBeDefined();
    expect(itMatch).toBeDefined();
    expect(`${describeMatch![1]} ${itMatch![1]}`).toBe(selectedName);
  });
});
