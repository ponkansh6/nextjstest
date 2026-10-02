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
  otherSharePreviousPercentage?: number | null;
  otherShareCurrentPercentage?: number | null;
  otherShareDeltaPercentagePoints?: number | null;
  otherShareAbsoluteDifferencePercentagePoints?: number | null;
  otherSharePreviousTotal?: number | null;
  otherShareCurrentTotal?: number | null;
  otherSharePreviousOther?: number | null;
  otherShareCurrentOther?: number | null;
  otherYearOverYearRatio?: number | null;
  thresholdSource?: "generated_bottom_up" | "generated_to_official_boundary" | "official_a";
  thresholdSeriesType?: "estimated" | "mixed" | "official";
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
  indicator: "Otherシェアの前年差";
  unit: "percentage-points";
  roundingRule: "ceiling-to-hundredth-percentage-point";
  roundingIncrementPercentagePoints: 0.01;
  derivedMaxAbsoluteShareChangePercentagePoints: number | null;
  effectiveThresholdPercentagePoints: number | null;
  officialAdjacentPairs: readonly number[];
  unevaluableOfficialAdjacentPairs: readonly number[];
  comparison: "abs(otherShareDeltaPercentagePoints)>threshold";
  inclusive: false;
  epsilon: number;
};
export type CtiAdjustedV2ResidualDiagnostics = {
  residualMajor: Record<number, number | null>;
  residualWithOther: Record<number, number | null>;
  jumps: Record<number, CtiAdjustedV2ResidualJump>;
  boundary2016To2017: CtiAdjustedV2ResidualJump & { fromYear: 2016; toYear: 2017 };
  threshold: number | null;
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
  /** Run Plan40's strict artifact integrity checks without selecting its base-only model. */
  validatePlan40Inputs?: boolean;
  calibrationYears?: readonly number[];
  estimateStartYear?: number;
  estimateEndYear?: number;
  officialStartYear?: number;
  connectionYear?: number;
  minBetaObservations?: number;
  householdComposition?: CtiAdjustedV2HouseholdComposition;
  /** Optional single-year prehistory anchor for a private consumer; never changes public rows/years. */
  prehistoryComposition?: { year: number; pi2Plus: number };
};
export type CtiAdjustedV2HouseholdComposition = {
  historicalPi2Plus: Record<number, number>;
  historicalPiStatusByYear: Record<
    number,
    {
      status: string;
      synthetic: boolean;
      benchmarkId: string;
      connectionStatus: string;
      interpolationMethod: string | null;
    }
  >;
  calibrationPi2Plus: Record<number, number>;
  provenance: {
    artifactPath: string;
    artifactSha256: string;
    manifestSha256: string;
    historicalSource: string;
    calibrationSource: string;
    caveats: readonly string[];
  };
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
  /** Private prehistory calculation requested by a consumer; not part of public estimate rows. */
  prehistoryAnchors?: Readonly<Record<number, number | null>>;
  categories: Record<CtiAdjustedV2Category, Record<number, number | null>>;
  other: CtiAdjustedV2OtherDiagnostics;
  residual: CtiAdjustedV2ResidualDiagnostics;
  householdComposition: {
    status: "available" | "unavailable";
    method: "endpoint-calibrated-provisional";
    calibrationYears: readonly [2017, 2025];
    calibrationPiDelta: number | null;
    gamma: Record<CtiAdjustedV2Category, number | null>;
    historicalPi: Record<number, number | null>;
    historicalPiStatusByYear: CtiAdjustedV2HouseholdComposition["historicalPiStatusByYear"] | null;
    historicalVintageBridge: "centered-at-2017";
    ctiInputPrecision: "saved nominal B/A annual artifacts (one decimal)";
    totalReconciliationMaximumAbsoluteError: number | null;
    endpointGammaReconciliationError: number | null;
    retrospectiveValidation: {
      years: readonly number[];
      endpointCalibrationYear: 2025;
      baselineMae: number | null;
      correctedMae: number | null;
      baselineRmse: number | null;
      correctedRmse: number | null;
      status: "available" | "unavailable";
    };
    caveats: readonly string[];
    provenance: CtiAdjustedV2HouseholdComposition["provenance"] | null;
  };
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
    "B" | "A",
    {
      valid: boolean;
      reasons: readonly string[];
      diagnostics: readonly string[];
      duplicateYears: readonly number[];
      observedYears: readonly number[];
    }
  >;
  /** Fingerprint for the exact annual input snapshot used by the loader. */
  inputFingerprint?: string;
  /** Present for results produced by the Plan40-aware builder; optional for legacy fixtures. */
  plan40InputValidation?: CtiAdjustedV2Plan40InputValidation;
  plan40InputMetadata?: Partial<Record<"B" | "A", CtiAdjustedV2Plan40InputMetadata>>;
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
  _L: CtiAdjustedAnnualInput | null | undefined = undefined,
): CtiAdjustedV2Plan40InputValidation => {
  const targetYears = Array.from({ length: 13 }, (_, index) => 2005 + index);
  const inputCategories = [...CTI_ADJUSTED_INPUT_CATEGORIES];
  const validation = { B: validateArtifact("B", B, true), A: validateArtifact("A", A, true) };
  const reasons = new Set<string>();
  const diagnostics: string[] = [];
  for (const [name, input] of Object.entries({ B, A }) as [
    "B" | "A",
    CtiAdjustedAnnualInput | null | undefined,
  ][]) {
    for (const reason of validation[name].reasons) reasons.add(reason);
    if (!input) continue;
    for (const field of requiredPlan40Metadata) {
      const value = input.metadata?.[field];
      if (typeof value !== "string" || value.trim() === "")
        reasons.add(`${name}:missing_metadata:${field}`);
    }
    if (input.metadata?.valueType !== "原数値（名目指数）")
      reasons.add(`${name}:value_type_not_nominal`);
    if (input.metadata?.baseYear === undefined) reasons.add(`${name}:missing_base_year`);
    else if (!finite(input.metadata.baseYear)) reasons.add(`${name}:non_finite_base_year`);
    else if (input.metadata.baseYear !== 2025) reasons.add(`${name}:base_year_not_2025`);
    if (input.metadata?.frequency !== "annual") reasons.add(`${name}:frequency_not_annual`);
    const adopted = input.metadata?.adoptedRange;
    const metadataTargetYears = name === "A" ? [2017, 2025] : [...targetYears, 2025];
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
  _L: CtiAdjustedAnnualInput | null | undefined = undefined,
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
      B: validateArtifact("B", B, contract === "plan40" || options.validatePlan40Inputs === true),
      A: validateArtifact("A", A, contract === "plan40" || options.validatePlan40Inputs === true),
    },
    plan40InputValidation =
      contract === "plan40" || options.validatePlan40Inputs === true
        ? validateCtiAdjustedV2Plan40Inputs(B, A, _L)
        : undefined,
    diagnostics = [
      ...fixed,
      ...Object.values(validation).flatMap((v) => [...v.reasons, ...v.diagnostics]),
      ...(plan40InputValidation?.reasonCodes ?? []),
      ...(plan40InputValidation?.diagnostics ?? []),
    ],
    plan40EstimateInputsUsable = !plan40InputValidation || plan40InputValidation.valid,
    bRows = rowMap(B),
    aRows = rowMap(A),
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
  const composition = options.householdComposition;
  const historicalPi: Record<number, number | null> = {};
  const historicalPiStatusByYear = composition?.historicalPiStatusByYear ?? null;
  for (const y of Array.from({ length: 13 }, (_, i) => 2005 + i)) {
    const pi = composition?.historicalPi2Plus[y];
    historicalPi[y] = finite(pi) && pi > 0 && pi < 1 ? pi : null;
  }
  const pi17Calibration = composition?.calibrationPi2Plus[2017],
    pi25Calibration = composition?.calibrationPi2Plus[2025],
    calibrationPiDelta =
      finite(pi17Calibration) && finite(pi25Calibration) ? pi25Calibration - pi17Calibration : null,
    householdCaveats = composition?.provenance.caveats ?? [],
    compositionGamma = Object.fromEntries(categories.map((c) => [c, null])) as Record<
      CtiAdjustedV2Category,
      number | null
    >;
  const baseCategoryValue = (year: number, category: CtiAdjustedV2Category): number | null => {
    const b = bRows.get(year),
      b17 = bRows.get(2017),
      a17 = aRows.get(2017);
    if (category === CTI_ADJUSTED_TOTAL_CATEGORY) {
      const componentValues = [
        ...CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => baseCategoryValue(year, c)),
        baseCategoryValue(year, CTI_ADJUSTED_V2_OTHER_CATEGORY),
      ];
      return componentValues.every(positive)
        ? componentValues.reduce((sum, value) => sum + value!, 0)
        : null;
    }
    if (category === CTI_ADJUSTED_V2_OTHER_CATEGORY) {
      const by = deriveOther(b),
        bo17Local = deriveOther(b17),
        ao17Local = deriveOther(a17);
      return positive(by) && positive(bo17Local) && positive(ao17Local)
        ? by * (ao17Local / bo17Local)
        : null;
    }
    const bv = b?.values[category],
      av17 = a17?.values[category],
      bv17 = b17?.values[category];
    return positive(bv) && positive(av17) && positive(bv17) ? bv * (av17 / bv17) : null;
  };
  let endpointGammaReconciliationError: number | null = null;
  let compositionAvailable =
    contract === "plan40" ||
    (composition !== undefined &&
      positive(pi17Calibration) &&
      positive(pi25Calibration) &&
      pi17Calibration! < 1 &&
      pi25Calibration! < 1 &&
      Math.abs(calibrationPiDelta ?? 0) > 1e-12 &&
      positive(historicalPi[2017]));
  if (compositionAvailable) {
    for (const c of [...CTI_ADJUSTED_MAJOR_CATEGORIES, CTI_ADJUSTED_V2_OTHER_CATEGORY] as const) {
      const a25 =
        c === CTI_ADJUSTED_V2_OTHER_CATEGORY
          ? deriveOther(aRows.get(2025))
          : aRows.get(2025)?.values[c];
      const base25 = baseCategoryValue(2025, c);
      const gamma = positive(a25) && positive(base25) ? (a25 - base25) / calibrationPiDelta! : null;
      if (!finite(gamma)) compositionAvailable = false;
      compositionGamma[c] = finite(gamma) ? gamma : null;
    }
    compositionGamma[CTI_ADJUSTED_TOTAL_CATEGORY] =
      CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((sum, c) => sum + (compositionGamma[c] ?? 0), 0) +
      (compositionGamma[CTI_ADJUSTED_V2_OTHER_CATEGORY] ?? 0);
    const aTotal25 = aRows.get(2025)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      baseTotal25 = baseCategoryValue(2025, CTI_ADJUSTED_TOTAL_CATEGORY),
      independentlyDerivedTotalGamma =
        positive(aTotal25) && positive(baseTotal25)
          ? (aTotal25 - baseTotal25) / calibrationPiDelta!
          : null;
    endpointGammaReconciliationError = finite(independentlyDerivedTotalGamma)
      ? Math.abs(independentlyDerivedTotalGamma - compositionGamma[CTI_ADJUSTED_TOTAL_CATEGORY]!)
      : null;
    if (!finite(endpointGammaReconciliationError) || endpointGammaReconciliationError > 1e-8)
      diagnostics.push("household_composition_endpoint_gamma_reconciliation_failed");
    for (let y = 2005; y <= 2016; y++) if (!positive(historicalPi[y])) compositionAvailable = false;
  }
  if (!compositionAvailable) diagnostics.push("household_composition_artifact_missing_or_invalid");
  // The source vintages differ. Centering the historical series at its own
  // 2017 weight makes the correction zero at the connection anchor; it does
  // not establish that the two source series are comparable.
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
      ratio2017 !== null &&
      (contract === "plan40" || compositionAvailable) &&
      otherBeta.status === "available" &&
      !fixed.length &&
      validation.B.valid &&
      validation.A.valid
    ) {
      for (const c of [...CTI_ADJUSTED_MAJOR_CATEGORIES, CTI_ADJUSTED_V2_OTHER_CATEGORY] as const) {
        const base = baseCategoryValue(y, c),
          pi = historicalPi[y],
          deltaPi = positive(pi) && positive(historicalPi[2017]) ? pi! - historicalPi[2017]! : null,
          gamma = compositionGamma[c];
        const corrected =
          contract === "plan40"
            ? base
            : positive(base) && finite(deltaPi) && finite(gamma)
              ? base + gamma * deltaPi
              : null;
        values[c] = positive(corrected) ? corrected : null;
      }
      values[CTI_ADJUSTED_TOTAL_CATEGORY] =
        CTI_ADJUSTED_MAJOR_CATEGORIES.every((c) => positive(values[c])) &&
        positive(values[CTI_ADJUSTED_V2_OTHER_CATEGORY])
          ? CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((sum, c) => sum + values[c]!, 0) +
            values[CTI_ADJUSTED_V2_OTHER_CATEGORY]!
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
  let totalReconciliationMaximumAbsoluteError = 0;
  for (const row of rows.filter(
    (item) => item.year < CTI_ADJUSTED_V2_CONNECTION_YEAR && item.status === "available",
  )) {
    const parts = CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => row.values[c]);
    const other = row.values[CTI_ADJUSTED_V2_OTHER_CATEGORY];
    const total = row.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    if (parts.every(finite) && finite(other) && finite(total))
      totalReconciliationMaximumAbsoluteError = Math.max(
        totalReconciliationMaximumAbsoluteError,
        Math.abs(parts.reduce((sum, value) => sum + value!, 0) + other - total),
      );
  }
  if (totalReconciliationMaximumAbsoluteError > 1e-9)
    diagnostics.push("household_composition_total_reconciliation_failed");
  const retrospectiveRows = Array.from({ length: 7 }, (_, i) => 2018 + i).flatMap((year) => {
    const baseline = baseCategoryValue(year, CTI_ADJUSTED_TOTAL_CATEGORY),
      actual = aRows.get(year)?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      pi = composition?.calibrationPi2Plus[year],
      anchorPi = composition?.calibrationPi2Plus[2017],
      corrected =
        positive(baseline) &&
        positive(pi) &&
        positive(anchorPi) &&
        finite(compositionGamma[CTI_ADJUSTED_TOTAL_CATEGORY])
          ? baseline + compositionGamma[CTI_ADJUSTED_TOTAL_CATEGORY]! * (pi - anchorPi)
          : null;
    return positive(actual) && positive(baseline) && finite(corrected)
      ? [{ year, baselineError: baseline - actual, correctedError: corrected! - actual }]
      : [];
  });
  const retrospectiveStats = (key: "baselineError" | "correctedError", rms = false) => {
    if (retrospectiveRows.length !== 7) return null;
    const mean =
      retrospectiveRows.reduce((sum, row) => sum + (rms ? row[key] ** 2 : Math.abs(row[key])), 0) /
      retrospectiveRows.length;
    return rms ? Math.sqrt(mean) : mean;
  };
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
  const rowByYear = new Map(rows.map((row) => [row.year, row]));
  const sharePercentage = (other: unknown, total: unknown) =>
    finite(other) && positive(total) && other >= 0 && other <= total ? (other / total) * 100 : null;
  const officialDeltas: number[] = [],
    officialAdjacentPairs: number[] = [],
    unevaluableOfficialAdjacentPairs: number[] = [];
  for (let year = 2018; year <= 2025; year++) {
    const previousRow = rowByYear.get(year - 1),
      currentRow = rowByYear.get(year),
      previousOther = residualWithOther[year - 1],
      currentOther = residualWithOther[year],
      previousShare = sharePercentage(
        previousOther,
        previousRow?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      ),
      currentShare = sharePercentage(currentOther, currentRow?.values[CTI_ADJUSTED_TOTAL_CATEGORY]);
    if (finite(previousShare) && finite(currentShare)) {
      officialDeltas.push(Math.abs(currentShare - previousShare));
      officialAdjacentPairs.push(year);
    } else unevaluableOfficialAdjacentPairs.push(year);
  }
  const derivedThreshold = officialDeltas.length === 8 ? Math.max(...officialDeltas) : null,
    threshold = finite(derivedThreshold) ? Math.ceil(derivedThreshold * 100) / 100 : null;
  const jumps: Record<number, CtiAdjustedV2ResidualJump> = {};
  for (let i = 1; i < CTI_ADJUSTED_V2_YEARS.length; i++) {
    const year = CTI_ADJUSTED_V2_YEARS[i],
      previousYear = CTI_ADJUSTED_V2_YEARS[i - 1],
      p = residualWithOther[previousYear],
      c = residualWithOther[year],
      previousRow = rowByYear.get(previousYear),
      currentRow = rowByYear.get(year),
      previousTotal = previousRow?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      currentTotal = currentRow?.values[CTI_ADJUSTED_TOTAL_CATEGORY],
      previousOtherShare = sharePercentage(p, previousTotal),
      currentOtherShare = sharePercentage(c, currentTotal),
      otherShareDeltaPercentagePoints =
        finite(previousOtherShare) && finite(currentOtherShare)
          ? currentOtherShare - previousOtherShare
          : null,
      otherShareAbsoluteDifferencePercentagePoints = finite(otherShareDeltaPercentagePoints)
        ? Math.abs(otherShareDeltaPercentagePoints)
        : null,
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
      finiteValues = finite(previousOtherShare) && finite(currentOtherShare),
      thresholdPass =
        finiteValues && finite(threshold)
          ? otherShareAbsoluteDifferencePercentagePoints! <=
            threshold + CTI_ADJUSTED_V2_THRESHOLD_EPSILON
          : null,
      reason = !finiteValues
        ? `other_share_unavailable:${previous.reason ?? current.reason ?? "missing_or_inconsistent_total_or_other"}`
        : !finite(threshold)
          ? "official_other_share_threshold_unavailable"
          : thresholdPass
            ? null
            : "other_share_threshold_exceeded";
    jumps[year] = {
      previousYear,
      delta,
      absoluteDifference,
      relativeChange:
        finite(legacyPrevious) && finite(legacyCurrent) && legacyPrevious !== 0
          ? delta! / Math.abs(legacyPrevious)
          : null,
      yearOverYearRatio: ratio,
      otherSharePreviousPercentage: previousOtherShare,
      otherShareCurrentPercentage: currentOtherShare,
      otherShareDeltaPercentagePoints,
      otherShareAbsoluteDifferencePercentagePoints,
      otherSharePreviousTotal: finite(previousTotal) ? previousTotal : null,
      otherShareCurrentTotal: finite(currentTotal) ? currentTotal : null,
      otherSharePreviousOther: finite(p) ? p : null,
      otherShareCurrentOther: finite(c) ? c : null,
      otherYearOverYearRatio: otherRatio,
      thresholdSource:
        year < 2017
          ? "generated_bottom_up"
          : year === 2017
            ? "generated_to_official_boundary"
            : "official_a",
      thresholdSeriesType: year < 2017 ? "estimated" : year === 2017 ? "mixed" : "official",
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
    otherSharePreviousPercentage: null,
    otherShareCurrentPercentage: null,
    otherShareDeltaPercentagePoints: null,
    otherShareAbsoluteDifferencePercentagePoints: null,
    otherSharePreviousTotal: null,
    otherShareCurrentTotal: null,
    otherSharePreviousOther: null,
    otherShareCurrentOther: null,
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
        : null;
  for (const y of CTI_ADJUSTED_V2_YEARS) {
    const r = rows[y - 2005],
      bottom =
        CTI_ADJUSTED_MAJOR_CATEGORIES.every((c) => positive(r.values[c])) &&
        positive(r.values[CTI_ADJUSTED_V2_OTHER_CATEGORY])
          ? CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((s, c) => s + r.values[c]!, 0) +
            r.values[CTI_ADJUSTED_V2_OTHER_CATEGORY]!
          : null;
    benchmarkG[y] = positive(bottom) && positive(baseValue) ? bottom / baseValue : null;
    if (benchmarkG[y] === null) missing.push(y);
    else available.push(y);
  }
  const finiteG = available.every((y) => finite(benchmarkG[y])),
    deviations = available.filter((y) => Math.abs((benchmarkG[y] ?? 1) - 1) > 0.1),
    gStatus = !available.length ? "insufficient-data" : finiteG ? "available" : "invalid";
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
  const warningReasonCodes = new Set<string>([
    "g_benchmark_not_acceptance_evidence",
    "residual_diagnostic_only",
    "gamma_comparison_only",
    "sensitivity_incomplete",
  ]);
  const warningDiagnostics: string[] = [];
  if (missing.length) warningReasonCodes.add("missing_g_benchmark");
  if (gStatus === "invalid") warningReasonCodes.add("invalid_g_benchmark");
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
    if (/invalid_metadata_range/.test(diagnostic))
      blockingReasonCodes.add("invalid_metadata_range");
  }
  if (!validMinObs) blockingReasonCodes.add("invalid_min_beta_observations");
  if (invalidInput) blockingReasonCodes.add("invalid_observed_artifact");
  if (plan40InputValidation?.valid === false)
    blockingReasonCodes.add("plan40_input_contract_invalid");
  if (contract === "plan39" && !compositionAvailable)
    blockingReasonCodes.add("household_composition_correction_unavailable");
  if (contract === "plan39" && totalReconciliationMaximumAbsoluteError > 1e-9)
    blockingReasonCodes.add("household_composition_total_reconciliation_failed");
  if (
    contract === "plan39" &&
    (!finite(endpointGammaReconciliationError) || endpointGammaReconciliationError > 1e-8)
  )
    blockingReasonCodes.add("household_composition_endpoint_gamma_reconciliation_failed");
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
    officialDeltas.length === 8 &&
    officialAdjacentPairs.length === 8 &&
    unevaluableOfficialAdjacentPairs.length === 0 &&
    officialDeltas.every(finite);
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
  const prehistory = options.prehistoryComposition;
  let prehistoryAnchors: Readonly<Record<number, number | null>> | undefined;
  if (prehistory) {
    const isValidRequest =
      Number.isInteger(prehistory.year) &&
      finite(prehistory.pi2Plus) &&
      prehistory.pi2Plus > 0 &&
      prehistory.pi2Plus < 1;
    const canEstimate =
      isValidRequest &&
      compositionAvailable &&
      contract === "plan39" &&
      ratio2017 !== null &&
      otherBeta.status === "available" &&
      !fixed.length &&
      validation.B.valid &&
      validation.A.valid;
    const components = canEstimate
      ? ([...CTI_ADJUSTED_MAJOR_CATEGORIES, CTI_ADJUSTED_V2_OTHER_CATEGORY] as const).map(
          (category) => {
            const base = baseCategoryValue(prehistory.year, category);
            const gamma = compositionGamma[category];
            const pi2017 = historicalPi[2017];
            return positive(base) && finite(gamma) && positive(pi2017)
              ? base + gamma * (prehistory.pi2Plus - pi2017)
              : null;
          },
        )
      : [];
    const anchor =
      components.length > 0 && components.every(positive)
        ? components.reduce((sum, value) => sum + value!, 0)
        : null;
    prehistoryAnchors = { [prehistory.year]: anchor };
  }
  return {
    model: "v2-bottom-up",
    estimateVersion: "plan39-v2",
    years: CTI_ADJUSTED_V2_YEARS,
    rows,
    ...(prehistoryAnchors ? { prehistoryAnchors } : {}),
    categories: series,
    artifactValidation: validation,
    ...(plan40InputValidation ? { plan40InputValidation } : {}),
    ...(contract === "plan40" || options.validatePlan40Inputs === true
      ? {
          plan40InputMetadata: Object.fromEntries(
            (["B", "A"] as const).flatMap((name) => {
              const metadata = { B, A }[name]?.metadata;
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
      threshold,
      thresholdMetadata: {
        source: "official-a-2017-2025",
        baselineYears: [2017, 2025],
        indicator: "Otherシェアの前年差",
        unit: "percentage-points",
        roundingRule: "ceiling-to-hundredth-percentage-point",
        roundingIncrementPercentagePoints: 0.01,
        derivedMaxAbsoluteShareChangePercentagePoints: derivedThreshold,
        effectiveThresholdPercentagePoints: threshold,
        officialAdjacentPairs,
        unevaluableOfficialAdjacentPairs,
        comparison: "abs(otherShareDeltaPercentagePoints)>threshold",
        inclusive: false,
        epsilon: CTI_ADJUSTED_V2_THRESHOLD_EPSILON,
      },
      status: "available",
      generationSource: "diagnostic-only",
    },
    householdComposition: {
      status: compositionAvailable && contract === "plan39" ? "available" : "unavailable",
      method: "endpoint-calibrated-provisional",
      calibrationYears: [2017, 2025],
      calibrationPiDelta,
      gamma: compositionGamma,
      historicalPi,
      historicalPiStatusByYear,
      historicalVintageBridge: "centered-at-2017",
      ctiInputPrecision: "saved nominal B/A annual artifacts (one decimal)",
      totalReconciliationMaximumAbsoluteError,
      endpointGammaReconciliationError,
      retrospectiveValidation: {
        years: retrospectiveRows.map((row) => row.year),
        endpointCalibrationYear: 2025,
        baselineMae: retrospectiveStats("baselineError"),
        correctedMae: retrospectiveStats("correctedError"),
        baselineRmse: retrospectiveStats("baselineError", true),
        correctedRmse: retrospectiveStats("correctedError", true),
        status: retrospectiveRows.length === 7 ? "available" : "unavailable",
      },
      caveats: householdCaveats,
      provenance: composition?.provenance ?? null,
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
