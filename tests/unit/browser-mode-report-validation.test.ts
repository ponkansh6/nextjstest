import { describe, expect, it } from "vitest";
import {
  PIXEL7_BROWSER_MODE_FULL_NAMES,
  PIXEL7_REQUIRED_INTERACTION_FULL_NAMES,
  STANDARD_BROWSER_MODE_FULL_NAMES,
} from "../../scripts/browser-mode-case-manifest.mjs";
import { assertBrowserModeProjectPassed } from "../../scripts/browser-mode-report-validation.mjs";

function report(statuses: string[], fullNames = STANDARD_BROWSER_MODE_FULL_NAMES) {
  return {
    testResults: [
      {
        name: "/repo/tests/browser-mode/standard.browser.test.tsx",
        assertionResults: statuses.map((status, index) => ({ status, fullName: fullNames[index] })),
      },
    ],
  };
}

describe("complete Browser Mode report validation", () => {
  it("pins the independently maintained complete case counts", () => {
    expect(STANDARD_BROWSER_MODE_FULL_NAMES).toHaveLength(14);
    expect(new Set(STANDARD_BROWSER_MODE_FULL_NAMES).size).toBe(14);
    expect(PIXEL7_BROWSER_MODE_FULL_NAMES).toHaveLength(22);
    expect(new Set(PIXEL7_BROWSER_MODE_FULL_NAMES).size).toBe(22);
  });

  it("accepts the exact standard fullName manifest when every case passed", () => {
    expect(() =>
      assertBrowserModeProjectPassed(
        report(STANDARD_BROWSER_MODE_FULL_NAMES.map(() => "passed")),
        "tests/browser-mode/standard.browser.test.tsx",
        STANDARD_BROWSER_MODE_FULL_NAMES,
      ),
    ).not.toThrow();
  });

  it("requires the exact Pixel 7 manifest and each pinned interaction exactly once", () => {
    expect(() =>
      assertBrowserModeProjectPassed(
        {
          testResults: [
            {
              name: "/repo/tests/browser-mode/pixel7.browser.test.tsx",
              assertionResults: PIXEL7_BROWSER_MODE_FULL_NAMES.map((fullName) => ({
                fullName,
                status: "passed",
              })),
            },
          ],
        },
        "tests/browser-mode/pixel7.browser.test.tsx",
        PIXEL7_BROWSER_MODE_FULL_NAMES,
        PIXEL7_REQUIRED_INTERACTION_FULL_NAMES,
      ),
    ).not.toThrow();
    expect(() =>
      assertBrowserModeProjectPassed(
        {
          testResults: [
            {
              name: "/repo/tests/browser-mode/pixel7.browser.test.tsx",
              assertionResults: PIXEL7_BROWSER_MODE_FULL_NAMES.filter(
                (fullName) => !PIXEL7_REQUIRED_INTERACTION_FULL_NAMES.includes(fullName),
              ).map((fullName) => ({ fullName, status: "passed" })),
            },
          ],
        },
        "tests/browser-mode/pixel7.browser.test.tsx",
        PIXEL7_BROWSER_MODE_FULL_NAMES,
        PIXEL7_REQUIRED_INTERACTION_FULL_NAMES,
      ),
    ).toThrow("Missing:");
  });

  const rejectionCases: Array<{ label: string; statuses: string[] }> = [
    { label: "empty", statuses: [] },
    { label: "skipped", statuses: ["passed", "skipped"] },
    { label: "pending", statuses: ["pending"] },
    { label: "failed", statuses: ["failed"] },
  ];
  for (const { label, statuses } of rejectionCases) {
    it(`rejects ${label} project reports`, () => {
      const expected = STANDARD_BROWSER_MODE_FULL_NAMES.slice(0, statuses.length);
      expect(() =>
        assertBrowserModeProjectPassed(
          report(statuses, expected),
          "tests/browser-mode/standard.browser.test.tsx",
          expected,
        ),
      ).toThrow();
    });
  }

  it("rejects missing, unexpected, and duplicate case names even when counts match", () => {
    const expected = STANDARD_BROWSER_MODE_FULL_NAMES;
    const cases = expected.map((fullName) => ({ fullName, status: "passed" }));
    const withMissingAndUnexpected = [
      ...cases.slice(1),
      { fullName: "unlisted case", status: "passed" },
    ];
    expect(() =>
      assertBrowserModeProjectPassed(
        {
          testResults: [
            {
              name: "/repo/tests/browser-mode/standard.browser.test.tsx",
              assertionResults: withMissingAndUnexpected,
            },
          ],
        },
        "tests/browser-mode/standard.browser.test.tsx",
        expected,
      ),
    ).toThrow("manifest mismatch");

    const withDuplicate = [...cases.slice(1), cases[1]];
    expect(() =>
      assertBrowserModeProjectPassed(
        {
          testResults: [
            {
              name: "/repo/tests/browser-mode/standard.browser.test.tsx",
              assertionResults: withDuplicate,
            },
          ],
        },
        "tests/browser-mode/standard.browser.test.tsx",
        expected,
      ),
    ).toThrow("manifest mismatch");
  });

  it("rejects missing reports, missing files, and duplicate project files", () => {
    expect(() =>
      assertBrowserModeProjectPassed(null, "tests/browser-mode/standard.browser.test.tsx"),
    ).toThrow("no testResults array");
    expect(() =>
      assertBrowserModeProjectPassed(
        { testResults: [] },
        "tests/browser-mode/standard.browser.test.tsx",
        STANDARD_BROWSER_MODE_FULL_NAMES,
      ),
    ).toThrow("observed 0");
    expect(() =>
      assertBrowserModeProjectPassed(
        {
          testResults: [
            {
              name: "tests/browser-mode/standard.browser.test.tsx",
              assertionResults: [{ status: "passed" }],
            },
            {
              name: "tests/browser-mode/standard.browser.test.tsx",
              assertionResults: [{ status: "passed" }],
            },
          ],
        },
        "tests/browser-mode/standard.browser.test.tsx",
        STANDARD_BROWSER_MODE_FULL_NAMES,
      ),
    ).toThrow("observed 2");
    expect(() =>
      assertBrowserModeProjectPassed(
        {
          testResults: [
            {
              name: "tests/browser-mode/pixel7.browser.test.tsx",
              assertionResults: [{ status: "passed" }],
            },
          ],
        },
        "tests/browser-mode/standard.browser.test.tsx",
        STANDARD_BROWSER_MODE_FULL_NAMES,
      ),
    ).toThrow("Expected Browser Mode file");
  });
});
