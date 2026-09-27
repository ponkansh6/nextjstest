# B3m untouched-38 plan review context (derived)

## Scope

Prepare an initial v3 `plan_validity` review of the proposal to implement every untouched eligible Plan45 scenario before one consolidated E2E. The plan is bounded to component-local assertions with explicitly retained production integration checks.

## Accounting and corrected shared coverage

Final MAP totals remain `A=123`, `E=90`, `M(full)=1`: 51 partial eligible rows + one fully migrated row + 38 untouched eligible rows. Row `p45-b-mobile-ux-201-lazymount-p5-1` is partial/shared local coverage because existing JEV-approved B3k test `tests/browser-mode/LazyMount.browser.test.tsx` exercises actual LazyMount child absence followed by presence after native browser scroll. It does not cover production-route P42-349/-350. P42-351 is the separate `__MOUNT_ALL__` force-mount assertion and is already unit-owned; it receives no credit from the B3k test.

## Proposed 38-row roster

- `p45-a-a11y-info-outside-click`
- `p45-a-advanced-series-normal`
- `p45-a-cagr-sheet-01`
- `p45-a-cpi-sections`
- `p45-b-consumption-boundary-85-768px-desktop-chromium-768px-viewport-overflow`
- `p45-b-consumption-boundary-85-768px-desktop-chromium-769px-viewport-overflow`
- `p45-b-consumption-mobile-acceptance-187-mobile-pixel-acceptance-plan25-openspec-375x667-tooltip`
- `p45-b-consumption-mobile-readability-191-375px-tooltip-6-viewport`
- `p45-b-consumption-mobile-readability-191-430px-tooltip-6-viewport`
- `p45-b-mobile-ux-243-sectiontabs-sticky-android-chrome`
- `p45-b-mobile-ux-47-ux-375px`
- `p45-b-mobile-ux-65-ux-320px-overflow`
- `p45-b-mobile-ux-65-ux-375px-overflow`
- `p45-b-mobile-ux-65-ux-390px-overflow`
- `p45-b-mobile-ux-65-ux-430px-overflow`
- `p45-b-plan24-rendering-71-plan24-rendering-contract-cti-2005-2017-2018-legacy-gdp`
- `p45-b-plan24-rendering-88-plan24-rendering-contract-2025q1-q4-csv-tooltip`
- `p45-b-range-change-119-e2e`
- `p45-b-range-change-136-e2e`
- `p45-b-range-change-153-e2e`
- `p45-b-range-change-170-e2e`
- `p45-b-range-change-242-e2e`
- `p45-b-range-change-273-e2e`
- `p45-b-section-tabs-scroll-120-case02-webkit`
- `p45-b-section-tabs-scroll-127-case02-webkit`
- `p45-b-section-tabs-scroll-142-mask-image-webkit`
- `p45-b-section-tabs-scroll-47-3-chromium`
- `p45-b-section-tabs-scroll-47-3-webkit`
- `p45-b-section-tabs-scroll-47-case02-chromium`
- `p45-b-section-tabs-scroll-47-case04-webkit`
- `p45-b-section-tabs-scroll-47-case05-webkit`
- `p45-b-section-tabs-scroll-82-3-chromium`
- `p45-b-section-tabs-scroll-82-3-webkit`
- `p45-b-section-tabs-scroll-82-case01-chromium`
- `p45-b-section-tabs-scroll-82-case02-chromium`
- `p45-b-section-tabs-scroll-82-case04-webkit`
- `p45-b-section-tabs-scroll-82-case05-webkit`
- `p45-b-tooltip-stack-total-108-e2e-t9-cpi-section-stacked-tooltip-total`

Group counts are controls/series/render data 7, responsive/mobile 11, range changes 6, and SectionTabs/WebKit 14, totaling 38.

## Component slices and E2E boundaries

- **Controls/series/render data:** outside click is P42-018 only; preserve scroll/route P42-019. Advanced-series uses the actual production registry in `NewGraph` for P42-024–032; retain URL/query and route wiring. CAGR 01 is limited to its component dialog predicate P42-041. CPI sections checks visible labels and an actual Recharts area path, but has no immutable P42 mapping; record the source-callsite crosswalk as unmapped/repair-needed, do not invent P42-262, and retain all source E2E. Plan24 71 covers only line-absent rendering P42-361; Plan24 88 covers tooltip fixture P42-383/-384/-385; retain route/data/CSV. Stacked tooltip T9 covers P42-597/-598 only; retain route-fed production content/stacking integration.
- **Responsive/mobile:** 768/769 component CSS predicates map to P42-149/-150; retain document overflow. Row187 is a bounded tooltip slice P42-223..229/-231. The two readability rows cover their component content predicates only; retain production route/data, typography, and viewport checks. Sticky SectionTabs checks P42-352 transform/compositing style only; retain Android Chrome route behavior. Mobile UX overflow measures actual CpiChart `.chartContainer` width/overflow at 320/375/390/430px; document-root overflow remains E2E.
- **Range change:** rows 119/136/153/170 check actual chart output after range selection; preserve route state and URL assertions. Row242 uses an actual CpiChart range-change component fixture that captures `window` `error` and `unhandledrejection` events during range interaction and asserts neither occurs; this transfers only the local component event assertion, while the production Playwright `pageerror` smoke (P42-474) remains. Row273 covers only scroll-preservation P42-476; retain route integration.
- **SectionTabs/WebKit:** add targeted WebKit Browser Mode configuration/include and run only selected WebKit cases. Current configuration is Chromium-only. The environment has Vitest/@vitest/browser-playwright 4.1.11, Playwright 1.62.1, WebKit revision 2336. Keep mounted-nav P42-501 scroll delta local and P42-502 route-in-viewport E2E; keep lazy P42-503 initial-absent local and P42-504 production reveal E2E. Preserve route/layout and WebKit guarantees not covered by local style/scroll predicates.

## Gate

For all 38 rows, implement and run focused Browser Mode checks and complete independent diff review before the single consolidated E2E. Keep Playwright assertions until their exact local replacements pass review. New slices remain partial unless the complete stable scenario transfers. Do not run E2E early. This is a plan only: no B3m implementation or verification is claimed.

## JEV status

The initial v3 plan request is saved in `jev-b3m-untouched38-plan-request.json`. It is pending parent review/submission; no JEV call has been made. No response or verdict exists yet.
