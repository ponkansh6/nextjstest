#!/usr/bin/env node

import { access, link, mkdir, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_RESULTS_DIR = path.join(REPO_ROOT, "results/plan39");
const DEFAULT_API_URL = "https://api.typesafe.ai/v1/systemone";
const RAW_RESIDUAL_START_YEAR = 2005;
const RAW_RESIDUAL_END_YEAR = 2025;
const EVALUATED_JUMP_START_YEAR = 2006;
const RAW_RESIDUAL_YEARS = Array.from(
  { length: RAW_RESIDUAL_END_YEAR - RAW_RESIDUAL_START_YEAR + 1 },
  (_, index) => RAW_RESIDUAL_START_YEAR + index,
);
const EVALUATED_JUMP_YEARS = Array.from(
  { length: RAW_RESIDUAL_END_YEAR - EVALUATED_JUMP_START_YEAR + 1 },
  (_, index) => EVALUATED_JUMP_START_YEAR + index,
);
const CHOICES = [
  {
    id: "natural_cpi_jump",
    label: "自然なCPIジャンプ",
    description: "CPI関連系列として通常の経済・物価変動として自然",
  },
  {
    id: "likely_break_or_artifact",
    label: "断絶またはアーティファクトの疑い",
    description: "定義変更・集計差・データ不整合・推計境界の断絶が疑われる",
  },
  {
    id: "indeterminate",
    label: "判定不能",
    description: "背景だけでは自然／断絶を信頼して決められない",
  },
];

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) throw new Error(`unknown argument: ${value}`);
    if (argv[i + 1] && !argv[i + 1].startsWith("--")) args.set(value, argv[++i]);
    else args.set(value, true);
  }
  return args;
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const asNumberOrNull = (value) => (finite(value) ? value : null);
const asYear = (value) => (Number.isInteger(Number(value)) ? Number(value) : null);
const isoDate = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const closeEnough = (actual, expected, tolerance = 1e-9) =>
  finite(actual) &&
  finite(expected) &&
  Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected));

async function removeTemporaryFile(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function latestAnalysis(resultsDir) {
  const names = (await readdir(resultsDir)).filter((name) =>
    /^plan39-analysis-.*\.json$/.test(name),
  );
  if (!names.length) throw new Error(`no plan39 analysis JSON found in ${resultsDir}`);
  const candidates = [];
  for (const name of names) {
    try {
      const candidate = await json(path.join(resultsDir, name));
      const generatedAt = isoDate(
        candidate.generatedAt ?? candidate.generation?.generatedAt ?? candidate.analysisGeneratedAt,
      );
      const valid =
        candidate.schemaVersion === "plan39-analysis-v1" &&
        generatedAt &&
        candidate.status !== "failed" &&
        candidate.error === undefined &&
        candidate.standard?.audit &&
        Array.isArray(candidate.standard?.rows) &&
        candidate.inputs?.artifacts &&
        candidate.inputs?.root;
      if (valid) candidates.push({ name, generatedAt });
    } catch {
      // Invalid or unreadable artifacts are not candidates.
    }
  }
  candidates.sort(
    (a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt) || b.name.localeCompare(a.name),
  );
  if (!candidates.length)
    throw new Error(`no valid successful plan39 analysis JSON found in ${resultsDir}`);
  return path.join(resultsDir, candidates[0].name);
}

function residualRows(analysis) {
  const audit = analysis.standard?.audit ?? {};
  const jumps = audit.residualJumps ?? {};
  const rows = new Map((analysis.standard?.rows ?? []).map((row) => [Number(row.year), row]));
  const publicationRows = new Map(
    (analysis.publication?.rows ?? []).map((row) => [Number(row.year), row]),
  );
  const threshold = 1.4;
  return Object.keys(jumps)
    .map(Number)
    .filter((year) => year >= RAW_RESIDUAL_START_YEAR && year <= RAW_RESIDUAL_END_YEAR)
    .sort((a, b) => a - b)
    .map((year) => {
      const jump = jumps[year] ?? {};
      const row = rows.get(year) ?? {};
      const publicationRow = publicationRows.get(year) ?? {};
      const rawResidual = asNumberOrNull(jump.value);
      const previousYear = asYear(jump.previousYear);
      const previousResidual = asNumberOrNull(jump.previousValue);
      const delta =
        rawResidual !== null && previousResidual !== null ? rawResidual - previousResidual : null;
      const rawJump = delta === null ? null : Math.abs(delta);
      const machineExceeded = rawJump === null ? null : rawJump > threshold;
      const machineReason =
        jump.reason ?? (machineExceeded === true ? "residual_jump_threshold_exceeded" : null);
      const postThresholdStatus = publicationRow.status ?? "unavailable";
      const jumpReason = jump.reason ?? null;
      const computedRelativeChange =
        previousResidual !== null && previousResidual !== 0 && delta !== null
          ? delta / previousResidual
          : null;
      const computedYearOverYearRatio =
        previousResidual !== null && previousResidual !== 0 && rawResidual !== null
          ? rawResidual / previousResidual
          : null;
      const validationIssues = [];
      const suppliedNumerics = {
        absoluteDifference: jump.absoluteDifference,
        threshold: jump.threshold,
        relativeChange: jump.relativeChange,
        exceeded: jump.exceeded,
        yearOverYearRatio: jump.yearOverYearRatio,
      };
      if (
        rawJump !== null &&
        (suppliedNumerics.absoluteDifference === undefined ||
          !closeEnough(Number(suppliedNumerics.absoluteDifference), rawJump))
      ) {
        validationIssues.push({
          field: "absoluteDifference",
          expected: rawJump,
          actual: suppliedNumerics.absoluteDifference ?? null,
        });
      }
      if (
        computedRelativeChange !== null &&
        (suppliedNumerics.relativeChange === undefined ||
          !closeEnough(Number(suppliedNumerics.relativeChange), computedRelativeChange))
      ) {
        validationIssues.push({
          field: "relativeChange",
          expected: computedRelativeChange,
          actual: suppliedNumerics.relativeChange ?? null,
        });
      }
      if (
        suppliedNumerics.threshold !== undefined &&
        !closeEnough(Number(suppliedNumerics.threshold), threshold)
      ) {
        validationIssues.push({
          field: "threshold",
          expected: threshold,
          actual: suppliedNumerics.threshold,
        });
      }
      if (machineExceeded !== null && suppliedNumerics.exceeded !== machineExceeded) {
        validationIssues.push({
          field: "exceeded",
          expected: machineExceeded,
          actual: suppliedNumerics.exceeded ?? null,
        });
      }
      if (
        computedYearOverYearRatio !== null &&
        (suppliedNumerics.yearOverYearRatio === undefined ||
          !closeEnough(Number(suppliedNumerics.yearOverYearRatio), computedYearOverYearRatio))
      ) {
        validationIssues.push({
          field: "yearOverYearRatio",
          expected: computedYearOverYearRatio,
          actual: suppliedNumerics.yearOverYearRatio ?? null,
        });
      }
      return {
        year,
        residual: rawResidual,
        rawResidual,
        rawJump,
        machineThreshold: threshold,
        machineExceeded,
        machineReason,
        postThresholdStatus,
        previousYear,
        previousResidual,
        delta,
        absoluteDifference: rawJump,
        threshold,
        relativeChange: computedRelativeChange,
        yearOverYearRatio: computedYearOverYearRatio,
        exceeded: machineExceeded,
        source: {
          absoluteDifference: asNumberOrNull(jump.absoluteDifference),
          relativeChange: asNumberOrNull(jump.relativeChange),
          yearOverYearRatio: asNumberOrNull(jump.yearOverYearRatio),
          exceeded: typeof jump.exceeded === "boolean" ? jump.exceeded : null,
        },
        official: row.official === true,
        estimated: row.seriesType === "estimated_adjusted" || row.estimated === true,
        officialSource: row.official === true ? (row.source ?? row.sourceType ?? null) : null,
        officialStatus: row.official === true ? (row.status ?? null) : null,
        estimatedSource:
          row.seriesType === "estimated_adjusted" || row.estimated === true
            ? (row.source ?? row.sourceType ?? null)
            : null,
        estimatedStatus:
          row.seriesType === "estimated_adjusted" || row.estimated === true
            ? (row.status ?? null)
            : null,
        provenance: {
          official: {
            source: row.official === true ? (row.source ?? row.sourceType ?? null) : null,
            status: row.official === true ? (row.status ?? null) : null,
          },
          estimated: {
            source:
              row.seriesType === "estimated_adjusted" || row.estimated === true
                ? (row.source ?? row.sourceType ?? null)
                : null,
            status:
              row.seriesType === "estimated_adjusted" || row.estimated === true
                ? (row.status ?? null)
                : null,
          },
        },
        status: postThresholdStatus,
        available: postThresholdStatus === "available",
        unavailable: postThresholdStatus === "unavailable",
        seriesType: row.seriesType ?? null,
        jumpReason,
        validationReason: null,
        reason: jumpReason ?? row.reason ?? null,
        validationIssues,
      };
    });
}

function compactBackground(analysis, allRows = [], targetRows = []) {
  const audit = analysis.standard?.audit ?? {};
  const artifacts = analysis.inputs?.artifacts ?? audit.inputMetadata ?? {};
  const periods = analysis.periods ?? {};
  const sensitivity = analysis.sensitivity ?? {};
  const threshold = 1.4;
  const sourceExcludedYears = Object.keys(audit.residualJumps ?? {})
    .map(Number)
    .filter((year) => year < RAW_RESIDUAL_START_YEAR)
    .sort((a, b) => a - b);
  const candidateYears = analysis.publication?.candidateRows?.years ?? [];
  const omittedYears =
    analysis.publication?.candidateRows?.omittedYears ?? sensitivity.acceptance?.omittedYears ?? [];
  return {
    formula: "residual = total - major 9 categories sum",
    formulaVersion: audit.formulaVersion ?? null,
    artifacts: Object.fromEntries(
      ["B", "A", "L"].map((kind) => [
        kind,
        {
          source: artifacts[kind]?.source ?? null,
          metadata: artifacts[kind]?.metadata ?? null,
          fingerprint: {
            sha256: artifacts[kind]?.sha256 ?? null,
            metadataFingerprint: artifacts[kind]?.metadataFingerprint ?? null,
            manifestSha256: artifacts[kind]?.manifestSha256 ?? null,
          },
        },
      ]),
    ),
    artifactDataSummary: Object.fromEntries(
      targetRows.map((row) => [
        String(row.year),
        {
          officialAdditivity: audit.officialAdditivity?.[String(row.year)] ?? null,
          residualJumps: audit.residualJumps?.[String(row.year)] ?? null,
          residualValidation: audit.residualValidation?.[String(row.year)] ?? null,
          stacking: audit.stacking?.[String(row.year)] ?? null,
        },
      ]),
    ),
    sourceFingerprints: {
      inputFingerprint: analysis.inputFingerprint ?? null,
      analysisFingerprint: analysis.analysisFingerprint ?? null,
      inputMetadataFingerprint: audit.inputMetadataFingerprint ?? null,
    },
    periods: {
      productionCalibration: periods.productionCalibrationYears ?? [
        2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
      ],
      sensitivity: periods.sensitivity ?? [],
      targetYear: periods.targetYear ?? 2017,
      holdoutYears: periods.holdoutYears ?? [2017],
    },
    sensitivity: {
      baseline:
        sensitivity.scenarios?.find((scenario) => scenario.name === "baseline_2018_2025") ?? null,
      alternative:
        sensitivity.scenarios?.find((scenario) => scenario.name === "alternative_2018_2024") ??
        null,
    },
    threshold: {
      residualJump: threshold,
      interpretation:
        "threshold=1.4は機械ゲートで、今回のJev評価はその適用前raw値を対象。Jev判定はthresholdを追認/変更するものではない",
    },
    evaluationScope: "pre_threshold_raw_residuals_2005_plus",
    rawResidualYears: RAW_RESIDUAL_YEARS,
    evaluatedJumpYears: EVALUATED_JUMP_YEARS,
    sourceExcludedYears,
    holdoutNote: "2017はraw observation/jumpとして含めるが、calibration/threshold算定には使わない",
    candidateYears,
    omittedYears,
    classification: {
      official: allRows.filter((row) => row.official && !row.estimated).map((row) => row.year),
      derived: allRows
        .filter(
          (row) =>
            row.seriesType === "derived" ||
            row.reason === "derived_from_total_minus_major_categories",
        )
        .map((row) => row.year),
      estimated: allRows.filter((row) => row.estimated).map((row) => row.year),
    },
  };
}

function questionFor(row) {
  const sourceType = row.estimated
    ? "estimated"
    : row.seriesType === "derived" || row.reason === "derived_from_total_minus_major_categories"
      ? "derived"
      : row.official
        ? "official"
        : (row.seriesType ?? "unavailable");
  return {
    id: `residual-naturalness-${row.year}`,
    type: "choice",
    instructions: `${row.year}年のraw residualジャンプを、CPI関連系列として自然か評価する。前年residual=${row.previousResidual}, 当年rawResidual=${row.rawResidual}, rawJump=${row.rawJump}, machineThreshold=${row.machineThreshold}, machineExceeded=${row.machineExceeded}, postThresholdStatus=${row.postThresholdStatus}, relativeChange=${row.relativeChange}, sourceType=${sourceType}。threshold=1.4は機械ゲートであり、machineExceededを選択理由として強制せず、Jevにはthresholdを追認/変更せず背景から独立に判断させる。${row.year === 2017 ? "2017年はholdoutで、calibration/threshold算定には使わない。" : ""}`,
    criteria: Object.fromEntries(CHOICES.map(({ id, description }) => [id, description])),
  };
}

function buildRequest(analysis, allRows, targetRows, model) {
  return {
    model,
    state: {
      background: compactBackground(analysis, allRows, targetRows),
      candidateYears: targetRows.map((row) => row.year),
      observationYears: allRows.map((row) => row.year),
      omittedYears: [],
      residuals: allRows,
      evaluationScope: "pre_threshold_raw_residuals_2005_plus",
      preThreshold: true,
      sourceExcludedYears: Object.keys(analysis.standard?.audit?.residualJumps ?? {})
        .map(Number)
        .filter((year) => year < RAW_RESIDUAL_START_YEAR)
        .sort((a, b) => a - b),
    },
    questions: Object.fromEntries(
      targetRows.map((row) => {
        const question = questionFor(row);
        return [question.id, question];
      }),
    ),
  };
}

function answerCollection(candidate) {
  if (Array.isArray(candidate)) return candidate;
  if (!candidate || typeof candidate !== "object") return null;
  return Object.entries(candidate).map(([questionId, answer]) => {
    if (answer && typeof answer === "object" && !Array.isArray(answer)) {
      return { ...answer, questionId: answer.questionId ?? answer.id ?? answer.key ?? questionId };
    }
    return { questionId, answer };
  });
}

function answerList(response) {
  const candidates = [
    response?.answers,
    response?.data?.answers,
    response?.result?.answers,
    response?.output?.answers,
    response?.data?.result?.answers,
  ];
  const normalizedCandidates = candidates
    .map(answerCollection)
    .filter((candidate) => candidate !== null);
  return (
    normalizedCandidates.find((candidate) => candidate.length > 0) ?? normalizedCandidates[0] ?? []
  );
}

function normalizedAnswerId(answer) {
  if (!answer || typeof answer !== "object") return null;
  const direct = answer.questionId ?? answer.id ?? answer.key;
  if (direct !== undefined && direct !== null && String(direct).trim())
    return String(direct).trim();
  const year = asYear(answer.year);
  return year === null ? null : String(year);
}

function extractAnswer(response, question) {
  const answers = answerList(response);
  const year = Number(question.id.split("-").at(-1));
  const answer = answers.find(
    (item) =>
      normalizedAnswerId(item) === question.id ||
      normalizedAnswerId(item) === String(year) ||
      String(normalizedAnswerId(item) ?? "").endsWith(`-${year}`),
  );
  if (!answer) return { choice: null, probabilities: null, confidence: null };
  const rawChoice = answer.choice ?? answer.answer ?? answer.value ?? answer.selected;
  const choice =
    typeof rawChoice === "string"
      ? rawChoice
      : (rawChoice?.id ?? rawChoice?.value ?? rawChoice?.label ?? null);
  return {
    choice,
    probabilities: answer.probabilities ?? answer.probs ?? answer.choiceProbabilities ?? null,
    confidence: answer.confidence ?? answer.certainty ?? null,
  };
}

function probabilityFor(probabilities, choice) {
  const choiceKeys = new Set(CHOICES.map(({ id }) => id));
  if (!choiceKeys.has(choice)) return null;
  if (probabilities && !Array.isArray(probabilities) && typeof probabilities === "object") {
    const value = probabilities[choice] ?? probabilities.choices?.[choice];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  if (Array.isArray(probabilities)) {
    const item = probabilities.find(
      (entry) => choice === (entry?.choice ?? entry?.id ?? entry?.label),
    );
    const value = item?.probability ?? item?.prob ?? item?.value;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  return null;
}

function redact(value, secret) {
  if (typeof value === "string")
    return value
      .replaceAll(secret, "[REDACTED]")
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redact(item, secret));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.toLowerCase().includes("authorization") || key.toLowerCase().includes("api_key")
          ? key
          : key,
        key.toLowerCase().includes("authorization") || key.toLowerCase().includes("api_key")
          ? "[REDACTED]"
          : redact(item, secret),
      ]),
    );
  return value;
}

function sanitizedResponse(response, apiKey) {
  const answers = answerList(response).map((answer) => {
    const extracted = extractAnswer(
      { answers: [answer] },
      { id: normalizedAnswerId(answer) ?? "" },
    );
    return {
      questionId: normalizedAnswerId(answer),
      choice: extracted.choice,
      probabilities: extracted.probabilities,
      confidence: extracted.confidence,
    };
  });
  const usage = response?.usage;
  const safeUsage =
    usage && typeof usage === "object"
      ? Object.fromEntries(
          Object.entries(usage).filter(
            ([key, value]) =>
              /token|count|duration|latency|model/i.test(key) &&
              (typeof value === "number" ||
                typeof value === "string" ||
                typeof value === "boolean"),
          ),
        )
      : undefined;
  return {
    model: typeof response?.model === "string" ? response.model : null,
    answers,
    ...(safeUsage ? { usage: redact(safeUsage, apiKey) } : {}),
  };
}

function summary(results, targetRows, evaluationErrors) {
  const classified = results.filter((item) => CHOICES.some((choice) => choice.id === item.choice));
  const probability = targetRows.map((row) => {
    const item = results.find((result) => result.year === row.year);
    return probabilityFor(item?.probabilities, "natural_cpi_jump");
  });
  const count = 20;
  const countChoice = (choice) => classified.filter((item) => item.choice === choice).length;
  return {
    classifiedNaturalRate: count ? countChoice("natural_cpi_jump") / count : null,
    probabilityWeightedNaturalRate: count
      ? probability.reduce((sum, value) => sum + value, 0) / count
      : null,
    indeterminateRate: count ? countChoice("indeterminate") / count : null,
    breakRate: count ? countChoice("likely_break_or_artifact") / count : null,
    denominator: count,
    answeredCount: classified.length,
    answerRate: count ? classified.length / count : null,
    evaluationErrors,
    excludedYears: [RAW_RESIDUAL_START_YEAR],
    evaluationScope: "pre_threshold_raw_residuals_2005_plus",
    preThreshold: true,
    answerCompleteness: {
      expected: 20,
      answered: classified.length,
      valid: classified.length === 20,
    },
  };
}

function outputConflict(outputFile, analysisFile, analysis) {
  const resolved = path.resolve(outputFile);
  if (
    resolved === path.resolve(analysisFile) ||
    /^plan39-analysis-.*\.json$/.test(path.basename(resolved))
  )
    return true;
  const inputRoot = path.resolve(REPO_ROOT, analysis.inputs?.root ?? "");
  return Object.values(analysis.inputs?.artifacts ?? {}).some(
    (artifact) => path.resolve(inputRoot, artifact.path ?? "") === resolved,
  );
}

function validateResponse(response, questions) {
  const issues = [];
  if (!response || typeof response !== "object" || Array.isArray(response))
    issues.push("API response is not a JSON object");
  const answers = answerList(response);
  if (!answers.length && questions.length) issues.push("API response contains no answers array");
  const ids = new Set(questions.map((question) => question.id));
  const years = new Map(
    questions.map((question) => [String(Number(question.id.split("-").at(-1))), question.id]),
  );
  const normalizedIds = answers.map(normalizedAnswerId);
  const seen = new Set();
  for (const normalizedId of normalizedIds) {
    const questionId = ids.has(normalizedId)
      ? normalizedId
      : (years.get(normalizedId) ??
        (normalizedId && [...ids].find((id) => normalizedId.endsWith(`-${id.split("-").at(-1)}`))));
    if (!questionId)
      issues.push("API response contains an answer with an unknown or missing identifier");
    else if (seen.has(questionId)) issues.push(`${questionId}: duplicate answer`);
    else seen.add(questionId);
  }
  for (const question of questions) {
    const answer = extractAnswer(response, question);
    if (!answer.choice) issues.push(`${question.id}: missing answer`);
    else if (!CHOICES.some((choice) => choice.id === answer.choice))
      issues.push(`${question.id}: invalid choice`);
    for (const choice of CHOICES) {
      if (probabilityFor(answer.probabilities, choice.id) === null)
        issues.push(`${question.id}: missing probability for ${choice.id}`);
    }
  }
  return issues;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultsDir = path.resolve(args.get("--results-dir") ?? DEFAULT_RESULTS_DIR);
  const analysisFile = await latestAnalysis(resultsDir);
  const analysis = await json(analysisFile);
  const allRows = residualRows(analysis);
  const targetRows = allRows.filter(
    (row) => row.year >= EVALUATED_JUMP_START_YEAR && row.year <= RAW_RESIDUAL_END_YEAR,
  );
  const sourceExcludedYears = Object.keys(analysis.standard?.audit?.residualJumps ?? {})
    .map(Number)
    .filter((year) => year < RAW_RESIDUAL_START_YEAR)
    .sort((a, b) => a - b);
  if (
    allRows.length !== RAW_RESIDUAL_END_YEAR - RAW_RESIDUAL_START_YEAR + 1 ||
    targetRows.length !== 20
  )
    throw new Error(
      "residualJumps must contain raw residual observations for 2005-2025; refusing to call TypeSafe API",
    );
  if (
    allRows.some((row) => row.rawResidual === null) ||
    targetRows.some(
      (row) =>
        row.previousYear !== row.year - 1 || row.previousResidual === null || row.rawJump === null,
    )
  )
    throw new Error(
      "residualJumps contains missing or invalid raw residual/jump data; refusing to call TypeSafe API",
    );
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  const model = process.env.TYPESAFE_MODEL || "jev-latest";
  const endpoint = process.env.TYPESAFE_BASE_URL || DEFAULT_API_URL;
  const request = buildRequest(analysis, allRows, targetRows, model);
  const outputFile = path.resolve(
    args.get("--output") ??
      path.join(
        resultsDir,
        `residual-naturalness-jev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      ),
  );
  if (outputConflict(outputFile, analysisFile, analysis))
    throw new Error(`refusing to overwrite analysis or input artifact: ${outputFile}`);
  try {
    await access(outputFile);
    throw new Error(`refusing to overwrite existing output: ${outputFile}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const rawText = await response.text();
  if (!response.ok) {
    const safeBody = String(redact(rawText, apiKey)).slice(0, 500);
    throw new Error(`TypeSafe HTTP error: status=${response.status} body=${safeBody}`);
  }
  let rawResponse;
  try {
    rawResponse = JSON.parse(rawText);
  } catch {
    throw new Error("TypeSafe response is not valid JSON");
  }
  const questions = targetRows.map(questionFor);
  const responseIssues = validateResponse(rawResponse, questions);
  if (responseIssues.length)
    throw new Error(`invalid TypeSafe response: ${responseIssues.join("; ")}`);
  const evaluationErrors = [];
  const yearResults = targetRows.map((row, index) => {
    const answer = extractAnswer(rawResponse, questions[index]);
    return { ...row, ...answer };
  });
  const output = {
    schemaVersion: "plan39-residual-naturalness-jev-v1",
    generatedAt: new Date().toISOString(),
    request: {
      background: request.state.background,
      model,
      questions: request.questions,
      analysisFile: path.relative(REPO_ROOT, analysisFile),
      targetYears: targetRows.map((row) => row.year),
      observationYears: allRows.map((row) => row.year),
      allResiduals: allRows,
    },
    evaluationScope: "pre_threshold_raw_residuals_2005_plus",
    rawResidualYears: RAW_RESIDUAL_YEARS,
    evaluatedJumpYears: EVALUATED_JUMP_YEARS,
    preThreshold: true,
    sourceExcludedYears,
    residualRows: allRows,
    sanitizedResponse: sanitizedResponse(rawResponse, apiKey),
    results: yearResults,
    summary: {
      ...summary(yearResults, targetRows, evaluationErrors),
      excludedYears: [RAW_RESIDUAL_START_YEAR],
      sourceExcludedYears,
    },
  };
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, `${JSON.stringify(output, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    const handle = await open(temporaryFile, "r");
    await handle.sync();
    await handle.close();
    await link(temporaryFile, outputFile);
  } finally {
    await removeTemporaryFile(temporaryFile);
  }
  console.log(outputFile);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
