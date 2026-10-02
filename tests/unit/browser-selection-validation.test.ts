import { describe, expect, it } from "vitest";
import { assertSelectedBrowserCasesPassed } from "../../scripts/browser-selection-validation.mjs";

function report(...assertions: Array<{ fullName: string; status: string }>) {
  return {
    testResults: [{ assertionResults: assertions }],
  };
}

describe("fixed Browser Mode selection result validation", () => {
  it("accepts every expected case exactly once when all passed", () => {
    expect(() =>
      assertSelectedBrowserCasesPassed(
        report({ fullName: "case A", status: "passed" }, { fullName: "case B", status: "passed" }),
        ["case A", "case B"],
      ),
    ).not.toThrow();
  });

  it("rejects an empty result set", () => {
    expect(() => assertSelectedBrowserCasesPassed(report(), ["case A"])).toThrow(
      "Expected 1 selected tests, observed 0.",
    );
  });

  it("rejects a missing or malformed Vitest result", () => {
    expect(() => assertSelectedBrowserCasesPassed({}, ["case A"])).toThrow(
      "Vitest JSON report has no testResults array.",
    );
  });

  it("rejects duplicate output for one case even when another expected case is missing", () => {
    expect(() =>
      assertSelectedBrowserCasesPassed(
        report({ fullName: "case A", status: "passed" }, { fullName: "case A", status: "passed" }),
        ["case A", "case B"],
      ),
    ).toThrow('Expected exactly one result for "case A", observed 2.');
  });

  it("rejects a selected test that failed", () => {
    expect(() =>
      assertSelectedBrowserCasesPassed(report({ fullName: "case A", status: "failed" }), [
        "case A",
      ]),
    ).toThrow('Selected browser test did not pass: "case A" (failed).');
  });
});
