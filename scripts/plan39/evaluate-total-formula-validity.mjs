#!/usr/bin/env node

import { access, link, mkdir, open, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_RESULTS_DIR = path.join(REPO_ROOT, "results/plan39");
const DEFAULT_API_URL = "https://api.typesafe.ai/v1/systemone";

async function removeTemporaryFile(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const CHOICES = [
  {
    id: "valid_as_defined",
    label: "妥当",
    description: "提示された前提と対象範囲では、式の定義・算術・推論の接続が妥当",
  },
  {
    id: "valid_but_limited",
    label: "条件付きで妥当",
    description: "算術または記述上は妥当だが、統計的妥当性・因果解釈・適用範囲に重要な限定がある",
  },
  {
    id: "not_valid",
    label: "妥当でない",
    description: "式、データ接続、推計手順のいずれかに重大な論理的または統計的問題がある",
  },
  {
    id: "indeterminate",
    label: "判定不能",
    description: "提示情報だけでは主要な妥当性を信頼して判定できない",
  },
];

const BACKGROUND = {
  purpose:
    "Plan39の調整後総合の式が、算術的に同値か、統計的に妥当な推計として解釈できるかを判定する。判定は式の正しさと因果的主張を区別する。",
  formulas: [
    "総合の実装式: T(t)=B_total(2017)*(A_total(2017)/B_total(2017))*D(t)=A_total(2017)*D(t)",
    "D(t)=(L_total(t)/L_total(2017))/(B_total(t)/B_total(2017))",
    "したがって T(t)=A_total(2017)*(L_total(t)/L_total(2017))*(B_total(2017)/B_total(t))",
    "費目 i: C_i(t)=B_i(t)*(A_i(2017)/B_i(2017))*D(t)^beta_i",
    "残差=総合−9費目推計合計",
  ],
  observedValues: {
    total2014: {
      B: 118.9,
      L: 102.1,
      D: 0.9641903575,
      adjustedTotal: 102.300596927,
      adjustedNineCategories: 91.6096,
      residual: 10.6918,
      rawNineCategoriesB: 98.8,
      rawResidual: 20.1,
    },
    total2015: {
      B: 114.6,
      L: 100.0,
      D: 0.9797928792,
      adjustedTotal: 103.956024486,
      adjustedNineCategories: 89.635,
      residual: 14.321,
      rawNineCategoriesB: 95.2,
      rawResidual: 19.4,
    },
    housingExample: {
      B2014: 9.6,
      B2015: 8.7,
      A2017: 7.8,
      B2017: 8.3,
      beta: 1.5160194084,
      adjusted2014: 8.5364679955,
      adjusted2015: 7.9267499323,
    },
  },
  sourceAndEstimation: [
    "Lは総務省家計調査長期時系列の公式年次原指数、二人以上世帯、世帯人員・世帯主年齢分布調整済み、1981-2018、総合のみ。",
    "Aは2017-2025公式調整系列、Bは基本系列。betaは2018-2025のA/Bでキャリブレーションし、Lはbeta推定に使わない。",
    "2014/2015は閾値1.4超過のため、公開値ではなく閾値適用前の推計値。",
  ],
  requiredFocus: [
    "統計的妥当性と算術的同値性を分けること",
    "因果的解釈の限界を明示すること",
    "総合と費目でBの入り方が非対称であることを評価すること",
    "2014→2015の残差ジャンプへの影響を評価すること",
    "改善案と追加検証を提示すること",
  ],
};

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) throw new Error(`unknown argument: ${argv[i]}`);
    args.set(argv[i], argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
  }
  return args;
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
        key,
        /authorization|api[_-]?key|token|secret/i.test(key) ? "[REDACTED]" : redact(item, secret),
      ]),
    );
  return value;
}

function questions() {
  const criteria = Object.fromEntries(CHOICES.map(({ id, description }) => [id, description]));
  return {
    overall: {
      type: "choice",
      instructions:
        "提示されたPlan39の調整後総合の式全体を、算術・統計・推論の接続を含めて判定する。単に式変形が正しいことだけでvalid_as_definedにしない。",
      criteria,
    },
    algebra: {
      type: "choice",
      instructions:
        "式1〜3の代数的同値性と、2017年基準の正規化を判定する。数値例の丸め誤差は重大な論点として扱わない。",
      criteria,
    },
    statistical: {
      type: "choice",
      instructions:
        "B/A/Lの系列定義、期間、betaキャリブレーション、2014/2015の閾値適用前推計を踏まえ、統計的な推計として妥当か判定する。",
      criteria,
    },
    causal: {
      type: "choice",
      instructions:
        "D(t)を物価・生活水準・費目変動の因果的な調整要因と解釈できるか、観察指数による機械的正規化の限界を踏まえて判定する。",
      criteria,
    },
    asymmetryResidual: {
      type: "choice",
      instructions:
        "総合ではB_total(t)が分母に入り、費目ではB_i(t)にD(t)^beta_iを掛ける非対称性、および残差が2014年10.6918から2015年14.3210へジャンプすることへの影響を判定する。",
      criteria,
    },
    validationPlan: {
      type: "choice",
      instructions:
        "現状の式を採用する前提で、追加検証・改善案があれば条件付き妥当と評価できるかを判定する。改善不能な重大欠陥ならnot_valid、情報不足ならindeterminateとする。",
      criteria,
    },
  };
}

function answerCollection(candidate) {
  if (Array.isArray(candidate)) return candidate;
  if (!candidate || typeof candidate !== "object") return null;
  return Object.entries(candidate).map(([questionId, answer]) => ({
    ...(answer && typeof answer === "object" && !Array.isArray(answer) ? answer : { answer }),
    questionId: answer?.questionId ?? answer?.id ?? answer?.key ?? questionId,
  }));
}

function answerList(response) {
  for (const candidate of [
    response?.answers,
    response?.data?.answers,
    response?.result?.answers,
    response?.output?.answers,
    response?.data?.result?.answers,
  ]) {
    const answers = answerCollection(candidate);
    if (answers?.length) return answers;
  }
  return [];
}

function extracted(answer) {
  const raw = answer?.choice ?? answer?.answer ?? answer?.value ?? answer?.selected;
  return {
    choice: typeof raw === "string" ? raw : (raw?.id ?? raw?.value ?? raw?.label ?? null),
    probabilities: answer?.probabilities ?? answer?.probs ?? answer?.choiceProbabilities ?? null,
    confidence: answer?.confidence ?? answer?.certainty ?? null,
  };
}

function probabilityFor(probabilities, choice) {
  if (probabilities && !Array.isArray(probabilities) && typeof probabilities === "object") {
    const value = probabilities[choice] ?? probabilities.choices?.[choice];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  if (Array.isArray(probabilities)) {
    const item = probabilities.find(
      (entry) => choice === (entry?.choice ?? entry?.id ?? entry?.label),
    );
    return Number.isFinite(Number(item?.probability ?? item?.prob ?? item?.value))
      ? Number(item.probability ?? item.prob ?? item.value)
      : null;
  }
  return null;
}

function validateResponse(response, expectedIds) {
  const answers = answerList(response);
  const issues = [];
  if (!answers.length) issues.push("response contains no answers");
  const seen = new Set();
  for (const id of expectedIds) {
    const answer = answers.find((item) => String(item?.questionId ?? item?.id ?? item?.key) === id);
    if (!answer) {
      issues.push(`${id}: missing answer`);
      continue;
    }
    if (seen.has(id)) issues.push(`${id}: duplicate answer`);
    seen.add(id);
    const normalized = extracted(answer);
    if (!CHOICES.some(({ id: choiceId }) => choiceId === normalized.choice))
      issues.push(`${id}: invalid choice`);
    for (const choice of CHOICES)
      if (probabilityFor(normalized.probabilities, choice.id) === null)
        issues.push(`${id}: missing probability for ${choice.id}`);
  }
  return issues;
}

function sanitizedResponse(response, apiKey, expectedIds) {
  const answers = answerList(response)
    .filter((answer) =>
      expectedIds.includes(String(answer?.questionId ?? answer?.id ?? answer?.key)),
    )
    .map((answer) => ({
      questionId: String(answer.questionId ?? answer.id ?? answer.key),
      ...extracted(answer),
    }));
  const usage = response?.usage;
  const safeUsage =
    usage && typeof usage === "object"
      ? Object.fromEntries(
          Object.entries(usage).filter(
            ([key, value]) =>
              /token|count|duration|latency|model/i.test(key) &&
              ["string", "number", "boolean"].includes(typeof value),
          ),
        )
      : undefined;
  return {
    model: typeof response?.model === "string" ? response.model : null,
    answers,
    ...(safeUsage ? { usage: redact(safeUsage, apiKey) } : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultsDir = path.resolve(args.get("--results-dir") ?? DEFAULT_RESULTS_DIR);
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  const model = process.env.TYPESAFE_MODEL || "jev-latest";
  const endpoint = process.env.TYPESAFE_BASE_URL || DEFAULT_API_URL;
  const questionSet = questions();
  const expectedIds = Object.keys(questionSet);
  const request = {
    model,
    state: {
      background: BACKGROUND,
      evaluationScope: "plan39_total_formula_validity",
      outputRequirement: "判定と根拠、限界、改善案、追加検証を回答に含める",
    },
    questions: questionSet,
  };
  const outputFile = path.resolve(
    args.get("--output") ??
      path.join(
        resultsDir,
        `total-formula-validity-jev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      ),
  );
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
  if (!response.ok)
    throw new Error(
      `TypeSafe HTTP error: status=${response.status} body=${String(redact(rawText, apiKey)).slice(0, 500)}`,
    );
  let rawResponse;
  try {
    rawResponse = JSON.parse(rawText);
  } catch {
    throw new Error("TypeSafe response is not valid JSON");
  }
  const issues = validateResponse(rawResponse, expectedIds);
  if (issues.length) throw new Error(`invalid TypeSafe response: ${issues.join("; ")}`);
  const answers = answerList(rawResponse)
    .filter((answer) => expectedIds.includes(String(answer.questionId ?? answer.id ?? answer.key)))
    .map((answer) => ({
      questionId: String(answer.questionId ?? answer.id ?? answer.key),
      ...extracted(answer),
    }));
  const counts = Object.fromEntries(
    CHOICES.map(({ id }) => [id, answers.filter((answer) => answer.choice === id).length]),
  );
  const output = {
    schemaVersion: "plan39-total-formula-validity-jev-v1",
    generatedAt: new Date().toISOString(),
    evaluationScope: request.state.evaluationScope,
    request: { model, background: BACKGROUND, questions: questionSet },
    sanitizedResponse: sanitizedResponse(rawResponse, apiKey, expectedIds),
    results: answers,
    summary: {
      counts,
      answeredCount: answers.length,
      expectedCount: expectedIds.length,
      valid: answers.length === expectedIds.length,
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
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
