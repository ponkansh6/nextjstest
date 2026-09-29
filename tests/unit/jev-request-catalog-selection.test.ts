import { describe, expect, it } from "vitest";
import { validateCatalogSelectionRequest } from "../../skills/jev-review/scripts/catalog-selection-request.mjs";

type SelectorQuestion = {
  type: string;
  instructions: string;
  criteria: Record<string, string>;
};

type SelectorRequest = {
  model: string;
  state: {
    evaluationScope: string;
    changedPaths: string[];
    catalogChunk: string;
    candidateCount: number;
    outputRequirement: string;
  };
  questions: Record<string, SelectorQuestion>;
};

const makeRequest = (): SelectorRequest => ({
  model: "jev-latest",
  state: {
    evaluationScope: "select_browser_tests",
    changedPaths: ["src/chart.ts"],
    catalogChunk: "1/1",
    candidateCount: 2,
    outputRequirement: "Answer every listed question exactly once.",
  },
  questions: {
    "0123456789abcdef": {
      type: "choice",
      instructions: "Select whether this exact browser test should run.",
      criteria: { run: "Run this test.", skip: "Skip this test." },
    },
    fedcba9876543210: {
      type: "choice",
      instructions: "Select whether this exact browser test should run.",
      criteria: { run: "Run this test.", skip: "Skip this test." },
    },
  },
});

describe("JEV browser catalog selection request validation", () => {
  it("accepts a finite multi-question run/skip payload", () => {
    expect(validateCatalogSelectionRequest(makeRequest())).toEqual([
      "0123456789abcdef",
      "fedcba9876543210",
    ]);
  });

  it("rejects a different evaluation scope", () => {
    const request = makeRequest();
    request.state.evaluationScope = "review_implementation";
    expect(() => validateCatalogSelectionRequest(request)).toThrow(
      /evaluationScope must be select_browser_tests/,
    );
  });

  it("rejects zero or out-of-range catalog chunks", () => {
    const request = makeRequest();
    request.state.catalogChunk = "0/1";
    expect(() => validateCatalogSelectionRequest(request)).toThrow(/within the range 1..count/);

    request.state.catalogChunk = "2/1";
    expect(() => validateCatalogSelectionRequest(request)).toThrow(/within the range 1..count/);
  });

  it("rejects malformed test IDs", () => {
    const request = makeRequest();
    request.questions.invalid = request.questions["0123456789abcdef"];
    delete request.questions["0123456789abcdef"];
    expect(() => validateCatalogSelectionRequest(request)).toThrow(/invalid test ID shape/);
  });

  it("rejects unknown choices", () => {
    const request = makeRequest();
    request.questions["0123456789abcdef"].criteria.other = "Run something else.";
    expect(() => validateCatalogSelectionRequest(request)).toThrow(/exactly run and skip/);
  });

  it("rejects nonbinary choice sets", () => {
    const request = makeRequest();
    request.questions["0123456789abcdef"].criteria = { run: "Run this test." };
    expect(() => validateCatalogSelectionRequest(request)).toThrow(/exactly run and skip/);
  });
});
