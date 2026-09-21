/** Plan39-v2 diagnostic rolling and leave-one-year-out backtests. */
import {
  CTI_ADJUSTED_MAJOR_CATEGORIES,
  CTI_ADJUSTED_TOTAL_CATEGORY,
  type CtiAdjustedAnnualInput,
  type CtiAdjustedMajorCategory,
} from "./ctiAdjustedConnectionEstimate";

export const CTI_ADJUSTED_BACKTEST_YEARS = Array.from({ length: 8 }, (_, index) => 2018 + index);
export const CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR = 2017 as const;
export const CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY = "その他の消費支出" as const;
export const CTI_ADJUSTED_BACKTEST_CATEGORIES = [
  ...CTI_ADJUSTED_MAJOR_CATEGORIES,
  CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY,
] as const;

export type CtiAdjustedRollingBacktestCategory =
  | CtiAdjustedMajorCategory
  | typeof CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY;
export type CtiAdjustedRollingBacktestStatus = "pass" | "fail" | "insufficient-data";
export type CtiAdjustedRollingBacktestMetrics = {
  modelMae: number | null;
  baselineMae: number | null;
  maxAbsoluteError: number | null;
  bias: number | null;
  evaluatedFolds: number;
};
export type CtiAdjustedRollingBacktestFold = {
  trainYears: readonly number[];
  validationYear: number;
  leakage: false;
  beta: Record<CtiAdjustedRollingBacktestCategory, number | null>;
  other: {
    predicted: number | null;
    observed: number | null;
    error: number | null;
    absoluteError: number | null;
    baselinePredicted: number | null;
    baselineError: number | null;
  };
  finite: boolean;
  status: "available" | "insufficient-data";
  reason: string | null;
};
export type CtiAdjustedRollingBacktest = {
  status: CtiAdjustedRollingBacktestStatus;
  pass: boolean;
  trainYears: readonly number[];
  validationYears: readonly number[];
  excludedYears: readonly number[];
  minimumTrainingYears: number;
  folds: readonly CtiAdjustedRollingBacktestFold[];
  metrics: CtiAdjustedRollingBacktestMetrics;
  allFoldsFinite: boolean;
  leakageFree: boolean;
  reason: string | null;
};
export type CtiAdjustedRollingLooBacktest = {
  years: readonly number[];
  rolling: CtiAdjustedRollingBacktest;
  loo: CtiAdjustedRollingBacktest;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const rowMap = (input: CtiAdjustedAnnualInput) => new Map(input.rows.map((row) => [row.year, row]));
const emptyBeta = (): Record<CtiAdjustedRollingBacktestCategory, number | null> =>
  Object.fromEntries(
    CTI_ADJUSTED_BACKTEST_CATEGORIES.map((category) => [category, null]),
  ) as Record<CtiAdjustedRollingBacktestCategory, number | null>;

const other = (values: Record<string, number | null> | undefined): number | null => {
  const total = values?.[CTI_ADJUSTED_TOTAL_CATEGORY];
  const majors = CTI_ADJUSTED_MAJOR_CATEGORIES.map((category) => values?.[category]);
  if (!finite(total) || !majors.every(positive)) return null;
  const result = total - majors.reduce((sum, value) => sum + value, 0);
  return positive(result) ? result : null;
};

const fitBeta = (
  years: readonly number[],
  B: ReturnType<typeof rowMap>,
  A: ReturnType<typeof rowMap>,
  category: CtiAdjustedRollingBacktestCategory,
): number | null => {
  const points = years.flatMap((year) => {
    const b =
      category === CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY
        ? other(B.get(year)?.values)
        : B.get(year)?.values[category];
    const a =
      category === CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY
        ? other(A.get(year)?.values)
        : A.get(year)?.values[category];
    const bt = B.get(year)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    const at = A.get(year)?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    const totalRatio = positive(at) && positive(bt) ? at / bt : null;
    const categoryRatio = positive(a) && positive(b) ? a / b : null;
    return positive(totalRatio) && positive(categoryRatio)
      ? [{ x: Math.log(totalRatio), y: Math.log(categoryRatio) }]
      : [];
  });
  if (points.length < 3 || points.some(({ x, y }) => !finite(x) || !finite(y))) return null;
  const denominator = points.reduce((sum, point) => sum + point.x ** 2, 0);
  const beta =
    denominator > 0
      ? points.reduce((sum, point) => sum + point.x * point.y, 0) / denominator
      : null;
  return finite(beta) ? beta : null;
};

const metrics = (
  folds: readonly CtiAdjustedRollingBacktestFold[],
): CtiAdjustedRollingBacktestMetrics => {
  const evaluated = folds.filter(
    (fold) => finite(fold.other.error) && finite(fold.other.baselineError),
  );
  if (!evaluated.length)
    return {
      modelMae: null,
      baselineMae: null,
      maxAbsoluteError: null,
      bias: null,
      evaluatedFolds: 0,
    };
  const errors = evaluated.map((fold) => fold.other.error!);
  return {
    modelMae: errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length,
    baselineMae:
      evaluated.reduce((sum, fold) => sum + Math.abs(fold.other.baselineError!), 0) /
      evaluated.length,
    maxAbsoluteError: Math.max(...errors.map((error) => Math.abs(error))),
    bias: errors.reduce((sum, error) => sum + error, 0) / errors.length,
    evaluatedFolds: evaluated.length,
  };
};

const build = (
  BInput: CtiAdjustedAnnualInput,
  AInput: CtiAdjustedAnnualInput,
  validationYears: readonly number[],
  trainingYearsFor: (validationYear: number) => readonly number[],
  minimumTrainingYears: number,
): CtiAdjustedRollingBacktest => {
  const B = rowMap(BInput);
  const A = rowMap(AInput);
  const anchorB = other(B.get(CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR)?.values);
  const anchorA = other(A.get(CTI_ADJUSTED_BACKTEST_CONNECTION_YEAR)?.values);
  const anchorRatio = positive(anchorA) && positive(anchorB) ? anchorA / anchorB : null;
  const folds = validationYears.map((validationYear): CtiAdjustedRollingBacktestFold => {
    const trainYears = [...trainingYearsFor(validationYear)];
    const beta = emptyBeta();
    for (const category of CTI_ADJUSTED_BACKTEST_CATEGORIES)
      beta[category] = fitBeta(trainYears, B, A, category);
    const bRow = B.get(validationYear);
    const aRow = A.get(validationYear);
    const bOther = other(bRow?.values);
    const observed = other(aRow?.values);
    const bTotal = bRow?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    const aTotal = aRow?.values[CTI_ADJUSTED_TOTAL_CATEGORY];
    const totalRatio =
      positive(aTotal) && positive(bTotal) && positive(anchorRatio)
        ? aTotal / bTotal / anchorRatio
        : null;
    const betaOther = beta[CTI_ADJUSTED_BACKTEST_OTHER_CATEGORY];
    const predicted =
      positive(bOther) && positive(anchorRatio) && positive(totalRatio) && finite(betaOther)
        ? bOther * anchorRatio * totalRatio ** betaOther
        : null;
    const baselineValues = trainYears.map((year) => other(A.get(year)?.values)).filter(finite);
    const baselinePredicted = baselineValues.length
      ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
      : null;
    const error = finite(predicted) && finite(observed) ? predicted - observed : null;
    const baselineError =
      finite(baselinePredicted) && finite(observed) ? baselinePredicted - observed : null;
    const reason =
      trainYears.length < minimumTrainingYears
        ? "minimum_training_years_not_met"
        : trainYears.includes(validationYear)
          ? "validation_year_in_training_years"
          : error === null || baselineError === null
            ? "non_finite_or_missing_other_value"
            : null;
    return {
      trainYears,
      validationYear,
      leakage: false,
      beta,
      other: {
        predicted,
        observed,
        error,
        absoluteError: finite(error) ? Math.abs(error) : null,
        baselinePredicted,
        baselineError,
      },
      finite: error !== null && baselineError !== null && Object.values(beta).every(finite),
      status: reason === null ? "available" : "insufficient-data",
      reason,
    };
  });
  const evaluated = folds.filter((fold) => fold.status === "available");
  const summary = metrics(folds);
  const allFoldsFinite = folds.length > 0 && folds.every((fold) => fold.finite);
  const leakageFree = folds.every(
    (fold) => fold.leakage === false && !fold.trainYears.includes(fold.validationYear),
  );
  const pass =
    allFoldsFinite &&
    leakageFree &&
    summary.modelMae !== null &&
    summary.baselineMae !== null &&
    summary.modelMae <= summary.baselineMae;
  const status: CtiAdjustedRollingBacktestStatus =
    !folds.length || evaluated.length !== folds.length
      ? "insufficient-data"
      : pass
        ? "pass"
        : "fail";
  return {
    status,
    pass,
    trainYears: [...new Set(folds.flatMap((fold) => fold.trainYears))].sort((a, b) => a - b),
    validationYears: [...validationYears],
    excludedYears: [2017],
    minimumTrainingYears,
    folds,
    metrics: summary,
    allFoldsFinite,
    leakageFree,
    reason:
      status === "pass"
        ? null
        : !leakageFree
          ? "leakage_detected"
          : status === "insufficient-data"
            ? "one_or_more_folds_not_evaluable"
            : "model_mae_exceeds_baseline_mae",
  };
};

export function buildCtiAdjustedRollingLooBacktest(
  B: CtiAdjustedAnnualInput,
  A: CtiAdjustedAnnualInput,
  _L: CtiAdjustedAnnualInput,
  options: { minimumTrainingYears?: number } = {},
): CtiAdjustedRollingLooBacktest {
  const minimumTrainingYears =
    Number.isInteger(options.minimumTrainingYears) && (options.minimumTrainingYears ?? 0) >= 3
      ? options.minimumTrainingYears!
      : 3;
  const years = [...CTI_ADJUSTED_BACKTEST_YEARS];
  const rollingYears = years.filter((year) => year - years[0] >= minimumTrainingYears);
  return {
    years,
    rolling: build(
      B,
      A,
      rollingYears,
      (year) => years.filter((candidate) => candidate < year),
      minimumTrainingYears,
    ),
    loo: build(
      B,
      A,
      years,
      (year) => years.filter((candidate) => candidate !== year),
      minimumTrainingYears,
    ),
  };
}

export const buildCtiAdjustedRollingBacktest = buildCtiAdjustedRollingLooBacktest;
