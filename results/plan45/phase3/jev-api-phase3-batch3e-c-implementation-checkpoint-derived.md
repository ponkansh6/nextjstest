# Plan45 B3e-c implementation checkpoint — derived context

Status: JEV v3 initial implementation checkpoint passed; diagnosis complete; no follow-up.

## Focused evidence and implementation

`tests/browser-mode/SpendingBarChart-tooltip-scroll.browser.test.tsx` passed 6/6 for nominal and real charts at 375×667, 320×480, and 667×375. Independent review confirms actual `useChartTooltipController({ suppressed: false, isTouch: true })` wiring and chart handlers, ordinary controller activation, production `CustomTooltip` placement without manual wrapper placement, production 21 nominal / 11 real expense keys, 84 deterministic quarters, and production-equivalent parent widths.

## Exact assertion ownership

The source audit narrowed the original broader proposed tooltip transfer. Browser Mode takes only these six mapped expectation groups for both variants across the three viewports:

- P42-246: computed `overflowY` is `auto`
- P42-247: computed `maxHeight` is positive
- P42-248: computed bottom padding is at least 10px
- P42-250: `scrollHeight > clientHeight`
- P42-255: scrolling reaches the end within 1px
- P42-256: the close control is visible after scrolling

Playwright retains P42-241–244 (route/visibility, controller activation, tooltip content and key mapping), P42-251–254 (absolute tooltip viewport bounds), P42-257–260 (close-button bounds), and P42-261 (after-close hidden state). P42-245 is already unit-owned; P42-249 is not a current E2E assertion and remains unit-owned. Thus the component tests do not claim route, payload, absolute positioning, close-button bounds, or post-close behavior.

The initial B3e plan proposed more tooltip geometry. Exact source mapping and Oracle review narrowed it to preserve absolute viewport and close-button guarantees in Playwright. These are partial transfers; `A=123`, `E=90`, `M=1` is unchanged.

## Cadence and deferred work

B3e-c adds six named cases to the prior 10/20 counter, reaching 16/20 since the last consolidated E2E. No E2E was run. The preceding B3e-b Earnings viewport cases remain deferred because their candidate used hover/custom placement while mobile production uses click/fixed-wrapper placement and there is no stable checked-in Geist font asset; all P42-219–240 remain E2E-owned. That deferral does not affect this B3e-c scope.

## JEV result

The stored response request identity matches the submitted request; local response validation is valid. JEV selected `valid_as_defined`, confidence 0.95, pass probability 0.97. Distribution: `valid_as_defined` 0.97, `incomplete_implementation_info` 0.01, `indeterminate` 0.01, `missing_prerequisites_info` 0.01, all other listed criteria 0. Diagnosis is complete; no follow-up was recommended.

- Request SHA-256: `087552d69f31e4b512134d2df7d20fa47c2e2e65acad91e1090eef9b64d91563`
- Response SHA-256: `848861df2c157161b4e924aee3435e09e68c007562799edccd9658ed8a6804fc`
