/** Plan39-v2 bottom-up connection estimate. */
import {
  CTI_ADJUSTED_INPUT_CATEGORIES,
  CTI_ADJUSTED_MAJOR_CATEGORIES,
  CTI_ADJUSTED_TOTAL_CATEGORY,
  type CtiAdjustedAnnualInput,
  type CtiAdjustedAnnualRow,
  type CtiAdjustedMajorCategory,
} from "./ctiAdjustedConnectionEstimate";

export const CTI_ADJUSTED_V2_OTHER_CATEGORY = "その他の消費支出" as const;
export const CTI_ADJUSTED_V2_ESTIMATE_YEARS = Array.from({ length: 12 }, (_, i) => 2005 + i);
export const CTI_ADJUSTED_V2_CALIBRATION_YEARS = Array.from({ length: 8 }, (_, i) => 2018 + i);
export const CTI_ADJUSTED_V2_CONNECTION_YEAR = 2017 as const;
export const CTI_ADJUSTED_V2_YEARS = Array.from({ length: 21 }, (_, i) => 2005 + i);
export const CTI_ADJUSTED_V2_GAMMAS = [0, 0.25, 0.5, 0.75, 1] as const;
export const CTI_ADJUSTED_V2_RESIDUAL_JUMP_THRESHOLD = 1.4 as const;
export const CTI_ADJUSTED_V2_THRESHOLD_EPSILON = 1e-9 as const;
export type CtiAdjustedV2Category =
  | typeof CTI_ADJUSTED_TOTAL_CATEGORY
  | CtiAdjustedMajorCategory
  | typeof CTI_ADJUSTED_V2_OTHER_CATEGORY;
export type CtiAdjustedV2Status = "available" | "invalid" | "insufficient-data";
export type CtiAdjustedV2SeriesType = "estimated_bottom_up" | "official_adjusted" | "unavailable";
export type CtiAdjustedV2Row = {
  year: number;
  seriesType: CtiAdjustedV2SeriesType;
  official: boolean;
  status: CtiAdjustedV2Status;
  reason: string | null;
  values: Record<CtiAdjustedV2Category, number | null>;
};
export type CtiAdjustedV2BetaDiagnostic = {
  beta: number | null;
  observations: number;
  numerator: number | null;
  denominator: number | null;
  years: readonly number[];
  status: CtiAdjustedV2Status;
  reason: string | null;
  finiteInputs: boolean;
  logInputs: boolean;
  minimumObservations: number;
  zeroVariance: boolean;
};
export type CtiAdjustedV2OtherDiagnostics = {
  derived: Record<number, number | null>;
  officialOther: Record<number, number | null>;
  ratio2017: number | null;
  beta: CtiAdjustedV2BetaDiagnostic;
  status: CtiAdjustedV2Status;
  reasons: readonly string[];
};
export type CtiAdjustedV2ResidualObservation = {
  year: number;
  source: "B" | "A" | null;
  seriesType: "observed" | "estimated" | "unavailable";
  total: number | null;
  majorSum: number | null;
  other: number | null;
  status: "available" | "unavailable";
  reason: string | null;
};
export type CtiAdjustedV2ResidualJump = {
  previousYear: number | null;
  delta?: number | null;
  absoluteDifference?: number | null;
  relativeChange?: number | null;
  yearOverYearRatio: number | null;
  otherDelta?: number | null;
  otherAbsoluteDifference?: number | null;
  otherYearOverYearRatio?: number | null;
  thresholdSource?: "generated_bottom_up" | "official_a";
  thresholdSeriesType?: "estimated" | "official";
  finite?: boolean;
  thresholdPass?: boolean | null;
  exceeded: boolean | null;
  previous: CtiAdjustedV2ResidualObservation | null;
  current: CtiAdjustedV2ResidualObservation | null;
  status: "available" | "unavailable";
  reason: string | null;
};
export type CtiAdjustedV2ThresholdMetadata = {
  source: "official-a-2017-2025";
  baselineYears: readonly [2017, 2025];
  indicator: "Other前年差";
  derivedMaxAbsoluteDelta: number | null;
  comparison: "abs(delta)>threshold";
  inclusive: false;
  epsilon: number;
};
export type CtiAdjustedV2ResidualDiagnostics = {
  residualMajor: Record<number, number | null>;
  residualWithOther: Record<number, number | null>;
  jumps: Record<number, CtiAdjustedV2ResidualJump>;
  boundary2016To2017: CtiAdjustedV2ResidualJump & { fromYear: 2016; toYear: 2017 };
  threshold: number;
  thresholdMetadata: CtiAdjustedV2ThresholdMetadata | "provisional-frozen";
  status: CtiAdjustedV2Status;
  generationSource: "diagnostic-only";
};
export type CtiAdjustedV2GammaCase = {
  gamma: (typeof CTI_ADJUSTED_V2_GAMMAS)[number];
  comparisonOnly: true;
  values: Record<number, number | null>;
  coverage: number;
  omitted: readonly number[];
  reasons: readonly string[];
};
export type CtiAdjustedV2Options = {
  /** Selects the input contract owned by the caller. Runtime Plan39 artifacts do not satisfy Plan40's wider annual-anchor contract. */
  contract?: "plan39" | "plan40";
  calibrationYears?: readonly number[];
  estimateStartYear?: number;
  estimateEndYear?: number;
  officialStartYear?: number;
  connectionYear?: number;
  minBetaObservations?: number;
};
export type CtiAdjustedV2PublicationGate = {
  accepted: boolean;
  status: CtiAdjustedV2Status | "pass";
  reasonCodes: readonly string[];
  blockingReasonCodes: readonly string[];
  warningReasonCodes: readonly string[];
  diagnostics: readonly string[];
};
export type CtiAdjustedV2Plan40InputValidation = {
  valid: boolean;
  status: "available" | "invalid";
  reasonCodes: readonly string[];
  diagnostics: readonly string[];
  targetYears: readonly number[];
  inputCategories: readonly string[];
  normalizedBaseYear: 2025 | null;
};
export type CtiAdjustedV2Plan40InputMetadata = {
  baseYear: number;
  rawRange: { startYear: number; endYear: number };
  adoptedRange: { startYear: number; endYear: number };
};
export type CtiAdjustedV2Result = {
  model: "v2-bottom-up";
  estimateVersion: "plan39-v2";
  years: readonly number[];
  rows: readonly CtiAdjustedV2Row[];
  categories: Record<CtiAdjustedV2Category, Record<number, number | null>>;
  other: CtiAdjustedV2OtherDiagnostics;
  residual: CtiAdjustedV2ResidualDiagnostics;
  beta: Record<CtiAdjustedV2Category, CtiAdjustedV2BetaDiagnostic | null>;
  fitDiagnostics: Record<CtiAdjustedV2Category, CtiAdjustedV2BetaDiagnostic | null>;
  benchmarkG: Record<number, number | null>;
  benchmarkGDiagnostics: {
    baselineYear: number;
    availableYears: readonly number[];
    missingYears: readonly number[];
    coverage: number;
    finite: boolean;
    longTermDeviation: {
      available: boolean;
      maxAbsoluteDeviation: number | null;
      years: readonly number[];
    };
    status: "insufficient-data" | "available" | "invalid";
    reason: string | null;
  };
  artifactValidation: Record<
    "B" | "A" | "L",
    {
      valid: boolean;
      reasons: readonly string[];
      diagnostics: readonly string[];
      duplicateYears: readonly number[];
      observedYears: readonly number[];
    }
  >;
  /** Present for results produced by the Plan40-aware builder; optional for legacy fixtures. */
  plan40InputValidation?: CtiAdjustedV2Plan40InputValidation;
  plan40InputMetadata?: Partial<Record<"B" | "A" | "L", CtiAdjustedV2Plan40InputMetadata>>;
  publicationGate: CtiAdjustedV2PublicationGate;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
const categories = [
  CTI_ADJUSTED_TOTAL_CATEGORY,
  ...CTI_ADJUSTED_MAJOR_CATEGORIES,
  CTI_ADJUSTED_V2_OTHER_CATEGORY,
] as CtiAdjustedV2Category[];
const emptyValues = () =>
  Object.fromEntries(categories.map((c) => [c, null])) as Record<
    CtiAdjustedV2Category,
    number | null
  >;
const rowMap = (input: CtiAdjustedAnnualInput | null | undefined) =>
  new Map((input?.rows ?? []).map((r) => [r.year, r]));
const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
  Boolean(a && a.length === b.length && a.every((v, i) => v === b[i]));
const validateArtifact = (
  name: "B" | "A" | "L",
  input: CtiAdjustedAnnualInput | null | undefined,
  strictPlan40 = false,
) => {
  const reasons: string[] = [],
    diagnostics: string[] = [],
    duplicateYears: number[] = [],
    observedYears: number[] = [],
    required = name === "L" ? [CTI_ADJUSTED_TOTAL_CATEGORY] : [...CTI_ADJUSTED_INPUT_CATEGORIES],
    requiredYears =
      name === "A"
        ? Array.from({ length: 9 }, (_, i) => 2017 + i)
        : name === "B"
          ? CTI_ADJUSTED_V2_YEARS
          : Array.from({ length: 13 }, (_, i) => 2005 + i);
  if (!input)
    return {
      valid: false,
      reasons: [name === "L" ? "L:missing_l_artifact" : `${name}:missing_artifact`],
      diagnostics,
      duplicateYears,
      observedYears,
    };
  const order = input.categoryOrder ?? [];
  const orderCounts = new Map<string, number>();
  for (const category of order) orderCounts.set(category, (orderCounts.get(category) ?? 0) + 1);
  for (const [category, count] of orderCounts)
    if (count > 1) reasons.push(`${name}:duplicate_category:${category}`);
  for (const category of order)
    if (!required.includes(category as never))
      diagnostics.push(`${name}:ignored_category:${category}`);
  const seen = new Set<number>();
  for (const row of input.rows ?? []) {
    if (seen.has(row.year)) duplicateYears.push(row.year);
    seen.add(row.year);
    observedYears.push(row.year);
    for (const c of required)
      if (!Object.prototype.hasOwnProperty.call(row.values, c))
        reasons.push(`${name}:missing_category:${row.year}:${c}`);
      else if (!finite(row.values[c])) reasons.push(`${name}:non_finite_value:${row.year}:${c}`);
      else if (!positive(row.values[c]))
        reasons.push(`${name}:non_positive_value:${row.year}:${c}`);
    for (const c of Object.keys(row.values))
      if (!required.includes(c as never))
        diagnostics.push(`${name}:extra_category:${row.year}:${c}`);
  }
  if (duplicateYears.length) reasons.push(`${name}:duplicate_year:${duplicateYears.join(",")}`);
  const raw = input.metadata?.rawRange,
    adopted = input.metadata?.adoptedRange;
  const strictPlan40RangeYears =
    name === "A" ? [2017, 2025] : name === "B" ? [2005, 2017, 2025] : [2005, 2017];
  if (!raw) reasons.push(`${name}:missing_raw_range`);
  else if (!finite(raw.startYear) || !finite(raw.endYear))
    reasons.push(`${name}:non_finite_raw_range`);
  else if (raw.startYear > raw.endYear) reasons.push(`${name}:reversed_raw_range`);
  else {
    for (const year of observedYears)
      if (year < raw.startYear || year > raw.endYear)
        reasons.push(`${name}:raw_range_data_mismatch:${year}`);
    if (strictPlan40)
      for (const year of strictPlan40RangeYears)
        if (year < raw.startYear || year > raw.endYear)
          reasons.push(`${name}:raw_range_excludes_target:${year}`);
  }
  if (!adopted) reasons.push(`${name}:missing_adopted_range`);
  else if (!finite(adopted.startYear) || !finite(adopted.endYear))
    reasons.push(`${name}:non_finite_adopted_range`);
  else if (adopted.startYear > adopted.endYear) reasons.push(`${name}:reversed_adopted_range`);
  else {
    for (const year of observedYears)
      if (year < adopted.startYear || year > adopted.endYear)
        reasons.push(`${name}:adopted_range_data_mismatch:${year}`);
    if (strictPlan40)
      for (const year of strictPlan40RangeYears)
        if (year < adopted.startYear || year > adopted.endYear)
          reasons.push(`${name}:adopted_range_excludes_target:${year}`);
    if (raw && finite(raw.startYear) && finite(raw.endYear) && raw.startYear <= raw.endYear) {
      if (adopted.startYear < raw.startYear || adopted.endYear > raw.endYear)
        reasons.push(`${name}:adopted_range_outside_raw`);
    }
  }
  for (const year of requiredYears)
    if (!seen.has(year)) reasons.push(`${name}:missing_required_year:${year}`);
  return {
    valid: reasons.length === 0,
    reasons,
    diagnostics: [...new Set(diagnostics)],
    duplicateYears,
    observedYears,
  };
};
const requiredPlan40Metadata = [
  "source",
  "artifact",
  "retrievedAt",
  "unit",
  "valueType",
  "householdScope",
  "frequency",
  "missingRepresentation",
] as const;

/**
 * Plan40's annual-anchor contract.  This is intentionally fail-closed: the
 * quarterly layer must not manufacture a category when provenance or an
 * annual anchor is incomplete.
 */
export const validateCtiAdjustedV2Plan40Inputs = (
  B: CtiAdjustedAnnualInput | null | undefined,
  A: CtiAdjustedAnnualInput | null | undefined,
  L: CtiAdjustedAnnualInput | null | undefined,
): CtiAdjustedV2Plan40InputValidation => {
  const targetYears = Array.from({ length: 13 }, (_, index) => 2005 + index);
  const inputCategories = [...CTI_ADJUSTED_INPUT_CATEGORIES];
  const validation = {
    B: validateArtifact("B", B, true),
    A: validateArtifact("A", A, true),
    L: validateArtifact("L", L, true),
  };
  const reasons = new Set<string>();
  const diagnostics: string[] = [];
  for (const [name, input] of Object.entries({ B, A, L }) as [
    "B" | "A" | "L",
    CtiAdjustedAnnualInput | null | undefined,
  ][]) {
    for (const reason of validation[name].reasons) reasons.add(reason);
    if (!input) continue;
    for (const field of requiredPlan40Metadata) {
      const value = input.metadata?.[field];
      if (typeof value !== "string" || value.trim() === "")
        reasons.add(`${name}:missing_metadata:${field}`);
    }
    if (input.metadata?.baseYear === undefined) reasons.add(`${name}:missing_base_year`);
    else if (!finite(input.metadata.baseYear)) reasons.add(`${name}:non_finite_base_year`);
    else if (input.metadata.baseYear !== 2025) reasons.add(`${name}:base_year_not_2025`);
    if (input.metadata?.frequency !== "annual") reasons.add(`${name}:frequency_not_annual`);
    const adopted = input.metadata?.adoptedRange;
    const metadataTargetYears =
      name === "A" ? [2017, 2025] : name === "B" ? [...targetYears, 2025] : targetYears;
    if (
      adopted &&
      finite(adopted.startYear) &&
      finite(adopted.endYear) &&
      adopted.startYear <= adopted.endYear
    )
      for (const year of metadataTargetYears)
        if (year < adopted.startYear || year > adopted.endYear)
          reasons.add(`${name}:adopted_range_excludes_target:${year}`);
    const raw = input.metadata?.rawRange;
    if (raw && finite(raw.startYear) && finite(raw.endYear) && raw.startYear <= raw.endYear)
      for (const year of metadataTargetYears)
        if (year < raw.startYear || year > raw.endYear)
          reasons.add(`${name}:raw_range_excludes_target:${year}`);
    diagnostics.push(...validation[name].diagnostics);
  }
  const a2025 = A?.rows.find((row) => row.year === 2025)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
  if (!positive(a2025)) reasons.add("A:missing_or_non_positive_2025_anchor");
  const normalizedBaseYear =
    A?.metadata?.baseYear === 2025 && positive(a2025) ? (2025 as const) : null;
  return {
    valid: reasons.size === 0,
    status: reasons.size === 0 ? "available" : "invalid",
    reasonCodes: [...reasons],
    diagnostics: [...new Set(diagnostics)],
    targetYears,
    inputCategories,
    normalizedBaseYear,
  };
};
const deriveOther = (row: CtiAdjustedAnnualRow | undefined) => {
  const total = row?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
  if (!positive(total)) return null;
  const sum = CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((s, c) => {
      const v = row?.values[c];
      return positive(v) ? s + v : NaN;
    }, 0),
    other = total - sum;
  return positive(other) ? other : null;
};
const fitBeta = (
  ratios: Map<number, { total: number | null; other: number | null }>,
  years: readonly number[],
  minObservations: number,
): CtiAdjustedV2BetaDiagnostic => {
  const xs: number[] = [],
    ys: number[] = [],
    used: number[] = [];
  for (const year of years) {
    const r = ratios.get(year);
    if (!positive(r?.total) || !positive(r?.other)) continue;
    const x = Math.log(r.total),
      y = Math.log(r.other);
    if (!finite(x) || !finite(y)) continue;
    xs.push(x);
    ys.push(y);
    used.push(year);
  }
  const numerator = xs.reduce((s, x, i) => s + x * ys[i], 0),
    denominator = xs.reduce((s, x) => s + x * x, 0),
    mean = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null,
    variance = mean === null ? 0 : xs.reduce((s, x) => s + (x - mean) ** 2, 0),
    zeroVariance = xs.length > 0 && variance === 0,
    enough = used.length >= minObservations,
    beta = enough && denominator > 0 && !zeroVariance ? numerator / denominator : null,
    reason = !enough
      ? "beta_minimum_observations_not_met"
      : zeroVariance
        ? "beta_zero_variance"
        : denominator <= 0
          ? "beta_denominator_not_positive"
          : !finite(beta)
            ? "beta_non_finite_fit"
            : null;
  return {
    beta: finite(beta) ? beta : null,
    observations: used.length,
    numerator: used.length ? numerator : null,
    denominator: used.length ? denominator : null,
    years: used,
    status: finite(beta) ? "available" : "insufficient-data",
    reason,
    finiteInputs: xs.length === used.length && ys.length === used.length,
    logInputs: xs.length === used.length,
    minimumObservations: minObservations,
    zeroVariance,
  };
};
const gammaValue = (
  B: CtiAdjustedAnnualInput,
  A: CtiAdjustedAnnualInput,
  gamma: number,
  year: number,
) => {
  const br = rowMap(B),
    ar = rowMap(A),
    b = br.get(year)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
    a = ar.get(year)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
    b0 = br.get(2017)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
    a0 = ar.get(2017)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
  if (!positive(b) || !positive(a) || !positive(b0) || !positive(a0)) return null;
  const value = b * (a0 / b0) * Math.pow(a / b, gamma);
  return finite(value) && value > 0 ? value : null;
};
export const generateCtiAdjustedV2GammaCases = (
  B: CtiAdjustedAnnualInput,
  A: CtiAdjustedAnnualInput,
  years: readonly number[] = CTI_ADJUSTED_V2_ESTIMATE_YEARS,
): CtiAdjustedV2GammaCase[] =>
  CTI_ADJUSTED_V2_GAMMAS.map((gamma) => {
    const values = Object.fromEntries(years.map((year) => [year, gammaValue(B, A, gamma, year)]));
    const omitted = years.filter((y) => values[y] === null);
    return {
      gamma,
      comparisonOnly: true,
      values,
      coverage: years.length ? (years.length - omitted.length) / years.length : 0,
      omitted,
      reasons: omitted.map((y) => `missing_or_non_positive_input:${y}`),
    };
  });

export function buildCtiAdjustedV2Estimate(
  B: CtiAdjustedAnnualInput | null | undefined,
  A: CtiAdjustedAnnualInput | null | undefined,
  L: CtiAdjustedAnnualInput | null | undefined,
  options: CtiAdjustedV2Options = {},
): CtiAdjustedV2Result {
  const contract = options.contract ?? "plan39";
  const fixed: string[] = [];
  if (options.connectionYear !== undefined && options.connectionYear !== 2017)
    fixed.push("plan39_connection_year_override_rejected");
  if (options.officialStartYear !== undefined && options.officialStartYear !== 2017)
    fixed.push("plan39_official_start_year_override_rejected");
  if (options.estimateStartYear !== undefined && options.estimateStartYear !== 2005)
    fixed.push("plan39_target_start_year_override_rejected");
  if (options.estimateEndYear !== undefined && options.estimateEndYear !== 2016)
    fixed.push("plan39_target_end_year_override_rejected");
  if (
    options.calibrationYears !== undefined &&
    !same(options.calibrationYears, CTI_ADJUSTED_V2_CALIBRATION_YEARS)
  )
    fixed.push("plan39_calibration_years_override_rejected");
  const validation = {
      B: validateArtifact("B", B, contract === "plan40"),
      A: validateArtifact("A", A, contract === "plan40"),
      L: validateArtifact("L", L, contract === "plan40"),
    },
    plan40InputValidation =
      contract === "plan40" ? validateCtiAdjustedV2Plan40Inputs(B, A, L) : undefined,
    diagnostics = [
      ...fixed,
      ...Object.values(validation).flatMap((v) => [...v.reasons, ...v.diagnostics]),
      ...(plan40InputValidation?.reasonCodes ?? []),
      ...(plan40InputValidation?.diagnostics ?? []),
    ],
    plan40EstimateInputsUsable = !plan40InputValidation || plan40InputValidation.valid,
    bRows = rowMap(B),
    aRows = rowMap(A),
    lRows = rowMap(L),
    otherDerived: Record<number, number | null> = {},
    officialOther: Record<number, number | null> = {};
  for (const y of CTI_ADJUSTED_V2_YEARS) {
    otherDerived[y] = deriveOther(aRows.get(y));
    officialOther[y] = y >= 2017 ? otherDerived[y] : null;
  }
  const ratios = new Map<number, { total: number | null; other: number | null }>();
  for (const y of CTI_ADJUSTED_V2_YEARS) {
    const bo = deriveOther(bRows.get(y)),
      ao = deriveOther(aRows.get(y)),
      bt = bRows.get(y)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      at = aRows.get(y)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    ratios.set(y, {
      total: positive(bt) && positive(at) ? at / bt : null,
      other: positive(bo) && positive(ao) ? ao / bo : null,
    });
  }
  const requestedMinObs = options.minBetaObservations ?? 3,
    validMinObs =
      Number.isFinite(requestedMinObs) && Number.isInteger(requestedMinObs) && requestedMinObs >= 3,
    minObs = validMinObs ? requestedMinObs : 3;
  if (!validMinObs) diagnostics.push("invalid_min_beta_observations");
  const categoryBeta = Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => {
      const rs = new Map<number, { total: number | null; other: number | null }>();
      for (const y of CTI_ADJUSTED_V2_CALIBRATION_YEARS) {
        const b = bRows.get(y)?.values[c],
          a = aRows.get(y)?.values[c];
        rs.set(y, {
          total: ratios.get(y)?.total ?? null,
          other: positive(a) && positive(b) ? a / b : null,
        });
      }
      return [c, fitBeta(rs, CTI_ADJUSTED_V2_CALIBRATION_YEARS, minObs)];
    }),
  ) as Record<CtiAdjustedMajorCategory, CtiAdjustedV2BetaDiagnostic>;
  const otherBeta = fitBeta(ratios, CTI_ADJUSTED_V2_CALIBRATION_YEARS, minObs),
    bo17 = deriveOther(bRows.get(2017)),
    ao17 = deriveOther(aRows.get(2017)),
    ratio2017 = positive(bo17) && positive(ao17) ? ao17 / bo17 : null;
  if (ratio2017 === null) diagnostics.push("other_connection_ratio_unavailable");
  if (otherBeta.status !== "available")
    diagnostics.push(otherBeta.reason ?? "other_beta_unavailable");
  const d: Record<number, number | null> = {};
  for (const y of CTI_ADJUSTED_V2_ESTIMATE_YEARS) {
    const l = lRows.get(y)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      l0 = lRows.get(2017)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      b = bRows.get(y)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      b0 = bRows.get(2017)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    d[y] = positive(l) && positive(l0) && positive(b) && positive(b0) ? l / l0 / (b / b0) : null;
  }
  const rows: CtiAdjustedV2Row[] = [],
    series = Object.fromEntries(categories.map((c) => [c, {}])) as Record<
      CtiAdjustedV2Category,
      Record<number, number | null>
    >;
  for (const y of CTI_ADJUSTED_V2_YEARS) {
    const values = emptyValues();
    let valid = false;
    let reason: string | null = null;
    if (plan40EstimateInputsUsable && y >= 2017) {
      for (const c of CTI_ADJUSTED_INPUT_CATEGORIES)
        values[c] = finite(aRows.get(y)?.values[c]) ? aRows.get(y)!.values[c]! : null;
      values[CTI_ADJUSTED_V2_OTHER_CATEGORY] = officialOther[y];
      valid =
        values[CTI_ADJUSTED_TOTAL_CATEGORY] !== null &&
        CTI_ADJUSTED_MAJOR_CATEGORIES.every((c) => values[c] !== null) &&
        positive(values[CTI_ADJUSTED_V2_OTHER_CATEGORY]);
      reason = valid ? null : "official_a_or_official_other_unavailable";
    } else if (
      plan40EstimateInputsUsable &&
      d[y] !== null &&
      ratio2017 !== null &&
      otherBeta.status === "available" &&
      !fixed.length &&
      validation.B.valid &&
      validation.A.valid
    ) {
      for (const c of CTI_ADJUSTED_MAJOR_CATEGORIES) {
        const beta = categoryBeta[c].beta,
          bv = bRows.get(y)?.values[c],
          ba = aRows.get(2017)?.values[c],
          bb = bRows.get(2017)?.values[c];
        values[c] =
          positive(bv) && positive(ba) && positive(bb) && finite(beta)
            ? bv * (ba / bb) * Math.pow(d[y]!, beta)
            : null;
      }
      const bo = deriveOther(bRows.get(y));
      values[CTI_ADJUSTED_V2_OTHER_CATEGORY] =
        positive(bo) && finite(otherBeta.beta)
          ? bo * ratio2017 * Math.pow(d[y]!, otherBeta.beta)
          : null;
      const total =
        CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((s, c) => s + (values[c] ?? 0), 0) +
        (values[CTI_ADJUSTED_V2_OTHER_CATEGORY] ?? 0);
      values[CTI_ADJUSTED_TOTAL_CATEGORY] = positive(total) ? total : null;
      valid =
        positive(values[CTI_ADJUSTED_TOTAL_CATEGORY]) &&
        CTI_ADJUSTED_MAJOR_CATEGORIES.every((c) => positive(values[c])) &&
        positive(values[CTI_ADJUSTED_V2_OTHER_CATEGORY]);
      reason = valid ? null : "insufficient_data_for_bottom_up_estimate";
    } else
      reason = plan40EstimateInputsUsable
        ? "insufficient_data_for_bottom_up_estimate"
        : "plan40_input_contract_invalid";
    const row = {
      year: y,
      seriesType: valid ? (y >= 2017 ? "official_adjusted" : "estimated_bottom_up") : "unavailable",
      official: y >= 2017,
      status: valid ? "available" : "insufficient-data",
      reason,
      values,
    } as CtiAdjustedV2Row;
    rows.push(row);
    for (const c of categories) series[c][y] = values[c];
  }
  const residualMajor: Record<number, number | null> = {},
    residualWithOther: Record<number, number | null> = {},
    legacyResidual: Record<number, number | null> = {},
    observations: Record<number, CtiAdjustedV2ResidualObservation> = {};
  for (const y of CTI_ADJUSTED_V2_YEARS) {
    const source = y >= 2017 ? "A" : "B",
      input = source === "A" ? aRows.get(y) : bRows.get(y),
      total = input?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      majorValues = CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => input?.values[c]),
      majorSum = majorValues.every(finite) ? majorValues.reduce((s, v) => s + v!, 0) : null,
      other = finite(total) && finite(majorSum) ? total! - majorSum! : null,
      available = finite(total) && finite(majorSum) && finite(other),
      reason = !input
        ? `missing_${source}_observed_row`
        : !finite(total)
          ? "observed_total_unavailable"
          : !finite(majorSum)
            ? "observed_major_categories_unavailable"
            : !finite(other)
              ? "observed_other_unavailable"
              : null;
    residualMajor[y] = available ? other : null;
    residualWithOther[y] =
      y < 2017
        ? (rows.find((row) => row.year === y)?.values[CTI_ADJUSTED_V2_OTHER_CATEGORY] ?? null)
        : available
          ? other
          : null;
    legacyResidual[y] = finite(input?.values["残差"]) ? input!.values["残差"]! : residualMajor[y];
    observations[y] = {
      year: y,
      source,
      seriesType: available ? (y >= 2017 ? "observed" : "estimated") : "unavailable",
      total: finite(total) ? total! : null,
      majorSum,
      other: finite(other) ? other : null,
      status: available ? "available" : "unavailable",
      reason,
    };
  }
  const officialDeltas: number[] = [];
  for (let year = 2018; year <= 2025; year++) {
    const previous = residualWithOther[year - 1],
      current = residualWithOther[year];
    if (finite(previous) && finite(current)) officialDeltas.push(Math.abs(current - previous));
  }
  const derivedThreshold = officialDeltas.length ? Math.max(...officialDeltas) : null,
    threshold = CTI_ADJUSTED_V2_RESIDUAL_JUMP_THRESHOLD;
  const jumps: Record<number, CtiAdjustedV2ResidualJump> = {};
  for (let i = 1; i < CTI_ADJUSTED_V2_YEARS.length; i++) {
    const year = CTI_ADJUSTED_V2_YEARS[i],
      previousYear = CTI_ADJUSTED_V2_YEARS[i - 1],
      p = residualWithOther[previousYear],
      c = residualWithOther[year],
      otherDelta = finite(p) && finite(c) ? c - p : null,
      otherAbsoluteDifference = finite(otherDelta) ? Math.abs(otherDelta) : null,
      otherRatio = finite(p) && finite(c) && p !== 0 ? c / p : null,
      legacyPrevious = legacyResidual[previousYear],
      legacyCurrent = legacyResidual[year],
      delta =
        finite(legacyPrevious) && finite(legacyCurrent) ? legacyCurrent - legacyPrevious : null,
      absoluteDifference = finite(delta) ? Math.abs(delta) : null,
      ratio =
        finite(legacyPrevious) && finite(legacyCurrent) && legacyPrevious !== 0
          ? legacyCurrent / legacyPrevious
          : null,
      previous = observations[previousYear],
      current = observations[year],
      finiteValues = finite(otherDelta) && finite(otherAbsoluteDifference),
      thresholdPass = finiteValues
        ? otherAbsoluteDifference! <= threshold + CTI_ADJUSTED_V2_THRESHOLD_EPSILON
        : null,
      reason = !finiteValues
        ? `other_delta_unavailable:${previous.reason ?? current.reason ?? "missing_value"}`
        : thresholdPass
          ? null
          : "other_delta_threshold_exceeded";
    jumps[year] = {
      previousYear,
      delta,
      absoluteDifference,
      relativeChange:
        finite(legacyPrevious) && finite(legacyCurrent) && legacyPrevious !== 0
          ? delta! / Math.abs(legacyPrevious)
          : null,
      yearOverYearRatio: ratio,
      otherDelta,
      otherAbsoluteDifference,
      otherYearOverYearRatio: otherRatio,
      thresholdSource: year < 2017 ? "generated_bottom_up" : "official_a",
      thresholdSeriesType: year < 2017 ? "estimated" : "official",
      finite: finiteValues,
      thresholdPass,
      exceeded: thresholdPass === null ? null : !thresholdPass,
      previous,
      current,
      status: finiteValues ? "available" : "unavailable",
      reason,
    };
  }
  const boundary = jumps[2017] ?? {
    previousYear: 2016,
    delta: null,
    absoluteDifference: null,
    relativeChange: null,
    yearOverYearRatio: null,
    otherDelta: null,
    otherAbsoluteDifference: null,
    otherYearOverYearRatio: null,
    finite: false,
    thresholdPass: null,
    exceeded: null,
    previous: observations[2016] ?? null,
    current: observations[2017] ?? null,
    status: "unavailable" as const,
    reason: "other_delta_unavailable",
  };
  const benchmarkG: Record<number, number | null> = {},
    available: number[] = [],
    missing: number[] = [],
    base = rows.find((r) => r.year === 2017),
    baseValue =
      base &&
      CTI_ADJUSTED_MAJOR_CATEGORIES.every((c) => positive(base.values[c])) &&
      positive(base.values[CTI_ADJUSTED_V2_OTHER_CATEGORY])
        ? CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((s, c) => s + base.values[c]!, 0) +
          base.values[CTI_ADJUSTED_V2_OTHER_CATEGORY]!
        : null,
    l0 = lRows.get(2017)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
  for (const y of CTI_ADJUSTED_V2_YEARS) {
    const r = rows[y - 2005],
      bottom =
        CTI_ADJUSTED_MAJOR_CATEGORIES.every((c) => positive(r.values[c])) &&
        positive(r.values[CTI_ADJUSTED_V2_OTHER_CATEGORY])
          ? CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((s, c) => s + r.values[c]!, 0) +
            r.values[CTI_ADJUSTED_V2_OTHER_CATEGORY]!
          : null,
      l = lRows.get(y)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    benchmarkG[y] =
      positive(bottom) && positive(baseValue) && positive(l) && positive(l0)
        ? bottom / baseValue / (l / l0)
        : null;
    if (benchmarkG[y] === null) missing.push(y);
    else available.push(y);
  }
  const finiteG = available.every((y) => finite(benchmarkG[y])),
    deviations = available.filter((y) => Math.abs((benchmarkG[y] ?? 1) - 1) > 0.1),
    gStatus = !validation.L.valid
      ? "invalid"
      : !available.length
        ? "insufficient-data"
        : finiteG
          ? "available"
          : "invalid";
  if (!finiteG) diagnostics.push("benchmark_g_invalid");
  const invalidInput = Object.values(validation).some((v) => !v.valid),
    status =
      fixed.length || invalidInput || plan40InputValidation?.valid === false
        ? "invalid"
        : diagnostics.some((item) => item === "benchmark_g_invalid")
          ? "invalid"
          : "available";
  const beta = {
    [CTI_ADJUSTED_TOTAL_CATEGORY]: null,
    ...categoryBeta,
    [CTI_ADJUSTED_V2_OTHER_CATEGORY]: otherBeta,
  } as Record<CtiAdjustedV2Category, CtiAdjustedV2BetaDiagnostic | null>;
  const lMissingForG = CTI_ADJUSTED_V2_YEARS.filter(
    (year) => year >= 2019 && missing.includes(year),
  );
  const warningReasonCodes = new Set<string>([
    "g_benchmark_not_acceptance_evidence",
    "residual_diagnostic_only",
    "gamma_comparison_only",
    "sensitivity_incomplete",
  ]);
  const warningDiagnostics: string[] = [];
  if (missing.length) warningReasonCodes.add("missing_g_benchmark");
  if (gStatus === "invalid") warningReasonCodes.add("invalid_g_benchmark");
  if (lMissingForG.length) {
    warningReasonCodes.add("l_missing_for_g_benchmark");
    warningDiagnostics.push(`L:missing_for_g:${lMissingForG.join(",")}`);
  }
  const blockingReasonCodes = new Set<string>(["rolling_loo_backtest_incomplete", ...fixed]);
  for (const diagnostic of diagnostics) {
    if (/non_finite_value/.test(diagnostic)) blockingReasonCodes.add("non_finite_value");
    if (/duplicate_year/.test(diagnostic)) blockingReasonCodes.add("duplicate_year");
    if (/duplicate_category/.test(diagnostic)) blockingReasonCodes.add("duplicate_category");
    if (/missing_category/.test(diagnostic)) blockingReasonCodes.add("missing_category");
    if (/missing_required_year/.test(diagnostic)) blockingReasonCodes.add("missing_required_year");
    if (/(?:raw|adopted)_range_data_mismatch/.test(diagnostic))
      blockingReasonCodes.add("metadata_data_range_mismatch");
    if (/(?:missing|non_finite|reversed)_(?:raw|adopted)_range/.test(diagnostic))
      blockingReasonCodes.add("invalid_metadata_range");
    if (/(?:raw|adopted)_range_(?:excludes_target|outside_raw)/.test(diagnostic))
      blockingReasonCodes.add("invalid_metadata_range");
    if (/(?:missing|non_finite)_base_year/.test(diagnostic))
      blockingReasonCodes.add("invalid_base_year");
    if (/base_year_not_2025/.test(diagnostic)) blockingReasonCodes.add("invalid_base_year");
    if (/missing_l_artifact/.test(diagnostic)) blockingReasonCodes.add("missing_l_artifact");
    if (/invalid_metadata_range/.test(diagnostic))
      blockingReasonCodes.add("invalid_metadata_range");
  }
  if (!validMinObs) blockingReasonCodes.add("invalid_min_beta_observations");
  if (invalidInput) blockingReasonCodes.add("invalid_observed_artifact");
  if (plan40InputValidation?.valid === false)
    blockingReasonCodes.add("plan40_input_contract_invalid");
  const targetRows = rows.filter((row) => row.year < CTI_ADJUSTED_V2_CONNECTION_YEAR);
  const otherBetaIncomplete =
    otherBeta.status !== "available" ||
    ratio2017 === null ||
    !targetRows.length ||
    targetRows.some(
      (row) => row.seriesType !== "estimated_bottom_up" || row.status !== "available",
    );
  if (otherBetaIncomplete) blockingReasonCodes.add("other_beta_stability_incomplete");
  const thresholdAuditable =
    derivedThreshold !== null &&
    officialDeltas.length > 0 &&
    officialDeltas.every(finite) &&
    Math.abs(derivedThreshold - threshold) <= CTI_ADJUSTED_V2_THRESHOLD_EPSILON;
  if (
    !thresholdAuditable ||
    Object.keys(jumps).some(
      (year) => Number(year) <= 2017 && jumps[Number(year)].thresholdPass !== true,
    )
  )
    blockingReasonCodes.add("threshold_redesign_incomplete");
  if (!boundary.finite || boundary.thresholdPass !== true)
    blockingReasonCodes.add("connection_2017_reaudit_incomplete");
  const nonBlockingReasonCodes = new Set<string>([
    "gamma_comparison_only",
    "gamma_comparison_insufficient",
    "missing_g_benchmark",
    "l_missing_for_g_benchmark",
    "invalid_g_benchmark",
    "g_benchmark_not_acceptance_evidence",
    "residual_diagnostic_only",
  ]);
  for (const reasonCode of nonBlockingReasonCodes) blockingReasonCodes.delete(reasonCode);
  const accepted = blockingReasonCodes.size === 0;
  const gateDiagnostics = [
    ...fixed,
    ...Object.values(validation).flatMap((v) => [...v.reasons, ...v.diagnostics]),
    ...(plan40InputValidation?.reasonCodes ?? []),
    ...(plan40InputValidation?.diagnostics ?? []),
    ...warningDiagnostics,
    ...(gStatus === "invalid" ? ["benchmark_g_invalid"] : []),
    ...(accepted ? [] : ["publication_gate_closed"]),
  ];
  return {
    model: "v2-bottom-up",
    estimateVersion: "plan39-v2",
    years: CTI_ADJUSTED_V2_YEARS,
    rows,
    categories: series,
    artifactValidation: validation,
    ...(plan40InputValidation ? { plan40InputValidation } : {}),
    ...(contract === "plan40"
      ? {
          plan40InputMetadata: Object.fromEntries(
            (["B", "A", "L"] as const).flatMap((name) => {
              const metadata = { B, A, L }[name]?.metadata;
              return metadata
                ? [
                    [
                      name,
                      {
                        baseYear: metadata.baseYear,
                        rawRange: metadata.rawRange,
                        adoptedRange: metadata.adoptedRange,
                      },
                    ],
                  ]
                : [];
            }),
          ) as CtiAdjustedV2Result["plan40InputMetadata"],
        }
      : {}),
    other: {
      derived: otherDerived,
      officialOther,
      ratio2017,
      beta: otherBeta,
      status: otherBeta.status,
      reasons: diagnostics,
    },
    residual: {
      residualMajor,
      residualWithOther,
      jumps,
      boundary2016To2017: {
        fromYear: 2016,
        toYear: 2017,
        ...boundary,
        reason: boundary.reason ?? "boundary_diagnostic_only",
      },
      threshold: CTI_ADJUSTED_V2_RESIDUAL_JUMP_THRESHOLD,
      thresholdMetadata: {
        source: "official-a-2017-2025",
        baselineYears: [2017, 2025],
        indicator: "Other前年差",
        derivedMaxAbsoluteDelta: derivedThreshold,
        comparison: "abs(delta)>threshold",
        inclusive: false,
        epsilon: CTI_ADJUSTED_V2_THRESHOLD_EPSILON,
      },
      status: "available",
      generationSource: "diagnostic-only",
    },
    beta,
    fitDiagnostics: beta,
    benchmarkG,
    benchmarkGDiagnostics: {
      baselineYear: 2017,
      availableYears: available,
      missingYears: missing,
      coverage: available.length / CTI_ADJUSTED_V2_YEARS.length,
      finite: finiteG,
      longTermDeviation: {
        available: deviations.length > 0,
        maxAbsoluteDeviation: deviations.length
          ? Math.max(...deviations.map((y) => Math.abs(benchmarkG[y]! - 1)))
          : null,
        years: deviations,
      },
      status: gStatus,
      reason:
        gStatus === "available"
          ? null
          : gStatus === "invalid"
            ? "benchmark_g_invalid"
            : "benchmark_g_missing",
    },
    publicationGate: {
      accepted,
      status: accepted ? "pass" : status,
      reasonCodes: [...blockingReasonCodes],
      blockingReasonCodes: [...blockingReasonCodes],
      warningReasonCodes: [...warningReasonCodes],
      diagnostics: gateDiagnostics,
    },
  };
}
