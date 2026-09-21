/**
 * Pure domain core for the CTI micro adjusted-connection estimate.
 *
 * This module deliberately does not load artifacts.  Callers must provide the
 * verified B/A/L observations and their provenance metadata.
 */

export const CTI_ADJUSTED_MAJOR_CATEGORIES = [
  "食料",
  "住居",
  "光熱・水道",
  "家具・家事用品",
  "被服及び履物",
  "保健医療",
  "交通・通信",
  "教育",
  "教養娯楽",
] as const;

export const CTI_ADJUSTED_TOTAL_CATEGORY = "総合" as const;
export const CTI_ADJUSTED_RESIDUAL_CATEGORY = "残差" as const;
export const CTI_ADJUSTED_INPUT_CATEGORIES = [
  ...CTI_ADJUSTED_MAJOR_CATEGORIES,
  CTI_ADJUSTED_TOTAL_CATEGORY,
] as const;
export const CTI_ADJUSTED_OUTPUT_CATEGORIES = [
  ...CTI_ADJUSTED_INPUT_CATEGORIES,
  CTI_ADJUSTED_RESIDUAL_CATEGORY,
] as const;
export const CTI_ADJUSTED_STANDARD_BACKTEST = {
  trainingYears: Array.from({ length: 8 }, (_, index) => 2018 + index),
  targetYear: 2017,
} as const;
export const CTI_ADJUSTED_STANDARD_CALIBRATION_YEARS = Array.from(
  { length: 8 },
  (_, index) => 2018 + index,
);
/** Explicit absolute residual jump limit used by the Plan39 estimate gate. */
export const CTI_ADJUSTED_DEFAULT_RESIDUAL_JUMP_THRESHOLD = 1.4;

export type CtiAdjustedMajorCategory = (typeof CTI_ADJUSTED_MAJOR_CATEGORIES)[number];
export type CtiAdjustedInputCategory = (typeof CTI_ADJUSTED_INPUT_CATEGORIES)[number];
export type CtiAdjustedOutputCategory = (typeof CTI_ADJUSTED_OUTPUT_CATEGORIES)[number];
export type CtiAdjustedInputValues = Partial<Record<CtiAdjustedInputCategory, number | null>> &
  Partial<Record<typeof CTI_ADJUSTED_RESIDUAL_CATEGORY, number | null>>;
export type CtiAdjustedOutputValues = Record<CtiAdjustedOutputCategory, number | null>;
export type CtiAdjustedSeriesType = "estimated_adjusted" | "official_adjusted" | "unavailable";
export type CtiAdjustedStatus = "available" | "invalid" | "unavailable";

export type CtiAdjustedInputMetadata = {
  source: string;
  artifact: string;
  artifactIdentifier?: string | null;
  officialPageUrl?: string | null;
  sourceUrl?: string | null;
  downloadUrl?: string | null;
  statisticsId?: string | null;
  tableId?: string | null;
  statInfId?: string | null;
  revision?: string | null;
  schemaVersion?: string | number | null;
  sha256?: string | null;
  csvSha256?: string | null;
  hash?: string | null;
  hashReason?: string | null;
  retrievedAt: string;
  baseYear: number;
  unit: string;
  valueType: string;
  householdScope: string;
  frequency: "annual" | string;
  rawRange: { startYear: number; endYear: number };
  adoptedRange: { startYear: number; endYear: number };
  yearization?: string | null;
  missingRepresentation: string;
};

export type CtiAdjustedAuditInputMetadata = {
  source: string;
  artifact: string;
  artifactIdentifier: string | null;
  officialPageUrl: string | null;
  downloadUrl: string | null;
  statisticsId: string | null;
  tableId: string | null;
  statInfId: string | null;
  revision: string | null;
  schemaVersion: string | number | null;
  sha256: string | null;
  hashReason: string | null;
  retrievedAt: string;
  baseYear: number | null;
  unit: string;
  valueType: string;
  householdScope: string;
  frequency: string;
  rawRange: { startYear: number | null; endYear: number | null };
  adoptedRange: { startYear: number | null; endYear: number | null };
  yearization: string | null;
  missingRepresentation: string;
};

export type CtiAdjustedAnnualRow = {
  year: number;
  values: CtiAdjustedInputValues;
};

export type CtiAdjustedAnnualInput = {
  metadata: CtiAdjustedInputMetadata;
  rows: readonly CtiAdjustedAnnualRow[];
  /** Optional source column order, retained to make duplicate categories detectable. */
  categoryOrder?: readonly string[];
};

export type CtiAdjustedTarget = {
  startYear?: number;
  endYear?: number;
  officialStartYear?: number;
  connectionYear?: number;
  householdScope?: string;
  unit?: string;
  valueType?: string;
  baseYear?: number;
  frequency?: string;
};

export type CtiAdjustedOptions = {
  target?: CtiAdjustedTarget;
  tolerance?: number;
  minBetaObservations?: number;
  rejectNegativeResidual?: boolean;
  holdoutYears?: readonly number[];
  holdoutStartYear?: number;
  backtest?: { trainingYears: readonly number[]; targetYear: number };
  /** Explicit beta calibration years for audit/sensitivity scenarios. */
  calibrationYears?: readonly number[];
  /** Absolute residual year-on-year jump that invalidates an estimate. */
  residualJumpThreshold?: number;
};

export type CtiAdjustedValidationIssue = {
  code:
    | "missing_metadata"
    | "metadata_mismatch"
    | "category_overlap"
    | "missing_category"
    | "unknown_category"
    | "ignored_category"
    | "duplicate_year"
    | "non_continuous_years"
    | "missing_value"
    | "non_finite_value"
    | "non_positive_value"
    | "missing_l_artifact"
    | "invalid_range"
    | "invalid_row";
  input: "B" | "A" | "L" | "target";
  year?: number;
  category?: string;
  message: string;
};

export type CtiAdjustedValidation = {
  status: CtiAdjustedStatus;
  valid: boolean;
  reasons: readonly string[];
  issues: readonly CtiAdjustedValidationIssue[];
};

type FiniteAuditValue = number | null;

export type CtiAdjustedAudit = {
  formulaVersion: string;
  schemaVersion: string;
  validation: CtiAdjustedValidation;
  inputMetadata: Record<"B" | "A" | "L", CtiAdjustedAuditInputMetadata | null>;
  inputMetadataFingerprint: Record<"B" | "A" | "L", string | null>;
  betaCalibrationYears: readonly number[];
  betaTargetYear: number | null;
  betaHoldoutYears: readonly number[];
  beta: Record<
    CtiAdjustedMajorCategory,
    {
      numerator: number | null;
      denominator: number | null;
      observations: number;
      value: number | null;
      status: CtiAdjustedStatus;
      reason: string | null;
    }
  >;
  betaTrainingYears: readonly number[];
  betaExcludedYears: readonly number[];
  ratios: Record<
    number,
    { total: FiniteAuditValue; categories: Record<CtiAdjustedMajorCategory, FiniteAuditValue> }
  >;
  fittedRatios: Record<
    number,
    { total: FiniteAuditValue; categories: Record<CtiAdjustedMajorCategory, FiniteAuditValue> }
  >;
  d: {
    baselineYear: number | null;
    rows: Record<
      number,
      {
        lRatio: number | null;
        bRatio: number | null;
        value: number | null;
        status: CtiAdjustedStatus;
        reason: string | null;
      }
    >;
  };
  connection2017: Record<
    CtiAdjustedOutputCategory,
    {
      official: number | null;
      calculatedValue: number | null;
      difference: number | null;
      relativeError: number | null;
      tolerance: number;
      passed: boolean | null;
    }
  >;
  officialPreservation: Record<
    number,
    { input: CtiAdjustedOutputValues; output: CtiAdjustedOutputValues; exact: boolean }
  >;
  officialAdditivity: Record<
    number,
    {
      total: number | null;
      majorSum: number | null;
      residual: number | null;
      difference: number | null;
      additive: boolean | null;
      reason?: string | null;
    }
  >;
  residualValidation: Record<
    number,
    { value: number | null; status: CtiAdjustedStatus; reason: string | null }
  >;
  residualJumpThreshold: number;
  residualJumps: Record<
    number,
    {
      previousYear: number | null;
      value: number | null;
      previousValue: number | null;
      absoluteDifference: number | null;
      relativeChange: number | null;
      yearOverYearRatio: number | null;
      exceeded: boolean | null;
      reason: string | null;
    }
  >;
  residualBoundaryJump: {
    fromYear: number;
    toYear: number;
    absoluteDifference: number | null;
    relativeChange: number | null;
    yearOverYearRatio: number | null;
    exceeded: boolean | null;
    reason: string | null;
  };
  stacking: Record<
    number,
    {
      total: number | null;
      majorSum: number | null;
      residual: number | null;
      status: CtiAdjustedStatus;
      reason: string | null;
    }
  >;
  holdoutLeakage: {
    detected: boolean;
    years: readonly number[];
    excludedYears: readonly number[];
    removedFromTrainingYears: readonly number[];
    reason: string | null;
  };
  backtest: CtiAdjustedBacktestAudit;
};

export type CtiAdjustedBacktestAudit = {
  status: CtiAdjustedStatus;
  reason: string | null;
  officialR: Record<CtiAdjustedMajorCategory, number | null>;
  predictedR: Record<CtiAdjustedMajorCategory, number | null>;
  absoluteError: Record<CtiAdjustedMajorCategory, number | null>;
  relativeError: Record<CtiAdjustedMajorCategory, number | null>;
  trainingYears: readonly number[];
  targetYear: number | null;
  beta: Record<CtiAdjustedMajorCategory, number | null>;
  excludedYears: readonly number[];
  leakageDetected: boolean;
};

export type CtiAdjustedOutputRow = {
  year: number;
  seriesType: CtiAdjustedSeriesType;
  official: boolean;
  status: CtiAdjustedStatus;
  reason: string | null;
  values: CtiAdjustedOutputValues;
};

export type CtiAdjustedConnectionEstimate = {
  rows: readonly CtiAdjustedOutputRow[];
  audit: CtiAdjustedAudit;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const emptyBeta = (): CtiAdjustedAudit["beta"] =>
  Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => [
      category,
      {
        numerator: null,
        denominator: null,
        observations: 0,
        value: null,
        status: "unavailable",
        reason: "not_calculated",
      },
    ]),
  ) as CtiAdjustedAudit["beta"];

const emptyConnection = (): CtiAdjustedAudit["connection2017"] =>
  Object.fromEntries(
    CTI_ADJUSTED_OUTPUT_CATEGORIES.map((category) => [
      category,
      {
        official: null,
        calculatedValue: null,
        difference: null,
        relativeError: null,
        tolerance: 1e-9,
        passed: null,
      },
    ]),
  ) as CtiAdjustedAudit["connection2017"];

const emptyBacktest = (): CtiAdjustedBacktestAudit => ({
  status: "unavailable",
  reason: "not_requested",
  officialR: Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => [c, null]),
  ) as CtiAdjustedBacktestAudit["officialR"],
  predictedR: Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => [c, null]),
  ) as CtiAdjustedBacktestAudit["predictedR"],
  absoluteError: Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => [c, null]),
  ) as CtiAdjustedBacktestAudit["absoluteError"],
  relativeError: Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => [c, null]),
  ) as CtiAdjustedBacktestAudit["relativeError"],
  trainingYears: [],
  targetYear: null,
  beta: Object.fromEntries(
    CTI_ADJUSTED_MAJOR_CATEGORIES.map((c) => [c, null]),
  ) as CtiAdjustedBacktestAudit["beta"],
  excludedYears: [],
  leakageDetected: false,
});

function addIssue(issues: CtiAdjustedValidationIssue[], issue: CtiAdjustedValidationIssue) {
  issues.push(issue);
}

const emptyRatios = (): CtiAdjustedAudit["ratios"] => ({});
const emptyFittedRatios = (): CtiAdjustedAudit["fittedRatios"] => ({});
const emptyPreservation = (): CtiAdjustedAudit["officialPreservation"] => ({});
const emptyAdditivity = (): CtiAdjustedAudit["officialAdditivity"] => ({});
const emptyResidualValidation = (): CtiAdjustedAudit["residualValidation"] => ({});

const auditMetadata = (
  metadata: CtiAdjustedInputMetadata | undefined,
): CtiAdjustedAuditInputMetadata | null => {
  if (!metadata || typeof metadata !== "object") return null;
  const finiteYear = (value: unknown) => (isFiniteNumber(value) ? value : null);
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    source: text(metadata.source) ?? "",
    artifact: text(metadata.artifact) ?? "",
    artifactIdentifier: text(metadata.artifactIdentifier) ?? text(metadata.artifact),
    officialPageUrl: text(metadata.officialPageUrl),
    downloadUrl: text(metadata.downloadUrl),
    statisticsId: text(metadata.statisticsId),
    tableId: text(metadata.tableId),
    statInfId: text(metadata.statInfId),
    revision: text(metadata.revision),
    schemaVersion:
      typeof metadata.schemaVersion === "string" ||
      (typeof metadata.schemaVersion === "number" && Number.isFinite(metadata.schemaVersion))
        ? metadata.schemaVersion
        : null,
    sha256: text(metadata.sha256) ?? text(metadata.csvSha256) ?? text(metadata.hash),
    hashReason:
      text(metadata.hashReason) ??
      (text(metadata.sha256) || text(metadata.csvSha256) || text(metadata.hash)
        ? null
        : "not_provided"),
    retrievedAt: text(metadata.retrievedAt) ?? "",
    baseYear: finiteYear(metadata.baseYear),
    unit: text(metadata.unit) ?? "",
    valueType: text(metadata.valueType) ?? "",
    householdScope: text(metadata.householdScope) ?? "",
    frequency: text(metadata.frequency) ?? "",
    rawRange: {
      startYear: finiteYear(metadata.rawRange?.startYear),
      endYear: finiteYear(metadata.rawRange?.endYear),
    },
    adoptedRange: {
      startYear: finiteYear(metadata.adoptedRange?.startYear),
      endYear: finiteYear(metadata.adoptedRange?.endYear),
    },
    yearization: text(metadata.yearization),
    missingRepresentation: text(metadata.missingRepresentation) ?? "",
  };
};

const metadataFingerprint = (metadata: CtiAdjustedAuditInputMetadata | null): string | null => {
  if (!metadata) return null;
  const serialized = JSON.stringify(metadata);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1)
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

function validateInput(
  name: "B" | "A" | "L",
  input: CtiAdjustedAnnualInput | null | undefined,
  issues: CtiAdjustedValidationIssue[],
  requiredCategories: readonly string[],
) {
  if (!input) {
    addIssue(issues, {
      code: name === "L" ? "missing_l_artifact" : "missing_metadata",
      input: name,
      message: `${name} input is missing`,
    });
    return;
  }
  const metadata = input.metadata;
  if (!metadata || typeof metadata !== "object") {
    addIssue(issues, {
      code: "missing_metadata",
      input: name,
      message: `${name} metadata is missing`,
    });
  } else {
    for (const key of [
      "source",
      "artifact",
      "retrievedAt",
      "unit",
      "valueType",
      "householdScope",
      "frequency",
      "missingRepresentation",
    ] as const) {
      if (typeof metadata[key] !== "string" || metadata[key].trim() === "")
        addIssue(issues, {
          code: "missing_metadata",
          input: name,
          message: `${name}.${key} is missing`,
        });
    }
    if (!isFiniteNumber(metadata.baseYear))
      addIssue(issues, {
        code: "missing_metadata",
        input: name,
        message: `${name}.baseYear is invalid`,
      });
    if (
      !metadata.rawRange ||
      !metadata.adoptedRange ||
      metadata.rawRange.startYear > metadata.rawRange.endYear ||
      metadata.adoptedRange.startYear > metadata.adoptedRange.endYear
    )
      addIssue(issues, { code: "invalid_range", input: name, message: `${name} range is invalid` });
  }
  const order = input.categoryOrder ?? Object.keys(input.rows?.[0]?.values ?? {});
  if (new Set(order).size !== order.length)
    addIssue(issues, {
      code: "category_overlap",
      input: name,
      message: `${name} contains duplicate category columns`,
    });
  const allowedCategories =
    name === "L" ? requiredCategories : [...requiredCategories, CTI_ADJUSTED_RESIDUAL_CATEGORY];
  for (const category of order)
    if (!allowedCategories.includes(category))
      addIssue(issues, {
        code: name === "L" ? "ignored_category" : "unknown_category",
        input: name,
        category,
        message: `${name} ${name === "L" ? "ignores" : "contains unknown category"} ${category}`,
      });
  for (const category of requiredCategories)
    if (!order.includes(category))
      addIssue(issues, {
        code: "missing_category",
        input: name,
        category,
        message: `${name} is missing category ${category}`,
      });

  const rows = input.rows ?? [];
  const years = rows.map((row) => row?.year);
  if (years.some((year) => !Number.isInteger(year)))
    addIssue(issues, {
      code: "invalid_row",
      input: name,
      message: `${name} contains an invalid year`,
    });
  const hasDuplicateYear = new Set(years).size !== years.length;
  if (hasDuplicateYear)
    addIssue(issues, {
      code: "duplicate_year",
      input: name,
      message: `${name} contains duplicate years`,
    });
  const sorted = [...years].sort((a, b) => a - b);
  if (
    !hasDuplicateYear &&
    sorted.some((year, index) => index > 0 && year !== sorted[index - 1] + 1)
  )
    addIssue(issues, {
      code: "non_continuous_years",
      input: name,
      message: `${name} years are not continuous`,
    });
  for (const row of rows) {
    for (const category of requiredCategories) {
      const value = row?.values?.[category as CtiAdjustedInputCategory];
      if (value === null || value === undefined)
        addIssue(issues, {
          code: "missing_value",
          input: name,
          year: row?.year,
          category,
          message: `${name} value is missing`,
        });
      else if (!isFiniteNumber(value))
        addIssue(issues, {
          code: "non_finite_value",
          input: name,
          year: row?.year,
          category,
          message: `${name} value is non-finite`,
        });
      else if (value <= 0)
        addIssue(issues, {
          code: "non_positive_value",
          input: name,
          year: row?.year,
          category,
          message: `${name} value must be greater than zero`,
        });
    }
    if (
      name !== "L" &&
      Object.prototype.hasOwnProperty.call(row?.values ?? {}, CTI_ADJUSTED_RESIDUAL_CATEGORY)
    ) {
      const residual = row.values[CTI_ADJUSTED_RESIDUAL_CATEGORY];
      if (residual !== null && residual !== undefined && !isFiniteNumber(residual))
        addIssue(issues, {
          code: "non_finite_value",
          input: name,
          year: row?.year,
          category: CTI_ADJUSTED_RESIDUAL_CATEGORY,
          message: `${name} residual value is non-finite`,
        });
    }
  }
}

function metadataIssues(
  inputs: Array<["B" | "A" | "L", CtiAdjustedAnnualInput | null | undefined]>,
  target: CtiAdjustedTarget,
  issues: CtiAdjustedValidationIssue[],
) {
  const present = inputs.filter((entry): entry is ["B" | "A" | "L", CtiAdjustedAnnualInput] =>
    Boolean(entry[1]),
  );
  if (present.length === 0) return;
  const common = present.filter(([name]) => name === "B" || name === "A");
  const first = common[0]?.[1].metadata;
  for (const [name, input] of common) {
    for (const key of ["baseYear", "unit", "valueType", "householdScope", "frequency"] as const)
      if (first && input.metadata[key] !== first[key])
        addIssue(issues, {
          code: "metadata_mismatch",
          input: name,
          message: `${name}.${key} does not match B`,
        });
  }
  for (const [name, input] of present) {
    for (const key of ["baseYear", "unit", "frequency"] as const)
      if (target[key] !== undefined && input.metadata[key] !== target[key])
        addIssue(issues, {
          code: "metadata_mismatch",
          input: name,
          message: `${name}.${key} does not match target`,
        });
  }
}

export function buildCtiAdjustedConnectionEstimate(
  B: CtiAdjustedAnnualInput | null | undefined,
  A: CtiAdjustedAnnualInput | null | undefined,
  L: CtiAdjustedAnnualInput | null | undefined,
  options: CtiAdjustedOptions = {},
): CtiAdjustedConnectionEstimate {
  const target = {
    startYear: 2005,
    endYear: 2025,
    officialStartYear: 2017,
    connectionYear: 2017,
    ...options.target,
  };
  const tolerance = options.tolerance ?? 1e-9;
  const issues: CtiAdjustedValidationIssue[] = [];
  validateInput("B", B, issues, CTI_ADJUSTED_INPUT_CATEGORIES);
  validateInput("A", A, issues, CTI_ADJUSTED_INPUT_CATEGORIES);
  validateInput("L", L, issues, [CTI_ADJUSTED_TOTAL_CATEGORY]);
  metadataIssues(
    [
      ["B", B],
      ["A", A],
      ["L", L],
    ],
    target,
    issues,
  );
  const rowsByYear = new Map<
    number,
    { b?: CtiAdjustedAnnualRow; a?: CtiAdjustedAnnualRow; l?: CtiAdjustedAnnualRow }
  >();
  for (const [key, input] of [
    ["b", B],
    ["a", A],
    ["l", L],
  ] as const)
    for (const row of input?.rows ?? []) {
      const entry = rowsByYear.get(row.year) ?? {};
      entry[key] = row;
      rowsByYear.set(row.year, entry);
    }
  const years = [...rowsByYear.keys()].sort((a, b) => a - b);
  const backtestOptions = options.backtest ?? CTI_ADJUSTED_STANDARD_BACKTEST;
  const isStandardBacktest = options.backtest === undefined;
  const requestedBacktestYears = [...new Set(backtestOptions.trainingYears)].filter(
    (year) => year !== backtestOptions.targetYear,
  );
  const standardBacktestMissingHoldout =
    isStandardBacktest &&
    (!rowsByYear.get(backtestOptions.targetYear)?.a ||
      !rowsByYear.get(backtestOptions.targetYear)?.b ||
      requestedBacktestYears.length === 0 ||
      requestedBacktestYears.some((year) => !rowsByYear.get(year)?.a || !rowsByYear.get(year)?.b));
  const standardBacktestGapOnly =
    standardBacktestMissingHoldout &&
    !issues.some(
      (issue) =>
        (issue.input === "A" || issue.input === "B") && issue.code !== "non_continuous_years",
    );
  const inputIssue = (name: "A" | "B" | "L") =>
    issues.some((issue) => issue.input === name && issue.code !== "missing_l_artifact");
  const aInvalid = inputIssue("A");
  const bInvalid = inputIssue("B");
  const lInvalid = issues.some(
    (issue) =>
      issue.input === "L" &&
      issue.code !== "missing_l_artifact" &&
      issue.code !== "missing_value" &&
      issue.code !== "ignored_category",
  );
  const validationStatus: CtiAdjustedStatus =
    aInvalid || bInvalid || lInvalid ? "invalid" : !B || !A || !L ? "unavailable" : "available";
  const validation: CtiAdjustedValidation = {
    status: validationStatus,
    valid: validationStatus === "available",
    reasons: issues.map((issue) => issue.message),
    issues,
  };
  const beta = emptyBeta();
  const ratios = emptyRatios();
  const fittedRatios = emptyFittedRatios();
  const dRows: CtiAdjustedAudit["d"]["rows"] = {};
  const connection2017 = emptyConnection();
  const officialPreservation = emptyPreservation();
  const officialAdditivity = emptyAdditivity();
  const residualValidation = emptyResidualValidation();
  const residualJumpThreshold =
    isFiniteNumber(options.residualJumpThreshold) && options.residualJumpThreshold >= 0
      ? options.residualJumpThreshold
      : CTI_ADJUSTED_DEFAULT_RESIDUAL_JUMP_THRESHOLD;
  const residualJumps: CtiAdjustedAudit["residualJumps"] = {};
  const stacking: CtiAdjustedAudit["stacking"] = {};
  const backtest = emptyBacktest();
  const holdoutSet = new Set(options.holdoutYears ?? []);
  const isHoldout = (year: number) =>
    holdoutSet.has(year) ||
    (options.holdoutStartYear !== undefined && year >= options.holdoutStartYear);
  const candidateYears = years.filter(
    (year) =>
      year >= target.officialStartYear &&
      year <= target.endYear &&
      rowsByYear.get(year)?.a &&
      rowsByYear.get(year)?.b,
  );
  const excludedYears = candidateYears.filter(isHoldout);
  const calculationBlocked = aInvalid || bInvalid || lInvalid;
  const productionBetaCandidates = years.filter(
    (year) =>
      year >= target.startYear &&
      year <= target.endYear &&
      rowsByYear.get(year)?.a &&
      rowsByYear.get(year)?.b,
  );
  const requestedCalibrationYears =
    options.calibrationYears === undefined
      ? CTI_ADJUSTED_STANDARD_CALIBRATION_YEARS
      : [...new Set(options.calibrationYears)].sort((a, b) => a - b);
  const betaCalibrationYears = requestedCalibrationYears.filter(
    (year) => year !== target.connectionYear,
  );
  const trainingYears = calculationBlocked
    ? []
    : requestedCalibrationYears.filter(
        (year) =>
          productionBetaCandidates.includes(year) &&
          year !== target.connectionYear &&
          !isHoldout(year),
      );
  const removedFromTrainingYears = productionBetaCandidates.filter(isHoldout);
  const leakedHoldoutYears = trainingYears.filter(isHoldout);
  const holdoutLeakage = {
    detected: leakedHoldoutYears.length > 0,
    years: leakedHoldoutYears,
    excludedYears,
    removedFromTrainingYears,
    reason: leakedHoldoutYears.length ? "holdout_year_in_beta_training" : null,
  };
  const connection = rowsByYear.get(target.connectionYear);
  const bConnection = connection?.b?.values;
  const aConnection = connection?.a?.values;
  const lConnection = connection?.l?.values?.[CTI_ADJUSTED_TOTAL_CATEGORY];
  for (const year of years.filter(
    (year) =>
      year >= target.startYear &&
      year <= target.endYear &&
      rowsByYear.get(year)?.a &&
      rowsByYear.get(year)?.b,
  )) {
    const b = rowsByYear.get(year)?.b?.values;
    const a = rowsByYear.get(year)?.a?.values;
    const total =
      isFiniteNumber(a?.[CTI_ADJUSTED_TOTAL_CATEGORY]) &&
      isFiniteNumber(b?.[CTI_ADJUSTED_TOTAL_CATEGORY]) &&
      b![CTI_ADJUSTED_TOTAL_CATEGORY]! > 0
        ? a![CTI_ADJUSTED_TOTAL_CATEGORY]! / b![CTI_ADJUSTED_TOTAL_CATEGORY]!
        : null;
    const categories = Object.fromEntries(
      CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => [
        category,
        isFiniteNumber(a?.[category]) && isFiniteNumber(b?.[category]) && b![category]! > 0
          ? a![category]! / b![category]!
          : null,
      ]),
    ) as Record<CtiAdjustedMajorCategory, number | null>;
    ratios[year] = { total, categories };
  }
  {
    const requested = [...new Set(backtestOptions.trainingYears)].sort((a, b) => a - b);
    const targetYear = backtestOptions.targetYear;
    const leakageYears = requested.includes(targetYear) ? [targetYear] : [];
    const backtestYears = requested.filter((year) => year !== targetYear);
    backtest.trainingYears = backtestYears;
    backtest.targetYear = targetYear;
    backtest.excludedYears = leakageYears;
    backtest.leakageDetected = leakageYears.length > 0;
    if (standardBacktestGapOnly && !lInvalid) backtest.reason = "insufficient_holdout_years";
    else if (calculationBlocked) backtest.reason = "invalid_input";
    else if (backtest.leakageDetected) backtest.reason = "target_year_in_training_years";
    else if (
      !rowsByYear.get(targetYear)?.a ||
      !rowsByYear.get(targetYear)?.b ||
      backtestYears.length === 0 ||
      backtestYears.some((year) => !rowsByYear.get(year)?.a || !rowsByYear.get(year)?.b)
    ) {
      backtest.reason = "insufficient_holdout_years";
    } else {
      const targetRatio = ratios[targetYear]?.total;
      let usable = isFiniteNumber(targetRatio) && targetRatio > 0;
      for (const category of CTI_ADJUSTED_MAJOR_CATEGORIES) {
        let numerator = 0;
        let denominator = 0;
        let observations = 0;
        for (const year of backtestYears) {
          const ratio = ratios[year];
          if (
            !ratio ||
            !isFiniteNumber(ratio.total) ||
            !isFiniteNumber(ratio.categories[category]) ||
            ratio.total <= 0 ||
            ratio.categories[category]! <= 0
          )
            continue;
          const totalLog = Math.log(ratio.total);
          numerator += totalLog * Math.log(ratio.categories[category]!);
          denominator += totalLog * totalLog;
          observations++;
        }
        const value =
          observations >= (options.minBetaObservations ?? 3) && denominator > tolerance
            ? numerator / denominator
            : null;
        const official = ratios[targetYear]?.categories[category] ?? null;
        const predicted =
          isFiniteNumber(value) && isFiniteNumber(targetRatio)
            ? Math.exp(value! * Math.log(targetRatio!))
            : null;
        backtest.beta[category] = value;
        backtest.officialR[category] = official;
        backtest.predictedR[category] = isFiniteNumber(predicted) ? predicted : null;
        backtest.absoluteError[category] =
          isFiniteNumber(official) && isFiniteNumber(predicted)
            ? Math.abs(predicted! - official!)
            : null;
        backtest.relativeError[category] =
          isFiniteNumber(official) && official !== 0 && isFiniteNumber(predicted)
            ? Math.abs(predicted! - official!) / Math.abs(official)
            : null;
        if (!isFiniteNumber(value) || !isFiniteNumber(predicted)) usable = false;
      }
      backtest.status = usable ? "available" : "unavailable";
      backtest.reason = usable ? null : "insufficient_training_observations_or_variation";
    }
  }
  for (const year of years.filter(
    (year) =>
      year >= target.startYear &&
      year <= target.endYear &&
      rowsByYear.get(year)?.a &&
      rowsByYear.get(year)?.b,
  )) {
    const b = rowsByYear.get(year)?.b?.values;
    const a = rowsByYear.get(year)?.a?.values;
    const total =
      isFiniteNumber(a?.[CTI_ADJUSTED_TOTAL_CATEGORY]) &&
      isFiniteNumber(b?.[CTI_ADJUSTED_TOTAL_CATEGORY]) &&
      b![CTI_ADJUSTED_TOTAL_CATEGORY]! > 0
        ? a![CTI_ADJUSTED_TOTAL_CATEGORY]! / b![CTI_ADJUSTED_TOTAL_CATEGORY]!
        : null;
    const categories = Object.fromEntries(
      CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => [
        category,
        isFiniteNumber(a?.[category]) && isFiniteNumber(b?.[category]) && b![category]! > 0
          ? a![category]! / b![category]!
          : null,
      ]),
    ) as Record<CtiAdjustedMajorCategory, number | null>;
    ratios[year] = { total, categories };
  }
  for (const category of CTI_ADJUSTED_MAJOR_CATEGORIES) {
    let numerator = 0;
    let denominator = 0;
    let observations = 0;
    for (const year of trainingYears) {
      const r = ratios[year];
      const rt = r?.total;
      const ri = r?.categories[category];
      if (!isFiniteNumber(rt) || !isFiniteNumber(ri) || rt <= 0 || ri <= 0) continue;
      const totalLog = Math.log(rt);
      const categoryLog = Math.log(ri);
      numerator += totalLog * categoryLog;
      denominator += totalLog * totalLog;
      observations++;
    }
    const value =
      observations >= (options.minBetaObservations ?? 3) && denominator > tolerance
        ? numerator / denominator
        : null;
    beta[category] = {
      numerator: observations ? numerator : null,
      denominator: observations ? denominator : null,
      observations,
      value,
      status: value === null ? "unavailable" : "available",
      reason: value === null ? "insufficient_beta_observations_or_variation" : null,
    };
  }
  for (const year of trainingYears) {
    const r = ratios[year];
    fittedRatios[year] = {
      total: r?.total ?? null,
      categories: Object.fromEntries(
        CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => [
          category,
          isFiniteNumber(r?.total) && isFiniteNumber(beta[category].value)
            ? Math.exp(beta[category].value! * Math.log(r.total!))
            : null,
        ]),
      ) as Record<CtiAdjustedMajorCategory, number | null>,
    };
  }
  const d: CtiAdjustedAudit["d"] = { baselineYear: target.connectionYear, rows: dRows };
  for (const year of years.filter((item) => item < target.officialStartYear)) {
    const b = rowsByYear.get(year)?.b?.values;
    const l = rowsByYear.get(year)?.l?.values;
    const lValue = l?.[CTI_ADJUSTED_TOTAL_CATEGORY];
    const bTotal = b?.[CTI_ADJUSTED_TOTAL_CATEGORY];
    const bBase = bConnection?.[CTI_ADJUSTED_TOTAL_CATEGORY];
    const lRatio =
      isFiniteNumber(lValue) && isFiniteNumber(lConnection) && lConnection > 0
        ? lValue / lConnection
        : null;
    const bRatio =
      isFiniteNumber(bTotal) && isFiniteNumber(bBase) && bBase > 0 ? bTotal / bBase : null;
    const value = lRatio !== null && bRatio !== null && bRatio > 0 ? lRatio / bRatio : null;
    dRows[year] = {
      lRatio,
      bRatio,
      value,
      status: value !== null && value > 0 ? "available" : "unavailable",
      reason:
        value !== null && value > 0 ? null : !L ? "missing_l_artifact" : "invalid_l_or_b_baseline",
    };
  }
  const nullValues = () =>
    Object.fromEntries(
      CTI_ADJUSTED_OUTPUT_CATEGORIES.map((category) => [category, null]),
    ) as Record<CtiAdjustedOutputCategory, number | null>;
  const rows: CtiAdjustedOutputRow[] = [];
  const candidateResidualByYear = new Map<number, number>();
  for (const year of years) {
    const entry = rowsByYear.get(year)!;
    if (year >= target.officialStartYear) {
      const input = entry.a?.values;
      const values = Object.fromEntries(
        CTI_ADJUSTED_OUTPUT_CATEGORIES.map((category) => [
          category,
          isFiniteNumber(input?.[category]) ? input![category]! : null,
        ]),
      ) as Record<CtiAdjustedOutputCategory, number | null>;
      const officialValid = Boolean(A) && Boolean(input) && (!aInvalid || standardBacktestGapOnly);
      const status: CtiAdjustedStatus = officialValid
        ? "available"
        : aInvalid
          ? "invalid"
          : "unavailable";
      rows.push({
        year,
        seriesType: officialValid ? "official_adjusted" : "unavailable",
        official: true,
        status,
        reason: officialValid ? null : "official_a_invalid",
        values: officialValid ? values : nullValues(),
      });
      const majorSum = officialValid
        ? CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((sum, category) => sum + values[category]!, 0)
        : null;
      const rawResidual = officialValid ? values[CTI_ADJUSTED_RESIDUAL_CATEGORY] : null;
      const derivedResidual =
        officialValid &&
        rawResidual === null &&
        values[CTI_ADJUSTED_TOTAL_CATEGORY] !== null &&
        majorSum !== null
          ? values[CTI_ADJUSTED_TOTAL_CATEGORY]! - majorSum
          : null;
      const residual = rawResidual ?? derivedResidual;
      if (residual !== null) values[CTI_ADJUSTED_RESIDUAL_CATEGORY] = residual;
      const difference =
        officialValid &&
        values[CTI_ADJUSTED_TOTAL_CATEGORY] !== null &&
        residual !== null &&
        majorSum !== null
          ? values[CTI_ADJUSTED_TOTAL_CATEGORY]! - majorSum - residual
          : null;
      officialAdditivity[year] = {
        total: values[CTI_ADJUSTED_TOTAL_CATEGORY],
        majorSum,
        residual,
        difference,
        additive: difference === null ? null : Math.abs(difference) <= tolerance,
        reason:
          rawResidual === null && derivedResidual !== null
            ? "derived_from_total_minus_major_categories"
            : null,
      };
      const officialOutput = rows[rows.length - 1].values;
      officialPreservation[year] = {
        input: values,
        output: officialOutput,
        exact:
          officialValid &&
          CTI_ADJUSTED_OUTPUT_CATEGORIES.every(
            (category) => values[category] === officialOutput[category],
          ),
      };
      residualValidation[year] = {
        value: residual,
        status: officialValid ? "available" : status,
        reason: officialValid
          ? rawResidual === null && derivedResidual !== null
            ? "derived_from_total_minus_major_categories"
            : null
          : "official_a_invalid",
      };
      continue;
    }
    const values = nullValues();
    const annualD = dRows[year];
    const withinEstimateRange = year >= target.startYear && year < target.officialStartYear;
    let available =
      withinEstimateRange && !aInvalid && !bInvalid && !lInvalid && annualD?.status === "available";
    let reason = annualD?.reason ?? "unavailable";
    if (!withinEstimateRange)
      reason = year < target.startYear ? (annualD?.reason ?? "unavailable") : "unavailable";
    if (
      available &&
      isFiniteNumber(aConnection?.[CTI_ADJUSTED_TOTAL_CATEGORY]) &&
      isFiniteNumber(bConnection?.[CTI_ADJUSTED_TOTAL_CATEGORY]) &&
      isFiniteNumber(annualD.value)
    ) {
      values[CTI_ADJUSTED_TOTAL_CATEGORY] =
        bConnection![CTI_ADJUSTED_TOTAL_CATEGORY]! *
        (aConnection![CTI_ADJUSTED_TOTAL_CATEGORY]! / bConnection![CTI_ADJUSTED_TOTAL_CATEGORY]!) *
        annualD.value!;
      const b = entry.b?.values;
      for (const category of CTI_ADJUSTED_MAJOR_CATEGORIES) {
        const betaValue = beta[category].value;
        const baseA = aConnection?.[category];
        const baseB = b?.[category];
        const baseBConnection = bConnection?.[category];
        const estimate =
          isFiniteNumber(betaValue) &&
          isFiniteNumber(baseA) &&
          isFiniteNumber(baseB) &&
          isFiniteNumber(baseBConnection) &&
          baseBConnection > 0
            ? baseB! * (baseA! / baseBConnection!) * Math.pow(annualD.value!, betaValue!)
            : null;
        if (!isFiniteNumber(estimate) || estimate <= 0) {
          available = false;
          break;
        }
        values[category] = estimate;
      }
      const majorSum = CTI_ADJUSTED_MAJOR_CATEGORIES.reduce(
        (sum, category) => sum + (values[category] ?? 0),
        0,
      );
      const residual =
        values[CTI_ADJUSTED_TOTAL_CATEGORY] !== null
          ? values[CTI_ADJUSTED_TOTAL_CATEGORY]! - majorSum
          : null;
      if (
        !isFiniteNumber(residual) ||
        ((options.rejectNegativeResidual ?? true) && residual! < -tolerance)
      )
        available = false;
      else {
        values[CTI_ADJUSTED_RESIDUAL_CATEGORY] = residual;
        candidateResidualByYear.set(year, residual);
      }
    } else if (aInvalid || bInvalid || lInvalid) reason = "invalid_input";
    const rowValues = available ? values : nullValues();
    rows.push({
      year,
      seriesType: available ? "estimated_adjusted" : "unavailable",
      official: false,
      status: available
        ? "available"
        : aInvalid || bInvalid || lInvalid
          ? "invalid"
          : "unavailable",
      reason: available ? null : reason,
      values: rowValues,
    });
    stacking[year] = {
      total: rowValues[CTI_ADJUSTED_TOTAL_CATEGORY],
      majorSum: CTI_ADJUSTED_MAJOR_CATEGORIES.every((category) => rowValues[category] !== null)
        ? CTI_ADJUSTED_MAJOR_CATEGORIES.reduce((sum, category) => sum + rowValues[category]!, 0)
        : null,
      residual: rowValues[CTI_ADJUSTED_RESIDUAL_CATEGORY],
      status: available
        ? "available"
        : aInvalid || bInvalid || lInvalid
          ? "invalid"
          : "unavailable",
      reason: available ? null : reason,
    };
    residualValidation[year] = {
      value: rowValues[CTI_ADJUSTED_RESIDUAL_CATEGORY],
      status: available ? "available" : "unavailable",
      reason: available ? null : reason,
    };
  }
  for (const category of CTI_ADJUSTED_OUTPUT_CATEGORIES) {
    const official = isFiniteNumber(aConnection?.[category]) ? aConnection![category]! : null;
    const bValue = isFiniteNumber(bConnection?.[category]) ? bConnection![category]! : null;
    const calculatedValue =
      official !== null && bValue !== null && bValue > 0 ? bValue * (official / bValue) : null;
    const difference =
      calculatedValue !== null && official !== null ? calculatedValue - official : null;
    connection2017[category] = {
      official,
      calculatedValue,
      difference,
      relativeError:
        official !== null && official !== 0 && difference !== null
          ? Math.abs(difference) / Math.abs(official)
          : null,
      tolerance,
      passed: difference === null ? null : Math.abs(difference) <= tolerance,
    };
  }
  // Evaluate jumps from candidate values before threshold fail-closed hides rows.
  const residualByYear = new Map<number, number>();
  for (const row of rows) {
    const residual = row.values[CTI_ADJUSTED_RESIDUAL_CATEGORY];
    if (isFiniteNumber(residual)) residualByYear.set(row.year, residual);
  }
  for (const [year, residual] of candidateResidualByYear) residualByYear.set(year, residual);
  const sortedResidualYears = [...residualByYear.keys()].sort((a, b) => a - b);
  for (const year of sortedResidualYears) {
    const previousYear = year - 1;
    const value = residualByYear.get(year)!;
    const previousValue = residualByYear.get(previousYear) ?? null;
    const absoluteDifference = previousValue === null ? null : Math.abs(value - previousValue);
    const relativeChange =
      previousValue === null || previousValue === 0
        ? null
        : (value - previousValue) / Math.abs(previousValue);
    const yearOverYearRatio =
      previousValue === null || previousValue === 0 ? null : value / previousValue;
    residualJumps[year] = {
      previousYear: previousValue === null ? null : previousYear,
      value,
      previousValue,
      absoluteDifference,
      relativeChange,
      yearOverYearRatio,
      exceeded: absoluteDifference === null ? null : absoluteDifference > residualJumpThreshold,
      reason:
        absoluteDifference !== null && absoluteDifference > residualJumpThreshold
          ? "residual_jump_threshold_exceeded"
          : null,
    };
  }
  const boundary = residualJumps[2017] ?? {
    absoluteDifference: null,
    relativeChange: null,
    yearOverYearRatio: null,
    exceeded: null,
    reason: "insufficient_residual_boundary_values",
  };
  const invalidateEstimate = (row: CtiAdjustedOutputRow) => {
    row.seriesType = "unavailable";
    row.status = "unavailable";
    row.reason = "residual_jump_threshold_exceeded";
    row.values = nullValues();
    stacking[row.year] = {
      total: null,
      majorSum: null,
      residual: null,
      status: "unavailable",
      reason: row.reason,
    };
    residualValidation[row.year] = { value: null, status: "unavailable", reason: row.reason };
  };
  for (const row of rows) {
    const jump = residualJumps[row.year];
    if (row.seriesType !== "estimated_adjusted" || !jump?.exceeded) continue;
    invalidateEstimate(row);
  }
  if (boundary.exceeded) {
    const boundaryEstimate = rows.find(
      (row) => row.year === 2016 && row.seriesType === "estimated_adjusted",
    );
    if (boundaryEstimate) invalidateEstimate(boundaryEstimate);
  }
  const inputMetadata = {
    B: auditMetadata(B?.metadata) ?? null,
    A: auditMetadata(A?.metadata) ?? null,
    L: auditMetadata(L?.metadata) ?? null,
  } as CtiAdjustedAudit["inputMetadata"];
  const inputMetadataFingerprint = {
    B: metadataFingerprint(inputMetadata.B),
    A: metadataFingerprint(inputMetadata.A),
    L: metadataFingerprint(inputMetadata.L),
  } as CtiAdjustedAudit["inputMetadataFingerprint"];
  return {
    rows,
    audit: {
      formulaVersion: "ratio-log-beta-v1",
      schemaVersion: "cti-adjusted-audit-v5",
      validation,
      inputMetadata,
      inputMetadataFingerprint,
      beta,
      betaCalibrationYears,
      betaTargetYear: target.connectionYear,
      betaHoldoutYears: [...holdoutSet],
      betaTrainingYears: trainingYears,
      betaExcludedYears: excludedYears,
      ratios,
      fittedRatios,
      d,
      connection2017,
      officialPreservation,
      officialAdditivity,
      residualValidation,
      residualJumpThreshold,
      residualJumps,
      residualBoundaryJump: {
        fromYear: 2016,
        toYear: 2017,
        absoluteDifference: boundary.absoluteDifference,
        relativeChange: boundary.relativeChange,
        yearOverYearRatio: boundary.yearOverYearRatio,
        exceeded: boundary.exceeded,
        reason: boundary.reason,
      },
      stacking,
      holdoutLeakage,
      backtest,
    },
  };
}
