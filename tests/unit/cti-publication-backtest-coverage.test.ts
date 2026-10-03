import { describe, expect, it } from "vitest";
import {
  CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR,
  CTI_ADJUSTED_BACKTEST_YEARS,
  CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY,
  buildCtiAdjustedRollingLooBacktest,
} from "../../server/lib/ctiAdjustedRollingBacktest";
import {
  CTI_ADJUSTED_INPUT_CATEGORIES,
  CTI_ADJUSTED_TOTAL_CATEGORY,
  type CtiAdjustedAnnualInput,
} from "../../server/lib/ctiAdjustedConnectionEstimate";
import {
  CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
  evaluateCtiAdjustedPublicationGate,
  type CtiAdjustedPublicationGateInput,
} from "../../server/lib/ctiAdjustedPublicationGate";

const fingerprint = "sha256:current-input";
const completeBacktest = {
  status: "pass",
  pass: true,
  allFoldsFinite: true,
  leakageFree: true,
};

const gate = (overrides: Partial<CtiAdjustedPublicationGateInput> = {}) =>
  evaluateCtiAdjustedPublicationGate({
    baseGate: { status: "pass", accepted: true, reasonCodes: [], blockingReasonCodes: [] },
    rollingLoo: { rolling: completeBacktest, loo: completeBacktest },
    evidenceSchema: CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
    evidenceInputFingerprint: fingerprint,
    expectedInputFingerprint: fingerprint,
    ...overrides,
  });

describe("CTI adjusted publication gate branch coverage", () => {
  it("fails closed for absent, partial, and malformed rolling/LOO evidence", () => {
    const missing = gate({
      rollingLoo: undefined,
      evidenceSchema: undefined,
      evidenceInputFingerprint: undefined,
    });
    expect(missing.accepted).toBe(false);
    expect(missing.evidence.inputFingerprint).toBeNull();
    expect(missing.evidence.reasonCodes).toEqual(
      expect.arrayContaining([
        "rolling_loo_evidence_schema_missing_or_invalid",
        "rolling_loo_evidence_missing",
        "rolling_loo_evidence_input_fingerprint_mismatch",
        "rolling_loo_backtest_incomplete",
      ]),
    );

    const partial = gate({
      rollingLoo: { rolling: completeBacktest, loo: { status: "pass", pass: true } },
      evidenceSchema: "wrong-schema",
      expectedInputFingerprint: "",
    });
    expect(partial.evidence.accepted).toBe(false);
    expect(partial.reasonCodes).toContain("rolling_loo_backtest_incomplete");
  });

  it("retains base blockers, filters non-string reasons, and reports invalid status", () => {
    const result = gate({
      baseGate: {
        status: "invalid",
        reasonCodes: ["base-warning", 1, null],
        blockingReasonCodes: ["base-blocker", false],
      },
      evidenceInputFingerprint: "stale-input",
    });

    expect(result.accepted).toBe(false);
    expect(result.status).toBe("invalid");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "base-warning",
        "rolling_loo_evidence_input_fingerprint_mismatch",
        "rolling_loo_backtest_incomplete",
      ]),
    );
    expect(result.blockingReasonCodes).toEqual(
      expect.arrayContaining([
        "base-blocker",
        "rolling_loo_evidence_input_fingerprint_mismatch",
        "rolling_loo_backtest_incomplete",
      ]),
    );
    expect(result.evidence.inputFingerprint).toBe("stale-input");
  });

  it("defaults missing base-gate data and filters non-array reason collections", () => {
    const result = gate({
      baseGate: {
        status: "invalid",
        reasonCodes: "not-an-array",
        blockingReasonCodes: null,
      },
    });

    expect(result.accepted).toBe(true);
    expect(result.status).toBe("pass");
    expect(result.reasonCodes).toEqual([]);
    expect(result.blockingReasonCodes).toEqual([]);

    const missingBase = gate({ baseGate: undefined, rollingLoo: undefined });
    expect(missingBase.status).toBe("insufficient-data");
    expect(missingBase.accepted).toBe(false);
  });

  it("removes stale backtest blockers when current evidence passes", () => {
    const result = gate({
      baseGate: {
        status: "pass",
        reasonCodes: ["rolling_loo_backtest_incomplete", "base-warning"],
        blockingReasonCodes: ["rolling_loo_backtest_incomplete"],
      },
    });

    expect(result.accepted).toBe(true);
    expect(result.status).toBe("pass");
    expect(result.reasonCodes).toEqual(["base-warning"]);
    expect(result.blockingReasonCodes).toEqual([]);
    expect(result.evidence).toMatchObject({ accepted: true, reasonCodes: [] });
  });

  it.each([
    ["status", { status: "fail", pass: true, allFoldsFinite: true, leakageFree: true }],
    ["pass flag", { status: "pass", pass: false, allFoldsFinite: true, leakageFree: true }],
    ["finite folds", { status: "pass", pass: true, allFoldsFinite: false, leakageFree: true }],
    ["leakage", { status: "pass", pass: true, allFoldsFinite: true, leakageFree: false }],
  ])("rejects evidence with a failed %s check", (_label, badEvidence) => {
    const result = gate({ rollingLoo: { rolling: badEvidence, loo: completeBacktest } });
    expect(result.evidence.accepted).toBe(false);
    expect(result.evidence.reasonCodes).toContain("rolling_loo_backtest_incomplete");
    expect(result.blockingReasonCodes).toContain("rolling_loo_backtest_incomplete");
  });
});

const metadata = (artifact: string) => ({
  source: "synthetic-test",
  artifact,
  retrievedAt: "2026-01-01T00:00:00.000Z",
  baseYear: 2020,
  unit: "index",
  valueType: "nominal",
  householdScope: "all",
  frequency: "annual",
  rawRange: { startYear: 2017, endYear: 2025 },
  adoptedRange: { startYear: 2017, endYear: 2025 },
  missingRepresentation: "null",
});

const makeInput = (
  artifact: string,
  value: (year: number, category: string) => number | null,
): CtiAdjustedAnnualInput => ({
  metadata: metadata(artifact),
  categoryOrder: [...CTI_ADJUSTED_INPUT_CATEGORIES],
  rows: [CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR, ...CTI_ADJUSTED_BACKTEST_YEARS].map((year) => ({
    year,
    values: Object.fromEntries(
      CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, value(year, category)]),
    ),
  })),
});

const realisticInputs = () => {
  const b = makeInput("B.csv", (year, category) => {
    const offset = year - CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR;
    return category === CTI_ADJUSTED_TOTAL_CATEGORY ? 100 + offset : 5;
  });
  const a = makeInput("A.csv", (year, category) => {
    const offset = year - CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR;
    const ratio = 1 + offset * 0.01;
    const bTotal = 100 + offset;
    const bValue = category === CTI_ADJUSTED_TOTAL_CATEGORY ? bTotal : 5;
    return bValue * ratio;
  });
  const l = makeInput("L.csv", () => 1);
  return { b, a, l };
};

describe("CTI adjusted rolling/LOO backtest branch coverage", () => {
  it("evaluates the fixed rolling and LOO windows with finite, leakage-free evidence", () => {
    const { b, a, l } = realisticInputs();
    const result = buildCtiAdjustedRollingLooBacktest(b, a, l);

    expect(result.years).toEqual(CTI_ADJUSTED_BACKTEST_YEARS);
    expect(result.rolling.status).toBe("pass");
    expect(result.loo.status).toBe("pass");
    expect(result.rolling.allFoldsFinite).toBe(true);
    expect(result.loo.leakageFree).toBe(true);
    expect(result.rolling.metrics.modelMae).toBeCloseTo(0, 10);
    expect(result.rolling.folds.every((fold) => fold.finite && fold.reason === null)).toBe(true);
    expect(result.loo.folds.every((fold) => !fold.trainYears.includes(fold.validationYear))).toBe(
      true,
    );
  });

  it("uses the default minimum for invalid options and exposes empty rolling windows", () => {
    const { b, a, l } = realisticInputs();
    const defaulted = buildCtiAdjustedRollingLooBacktest(b, a, l, { minimumTrainingYears: 2 });
    expect(defaulted.rolling.minimumTrainingYears).toBe(3);
    expect(defaulted.rolling.validationYears).toEqual([2021, 2022, 2023, 2024, 2025]);

    const empty = buildCtiAdjustedRollingLooBacktest(b, a, l, { minimumTrainingYears: 100 });
    expect(empty.rolling.status).toBe("insufficient-data");
    expect(empty.rolling.folds).toEqual([]);
    expect(empty.rolling.metrics).toEqual({
      modelMae: null,
      baselineMae: null,
      maxAbsoluteError: null,
      bias: null,
      evaluatedFolds: 0,
    });
    expect(empty.rolling.leakageFree).toBe(true);
    expect(empty.rolling.reason).toBe("one_or_more_folds_not_evaluable");
  });

  it("marks folds insufficient when training is too short", () => {
    const { b, a, l } = realisticInputs();
    const result = buildCtiAdjustedRollingLooBacktest(b, a, l, { minimumTrainingYears: 8 });
    expect(
      result.rolling.folds.every((fold) => fold.reason === "minimum_training_years_not_met"),
    ).toBe(true);
    expect(result.loo.folds[0]?.reason).toBe("minimum_training_years_not_met");
    expect(result.loo.folds.every((fold) => fold.status === "insufficient-data")).toBe(true);
  });

  it("handles missing rows, missing categories, invalid residuals, and non-finite inputs", () => {
    const { b, a, l } = realisticInputs();
    const missingAnchor = {
      ...b,
      rows: b.rows.filter((row) => row.year !== CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR),
    };
    const anchorMissingResult = buildCtiAdjustedRollingLooBacktest(missingAnchor, a, l);
    expect(anchorMissingResult.rolling.status).toBe("insufficient-data");
    expect(anchorMissingResult.rolling.folds[0]?.other.predicted).toBeNull();

    const missingValidation = {
      ...a,
      rows: a.rows.filter((row) => row.year !== 2021),
    };
    const missingValidationResult = buildCtiAdjustedRollingLooBacktest(b, missingValidation, l);
    expect(missingValidationResult.rolling.folds[0]?.reason).toBe(
      "non_finite_or_missing_other_value",
    );

    const noOther = {
      ...b,
      rows: b.rows.map((row) =>
        row.year === 2017
          ? { ...row, values: { ...row.values, [CTI_ADJUSTED_TOTAL_CATEGORY]: 45 } }
          : row,
      ),
    };
    const invalidOtherResult = buildCtiAdjustedRollingLooBacktest(noOther, a, l);
    expect(invalidOtherResult.rolling.folds[0]?.other.predicted).toBeNull();
    expect(invalidOtherResult.rolling.status).toBe("insufficient-data");

    const missingCategory = {
      ...a,
      rows: a.rows.map((row) =>
        row.year === 2021 ? { ...row, values: { ...row.values, 食料: null } } : row,
      ),
    };
    const missingCategoryResult = buildCtiAdjustedRollingLooBacktest(b, missingCategory, l);
    expect(missingCategoryResult.rolling.folds[0]?.other.observed).toBeNull();
    expect(missingCategoryResult.rolling.folds[0]?.reason).toBe(
      "non_finite_or_missing_other_value",
    );

    const nonFinite = {
      ...a,
      rows: a.rows.map((row) =>
        row.year === 2022
          ? {
              ...row,
              values: {
                ...row.values,
                [CTI_ADJUSTED_TOTAL_CATEGORY]: Number.POSITIVE_INFINITY,
              },
            }
          : row,
      ),
    };
    const nonFiniteResult = buildCtiAdjustedRollingLooBacktest(b, nonFinite, l);
    expect(nonFiniteResult.loo.folds.some((fold) => !fold.finite)).toBe(true);

    const noBaselineHistory = {
      ...a,
      rows: a.rows.filter((row) => row.year >= 2021),
    };
    const noBaselineResult = buildCtiAdjustedRollingLooBacktest(b, noBaselineHistory, l);
    expect(noBaselineResult.rolling.folds[0]?.other.baselinePredicted).toBeNull();
  });

  it("keeps zero-variation fits unavailable and rejects finite model errors worse than baseline", () => {
    const constantB = makeInput("B-constant.csv", (_year, category) =>
      category === CTI_ADJUSTED_TOTAL_CATEGORY ? 100 : 5,
    );
    const constantA = makeInput("A-constant.csv", (_year, category) =>
      category === CTI_ADJUSTED_TOTAL_CATEGORY ? 100 : 5,
    );
    const constant = buildCtiAdjustedRollingLooBacktest(constantB, constantA, constantA);
    expect(constant.rolling.folds[0]?.beta[CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY]).toBeNull();
    expect(constant.rolling.folds[0]?.reason).toBe("non_finite_or_missing_other_value");

    const b = makeInput("B-flat.csv", (_year, category) =>
      category === CTI_ADJUSTED_TOTAL_CATEGORY ? 100 : 5,
    );
    const a = makeInput("A-baseline-wins.csv", (year, category) => {
      if (category === CTI_ADJUSTED_TOTAL_CATEGORY) return year === 2017 ? 111 : 105;
      return 5;
    });
    const worse = buildCtiAdjustedRollingLooBacktest(b, a, a);
    expect(worse.loo.status).toBe("fail");
    expect(worse.loo.reason).toBe("model_mae_exceeds_baseline_mae");
    expect(worse.loo.metrics.modelMae).not.toBeNull();
    expect(worse.loo.metrics.baselineMae).not.toBeNull();
  });
});
