import {
  buildCtiAdjustedV2Estimate,
  CTI_ADJUSTED_V2_OTHER_CATEGORY,
  generateCtiAdjustedV2GammaCases,
} from "@server/lib/ctiAdjustedConnectionEstimateV2";
import {
  CTI_ADJUSTED_INPUT_CATEGORIES,
  CTI_ADJUSTED_MAJOR_CATEGORIES,
  CTI_ADJUSTED_TOTAL_CATEGORY,
  type CtiAdjustedAnnualInput,
} from "@server/lib/ctiAdjustedConnectionEstimate";

const metadata = (artifact: string) => ({
  source: "synthetic-test",
  artifact,
  retrievedAt: "2026-01-01T00:00:00.000Z",
  baseYear: 2025,
  unit: "指数",
  valueType: "原数値（名目指数）",
  householdScope: "総世帯",
  frequency: "annual" as const,
  rawRange: { startYear: 2005, endYear: 2025 },
  adoptedRange: { startYear: 2005, endYear: 2025 },
  missingRepresentation: "null",
});

const makeInput = (
  artifact: string,
  years: number[],
  value: (year: number, category: string) => number,
): CtiAdjustedAnnualInput => ({
  metadata: metadata(artifact),
  categoryOrder: [...CTI_ADJUSTED_INPUT_CATEGORIES],
  rows: years.map((year) => ({
    year,
    values: Object.fromEntries(
      CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, value(year, category)]),
    ),
  })),
});

const householdComposition = {
  historicalPi2Plus: Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => [2005 + index, 0.65 + index * 0.001]),
  ),
  historicalPiStatusByYear: Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => [
      2005 + index,
      {
        status: index === 6 ? "synthetic_interpolation_unverified" : "observed",
        synthetic: index === 6,
        benchmarkId: "synthetic-unit-test",
        connectionStatus: "centered_at_2017",
        interpolationMethod: index === 6 ? "linear" : null,
      },
    ]),
  ),
  calibrationPi2Plus: { 2017: 0.66, 2025: 0.68 },
  provenance: {
    artifactPath: "test/production-pi2plus.json",
    artifactSha256: "test",
    manifestSha256: "test",
    historicalSource: "synthetic unit fixture",
    calibrationSource: "synthetic unit fixture",
    caveats: ["synthetic test fixture"],
  },
};

const fixture = () => {
  const years = Array.from({ length: 21 }, (_, index) => 2005 + index);
  const b = makeInput("B.csv", years, (year, category) =>
    category === "総合" ? 100 + year - 2005 : 5,
  );
  const a = makeInput("A.csv", years, (year, category) => {
    const n = year - 2017;
    if (category === "総合") return (100 + year - 2005) * (1.1 + n * 0.01);
    return 5 * (1.02 + n * 0.004);
  });
  return { b, a };
};

describe("buildCtiAdjustedV2Estimate", () => {
  it("derives positive Other from total minus major nine and uses it bottom-up", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    const row = result.rows.find((item) => item.year === 2010)!;
    const sum9 = CTI_ADJUSTED_MAJOR_CATEGORIES.reduce(
      (sum, category) => sum + row.values[category]!,
      0,
    );
    expect(result.other.derived[2010]).toBeGreaterThan(0);
    expect(row.values[CTI_ADJUSTED_TOTAL_CATEGORY]).toBeCloseTo(
      sum9 + row.values[CTI_ADJUSTED_V2_OTHER_CATEGORY]!,
    );
  });

  it("estimates without an L artifact when the composition artifact is provided", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.rows.find((row) => row.year === 2010)?.status).toBe("available");
  });

  it("excludes 2017 from Other beta calibration", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.other.beta.years).toEqual([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(result.other.beta.years).not.toContain(2017);
  });

  it("keeps official A values from 2017 onward and does not generate estimates from residual", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    const official = result.rows.find((item) => item.year === 2017)!;
    expect(official.seriesType).toBe("official_adjusted");
    expect(official.values[CTI_ADJUSTED_TOTAL_CATEGORY]).toBe(
      a.rows.find((row) => row.year === 2017)!.values["総合"],
    );
    expect(result.residual.generationSource).toBe("diagnostic-only");
    const otherDiagnostic = result.residual.residualWithOther[2010];
    const expectedOther = result.rows.find((row) => row.year === 2010)!.values[
      CTI_ADJUSTED_V2_OTHER_CATEGORY
    ]!;
    const observed2010 = b.rows.find((row) => row.year === 2010)!;
    const expectedObservedOther =
      observed2010.values[CTI_ADJUSTED_TOTAL_CATEGORY]! -
      CTI_ADJUSTED_MAJOR_CATEGORIES.reduce(
        (sum, category) => sum + observed2010.values[category]!,
        0,
      );
    expect(Number.isFinite(otherDiagnostic)).toBe(true);
    expect(otherDiagnostic).toBeCloseTo(expectedOther);
    expect(result.residual.residualMajor[2010]).toBeCloseTo(expectedObservedOther);
  });

  it("uses observed B/A totals for residual diagnostics and structures the boundary", () => {
    const { b, a } = fixture();
    b.rows = b.rows.map((row) =>
      row.year === 2016 ? { ...row, values: { ...row.values, 総合: 130 } } : row,
    );
    a.rows = a.rows.map((row) =>
      row.year === 2017 ? { ...row, values: { ...row.values, 総合: 170 } } : row,
    );
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.residual.residualMajor[2016]).toBeCloseTo(130 - 45);
    expect(result.residual.residualMajor[2017]).toBeCloseTo(170 - 45 * (1.02 + 0.004 * 0));
    expect(result.residual.boundary2016To2017.fromYear).toBe(2016);
    expect(result.residual.boundary2016To2017.toYear).toBe(2017);
    expect(result.residual.boundary2016To2017.previous?.source).toBe("B");
    expect(result.residual.boundary2016To2017.current?.source).toBe("A");
    expect(result.residual.boundary2016To2017.reason).toBe("boundary_diagnostic_only");
    expect(result.residual.boundary2016To2017.thresholdPass).toBe(true);
  });

  it("uses the nominal historical anchor without a real L adjustment", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.rows.find((row) => row.year === 2005)?.status).toBe("available");
    expect(result.rows.find((row) => row.year === 2006)?.status).toBe("available");
  });

  it("computes the comparison-only gamma cases arithmetically", () => {
    const { b, a } = fixture();
    const cases = generateCtiAdjustedV2GammaCases(b, a, [2010]);
    const b2010 = b.rows.find((row) => row.year === 2010)!.values["総合"]!;
    const a2010 = a.rows.find((row) => row.year === 2010)!.values["総合"]!;
    const b2017 = b.rows.find((row) => row.year === 2017)!.values["総合"]!;
    const a2017 = a.rows.find((row) => row.year === 2017)!.values["総合"]!;
    expect(cases.find((item) => item.gamma === 0.5)!.values[2010]).toBeCloseTo(
      b2010 * (a2017 / b2017) * Math.pow(a2010 / b2010, 0.5),
    );
  });

  it("rejects Plan39 overrides fail-closed and keeps the fixed calibration", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, {
      connectionYear: 2016,
      calibrationYears: [2017],
    });
    expect(result.publicationGate.accepted).toBe(false);
    expect(result.publicationGate.reasonCodes).toEqual(
      expect.arrayContaining([
        "plan39_connection_year_override_rejected",
        "plan39_calibration_years_override_rejected",
      ]),
    );
    expect(result.other.beta.years).toEqual([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(result.rows.find((row) => row.year === 2010)?.status).toBe("insufficient-data");
    expect(result.rows.find((row) => row.year === 2010)?.reason).toBe(
      "insufficient_data_for_bottom_up_estimate",
    );
  });

  it("accepts category order permutations", () => {
    const { b, a } = fixture();
    b.categoryOrder = [...CTI_ADJUSTED_INPUT_CATEGORIES].reverse();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.artifactValidation.B.valid).toBe(true);
    expect(result.artifactValidation.B.reasons).not.toContain("B:category_order_mismatch");
  });

  it("reports duplicate-year and non-finite validation reasons", () => {
    const { b, a } = fixture();
    b.rows = [...b.rows, b.rows[0]];
    b.rows = b.rows.map((row, index) =>
      index === 1 ? { ...row, values: { ...row.values, 食料: Number.NaN } } : row,
    );
    b.categoryOrder = [...CTI_ADJUSTED_INPUT_CATEGORIES].reverse();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.artifactValidation.B.reasons).toEqual(
      expect.arrayContaining(["B:duplicate_year:2005", "B:non_finite_value:2006:食料"]),
    );
  });

  it("exposes official Other, benchmark status, residual boundary, and fixed gammas", () => {
    const { b, a } = fixture();
    a.rows = a.rows.map((row) => {
      if (row.year < 2017) return row;
      const n = row.year - 2017;
      return { ...row, values: { ...row.values, 総合: 9 * 5 * (1.02 + n * 0.004) + 70 + n * 1.4 } };
    });
    b.rows = b.rows.map((row) =>
      row.year === 2016 ? { ...row, values: { ...row.values, 総合: 115 } } : row,
    );
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.other.officialOther[2017]).toBe(result.other.derived[2017]);
    expect(result.benchmarkGDiagnostics.status).toBe("available");
    expect(result.residual.thresholdMetadata).toMatchObject({
      source: "official-a-2017-2025",
      baselineYears: [2017, 2025],
      indicator: "Otherシェアの前年差",
      unit: "percentage-points",
      roundingRule: "ceiling-to-hundredth-percentage-point",
      roundingIncrementPercentagePoints: 0.01,
      comparison: "abs(otherShareDeltaPercentagePoints)>threshold",
      inclusive: false,
      epsilon: 1e-9,
    });
    const metadata = result.residual.thresholdMetadata as {
      derivedMaxAbsoluteShareChangePercentagePoints: number;
      effectiveThresholdPercentagePoints: number;
    };
    expect(result.residual.threshold).toBe(metadata.effectiveThresholdPercentagePoints);
    expect(metadata.effectiveThresholdPercentagePoints).toBe(
      Math.ceil(metadata.derivedMaxAbsoluteShareChangePercentagePoints * 100) / 100,
    );
    expect(result.residual.boundary2016To2017.previous?.source).toBe("B");
    expect(result.residual.boundary2016To2017.current?.source).toBe("A");
    expect(result.residual.boundary2016To2017.thresholdPass).toBe(false);
    expect(result.residual.boundary2016To2017.thresholdSource).toBe(
      "generated_to_official_boundary",
    );
    expect(result.residual.jumps[2016].thresholdSource).toBe("generated_bottom_up");
    expect(result.residual.jumps[2016].thresholdSeriesType).toBe("estimated");
    expect(result.residual.boundary2016To2017.reason).toBe("other_share_threshold_exceeded");
    expect(result.publicationGate.reasonCodes).toContain("rolling_loo_backtest_incomplete");
    expect(result.publicationGate.reasonCodes).toEqual(
      expect.arrayContaining(["rolling_loo_backtest_incomplete", "threshold_redesign_incomplete"]),
    );
    expect(result.publicationGate.warningReasonCodes).toContain("sensitivity_incomplete");
    expect(generateCtiAdjustedV2GammaCases(b, a, [2010]).map((item) => item.gamma)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
  });

  it("summarizes input diagnostics in publication reason codes", () => {
    const { b, a } = fixture();
    b.rows = [...b.rows, b.rows[0]];
    b.rows = b.rows.map((row, index) =>
      index === 1 ? { ...row, values: { ...row.values, 食料: Number.NaN } } : row,
    );
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.publicationGate.reasonCodes).toEqual(
      expect.arrayContaining(["duplicate_year", "non_finite_value"]),
    );
    expect(result.publicationGate.diagnostics).toEqual(
      expect.arrayContaining(["B:duplicate_year:2005", "B:non_finite_value:2006:食料"]),
    );
  });

  it("fails closed for invalid minimum beta observations", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, {
      householdComposition,
      minBetaObservations: 2,
    });
    expect(result.publicationGate.reasonCodes).toContain("invalid_min_beta_observations");
    expect(result.publicationGate.accepted).toBe(false);
  });

  it("reports nominal benchmark diagnostics without using G as acceptance evidence", () => {
    const { b, a } = fixture();
    b.rows = b.rows.filter((row) => row.year !== 2005);
    const missing = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(missing.publicationGate.warningReasonCodes).toContain("missing_g_benchmark");
    expect(missing.publicationGate.warningReasonCodes).toContain(
      "g_benchmark_not_acceptance_evidence",
    );
    expect(missing.publicationGate.blockingReasonCodes).not.toContain("missing_g_benchmark");
    expect(missing.publicationGate.blockingReasonCodes).not.toContain(
      "g_benchmark_not_acceptance_evidence",
    );
  });

  it("does not require L and returns only Plan39 years", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.years).toEqual(Array.from({ length: 21 }, (_, index) => 2005 + index));
    expect(result.rows.find((row) => row.year === 2005)?.status).toBe("available");
    expect(result.rows.find((row) => row.year === 2025)?.status).toBe("available");
    expect(result.benchmarkG[2005]).not.toBeNull();
  });

  it("fails closed for historical rows when the composition artifact is missing", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a);
    expect(result.rows.find((row) => row.year === 2017)?.status).toBe("available");
    expect(result.rows.find((row) => row.year === 2016)?.status).toBe("insufficient-data");
    expect(result.publicationGate.accepted).toBe(false);
    expect(result.publicationGate.blockingReasonCodes).toContain(
      "household_composition_correction_unavailable",
    );
    expect(result.other.reasons).toContain("household_composition_artifact_missing_or_invalid");
  });
});
