# B3m final implementation checkpoint

## Final status

All 38 B3m roster IDs have local component-level Browser Mode coverage and count as partial coverage only. None is fully migrated. Final MAP accounting is `A=123/E=90/M=1`, decomposed as **89 partial + 1 full + 0 untouched**. Row201 remains a prior partial and is outside the 38-row B3m roster.

## Retrospective primary-cause grouping of the 89 partial rows

This is a **post-hoc analysis**, not a canonical tag system. Each partial row is assigned exactly one primary cause based on the E2E boundary that remains responsible for its integration guarantee:

| Primary retained E2E boundary   | Partial rows |
| ------------------------------- | -----------: |
| Route/data/chart integration    |           22 |
| Interaction/focus/controller    |           11 |
| Viewport/layout/mobile geometry |           25 |
| Tooltip/hover/touch             |           12 |
| SectionTabs/engine/scroll       |           19 |
| **Total**                       |       **89** |

The prior 51 partial rows and the B3m 38 rows are disjoint in this tally; no row is counted twice. T9 is counted once in the B3m additions. The stable B3m roster is listed in the [Plan45 migration plan](../../../shared_plan/45-vitest-browser-mode-e2e-migration-plan.md).

## Verification and review

- Focused Chromium rerun: 29 passed, 9 skipped (the nine WebKit-specific cases), exit 0.
- Targeted WebKit rerun: 9 passed, 5 skipped (the five Chromium-only cases), exit 0.
- Final independent E2E diff audit: clean after route/assertion restorations.
- `pnpm run lint:fast`: passed.
- `pnpm run type-check`: exit 2. B3m files have no remaining errors. Failures remain only in prior Browser Mode specs: `CpiChart-single-year`, `EarningsBreakdownChart`, `MonthlyBoundaryAxis`, `SpendingBarChart-mobile`, `SpendingBarChart-readability`, `SpendingBarChart-tooltip-dismiss`, `SpendingBarChart-tooltip-rehover`, `SpendingBarChart-tooltip-scroll`, `SpendingBarChart-tooltip-total`, `SpendingBarChart`, and `legend-color-token`; reported categories include Locator typing, implicit `any`, `strokeOpacity`, `?raw`, and `CpiData` errors.
- Consolidated `E2E_PORT=3101 pnpm run test:e2e`: **117 passed, 19 skipped, 0 failed**. Port 3100 had an unidentifiable listener; it was left untouched, and E2E used 3101.
- JEV implementation checkpoint: `valid_as_defined`, confidence `.39`, passProbability `.47`; diagnosis complete, no follow-up. Historical request/result are preserved in `jev-b3m-implementation-checkpoint-request.json` and `jev-b3m-implementation-checkpoint-result.json`.

## Retained integration boundaries

All B3m additions remain local partial coverage. T9's fixture-based hover, row-count, and visible-total checks are additive. Production P42-597/-598 remain E2E-owned per the prior P42-599 review, including P42-598 live total visibility; P42-599 row count was transferred previously. CPI section local labels/area-path coverage remains additive with its source mapping repair-required; no P42-262 mapping is invented. P42-018 has no corresponding source E2E assertion, so no transfer is claimed. Production route/data, viewport/document overflow, range output, error smoke, selected max-range values, mixed content/measurement, and WebKit guarantees remain as recorded in the plan and inventory.
