---
name: jev-review
description: Review an implementation checkpoint with JEV, then use the result to guide bounded fixes and a repeat review when needed.
---

# JEV review

Use JEV at an implementation checkpoint when an independent judgment will help decide the next step. Include only the relevant implementation diff, acceptance criteria, verification evidence, and constraints. Plan formulation and plan review are outside this skill's scope.

## API contract

The authoritative contract is the [TypeSafe OpenAPI document](https://api.typesafe.ai/openapi.json): `GET /v1/models` lists available models and `POST /v1/systemone` submits a review. Both use bearer authentication. A systemone JSON request has `model`, `state`, and `questions`; questions use the API's typed `noul`, `choice`, or `score` variant. A successful response is typed as `{ model, answers, usage }`. HTTP `422` means the request failed validation. Follow the OpenAPI schema for variant fields and response details; local metadata such as `schemaVersion` is not part of that API body.

There is no API-native clarification or follow-up operation. Each additional JEV judgment is another `POST /v1/systemone`; automatic clarification and CLI modes are local client workflows.

## Local client workflow

Create a JSON request with `state` and a non-empty `questions` object. For a new standard initial review, use the local `jev-review-initial-distribution-v3` schema and one `choice` question as shown in [references/requests.md](references/requests.md). Submit it through the local client:

```sh
SKILL_DIR=/path/to/jev-review
node "$SKILL_DIR/scripts/jev-request.mjs" --request request.json
```

The client validates the request locally, removes local `schemaVersion` metadata before POSTing, and returns a result envelope for interpretation. Inspect and report the judgment in the active work session; saving an audit document is not required. Use `--output review.json` only when retaining a local result is useful or requested. The client uses an explicitly exported `TYPESAFE_API_KEY` first; otherwise it searches ancestor directories of the current directory and script for `.env.local`. `TYPESAFE_ENV_FILE` selects an explicit env file. `TYPESAFE_MODEL`, `TYPESAFE_BASE_URL`, and `--timeout-ms` are optional. Without a key, a live request fails closed. The key is used only for bearer authentication and is never review content.

Inspect the returned answers and evidence; HTTP success alone is not approval. For new v3 initial reviews, only `valid_as_defined` passes. Every valid non-pass triggers exactly one locally orchestrated clarification POST; it preserves the initial judgment and cannot turn it into a pass. Apply the bounded action or gather requested evidence, run relevant checks, then submit a new regular initial review. See [references/advanced-workflow.md](references/advanced-workflow.md) for compatibility formats and detailed interpretation rules.

Do not include credentials or other secrets in review context. A local path does not give JEV access to a file; include only necessary, non-sensitive excerpts and evidence. The Codex user has authorized sending this non-authentication review data to JEV, so no additional approval is needed for that data. JEV review supplements tests and must not replace them.
