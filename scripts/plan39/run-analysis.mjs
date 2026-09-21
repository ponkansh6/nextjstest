#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCtiAdjustedConnectionEstimate,
  loadCtiAdjustedInputs,
} from "../../server/lib/data-loader/ctiAdjusted.ts";
import { buildCtiAdjustedConnectionEstimate } from "../../server/lib/ctiAdjustedConnectionEstimate.ts";
import { buildCtiAdjustedV2Estimate } from "../../server/lib/ctiAdjustedConnectionEstimateV2.ts";
import { buildCtiAdjustedRollingLooBacktest } from "../../server/lib/ctiAdjustedRollingBacktest.ts";
import { buildCtiAdjustedSensitivityAnalysis } from "../../server/lib/ctiAdjustedSensitivity.ts";
import {
  evaluateCtiAdjustedPublicationGate,
  CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
} from "../../server/lib/ctiAdjustedPublicationGate.ts";

const KINDS = ["B", "A", "L"];
const THRESHOLDS = [0.25, 0.5, 1, 1.4, 1.5, 2];
const SELECTED_THRESHOLD = 1.4;
const PERIOD_YEARS = Array.from({ length: 8 }, (_, i) => 2018 + i);
const ALTERNATIVE_PERIOD_YEARS = Array.from({ length: 7 }, (_, i) => 2018 + i);
const TARGET_YEAR = 2017;
const HOLDOUT_YEARS = [TARGET_YEAR];
const STANDARD_BACKTEST = { trainingYears: PERIOD_YEARS, targetYear: TARGET_YEAR };
const PRODUCTION_OPTIONS = {
  calibrationYears: PERIOD_YEARS,
  backtest: STANDARD_BACKTEST,
  holdoutYears: HOLDOUT_YEARS,
};
const SENSITIVITY_SCENARIOS = [
  {
    name: "baseline_2018_2025",
    calibrationYears: PERIOD_YEARS,
    holdoutYears: HOLDOUT_YEARS,
    lAnnualizationRule: "official_annual",
  },
  {
    name: "alternative_2018_2024",
    calibrationYears: ALTERNATIVE_PERIOD_YEARS,
    holdoutYears: HOLDOUT_YEARS,
    lAnnualizationRule: "official_annual",
  },
];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_ARTIFACT_ROOT = path.join(REPO_ROOT, "data/source/cti-adjusted");
const DEFAULT_RESULTS_ROOT = path.join(REPO_ROOT, "results/plan39");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check")
      args.set(arg, argv[i + 1]?.startsWith("--") ? true : (argv[++i] ?? true));
    else if (arg.startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--"))
      args.set(arg, argv[++i]);
    else if (arg.startsWith("--")) args.set(arg, true);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function inputSnapshot(root, validatedInputs) {
  const manifestFile = path.join(root, "manifest.json");
  const manifest = await readJson(manifestFile);
  const inputs = {};
  const artifacts = {};
  for (const kind of KINDS) {
    const relative = manifest.artifacts?.[kind]?.path ?? `${kind}.json`;
    const file = path.resolve(root, relative);
    if (path.dirname(file) !== path.resolve(root))
      throw new Error(`${kind} artifact escapes artifact root`);
    const bytes = await readFile(file);
    const document = JSON.parse(bytes.toString("utf8"));
    inputs[kind] = validatedInputs[kind] ?? document;
    artifacts[kind] = {
      path: relative,
      sha256: sha256(bytes),
      manifestSha256: manifest.artifacts?.[kind]?.sha256 ?? null,
      metadata: document.metadata ?? null,
      metadataFingerprint: document.metadata
        ? `sha256:${sha256(Buffer.from(JSON.stringify(document.metadata)))}`
        : null,
      coverage: {
        rawRange: document.metadata?.rawRange ?? null,
        adoptedRange: document.metadata?.adoptedRange ?? null,
        rows: document.rows?.length ?? 0,
      },
      source: {
        source: document.metadata?.source ?? null,
        artifactIdentifier: document.metadata?.artifactIdentifier ?? null,
        officialPageUrl: document.metadata?.officialPageUrl ?? null,
        downloadUrl: document.metadata?.downloadUrl ?? null,
        statInfId: document.metadata?.statInfId ?? null,
        statisticalCode: document.metadata?.statisticalCode ?? manifest.statisticalCode ?? null,
        revision: document.metadata?.revision ?? manifest.revision ?? null,
      },
    };
  }
  const manifestBytes = await readFile(manifestFile);
  const auditFile = path.join(root, "audit.json");
  const auditBytes = await readFile(auditFile);
  return {
    inputs,
    manifest,
    priorAudit: JSON.parse(auditBytes.toString("utf8")),
    hashes: {
      manifest: sha256(manifestBytes),
      audit: sha256(auditBytes),
      artifacts: Object.fromEntries(KINDS.map((kind) => [kind, artifacts[kind].sha256])),
    },
    artifacts,
  };
}

function backtestSummary(audit) {
  const backtest = audit.backtest ?? {};
  const evaluated = Object.entries(backtest.officialR ?? {}).filter(
    ([category, official]) => finite(official) && finite(backtest.predictedR?.[category]),
  );
  const omitted = Object.keys(backtest.officialR ?? {}).filter(
    (category) => !evaluated.some(([name]) => name === category),
  );
  return {
    requested: STANDARD_BACKTEST,
    evaluated: Object.fromEntries(
      evaluated.map(([category, official]) => [
        category,
        {
          official,
          predicted: backtest.predictedR[category],
          absoluteError: backtest.absoluteError?.[category] ?? null,
          relativeError: backtest.relativeError?.[category] ?? null,
        },
      ]),
    ),
    omitted: Object.fromEntries(
      omitted.map((category) => [category, { reason: "official_or_predicted_value_unavailable" }]),
    ),
    evaluatedCategories: evaluated.map(([category]) => category),
    omittedCategories: omitted,
    evaluationCount: evaluated.length,
    officialComparison: {
      possible: backtest.status === "available" && evaluated.length > 0,
      reason:
        backtest.status === "available" && evaluated.length > 0
          ? null
          : (backtest.reason ?? "backtest_unavailable"),
    },
    leakage: {
      detected: Boolean(backtest.leakageDetected),
      excludedYears: backtest.excludedYears ?? [],
      reason: backtest.leakageDetected ? "target_year_in_training_years" : null,
    },
    result: backtest,
  };
}

function backtestVerdict(audit) {
  const backtest = audit.backtest ?? {};
  const requestedYears = STANDARD_BACKTEST.trainingYears;
  const allCategories =
    Object.keys(backtest.officialR ?? {}).length === 9 &&
    Object.entries(backtest.officialR ?? {}).every(
      ([category, official]) => finite(official) && finite(backtest.predictedR?.[category]),
    );
  const yearsMatch =
    JSON.stringify(backtest.trainingYears) === JSON.stringify(requestedYears) &&
    backtest.targetYear === STANDARD_BACKTEST.targetYear;
  const inputValid = audit.validation?.valid === true;
  const leakageFree = backtest.leakageDetected === false && !audit.holdoutLeakage?.detected;
  const passed =
    inputValid && backtest.status === "available" && yearsMatch && allCategories && leakageFree;
  const failed = backtest.leakageDetected === true || audit.holdoutLeakage?.detected === true;
  return {
    status: passed ? "pass" : failed ? "fail" : "insufficient-data",
    requestedYears,
    targetYear: STANDARD_BACKTEST.targetYear,
    evaluatedCategories: Object.keys(backtest.officialR ?? {}).filter(
      (category) =>
        finite(backtest.officialR?.[category]) && finite(backtest.predictedR?.[category]),
    ),
    checks: { inputValid, yearsMatch, allNineCategories: allCategories, leakageFree },
    reason: passed ? null : failed ? "backtest_leakage_detected" : "backtest_not_fully_evaluable",
  };
}

function sensitivityVerdict(raw) {
  const reasons = [];
  if (raw.status !== "available") reasons.push("insufficient_sensitivity_scenario");
  if (Object.values(raw.betaDifference ?? {}).some((value) => value === null))
    reasons.push("insufficient_beta_difference");
  if (Object.values(raw.dDifference ?? {}).some((value) => value === null))
    reasons.push("insufficient_d_difference");
  if (
    Object.values(raw.estimateDifference ?? {}).some((value) => value === null) ||
    raw.maxRelativeDifference === null
  )
    reasons.push("insufficient_estimate_difference");
  const insufficient = reasons.length > 0;
  const accepted = insufficient ? false : raw.acceptance?.accepted === true;
  return {
    status: insufficient ? "insufficient-data" : accepted ? "pass" : "fail",
    acceptance: accepted,
    reasonCodes: insufficient
      ? [...new Set(reasons)]
      : accepted
        ? []
        : ["sensitivity_threshold_exceeded"],
    check: {
      status: insufficient ? "not-evaluable" : accepted ? "pass" : "fail",
      reasonCodes: insufficient
        ? [...new Set(reasons)]
        : accepted
          ? []
          : ["sensitivity_threshold_exceeded"],
    },
  };
}

function rollingLooVerdict(rollingLoo) {
  const statuses = [rollingLoo.rolling.status, rollingLoo.loo.status];
  const status = statuses.includes("insufficient-data")
    ? "insufficient-data"
    : statuses.includes("fail")
      ? "fail"
      : "pass";
  return {
    status,
    accepted: status === "pass" && rollingLoo.rolling.pass && rollingLoo.loo.pass,
    checks: {
      rolling: rollingLoo.rolling.status,
      loo: rollingLoo.loo.status,
      rollingFinite: rollingLoo.rolling.allFoldsFinite,
      looFinite: rollingLoo.loo.allFoldsFinite,
      rollingLeakageFree: rollingLoo.rolling.leakageFree,
      looLeakageFree: rollingLoo.loo.leakageFree,
    },
    reasonCodes: status === "pass" ? [] : ["rolling_loo_backtest_incomplete"],
  };
}

function v2PublicationGate(v2Gate, rollingLoo) {
  const gate = evaluateCtiAdjustedPublicationGate({
    baseGate: v2Gate,
    rollingLoo,
    evidenceSchema: CTI_ADJUSTED_PUBLICATION_GATE_SCHEMA,
  });
  return {
    ...v2Gate,
    accepted: gate.accepted,
    status: gate.status,
    reasonCodes: gate.reasonCodes,
    blockingReasonCodes: gate.blockingReasonCodes,
    rollingLooEvidence: gate.evidence,
  };
}

function v2AuditSection(v2, gammaScenarios, standard, rollingLoo) {
  const other = Object.fromEntries(
    v2.years.map((year) => {
      const row = v2.rows.find((candidate) => candidate.year === year);
      const value = row?.values?.["その他の消費支出"] ?? null;
      const status = value === null ? "unavailable" : year >= 2017 ? "official" : "estimated";
      return [year, { value, status, reason: row?.reason ?? null }];
    }),
  );
  const bottomUp = Object.fromEntries(
    v2.rows.map((row) => {
      const majorSum = Object.entries(row.values)
        .filter(([category]) => category !== "総合" && category !== "その他の消費支出")
        .map(([, value]) => value)
        .every(finite)
        ? Object.entries(row.values)
            .filter(([category]) => category !== "総合" && category !== "その他の消費支出")
            .reduce((sum, [, value]) => sum + value, 0)
        : null;
      return [
        row.year,
        {
          total: row.values.総合,
          majorSum,
          other: row.values["その他の消費支出"],
          status: row.status,
          reason: row.reason,
        },
      ];
    }),
  );
  const standardBoundary = standard?.audit?.residualBoundaryJump ?? null;
  const boundary = standardBoundary
    ? {
        ...v2.residual.boundary2016To2017,
        previousYear: 2016,
        yearOverYearRatio: standardBoundary.yearOverYearRatio,
        exceeded: standardBoundary.exceeded,
        status: standardBoundary.exceeded === null ? "unavailable" : "available",
        reason: standardBoundary.reason,
        source: "v1_standard_residual_diagnostics",
        observedReference: {
          fromYear: 2016,
          toYear: 2017,
          diagnostic: "residualBoundaryJump",
          absoluteDifference: standardBoundary.absoluteDifference,
          relativeChange: standardBoundary.relativeChange,
        },
      }
    : v2.residual.boundary2016To2017;
  return {
    model: v2.model,
    version: v2.estimateVersion,
    beta: v2.beta,
    fitDiagnostics: v2.fitDiagnostics,
    other: { category: "その他の消費支出", annual: other, diagnostics: v2.other },
    bottomUp,
    residual: v2.residual,
    benchmarkG: {
      values: v2.benchmarkG,
      status: v2.benchmarkGDiagnostics.status,
      coverage: v2.benchmarkGDiagnostics.coverage,
      diagnostics: v2.benchmarkGDiagnostics,
    },
    boundary2016To2017: boundary,
    publicationGate: v2PublicationGate(v2.publicationGate, rollingLoo),
    gammaScenarios,
  };
}

function thresholdSummary(input, threshold, options) {
  const estimate = buildCtiAdjustedConnectionEstimate(input.B, input.A, input.L, {
    ...options,
    residualJumpThreshold: threshold,
  });
  const boundary = estimate.audit.residualBoundaryJump;
  const rows = estimate.rows.filter((row) => row.seriesType === "estimated_adjusted");
  const boundaryEvaluable = boundary.exceeded === false || boundary.exceeded === true;
  const status =
    !estimate.audit.validation.valid || !boundaryEvaluable
      ? "insufficient-data"
      : boundary.exceeded === true
        ? "fail"
        : "pass";
  return {
    threshold,
    status,
    accepted: threshold === SELECTED_THRESHOLD && status === "pass" && boundary.exceeded === false,
    exceededIsNotPass: true,
    reason:
      status === "insufficient-data"
        ? "insufficient_residual_boundary_values"
        : status === "fail"
          ? "residual_jump_threshold_exceeded"
          : null,
    boundary2016To2017: boundary,
    estimatedRows: {
      count: rows.length,
      publishable: rows.every((row) => row.status === "available"),
      reason: rows.every((row) => row.status === "available")
        ? null
        : "one_or_more_estimated_rows_unavailable_or_invalid",
    },
    audit: estimate.audit,
  };
}

function publicRows(rows, v2Rows, globallyPublishable) {
  const v2ByYear = new Map(v2Rows.map((row) => [row.year, row]));
  return rows.map((row) => {
    if (row.year < 2005 || row.year > 2016) return row;
    if (globallyPublishable) {
      const v2Row = v2ByYear.get(row.year);
      if (v2Row?.status === "available") {
        const { ["その他の消費支出"]: other, ...values } = v2Row.values;
        return {
          ...row,
          seriesType: "estimated_adjusted",
          official: false,
          status: "available",
          reason: null,
          values: { ...values, 残差: other },
        };
      }
    }
    return {
      ...row,
      seriesType: "unavailable",
      official: false,
      status: "unavailable",
      reason: "overall_verdict_not_accepted",
      values: Object.fromEntries(Object.keys(row.values).map((category) => [category, null])),
    };
  });
}

async function atomicWrite(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

async function run(args) {
  const artifactRoot = path.resolve(args.get("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const resultsRoot = path.resolve(args.get("--results-dir") ?? DEFAULT_RESULTS_ROOT);
  // The loader is the only validation/input gate. These are the exact same
  // loader artifacts, retained because the sensitivity API takes AnnualInput values.
  const loaded = loadCtiAdjustedConnectionEstimate({ artifactRoot });
  const validatedInputs = loadCtiAdjustedInputs({ artifactRoot });
  const snapshot = await inputSnapshot(artifactRoot, validatedInputs);
  const standard = buildCtiAdjustedConnectionEstimate(
    snapshot.inputs.B,
    snapshot.inputs.A,
    snapshot.inputs.L,
    { ...PRODUCTION_OPTIONS, residualJumpThreshold: SELECTED_THRESHOLD },
  );
  const options = {
    standardBacktest: STANDARD_BACKTEST,
    production: PRODUCTION_OPTIONS,
    sensitivity: { scenarios: SENSITIVITY_SCENARIOS },
    residualJumpThreshold: SELECTED_THRESHOLD,
  };
  const sensitivity = buildCtiAdjustedSensitivityAnalysis(
    snapshot.inputs.B,
    snapshot.inputs.A,
    snapshot.inputs.L,
    { residualJumpThreshold: SELECTED_THRESHOLD, scenarios: SENSITIVITY_SCENARIOS },
  );
  const v2 = buildCtiAdjustedV2Estimate(snapshot.inputs.B, snapshot.inputs.A, snapshot.inputs.L);
  const rollingLoo = buildCtiAdjustedRollingLooBacktest(
    snapshot.inputs.B,
    snapshot.inputs.A,
    snapshot.inputs.L,
  );
  const rollingLooCheck = rollingLooVerdict(rollingLoo);
  const v2Audit = v2AuditSection(v2, sensitivity.gammaScenarios, standard, rollingLoo);
  const inputFingerprint = sha256(
    JSON.stringify({
      manifest: snapshot.hashes.manifest,
      audit: snapshot.hashes.audit,
      artifacts: snapshot.hashes.artifacts,
    }),
  );
  const generatedAt = new Date().toISOString();
  const result = {
    schemaVersion: "plan39-analysis-v1",
    formulaVersion: standard.audit.formulaVersion,
    inputFingerprint: `sha256:${inputFingerprint}`,
    analysisFingerprint: null,
    generatedAt,
    generation: { generatedAt, node: process.version, script: "scripts/plan39/run-analysis.mjs" },
    inputs: {
      root: path.relative(REPO_ROOT, artifactRoot),
      manifest: snapshot.manifest,
      manifestSha256: snapshot.hashes.manifest,
      auditSha256: snapshot.hashes.audit,
      artifacts: snapshot.artifacts,
      priorAudit: snapshot.priorAudit,
    },
    options: { ...options, residualJumpThresholdCandidates: THRESHOLDS },
    periods: {
      productionCalibrationYears: PERIOD_YEARS,
      backtestTrainingYears: PERIOD_YEARS,
      targetYear: TARGET_YEAR,
      holdoutYears: HOLDOUT_YEARS,
      sensitivity: SENSITIVITY_SCENARIOS,
      inputCoverage: snapshot.artifacts,
      leakage: {
        backtest: standard.audit.backtest.leakageDetected,
        holdout: standard.audit.holdoutLeakage.detected,
      },
    },
    loader: { validation: loaded.audit.validation, audit: loaded.audit },
    standard: {
      audit: standard.audit,
      rows: standard.rows,
      backtest: backtestSummary(standard.audit),
    },
    sensitivity,
    rollingLoo,
    v2: v2Audit,
    sensitivityVerdict: sensitivityVerdict(sensitivity),
    residualJumpThresholds: Object.fromEntries(
      THRESHOLDS.map((threshold) => [
        String(threshold),
        thresholdSummary(snapshot.inputs, threshold, PRODUCTION_OPTIONS),
      ]),
    ),
    publication: {
      selectedThresholdBoundaryAccepted: false,
      globallyPublishable: false,
      blockingReason: null,
      candidateRows: null,
      estimatedRows: null,
      rows: null,
    },
  };
  const checks = {
    input: {
      status: standard.audit.validation.valid ? "pass" : "insufficient-data",
      valid: standard.audit.validation.valid,
      reasonCodes: standard.audit.validation.valid ? [] : ["input_not_valid"],
    },
    backtest: backtestVerdict(standard.audit),
    rollingLoo: rollingLooCheck,
    sensitivity: result.sensitivityVerdict.check,
    residualBoundary: result.residualJumpThresholds[String(SELECTED_THRESHOLD)],
  };
  const diagnosticStatuses = Object.values(checks).map((check) => check.status);
  const hasInsufficient = diagnosticStatuses.some(
    (status) => status === "insufficient-data" || status === "not-evaluable",
  );
  const hasFailure = diagnosticStatuses.some((status) => status === "fail");
  const diagnosticStatus = hasInsufficient ? "insufficient-data" : hasFailure ? "fail" : "pass";
  const diagnosticReasonCodes = hasInsufficient
    ? ["one_or_more_checks_not_evaluable"]
    : hasFailure
      ? ["one_or_more_checks_failed"]
      : [];
  const publicationGate = result.v2.publicationGate;
  result.verdict = {
    status: publicationGate.accepted ? "pass" : publicationGate.status,
    accepted: publicationGate.accepted,
    diagnosticStatus,
    diagnosticAccepted: !hasInsufficient && !hasFailure,
    diagnosticReasonCodes,
    classification: "publication verdict",
    checks,
    reasonCodes: publicationGate.reasonCodes ?? [],
  };
  result.publication.selectedThresholdBoundaryAccepted =
    result.residualJumpThresholds[String(SELECTED_THRESHOLD)].accepted;
  result.publication.globallyPublishable = publicationGate.accepted === true;
  result.publication.blockingReason = result.publication.globallyPublishable
    ? null
    : "overall_verdict_not_accepted";
  const candidateEstimateRows = standard.rows.filter(
    (row) => row.seriesType === "estimated_adjusted",
  );
  result.publication.candidateRows = {
    ...result.residualJumpThresholds[String(SELECTED_THRESHOLD)].estimatedRows,
    years: candidateEstimateRows.map((row) => row.year),
  };
  result.publication.estimatedRows = result.publication.globallyPublishable
    ? {
        count: v2.rows.filter(
          (row) => row.year >= 2005 && row.year <= 2016 && row.status === "available",
        ).length,
        publishable: true,
        reason: null,
      }
    : { count: 0, publishable: false, reason: "overall_verdict_not_accepted" };
  result.publication.rows = publicRows(
    standard.rows,
    v2.rows,
    result.publication.globallyPublishable,
  );
  const auditSummary = {
    checks: JSON.parse(JSON.stringify(result.verdict.checks)),
    selectedThreshold: SELECTED_THRESHOLD,
    threshold: JSON.parse(
      JSON.stringify(result.residualJumpThresholds[String(SELECTED_THRESHOLD)]),
    ),
    sensitivity: {
      raw: JSON.parse(JSON.stringify(result.sensitivity)),
      sensitivityVerdict: JSON.parse(JSON.stringify(result.sensitivityVerdict)),
    },
    hash: {
      inputFingerprint: result.inputFingerprint,
      analysisFingerprint: null,
      manifestSha256: snapshot.hashes.manifest,
      auditSha256: snapshot.hashes.audit,
      artifacts: Object.fromEntries(KINDS.map((kind) => [kind, snapshot.hashes.artifacts[kind]])),
    },
    periods: JSON.parse(JSON.stringify(result.periods)),
    rollingLoo: JSON.parse(JSON.stringify(result.rollingLoo)),
    publication: JSON.parse(JSON.stringify(result.publication)),
    v2: JSON.parse(JSON.stringify(result.v2)),
    verdict: JSON.parse(JSON.stringify(result.verdict)),
  };
  const analysisFingerprint = sha256(
    JSON.stringify(
      analysisFingerprintPayload({
        inputFingerprint,
        schemaVersion: result.schemaVersion,
        formulaVersion: result.formulaVersion,
        options,
        thresholds: THRESHOLDS,
        auditSummary,
      }),
    ),
  );
  result.analysisFingerprint = `sha256:${analysisFingerprint}`;
  auditSummary.hash.analysisFingerprint = result.analysisFingerprint;
  result.auditSummary = auditSummary;
  await mkdir(resultsRoot, { recursive: true });
  const output = path.join(resultsRoot, `plan39-analysis-${inputFingerprint.slice(0, 16)}.json`);
  await atomicWrite(output, result);
  console.log(output);
}

function required(value, pathText) {
  if (value === undefined || value === null) throw new Error(`missing required field: ${pathText}`);
}

function analysisFingerprintPayload({
  inputFingerprint,
  schemaVersion,
  formulaVersion,
  options,
  thresholds,
  auditSummary,
}) {
  const summary = JSON.parse(JSON.stringify(auditSummary));
  summary.hash.analysisFingerprint = null;
  return {
    inputFingerprint,
    schemaVersion,
    formulaVersion,
    options,
    thresholds,
    auditSummary: summary,
  };
}

function expectedDiagnosticVerdict(checks) {
  const statuses = Object.values(checks).map((check) => check.status);
  const hasInsufficient = statuses.some(
    (status) => status === "insufficient-data" || status === "not-evaluable",
  );
  const hasFailure = statuses.some((status) => status === "fail");
  return {
    status: hasInsufficient ? "insufficient-data" : hasFailure ? "fail" : "pass",
    diagnosticAccepted: !hasInsufficient && !hasFailure,
    reasonCodes: hasInsufficient
      ? ["one_or_more_checks_not_evaluable"]
      : hasFailure
        ? ["one_or_more_checks_failed"]
        : [],
  };
}

function expectedPublicationVerdict(publicationGate) {
  return {
    status: publicationGate.accepted ? "pass" : publicationGate.status,
    accepted: publicationGate.accepted,
    reasonCodes: publicationGate.reasonCodes ?? [],
  };
}

async function check(args) {
  const artifactRoot = path.resolve(args.get("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const resultsRoot = path.resolve(args.get("--results-dir") ?? DEFAULT_RESULTS_ROOT);
  const loaded = loadCtiAdjustedConnectionEstimate({ artifactRoot });
  const validatedInputs = loadCtiAdjustedInputs({ artifactRoot });
  const snapshot = await inputSnapshot(artifactRoot, validatedInputs);
  const expectedFingerprint = sha256(
    JSON.stringify({
      manifest: snapshot.hashes.manifest,
      audit: snapshot.hashes.audit,
      artifacts: snapshot.hashes.artifacts,
    }),
  );
  let file = args.get("--check");
  if (file === true)
    file = path.join(resultsRoot, `plan39-analysis-${expectedFingerprint.slice(0, 16)}.json`);
  file = path.resolve(file);
  const result = await readJson(file);
  for (const field of [
    "schemaVersion",
    "formulaVersion",
    "inputFingerprint",
    "analysisFingerprint",
    "generatedAt",
    "generation",
    "inputs",
    "options",
    "periods",
    "loader",
    "standard",
    "sensitivity",
    "rollingLoo",
    "v2",
    "sensitivityVerdict",
    "residualJumpThresholds",
    "publication",
    "verdict",
    "auditSummary",
  ])
    required(result[field], field);
  if (result.inputFingerprint !== `sha256:${expectedFingerprint}`)
    throw new Error("input hash mismatch");
  const summaryForFingerprint = JSON.parse(JSON.stringify(result.auditSummary));
  required(summaryForFingerprint.hash, "auditSummary.hash");
  summaryForFingerprint.hash.analysisFingerprint = null;
  const expectedAnalysisFingerprint = sha256(
    JSON.stringify(
      analysisFingerprintPayload({
        inputFingerprint: expectedFingerprint,
        schemaVersion: result.schemaVersion,
        formulaVersion: result.formulaVersion,
        options: { ...result.options, residualJumpThresholdCandidates: undefined },
        thresholds: THRESHOLDS,
        auditSummary: summaryForFingerprint,
      }),
    ),
  );
  if (result.analysisFingerprint !== `sha256:${expectedAnalysisFingerprint}`)
    throw new Error("analysis fingerprint mismatch");
  if (
    result.inputs.manifestSha256 !== snapshot.hashes.manifest ||
    result.inputs.auditSha256 !== snapshot.hashes.audit
  )
    throw new Error("input manifest/audit hash mismatch");
  for (const kind of KINDS) {
    required(result.inputs.artifacts?.[kind], `inputs.artifacts.${kind}`);
    if (result.inputs.artifacts[kind].sha256 !== snapshot.hashes.artifacts[kind])
      throw new Error(`input artifact hash mismatch: ${kind}`);
    if (result.inputs.artifacts[kind].manifestSha256 !== snapshot.artifacts[kind].manifestSha256)
      throw new Error(`input manifest artifact hash mismatch: ${kind}`);
  }
  if (!deepEqual(result.auditSummary.checks, result.verdict.checks))
    throw new Error("audit summary checks mismatch");
  if (!deepEqual(result.auditSummary.verdict, result.verdict))
    throw new Error("audit summary verdict mismatch");
  if (result.auditSummary.selectedThreshold !== SELECTED_THRESHOLD)
    throw new Error("audit summary selected threshold mismatch");
  if (
    !deepEqual(
      result.auditSummary.threshold,
      result.residualJumpThresholds[String(SELECTED_THRESHOLD)],
    )
  )
    throw new Error("audit summary threshold mismatch");
  if (
    !deepEqual(result.auditSummary.sensitivity?.raw, result.sensitivity) ||
    !deepEqual(result.auditSummary.sensitivity?.sensitivityVerdict, result.sensitivityVerdict)
  )
    throw new Error("audit summary sensitivity mismatch");
  if (
    result.auditSummary.hash.inputFingerprint !== result.inputFingerprint ||
    result.auditSummary.hash.analysisFingerprint !== result.analysisFingerprint ||
    result.auditSummary.hash.manifestSha256 !== snapshot.hashes.manifest ||
    result.auditSummary.hash.auditSha256 !== snapshot.hashes.audit
  )
    throw new Error("audit summary hash mismatch");
  for (const kind of KINDS)
    if (result.auditSummary.hash.artifacts?.[kind] !== snapshot.hashes.artifacts[kind])
      throw new Error(`audit summary artifact hash mismatch: ${kind}`);
  if (JSON.stringify(result.options.standardBacktest) !== JSON.stringify(STANDARD_BACKTEST))
    throw new Error("standard backtest options mismatch");
  if (!deepEqual(result.options.production, PRODUCTION_OPTIONS))
    throw new Error("production options mismatch");
  if (!deepEqual(result.options.sensitivity?.scenarios, SENSITIVITY_SCENARIOS))
    throw new Error("sensitivity scenarios mismatch");
  if (
    !deepEqual(result.periods?.productionCalibrationYears, PERIOD_YEARS) ||
    !deepEqual(result.periods?.backtestTrainingYears, PERIOD_YEARS) ||
    result.periods?.targetYear !== TARGET_YEAR ||
    !deepEqual(result.periods?.holdoutYears, HOLDOUT_YEARS)
  )
    throw new Error("period contract mismatch");
  if (!deepEqual(result.auditSummary.periods, result.periods))
    throw new Error("audit summary periods mismatch");
  const expectedRollingLoo = buildCtiAdjustedRollingLooBacktest(
    snapshot.inputs.B,
    snapshot.inputs.A,
    snapshot.inputs.L,
  );
  if (
    !deepEqual(result.rollingLoo, expectedRollingLoo) ||
    !deepEqual(result.auditSummary.rollingLoo, expectedRollingLoo)
  )
    throw new Error("rolling/loo backtest mismatch");
  if (!deepEqual(result.verdict.checks.rollingLoo, rollingLooVerdict(expectedRollingLoo)))
    throw new Error("rolling/loo verdict mismatch");
  if (!deepEqual(result.auditSummary.publication, result.publication))
    throw new Error("audit summary publication mismatch");
  const expectedStandard = buildCtiAdjustedConnectionEstimate(
    snapshot.inputs.B,
    snapshot.inputs.A,
    snapshot.inputs.L,
    { ...PRODUCTION_OPTIONS, residualJumpThreshold: SELECTED_THRESHOLD },
  );
  const expectedV2Result = buildCtiAdjustedV2Estimate(
    snapshot.inputs.B,
    snapshot.inputs.A,
    snapshot.inputs.L,
  );
  const expectedV2 = v2AuditSection(
    expectedV2Result,
    result.sensitivity.gammaScenarios,
    expectedStandard,
    expectedRollingLoo,
  );
  if (!deepEqual(result.v2, expectedV2) || !deepEqual(result.auditSummary.v2, expectedV2))
    throw new Error("v2 audit mismatch");
  for (const threshold of THRESHOLDS)
    required(
      result.residualJumpThresholds[String(threshold)],
      `residualJumpThresholds.${threshold}`,
    );
  const standardBacktest = result.standard.backtest?.result ?? result.standard.audit?.backtest;
  required(standardBacktest, "standard.backtest");
  if (
    JSON.stringify(standardBacktest.trainingYears) !==
      JSON.stringify(STANDARD_BACKTEST.trainingYears) ||
    standardBacktest.targetYear !== 2017
  )
    throw new Error("standard backtest years mismatch");
  if (
    JSON.stringify(result.verdict.checks.backtest?.requestedYears) !==
    JSON.stringify(STANDARD_BACKTEST.trainingYears)
  )
    throw new Error("verdict backtest requested years mismatch");
  if (!deepEqual(result.verdict.checks.backtest, backtestVerdict(result.standard.audit)))
    throw new Error("backtest verdict mismatch");
  if (!["pass", "fail", "insufficient-data"].includes(result.verdict.status))
    throw new Error("invalid verdict status");
  const expectedSensitivity = sensitivityVerdict(result.sensitivity);
  if (!deepEqual(result.sensitivityVerdict, expectedSensitivity))
    throw new Error("sensitivity verdict mismatch");
  if (!deepEqual(result.verdict.checks.sensitivity, result.sensitivityVerdict.check))
    throw new Error("sensitivity check mismatch");
  const expectedInputCheck = {
    status: loaded.audit.validation.valid ? "pass" : "insufficient-data",
    valid: loaded.audit.validation.valid,
    reasonCodes: loaded.audit.validation.valid ? [] : ["input_not_valid"],
  };
  if (!deepEqual(result.verdict.checks.input, expectedInputCheck))
    throw new Error("input check mismatch");
  if (loaded.audit.validation.valid !== result.verdict.checks.input.valid)
    throw new Error("input validation verdict mismatch");
  const threshold = result.residualJumpThresholds[String(SELECTED_THRESHOLD)];
  if (threshold.threshold !== SELECTED_THRESHOLD)
    throw new Error("selected threshold result missing");
  if (!deepEqual(result.verdict.checks.residualBoundary, threshold))
    throw new Error("residual boundary check mismatch");
  const thresholdStatus =
    threshold.audit?.validation?.valid !== true ||
    !(
      threshold.boundary2016To2017.exceeded === false ||
      threshold.boundary2016To2017.exceeded === true
    )
      ? "insufficient-data"
      : threshold.boundary2016To2017.exceeded
        ? "fail"
        : "pass";
  const thresholdAccepted =
    thresholdStatus === "pass" && threshold.boundary2016To2017.exceeded === false;
  const thresholdReason =
    thresholdStatus === "insufficient-data"
      ? "insufficient_residual_boundary_values"
      : thresholdStatus === "fail"
        ? "residual_jump_threshold_exceeded"
        : null;
  if (
    threshold.status !== thresholdStatus ||
    threshold.accepted !== thresholdAccepted ||
    threshold.reason !== thresholdReason
  )
    throw new Error("threshold verdict mismatch");
  if (result.verdict.classification !== "publication verdict")
    throw new Error("verdict classification mismatch");
  const expectedDiagnostic = expectedDiagnosticVerdict(result.verdict.checks);
  if (
    result.verdict.diagnosticStatus !== expectedDiagnostic.status ||
    result.verdict.diagnosticAccepted !== expectedDiagnostic.diagnosticAccepted ||
    !deepEqual(result.verdict.diagnosticReasonCodes, expectedDiagnostic.reasonCodes)
  )
    throw new Error("diagnostic verdict consistency mismatch");
  const expectedPublication = expectedPublicationVerdict(result.v2.publicationGate);
  if (
    result.verdict.status !== expectedPublication.status ||
    result.verdict.accepted !== expectedPublication.accepted ||
    !deepEqual(result.verdict.reasonCodes, expectedPublication.reasonCodes)
  )
    throw new Error("publication verdict consistency mismatch");
  if (result.verdict.accepted !== result.v2.publicationGate.accepted)
    throw new Error("verdict publication gate mismatch");
  const globallyPublishable = result.v2.publicationGate.accepted === true;
  if (
    result.publication.threshold1Accepted !== undefined ||
    result.publication.threshold1BoundaryAccepted !== undefined
  )
    throw new Error("deprecated threshold1 publication fields must not be used");
  if (result.publication.selectedThresholdBoundaryAccepted !== threshold.accepted)
    throw new Error("publication boundary gate mismatch");
  if (result.publication.globallyPublishable !== globallyPublishable)
    throw new Error("publication global gate mismatch");
  if (
    result.publication.blockingReason !==
    (globallyPublishable ? null : "overall_verdict_not_accepted")
  )
    throw new Error("publication blocking reason mismatch");
  const expectedEstimatedRows = globallyPublishable
    ? {
        count: expectedV2Result.rows.filter(
          (row) => row.year >= 2005 && row.year <= 2016 && row.status === "available",
        ).length,
        publishable: true,
        reason: null,
      }
    : { count: 0, publishable: false, reason: "overall_verdict_not_accepted" };
  if (!deepEqual(result.publication.estimatedRows, expectedEstimatedRows))
    throw new Error("publication estimated rows mismatch");
  const candidateEstimateRows = result.standard.rows.filter(
    (row) => row.seriesType === "estimated_adjusted",
  );
  if (
    !deepEqual(result.publication.candidateRows, {
      ...threshold.estimatedRows,
      years: candidateEstimateRows.map((row) => row.year),
    })
  )
    throw new Error("publication candidate rows mismatch");
  if (
    !deepEqual(
      result.publication.rows,
      publicRows(result.standard.rows, expectedV2Result.rows, globallyPublishable),
    )
  )
    throw new Error("publication rows mismatch");
  if (
    !globallyPublishable &&
    result.publication.rows.some(
      (row) =>
        row.year >= 2005 &&
        row.year <= 2016 &&
        (row.seriesType === "estimated_adjusted" || row.status === "available"),
    )
  )
    throw new Error("unaccepted estimate leaked to public rows");
  console.log(`verified: ${file}`);
}

const args = parseArgs(process.argv.slice(2));
if (args.has("--check"))
  check(args).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
else
  run(args).catch(async (error) => {
    const resultsRoot = path.resolve(args.get("--results-dir") ?? DEFAULT_RESULTS_ROOT);
    await mkdir(resultsRoot, { recursive: true });
    const failure = {
      schemaVersion: "plan39-analysis-v1",
      status: "failed",
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      options: { residualJumpThresholdCandidates: THRESHOLDS, standardBacktest: STANDARD_BACKTEST },
    };
    await atomicWrite(path.join(resultsRoot, "plan39-analysis-failed.json"), failure);
    console.error(failure.error);
    process.exitCode = 1;
  });
