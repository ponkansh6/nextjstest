# Request examples

The API contract is [https://api.typesafe.ai/openapi.json](https://api.typesafe.ai/openapi.json). `POST /v1/systemone` accepts `model`, `state`, and `questions`; question objects must conform to the declared `noul`, `choice`, or `score` variant. Consult OpenAPI for the complete variant fields. The examples below show the local client's standard choice-review format. Its `schemaVersion` is local parser metadata and the client removes it before sending the API request.

## Standard initial review

Use this local schema for new implementation-checkpoint reviews. Only `valid_as_defined` is a passing answer. The initial choice classifies JEV's judgment; it does not carry a written diagnosis. Ask JEV only for the listed choice, confidence, and probability distribution. Prepare case-specific clarification candidates separately from the actual requirements, diff, tests, and verification evidence, and submit them with `--clarification-candidates` on every new standard invocation. JEV selects among them only if the initial result is a valid non-pass.

```json
{
  "schemaVersion": "jev-review-initial-distribution-v3",
  "model": "jev-latest",
  "state": {
    "evaluationScope": "implementation_checkpoint_validity",
    "background": "Describe the intended behavior and relevant diff.",
    "acceptanceCriteria": ["Behavior matches the acceptance criteria", "Errors are surfaced"],
    "verification": ["Request validation completed before submission"],
    "knownConstraints": ["No unrelated files"],
    "outputRequirement": "Choose one listed choice and return its confidence and probability distribution. Do not add a diagnosis or explanation."
  },
  "questions": {
    "implementation": {
      "type": "choice",
      "instructions": "Does the supplied evidence support the implementation against the acceptance criteria? Return a probability distribution over the listed choices.",
      "criteria": {
        "valid_as_defined": "The supplied evidence supports acceptance as defined.",
        "requirements_mismatch": "The supplied evidence suggests a mismatch between requirements and intended behavior.",
        "missing_prerequisites_info": "The supplied context appears to lack prerequisite information.",
        "incomplete_implementation_info": "The supplied implementation evidence appears incomplete.",
        "implementation_issue": "The supplied evidence suggests an implementation issue.",
        "scope_violation": "The proposal appears to exceed or fall outside the agreed scope.",
        "other": "A material concern appears to exist outside the other listed categories.",
        "indeterminate": "The supplied context does not support a clear judgment."
      }
    }
  }
}
```

## Standard clarification candidates

Supply a local file with at least two complete, mutually exclusive, case-specific immediate actions. The client validates it before sending the initial request. Candidate diagnoses come from Codex's review of the concrete requirement and evidence; do not make JEV invent or complete details. The following is an illustrative hypothetical: replace every path and observation with facts from the current implementation checkpoint, and never claim an uncollected observation.

```json
{
  "choices": [
    {
      "id": "fix-implementation",
      "label": "Change implementation under current requirement",
      "finding": "Selecting a range changes the URL while chart rows remain from the prior range until Apply.",
      "affected": "src/components/RangeSelector.tsx and the range-selection requirement in openspec/specs/nextjstest/spec.md",
      "evidence": "The existing browser interaction observes the new selected range and URL while chart rows remain unchanged until Apply.",
      "proposedFix": "Keep the requirement unchanged and update range-change state propagation so selecting the range also updates chart rows.",
      "remainingUncertainty": "The approved design's intent—immediate refresh or refresh on Apply—has not been confirmed."
    },
    {
      "id": "revise-requirement",
      "label": "Revise requirement under current implementation",
      "finding": "Selecting a range changes the URL while chart rows remain from the prior range until Apply.",
      "affected": "src/components/RangeSelector.tsx and the range-selection requirement in openspec/specs/nextjstest/spec.md",
      "evidence": "The existing browser interaction observes the new selected range and URL while chart rows remain unchanged until Apply.",
      "proposedFix": "Keep the implementation unchanged and revise the range-selection scenario to say chart rows refresh when the user activates Apply.",
      "remainingUncertainty": "The approved design's intent—immediate refresh or refresh on Apply—has not been confirmed."
    },
    {
      "id": "collect-evidence",
      "label": "Collect evidence without changing code or requirements",
      "finding": "Selecting a range changes the URL while chart rows remain from the prior range until Apply.",
      "affected": "src/components/RangeSelector.tsx and the range-selection requirement in openspec/specs/nextjstest/spec.md",
      "evidence": "The existing browser interaction observes the new selected range and URL while chart rows remain unchanged until Apply.",
      "nextAction": "Without changing code or requirements, inspect the approved range-selection decision and observe the existing browser interaction through Apply; record whether chart rows refresh.",
      "remainingUncertainty": "The approved design's intent—immediate refresh or refresh on Apply—has not been confirmed."
    }
  ]
}
```

Each candidate must include `id`, `label`, `finding`, and `affected`; exactly one of `evidence` or `neededEvidence`; exactly one of `nextAction` or `proposedFix`; and `remainingUncertainty` (`none` when resolved). If evidence has not been collected, write the exact missing evidence in `neededEvidence`. Keep each candidate's immediate action exclusive: for example, implementation-only change under current requirements, requirements-only revision under current implementation, or evidence collection without either change. Do not combine these actions in one candidate.

Run a new standard review with:

```sh
node "$SKILL_DIR/scripts/jev-request.mjs" --request request.json --clarification-candidates candidates.json
```

The client returns the selected initial choice's confidence and complete probability distribution, including `passProbability`. During the single automatic clarification after a valid non-pass, JEV returns a candidate choice, confidence, and distribution. The client maps the choice ID to the submitted candidate and carries its fields into the local result; the diagnosis content is supplied by Codex, not generated by JEV.

## API request and response shape

The wire request contains only API fields, for example:

```json
{
  "model": "jev-latest",
  "state": {},
  "questions": {}
}
```

The API response has the typed shape `{ model, answers, usage }`; use the OpenAPI schema for the types and precise answer and usage fields. A `422` response is a request validation error, not a judgment. When an output envelope is requested, the client preserves raw responses and local request/result metadata in it; otherwise inspect and report the response in the active work session.
