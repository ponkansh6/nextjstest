#!/usr/bin/env node

import { access, link, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateCatalogSelectionRequest } from "./catalog-selection-request.mjs";
import {
  automaticCandidateChoices,
  diagnosisFromCandidate,
  validateClarificationCandidates,
} from "./clarification-candidates.mjs";

const DEFAULT_BASE_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ENV_FILE = ".env.local";
const DEFAULT_FOLLOW_UP_REASONS = {
  requirements_mismatch:
    "The stated requirements do not match the intended behavior; identify the conflicting requirement and needed correction.",
  missing_prerequisites_info:
    "Information about prerequisites is missing; identify the exact information needed to proceed.",
  incomplete_implementation_info:
    "Implementation information is incomplete; identify the missing details or evidence needed to assess it.",
  implementation_issue:
    "The implementation has an issue; identify the affected location, evidence, and concrete correction.",
  scope_violation:
    "The proposal or implementation exceeds or falls outside the agreed scope; identify the affected scope boundary and adjustment.",
  other: "The reason does not fit the listed categories; explain the concern and next step.",
};

const GENERIC_FOLLOW_UP_CHOICES = new Set([
  "clarified",
  "needs_fix",
  "needs_evidence",
  "indeterminate",
]);
const MAIN_CHOICES = new Set([
  "valid_as_defined",
  "valid_but_limited",
  "not_valid",
  "indeterminate",
]);
const INITIAL_DISTRIBUTION_V2_SCHEMA = "jev-review-initial-distribution-v2";
const INITIAL_DISTRIBUTION_SCHEMA = "jev-review-initial-distribution-v3";
const LEGACY_DISTRIBUTION_CHOICES = new Set([
  "valid_as_defined",
  "evidence_insufficient",
  "acceptance_gap",
  "implementation_mismatch",
  "constraint_conflict",
  "other",
  "indeterminate",
]);
const INITIAL_DISTRIBUTION_CHOICES = new Set([
  "valid_as_defined",
  ...Object.keys(DEFAULT_FOLLOW_UP_REASONS),
  "indeterminate",
]);
const FAILURE_REASON_CHOICES = new Set([
  "evidence_insufficient",
  "acceptance_gap",
  "implementation_mismatch",
  "constraint_conflict",
  "other",
  "not_applicable",
]);
const NEXT_ACTION_CHOICES = new Set([
  "needs_fix",
  "needs_evidence",
  "indeterminate",
  "not_applicable",
]);
const FAILURE_REASON_QUESTION_ID = "failure_reason";
const NEXT_ACTION_QUESTION_ID = "next_action";
let activeApiKey;

function parseArgs(argv) {
  const args = new Map();
  const valueOptions = new Set([
    "--request",
    "--catalog-selection-request",
    "--output",
    "--timeout-ms",
    "--clarification-candidates",
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

function responseAnswerEntries(rawResponse) {
  const containers = [
    rawResponse?.answers,
    rawResponse?.data?.answers,
    rawResponse?.result?.answers,
    rawResponse?.output?.answers,
    rawResponse?.data?.result?.answers,
  ].filter(
    (value) =>
      (Array.isArray(value) && value.length) ||
      (value && typeof value === "object" && Object.keys(value).length),
  );
  return containers.flatMap((answers) =>
    Array.isArray(answers)
      ? answers.map((answer) => ({
          answer,
          id: answer?.questionId ?? answer?.id ?? answer?.key,
        }))
      : Object.entries(answers).map(([key, answer]) => ({
          answer,
          id: answer?.questionId ?? answer?.id ?? answer?.key ?? key,
        })),
  );
}

function selectedAnswer(rawResponse, expectedIds) {
  const entries = responseAnswerEntries(rawResponse);
  const expected = new Set(expectedIds.map(String));
  const matches = [];
  let unidentifiedAnswer = false;
  for (const { answer, id } of entries) {
    if (id === undefined || id === null || id === "") {
      if (expected.size !== 1) continue;
      if (entries.length !== 1) {
        unidentifiedAnswer = true;
        continue;
      }
    } else if (!expected.has(String(id))) {
      continue;
    }
    matches.push({ answer, identified: id !== undefined && id !== null && id !== "" });
  }
  if (unidentifiedAnswer) return { ambiguous: true };
  if (matches.length !== 1) return { ambiguous: matches.length > 1 };
  const { answer, identified } = matches[0];
  const choice = answerChoiceValue(answer);
  if (typeof choice === "string") return { choice, answer, identified };
  return { answer, identified };
}

function answerChoiceValue(answer) {
  return typeof answer === "string"
    ? answer
    : (answer?.choice ??
        answer?.selectedChoice ??
        answer?.selected_choice ??
        answer?.value?.choice ??
        answer?.value?.selectedChoice ??
        answer?.value?.selected_choice ??
        answer?.answer ??
        (typeof answer?.value === "string" ? answer.value : undefined));
}

function answerCandidates(rawResponse, questionId) {
  return responseAnswerEntries(rawResponse)
    .filter(({ id }) => id !== undefined && id !== null && String(id) === questionId)
    .map(({ answer }) => ({
      choice: answerChoiceValue(answer) ?? null,
      confidence: responseField(rawResponse, answer, "confidence") ?? null,
      probabilities: responseField(rawResponse, answer, "probabilities") ?? null,
    }));
}

function answerChoice(rawResponse, expectedIds) {
  return selectedAnswer(rawResponse, expectedIds)?.choice;
}

const MAX_DIAGNOSTIC_STRING_LENGTH = 512;
const MAX_DIAGNOSTIC_LENGTH = 4096;
const DIAGNOSTIC_TRUNCATION_MARKER = "...[truncated]";

function diagnosticString(value, secret, maxLength = MAX_DIAGNOSTIC_STRING_LENGTH) {
  const redacted = redact(String(value), secret);
  if (redacted.length <= maxLength) return redacted;
  return `${redacted.slice(0, maxLength - DIAGNOSTIC_TRUNCATION_MARKER.length)}${DIAGNOSTIC_TRUNCATION_MARKER}`;
}

function fetchCauseDiagnostic(error, secret) {
  const maxDepth = 4;
  const maxNodes = 8;
  const seen = new Set();
  let visited = 0;
  const sensitiveField =
    /^(?:request|response|headers?|authorization|auth|cookie|key|api[-_]?key|token|secret|password|credential|body)$/i;
  const read = (value, key) => {
    try {
      return value?.[key];
    } catch {
      return undefined;
    }
  };
  const describe = (value, depth) => {
    if (!value || (typeof value !== "object" && typeof value !== "function"))
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? typeof value === "string"
          ? diagnosticString(value, secret)
          : value
        : undefined;
    if (depth > maxDepth || visited >= maxNodes || seen.has(value)) return "[omitted]";
    seen.add(value);
    visited += 1;
    const output = {};
    for (const field of ["name", "message"]) {
      const fieldValue = read(value, field);
      if (typeof fieldValue === "string") output[field] = diagnosticString(fieldValue, secret);
    }
    let propertyNames = [];
    try {
      propertyNames = Object.getOwnPropertyNames(value).slice(0, 32);
    } catch {
      // Keep the standard error name/message when custom objects reject inspection.
    }
    for (const field of propertyNames) {
      if (
        field === "name" ||
        field === "message" ||
        field === "stack" ||
        sensitiveField.test(field)
      )
        continue;
      const fieldValue = read(value, field);
      if (field === "cause") {
        output.cause = describe(fieldValue, depth + 1);
      } else if (field === "errors" && Array.isArray(fieldValue)) {
        output.errors = fieldValue.slice(0, maxNodes).map((item) => describe(item, depth + 1));
      } else if (
        typeof fieldValue === "string" ||
        typeof fieldValue === "number" ||
        typeof fieldValue === "boolean"
      ) {
        output[field] =
          typeof fieldValue === "string" ? diagnosticString(fieldValue, secret) : fieldValue;
      }
    }
    return output;
  };
  return describe(error, 0);
}

function mainQuestionIds(result) {
  const ids = result.questionIds ?? [];
  const questions = result.request?.questions;
  if (
    questions &&
    typeof questions === "object" &&
    !Array.isArray(questions) &&
    Object.hasOwn(questions, FAILURE_REASON_QUESTION_ID) &&
    Object.hasOwn(questions, NEXT_ACTION_QUESTION_ID)
  ) {
    const mainIds = ids.filter(
      (id) => id !== FAILURE_REASON_QUESTION_ID && id !== NEXT_ACTION_QUESTION_ID,
    );
    if (mainIds.length === 1) return mainIds;
  }
  return ids;
}

function initialQuestionLayout(request) {
  const questions = request?.questions;
  if (!questions || typeof questions !== "object" || Array.isArray(questions))
    throw new Error("request.questions must be an object");
  const ids = Object.keys(questions);
  if (
    request.schemaVersion !== undefined &&
    request.schemaVersion !== INITIAL_DISTRIBUTION_SCHEMA &&
    request.schemaVersion !== INITIAL_DISTRIBUTION_V2_SCHEMA
  )
    throw new Error(`unsupported initial request schemaVersion: ${request.schemaVersion}`);
  if (
    request.schemaVersion === INITIAL_DISTRIBUTION_SCHEMA ||
    request.schemaVersion === INITIAL_DISTRIBUTION_V2_SCHEMA
  ) {
    const distributionChoices =
      request.schemaVersion === INITIAL_DISTRIBUTION_V2_SCHEMA
        ? LEGACY_DISTRIBUTION_CHOICES
        : INITIAL_DISTRIBUTION_CHOICES;
    if (ids.length !== 1 || questions[ids[0]]?.type !== "choice")
      throw new Error("distribution initial request must contain one choice question");
    const criteria = Object.keys(questions[ids[0]].criteria ?? {});
    if (
      criteria.length !== distributionChoices.size ||
      criteria.some((choice) => !distributionChoices.has(choice))
    )
      throw new Error(
        `distribution question criteria must contain exactly: ${[...distributionChoices].join(", ")}`,
      );
    return {
      mainId: ids[0],
      diagnostic: false,
      distribution: true,
      distributionChoices,
      standardMainChoices: false,
    };
  }
  const hasFailureReason = Object.hasOwn(questions, FAILURE_REASON_QUESTION_ID);
  const hasNextAction = Object.hasOwn(questions, NEXT_ACTION_QUESTION_ID);
  if (!hasFailureReason && !hasNextAction) {
    if (ids.length !== 1)
      throw new Error(
        "initial request must contain one main question or the three-question diagnostic schema",
      );
    if (questions[ids[0]]?.type !== "choice")
      throw new Error("initial main question must have type choice");
    const criteria = Object.keys(questions[ids[0]].criteria ?? {});
    return {
      mainId: ids[0],
      diagnostic: false,
      standardMainChoices:
        criteria.length === MAIN_CHOICES.size &&
        criteria.every((choice) => MAIN_CHOICES.has(choice)),
    };
  }
  const mainIds = ids.filter(
    (id) => id !== FAILURE_REASON_QUESTION_ID && id !== NEXT_ACTION_QUESTION_ID,
  );
  if (!hasFailureReason || !hasNextAction || ids.length !== 3 || mainIds.length !== 1)
    throw new Error(
      "diagnostic initial request must contain one main question plus failure_reason and next_action",
    );
  if (ids.some((id) => questions[id]?.type !== "choice"))
    throw new Error("all diagnostic initial questions must have type choice");
  return { mainId: mainIds[0], diagnostic: true, standardMainChoices: true };
}

function supportedMainChoice(choice, layout) {
  return (
    choice === "valid_as_defined" ||
    (layout.distribution && layout.distributionChoices.has(choice)) ||
    (layout.standardMainChoices && MAIN_CHOICES.has(choice))
  );
}

function answerReason(answer) {
  return [
    answer?.finding,
    answer?.caseSpecificFinding,
    answer?.case_specific_finding,
    answer?.reason,
    answer?.failureReason,
    answer?.failure_reason,
    answer?.value?.finding,
    answer?.value?.caseSpecificFinding,
    answer?.value?.case_specific_finding,
    answer?.value?.reason,
    answer?.value?.failureReason,
    answer?.value?.failure_reason,
  ].find((value) => typeof value === "string" && value.trim());
}

function answerField(answer, names) {
  for (const source of [answer, answer?.value]) {
    if (!source || typeof source !== "object") continue;
    for (const name of names) {
      const value = source[name];
      if (
        (typeof value === "string" && value.trim()) ||
        (Array.isArray(value) && value.length) ||
        (value && typeof value === "object" && Object.keys(value).length)
      )
        return value;
    }
  }
  return undefined;
}

function responseField(rawResponse, answer, field) {
  const sources = [
    answer,
    answer?.value,
    rawResponse,
    rawResponse?.data,
    rawResponse?.result,
    rawResponse?.output,
    rawResponse?.data?.result,
  ];
  return sources.find((source) => source?.[field] !== undefined)?.[field];
}

function probabilityForChoice(probabilities, choice) {
  if (Array.isArray(probabilities)) {
    const entry = probabilities.find(
      (item) => item?.choice === choice || item?.id === choice || item?.key === choice,
    );
    if (entry && typeof entry === "object")
      return entry.probability ?? entry.prob ?? entry.value ?? null;
    return null;
  }
  if (probabilities && typeof probabilities === "object" && !Array.isArray(probabilities))
    return probabilities[choice] ?? null;
  return null;
}

function diagnosticAnswer(rawResponse, questionId, validChoices) {
  const selected = selectedAnswer(rawResponse, [questionId]);
  if (selected?.ambiguous || selected?.identified !== true || !validChoices.has(selected?.choice))
    return { valid: false };
  return {
    valid: true,
    choice: selected.choice,
    answer: selected.answer,
    reason: answerReason(selected.answer)?.trim() ?? null,
    evidence: answerField(selected.answer, [
      "evidence",
      "observations",
      "observation",
      "supportingEvidence",
      "supporting_evidence",
      "basis",
    ]),
    proposedFix: answerField(selected.answer, [
      "concreteFix",
      "concrete_fix",
      "proposedFix",
      "proposed_fix",
      "proposedChange",
      "proposed_change",
      "implementationChange",
      "implementation_change",
    ]),
    neededEvidence: answerField(selected.answer, [
      "neededEvidence",
      "needed_evidence",
      "requiredEvidence",
      "required_evidence",
      "evidenceNeeded",
      "evidence_needed",
      "evidenceToCollect",
      "evidence_to_collect",
    ]),
  };
}

function criterionFallback(request, expectedIds, choice) {
  if (
    expectedIds.length !== 1 ||
    typeof choice !== "string" ||
    !choice.trim() ||
    !["valid_but_limited", "not_valid", "indeterminate"].includes(choice) ||
    !request?.questions ||
    typeof request.questions !== "object" ||
    Array.isArray(request.questions)
  )
    return undefined;
  const questionId = expectedIds[0];
  if (Object.keys(request.questions).filter((id) => id === questionId).length !== 1)
    return undefined;
  const question = request.questions[questionId];
  const criteria = question?.criteria;
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) return undefined;
  if (!Object.hasOwn(criteria, choice)) return undefined;
  const criterion = criteria[choice];
  return typeof criterion === "string" && criterion.trim() ? criterion.trim() : undefined;
}

function invalidDecisionSummary(message, choice = null, diagnostics = {}) {
  return {
    choice,
    outcome: "fail",
    label: "不合格",
    reason: null,
    failureReason: message,
    reasonSource: "generic",
    diagnosisComplete: false,
    diagnosisStatus: "incomplete",
    followUpRecommended: true,
    ...diagnostics,
  };
}

function initialDecisionSummary(rawResponse, expectedIds, request) {
  const layout = initialQuestionLayout(request);
  const main = selectedAnswer(rawResponse, [layout.mainId]);
  if (main?.ambiguous || main?.identified !== true)
    return invalidDecisionSummary(
      main?.ambiguous
        ? "JEV returned multiple answers for the main question; no unique verdict is confirmed."
        : "JEV returned no uniquely identified answer for the main question; no verdict is confirmed.",
    );
  const choice = main.choice;
  const mainReason = answerReason(main.answer)?.trim() ?? null;
  if (!supportedMainChoice(choice, layout))
    return invalidDecisionSummary(
      `JEV returned an unsupported or missing main choice (${humanSummaryText(choice ?? "missing choice", 200)}); no verdict is confirmed.`,
      choice ?? null,
    );

  let confidence = responseField(rawResponse, main.answer, "confidence") ?? null;
  let probabilities = responseField(rawResponse, main.answer, "probabilities") ?? null;
  if (layout.distribution) {
    if (choice === "valid_as_defined")
      return {
        choice,
        outcome: "pass",
        label: "合格",
        reason: mainReason,
        failureReason: null,
        reasonSource: mainReason ? "jev" : null,
        jevReason: mainReason,
        confidence,
        probabilities,
        passProbability: probabilityForChoice(probabilities, "valid_as_defined"),
        diagnosisComplete: true,
        diagnosisStatus: "complete",
        followUpRecommended: false,
      };
    if (choice === "indeterminate")
      return {
        choice,
        outcome: "fail",
        label: "不合格",
        reason: mainReason,
        failureReason: mainReason ?? "JEV could not determine validity from the supplied context.",
        reasonSource: mainReason ? "jev" : "generic",
        jevReason: mainReason,
        confidence,
        probabilities,
        passProbability: probabilityForChoice(probabilities, "valid_as_defined"),
        diagnosisComplete: false,
        diagnosisStatus: "incomplete",
        followUpRecommended: true,
      };
    const details = {
      reason: mainReason,
      affected: answerField(main.answer, [
        "affectedLocation",
        "affected_location",
        "affectedRequirement",
        "affected_requirement",
        "affectedArea",
        "affected_area",
        "location",
        "requirement",
      ]),
      evidence: answerField(main.answer, [
        "evidence",
        "observations",
        "observation",
        "supportingEvidence",
        "supporting_evidence",
        "basis",
      ]),
      proposedFix: answerField(main.answer, [
        "concreteFix",
        "concrete_fix",
        "proposedFix",
        "proposed_fix",
        "proposedChange",
        "proposed_change",
        "implementationChange",
        "implementation_change",
      ]),
      neededEvidence: answerField(main.answer, [
        "neededEvidence",
        "needed_evidence",
        "requiredEvidence",
        "required_evidence",
        "evidenceNeeded",
        "evidence_needed",
        "evidenceToCollect",
        "evidence_to_collect",
      ]),
    };
    const hasValue = (value) =>
      (typeof value === "string" && Boolean(value.trim())) ||
      (Array.isArray(value) && value.length > 0) ||
      (value && typeof value === "object" && Object.keys(value).length > 0);
    const diagnosisComplete = Boolean(
      details.reason &&
      hasValue(details.affected) &&
      hasValue(details.evidence) &&
      (hasValue(details.proposedFix) || hasValue(details.neededEvidence)),
    );
    return {
      choice,
      outcome: "fail",
      label: "不合格",
      reason: details.reason,
      failureReason:
        details.reason ?? `JEV selected ${choice} but did not provide a case-specific reason.`,
      reasonSource: details.reason ? "jev" : "generic",
      jevReason: details.reason,
      affected: details.affected ?? null,
      evidence: details.evidence ?? null,
      proposedFix: details.proposedFix ?? null,
      neededEvidence: details.neededEvidence ?? null,
      confidence,
      probabilities,
      passProbability: probabilityForChoice(probabilities, "valid_as_defined"),
      diagnosisComplete,
      diagnosisStatus: diagnosisComplete ? "complete" : "incomplete",
      followUpRecommended: !diagnosisComplete,
    };
  }
  let failureReasonDiagnosis;
  let nextActionDiagnosis;
  if (layout.diagnostic) {
    failureReasonDiagnosis = diagnosticAnswer(
      rawResponse,
      FAILURE_REASON_QUESTION_ID,
      FAILURE_REASON_CHOICES,
    );
    nextActionDiagnosis = diagnosticAnswer(
      rawResponse,
      NEXT_ACTION_QUESTION_ID,
      NEXT_ACTION_CHOICES,
    );
    if (!failureReasonDiagnosis.valid || !nextActionDiagnosis.valid)
      return invalidDecisionSummary(
        "JEV returned a missing, duplicated, or unknown diagnostic answer; no result is confirmed.",
        choice,
        {
          confidence,
          probabilities,
          failureReasonChoice: failureReasonDiagnosis.valid ? failureReasonDiagnosis.choice : null,
          nextAction: nextActionDiagnosis.valid ? nextActionDiagnosis.choice : null,
        },
      );
    const diagnosticsNotApplicable =
      failureReasonDiagnosis.choice === "not_applicable" &&
      nextActionDiagnosis.choice === "not_applicable";
    const diagnosticsApplicable =
      failureReasonDiagnosis.choice !== "not_applicable" &&
      nextActionDiagnosis.choice !== "not_applicable";
    if (
      (choice === "valid_as_defined" && !diagnosticsNotApplicable) ||
      (choice !== "valid_as_defined" && !diagnosticsApplicable)
    )
      return invalidDecisionSummary(
        choice === "valid_as_defined"
          ? "JEV selected valid_as_defined but returned diagnostic choices other than not_applicable, so the main verdict and diagnostics conflict."
          : "JEV selected a non-pass main verdict but marked a required reason or action as not_applicable, so the concrete reason and response were not obtained.",
        choice,
        {
          confidence,
          probabilities,
          failureReasonChoice: failureReasonDiagnosis.choice,
          nextAction: nextActionDiagnosis.choice,
          recommendedReasonId:
            failureReasonDiagnosis.choice === "not_applicable"
              ? null
              : failureReasonDiagnosis.choice,
          diagnosisStatus: "inconsistent",
        },
      );
  }

  confidence ??=
    responseField(rawResponse, failureReasonDiagnosis?.answer, "confidence") ??
    responseField(rawResponse, nextActionDiagnosis?.answer, "confidence") ??
    null;
  probabilities ??=
    responseField(rawResponse, failureReasonDiagnosis?.answer, "probabilities") ??
    responseField(rawResponse, nextActionDiagnosis?.answer, "probabilities") ??
    null;

  const base = {
    choice,
    confidence,
    probabilities,
    failureReasonChoice: failureReasonDiagnosis?.choice ?? null,
    nextAction: nextActionDiagnosis?.choice ?? null,
    jevReason: null,
    recommendedReasonId:
      failureReasonDiagnosis?.choice === "not_applicable"
        ? null
        : (failureReasonDiagnosis?.choice ?? null),
  };
  if (choice === "valid_as_defined")
    return {
      ...base,
      outcome: "pass",
      label: "合格",
      reason: mainReason,
      failureReason: null,
      reasonSource: mainReason ? "jev" : null,
      jevReason: mainReason,
      diagnosisComplete: true,
      diagnosisStatus: layout.diagnostic ? "complete" : "legacy",
      followUpRecommended: false,
    };

  const diagnosticReason = failureReasonDiagnosis?.reason;
  const returnedReason = diagnosticReason ?? mainReason;
  const criterion =
    returnedReason || !supportedMainChoice(choice, layout)
      ? undefined
      : criterionFallback(request, [layout.mainId], choice);
  const evidence =
    failureReasonDiagnosis?.evidence ??
    nextActionDiagnosis?.evidence ??
    answerField(main.answer, [
      "evidence",
      "observations",
      "observation",
      "supportingEvidence",
      "supporting_evidence",
      "basis",
    ]);
  const actionDetail =
    nextActionDiagnosis?.choice === "needs_fix"
      ? nextActionDiagnosis.proposedFix
      : nextActionDiagnosis?.choice === "needs_evidence"
        ? nextActionDiagnosis.neededEvidence
        : null;
  const hasEvidence =
    (typeof evidence === "string" && evidence.trim()) ||
    (Array.isArray(evidence) && evidence.length > 0) ||
    (evidence && typeof evidence === "object" && Object.keys(evidence).length > 0);
  const reasonSource = returnedReason ? "jev" : criterion ? "criterion_fallback" : "generic";
  const diagnosisComplete = Boolean(
    layout.diagnostic &&
    reasonSource === "jev" &&
    returnedReason &&
    hasEvidence &&
    actionDetail &&
    nextActionDiagnosis?.choice !== "indeterminate",
  );
  const fallbackReason = criterion
    ? `JEV did not return a case-specific reason; selected criterion: ${criterion}`
    : `[JEV did not return a reason; non-pass choice/status: ${choice}]`;
  return {
    ...base,
    outcome: "fail",
    label: "不合格",
    reason: returnedReason,
    failureReason: returnedReason ?? fallbackReason,
    reasonSource,
    jevReason: returnedReason,
    evidence: evidence ?? null,
    actionDetail: actionDetail ?? null,
    diagnosisComplete,
    diagnosisStatus: diagnosisComplete ? "complete" : "incomplete",
    followUpRecommended: !diagnosisComplete,
  };
}

function invalidInitialDecisionSummary(rawResponse, expectedIds, request) {
  let choice = null;
  let failureReasonChoice = null;
  let nextAction = null;
  let confidence = null;
  let probabilities = null;
  let jevReason = null;
  try {
    const layout = initialQuestionLayout(request);
    const main = selectedAnswer(rawResponse, [layout.mainId]);
    if (!main?.ambiguous && main?.identified === true) {
      choice = main.choice ?? null;
      if (supportedMainChoice(choice, layout)) {
        confidence = responseField(rawResponse, main.answer, "confidence") ?? null;
        probabilities = responseField(rawResponse, main.answer, "probabilities") ?? null;
        jevReason = answerReason(main.answer)?.trim() ?? null;
      }
    }
    if (layout.diagnostic) {
      const reason = diagnosticAnswer(
        rawResponse,
        FAILURE_REASON_QUESTION_ID,
        FAILURE_REASON_CHOICES,
      );
      const action = diagnosticAnswer(rawResponse, NEXT_ACTION_QUESTION_ID, NEXT_ACTION_CHOICES);
      if (reason.valid) failureReasonChoice = reason.choice;
      if (action.valid) nextAction = action.choice;
    }
  } catch {
    return invalidDecisionSummary(
      "Initial request question IDs are malformed; no pass is confirmed.",
    );
  }
  return invalidDecisionSummary(
    `JEV response validation failed; no pass is confirmed. ${humanSummaryText(expectedIds.join(", "), 200)}`,
    choice,
    {
      confidence,
      probabilities,
      jevReason,
      recommendedReasonId: failureReasonChoice === "not_applicable" ? null : failureReasonChoice,
      failureReasonChoice,
      nextAction,
    },
  );
}

function humanSummaryText(value, maxLength) {
  const normalized = Array.from(String(value), (character) => {
    const code = character.codePointAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
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
  const choice = answerChoice(result.rawResponse, mainQuestionIds(result));
  const reasons = await loadFollowUpReasons(reasonsFile);
  const summary = result.decisionSummary;
  const positiveMainChoice = ["valid_as_defined", "valid"].includes(choice);
  const positiveDiagnosticConflict =
    positiveMainChoice &&
    summary?.outcome === "fail" &&
    summary?.followUpRecommended === true &&
    summary?.diagnosisComplete !== true;
  if (positiveMainChoice && !positiveDiagnosticConflict)
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
      instruction: positiveDiagnosticConflict
        ? "The initial main judgment is positive, but the decision summary failed closed because diagnostics are inconsistent or incomplete. Address each selected reason, explain the diagnostic discrepancy, cite evidence and limitations, and state the smallest next validation or fix. Do not change or promote the original main judgment; a normal initial review must follow any correction or added evidence."
        : "Explain the initial non-positive judgment, address each selected reason, cite evidence and limitations, and state the smallest next validation or fix. Do not silently revise the initial judgment.",
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
  const choices = await loadClarificationChoices(choicesFile);
  const safeChoices = redact(choices, secret);
  const scope = result.request?.state?.evaluationScope;
  let choice;
  let sourceStage;
  let initialDiagnostics;
  if (scope === "jev_follow_up") {
    choice = answerChoice(result.rawResponse, result.questionIds ?? []);
    if (!choice)
      throw new Error(
        "cannot determine the generic follow-up judgment; inspect rawResponse manually before clarification",
      );
    if (choice === "clarified")
      throw new Error(
        `clarification is only available when the generic follow-up remains unresolved (received ${choice})`,
      );
    if (!GENERIC_FOLLOW_UP_CHOICES.has(choice) && typeof choice !== "string")
      throw new Error(
        "cannot determine the generic follow-up judgment; inspect rawResponse manually before clarification",
      );
    sourceStage = "follow_up";
  } else {
    if (result.status !== "http-success" || result.responseValidation?.valid !== true)
      throw new Error(
        "direct initial clarification requires a normally validated initial result; resubmit the initial review first",
      );
    let layout;
    try {
      layout = initialQuestionLayout(result.request);
    } catch {
      throw new Error("direct initial clarification requires a supported initial-review schema");
    }
    const expectedIds = Object.keys(result.request.questions);
    const recordedIds = result.questionIds ?? [];
    const supportedInitialSchema = layout.diagnostic || layout.distribution;
    if (
      !supportedInitialSchema ||
      recordedIds.length !== expectedIds.length ||
      expectedIds.some((id) => !recordedIds.includes(id)) ||
      recordedIds.some((id) => !expectedIds.includes(id))
    )
      throw new Error("direct initial clarification requires a supported versioned initial schema");
    const main = selectedAnswer(result.rawResponse, [layout.mainId]);
    const mainChoice = typeof main?.choice === "string" ? main.choice.trim() : "";
    if (main?.ambiguous || main?.identified !== true || !mainChoice)
      throw new Error(
        "direct initial clarification requires a uniquely identified, non-empty main judgment; resubmit the initial review first",
      );
    choice = mainChoice;
    if (choice === "valid_as_defined")
      throw new Error(
        "direct initial clarification is unavailable for valid_as_defined; use follow-up for diagnostic conflicts",
      );
    const summaryChoice =
      typeof result.decisionSummary?.choice === "string"
        ? result.decisionSummary.choice.trim()
        : "";
    if (!summaryChoice || summaryChoice !== choice)
      throw new Error(
        "initial decision summary does not match the main answer; resubmit the initial review first",
      );

    if (layout.distribution) {
      const details = main.answer;
      const hasReason = Boolean(answerReason(details)?.trim());
      const affected = answerField(details, [
        "affectedLocation",
        "affected_location",
        "affectedRequirement",
        "affected_requirement",
        "affectedArea",
        "affected_area",
        "location",
        "requirement",
      ]);
      const evidence = answerField(details, [
        "evidence",
        "observations",
        "observation",
        "supportingEvidence",
        "supporting_evidence",
        "basis",
      ]);
      const proposedFix = answerField(details, [
        "concreteFix",
        "concrete_fix",
        "proposedFix",
        "proposed_fix",
        "proposedChange",
        "proposed_change",
        "implementationChange",
        "implementation_change",
      ]);
      const neededEvidence = answerField(details, [
        "neededEvidence",
        "needed_evidence",
        "requiredEvidence",
        "required_evidence",
        "evidenceNeeded",
        "evidence_needed",
        "evidenceToCollect",
        "evidence_to_collect",
      ]);
      const hasValue = (value) =>
        (typeof value === "string" && Boolean(value.trim())) ||
        (Array.isArray(value) && value.length > 0) ||
        (value && typeof value === "object" && Object.keys(value).length > 0);
      const unresolvedReasons = [];
      if (choice === "indeterminate")
        unresolvedReasons.push("The single-distribution verdict is indeterminate.");
      else {
        if (!hasReason)
          unresolvedReasons.push("The selected reason category lacks a case-specific finding.");
        if (!hasValue(affected))
          unresolvedReasons.push(
            "The selected reason category lacks an affected location or requirement.",
          );
        if (!hasValue(evidence))
          unresolvedReasons.push("The selected reason category lacks observed evidence.");
        if (!hasValue(proposedFix) && !hasValue(neededEvidence))
          unresolvedReasons.push(
            "The selected reason category lacks a proposed fix or needed evidence.",
          );
      }
      if (!unresolvedReasons.length)
        throw new Error(
          "direct initial clarification requires an indeterminate or incomplete single-distribution diagnosis",
        );
      initialDiagnostics = {
        schemaVersion: request.schemaVersion,
        selectedReason: choice,
        confidence:
          result.decisionSummary.confidence ??
          responseField(result.rawResponse, main.answer, "confidence") ??
          null,
        probabilities:
          result.decisionSummary.probabilities ??
          responseField(result.rawResponse, main.answer, "probabilities") ??
          null,
        finding: answerReason(details) ?? null,
        affected: affected ?? null,
        evidence: evidence ?? null,
        proposedFix: proposedFix ?? null,
        neededEvidence: neededEvidence ?? null,
        unresolvedReasons,
        priorDecisionSummary: result.decisionSummary,
      };
    } else {
      const failureSelected = selectedAnswer(result.rawResponse, [FAILURE_REASON_QUESTION_ID]);
      const actionSelected = selectedAnswer(result.rawResponse, [NEXT_ACTION_QUESTION_ID]);
      const failureDiagnosis = diagnosticAnswer(
        result.rawResponse,
        FAILURE_REASON_QUESTION_ID,
        FAILURE_REASON_CHOICES,
      );
      const actionDiagnosis = diagnosticAnswer(
        result.rawResponse,
        NEXT_ACTION_QUESTION_ID,
        NEXT_ACTION_CHOICES,
      );
      const unresolvedReasons = [];
      if (choice === "indeterminate") unresolvedReasons.push("The main verdict is indeterminate.");
      if (!failureDiagnosis.valid)
        unresolvedReasons.push("The failure_reason diagnostic is missing, duplicated, or unknown.");
      else if (failureDiagnosis.choice === "not_applicable")
        unresolvedReasons.push("failure_reason is not_applicable despite a non-pass main verdict.");
      if (!actionDiagnosis.valid)
        unresolvedReasons.push("The next_action diagnostic is missing, duplicated, or unknown.");
      else if (actionDiagnosis.choice === "indeterminate")
        unresolvedReasons.push("The next_action diagnostic is indeterminate.");
      else if (actionDiagnosis.choice === "not_applicable")
        unresolvedReasons.push("next_action is not_applicable despite a non-pass main verdict.");
      if (!unresolvedReasons.length)
        throw new Error(
          "direct initial clarification requires an indeterminate or unknown initial judgment/diagnostic; use the follow-up path for other incomplete diagnoses",
        );
      initialDiagnostics = {
        mainJudgment: {
          choice,
          confidence:
            result.decisionSummary.confidence ??
            responseField(result.rawResponse, main.answer, "confidence") ??
            null,
          probabilities:
            result.decisionSummary.probabilities ??
            responseField(result.rawResponse, main.answer, "probabilities") ??
            null,
        },
        failureReason: {
          choice: failureSelected?.ambiguous ? null : (failureSelected?.choice ?? null),
          probabilities: failureSelected?.ambiguous
            ? null
            : (responseField(result.rawResponse, failureSelected?.answer, "probabilities") ?? null),
          answers: answerCandidates(result.rawResponse, FAILURE_REASON_QUESTION_ID),
        },
        nextAction: {
          choice: actionSelected?.ambiguous ? null : (actionSelected?.choice ?? null),
          probabilities: actionSelected?.ambiguous
            ? null
            : (responseField(result.rawResponse, actionSelected?.answer, "probabilities") ?? null),
          answers: answerCandidates(result.rawResponse, NEXT_ACTION_QUESTION_ID),
        },
        unresolvedReasons,
        priorDecisionSummary: result.decisionSummary,
      };
    }
    sourceStage = "initial";
  }
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
      sourceStage,
      effectiveVerdict: "requires_revalidation",
      ...(sourceStage === "follow_up" ? { genericFollowUpJudgment: choice } : {}),
      ...(sourceStage === "initial" ? { initialJudgment: choice, initialDiagnostics } : {}),
      implementationQuestion: safeChoices.question,
      availableChoices: safeChoices.choices,
      selectedChoices: selectedChoices.map((id) =>
        safeChoices.choices.find((item) => item.id === id),
      ),
      priorReview: redact(prior, secret),
      instruction:
        sourceStage === "initial"
          ? "Clarify the initial review's unresolved judgment or diagnosis using the selected options. Explain how the selected reason category, single-distribution probabilities, findings, evidence, and any proposed fix or needed evidence relate; record uncertainty and the smallest next validation. This answer cannot approve the prior review. Require added evidence or a concrete fix, followed by a normal initial JEV re-review."
          : choice === "needs_fix"
            ? "Ask the implementation-specific question using the selected options. Clarify which acceptance requirement needs a fix, the evidence showing the gap, and the concrete proposed change; focus on whichever of these details remains unclear. Record uncertainty and the smallest next validation. This answer cannot approve the prior review; require a normal JEV re-review after any fix or added evidence."
            : "Ask the implementation-specific question using the selected options. Record evidence, uncertainty, and the smallest next validation. This answer cannot approve the prior review; require a normal JEV re-review after any fix or added evidence.",
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

function automaticClarificationChoices(initialResult, secret) {
  const summary = initialResult.decisionSummary ?? {};
  const clean = (value) => humanSummaryText(redact(value ?? "", secret), 600);
  const finding =
    clean(summary.reason ?? summary.failureReason ?? summary.jevReason) ||
    "JEV did not provide a case-specific finding";
  const affected =
    clean(summary.affected ?? summary.priorDecisionSummary?.affected) ||
    "JEV did not identify an affected location or requirement";
  const evidence = clean(summary.evidence) || "JEV did not provide observed evidence";
  const proposedFix =
    clean(summary.proposedFix ?? summary.actionDetail) || "JEV did not provide a proposed fix";
  const neededEvidence =
    clean(summary.neededEvidence) || "JEV did not specify additional evidence needed";
  const caseContext = `Initial finding: ${finding}. Affected location or requirement: ${affected}. Observed evidence: ${evidence}. Proposed fix: ${proposedFix}. Needed evidence: ${neededEvidence}.`;
  const question = `For this one case (${caseContext}) select exactly one immediate next action. The options are mutually exclusive: choose one change target or collect evidence without changing either target.`;
  const options = [
    {
      id: "change_implementation_under_current_requirement",
      label: "Change the implementation under the current requirement",
      description: `${caseContext} Immediate action: make only the implementation change needed to satisfy the current requirement, using this proposed fix if applicable: ${proposedFix}. Keep the requirement unchanged; do not revise it or collect evidence as part of this action.`,
    },
    {
      id: "revise_requirement_under_current_implementation",
      label: "Revise the requirement under the current implementation",
      description: `${caseContext} Immediate action: correct only the affected requirement if it conflicts with the intended behavior. Keep the implementation unchanged; do not edit it or collect evidence as part of this action.`,
    },
    {
      id: "collect_evidence_without_changes",
      label: "Collect evidence without changing the requirement or implementation",
      description: `${caseContext} Immediate action: obtain the smallest evidence needed to assess this finding: ${neededEvidence}. Make no requirement or implementation changes during this action.`,
    },
  ];
  return {
    version: 1,
    question,
    selectionMode: "single",
    choices: options.map((option) => ({
      ...option,
      label: clean(option.label),
      description: clean(option.description),
    })),
  };
}

function automaticClarificationRequest(initialResult, choices, secret, usesCandidates = false) {
  const prior = { ...initialResult };
  delete prior.generatedAt;
  const safeChoices = redact(choices, secret);
  return {
    schemaVersion: "jev-review-automatic-clarification-v1",
    model: initialResult.request?.model,
    state: {
      evaluationScope: "jev_clarification",
      sourceStage: "initial",
      effectiveVerdict: "requires_revalidation",
      initialJudgment: initialResult.decisionSummary.choice,
      initialDecisionSummary: initialResult.decisionSummary,
      implementationQuestion: safeChoices.question,
      availableChoices: safeChoices.choices,
      priorReview: redact(prior, secret),
      outputRequirement: usesCandidates
        ? "Return only the ID of exactly one supplied choice. The supplied candidates already contain the case diagnosis and immediate action. Do not invent or explain a different reason or action."
        : "Return the selected choice ID and a complete case-specific diagnosis: finding, affected location or requirement, observed evidence or exact neededEvidence, concrete nextAction or proposedFix, and remainingUncertainty (write 'none' explicitly when resolved). Repeat the affected/evidence detail in this answer and tie it to the selected action. If a required detail cannot be established, say so explicitly; do not omit the field or invent evidence.",
      instruction: usesCandidates
        ? "Select exactly one supplied mutually exclusive candidate by its ID. Candidate findings, affected locations, evidence, actions, and uncertainty were prepared by Codex and are not JEV findings. Return the ID only; do not add or infer diagnosis details. This clarification cannot approve or alter the initial verdict, and no further clarification will be issued."
        : "Select exactly one available choice as the best next action for resolving or validating the initial non-pass judgment. Treat the choices and their descriptions as the complete allowed option set; do not invent another choice. Return the selected option ID together with every field required by outputRequirement: a case-specific finding, affected location or requirement, observed evidence or exact neededEvidence, concrete nextAction or proposedFix, and remaining uncertainty (explicitly state 'none' if resolved). Repeat the affected/evidence detail and tie it to the selected action. Explain the evidence and why the selected action is the best next step. This clarification cannot approve or alter the initial verdict. A normal initial JEV review is required after the action; do not issue another clarification.",
    },
    questions: {
      implementation_clarification: {
        type: "choice",
        instructions: `${safeChoices.question} Select exactly one offered choice and return the required diagnostic details from state.outputRequirement.`,
        selectionMode: "single",
        choices: safeChoices.choices,
        criteria: Object.fromEntries(
          safeChoices.choices.map(({ id, description }) => [id, description]),
        ),
      },
    },
  };
}

async function runAutomaticClarification(initialResult, apiKey, endpoint, timeoutMs, candidates) {
  const choices = candidates
    ? automaticCandidateChoices(candidates)
    : automaticClarificationChoices(initialResult, apiKey);
  const request = automaticClarificationRequest(
    initialResult,
    choices,
    apiKey,
    Boolean(candidates),
  );
  const questionIds = Object.keys(request.questions);
  const apiRequest = { ...request };
  delete apiRequest.schemaVersion;
  const result = {
    schemaVersion: "jev-review-result-v1",
    reviewSchemaVersion: request.schemaVersion,
    generatedAt: new Date().toISOString(),
    request: redact(request, apiKey),
    questionIds,
    effectiveVerdict: "requires_revalidation",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...apiRequest, model: request.model ?? "jev-latest" }),
      signal: controller.signal,
    });
    const rawText = await response.text();
    if (!response.ok) {
      result.status = "http-error";
      result.error = `TypeSafe HTTP error: status=${response.status} body=${String(redact(rawText, apiKey)).slice(0, 500)}`;
      return { ...result, resolution: "unresolved" };
    }
    let rawResponse;
    try {
      rawResponse = JSON.parse(rawText);
    } catch {
      result.status = "invalid-response";
      result.error = "TypeSafe response is not valid JSON";
      return { ...result, resolution: "unresolved" };
    }
    result.status = "http-success";
    result.rawResponse = redact(rawResponse, apiKey);
    try {
      validateResponse(rawResponse, questionIds);
      result.responseValidation = { valid: true };
    } catch (error) {
      result.responseValidation = {
        valid: false,
        error: humanSummaryText(redact(error?.message ?? error, apiKey), 1000),
      };
      return { ...result, resolution: "unresolved" };
    }
    const selected = selectedAnswer(rawResponse, questionIds);
    const availableIds = new Set(choices.choices.map(({ id }) => id));
    if (
      selected?.ambiguous ||
      selected?.identified !== true ||
      typeof selected.choice !== "string" ||
      !availableIds.has(selected.choice)
    ) {
      result.responseValidation = {
        valid: false,
        error: "JEV did not return one identified choice from the supplied option set",
      };
      return { ...result, resolution: "unresolved" };
    }
    result.responseValidation = { valid: true };
    result.selectedChoice = selected.choice;
    result.clarification = redact(selected.answer, apiKey);
    if (candidates) {
      const candidate = candidates.choices.find(({ id }) => id === selected.choice);
      result.diagnosisSource = "provided_candidate";
      result.diagnosis = redact(diagnosisFromCandidate(candidate), apiKey);
      result.diagnosisStatus = "complete";
      result.unresolvedReasons = [];
      result.resolution = "selected";
      return result;
    }
    const finding = answerReason(selected.answer);
    const affected = answerField(selected.answer, [
      "affectedLocation",
      "affected_location",
      "affectedRequirement",
      "affected_requirement",
      "affectedArea",
      "affected_area",
      "location",
      "requirement",
    ]);
    const observedEvidence = answerField(selected.answer, [
      "evidence",
      "observedEvidence",
      "observed_evidence",
      "observations",
      "observation",
      "supportingEvidence",
      "supporting_evidence",
      "basis",
    ]);
    const neededEvidence = answerField(selected.answer, [
      "neededEvidence",
      "needed_evidence",
      "requiredEvidence",
      "required_evidence",
      "evidenceNeeded",
      "evidence_needed",
      "evidenceToCollect",
      "evidence_to_collect",
    ]);
    const nextAction = answerField(selected.answer, [
      "nextAction",
      "next_action",
      "concreteNextAction",
      "concrete_next_action",
      "proposedFix",
      "proposed_fix",
      "concreteFix",
      "concrete_fix",
    ]);
    const remainingUncertainty = answerField(selected.answer, [
      "remainingUncertainty",
      "remaining_uncertainty",
      "uncertainty",
    ]);
    const hasValue = (value) =>
      (typeof value === "string" && Boolean(value.trim())) ||
      (Array.isArray(value) && value.length > 0) ||
      (value && typeof value === "object" && Object.keys(value).length > 0);
    const diagnosis = {
      finding: finding ?? null,
      affected: affected ?? null,
      evidence: observedEvidence ?? null,
      neededEvidence: neededEvidence ?? null,
      nextAction: nextAction ?? null,
      remainingUncertainty: remainingUncertainty ?? null,
    };
    const unresolvedReasons = [];
    if (!hasValue(finding) || finding.trim() === selected.choice)
      unresolvedReasons.push("The clarification lacks a case-specific finding.");
    if (!hasValue(affected))
      unresolvedReasons.push("The clarification lacks an affected location or requirement.");
    if (!hasValue(observedEvidence) && !hasValue(neededEvidence))
      unresolvedReasons.push("The clarification lacks observed evidence or exact neededEvidence.");
    if (!hasValue(nextAction))
      unresolvedReasons.push("The clarification lacks a concrete nextAction or proposedFix.");
    if (!hasValue(remainingUncertainty))
      unresolvedReasons.push(
        "The clarification does not state remaining uncertainty or explicitly say none.",
      );
    result.diagnosis = redact(diagnosis, apiKey);
    result.diagnosisStatus = unresolvedReasons.length ? "incomplete" : "complete";
    result.unresolvedReasons = unresolvedReasons;
    result.resolution = unresolvedReasons.length ? "unresolved" : "action_selected";
    return result;
  } catch (error) {
    result.status = error?.name === "AbortError" ? "timeout" : "request-error";
    result.error = diagnosticString(error?.message ?? error, apiKey, 1000);
    return { ...result, resolution: "unresolved" };
  } finally {
    clearTimeout(timer);
  }
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
  const layout = initialQuestionLayout(request);
  if (layout.diagnostic) {
    const expectedCriteria = new Map([
      [layout.mainId, MAIN_CHOICES],
      [FAILURE_REASON_QUESTION_ID, FAILURE_REASON_CHOICES],
      [NEXT_ACTION_QUESTION_ID, NEXT_ACTION_CHOICES],
    ]);
    for (const id of ids) {
      const allowed = expectedCriteria.get(id);
      const actual = Object.keys(request.questions[id].criteria);
      if (actual.length !== allowed.size || actual.some((choice) => !allowed.has(choice)))
        throw new Error(`question ${id}.criteria must contain exactly: ${[...allowed].join(", ")}`);
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
  const answerEntries = responseAnswerEntries(response);
  if (!answerEntries.length) throw new Error("TypeSafe response contains no answers");
  const answerIds = new Set(
    answerEntries
      .map(({ id }) => id)
      .filter((id) => id !== undefined && id !== null && id !== "")
      .map(String),
  );
  const missing = expectedIds.filter((id) => !answerIds.has(id));
  if (missing.length)
    throw new Error(`TypeSafe response is missing answers: ${missing.join(", ")}`);
  const unexpected = [...answerIds].filter((id) => !expectedIds.includes(id));
  if (unexpected.length)
    throw new Error(`TypeSafe response contains unknown question IDs: ${unexpected.join(", ")}`);
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
  const catalogSelectionRequestFile = args.get("--catalog-selection-request");
  const followUpFile = args.get("--follow-up");
  const clarifyFile = args.get("--clarify");
  const clarificationCandidatesFile = args.get("--clarification-candidates");
  const modes = [requestFile, catalogSelectionRequestFile, followUpFile, clarifyFile].filter(
    (value) => typeof value === "string",
  );
  if (modes.length !== 1)
    throw new Error(
      "usage: jev-request.mjs --request FILE [--output FILE], --catalog-selection-request FILE [--output FILE], --follow-up RESULT --reason ID, or --clarify INITIAL_OR_FOLLOW_UP_RESULT --choices-file FILE --choice ID",
    );
  if (
    (typeof requestFile === "string" || typeof catalogSelectionRequestFile === "string") &&
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
  if (clarificationCandidatesFile !== undefined && typeof requestFile !== "string")
    throw new Error("--clarification-candidates requires --request with a v3 initial review");
  // An explicitly exported key wins for backwards compatibility; otherwise use
  // the repository-local .env.local value without exposing that file to JEV.
  const apiKey = process.env.TYPESAFE_API_KEY || (await readLocalApiKey());
  activeApiKey = apiKey;
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
        : JSON.parse(
            await readFile(path.resolve(catalogSelectionRequestFile ?? requestFile), "utf8"),
          );
  const clarificationCandidates =
    clarificationCandidatesFile === undefined
      ? undefined
      : validateClarificationCandidates(
          JSON.parse(await readFile(path.resolve(clarificationCandidatesFile), "utf8")),
        );
  const catalogSelectionMode = typeof catalogSelectionRequestFile === "string";
  const fileRequestMode = typeof requestFile === "string" || catalogSelectionMode;
  const questionIds = catalogSelectionMode
    ? validateCatalogSelectionRequest(request)
    : validateRequest(request);
  if (clarificationCandidates && request.schemaVersion !== INITIAL_DISTRIBUTION_SCHEMA)
    throw new Error("--clarification-candidates requires a v3 initial distribution request");
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
    reviewSchemaVersion:
      (catalogSelectionMode ? "jev-browser-test-selection-v1" : request.schemaVersion) ??
      (typeof requestFile === "string"
        ? initialQuestionLayout(request).diagnostic
          ? "jev-review-initial-diagnostics-v1"
          : "jev-review-initial-legacy-v1"
        : undefined),
    generatedAt: new Date().toISOString(),
    request: redact({ ...request, model }, apiKey),
    questionIds,
  };
  const apiRequest = { ...request };
  delete apiRequest.schemaVersion;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let rawText;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...apiRequest, model }),
      signal: controller.signal,
    });
    rawText = await response.text();
  } catch (error) {
    if (error?.name === "AbortError")
      throw new Error(`TypeSafe request timed out after ${timeoutMs}ms`);
    throw new Error(`TypeSafe request failed: ${error?.message ?? error}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok)
    throw new Error(
      `TypeSafe HTTP error: status=${response.status} body=${String(redact(rawText, apiKey)).slice(0, 500)}`,
    );
  let rawResponse;
  let responseValidation;
  try {
    rawResponse = JSON.parse(rawText);
  } catch {
    if (!fileRequestMode) throw new Error("TypeSafe response is not valid JSON");
    rawResponse = rawText;
    responseValidation = {
      valid: false,
      error: "TypeSafe response is not valid JSON",
    };
  }
  if (responseValidation === undefined) {
    try {
      validateResponse(rawResponse, questionIds);
      responseValidation = { valid: true };
    } catch (error) {
      if (!fileRequestMode) throw error;
      responseValidation = {
        valid: false,
        error: humanSummaryText(redact(error?.message ?? error, apiKey), 1000),
      };
    }
  }
  const output = {
    ...base,
    status: "http-success",
    rawResponse: redact(rawResponse, apiKey),
  };
  if (typeof requestFile === "string") {
    output.responseValidation = responseValidation;
    output.decisionSummary = responseValidation.valid
      ? initialDecisionSummary(rawResponse, questionIds, base.request)
      : invalidInitialDecisionSummary(rawResponse, questionIds, base.request);
    const initialChoice = output.decisionSummary.choice;
    if (
      responseValidation.valid &&
      request.schemaVersion === INITIAL_DISTRIBUTION_SCHEMA &&
      INITIAL_DISTRIBUTION_CHOICES.has(initialChoice) &&
      initialChoice !== "valid_as_defined"
    ) {
      output.automaticClarification = await runAutomaticClarification(
        output,
        apiKey,
        endpoint,
        timeoutMs,
        clarificationCandidates,
      );
    }
  } else if (catalogSelectionMode) {
    output.responseValidation = responseValidation;
  }
  if (resolvedOutput) {
    await writeNewJson(resolvedOutput, output);
    console.log(resolvedOutput);
    if (output.decisionSummary) {
      const { choice, label, reason, failureReason } = output.decisionSummary;
      const displayedChoice = humanSummaryText(choice ?? "missing choice", 200);
      console.error(`JEV initial result: ${label} (${displayedChoice})`);
      const displayedReason = output.decisionSummary.outcome === "pass" ? reason : failureReason;
      if (displayedReason) console.error(`Reason: ${humanSummaryText(displayedReason, 1000)}`);
      if (output.decisionSummary.failureReasonChoice)
        console.error(`Failure category: ${output.decisionSummary.failureReasonChoice}`);
      if (output.decisionSummary.nextAction)
        console.error(`Next action: ${output.decisionSummary.nextAction}`);
      if (output.automaticClarification)
        console.error(
          `Automatic clarification: ${output.automaticClarification.resolution}${
            output.automaticClarification.selectedChoice
              ? ` (${output.automaticClarification.selectedChoice})`
              : output.automaticClarification.error
                ? ` — ${humanSummaryText(output.automaticClarification.error, 500)}`
                : ""
          }`,
        );
      if (output.decisionSummary.diagnosisComplete !== undefined)
        console.error(
          `Actionable diagnosis: ${output.decisionSummary.diagnosisComplete ? "complete" : "incomplete"}`,
        );
    }
  } else console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  const secret = activeApiKey || process.env.TYPESAFE_API_KEY;
  const message = diagnosticString(error instanceof Error ? error.message : error, secret);
  const cause =
    error?.cause === undefined
      ? ""
      : `\nFetch cause: ${JSON.stringify(fetchCauseDiagnostic(error.cause, secret))}`;
  console.error(diagnosticString(`${message}${cause}`, secret, MAX_DIAGNOSTIC_LENGTH));
  process.exitCode = 1;
});
