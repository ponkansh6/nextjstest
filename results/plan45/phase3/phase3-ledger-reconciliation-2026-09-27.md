# Plan 45 Phase 3 ledger reconciliation — 2026-09-27

## Status

Phase 3 ledger reconciliation is complete. This is a current accounting view built from the frozen Phase 0 inventory, the Phase 2 scenario/predicate crosswalk, completed independent reviews, and the latest verification recorded in the Phase 4 checkpoint. Historical counters remain unchanged in their original checkpoint records.

## Reconciled counts

| Measure                        | Current | Basis                                                                                                                                                                                 |
| ------------------------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — active logical scenarios   |     123 | Phase 0 stable-ID inventory; IDs are counted once.                                                                                                                                    |
| E — MAP-eligible scenarios     |      90 | Current Phase 0 MAP audit: 90 eligible, 33 ineligible/deferred, 0 unresolved.                                                                                                         |
| M — fully migrated scenarios   |      84 | Prior completed `p45-a-a11y-info-escape` (P42-021) plus 83 whole-scenario transfers from the 89-row Phase 2 roster.                                                                   |
| Phase 2 whole-scenario partial |       6 | Rows #12, #30, and #70–73. Their original Playwright predicates remain incomplete in Browser Mode.                                                                                    |
| Phase 2 roster rows            |      89 | 83 whole-scenario full + 6 whole-scenario partial. The roster's `Verified/full` label means its mapped eligible predicate slice passed; it does not assert whole-scenario completion. |
| Phase 5 active investigations  |      33 | MAP-ineligible rows; remain deferred for individual investigation under Phase 5.                                                                                                      |

`M/A = 84/123 = 68.29%`, which clears the strict `M/A > 0.50` gate. For A=123, the minimum passing integer M is 62. The 10 B3i assertion-slice rows are partial transfers that overlap the 89-row Phase 2 roster; they are not additional scenarios and do not increment M.

## Phase 2 roster crosswalk at whole-scenario granularity

Independent source reviews and the final row-by-row predicate crosswalk support these whole-scenario groups:

- Rows #1–11 and #13–29: 28 whole-scenario full.
- Rows #31–60: 30 whole-scenario full.
- Rows #61–69 and #74–89: 25 whole-scenario full.
- Total whole-scenario full: 83/89. These are scenarios whose original Playwright E2E predicates are no longer retained, whose production-route Browser Mode destinations pass, and whose ownership change received independent review.

The Phase 2 batch roster still uses `Verified/full` for its scoped mapped predicate slice. That historical vocabulary is retained, but global M uses the stricter whole-scenario definition above.

### Six rows not counted in M

| Roster row | Stable ID / source                                  | Remaining Playwright predicate or gap                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------: | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|        #12 | `p45-a-earnings-hover`                              | Crosswalk correction: #12 owns P42-287–290 and the source `expectBrowserSeparatorStyle` computed-DOM border assertion (`tests/e2e/earnings-tooltip-total.e2e.spec.ts:49–55`, called at line 67); that helper assertion had no separate P42 callsite ID. P42-297 is the distinct evidence-row border assertion in the hidden-series scenario (#13), not part of #12. The production-route Browser Mode batch1 wrapper asserts the computed separator border for #12. |
|        #30 | `p45-b-tooltip-dismiss-578-chromium-escape-dismiss` | Playwright retains Escape-dismiss plus rehover and outside-dismiss assertions. Browser Mode overlaps only a subset; the scenario is not wholly transferred.                                                                                                                                                                                                                                                                                                         |
|        #70 | `p45-b-range-change-119-e2e`                        | Browser Mode destination checks counts/dimensions but does not preserve the source “first bar remains visible” assertion.                                                                                                                                                                                                                                                                                                                                           |
|        #71 | `p45-b-range-change-136-e2e`                        | Same missing “first bar remains visible” source predicate.                                                                                                                                                                                                                                                                                                                                                                                                          |
|        #72 | `p45-b-range-change-153-e2e`                        | Same missing “first bar remains visible” source predicate.                                                                                                                                                                                                                                                                                                                                                                                                          |
|        #73 | `p45-b-range-change-170-e2e`                        | Same missing “first bar remains visible” source predicate.                                                                                                                                                                                                                                                                                                                                                                                                          |

These six remain partial until the missing predicate is added and reviewed, or their whole-scenario transfer status is otherwise resolved with source evidence. No current record claims they are complete.

## Mapping and historical discrepancies resolved

- Row #61 maps to `tests/e2e/consumption-mobile-acceptance.e2e.spec.ts:187`, P42-193..201. A prior B3m note incorrectly suggested readability P42-223..229/-231 provenance. The roster row now records the acceptance source and flags the previous attribution as stale.
- The component-test name mentioning row187 does not change the mapped stable ID: the relevant test is named for row187, while the assertion mapping is P42-469 and the production route case is row200. The row187 label is a historical/test naming mismatch, not evidence that P42-469 belongs to row187. P42-469 is accounted under `p45-b-range-change-200-e2e-2`; P42-467/-468 production interactions and URL checks remain E2E-owned.
- B3i's ten assertion slices overlap Phase 2 roster scenarios. They are assertion-level partial transfers and do not add ten to A, E, or M.
- Historical B3i cadence result `10/10`, E2E `115 passed / 19 skipped`, predates the final route repair. It remains a historical checkpoint only; latest post-repair executions are recorded in the Phase 4 checkpoint.
- The 33 MAP-ineligible IDs remain a Phase 5 investigation inventory and are not silently removed from A or treated as migration failures.

## Evidence trail

- [Phase 0 scenario inventory](../phase0/scenario-inventory.md) and [current MAP audit](../phase0/jev-api-eligibility-audit-derived.md): A=123; E=90; 33 ineligible; 0 unresolved.
- [Phase 2 roster](../phase2/full-migration-roster.md): 89 stable IDs, source predicates, Browser Mode destinations, batch verification and independent review references; row #61 corrected above.
- [Phase 2 completion record](../phase2/full-migration-plan.md): scoped 89-row delivery and historical gates.
- [B3i batch 1 review](jev-api-phase3-batch3i-batch1-implementation-checkpoint-derived.md), [batch 2 review](jev-api-phase3-batch3i-batch2-implementation-checkpoint-derived.md), and [batch 3 review](jev-api-phase3-batch3i-batch3-implementation-checkpoint-derived.md): independent review passed for the nine partial assertion slices before the final tenth slice.
- [Phase 3 final migration checkpoint](jev-api-phase3-final-migration-implementation-checkpoint-derived.md): historical pre-route-repair full Browser Mode and E2E verification; not used as latest test evidence.
- [Phase 3/4 plan review](jev-plan45-phase3-phase4-plan-review-report.md): JEV `valid_as_defined`, confidence 0.62, passProbability 0.67. This reviewed the proposed execution plan only and did not review implementation or the reconciled ledger.
- [Phase 4 current checkpoint](../phase4/phase4-verification-checkpoint-2026-09-27.md): B3i crosswalk and latest post-repair validation.

## Completion decision

Phase 3 is complete: each active scenario is accounted for in A; the MAP result supplies E; the stricter row-level whole-scenario crosswalk supplies M; all known roster and historical discrepancies are explained; and all six partial rows plus the 33 Phase 5 investigations remain explicit. The completion does not mean Plan 45 overall is complete: Phase 5 investigations and Phase 6 CI/runtime and flake comparison remain open.
