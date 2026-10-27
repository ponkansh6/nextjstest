import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { preserveBrowserModeReport } from "../../scripts/browser-mode-report-output.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("explicit Browser Mode report retention", () => {
  it("copies a complete report to an explicit OS temporary path", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "browser-mode-report-output-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "source.json");
    const destination = path.join(directory, "retained", "vitest-report.json");
    const report = JSON.stringify({ testResults: [{ name: "standard.browser.test.tsx" }] });
    await writeFile(source, report, "utf8");

    await expect(preserveBrowserModeReport(source, destination)).resolves.toBe(destination);
    await expect(readFile(destination, "utf8")).resolves.toBe(report);
  });

  it("rejects report destinations outside the repository and OS temporary directory", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "browser-mode-report-output-"));
    temporaryDirectories.push(directory);
    const source = path.join(directory, "source.json");
    await writeFile(source, "{}", "utf8");

    await expect(
      preserveBrowserModeReport(source, "/etc/browser-mode-report.json"),
    ).rejects.toThrow("inside the repository or OS temporary directory");
  });
});
