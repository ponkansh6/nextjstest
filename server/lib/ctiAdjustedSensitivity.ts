import {
  buildCtiAdjustedConnectionEstimate,
  CTI_ADJUSTED_DEFAULT_RESIDUAL_JUMP_THRESHOLD,
  CTI_ADJUSTED_MAJOR_CATEGORIES,
  type CtiAdjustedAnnualInput,
  type CtiAdjustedConnectionEstimate,
  type CtiAdjustedMajorCategory,
} from "./ctiAdjustedConnectionEstimate";
import {
  buildCtiAdjustedV2Estimate,
  CTI_ADJUSTED_V2_YEARS,
  generateCtiAdjustedV2GammaCases,
  type CtiAdjustedV2GammaCase,
} from "./ctiAdjustedConnectionEstimateV2";

export type CtiAdjustedLSensitivityRule =
  | "official_annual"
  | "calendar_year_average"
  | "calendar_year_sum";

export type CtiAdjustedSensitivityScenario = {
  name: string;
  calibrationYears: readonly number[];
  holdoutYears: readonly number[];
  targetYear?: number;
  lAnnualizationRule: CtiAdjustedLSensitivityRule;
};

export type CtiAdjustedSensitivityAcceptance = {
  maxBetaDifference: number;
  maxDDifference: number;
  maxEstimateRelativeDifference: number;
  betaPassed: boolean;
  dPassed: boolean;
  estimatePassed: boolean;
  coveragePassed: boolean;
  evaluatedYears: readonly number[];
  requiredYears: readonly number[];
  omittedYears: readonly number[];
  reasonCodes: readonly string[];
  accepted: boolean;
};

export type CtiAdjustedSensitivityScenarioResult = {
  name: string;
  calibrationYears: readonly number[];
  holdoutYears: readonly number[];
  targetYear: number | null;
  lAnnualizationRule: CtiAdjustedLSensitivityRule;
  status: "available" | "unavailable";
  reason: string | null;
  beta: Record<CtiAdjustedMajorCategory, number | null>;
  d: Record<number, number | null>;
  estimates: Record<number, number | null>;
  evaluationYears: readonly number[];
  omittedYears: readonly number[];
  omittedReasons: Record<number, string>;
  coverage: {
    startYear: number;
    endYear: number;
    evaluatedYears: readonly number[];
    omittedYears: readonly number[];
    omittedReasons: Record<number, string>;
  };
};

export type CtiAdjustedSensitivityAnalysis = {
  status: "available" | "unavailable";
  reason: string | null;
  scenarios: readonly CtiAdjustedSensitivityScenarioResult[];
  betaDifference: Record<CtiAdjustedMajorCategory, number | null>;
  dDifference: Record<number, number | null>;
  estimateDifference: Record<number, number | null>;
  estimateDifferences: Record<number, Record<CtiAdjustedMajorCategory, number | null>>;
  maxRelativeDifference: number | null;
  acceptance: CtiAdjustedSensitivityAcceptance;
  /** Comparison-only v2 gamma sweep; never used as a production setting. */
  gammaScenarios: readonly CtiAdjustedGammaScenarioResult[];
};

export type CtiAdjustedGammaAnnualComparison = {
  year: number;
  gammaValue: number | null;
  currentV1: number | null;
  bottomUp: number | null;
  bottomUpMajorSum: number | null;
  bottomUpOther: number | null;
  bottomUpD: number | null;
  externalBenchmarkL: number | null;
  absoluteDifference: number | null;
  relativeDifference: number | null;
  status: "evaluated" | "omitted";
  reason: string | null;
};

export type CtiAdjustedGammaScenarioResult = {
  gamma: number;
  comparisonOnly: true;
  coverage: number;
  evaluated: readonly number[];
  omitted: readonly number[];
  reasons: readonly string[];
  currentV1: Record<number, number | null>;
  bottomUp: Record<number, number | null>;
  externalBenchmarkL: Record<number, number | null>;
  annual: Record<number, CtiAdjustedGammaAnnualComparison>;
};

export type CtiAdjustedSensitivityOptions = {
  scenarios?: readonly CtiAdjustedSensitivityScenario[];
  maxBetaDifference?: number;
  maxDDifference?: number;
  maxEstimateRelativeDifference?: number;
  residualJumpThreshold?: number;
};

const DEFAULT_SCENARIOS: readonly CtiAdjustedSensitivityScenario[] = [
  {
    name: "baseline_2018_2025",
    calibrationYears: Array.from({ length: 8 }, (_, index) => 2018 + index),
    holdoutYears: [2017],
    targetYear: 2017,
    lAnnualizationRule: "official_annual",
  },
  {
    name: "alternative_2018_2024",
    calibrationYears: Array.from({ length: 7 }, (_, index) => 2018 + index),
    holdoutYears: [2017],
    targetYear: 2017,
    lAnnualizationRule: "official_annual",
  },
];

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const emptyBeta = (): Record<CtiAdjustedMajorCategory, number | null> =>
  Object.fromEntries(CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => [category, null])) as Record<
    CtiAdjustedMajorCategory,
    number | null
  >;

function gammaScenarioResults(
  B: CtiAdjustedAnnualInput | null | undefined,
  A: CtiAdjustedAnnualInput | null | undefined,
  L: CtiAdjustedAnnualInput | null | undefined,
  v1: CtiAdjustedConnectionEstimate,
): readonly CtiAdjustedGammaScenarioResult[] {
  if (!B || !A) return [];
  const v2 = buildCtiAdjustedV2Estimate(B, A, L);
  const gammaCases = generateCtiAdjustedV2GammaCases(B, A);
  const v1Values = Object.fromEntries(
    v1.rows.map((row) => [row.year, finiteOrNull(row.values.総合)]),
  );
  const bottomUp = Object.fromEntries(
    v2.rows.map((row) => [row.year, finiteOrNull(row.values.総合)]),
  );
  const bottomUpMajorSum = Object.fromEntries(
    v2.rows.map((row) => [
      row.year,
      CTI_ADJUSTED_MAJOR_CATEGORIES.every((category) => finiteOrNull(row.values[category]) !== null)
        ? CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((sum, category) => sum + row.values[category]!, 0)
        : null,
    ]),
  );
  const bottomUpOther = Object.fromEntries(
    v2.rows.map((row) => [row.year, finiteOrNull(row.values["その他の消費支出"])]),
  );
  const lRows = new Map((L?.rows ?? []).map((row) => [row.year, row]));
  const bRows = new Map(B.rows.map((row) => [row.year, row]));
  const b2017 = finiteOrNull(B.rows.find((row) => row.year === 2017)?.values.総合);
  const a2017 = finiteOrNull(A.rows.find((row) => row.year === 2017)?.values.総合);
  const l2017 = finiteOrNull(lRows.get(2017)?.values.総合);
  const bottomUpD = Object.fromEntries(
    CTI_ADJUSTED_V2_YEARS.map((year) => {
      const l = finiteOrNull(lRows.get(year)?.values.総合);
      const b = finiteOrNull(bRows.get(year)?.values.総合);
      return [
        year,
        l !== null &&
        b !== null &&
        l2017 !== null &&
        b2017 !== null &&
        l2017 > 0 &&
        b > 0 &&
        b2017 > 0
          ? l / l2017 / (b / b2017)
          : null,
      ];
    }),
  );
  const externalBenchmarkL = Object.fromEntries(
    CTI_ADJUSTED_V2_YEARS.map((year) => {
      const l = finiteOrNull(lRows.get(year)?.values.総合);
      return [
        year,
        l !== null && b2017 !== null && l2017 !== null && l2017 > 0 ? (l * b2017) / l2017 : null,
      ];
    }),
  );
  return gammaCases.map((gammaCase: CtiAdjustedV2GammaCase) => {
    const annual = Object.fromEntries(
      CTI_ADJUSTED_V2_YEARS.map((year) => {
        const directGammaValue = finiteOrNull(gammaCase.values[year]);
        const b = finiteOrNull(bRows.get(year)?.values.総合);
        const gammaValue =
          directGammaValue ??
          (b !== null && a2017 !== null && b2017 !== null && b2017 > 0 && bottomUpD[year] !== null
            ? finiteOrNull(b * (a2017 / b2017) * Math.pow(bottomUpD[year]!, gammaCase.gamma))
            : null);
        const current = v1Values[year] ?? null;
        const estimate = bottomUp[year] ?? null;
        const benchmark = externalBenchmarkL[year] ?? null;
        const evaluable =
          gammaValue !== null && current !== null && estimate !== null && benchmark !== null;
        const absoluteDifference = evaluable ? estimate - current : null;
        const reason = evaluable
          ? null
          : benchmark === null
            ? `missing_l_benchmark:${year}`
            : gammaValue === null
              ? (gammaCase.reasons.find((item) => item.endsWith(`:${year}`)) ??
                `comparison_input_unavailable:${year}`)
              : current === null
                ? `v1_comparison_unavailable:${year}`
                : estimate === null
                  ? `v2_bottom_up_unavailable:${year}`
                  : `comparison_input_unavailable:${year}`;
        return [
          year,
          {
            year,
            gammaValue,
            currentV1: current,
            bottomUp: estimate,
            externalBenchmarkL: benchmark,
            bottomUpMajorSum: bottomUpMajorSum[year] ?? null,
            bottomUpOther: bottomUpOther[year] ?? null,
            bottomUpD: bottomUpD[year] ?? null,
            absoluteDifference,
            relativeDifference:
              evaluable && current !== 0 ? absoluteDifference! / Math.abs(current) : null,
            status: evaluable ? "evaluated" : "omitted",
            reason,
          } satisfies CtiAdjustedGammaAnnualComparison,
        ];
      }),
    ) as Record<number, CtiAdjustedGammaAnnualComparison>;
    const evaluated = Object.values(annual)
      .filter((row) => row.status === "evaluated")
      .map((row) => row.year);
    const omitted = Object.values(annual)
      .filter((row) => row.status === "omitted")
      .map((row) => row.year);
    return {
      gamma: gammaCase.gamma,
      comparisonOnly: true,
      coverage: CTI_ADJUSTED_V2_YEARS.length ? evaluated.length / CTI_ADJUSTED_V2_YEARS.length : 0,
      evaluated,
      omitted,
      reasons: [
        ...new Set(
          omitted
            .map((year) => annual[year].reason)
            .filter((reason): reason is string => reason !== null),
        ),
      ],
      currentV1: v1Values,
      bottomUp,
      externalBenchmarkL,
      annual,
    };
  });
}

function annualizeL(
  input: CtiAdjustedAnnualInput | null | undefined,
  rule: CtiAdjustedLSensitivityRule,
): CtiAdjustedAnnualInput | null | undefined {
  if (!input || rule !== "calendar_year_sum") return input;
  return {
    ...input,
    rows: input.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        総合: typeof row.values.総合 === "number" ? row.values.総合 * 12 : row.values.総合,
      },
    })),
  };
}

function scenarioResult(
  B: CtiAdjustedAnnualInput | null | undefined,
  A: CtiAdjustedAnnualInput | null | undefined,
  L: CtiAdjustedAnnualInput | null | undefined,
  scenario: CtiAdjustedSensitivityScenario,
  residualJumpThreshold: number,
): { result: CtiAdjustedSensitivityScenarioResult; estimate: CtiAdjustedConnectionEstimate } {
  const estimate = buildCtiAdjustedConnectionEstimate(
    B,
    A,
    annualizeL(L, scenario.lAnnualizationRule),
    {
      calibrationYears: scenario.calibrationYears,
      holdoutYears: scenario.holdoutYears,
      target: { connectionYear: scenario.targetYear ?? 2017 },
      residualJumpThreshold,
    },
  );
  const beta = Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => [
      category,
      finiteOrNull(estimate.audit.beta[category].value),
    ]),
  ) as Record<CtiAdjustedMajorCategory, number | null>;
  const d = Object.fromEntries(
    Object.entries(estimate.audit.d.rows).map(([year, row]) => [year, finiteOrNull(row.value)]),
  );
  const estimates = Object.fromEntries(
    estimate.rows
      .filter((row) => row.seriesType === "estimated_adjusted")
      .map((row) => [row.year, finiteOrNull(row.values.総合)]),
  );
  const requiredYears = Array.from({ length: 12 }, (_, index) => 2005 + index);
  const evaluationYears = requiredYears.filter(
    (year) =>
      d[year] !== undefined &&
      estimates[year] !== undefined &&
      d[year] !== null &&
      estimates[year] !== null,
  );
  const omittedYears = requiredYears.filter((year) => !evaluationYears.includes(year));
  const omittedReasons = Object.fromEntries(
    omittedYears.map((year) => {
      const row = estimate.rows.find((candidate) => candidate.year === year);
      return [year, row?.reason ?? estimate.audit.d.rows[year]?.reason ?? "unavailable"];
    }),
  );
  return {
    estimate,
    result: {
      name: scenario.name,
      calibrationYears: [...scenario.calibrationYears],
      holdoutYears: [...scenario.holdoutYears],
      targetYear: scenario.targetYear ?? estimate.audit.betaTargetYear,
      lAnnualizationRule: scenario.lAnnualizationRule,
      status: estimate.audit.validation.valid ? "available" : "unavailable",
      reason: estimate.audit.validation.valid ? null : "invalid_input",
      beta,
      d,
      estimates,
      evaluationYears,
      omittedYears,
      omittedReasons,
      coverage: {
        startYear: 2005,
        endYear: 2016,
        evaluatedYears: evaluationYears,
        omittedYears,
        omittedReasons,
      },
    },
  };
}

/** Compares explicit Plan39 calibration, holdout, and L yearization scenarios. */
export function buildCtiAdjustedSensitivityAnalysis(
  B: CtiAdjustedAnnualInput | null | undefined,
  A: CtiAdjustedAnnualInput | null | undefined,
  L: CtiAdjustedAnnualInput | null | undefined,
  options: CtiAdjustedSensitivityOptions = {},
): CtiAdjustedSensitivityAnalysis {
  const scenarios = options.scenarios ?? DEFAULT_SCENARIOS;
  const threshold =
    finiteOrNull(options.residualJumpThreshold) ?? CTI_ADJUSTED_DEFAULT_RESIDUAL_JUMP_THRESHOLD;
  const scenarioResults = scenarios.map((scenario) => scenarioResult(B, A, L, scenario, threshold));
  const first = scenarioResults[0];
  const second = scenarioResults[1];
  const betaDifference = emptyBeta();
  const dDifference: Record<number, number | null> = {};
  const estimateDifference: Record<number, number | null> = {};
  const estimateDifferences: Record<number, Record<CtiAdjustedMajorCategory, number | null>> = {};
  let maxRelativeDifference: number | null = null;
  if (first && second) {
    for (const category of CTI_ADJUSTED_MAJOR_CATEGORIES) {
      betaDifference[category] =
        first.result.beta[category] !== null && second.result.beta[category] !== null
          ? second.result.beta[category]! - first.result.beta[category]!
          : null;
    }
    const years = Array.from({ length: 12 }, (_, index) => 2005 + index);
    for (const year of years) {
      const dA = first.result.d[year] ?? null;
      const dB = second.result.d[year] ?? null;
      dDifference[year] = dA !== null && dB !== null ? dB - dA : null;
      const estimateA = first.result.estimates[year] ?? null;
      const estimateB = second.result.estimates[year] ?? null;
      estimateDifference[year] =
        estimateA !== null && estimateB !== null ? estimateB - estimateA : null;
      const categoryDifference = emptyBeta();
      const rowA = first.estimate.rows.find((row) => row.year === year);
      const rowB = second.estimate.rows.find((row) => row.year === year);
      for (const category of CTI_ADJUSTED_MAJOR_CATEGORIES) {
        const valueA = finiteOrNull(rowA?.values[category]);
        const valueB = finiteOrNull(rowB?.values[category]);
        categoryDifference[category] = valueA !== null && valueB !== null ? valueB - valueA : null;
      }
      estimateDifferences[year] = categoryDifference;
      if (estimateA !== null && estimateB !== null && estimateA !== 0) {
        const relative = Math.abs(estimateB - estimateA) / Math.abs(estimateA);
        maxRelativeDifference =
          maxRelativeDifference === null ? relative : Math.max(maxRelativeDifference, relative);
      }
    }
  }
  const maxBeta = finiteOrNull(options.maxBetaDifference) ?? 0.05;
  const maxD = finiteOrNull(options.maxDDifference) ?? 0.05;
  const maxEstimate = finiteOrNull(options.maxEstimateRelativeDifference) ?? 0.05;
  const betaPassed = Object.values(betaDifference).every(
    (value) => value !== null && Math.abs(value) <= maxBeta,
  );
  const dPassed = Object.values(dDifference).every(
    (value) => value !== null && Math.abs(value) <= maxD,
  );
  const evaluatedDifferenceYears = Object.keys(dDifference)
    .map(Number)
    .filter(
      (year) =>
        dDifference[year] !== null &&
        estimateDifference[year] !== null &&
        Object.values(estimateDifferences[year] ?? {}).every(
          (value) => value !== null && Number.isFinite(value),
        ),
    );
  const finiteDifferences =
    Object.values(betaDifference).every((value) => value !== null && Number.isFinite(value)) &&
    evaluatedDifferenceYears.length > 0 &&
    evaluatedDifferenceYears.every(
      (year) => Number.isFinite(dDifference[year]!) && Number.isFinite(estimateDifference[year]!),
    );
  const estimatePassed =
    finiteDifferences &&
    maxRelativeDifference !== null &&
    Number.isFinite(maxRelativeDifference) &&
    maxRelativeDifference <= maxEstimate;
  const requiredYears = Array.from({ length: 12 }, (_, index) => 2005 + index);
  const evaluatedYears =
    first?.result.evaluationYears.filter((year) => second?.result.evaluationYears.includes(year)) ??
    [];
  const omittedYears = requiredYears.filter((year) => !evaluatedYears.includes(year));
  const coveragePassed = omittedYears.length === 0;
  const reasonCodes: string[] = [];
  if (!betaPassed) reasonCodes.push("insufficient_beta_difference");
  if (!dPassed) reasonCodes.push("insufficient_d_difference");
  if (!estimatePassed || !coveragePassed) reasonCodes.push("insufficient_estimate_difference");
  const valid =
    scenarioResults.length >= 2 &&
    scenarioResults.every(({ result }) => result.status === "available");
  const evaluable = valid && finiteDifferences;
  return {
    status: evaluable ? "available" : "unavailable",
    reason: evaluable ? null : valid ? "not_evaluable" : "scenario_unavailable",
    scenarios: scenarioResults.map(({ result }) => result),
    betaDifference,
    dDifference,
    estimateDifference,
    estimateDifferences,
    maxRelativeDifference,
    gammaScenarios: gammaScenarioResults(
      B,
      A,
      L,
      scenarioResults[0]?.estimate ??
        buildCtiAdjustedConnectionEstimate(B, A, L, { residualJumpThreshold: threshold }),
    ),
    acceptance: {
      maxBetaDifference: maxBeta,
      maxDDifference: maxD,
      maxEstimateRelativeDifference: maxEstimate,
      betaPassed,
      dPassed,
      estimatePassed,
      coveragePassed,
      evaluatedYears,
      requiredYears,
      omittedYears,
      reasonCodes,
      accepted:
        valid && finiteDifferences && betaPassed && dPassed && estimatePassed && coveragePassed,
    },
  };
}

export const analyzeCtiAdjustedSensitivity = buildCtiAdjustedSensitivityAnalysis;
