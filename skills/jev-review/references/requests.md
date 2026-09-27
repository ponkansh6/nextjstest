# Request examples

The API contract is [https://api.typesafe.ai/openapi.json](https://api.typesafe.ai/openapi.json). `POST /v1/systemone` accepts `model`, `state`, and `questions`; question objects must conform to the declared `noul`, `choice`, or `score` variant. Consult OpenAPI for the complete variant fields. The examples below show the local client's standard choice-review format. Its `schemaVersion` is local parser metadata and the client removes it before sending the API request.

## Standard initial review

Use this local schema for new plan and checkpoint reviews. Only `valid_as_defined` is a passing answer. A reason category describes the kind of concern; it does not encode severity. A non-pass reason needs a case-specific finding, affected location or requirement, observed evidence, and either a concrete proposed fix or exact additional evidence needed.

```json
{
  "schemaVersion": "jev-review-initial-distribution-v3",
  "model": "jev-latest",
  "state": {
    "evaluationScope": "implementation_checkpoint_validity",
    "background": "Describe the intended behavior and relevant diff.",
    "acceptanceCriteria": ["Behavior matches the plan", "Errors are surfaced"],
    "verification": ["Request validation completed before submission"],
    "knownConstraints": ["No unrelated files"],
    "outputRequirement": "Choose one listed choice. For a reason choice, give a case-specific finding, affected location or requirement, observed evidence, and either a concrete proposed fix or exact additional evidence needed. Do not invent details."
  },
  "questions": {
    "implementation": {
      "type": "choice",
      "instructions": "Does the supplied evidence support the implementation against the acceptance criteria? Return a probability distribution over the listed choices.",
      "criteria": {
        "valid_as_defined": "The supplied evidence supports acceptance as defined.",
        "requirements_mismatch": "Requirements conflict with intended behavior; identify the requirement and correction.",
        "missing_prerequisites_info": "Prerequisite information is missing; identify exactly what is needed.",
        "incomplete_implementation_info": "Implementation information is incomplete; identify missing details or evidence.",
        "implementation_issue": "An implementation issue exists; identify its location, evidence, and correction.",
        "scope_violation": "The proposal exceeds or falls outside the agreed scope; identify the boundary and adjustment.",
        "other": "A material concern does not fit the categories; identify its location, evidence, and fix or needed evidence.",
        "indeterminate": "The supplied context cannot support a judgment; identify missing context if possible."
      }
    }
  }
}
```

For a plan review, set `evaluationScope` to `plan_validity`, describe the plan in `background`, and adapt criteria to the plan. The client stores the selected choice's confidence and full probability distribution, including the probability assigned to `valid_as_defined` as `passProbability`.

## API request and response shape

The wire request contains only the API fields, for example:

```json
{
  "model": "jev-latest",
  "state": {},
  "questions": {}
}
```

The API response has the typed shape `{ model, answers, usage }`; use the OpenAPI schema for the types and precise answer and usage fields. A `422` response is a request validation error, not a judgment. The client preserves raw responses and local request/result metadata in its output envelope.
