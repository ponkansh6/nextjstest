---
name: jev-review
description: Review a generated plan or implementation checkpoint with JEV and use the result to guide bounded fixes and, when needed, a repeat review.
---

# JEV review

Use this skill after a plan is generated or after an implementation checkpoint when an independent validity judgment will improve the next decision. Gather the relevant plan or diff, acceptance criteria, test evidence, and known constraints before composing a request. Keep the request focused on the decision that needs review.

Create a JSON request containing `model` (optional), `state` (context and acceptance criteria), and a non-empty `questions` object. The examples in [references/requests.md](references/requests.md) cover plan and checkpoint reviews. Submit it with:

Resolve the skill directory first, then run its script so the instructions remain portable when the skill is copied:

```sh
SKILL_DIR=/path/to/jev-review
node "$SKILL_DIR/scripts/jev-request.mjs" --request request.json --output review.json
```

The client validates the request JSON before sending. It uses `TYPESAFE_API_KEY` when explicitly exported and otherwise searches ancestor directories from the current directory and the skill script for `.env.local`, using its `TYPESAFE_API_KEY` by default. Set `TYPESAFE_ENV_FILE` to select an explicit env file. `TYPESAFE_MODEL`, `TYPESAFE_BASE_URL`, and `--timeout-ms` remain optional. A live request fails closed when no key is available. The client uses the existing TypeSafe JEV endpoint contract (`POST /v1/systemone`, bearer authentication, JSON body) and refuses to overwrite an output file.

Treat a successful HTTP response as transport success only. Inspect the preserved `rawResponse` and the actual JEV choices, probabilities, confidence, evidence, and limitations. An API error, timeout, malformed JSON, missing response, or non-positive judgment never counts as approval. Apply a bounded fix when the review identifies one, rerun the relevant checks, and submit a new request when the fix could change the judgment. Do not assume an automatic hook exists; invoke this workflow explicitly at the plan or checkpoint boundary.

When the initial choice is non-positive (`not_valid`, `valid_but_limited`, `indeterminate`, or an unknown format), present follow-up reasons to the Codex user and let them select one or more. Do not silently treat an unknown choice as approval. Generate and submit a follow-up with the prior result preserved as context:

```sh
node "$SKILL_DIR/scripts/jev-request.mjs" --follow-up review.json --reason evidence_insufficient --reason acceptance_gap --output follow-up.json
```

The default choices are `evidence_insufficient`, `acceptance_gap`, `implementation_mismatch`, `constraint_conflict`, and `other`. Pass `--reasons-file choices.json` with a JSON object of `id: description` entries to customize them. A follow-up has a separate output and `rawResponse`; it never overwrites the initial review.

If the generic follow-up remains unresolved (`needs_evidence`, `indeterminate`, or an unknown choice), ask an implementation-specific question with a choices file. The file must have the shape `{ "version": 1, "question": "...", "selectionMode": "single" | "multiple", "choices": [{ "id": "...", "label": "...", "description": "..." }] }` with at least two unique, non-empty choices. First omit `--choice` to show the available options and stop, then submit the selected ID(s):

```sh
node "$SKILL_DIR/scripts/jev-request.mjs" --clarify follow-up.json \
  --choices-file implementation-choices.json --choice missing_test --output clarification.json
```

Use repeated `--choice` only when `selectionMode` is `multiple`. Clarification accepts only a generic follow-up result, preserves that result in `state.priorReview`, and stores the implementation question, options, and selected IDs in the new request. Its `effectiveVerdict` is `requires_revalidation`; the clarification answer cannot approve the prior review. Run a normal initial JEV review after adding evidence or making a fix.

Do not put API keys, credentials, or other secrets in the request context. The key in `.env.local` is used only for bearer authentication and is never sent as review content. A local file path alone does not give JEV access to its contents; include only the necessary, non-sensitive excerpts, diff summary, acceptance criteria, and verification evidence. For this workflow, the Codex user's request explicitly authorizes sending those non-authentication review data to JEV; do not pause for another approval solely for that content. Authentication credentials themselves are excluded from that authorization and must never be sent to JEV. JEV review supplements tests and must not be treated as a test replacement.
