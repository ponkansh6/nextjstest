import {
  buildCtiAdjustedConnectionEstimate,
  CTI_ADJUSTED_DEFAULT_RESIDUAL_JUMP_THRESHOLD,
  CTI_ADJUSTED_INPUT_CATEGORIES,
  CTI_ADJUSTED_MAJOR_CATEGORIES,
  CTI_ADJUSTED_OUTPUT_CATEGORIES,
  type CtiAdjustedAnnualInput,
} from "@server/lib/ctiAdjustedConnectionEstimate";
import { buildCtiAdjustedSensitivityAnalysis } from "@server/lib/ctiAdjustedSensitivity";

const metadata = (artifact: string) => ({
  source: "synthetic-test",
  artifact,
  retrievedAt: "2026-01-01T00:00:00.000Z",
  artifactIdentifier: `synthetic:${artifact}`,
  officialPageUrl: `https://example.test/${artifact}`,
  downloadUrl: `https://example.test/download/${artifact}`,
  statisticsId: "stats-39",
  tableId: "table-39",
  statInfId: "statinf-39",
  revision: "r1",
  schemaVersion: "fixture-v1",
  sha256: null,
  hashReason: "synthetic fixture has no source hash",
  yearization: "calendar_year",
  baseYear: 2025,
  unit: "円",
  valueType: "amount",
  householdScope: "二人以上の世帯",
  frequency: "annual" as const,
  rawRange: { startYear: 2005, endYear: 2025 },
  adoptedRange: { startYear: 2005, endYear: 2025 },
  missingRepresentation: "null",
});

const makeInput = (
  artifact: string,
  years: number[],
  value: (year: number, category: string) => number,
  includeResidual = false,
): CtiAdjustedAnnualInput => ({
  metadata: metadata(artifact),
  categoryOrder: includeResidual
    ? [...CTI_ADJUSTED_INPUT_CATEGORIES, "残差"]
    : [...CTI_ADJUSTED_INPUT_CATEGORIES],
  rows: years.map((year) => ({
    year,
    values: {
      ...Object.fromEntries(
        CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, value(year, category)]),
      ),
      ...(includeResidual ? { 残差: value(year, "残差") } : {}),
    },
  })),
});

function fixture(withoutL = false) {
  const years = Array.from({ length: 21 }, (_, index) => 2005 + index);
  const b = makeInput("B.csv", years, (year, category) =>
    category === "総合" ? 100 + year - 2005 : 10,
  );
  const a = makeInput(
    "A.csv",
    years,
    (year, category) =>
      category === "総合"
        ? 100 + (year - 2005) * 1.5
        : category === "残差"
          ? 7
          : 10 + (year - 2005) / 10,
    true,
  );
  const l: CtiAdjustedAnnualInput | null = withoutL
    ? null
    : {
        metadata: metadata("L.csv"),
        rows: years.map((year) => ({ year, values: { 総合: 100 + (year - 2005) * 2 } })),
      };
  return { b, a, l };
}

describe("buildCtiAdjustedConnectionEstimate", () => {
  it("uses the provisional Plan39 residual jump threshold by default", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);

    expect(CTI_ADJUSTED_DEFAULT_RESIDUAL_JUMP_THRESHOLD).toBe(1.4);
    expect(result.audit.residualJumpThreshold).toBe(1.4);
  });
  it("uses total/category log ratios from official overlap years for beta", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.status).toBe("available");
    expect(result.audit.formulaVersion).toBe("ratio-log-beta-v1");
    expect(result.audit.betaTrainingYears).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(result.audit.betaTrainingYears).not.toContain(2017);
    expect(result.audit.betaCalibrationYears).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(result.audit.betaTargetYear).toBe(2017);
    expect(result.audit.ratios[2017].total).toBeCloseTo(118 / 112);
    expect(result.audit.beta["食料"].value).not.toBeNull();
    expect(result.audit.d.baselineYear).toBe(2017);
    expect(result.audit.backtest.trainingYears).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(result.audit.backtest.targetYear).toBe(2017);
    expect(result.audit.backtest.status).toBe("available");
    expect(result.rows.find((row) => row.year === 2017)?.seriesType).toBe("official_adjusted");
    expect(result.rows.find((row) => row.year === 2010)?.seriesType).toBe("estimated_adjusted");
  });

  it("excludes holdout years from beta without falsely recording leakage", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l, { holdoutYears: [2018] });
    expect(result.audit.holdoutLeakage).toEqual({
      detected: false,
      years: [],
      excludedYears: [2018],
      removedFromTrainingYears: [2018],
      reason: null,
    });
    expect(result.audit.betaExcludedYears).toEqual([2018]);
    expect(result.audit.betaTrainingYears).not.toContain(2018);
  });

  it("preserves every official A value, including non-additive residual", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    const official = result.rows.find((row) => row.year === 2017)!;
    expect(official.values["残差"]).toBe(7);
    expect(result.audit.officialPreservation[2017].exact).toBe(true);
    expect(result.audit.officialAdditivity[2017].additive).toBe(false);
  });

  it("keeps valid official rows when L is absent and makes estimates unavailable", () => {
    const { b, a } = fixture(true);
    const result = buildCtiAdjustedConnectionEstimate(b, a, null);
    expect(result.audit.validation.status).toBe("unavailable");
    expect(result.rows.find((row) => row.year === 2010)?.status).toBe("unavailable");
    expect(result.rows.find((row) => row.year === 2017)?.values["総合"]).toBe(118);
  });

  it("does not treat L with only total as an unknown-category violation", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(
      result.audit.validation.issues.filter(
        (issue) => issue.input === "L" && issue.code === "unknown_category",
      ),
    ).toHaveLength(0);
  });

  it("ignores L's nine major-category columns and records the normalization", () => {
    const { b, a, l } = fixture();
    l!.rows = l!.rows.map((row) => ({ ...row, values: { ...row.values, 食料: 999999 } }));
    const baseline = buildCtiAdjustedConnectionEstimate(b, a, l);
    l!.rows = l!.rows.map((row) => ({ ...row, values: { ...row.values, 食料: 1 } }));
    const changed = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(changed.audit.validation.status).toBe("available");
    expect(changed.audit.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "L", code: "ignored_category", category: "食料" }),
      ]),
    );
    expect(changed.rows).toEqual(baseline.rows);
  });

  it("does not compare L valueType or householdScope with B", () => {
    const { b, a, l } = fixture();
    l!.metadata = { ...l!.metadata, valueType: "公式別系列", householdScope: "二人以上の世帯" };
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.status).toBe("available");
    expect(
      result.audit.validation.issues.some(
        (issue) => issue.input === "L" && issue.code === "metadata_mismatch",
      ),
    ).toBe(false);
  });

  it("accepts B/A without residual and derives estimated residual from total minus major nine", () => {
    const { b, l } = fixture();
    const a = makeInput(
      "A-no-residual.csv",
      Array.from({ length: 21 }, (_, index) => 2005 + index),
      (year, category) =>
        category === "総合" ? 100 + (year - 2005) * 1.5 : 10 + (year - 2005) / 10,
    );
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.status).toBe("available");
    expect(result.rows.find((row) => row.year === 2005)?.values["残差"]).not.toBeNull();
    expect(result.audit.officialAdditivity[2017].reason).toBe(
      "derived_from_total_minus_major_categories",
    );
    expect(result.audit.residualValidation[2017].reason).toBe(
      "derived_from_total_minus_major_categories",
    );
    expect(CTI_ADJUSTED_OUTPUT_CATEGORIES).toContain("残差");
  });

  it("publishes estimates only within the Plan39 2005..2016 range", () => {
    const { b, a, l } = fixture();
    b.rows = [{ ...b.rows[0], year: 2004 }, ...b.rows];
    a.rows = [{ ...a.rows[0], year: 2004 }, ...a.rows];
    l!.rows = [{ ...l!.rows[0], year: 2004 }, ...l!.rows];
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.rows.find((row) => row.year === 2004)).toMatchObject({
      seriesType: "unavailable",
      status: "unavailable",
    });
    expect(result.rows.find((row) => row.year === 2005)?.seriesType).toBe("estimated_adjusted");
    expect(result.rows.find((row) => row.year === 2017)?.seriesType).toBe("official_adjusted");
  });

  it("marks the standard backtest unavailable when a required holdout year is missing", () => {
    const { b, a, l } = fixture();
    b.rows = b.rows.filter((row) => row.year !== 2020);
    a.rows = a.rows.filter((row) => row.year !== 2020);
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.status).toBe("invalid");
    expect(
      result.audit.validation.issues.some((issue) => issue.code === "non_continuous_years"),
    ).toBe(true);
    expect(result.audit.backtest.status).toBe("unavailable");
    expect(result.audit.backtest.reason).toBe("insufficient_holdout_years");
    expect(result.rows.find((row) => row.year === 2017)?.values["残差"]).toBe(7);
  });

  it("records an isolated backtest and rejects target-year leakage", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l, {
      backtest: { trainingYears: [2017, 2018, 2019], targetYear: 2017 },
    });
    expect(result.audit.backtest.leakageDetected).toBe(true);
    expect(result.audit.backtest.excludedYears).toEqual([2017]);
    expect(result.audit.backtest.trainingYears).not.toContain(2017);
    expect(result.audit.holdoutLeakage.detected).toBe(false);
  });

  it("recalculates the 2017 connection audit while preserving the official row", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    const official = result.rows.find((row) => row.year === 2017)!;
    expect(result.audit.connection2017["総合"].calculatedValue).toBeCloseTo(
      official.values["総合"]!,
    );
    expect(result.audit.officialPreservation[2017].exact).toBe(true);
  });

  it("keeps audit JSON-safe", () => {
    const { b, a, l } = fixture();
    expect(() => JSON.stringify(buildCtiAdjustedConnectionEstimate(b, a, l).audit)).not.toThrow();
  });

  it("carries B/A/L provenance and explicit unknown hashes into the audit", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.inputMetadata.B).toMatchObject({
      artifactIdentifier: "synthetic:B.csv",
      source: "synthetic-test",
      officialPageUrl: "https://example.test/B.csv",
      downloadUrl: "https://example.test/download/B.csv",
      statisticsId: "stats-39",
      tableId: "table-39",
      statInfId: "statinf-39",
      revision: "r1",
      schemaVersion: "fixture-v1",
      sha256: null,
      hashReason: "synthetic fixture has no source hash",
      rawRange: { startYear: 2005, endYear: 2025 },
      adoptedRange: { startYear: 2005, endYear: 2025 },
      yearization: "calendar_year",
      missingRepresentation: "null",
    });
    expect(result.audit.inputMetadata.A?.artifact).toBe("A.csv");
    expect(result.audit.inputMetadata.L?.artifact).toBe("L.csv");
    expect(result.audit.inputMetadataFingerprint.B).toMatch(/^fnv1a32:/);
    expect(() => JSON.stringify(result.audit)).not.toThrow();
  });

  it("uses the unified 2018-2025 calibration and backtest partitions", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.betaTrainingYears).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(result.audit.betaTrainingYears).not.toContain(2017);
    expect(result.audit.betaExcludedYears).toEqual([]);
    expect(result.audit.backtest.trainingYears).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(result.audit.backtest.targetYear).toBe(2017);
    expect(result.audit.backtest.leakageDetected).toBe(false);
  });

  it("audits residual jumps and fails closed only the affected estimate", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l, { residualJumpThreshold: 0.1 });
    expect(result.audit.residualJumpThreshold).toBe(0.1);
    expect(result.audit.residualJumps[2017]).toMatchObject({
      absoluteDifference: expect.any(Number),
      relativeChange: expect.any(Number),
      exceeded: true,
      reason: "residual_jump_threshold_exceeded",
    });
    expect(result.audit.residualBoundaryJump).toMatchObject({
      fromYear: 2016,
      toYear: 2017,
      exceeded: true,
    });
    expect(result.rows.find((row) => row.year === 2016)?.reason).toBe(
      "residual_jump_threshold_exceeded",
    );
    expect(result.rows.find((row) => row.year === 2017)?.seriesType).toBe("official_adjusted");
    expect(() => JSON.stringify(result.audit)).not.toThrow();
  });

  it("returns a JSON-safe sensitivity comparison for calibration, holdout, and L rules", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedSensitivityAnalysis(b, a, l, {
      maxBetaDifference: 10,
      maxDDifference: 10,
      maxEstimateRelativeDifference: 10,
    });
    expect(result.status).toBe("available");
    expect(result.scenarios.map((scenario) => scenario.lAnnualizationRule)).toEqual([
      "official_annual",
      "official_annual",
    ]);
    expect(result.scenarios[0].calibrationYears).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ]);
    expect(result.scenarios[1].calibrationYears).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ]);
    expect(
      result.scenarios.every(
        (scenario) =>
          scenario.targetYear === 2017 &&
          scenario.holdoutYears.length === 1 &&
          scenario.holdoutYears[0] === 2017,
      ),
    ).toBe(true);
    expect(result.betaDifference["食料"]).not.toBeNull();
    expect(result.maxRelativeDifference).toEqual(expect.any(Number));
    expect(result.acceptance).toMatchObject({
      maxBetaDifference: 10,
      maxDDifference: 10,
      maxEstimateRelativeDifference: 10,
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("stops estimation and marks invalid metadata, non-finite, zero, and duplicates", () => {
    const { b, a, l } = fixture();
    a.metadata = { ...a.metadata, unit: "index" };
    a.rows = a.rows.map((row, index) =>
      index === 1 ? { ...row, values: { ...row.values, 食料: 0 } } : row,
    );
    b.rows = [...b.rows, { ...b.rows[0], year: 2005 }];
    l!.rows = l!.rows.map((row, index) =>
      index === 2 ? { ...row, values: { ...row.values, 総合: Number.NaN } } : row,
    );
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.status).toBe("invalid");
    expect(result.rows.find((row) => row.year === 2010)?.status).toBe("invalid");
    expect(new Set(result.audit.validation.issues.map((issue) => issue.code))).toEqual(
      new Set(["metadata_mismatch", "duplicate_year", "non_positive_value", "non_finite_value"]),
    );
  });

  it("validates the closed B/A category set", () => {
    const { b, a, l } = fixture();
    b.categoryOrder = [...CTI_ADJUSTED_MAJOR_CATEGORIES, "総合", "未知"];
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.status).toBe("invalid");
    expect(result.audit.validation.issues.some((issue) => issue.code === "unknown_category")).toBe(
      true,
    );
  });
});
