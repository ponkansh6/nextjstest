#!/usr/bin/env node

import { access, link, mkdir, open, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const RESULTS_DIR = path.join(REPO_ROOT, "results/plan39");
const API_URL = "https://api.typesafe.ai/v1/systemone";

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
const CRITERIA = Object.fromEntries(CHOICES.map(({ id, description }) => [id, description]));

const BACKGROUND = {
  purpose:
    "γ=1に固定した修整後総合式の代数的、統計的、推計上の妥当性を、現行式との比較を含めて判定する。算術的同値性と統計的妥当性、因果解釈を区別する。",
  revisedFormula:
    "T_revised(t)=B_total(t)*(A_total(2017)/B_total(2017))*D(t), D(t)=(L_total(t)/L_total(2017))/(B_total(t)/B_total(2017))",
  revisedIdentity:
    "γ=1ならT_revised(t)=A_total(2017)*(L_total(t)/L_total(2017))であり、B_total(t)は相殺される。",
  currentFormula:
    "T_current(t)=A_total(2017)*D(t)。B_total(t)はDの分母だけに残り、B低下がTを押し上げ得る。",
  itemFormula: "費目 iはC_i(t)=B_i(t)*(A_i(2017)/B_i(2017))*D(t)^β_i。",
  background: [
    "Bは基本系列、Aは2017-2025の公式調整系列、Lは総務省家計調査長期時系列の公式年次原指数（世帯人員・世帯主年齢分布調整済み、1981-2018、総合のみ）。",
    "A/Bのβキャリブレーションは2018-2025で行い、Lはβ推定に使わない。2014/2015は閾値1.4超過前の推計。",
  ],
  observedValues: {
    total2014: {
      B: 118.9,
      L: 102.1,
      D: 0.9641903575,
      currentTotal: 102.3006,
      revisedTotal: 109.9778,
      currentNineCategories: 91.6096,
      currentResidual: 10.6918,
      rawNineCategoriesB: 98.8,
    },
    total2015: {
      B: 114.6,
      L: 100.0,
      D: 0.9797928792,
      currentTotal: 103.956,
      revisedTotal: 107.7157,
      currentNineCategories: 89.635,
      currentResidual: 14.321,
      rawNineCategoriesB: 95.2,
    },
  },
  requiredFocus: [
    "(1)代数的妥当性、(2)2017年のA接続、(3)B当年値の扱い、(4)Lへの依存とB相殺の意味、(5)費目式との整合性、(6)残差・バックテスト・識別性、(7)γ=1固定の妥当性を個別に判定する。",
  ],
};

const QUESTIONS = {
  algebra:
    "修整式とDの定義から、γ=1のときB_total(t)が正確に相殺され、T_revised(t)=A_total(2017)*(L_total(t)/L_total(2017))となる代数的主張は妥当か。2014→2015の提示値（修整案約109.9778→107.7157）とも整合するか。丸め誤差と式の誤りを区別せよ。",
  anchor2017:
    "修整式がt=2017でA_total(2017)に接続するかを判定せよ。L_total(2017)の基準化、B_total(2017)の分子分母、A/B系列の定義差と、2017年接続に必要な前提・未提示情報を評価せよ。",
  currentB:
    "修整案でB_total(t)を当年のスケール要因として使いながら代数的に相殺する扱いは妥当か。現行式ではB_total(t)がDの分母に残り、B低下がTを押し上げ得るという比較を踏まえ、B当年値の情報を捨てる意味、系列不整合や二重計上の可能性を評価せよ。",
  lCancellation:
    "Lは総務省家計調査長期時系列の公式年次原指数（総合のみ、1981-2018、世帯人員・世帯主年齢分布調整済み）で、β推定には使っていない。Lへの依存とB相殺は、何を識別・補正しているのか。Lの期間制約、概念差、観察指数を因果要因と解釈できない限界を含めて判定せよ。",
  itemConsistency:
    "総合だけγ=1でBが相殺される修整式と、費目C_i(t)=B_i(t)*(A_i(2017)/B_i(2017))*D(t)^β_i（βは2018-2025のA/Bからキャリブレーション）の組み合わせは整合的か。総合と費目の非対称性、β_i、総合の集計性、残差定義への影響を評価せよ。",
  validation:
    "現行値（調整後総合102.3006→103.9560、9費目合計91.6096→89.6350、残差10.6918→14.3210、B加工前9費目98.8→95.2）と修整案総合約109.9778→107.7157を踏まえ、残差、バックテスト、閾値1.4超過前推計、反実仮想、識別性をどう検証すべきか。情報だけでの判定を含めて評価せよ。",
  gamma:
    "γ=1固定（一般化すればB_total(t)の効き方をγで制御する想定）の妥当性を判定せよ。γをデータから推定しない理由、過学習・識別不能・外部妥当性、事前に固定した規約としての正当化、感度分析の必要性を評価せよ。",
};

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
function answerCollection(candidate) {
  if (Array.isArray(candidate)) return candidate;
  if (!candidate || typeof candidate !== "object") return null;
  return Object.entries(candidate).map(([questionId, answer]) => ({
    ...(answer && typeof answer === "object" && !Array.isArray(answer) ? answer : { answer }),
    questionId: answer?.questionId ?? answer?.id ?? answer?.key ?? questionId,
  }));
}
function answersOf(response) {
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
  if (probabilities && !Array.isArray(probabilities) && typeof probabilities === "object")
    return Number.isFinite(Number(probabilities[choice] ?? probabilities.choices?.[choice]))
      ? Number(probabilities[choice] ?? probabilities.choices?.[choice])
      : null;
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
function validate(response, ids) {
  const found = answersOf(response);
  const issues = [];
  if (!found.length) issues.push("response contains no answers");
  for (const id of ids) {
    const answer = found.find((item) => String(item?.questionId ?? item?.id ?? item?.key) === id);
    if (!answer) {
      issues.push(`${id}: missing answer`);
      continue;
    }
    const normalized = extracted(answer);
    if (!CHOICES.some(({ id: choiceId }) => choiceId === normalized.choice))
      issues.push(`${id}: invalid choice`);
    for (const choice of CHOICES)
      if (probabilityFor(normalized.probabilities, choice.id) === null)
        issues.push(`${id}: missing probability for ${choice.id}`);
  }
  return issues;
}
function sanitized(response, apiKey, ids) {
  const result = answersOf(response)
    .filter((answer) => ids.includes(String(answer?.questionId ?? answer?.id ?? answer?.key)))
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
    answers: result,
    ...(safeUsage ? { usage: redact(safeUsage, apiKey) } : {}),
  };
}

async function main() {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  const model = process.env.TYPESAFE_MODEL || "jev-latest";
  const endpoint = process.env.TYPESAFE_BASE_URL || API_URL;
  const ids = Object.keys(QUESTIONS);
  const questions = Object.fromEntries(
    ids.map((id) => [id, { type: "choice", instructions: QUESTIONS[id], criteria: CRITERIA }]),
  );
  const request = {
    model,
    state: {
      background: BACKGROUND,
      evaluationScope: "plan39_revised_total_formula_validity",
      outputRequirement:
        "各質問についてchoice、4分類確率、confidence、根拠、限界、追加検証を回答する",
    },
    questions,
  };
  const outputFile = path.join(
    RESULTS_DIR,
    `revised-total-formula-validity-jev-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
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
  const issues = validate(rawResponse, ids);
  if (issues.length) throw new Error(`invalid TypeSafe response: ${issues.join("; ")}`);
  const results = answersOf(rawResponse)
    .filter((answer) => ids.includes(String(answer.questionId ?? answer.id ?? answer.key)))
    .map((answer) => ({
      questionId: String(answer.questionId ?? answer.id ?? answer.key),
      ...extracted(answer),
    }));
  const counts = Object.fromEntries(
    CHOICES.map(({ id }) => [id, results.filter((answer) => answer.choice === id).length]),
  );
  const output = {
    schemaVersion: "plan39-revised-total-formula-validity-jev-v1",
    generatedAt: new Date().toISOString(),
    evaluationScope: request.state.evaluationScope,
    request: { model, background: BACKGROUND, questions },
    sanitizedResponse: sanitized(rawResponse, apiKey, ids),
    results,
    summary: {
      counts,
      answeredCount: results.length,
      expectedCount: ids.length,
      valid: results.length === ids.length,
    },
  };
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temp = `${outputFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    const handle = await open(temp, "r");
    await handle.sync();
    await handle.close();
    await link(temp, outputFile);
  } finally {
    await removeTemporaryFile(temp);
  }
  console.log(outputFile);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
