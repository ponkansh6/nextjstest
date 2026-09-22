#!/usr/bin/env node

import { access, link, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ENV_FILE = ".env.local";
const DEFAULT_FOLLOW_UP_REASONS = {
  evidence_insufficient:
    "Evidence is insufficient; identify the missing evidence and the smallest useful check.",
  acceptance_gap:
    "An acceptance criterion is not adequately addressed; explain the gap and required behavior.",
  implementation_mismatch:
    "The implementation appears inconsistent with the intended plan; point to the mismatch.",
  constraint_conflict:
    "A stated constraint conflicts with the proposal; explain the conflict and a viable adjustment.",
  other: "The reason does not fit the listed categories; explain the concern and next step.",
};

const GENERIC_FOLLOW_UP_CHOICES = new Set([
  "clarified",
  "needs_fix",
  "needs_evidence",
  "indeterminate",
]);

function parseArgs(argv) {
  const args = new Map();
  const valueOptions = new Set([
    "--request",
    "--output",
    "--timeout-ms",
    "--follow-up",
    "--reason",
    "--reasons-file",
    "--clarify",
    "--choices-file",
    "--choice",
  ]);
  const flagOptions = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!valueOptions.has(key) && !flagOptions.has(key))
      throw new Error(`unknown argument: ${key}`);
    if (args.has(key) && !["--reason", "--choice"].includes(key))
      throw new Error(`duplicate argument: ${key}`);
    if (flagOptions.has(key)) {
      if (argv[index + 1] && !argv[index + 1].startsWith("--"))
        throw new Error(`${key} does not take a value`);
      args.set(key, true);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    if (key === "--reason" || key === "--choice") args.set(key, [...(args.get(key) ?? []), value]);
    else args.set(key, value);
    index += 1;
  }
  return args;
}

function answerChoice(rawResponse) {
  const answers = [
    rawResponse?.answers,
    rawResponse?.data?.answers,
    rawResponse?.result?.answers,
    rawResponse?.output?.answers,
    rawResponse?.data?.result?.answers,
  ].find(
    (value) =>
      (Array.isArray(value) && value.length) ||
      (value && typeof value === "object" && Object.keys(value).length),
  );
  const values = Array.isArray(answers)
    ? answers
    : answers && typeof answers === "object"
      ? Object.values(answers)
      : [];
  for (const answer of values) {
    const choice =
      typeof answer === "string"
        ? answer
        : (answer?.choice ??
          answer?.selectedChoice ??
          answer?.selected_choice ??
          answer?.value?.choice ??
          answer?.value?.selectedChoice ??
          answer?.value?.selected_choice ??
          answer?.answer ??
          (typeof answer?.value === "string" ? answer.value : undefined));
    if (typeof choice === "string") return choice;
  }
  return undefined;
}

async function loadFollowUpReasons(file) {
  if (!file) return { ...DEFAULT_FOLLOW_UP_REASONS };
  const parsed = JSON.parse(await readFile(path.resolve(file), "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.keys(parsed).length)
    throw new Error("--reasons-file must contain a non-empty JSON object");
  if (Object.values(parsed).some((value) => typeof value !== "string" || !value.trim()))
    throw new Error("--reasons-file values must be non-empty strings");
  return parsed;
}

async function loadClarificationChoices(file) {
  if (!file) throw new Error("--choices-file is required with --clarify");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path.resolve(file), "utf8"));
  } catch (error) {
    throw new Error(`unable to read clarification choices: ${error?.message ?? error}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("choices file must contain an object");
  if (parsed.version !== 1) throw new Error("choices.version must be 1");
  if (typeof parsed.question !== "string" || !parsed.question.trim())
    throw new Error("choices.question must be a non-empty string");
  if (!["single", "multiple"].includes(parsed.selectionMode))
    throw new Error("choices.selectionMode must be single or multiple");
  if (!Array.isArray(parsed.choices) || parsed.choices.length < 2)
    throw new Error("choices.choices must contain at least two entries");
  const ids = new Set();
  for (const choice of parsed.choices) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice))
      throw new Error("each choice must be an object");
    for (const field of ["id", "label", "description"]) {
      if (typeof choice[field] !== "string" || !choice[field].trim())
        throw new Error(`choice.${field} must be a non-empty string`);
    }
    if (ids.has(choice.id)) throw new Error(`choice IDs must be unique: ${choice.id}`);
    ids.add(choice.id);
  }
  return {
    version: 1,
    question: parsed.question,
    selectionMode: parsed.selectionMode,
    choices: parsed.choices.map(({ id, label, description }) => ({ id, label, description })),
  };
}

function printClarificationChoices(choices) {
  const lines = choices.choices.map(
    ({ id, label, description }) => `${id}: ${label} — ${description}`,
  );
  const selection = choices.selectionMode === "multiple" ? "one or more" : "exactly one";
  throw new Error(
    `choose ${selection} implementation-specific option(s) with --choice ID:\n${lines.join("\n")}`,
  );
}

async function createFollowUpRequest(resultFile, reasonsFile, selectedReasons, secret) {
  const result = JSON.parse(await readFile(path.resolve(resultFile), "utf8"));
  const choice = answerChoice(result.rawResponse);
  const reasons = await loadFollowUpReasons(reasonsFile);
  if (["valid_as_defined", "valid"].includes(choice))
    throw new Error(`follow-up is only available for a non-positive judgment (received ${choice})`);
  if (!choice)
    throw new Error(
      "cannot determine the initial JEV judgment; inspect rawResponse manually before follow-up",
    );
  if (!selectedReasons?.length) {
    const choices = Object.entries(reasons)
      .map(([id, description]) => `${id}: ${description}`)
      .join("\n");
    throw new Error(`choose one or more follow-up reasons with --reason ID:\n${choices}`);
  }
  const invalid = selectedReasons.filter((id) => !Object.hasOwn(reasons, id));
  if (invalid.length) throw new Error(`unknown follow-up reason(s): ${invalid.join(", ")}`);
  const prior = { ...result };
  delete prior.generatedAt;
  return {
    model: result.request?.model,
    state: {
      evaluationScope: "jev_follow_up",
      initialJudgment: choice,
      selectedReasons: selectedReasons.map((id) => ({ id, description: reasons[id] })),
      priorReview: redact(prior, secret),
      instruction:
        "Explain the initial non-positive judgment, address each selected reason, cite evidence and limitations, and state the smallest next validation or fix. Do not silently revise the initial judgment.",
    },
    questions: {
      follow_up: {
        type: "choice",
        instructions:
          "After reviewing the initial judgment and selected concerns, what is the reason and next action that best explains the result?",
        criteria: {
          clarified: "The concern is explained with evidence and a concrete next action.",
          needs_fix: "A material issue remains and requires a bounded fix.",
          needs_evidence: "More evidence is required before validity can be judged.",
          indeterminate: "The available context still does not support a determination.",
        },
      },
    },
  };
}

async function createClarificationRequest(resultFile, choicesFile, selectedChoices, secret) {
  const result = JSON.parse(await readFile(path.resolve(resultFile), "utf8"));
  const choice = answerChoice(result.rawResponse);
  const choices = await loadClarificationChoices(choicesFile);
  const safeChoices = redact(choices, secret);
  const scope = result.request?.state?.evaluationScope;
  if (scope !== "jev_follow_up") throw new Error("--clarify requires a generic follow-up result");
  if (!choice)
    throw new Error(
      "cannot determine the generic follow-up judgment; inspect rawResponse manually before clarification",
    );
  if (GENERIC_FOLLOW_UP_CHOICES.has(choice) && ["clarified", "needs_fix"].includes(choice))
    throw new Error(
      `clarification is only available when the generic follow-up remains unresolved (received ${choice})`,
    );
  if (!GENERIC_FOLLOW_UP_CHOICES.has(choice) && typeof choice !== "string")
    throw new Error(
      "cannot determine the generic follow-up judgment; inspect rawResponse manually before clarification",
    );
  if (!selectedChoices?.length) printClarificationChoices(choices);
  const invalid = selectedChoices.filter((id) => !choices.choices.some((item) => item.id === id));
  if (invalid.length) throw new Error(`unknown implementation choice(s): ${invalid.join(", ")}`);
  if (choices.selectionMode === "single" && selectedChoices.length !== 1)
    throw new Error("single selection requires exactly one --choice");
  if (new Set(selectedChoices).size !== selectedChoices.length)
    throw new Error("--choice IDs must be unique");
  const prior = { ...result };
  delete prior.generatedAt;
  return {
    model: result.request?.model,
    state: {
      evaluationScope: "jev_clarification",
      effectiveVerdict: "requires_revalidation",
      genericFollowUpJudgment: choice,
      implementationQuestion: safeChoices.question,
      availableChoices: safeChoices.choices,
      selectedChoices: selectedChoices.map((id) =>
        safeChoices.choices.find((item) => item.id === id),
      ),
      priorReview: redact(prior, secret),
      instruction:
        "Ask the implementation-specific question using the selected options. Record evidence, uncertainty, and the smallest next validation. This answer cannot approve the prior review; require a normal JEV re-review after any fix or added evidence.",
    },
    questions: {
      implementation_clarification: {
        type: "choice",
        instructions: safeChoices.question,
        selectionMode: choices.selectionMode,
        choices: safeChoices.choices,
        criteria: Object.fromEntries(
          safeChoices.choices.map(({ id, description }) => [id, description]),
        ),
      },
    },
  };
}

function redact(value, secret) {
  if (typeof value === "string") {
    const withSecret = secret ? value.replaceAll(secret, "[REDACTED]") : value;
    return withSecret.replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
  }
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

async function readLocalApiKey() {
  const explicitEnvFile = process.env.TYPESAFE_ENV_FILE;
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  const candidates = explicitEnvFile
    ? [path.resolve(process.cwd(), explicitEnvFile)]
    : starts.flatMap((start) => {
        const paths = [];
        let current = path.resolve(start);
        while (true) {
          paths.push(path.join(current, DEFAULT_ENV_FILE));
          const parent = path.dirname(current);
          if (parent === current) break;
          current = parent;
        }
        return paths;
      });
  const uniqueCandidates = [...new Set(candidates)];
  for (const envFile of uniqueCandidates) {
    const key = await readApiKeyFromFile(envFile);
    if (key) return key;
  }
  return undefined;
}

async function readApiKeyFromFile(envFile) {
  let contents;
  try {
    contents = await readFile(envFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw new Error(`unable to read ${DEFAULT_ENV_FILE}: ${error?.message ?? error}`);
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[1].replace(/^(["'])(.*)\1$/, "$2").trim();
    if (value) return value;
  }
  return undefined;
}

function validateRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request))
    throw new Error("request JSON must be an object");
  if (request.model !== undefined && typeof request.model !== "string")
    throw new Error("request.model must be a string when provided");
  if (typeof request.model === "string" && !request.model.trim())
    throw new Error("request.model must not be empty");
  if (!request.state || typeof request.state !== "object" || Array.isArray(request.state))
    throw new Error("request.state must be an object");
  if (
    !request.questions ||
    typeof request.questions !== "object" ||
    Array.isArray(request.questions)
  )
    throw new Error("request.questions must be a non-empty object");
  const ids = Object.keys(request.questions);
  if (!ids.length) throw new Error("request.questions must be a non-empty object");
  for (const id of ids) {
    const question = request.questions[id];
    if (!question || typeof question !== "object" || Array.isArray(question))
      throw new Error(`question ${id} must be an object`);
    if (question.type === "choice") {
      if (typeof question.instructions !== "string" || !question.instructions.trim())
        throw new Error(`question ${id}.instructions must be a non-empty string`);
      if (
        !question.criteria ||
        typeof question.criteria !== "object" ||
        Array.isArray(question.criteria) ||
        !Object.keys(question.criteria).length
      )
        throw new Error(`question ${id}.criteria must be a non-empty object`);
      if (
        Object.values(question.criteria).some((value) => typeof value !== "string" || !value.trim())
      )
        throw new Error(`question ${id}.criteria values must be non-empty strings`);
    }
  }
  return ids;
}

function validateResponse(response, expectedIds) {
  if (
    !response ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    !Object.keys(response).length
  )
    throw new Error("TypeSafe response must be a non-empty JSON object");
  if (response.error || response.errors || response.data?.error || response.result?.error)
    throw new Error("TypeSafe response contains an error");
  const candidates = [
    response.answers,
    response.data?.answers,
    response.result?.answers,
    response.output?.answers,
    response.data?.result?.answers,
  ];
  const answerSet = candidates.find(
    (value) =>
      (Array.isArray(value) && value.length) ||
      (value && typeof value === "object" && Object.keys(value).length),
  );
  if (!answerSet) throw new Error("TypeSafe response contains no answers");
  const answerIds = new Set(
    Array.isArray(answerSet)
      ? answerSet
          .map((answer) => answer?.questionId ?? answer?.id ?? answer?.key)
          .filter(Boolean)
          .map(String)
      : Object.entries(answerSet).map(([id, answer]) =>
          String(answer?.questionId ?? answer?.id ?? answer?.key ?? id),
        ),
  );
  const missing = expectedIds.filter((id) => !answerIds.has(id));
  if (missing.length)
    throw new Error(`TypeSafe response is missing answers: ${missing.join(", ")}`);
}

async function ensureNewOutput(output) {
  try {
    await access(output);
    throw new Error(`refusing to overwrite existing output: ${output}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function writeNewJson(output, value) {
  await ensureNewOutput(output);
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
  let writeError;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    const handle = await open(temporary, "r");
    await handle.sync();
    await handle.close();
    await link(temporary, output);
  } catch (error) {
    writeError = error;
  }
  try {
    await unlink(temporary);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (writeError) throw writeError;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestFile = args.get("--request");
  const followUpFile = args.get("--follow-up");
  const clarifyFile = args.get("--clarify");
  const modes = [requestFile, followUpFile, clarifyFile].filter(
    (value) => typeof value === "string",
  );
  if (modes.length !== 1)
    throw new Error(
      "usage: jev-request.mjs --request FILE [--output FILE], --follow-up RESULT --reason ID, or --clarify FOLLOW_UP_RESULT --choices-file FILE --choice ID",
    );
  if (
    typeof requestFile === "string" &&
    (args.has("--reason") ||
      args.has("--reasons-file") ||
      args.has("--choice") ||
      args.has("--choices-file"))
  )
    throw new Error("follow-up options require --follow-up or --clarify");
  if (
    typeof followUpFile === "string" &&
    (args.has("--choice") || args.has("--choices-file") || args.has("--clarify"))
  )
    throw new Error("clarification options require --clarify");
  if (
    typeof clarifyFile === "string" &&
    (args.has("--reason") || args.has("--reasons-file") || args.has("--follow-up"))
  )
    throw new Error("--reason and --follow-up cannot be used with --clarify");
  // An explicitly exported key wins for backwards compatibility; otherwise use
  // the repository-local .env.local value without exposing that file to JEV.
  const apiKey = process.env.TYPESAFE_API_KEY || (await readLocalApiKey());
  const request =
    typeof followUpFile === "string"
      ? await createFollowUpRequest(
          followUpFile,
          args.get("--reasons-file"),
          args.get("--reason"),
          apiKey,
        )
      : typeof clarifyFile === "string"
        ? await createClarificationRequest(
            clarifyFile,
            args.get("--choices-file"),
            args.get("--choice"),
            apiKey,
          )
        : JSON.parse(await readFile(path.resolve(requestFile), "utf8"));
  const questionIds = validateRequest(request);
  const timeoutMs = Number(args.get("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("--timeout-ms must be a positive integer");
  const model = request.model ?? process.env.TYPESAFE_MODEL ?? "jev-latest";
  if (typeof model !== "string" || !model.trim()) throw new Error("model must not be empty");
  const endpoint = process.env.TYPESAFE_BASE_URL || DEFAULT_BASE_URL;
  const outputFile = args.get("--output");
  if (outputFile !== undefined && typeof outputFile !== "string")
    throw new Error("--output requires a path");
  const resolvedOutput = outputFile ? path.resolve(outputFile) : null;
  if (resolvedOutput) await ensureNewOutput(resolvedOutput);
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set and no value was found in .env.local");
  const base = {
    schemaVersion: "jev-review-result-v1",
    generatedAt: new Date().toISOString(),
    request: redact({ ...request, model }, apiKey),
    questionIds,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let rawText;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, model }),
      signal: controller.signal,
    });
    rawText = await response.text();
  } catch (error) {
    if (error?.name === "AbortError")
      throw new Error(`TypeSafe request timed out after ${timeoutMs}ms`);
    throw new Error(`TypeSafe request failed: ${error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
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
  validateResponse(rawResponse, questionIds);
  const output = { ...base, status: "http-success", rawResponse: redact(rawResponse, apiKey) };
  if (resolvedOutput) {
    await writeNewJson(resolvedOutput, output);
    console.log(resolvedOutput);
  } else console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  const secret = process.env.TYPESAFE_API_KEY;
  console.error(redact(error instanceof Error ? error.message : error, secret));
  process.exitCode = 1;
});
