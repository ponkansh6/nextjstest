# JEV request examples

Requests use the JSON body accepted by `scripts/jev-request.mjs` and the TypeSafe JEV `systemone` endpoint. `schemaVersion` is local request metadata used for parser dispatch and is retained in saved request/result envelopes; it is omitted from the HTTP API body. Replace the context with the actual plan or implementation checkpoint, acceptance criteria, evidence, and constraints.

## Single-distribution initial review

New initial requests use `schemaVersion: "jev-review-initial-distribution-v3"` and one choice question. Its single probability distribution has exactly one passing choice (`valid_as_defined`), the six mutually exclusive reason categories `requirements_mismatch`, `missing_prerequisites_info`, `incomplete_implementation_info`, `implementation_issue`, `scope_violation`, and `other`, plus a separate `indeterminate` choice. A reason category does not encode severity: JEV must not infer `valid_but_limited` or `not_valid` from it. Put scope or severity in the finding details when useful. The summary treats only `valid_as_defined` as pass; `indeterminate` is unresolved and all reason categories are non-pass.

When a reason category is selected, the answer must include a case-specific finding, the affected location or requirement, observed evidence, and either a concrete proposed fix or the exact additional evidence needed. The client preserves the one answer's confidence and full choice probability distribution, and exposes the `valid_as_defined` probability as `passProbability`. If any required details are missing, the diagnosis is incomplete and case-specific clarification is recommended. A reason choice and its probability alone are not an actionable finding. Unknown, missing, or duplicated answers fail closed.

```json
{
  "schemaVersion": "jev-review-initial-distribution-v3",
  "model": "jev-latest",
  "state": {
    "evaluationScope": "implementation_checkpoint_validity",
    "background": "Describe the intended behavior and include the relevant diff summary.",
    "acceptanceCriteria": [
      "Behavior matches the plan",
      "Errors are surfaced",
      "No secrets are emitted"
    ],
    "verification": ["Request validation completes before submission"],
    "knownConstraints": ["No unrelated files"],
    "outputRequirement": "Return exactly one selected choice with confidence and probabilities for every choice in this question. valid_as_defined means the supplied plan or implementation meets the stated criteria. Choose exactly one mutually exclusive reason category for any identified concern, or indeterminate if the supplied context cannot support a judgment. Do not infer valid_but_limited or not_valid severity from the reason category; describe scope/severity in the finding details if useful. For a reason category, include a case-specific finding, affected location or requirement, observed evidence, and either a concrete proposed fix or exact additional evidence needed. Do not invent evidence or details."
  },
  "questions": {
    "implementation": {
      "type": "choice",
      "instructions": "Does the implementation satisfy the stated behavior and acceptance criteria based on the supplied diff and verification? Return the probability distribution across these mutually exclusive choices.",
      "criteria": {
        "valid_as_defined": "The supplied evidence supports acceptance of the implementation as defined.",
        "requirements_mismatch": "The stated requirements do not match the intended behavior; identify the conflicting requirement and needed correction.",
        "missing_prerequisites_info": "Information about prerequisites is missing; identify the exact information needed to proceed.",
        "incomplete_implementation_info": "Implementation information is incomplete; identify the missing details or evidence needed to assess it.",
        "implementation_issue": "The implementation has an issue; identify the affected location, evidence, and concrete correction.",
        "scope_violation": "The proposal or implementation exceeds or falls outside the agreed scope; identify the affected scope boundary and adjustment.",
        "other": "A material concern does not fit the listed categories; identify the affected location, evidence, and concrete fix or needed evidence.",
        "indeterminate": "The supplied context cannot support a judgment yet; identify the missing context if possible."
      }
    }
  }
}
```

For a plan review, use `evaluationScope: "plan_validity"`, describe the plan in `background`, and adapt the criteria and findings to the plan. The same single-distribution schema applies.

## Existing request compatibility

Saved results from `jev-review-initial-distribution-v2` remain readable with their original reason choices and summary semantics. Saved results from the prior three-question schema (`failure_reason` plus `next_action`) and the older one-question schema also remain readable. The three-question schema keeps its original summary and follow-up behavior. Legacy custom non-empty criteria remain accepted; in legacy results only the exact choice `valid_as_defined` is a pass. New results record `reviewSchemaVersion`, and the original request's `schemaVersion` is also retained.

## Automatic implementation-specific clarification

For every valid non-pass from a new v3 initial request (`indeterminate` or any of the six reason categories), the client generates at least two mutually exclusive, case-specific immediate next-action choices from the initial finding, affected requirement, evidence, proposed fix, and needed evidence. The default set separates three exclusive first actions: change only the implementation under the current requirement; revise only the requirement under the current implementation; or collect evidence without changing either. Every option repeats the same case finding, affected location or requirement, and observed or needed evidence, naming omitted details when JEV did not supply them. Each description explicitly excludes the other action types, so a selected option does not authorize a compound step. The client sends a second JEV request containing these choices as the choice criteria and asks JEV to select one option, explain its evidence and next action, and state remaining uncertainty. Codex does not preselect a choice and does not ask the user to select one.

The question-level output requirement asks JEV to return the selected choice ID and all of: a case-specific finding, affected location or requirement, observed evidence or exact `neededEvidence`, concrete `nextAction` or `proposedFix`, and `remainingUncertainty` (explicitly `none` when resolved). Repeat the affected and evidence details in the clarification and tie them to its chosen action. A valid choice with missing diagnosis details is transport-valid but `resolution: "unresolved"`, `diagnosisStatus: "incomplete"`, with `unresolvedReasons`; preserve its `selectedChoice` and `rawResponse`. Mark `resolution: "action_selected"` and diagnosis complete only when every required detail is present.

The automatic clarification runs once only after a normally validated v3 initial response with a recognized non-pass choice. A passing initial result does not trigger it. Initial transport or response validation failures, unsupported versions, and unknown/missing choices retain the existing initial-error behavior and do not trigger clarification. The saved initial `decisionSummary` and choice distribution remain unchanged. The automatic clarification result always records `effectiveVerdict: "requires_revalidation"`; it cannot promote the initial result. A failed, invalid, out-of-set, or diagnostically incomplete second answer is preserved as unresolved beside the initial result. Do not chain clarification or ask the user to repair it; apply the selected action or collect evidence, then make a new regular initial review.

## Manual clarification compatibility

The explicit `--clarify INITIAL_RESULT --choices-file FILE --choice ID` utility remains supported for compatibility. Its choices file has this shape, with at least two unique choices:

```json
{
  "version": 1,
  "question": "Which implementation concern should be checked next?",
  "selectionMode": "single",
  "choices": [
    {
      "id": "missing_test",
      "label": "Missing test",
      "description": "Add the smallest test that demonstrates the behavior."
    },
    {
      "id": "runtime_path",
      "label": "Runtime path",
      "description": "Verify the behavior at the affected runtime boundary."
    }
  ]
}
```

This manual utility still expects explicit `--choice` IDs; repeated `--choice` is valid only for `selectionMode: "multiple"`. It preserves the source review and sets `effectiveVerdict: "requires_revalidation"`. Manual clarification and `--follow-up` are not part of the standard automatic path.

## Optional generic follow-up utility

The client retains `--follow-up` and its fixed default reasons for explicit non-standard use; this is outside the standard re-request workflow. The IDs are `requirements_mismatch`, `missing_prerequisites_info`, `incomplete_implementation_info`, `implementation_issue`, `scope_violation`, and `other`. `--reasons-file choices.json` remains available to callers that explicitly use this utility. The client also retains clarification of eligible generic follow-up results for compatibility, but the standard workflow does not chain through those stages.

## Credentials and review data

The client prefers explicitly exported `TYPESAFE_API_KEY`; otherwise it searches ancestor directories of the current directory and script for `.env.local`. `TYPESAFE_ENV_FILE` selects an explicit env file. Without a key, a live request fails closed. `TYPESAFE_MODEL`, `TYPESAFE_BASE_URL`, and `--timeout-ms` are optional. A local path alone does not give JEV access to file contents; include only necessary non-sensitive excerpts and review context. Do not include credentials in requests. JEV supplements tests and does not replace them.
