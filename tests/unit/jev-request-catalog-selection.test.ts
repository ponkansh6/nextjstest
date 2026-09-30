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
    diffContext: {
      completeness: "complete" | "incomplete";
      source: "pre_push_oid_ranges" | "head_to_worktree_and_untracked";
      limits: Record<string, number>;
      summary: {
        files: Array<Record<string, unknown>>;
        fileCount: number;
        changedPathCount: number;
        omittedChangedPathCount: number;
        omittedFileCount: number;
        sensitiveOmittedFileCount: number;
        addedLines: number;
        deletedLines: number;
        unknownLineCountFileCount: number;
        reasons: string[];
        truncated: boolean;
        truncatedFileCount: number;
      };
      files: Array<{ path: string; diff: string; truncated: boolean; redactionApplied: boolean }>;
      omittedFiles: Array<Record<string, unknown>>;
      omissionReasons: string[];
      detectedPathCount: number;
      explicitPathCount: number;
      diffFileCount: number;
      diffByteCount: number;
    };
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
    diffContext: {
      completeness: "complete",
      source: "head_to_worktree_and_untracked",
      limits: {
        maxFiles: 20,
        maxDiffFilePathBytes: 512,
        maxBytesPerFile: 4096,
        maxTotalBytes: 16384,
        maxSummaryFiles: 40,
        maxSummaryBytes: 4096,
        maxChangedPaths: 256,
        maxChangedPathBytes: 512,
        maxChangedPathTotalBytes: 16384,
        maxOmittedFiles: 64,
        maxOmittedPathBytes: 512,
        maxOmittedPathTotalBytes: 8192,
      },
      summary: {
        files: [],
        fileCount: 1,
        changedPathCount: 1,
        omittedChangedPathCount: 0,
        omittedFileCount: 0,
        sensitiveOmittedFileCount: 0,
        addedLines: 1,
        deletedLines: 0,
        unknownLineCountFileCount: 0,
        reasons: [],
        truncated: false,
        truncatedFileCount: 0,
      },
      files: [
        {
          path: "src/chart.ts",
          diff: "+export {}\n",
          truncated: false,
          redactionApplied: false,
        },
      ],
      omittedFiles: [],
      omissionReasons: [],
      detectedPathCount: 1,
      explicitPathCount: 0,
      diffFileCount: 1,
      diffByteCount: Buffer.byteLength("+export {}\n", "utf8"),
    },
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

  it("rejects missing or malformed bounded diff context", () => {
    const missing = makeRequest();
    delete (missing.state as Partial<SelectorRequest["state"]>).diffContext;
    expect(() => validateCatalogSelectionRequest(missing)).toThrow(/diffContext must be an object/);

    const malformed = makeRequest();
    malformed.state.diffContext.completeness = "incomplete";
    expect(() => validateCatalogSelectionRequest(malformed)).toThrow(
      /completeness disagrees with omission reasons/,
    );
  });

  it("rejects sensitive paths from changed paths, diff files, summaries, and omissions", () => {
    const changedPath = makeRequest();
    changedPath.state.changedPaths = ["api-token.json"];
    expect(() => validateCatalogSelectionRequest(changedPath)).toThrow(/changedPaths exceeds/);

    const diffPath = makeRequest();
    diffPath.state.diffContext.files[0].path = "secrets/jev-token.json";
    expect(() => validateCatalogSelectionRequest(diffPath)).toThrow(/invalid file path/);

    const request = makeRequest();
    request.state.diffContext.summary.files = [
      {
        path: ".env.local",
        status: "modified",
        addedLines: 1,
        deletedLines: 0,
        reasons: ["diff excerpt truncated by size limit"],
      },
    ];
    expect(() => validateCatalogSelectionRequest(request)).toThrow(
      /summary contains an invalid file entry/,
    );

    const omittedPath = makeRequest();
    omittedPath.state.diffContext.omittedFiles = [
      { path: "keys/private.pem", reason: "unsupported_file_type" },
    ];
    expect(() => validateCatalogSelectionRequest(omittedPath)).toThrow(
      /counts or omissions are invalid/,
    );
  });

  it("rejects unsafe and oversized repository paths in every path-bearing field", () => {
    const changedPath = makeRequest();
    changedPath.state.changedPaths = ["../outside.ts"];
    expect(() => validateCatalogSelectionRequest(changedPath)).toThrow(/changedPaths exceeds/);

    const diffPath = makeRequest();
    diffPath.state.diffContext.files[0].path = "src/" + "x".repeat(510) + ".ts";
    expect(() => validateCatalogSelectionRequest(diffPath)).toThrow(/invalid file path/);

    const summaryPath = makeRequest();
    summaryPath.state.diffContext.summary.files = [
      {
        path: "src\\chart.ts",
        status: "modified",
        addedLines: 1,
        deletedLines: 0,
        reasons: ["changed"],
      },
    ];
    expect(() => validateCatalogSelectionRequest(summaryPath)).toThrow(
      /summary contains an invalid file entry/,
    );

    const omittedPath = makeRequest();
    omittedPath.state.diffContext.omittedFiles = [
      { path: "/tmp/chart.ts", reason: "unsupported_file_type" },
    ];
    expect(() => validateCatalogSelectionRequest(omittedPath)).toThrow(
      /counts or omissions are invalid/,
    );
  });

  it("rejects unknown diff file metadata fields", () => {
    const request = makeRequest();
    (
      request.state.diffContext
        .files[0] as SelectorRequest["state"]["diffContext"]["files"][number] & { source?: string }
    ).source = "worktree";
    expect(() => validateCatalogSelectionRequest(request)).toThrow(/invalid file entry/);
  });

  it("rejects diff byte limit violations and inconsistent file metadata", () => {
    const oversized = makeRequest();
    oversized.state.diffContext.files[0].diff = "x".repeat(4097);
    oversized.state.diffContext.diffByteCount = 4097;
    expect(() => validateCatalogSelectionRequest(oversized)).toThrow(/file exceeds its size limit/);

    const inconsistent = makeRequest();
    inconsistent.state.diffContext.diffFileCount = 0;
    expect(() => validateCatalogSelectionRequest(inconsistent)).toThrow(
      /counts or omissions are invalid/,
    );
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
