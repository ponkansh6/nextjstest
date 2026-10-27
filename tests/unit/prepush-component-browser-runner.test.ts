import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  PIXEL7_BROWSER_MODE_FULL_NAMES,
  STANDARD_BROWSER_MODE_FULL_NAMES,
} from "../../scripts/browser-mode-case-manifest.mjs";

const root = process.cwd();

describe("active viewport-specific Browser Mode suites", () => {
  const config = fs.readFileSync(
    path.join(root, "tests/config/browser/vitest.browser.config.ts"),
    "utf8",
  );
  const runner = fs.readFileSync(path.join(root, "scripts/run-browser-mode-project.mjs"), "utf8");

  it("keeps each project mapped to its canonical active test file", () => {
    const standardFile = "tests/browser-mode/standard.browser.test.tsx";
    const pixel7File = "tests/browser-mode/pixel7.browser.test.tsx";
    expect(fs.existsSync(path.join(root, standardFile))).toBe(true);
    expect(fs.existsSync(path.join(root, pixel7File))).toBe(true);
    expect(config).toContain('name: "standard"');
    expect(config).toContain(`include: ["${standardFile}"]`);
    expect(config).toContain('name: "pixel7"');
    expect(config).toContain(`include: ["${pixel7File}"]`);
    expect(runner).toContain(`file: "${standardFile}"`);
    expect(runner).toContain(`file: "${pixel7File}"`);
    expect(runner).toContain("STANDARD_BROWSER_MODE_FULL_NAMES");
    expect(runner).toContain("PIXEL7_BROWSER_MODE_FULL_NAMES");
    expect(runner).toContain("PROJECTS[project].requiredFullNames");
    expect(STANDARD_BROWSER_MODE_FULL_NAMES).toHaveLength(14);
    expect(PIXEL7_BROWSER_MODE_FULL_NAMES).toHaveLength(22);
  });
});
