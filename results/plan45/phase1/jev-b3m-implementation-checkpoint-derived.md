# B3m implementation checkpoint context (draft; consolidated E2E pending)

This v3 implementation checkpoint covers the 38-row B3m implementation. It asks JEV to review the final local/E2E boundaries and does not claim full migration or consolidated E2E success.

## Scope and accounting

The exact 38 stable IDs remain the roster under “Untouched eligible roster” in `shared_plan/45-vitest-browser-mode-e2e-migration-plan.md`. Each has local component-level Browser Mode coverage and is a partial row only. Provisional accounting is `A=123/E=90/M=1`, decomposed as **89 partial + 1 full + 0 untouched**. This is provisional pending JEV review and the single consolidated E2E gate. None of the 38 is a full migration. Row201 `p45-b-mobile-ux-201-lazymount-p5-1` stays in prior partial coverage and outside the B3m roster: production P42-349/-350 remain E2E-owned and P42-351 remains unit-owned.

The focused test files are `tests/browser-mode/B3m-controls-series-render.browser.test.tsx`, `B3m-responsive-mobile.browser.test.tsx`, `CpiChart-range-change.browser.test.tsx`, and `SectionTabsB3m.browser.test.tsx`.

## Focused evidence

- Chromium config rerun after the B3m type fixes: **29 passed, 9 skipped** (the nine WebKit-specific cases), exit 0.
- Targeted WebKit config rerun after the B3m type fixes: **9 passed, 5 skipped** (the five Chromium-only cases), exit 0.
- Configs: `vitest.browser.config.ts` and `vitest.browser.webkit.config.ts`.
- No consolidated B3m E2E has been run.
- `pnpm run type-check` exits 2. B3m files have no remaining type errors; failures remain only in existing `CpiChart-single-year`, `EarningsBreakdownChart`, `MonthlyBoundaryAxis`, `SpendingBarChart-mobile`, `SpendingBarChart-readability`, `SpendingBarChart-tooltip-dismiss`, `SpendingBarChart-tooltip-rehover`, `SpendingBarChart-tooltip-scroll`, `SpendingBarChart-tooltip-total`, `SpendingBarChart`, and `legend-color-token` Browser Mode specs. Reported categories include Locator typing, implicit `any`, `strokeOpacity`, `?raw`, and `CpiData` errors. The orchestrator reran type-check after the B3m fixes and confirmed this scope; type-check is not passing.

## Stable scenario → Browser Mode test crosswalk

The focused pass counts above are aggregate runs. This exact roster crosswalk links each eligible ID to its current test title so the individual slices can be reviewed:

| Stable scenario ID                                                                                | Browser Mode file and test title                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `p45-a-a11y-info-outside-click`                                                                   | `B3m-controls-series-render.browser.test.tsx` — `p45-a-a11y-info-outside-click`           |
| `p45-a-advanced-series-normal`                                                                    | `B3m-controls-series-render.browser.test.tsx` — `p45-a-advanced-series-normal`            |
| `p45-a-cagr-sheet-01`                                                                             | `B3m-controls-series-render.browser.test.tsx` — `p45-a-cagr-sheet-01`                     |
| `p45-a-cpi-sections`                                                                              | `B3m-controls-series-render.browser.test.tsx` — `p45-a-cpi-sections`                      |
| `p45-b-plan24-rendering-71-plan24-rendering-contract-cti-2005-2017-2018-legacy-gdp`               | `B3m-controls-series-render.browser.test.tsx` — `p45-b-plan24-rendering-71`               |
| `p45-b-plan24-rendering-88-plan24-rendering-contract-2025q1-q4-csv-tooltip`                       | `B3m-controls-series-render.browser.test.tsx` — `p45-b-plan24-rendering-88`               |
| `p45-b-tooltip-stack-total-108-e2e-t9-cpi-section-stacked-tooltip-total`                          | `B3m-controls-series-render.browser.test.tsx` — `p45-b-tooltip-stack-total-108`           |
| `p45-b-consumption-boundary-85-768px-desktop-chromium-768px-viewport-overflow`                    | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-consumption-boundary-85-768`            |
| `p45-b-consumption-boundary-85-768px-desktop-chromium-769px-viewport-overflow`                    | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-consumption-boundary-85-769`            |
| `p45-b-consumption-mobile-acceptance-187-mobile-pixel-acceptance-plan25-openspec-375x667-tooltip` | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-consumption-mobile-acceptance-187`      |
| `p45-b-consumption-mobile-readability-191-375px-tooltip-6-viewport`                               | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-consumption-mobile-readability-191-375` |
| `p45-b-consumption-mobile-readability-191-430px-tooltip-6-viewport`                               | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-consumption-mobile-readability-191-430` |
| `p45-b-mobile-ux-243-sectiontabs-sticky-android-chrome`                                           | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-mobile-ux-243`                          |
| `p45-b-mobile-ux-47-ux-375px`                                                                     | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-mobile-ux-47-375`                       |
| `p45-b-mobile-ux-65-ux-320px-overflow`                                                            | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-mobile-ux-65-320`                       |
| `p45-b-mobile-ux-65-ux-375px-overflow`                                                            | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-mobile-ux-65-375`                       |
| `p45-b-mobile-ux-65-ux-390px-overflow`                                                            | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-mobile-ux-65-390`                       |
| `p45-b-mobile-ux-65-ux-430px-overflow`                                                            | `B3m-responsive-mobile.browser.test.tsx` — `p45-b-mobile-ux-65-430`                       |
| `p45-b-range-change-119-e2e`                                                                      | `CpiChart-range-change.browser.test.tsx` — `p45-b-range-change-119-e2e`                   |
| `p45-b-range-change-136-e2e`                                                                      | `CpiChart-range-change.browser.test.tsx` — `p45-b-range-change-136-e2e`                   |
| `p45-b-range-change-153-e2e`                                                                      | `CpiChart-range-change.browser.test.tsx` — `p45-b-range-change-153-e2e`                   |
| `p45-b-range-change-170-e2e`                                                                      | `CpiChart-range-change.browser.test.tsx` — `p45-b-range-change-170-e2e`                   |
| `p45-b-range-change-242-e2e`                                                                      | `CpiChart-range-change.browser.test.tsx` — `p45-b-range-change-242-e2e`                   |
| `p45-b-range-change-273-e2e`                                                                      | `CpiChart-range-change.browser.test.tsx` — `p45-b-range-change-273-e2e`                   |
| `p45-b-section-tabs-scroll-120-case02-webkit`                                                     | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-120-case02-webkit`         |
| `p45-b-section-tabs-scroll-127-case02-webkit`                                                     | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-127-case02-webkit`         |
| `p45-b-section-tabs-scroll-142-mask-image-webkit`                                                 | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-142-mask-image-webkit`     |
| `p45-b-section-tabs-scroll-47-3-chromium`                                                         | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-47-3-chromium`             |
| `p45-b-section-tabs-scroll-47-3-webkit`                                                           | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-47-3-webkit`               |
| `p45-b-section-tabs-scroll-47-case02-chromium`                                                    | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-47-case02-chromium`        |
| `p45-b-section-tabs-scroll-47-case04-webkit`                                                      | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-47-case04-webkit`          |
| `p45-b-section-tabs-scroll-47-case05-webkit`                                                      | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-47-case05-webkit`          |
| `p45-b-section-tabs-scroll-82-3-chromium`                                                         | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-82-3-chromium`             |
| `p45-b-section-tabs-scroll-82-3-webkit`                                                           | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-82-3-webkit`               |
| `p45-b-section-tabs-scroll-82-case01-chromium`                                                    | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-82-case01-chromium`        |
| `p45-b-section-tabs-scroll-82-case02-chromium`                                                    | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-82-case02-chromium`        |
| `p45-b-section-tabs-scroll-82-case04-webkit`                                                      | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-82-case04-webkit`          |
| `p45-b-section-tabs-scroll-82-case05-webkit`                                                      | `SectionTabsB3m.browser.test.tsx` — `p45-b-section-tabs-scroll-82-case05-webkit`          |

The targeted Browser Mode files are split 24 Chromium titles and 14 SectionTabs Chromium/WebKit titles; the WebKit run skips the five Chromium-only SectionTabs cases. Scenario wording “partial” denotes local coverage while retained production assertions continue to own the route boundary.

## Reviewed E2E boundary and retained assertions

The final independent E2E diff audit is clean after restoration. The B3m component fixtures do not establish production route payloads, server/client wiring, or page geometry. Retained production guarantees include:

- Rows 119/136/153/170 keep route-to-SVG first-bar visibility assertions after range selection; local component tests are additive because they do not prove production route data wiring.
- P42-474 route-level `pageerror` smoke remains; P42-479/-480 max-range selected start/end values remain read back from the production controls.
- P42-231's mixed content and measurement predicate remains E2E. Readability separator/borderTop and viewport measurements remain E2E.
- Document-level overflow remains E2E for mobile UX rows 47/65 at 320/375/390/430px; local tests check only actual `CpiChart` `.chartContainer` overflow.
- Production WebKit E2E remains for route/engine behavior. The targeted WebKit Browser Mode config does not duplicate the full Browser Mode suite.
- The mobile row187 transfer is limited to local tooltip close/content predicates P42-223..229; production touch, measurement, and viewport integration remain.
- The 768/769 boundary transfers only component CSS predicates P42-149/-150. Plan24 transfers only P42-361 and P42-383/-384/-385; route/data/table/CSV guarantees remain.
- Spending-filter production bar-count reduction remains. No change beyond its aria-only P42-511 slice is claimed.
- P42-018 has no corresponding source E2E assertion in the current diff, so local outside-click coverage is additive and no P42-018 transfer is claimed.

## CPI sections mapping gap

The local `CpiChart` test checks section labels and a rendered Recharts area path. This is additive component coverage. Its source P42 callsite mapping is repair-required/unmapped. Do not invent P42-262, which is the unit-owned legend-loop assertion; retain source E2E.

## Explicit T9 prior-JEV conflict for review

Prior `results/plan42/p42-599-final-jev.json` approved keeping P42-593..598 in E2E, specifically P42-598 live total visibility, because a component fixture does not prove production route/Recharts payload wiring. B3m's actual `StackedAreaChart` fixture now checks hover, 12 rows, and visible total as additive component evidence. Current production T9 retains P42-597/-598, including P42-598 live total visibility. B3m does not claim either production predicate transferred or silently supersede the prior approval. Ask JEV to review this boundary change from planned transfer to additive local coverage and confirm whether the row may count as a partial while P42-597/-598 remain E2E-owned, or whether separate revalidation is needed. This checkpoint does not authorize removing those E2E assertions.

## Requested judgment

Evaluate whether the 38 local partial slices, current retained E2E assertions, focused Chromium/WebKit reruns, known type-check failure in existing/non-B3m specs, and CPI/T9 constraints support this implementation checkpoint. The consolidated E2E remains the next gate; do not count it as run or passed.
