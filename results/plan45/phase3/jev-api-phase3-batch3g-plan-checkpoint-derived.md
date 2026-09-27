# Plan45 B3g plan checkpoint — derived context

Status: JEV v3 initial `plan_validity` checkpoint passed `valid_as_defined`; diagnosis complete; no follow-up.

## Proposed two-case partial slice

B3g proposes exactly two Browser Mode cases for `p45-b-range-change-215-e2e`:

- P42-471: change the start year through the actual `CpiChart`/`ChartFilters` interaction and assert the actual `BottomSheet` closes.
- P42-473: in a separate fresh case, change the end year through the same real component chain and assert the sheet closes.

P42-470/-472 pre-change select visibility remains in Playwright. The live route, URL serialization, filtered data, chart rendering, and other range-change integration checks remain E2E. These are partial assertion slices; `A=123`, `E=90`, `M=1` remains unchanged.

`CpiChart` consumes Next `useSearchParams` through `useUrlState`. An explicit adapter for that hook is conditional on a standalone Browser Mode mount requiring it, and its implementation is intentionally undecided at the plan checkpoint. If needed, the adapter must remain narrow; it cannot mock CpiChart, ChartFilters, BottomSheet, range handlers, or sheet state. Each independent case must begin with fresh `window.history`/query state because `useUrlState` synchronizes through `history.replaceState`.

## Cadence

B3f leaves the cumulative counter at 18/20. B3g adds two; after both cases pass focused Browser Mode verification, independent review, and implementation JEV, the counter reaches 20/20 and permits one consolidated retained-E2E regression. No E2E is run before those gates.

## JEV result

The stored response request identity matches the submitted request; local response validation is valid. JEV selected `valid_as_defined`, confidence 0.60, pass probability 0.66. Distribution: `valid_as_defined` 0.66, `incomplete_implementation_info` 0.20, `missing_prerequisites_info` 0.10, `indeterminate` 0.03, `scope_violation` 0.01, all other listed criteria 0. Diagnosis is complete; no follow-up was recommended. The selected criterion passes the plan gate. The lower confidence and incomplete-information probability remain part of the historical result; do not treat them as a follow-up or as fixture implementation evidence. No implementation or test result is claimed.

- Request SHA-256: `8e468390c61994ade642b2cafb9acdf98ec4e210111f76cf576762738e65cc17`
- Response SHA-256: `ab66aeed463d907362820cbfbcdff8d93f10206d18dc9a1104316ca1452953b1`
