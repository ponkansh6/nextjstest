# Plan45 Phase3 Batch1 initial JEV v3 plan checkpoint

## Result

- API status: HTTP 200; model `jev-1.13.0`. The response keys, choice labels, confidence values and probability distributions passed shape/range validation.
- Primary verdict: `valid_as_defined` (confidence 0.93; selected-choice probability 0.95). `valid_as_defined` is the only pass label.
- JEV recommends approving this one-scenario pre-implementation plan and proceeding to implementation. This does not mean the scenario has been migrated; P42-021 must remain until its Browser Mode replacement is green and the required crosswalk updates are complete.
- No clarification was sent because the primary verdict was `valid_as_defined`.

| Field                           | Choice                         | Confidence | Selected probability | Full distribution                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------ | ---------: | -------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan validity                   | `valid_as_defined`             |       0.93 |                 0.95 | `valid_as_defined=0.95, incomplete_implementation_info=0.00, other=0.00, scope_violation=0.01, requirements_mismatch=0.03, implementation_issue=0.00, missing_prerequisites_info=0.00, indeterminate=0.01`                                                                                                       |
| Finding                         | `no_case_specific_finding`     |       0.75 |                 0.78 | `no_case_specific_finding=0.78, removal_gate_inadequate=0.00, component_browser_mode_mismatch=0.00, retained_case_scope=0.00, scope_or_baseline_mapping=0.18, user_boundary_violation=0.00, e2e_contract_mischaracterized=0.00, other_concrete_finding=0.01, spec_update_gap=0.00, user_event_keyboard_gap=0.03` |
| Affected location / requirement | `none`                         |       0.51 |                 0.56 | `p42_ledger_matrix=0.02, vitest_keyboard_api=0.04, scenario_inventory=0.01, other=0.01, phase5_boundary=0.00, no_actions_boundary=0.01, component_source_unit=0.00, batch1_plan=0.22, openspec=0.01, none=0.56, current_e2e=0.12`                                                                                |
| Evidence assessment             | `facts_support_plan`           |       0.94 |                 0.96 | `removal_gate_correct=0.00, facts_support_plan=0.96, official_api_supports_escape=0.00, evidence_conflict=0.00, specific_missing_evidence=0.00, preserved_boundaries=0.01, insufficient=0.00, unit_escape_is_simulated=0.00, m_accounting_ambiguous=0.01, current_e2e_only_hidden=0.02`                          |
| Next action                     | `approve_batch1_and_implement` |       0.97 |                 0.98 | `retain_p42_021_in_playwright_only=0.00, collect_exact_api_evidence_only=0.01, approve_batch1_and_implement=0.98, hold_for_scope_decision=0.01, revise_batch_plan_only=0.00, revise_openspec_only=0.00`                                                                                                          |
| Remaining uncertainty           | `vitest_411_escape_unverified` |       0.50 |                 0.58 | `vitest_411_escape_unverified=0.58, m_temporal_point=0.00, crosswalk_pending=0.00, phase5_scope=0.00, other_specific_uncertainty=0.00, none_for_preimplementation_plan=0.39, route_escape_not_retained=0.03`                                                                                                     |

## Finding and uncertainty

- The selected finding is `no_case_specific_finding`; affected location is `none`; evidence is `facts_support_plan` (confidence 0.94, selected probability 0.96).
- JEV selected `vitest_411_escape_unverified` as remaining uncertainty (confidence 0.50, selected probability 0.58). The Phase3 plan correctly leaves this as a required implementation-time Browser Mode run, not as already proven by the rolling docs. The plan checkpoint is approved; the exact test is not yet implemented or executed.
- The response assigns 0.18 probability to `scope_or_baseline_mapping` and 0.22 to the `batch1_plan` affected location, but selected no issue. Its selected evidence assessment gives 0.01 to `m_accounting_ambiguous`; current Phase0 M=0, while the Batch1 plan lists planned A=123/E=90/M=1. The plan describes these as planned values, not a fresh recalculation. JEV did not identify a concrete defect; keep the migration count recalculation in the post-green crosswalk gate.

## Source and plan facts supplied

- `p45-a-a11y-info-escape` maps to immutable `P42-021`, is Phase0 MAP-eligible (`eligible_component_or_dom_interaction`), and is not among the 33 deferred IDs.
- Current `tests/e2e/accessibility.e2e.spec.ts:243-256` navigates to the production route, clicks the data-source trigger, presses Escape, waits, and asserts that the dialog is hidden. It has no explicit pageerror assertion or pre-Escape dialog-visible assertion. P42-020 was the removed pre-Escape visibility assertion; it must not be reintroduced.
- The existing `ChartInfoButton` component test uses simulated `fireEvent.keyDown(document, {key:"Escape"})` and asserts dialog removal. The planned Browser Mode scenario mounts real `ChartInfoButton` with static children through `renderBrowserComponent`, opens the dialog, sends Chromium Escape through `userEvent.keyboard("{Escape}")`, and asserts hidden/aria-expanded false.
- The production route Escape/focus integration is not established by the proposed component mount and is explicitly disclosed. Keep P42-018 outside-click/scroll Playwright coverage unchanged.
- Keep P42-021 until Browser Mode is implemented and green, then remove only that E2E case and update scenario inventory, Plan42 responsibility matrix, Plan42 assertion ledger, and OpenSpec. No GitHub Actions change. Continue deferring the 33 MAP-ineligible individual reviews to Phase5.

## Official Vitest documentation and version boundary

- [Vitest Browser Mode guide](https://vitest.dev/guide/browser/) documents native browser execution and provider setup.
- [Vitest Interactivity API](https://vitest.dev/api/browser/interactivity) documents provider-backed `userEvent` and lists Escape in `userEvent.keyboard` syntax.
- [Vitest browser locators](https://vitest.dev/api/browser/locators) documents locator APIs and assertions.
- Repository pins Vitest and `@vitest/browser-playwright` to 4.1.11; these official pages are rolling docs and are not exact patch-tag snapshots. The exact keyboard scenario remains to be run under pinned 4.1.11 during implementation. The plan correctly treats that as a later green gate before removing P42-021.

## API / credentials

Submitted directly via TypeSafe `POST /v1/systemone` using official API schema `model`, `state`, keyed `questions` with choice `criteria`; official reference: https://api.typesafe.ai/docs. The API key was loaded in memory and sent only in the Authorization header; it is absent from saved artifacts.
