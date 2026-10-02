---
name: jev-review
description: Review an implementation checkpoint with JEV, then use the result to guide bounded fixes and a repeat review when needed.
---

# JEV review

Use JEV at an implementation checkpoint when an independent judgment will help decide the next step. Include only the relevant implementation diff, acceptance criteria, verification evidence, and constraints. Plan formulation and plan review are outside this skill's scope.

## API contract

The authoritative contract is the [TypeSafe OpenAPI document](https://api.typesafe.ai/openapi.json): `GET /v1/models` lists available models and `POST /v1/systemone` submits a review. Both use bearer authentication. A systemone JSON request has `model`, `state`, and `questions`; questions use the API's typed `noul`, `choice`, or `score` variant. A successful response is typed as `{ model, answers, usage }`. HTTP `422` means the request failed validation. Follow the OpenAPI schema for variant fields and response details; local metadata such as `schemaVersion` is not part of that API body.

There is no API-native clarification or follow-up operation. Each additional JEV judgment is another `POST /v1/systemone`; clarification and CLI modes are local client workflows.

## Standard checkpoint workflow

Create a JSON request using the local `jev-review-initial-distribution-v3` schema and one `choice` question as shown in [references/requests.md](references/requests.md). For every new standard review, also create at least two complete, mutually exclusive, case-specific immediate-action candidates and submit them with `--clarification-candidates PATH`:

```sh
SKILL_DIR=/path/to/jev-review
node "$SKILL_DIR/scripts/jev-request.mjs" --request request.json --clarification-candidates candidates.json
```

Codex authors the candidates from the actual code, requirements, tests, and verification evidence. Validate every candidate before sending: include `id`, `label`, `finding`, `affected`, exactly one of `evidence` or `neededEvidence`, exactly one of `nextAction` or `proposedFix`, and `remainingUncertainty` (use `none` when resolved). Do not ask JEV to invent a diagnosis or fill missing details. If evidence is unavailable, supply the exact evidence needed. See [references/advanced-workflow.md](references/advanced-workflow.md) for candidate design and interpretation.

JEV's role is to return its listed choice, confidence, and probability distribution. Only the initial choice `valid_as_defined` passes. On a valid non-pass initial judgment, the client submits exactly one clarification using the supplied candidates. It maps the selected ID back to the local candidate and reports that candidate's diagnosis as `diagnosisSource: "provided_candidate"`, `diagnosisStatus: "complete"`, and `resolution: "selected"`; these details come from Codex's submitted candidate, not from JEV. Preserve the initial result and distribution, and set the clarification's `effectiveVerdict` to `requires_revalidation`. A passing initial answer, or an initial transport/validation/unsupported-format error, does not trigger clarification. Never chain clarifications; after evidence gathering or a bounded fix, submit a new normal initial review.

Inspect the response and evidence; HTTP success alone is not approval. The client prefers an explicitly exported `TYPESAFE_API_KEY`; otherwise it searches ancestor directories of the current directory and script for `.env.local`. `TYPESAFE_ENV_FILE` selects an explicit env file. `TYPESAFE_MODEL`, `TYPESAFE_BASE_URL`, and `--timeout-ms` are optional. Without a key, a live request fails closed. The key is used only for bearer authentication and is never review content. Do not include credentials or other secrets in review context. A local path does not give JEV access to a file; include only necessary, non-sensitive excerpts and evidence. The Codex user has authorized sending this non-authentication review data to JEV. JEV review supplements tests and must not replace them.

Older saved results and explicit `--clarify` / generic `--follow-up` utilities retain their compatibility behavior described in the advanced reference.
