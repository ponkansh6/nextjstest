import {
  buildCtiAdjustedConnectionEstimate,
  CTI_ADJUSTED_INPUT_CATEGORIES,
  CTI_ADJUSTED_MAJOR_CATEGORIES,
  type CtiAdjustedAnnualInput,
} from "@server/lib/ctiAdjustedConnectionEstimate";
import {
  buildCtiAdjustedV2Estimate,
  generateCtiAdjustedV2GammaCases,
  validateCtiAdjustedV2Plan40Inputs,
} from "@server/lib/ctiAdjustedConnectionEstimateV2";

const years = Array.from({ length: 21 }, (_, i) => 2005 + i);

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

const fixture = () => {
  const b = makeInput("B.csv", (year, category) => (category === "総合" ? 100 + year - 2005 : 5));
  const a = makeInput("A.csv", (year, category) => {
    const n = year - 2017;
    return category === "総合" ? (100 + year - 2005) * (1.1 + n * 0.01) : 5 * (1.02 + n * 0.004);
  });
  const l: CtiAdjustedAnnualInput = {
    metadata: metadata("L.csv"),
    rows: years.map((year) => ({ year, values: { 総合: 100 + (year - 2005) * 2 } })),
  };
  return { b, a, l };
};

const householdComposition = {
  historicalPi2Plus: Object.fromEntries(
    years.slice(0, 13).map((year, i) => [year, 0.65 + i * 0.001]),
  ),
  historicalPiStatusByYear: Object.fromEntries(
    years.slice(0, 13).map((year) => [
      year,
      {
        status: "observed",
        synthetic: false,
        benchmarkId: "coverage-fixture",
        connectionStatus: "centered_at_2017",
        interpolationMethod: null,
      },
    ]),
  ),
  calibrationPi2Plus: {
    2017: 0.66,
    2025: 0.68,
    ...Object.fromEntries(years.slice(13).map((year, i) => [year, 0.66 + (year - 2017) * 0.0025])),
  },
  provenance: {
    artifactPath: "test/coverage-fixture.json",
    artifactSha256: "synthetic",
    manifestSha256: "synthetic",
    historicalSource: "synthetic fixture",
    calibrationSource: "synthetic fixture",
    caveats: [],
  },
};

describe("CTI estimate remaining input boundaries", () => {
  it("validates malformed v1 metadata, category order, years, and residual values", () => {
    const { b, a, l } = fixture();
    const malformedB = {
      ...b,
      metadata: undefined,
      categoryOrder: [...b.categoryOrder!, "食料", "unknown"],
      rows: b.rows.map((row, index) =>
        index === 0
          ? { ...row, year: 2005.5, values: { ...row.values, 残差: Number.NaN, 食料: 0 } }
          : row,
      ),
    } as unknown as CtiAdjustedAnnualInput;

    const result = buildCtiAdjustedConnectionEstimate(malformedB, a, l);
    expect(result.audit.validation.status).toBe("invalid");
    expect(result.audit.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "B", code: "missing_metadata" }),
        expect.objectContaining({ input: "B", code: "category_overlap" }),
        expect.objectContaining({ input: "B", code: "unknown_category", category: "unknown" }),
        expect.objectContaining({ input: "B", code: "invalid_row" }),
        expect.objectContaining({ input: "B", code: "non_finite_value", category: "残差" }),
        expect.objectContaining({ input: "B", code: "non_positive_value", category: "食料" }),
      ]),
    );
  });

  it("fails the v1 range and target metadata contracts and reports an empty backtest", () => {
    const { b, a, l } = fixture();
    b.metadata = { ...b.metadata, rawRange: { startYear: 2025, endYear: 2005 } };
    a.metadata = { ...a.metadata, unit: "別単位" };
    const result = buildCtiAdjustedConnectionEstimate(b, a, l, {
      target: { baseYear: 2020, unit: "円", frequency: "quarterly" },
      backtest: { trainingYears: [], targetYear: 2017 },
    });
    expect(result.audit.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "B", code: "invalid_range" }),
        expect.objectContaining({ input: "A", code: "metadata_mismatch" }),
        expect.objectContaining({ input: "B", code: "metadata_mismatch" }),
      ]),
    );
    expect(result.audit.backtest.reason).toBe("invalid_input");
  });

  it("uses fallback audit metadata and preserves source hashes when optional provenance is absent", () => {
    const { b, a, l } = fixture();
    b.metadata = {
      ...b.metadata,
      source: undefined as unknown as string,
      artifact: undefined as unknown as string,
      schemaVersion: Number.NaN,
      sha256: null,
      csvSha256: null,
      hash: null,
      hashReason: null,
    };
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.inputMetadata.B).toMatchObject({
      source: "",
      artifact: "",
      artifactIdentifier: null,
      schemaVersion: null,
      sha256: null,
      hashReason: "not_provided",
    });
  });

  it("uses validated row data when V1 category order and metadata fields are absent", () => {
    const { b, a, l } = fixture();
    b.categoryOrder = undefined;
    l.rows[0].values["残差"] = Number.POSITIVE_INFINITY;
    b.metadata = {
      ...b.metadata,
      retrievedAt: undefined as unknown as string,
      baseYear: Number.NaN,
      unit: undefined as unknown as string,
      valueType: 1 as unknown as string,
      householdScope: null as unknown as string,
      frequency: undefined as unknown as string,
      missingRepresentation: null as unknown as string,
    };

    const result = buildCtiAdjustedConnectionEstimate(b, a, l);

    expect(result.audit.inputMetadata.B).toMatchObject({
      retrievedAt: "",
      baseYear: null,
      unit: "",
      valueType: "",
      householdScope: "",
      frequency: "",
      missingRepresentation: "",
    });
    expect(result.audit.validation.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ input: "B", code: "missing_metadata" })]),
    );
    expect(result.audit.validation.issues).not.toContain(
      expect.objectContaining({ input: "L", code: "non_finite_value", category: "残差" }),
    );
  });

  it("reports v1 beta and backtest as unavailable below minimum observations", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l, {
      calibrationYears: [2018],
      minBetaObservations: 3,
      backtest: { trainingYears: [2018, 2019], targetYear: 2017 },
    });
    expect(result.audit.beta["食料"]).toMatchObject({
      status: "unavailable",
      reason: "insufficient_beta_observations_or_variation",
    });
    expect(result.audit.backtest.status).toBe("unavailable");
  });

  it("skips invalid v1 backtest ratios", () => {
    const invalidRatio = fixture();
    invalidRatio.b.rows = invalidRatio.b.rows.map((row) =>
      row.year === 2018 ? { ...row, values: { ...row.values, 食料: 0 } } : row,
    );
    const skipped = buildCtiAdjustedConnectionEstimate(
      invalidRatio.b,
      invalidRatio.a,
      invalidRatio.l,
      { backtest: { trainingYears: [2018, 2019, 2020], targetYear: 2017 } },
    );
    expect(skipped.audit.backtest.status).toBe("unavailable");
  });

  it("keeps an invalid observed V1 total out of the fitted ratio series", () => {
    const invalidRatio = fixture();
    invalidRatio.b.rows = invalidRatio.b.rows.map((row) =>
      row.year === 2020 ? { ...row, values: { ...row.values, 総合: Number.NaN } } : row,
    );

    const result = buildCtiAdjustedConnectionEstimate(
      invalidRatio.b,
      invalidRatio.a,
      invalidRatio.l,
    );

    expect(result.audit.validation.issues).toContainEqual(
      expect.objectContaining({
        input: "B",
        year: 2020,
        code: "non_finite_value",
        category: "総合",
      }),
    );
    expect(result.audit.ratios[2020]?.total).toBeNull();
    expect(result.rows.find((row) => row.year === 2010)?.status).toBe("invalid");
  });

  it("covers v1 missing categories and non-finite base years", () => {
    const { b, a, l } = fixture();
    const incomplete = {
      ...b,
      metadata: { ...b.metadata, baseYear: Number.NaN },
      categoryOrder: b.categoryOrder!.filter((category) => category !== "食料"),
      rows: b.rows.map((row, index) =>
        index === 0
          ? { ...row, values: { ...row.values, 食料: undefined as unknown as number } }
          : row,
      ),
    };
    const invalid = buildCtiAdjustedConnectionEstimate(incomplete, a, l);
    expect(invalid.audit.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "B", code: "missing_metadata" }),
        expect.objectContaining({
          input: "B",
          code: "missing_metadata",
          message: "B.baseYear is invalid",
        }),
        expect.objectContaining({ input: "B", code: "missing_category", category: "食料" }),
        expect.objectContaining({ input: "B", code: "missing_value", category: "食料" }),
      ]),
    );
  });

  it("uses row keys when the optional v1 category order is omitted", () => {
    const { b, a, l } = fixture();
    b.categoryOrder = undefined;
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ input: "B", code: "missing_category" })]),
    );
  });

  it("treats a null V1 category order the same as an omitted order", () => {
    const { b, a, l } = fixture();
    b.categoryOrder = null as unknown as CtiAdjustedAnnualInput["categoryOrder"];

    const result = buildCtiAdjustedConnectionEstimate(b, a, l);

    expect(result.audit.validation.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ input: "B", code: "missing_category" })]),
    );
  });

  it("uses an empty row-key set when both optional V1 category sources are absent", () => {
    const { b, a, l } = fixture();
    b.categoryOrder = undefined;
    b.rows = b.rows.map((row, index) =>
      index === 0 ? { ...row, values: undefined as unknown as typeof row.values } : row,
    );

    const result = buildCtiAdjustedConnectionEstimate(b, a, l);

    expect(result.audit.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "B", code: "missing_value", category: "総合" }),
      ]),
    );
  });

  it("rejects an untyped V1 artifact with missing rows without throwing", () => {
    const { b, a, l } = fixture();
    const malformed = {
      ...b,
      categoryOrder: undefined,
      rows: undefined,
    } as unknown as CtiAdjustedAnnualInput;

    const result = buildCtiAdjustedConnectionEstimate(malformed, a, l);

    expect(result.audit.validation.status).toBe("invalid");
    expect(result.audit.validation.issues).toContainEqual(
      expect.objectContaining({ input: "B", code: "missing_category", category: "総合" }),
    );
  });

  it("accepts the v1 parser's absent residual column and ignores an L residual column", () => {
    const { b, a, l } = fixture();
    b.rows = b.rows.map((row, index) =>
      index === 0 ? { ...row, values: { ...row.values, 残差: 0 } } : row,
    );
    l.rows = l.rows.map((row, index) =>
      index === 0 ? { ...row, values: { ...row.values, 残差: 1 } } : row,
    );
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.audit.validation.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ input: "L", code: "unknown_category", category: "残差" }),
      ]),
    );
  });

  it("validates an explicitly supplied B residual column", () => {
    const { b, a, l } = fixture();
    b.rows = b.rows.map((row, index) =>
      index === 0 ? { ...row, values: { ...row.values, 残差: Number.NaN } } : row,
    );

    const result = buildCtiAdjustedConnectionEstimate(b, a, l);

    expect(result.audit.validation.issues).toContainEqual(
      expect.objectContaining({
        input: "B",
        year: 2005,
        code: "non_finite_value",
        category: "残差",
      }),
    );
  });

  it("reports the v1 all-missing artifact state as invalid with null audit metadata", () => {
    const empty = buildCtiAdjustedConnectionEstimate(null, null, null);
    expect(empty.audit.validation.status).toBe("invalid");
    expect(empty.audit.inputMetadata).toEqual({ B: null, A: null, L: null });
  });

  it("reports insufficient holdout years for an otherwise valid custom v1 backtest", () => {
    const { b, a, l } = fixture();
    const missingBacktest = buildCtiAdjustedConnectionEstimate(b, a, l, {
      backtest: { trainingYears: [1900], targetYear: 2017 },
    });
    expect(missingBacktest.audit.backtest.reason).toBe("insufficient_holdout_years");
  });

  it("keeps official rows unavailable when the year exists only in B", () => {
    const { b, a, l } = fixture();
    b.rows = [...b.rows, { ...b.rows[b.rows.length - 1], year: 2026 }];
    b.metadata = { ...b.metadata, rawRange: { startYear: 2005, endYear: 2026 } };
    b.metadata = { ...b.metadata, adoptedRange: { startYear: 2005, endYear: 2026 } };
    const result = buildCtiAdjustedConnectionEstimate(b, a, l);
    expect(result.rows.find((row) => row.year === 2026)).toMatchObject({
      seriesType: "unavailable",
      status: "unavailable",
    });
  });

  it("reports years beyond a custom v1 estimate end as unavailable", () => {
    const { b, a, l } = fixture();
    const result = buildCtiAdjustedConnectionEstimate(b, a, l, {
      target: { endYear: 2010 },
    });
    expect(result.rows.find((row) => row.year === 2011)).toMatchObject({
      seriesType: "unavailable",
      status: "unavailable",
    });
    expect(result.audit.backtest.status).toBe("unavailable");
    expect(Object.values(result.audit.backtest.officialR).every((value) => value === null)).toBe(
      true,
    );
  });

  it("keeps explicitly held-out years out of V1 beta training", () => {
    const { b, a, l } = fixture();
    const heldOut = buildCtiAdjustedConnectionEstimate(b, a, l, {
      holdoutYears: [2018],
      holdoutStartYear: 2020,
    });

    expect(heldOut.audit.holdoutLeakage).toMatchObject({
      detected: false,
      excludedYears: expect.arrayContaining([2018, 2020, 2021, 2022, 2023, 2024, 2025]),
      removedFromTrainingYears: expect.arrayContaining([2018, 2020, 2021, 2022, 2023, 2024, 2025]),
      reason: null,
    });
    expect(heldOut.audit.betaTrainingYears).not.toEqual(
      expect.arrayContaining([2018, 2020, 2021, 2022, 2023, 2024, 2025]),
    );
  });

  it("skips non-finite fitted and backtest ratios without invalidating positive source values", () => {
    const { b, a, l } = fixture();
    b.rows = b.rows.map((row) =>
      row.year >= 2018 && row.year <= 2025
        ? { ...row, values: { ...row.values, 食料: Number.MIN_VALUE } }
        : row,
    );
    a.rows = a.rows.map((row) =>
      row.year >= 2018 && row.year <= 2025
        ? { ...row, values: { ...row.values, 食料: Number.MAX_VALUE } }
        : row,
    );
    const result = buildCtiAdjustedConnectionEstimate(b, a, l, {
      backtest: { trainingYears: [2018, 2019, 2020], targetYear: 2017 },
    });
    expect(result.audit.validation.status).toBe("available");
    expect(result.audit.backtest.status).toBe("unavailable");
    expect(result.audit.beta["食料"].status).toBe("unavailable");
  });

  it("keeps a below-start v1 row unavailable", () => {
    const { b, a, l } = fixture();
    b.rows = [{ ...b.rows[0], year: 2004 }, ...b.rows];
    a.rows = [{ ...a.rows[0], year: 2004 }, ...a.rows];
    l.rows = [{ ...l.rows[0], year: 2004 }, ...l.rows];
    const belowStart = buildCtiAdjustedConnectionEstimate(b, a, l, {
      target: { startYear: 2005 },
    });
    expect(belowStart.rows.find((row) => row.year === 2004)).toMatchObject({
      status: "unavailable",
      reason: "unavailable",
    });
    expect(
      buildCtiAdjustedConnectionEstimate(b, a, l, { target: { startYear: 2010 } }).rows.find(
        (row) => row.year === 2008,
      ),
    ).toMatchObject({ status: "unavailable", reason: "unavailable" });
  });

  it("rejects a negative estimated v1 residual", () => {
    const negative = fixture();
    negative.b.rows = negative.b.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        ...(row.year < 2017
          ? Object.fromEntries(CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => [c, 1000]))
          : {}),
      },
    }));
    const rejected = buildCtiAdjustedConnectionEstimate(negative.b, negative.a, negative.l);
    expect(rejected.rows.find((row) => row.year === 2010)?.status).toBe("unavailable");
  });

  it("accepts the exact V2 calibration array and calculates a valid prehistory anchor", () => {
    const { b, a } = fixture();
    const fullCalibration = Array.from({ length: 8 }, (_, i) => 2018 + i);
    const estimate = buildCtiAdjustedV2Estimate(b, a, undefined, {
      calibrationYears: fullCalibration,
      householdComposition,
      prehistoryComposition: { year: 2010, pi2Plus: 0.7 },
    });
    expect(estimate.prehistoryAnchors?.[2010]).toBeGreaterThan(0);
    expect(estimate.publicationGate.reasonCodes).not.toContain(
      "plan39_calibration_years_override_rejected",
    );
  });

  it("reports omitted years and zero coverage for empty V2 gamma comparisons", () => {
    const { b, a } = fixture();
    const incomplete = { ...a, rows: a.rows.filter((row) => row.year !== 2010) };
    const cases = generateCtiAdjustedV2GammaCases(b, incomplete, [2010, 2011]);
    expect(cases.every((item) => item.coverage === 0.5)).toBe(true);
    expect(cases[0]).toMatchObject({
      omitted: [2010],
      reasons: ["missing_or_non_positive_input:2010"],
    });
    expect(generateCtiAdjustedV2GammaCases(b, a, [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ coverage: 0, omitted: [], reasons: [] })]),
    );
  });

  it("returns a null V2 prehistory anchor for an invalid request", () => {
    const { b, a } = fixture();
    const invalidAnchor = buildCtiAdjustedV2Estimate(b, a, undefined, {
      householdComposition,
      prehistoryComposition: { year: 2010.5, pi2Plus: 1 },
    });
    expect(invalidAnchor.prehistoryAnchors?.[2010.5]).toBeNull();
  });

  it("validates complete Plan40 provenance and rejects invalid annual anchors", () => {
    const { b, a } = fixture();
    const valid = validateCtiAdjustedV2Plan40Inputs(b, a);
    expect(valid).toMatchObject({ valid: true, normalizedBaseYear: 2025 });
  });

  it("rejects incomplete Plan40 provenance and an invalid 2025 annual anchor", () => {
    const { b, a } = fixture();
    const malformed = {
      ...b,
      metadata: {
        ...b.metadata,
        source: " ",
        valueType: "実質指数",
        baseYear: Number.NaN,
        frequency: "monthly",
        rawRange: { startYear: 2006, endYear: 2024 },
        adoptedRange: { startYear: 2006, endYear: 2024 },
      },
    };
    const missingAnchor = {
      ...a,
      rows: a.rows.map((row) =>
        row.year === 2025 ? { ...row, values: { ...row.values, 総合: 0 } } : row,
      ),
    };
    const invalid = validateCtiAdjustedV2Plan40Inputs(malformed, missingAnchor);
    expect(invalid.valid).toBe(false);
    expect(invalid.reasonCodes).toEqual(
      expect.arrayContaining([
        "B:missing_metadata:source",
        "B:value_type_not_nominal",
        "B:non_finite_base_year",
        "B:frequency_not_annual",
        "B:raw_range_excludes_target:2005",
        "B:adopted_range_excludes_target:2005",
        "A:missing_or_non_positive_2025_anchor",
      ]),
    );
    const rejected = buildCtiAdjustedV2Estimate(malformed, missingAnchor, undefined, {
      validatePlan40Inputs: true,
    });
    expect(rejected.publicationGate.reasonCodes).toContain("invalid_metadata_range");
  });

  it("reports missing Plan40 inputs and metadata ranges", () => {
    const { b, a } = fixture();
    const missingRange = {
      ...b,
      metadata: { ...b.metadata, rawRange: undefined, adoptedRange: undefined },
    } as unknown as CtiAdjustedAnnualInput;
    const missingInput = validateCtiAdjustedV2Plan40Inputs(undefined, a);
    const invalidRange = validateCtiAdjustedV2Plan40Inputs(missingRange, a);
    expect(missingInput.reasonCodes).toContain("B:missing_artifact");
    expect(invalidRange.reasonCodes).toEqual(
      expect.arrayContaining(["B:missing_raw_range", "B:missing_adopted_range"]),
    );
  });

  it("builds the Plan40 bottom-up series from valid annual inputs", () => {
    const { b, a } = fixture();
    const plan40 = buildCtiAdjustedV2Estimate(b, a, undefined, { contract: "plan40" });
    expect(plan40.plan40InputValidation?.valid).toBe(true);
    expect(plan40.rows.find((row) => row.year === 2010)).toMatchObject({
      seriesType: "estimated_bottom_up",
      status: "available",
    });
  });

  it("reports zero-variance V2 calibration rather than inventing a beta", () => {
    const { b, a } = fixture();
    a.rows = a.rows.map((row) => {
      if (row.year < 2017 || row.year > 2025) return row;
      const bRow = b.rows.find((candidate) => candidate.year === row.year)!;
      return {
        ...row,
        values: Object.fromEntries(
          CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, bRow.values[category]! * 1.1]),
        ),
      };
    });
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.other.beta).toMatchObject({
      status: "insufficient-data",
      reason: "beta_zero_variance",
      zeroVariance: true,
    });
  });

  it("omits gamma comparisons whose finite source values overflow the calculated result", () => {
    const { b, a } = fixture();
    b.rows = b.rows.map((row) =>
      row.year === 2017 || row.year === 2005
        ? {
            ...row,
            values: {
              ...row.values,
              総合: row.year === 2017 ? Number.MIN_VALUE : Number.MAX_VALUE,
            },
          }
        : row,
    );
    a.rows = a.rows.map((row) =>
      row.year === 2017 || row.year === 2005
        ? { ...row, values: { ...row.values, 総合: Number.MAX_VALUE } }
        : row,
    );
    const cases = generateCtiAdjustedV2GammaCases(b, a, [2005]);
    expect(cases.every((item) => item.omitted.includes(2005) && item.values[2005] === null)).toBe(
      true,
    );
  });

  it("marks official V2 other-share comparisons unavailable when major categories exceed total", () => {
    const { b, a } = fixture();
    a.rows = a.rows.map((row) =>
      row.year === 2020 ? { ...row, values: { ...row.values, 総合: 10 } } : row,
    );
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.residual.jumps[2020]).toMatchObject({
      status: "unavailable",
      thresholdPass: null,
    });
    expect(result.residual.thresholdMetadata).toMatchObject({
      unevaluableOfficialAdjacentPairs: expect.arrayContaining([2020, 2021]),
    });
  });

  it("returns a null V2 prehistory anchor when provenance has no source row for its year", () => {
    const { b, a } = fixture();
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, {
      householdComposition,
      prehistoryComposition: { year: 1900, pi2Plus: 0.7 },
    });
    expect(result.prehistoryAnchors?.[1900]).toBeNull();
  });

  it("marks an official V2 row unavailable when one required category is absent", () => {
    const { b, a } = fixture();
    a.rows = a.rows.map((row) =>
      row.year === 2020
        ? { ...row, values: { ...row.values, 教育: undefined as unknown as number } }
        : row,
    );
    const result = buildCtiAdjustedV2Estimate(b, a);
    expect(result.rows.find((row) => row.year === 2020)).toMatchObject({
      status: "insufficient-data",
      reason: "official_a_or_official_other_unavailable",
    });
  });

  it("returns an unavailable V2 estimate when its derived Other base is non-positive", () => {
    const { b, a } = fixture();
    b.rows = b.rows.map((row) =>
      row.year === 2005 ? { ...row, values: { ...row.values, 総合: 10 } } : row,
    );
    const result = buildCtiAdjustedV2Estimate(b, a, undefined, { householdComposition });
    expect(result.rows.find((row) => row.year === 2005)).toMatchObject({
      seriesType: "unavailable",
      status: "insufficient-data",
      reason: "insufficient_data_for_bottom_up_estimate",
    });
  });

  it("records an observed-source reason when a V2 pre-connection row is missing", () => {
    const { b, a } = fixture();
    b.rows = b.rows.filter((row) => row.year !== 2010);
    const result = buildCtiAdjustedV2Estimate(b, a);
    expect(result.residual.jumps[2010].current).toMatchObject({
      source: "B",
      status: "unavailable",
      reason: "missing_B_observed_row",
    });
  });

  it("marks a V2 observed residual unavailable when finite source values overflow subtraction", () => {
    const { b, a } = fixture();
    b.rows = b.rows.map((row) =>
      row.year === 2010
        ? {
            ...row,
            values: {
              ...row.values,
              総合: -Number.MAX_VALUE,
              ...Object.fromEntries(
                CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => [category, 1e307]),
              ),
            },
          }
        : row,
    );

    const result = buildCtiAdjustedV2Estimate(b, a);

    expect(result.residual.jumps[2010].current).toMatchObject({
      status: "unavailable",
      reason: "observed_other_unavailable",
    });
  });

  it("marks household-composition correction unavailable when calibration has no change", () => {
    const { b, a } = fixture();
    const constantCalibration = {
      ...householdComposition,
      calibrationPi2Plus: Object.fromEntries(years.slice(13).map((year) => [year, 0.67])),
    };

    const result = buildCtiAdjustedV2Estimate(b, a, undefined, {
      householdComposition: constantCalibration,
    });

    expect(result.householdComposition.status).toBe("unavailable");
    expect(result.publicationGate.blockingReasonCodes).toContain(
      "household_composition_correction_unavailable",
    );
  });

  it("fails closed when an extreme calibration correction removes historical components", () => {
    const { b, a } = fixture();
    const nearZeroDeltaComposition = {
      ...householdComposition,
      calibrationPi2Plus: {
        ...householdComposition.calibrationPi2Plus,
        2025: 0.6600000000011,
      },
    };

    const result = buildCtiAdjustedV2Estimate(b, a, undefined, {
      householdComposition: nearZeroDeltaComposition,
    });

    expect(result.rows.find((row) => row.year === 2005)).toMatchObject({
      status: "insufficient-data",
      reason: "insufficient_data_for_bottom_up_estimate",
      values: { 総合: null },
    });
  });

  it("flags a non-finite V2 benchmark ratio from finite positive annual inputs", () => {
    const { b, a } = fixture();
    a.rows = a.rows.map((row) => {
      if (row.year === 2017)
        return {
          ...row,
          values: {
            ...Object.fromEntries(
              CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, 1e-310]),
            ),
            総合: 2e-309,
          },
        };
      if (row.year === 2018)
        return {
          ...row,
          values: {
            ...Object.fromEntries(
              CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [category, 1e299]),
            ),
            総合: 1e300,
          },
        };
      return row;
    });
    const result = buildCtiAdjustedV2Estimate(b, a);
    expect(result.benchmarkG[2018]).toBe(Number.POSITIVE_INFINITY);
    expect(result.benchmarkGDiagnostics).toMatchObject({ finite: false, status: "invalid" });
    expect(result.publicationGate.warningReasonCodes).toContain("invalid_g_benchmark");
  });

  it("rejects V2 missing categories, non-finite values, invalid fit limits, and composition data", () => {
    const { b, a } = fixture();
    b.rows = b.rows.map((row, index) =>
      index === 0
        ? {
            ...row,
            values: {
              ...row.values,
              食料: Number.POSITIVE_INFINITY,
              総合: undefined as unknown as number,
            },
          }
        : row,
    );
    b.categoryOrder = [...b.categoryOrder!, "食料"];
    const invalid = buildCtiAdjustedV2Estimate(b, a, undefined, {
      minBetaObservations: 1,
      householdComposition: {
        ...householdComposition,
        calibrationPi2Plus: { 2017: 0.66, 2025: 0.66 },
      },
    });
    expect(invalid.artifactValidation.B.reasons).toEqual(
      expect.arrayContaining([
        "B:duplicate_category:食料",
        "B:non_finite_value:2005:食料",
        "B:non_finite_value:2005:総合",
      ]),
    );
    expect(invalid.publicationGate.reasonCodes).toContain("invalid_min_beta_observations");
    expect(invalid.publicationGate.reasonCodes).toContain(
      "household_composition_correction_unavailable",
    );
  });

  it("reports rejected V2 fixed-year overrides and malformed calibration requests", () => {
    const { b, a } = fixture();
    const invalidOverrides = buildCtiAdjustedV2Estimate(b, a, undefined, {
      connectionYear: 2018,
      officialStartYear: 2016,
      estimateStartYear: 2006,
      estimateEndYear: 2017,
      calibrationYears: [2018, 2019],
    });

    expect(invalidOverrides.publicationGate.reasonCodes).toEqual(
      expect.arrayContaining([
        "plan39_connection_year_override_rejected",
        "plan39_official_start_year_override_rejected",
        "plan39_target_start_year_override_rejected",
        "plan39_target_end_year_override_rejected",
        "plan39_calibration_years_override_rejected",
      ]),
    );
    expect(
      invalidOverrides.rows
        .filter((row) => row.year < 2017)
        .every((row) => row.status !== "available"),
    ).toBe(true);
  });

  it("fails closed for V2 omitted row/category metadata and missing required category values", () => {
    const { b, a } = fixture();
    const malformed = {
      ...b,
      categoryOrder: undefined,
      rows: b.rows.map((row) =>
        row.year === 2005
          ? { ...row, values: { ...row.values, 食料: undefined as unknown as number } }
          : row,
      ),
    };
    const noRows = { ...b, rows: undefined } as unknown as CtiAdjustedAnnualInput;
    const result = buildCtiAdjustedV2Estimate(malformed, a);
    const missingRows = buildCtiAdjustedV2Estimate(noRows, a);
    const wrongBaseYear = buildCtiAdjustedV2Estimate(
      { ...b, metadata: { ...b.metadata, baseYear: 2024 } },
      a,
      undefined,
      { contract: "plan40" },
    );

    expect(result.artifactValidation.B.reasons).toContain("B:non_finite_value:2005:食料");
    expect(missingRows.artifactValidation.B.reasons).toContain("B:missing_required_year:2005");
    expect(result.publicationGate.reasonCodes).toEqual(
      expect.arrayContaining(["non_finite_value", "invalid_observed_artifact"]),
    );
    expect(wrongBaseYear.publicationGate.reasonCodes).toContain("invalid_base_year");
  });

  it("surfaces finite input overflow in the V2 G benchmark as invalid evidence", () => {
    const { b, a } = fixture();
    a.rows = a.rows.map((row) => {
      if (row.year === 2017)
        return {
          ...row,
          values: Object.fromEntries(
            CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [
              category,
              category === "総合" ? 1e-300 : Number.MIN_VALUE,
            ]),
          ),
        };
      if (row.year === 2025)
        return {
          ...row,
          values: Object.fromEntries(
            CTI_ADJUSTED_INPUT_CATEGORIES.map((category) => [
              category,
              category === "総合" ? 1.7e308 : 1e307,
            ]),
          ),
        };
      return row;
    });

    const result = buildCtiAdjustedV2Estimate(b, a);

    expect(result.benchmarkGDiagnostics).toMatchObject({ finite: false, status: "invalid" });
    expect(result.publicationGate.warningReasonCodes).toContain("invalid_g_benchmark");
  });

  it("reports missing V2 categories as a blocking artifact diagnostic", () => {
    const { b, a } = fixture();
    b.rows = b.rows.map((row) =>
      row.year === 2005
        ? {
            ...row,
            values: Object.fromEntries(
              Object.entries(row.values).filter(([key]) => key !== "食料"),
            ),
          }
        : row,
    );

    const result = buildCtiAdjustedV2Estimate(b, a);

    expect(result.artifactValidation.B.reasons).toContain("B:missing_category:2005:食料");
    expect(result.publicationGate.reasonCodes).toContain("missing_category");
  });
});
