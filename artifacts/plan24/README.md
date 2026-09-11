# Plan24 verification artifacts

This directory stores persistent visual evidence for the corrected Plan24 contract.

- `screenshots/baseline-desktop.png` and `screenshots/baseline-mobile.png`: HEAD `51d4833` before the corrected rendering contract.
- `screenshots/after-desktop.png` and `screenshots/after-mobile.png`: current worktree after the corrected contract.
- `screenshots/baseline-2016-2019/desktop.png` and `screenshots/baseline-2016-2019/mobile.png`: HEAD `51d4833`, consumption nominal graph, 2016–2019 range before the corrected contract.
- `screenshots/all/`: all-period nominal/real chart elements.
- `screenshots/2017q4-boundary/`: 2017Q4 boundary case, nominal/real, both viewports.
- `screenshots/2018q1-boundary/`: 2018Q1 boundary case, nominal/real, both viewports.
- `screenshots/2025q1-q4/`: 2025 Q1-Q4 case, nominal/real, both viewports.
- `screenshots/latest-year/`: latest available year (2026), nominal/real, both viewports.

Capture conditions:

- URL: `http://127.0.0.1:3200/` (baseline used port 3201)
- Browser: Playwright Chromium
- Viewports: Desktop Chrome and iPhone 12 (375px class)
- Chart-element screenshots; captured after the production server reported ready. The `baseline-*` and `after-*` files are the separate full-page captures.

Execution record:

- `E2E_PORT=3222 ./node_modules/.bin/playwright test tests/e2e/plan24-rendering.e2e.spec.ts --reporter=list` → 4 passed (2017Q4 tooltip合計の厳密一致を含む最終再監査).
- `E2E_PORT=3219 ./node_modules/.bin/playwright test tests/e2e/quarterly-gdp.e2e.spec.ts --reporter=list` → 1 passed.
- `./node_modules/.bin/vitest run tests/components/CustomTooltip.test.tsx tests/components/plan24-rendering-fixture.test.tsx tests/components/SpendingBarChart.test.tsx tests/components/real-consumption-support-series.test.tsx tests/unit/quarterly-gdp-join.test.ts` → 5 files / 38 tests passed.
- `pnpm run type-check` → 0 errors.
- `./node_modules/.bin/eslint --cache` → 0 errors / 5 pre-existing warnings.
- `./node_modules/.bin/next build --webpack` → succeeded.

Expected and observed result: 2017Q4 has GDP periods only, 2018Q1 onward has CTI periods only, the actual Bar rectangles follow those periods, no GDP line is drawn, and post-2018 tooltip content has no GDP entry. The 2025 projection test independently recalculates raw-value factors and verifies the rounded output of `buildQuarterlyPublicViews`; the browser test compares 2025Q1-Q4 table and CSV values and checks Q1/Q4 tooltip values.

The baseline 2016–2019 captures visibly show the former 2018+ GDP-plus-CTI overlap; the corrected boundary captures and DOM assertions show that overlap is removed. The refreshed `2025q1-q4` captures were taken after restoring Q1–Q4 to visible state, at both normal and 375px widths.

The browser assertions also compare 2017Q4 nominal/real GDP item and total values numerically, and compare 2025Q1/Q4 CTI item and total values against the table-derived values while excluding the table's comparison column.

2025 independent calculation log (source CSV rows, arithmetic mean, factor, unrounded comparison values, rounded public values):

- Nominal: raw `[86092.6, 86178.8, 87584.5, 91054.8]`, mean `87727.675`, factor `0.0011398911460950036`, comparisons `[98.1361924843, 98.2344511011, 99.8367960852, 103.7925603295]`, public `[98.14, 98.23, 99.84, 103.79]`.
- Real: raw `[76701.1, 75614.6, 77031.6, 78774.9]`, mean `77030.55`, factor `0.001298186239096047`, comparisons `[99.5723125435, 98.1618331948, 100.0013630956, 102.2644911662]`, public `[99.57, 98.16, 100.00, 102.26]`.
- Each unrounded four-quarter mean is `100`; swapped nominal/real factors are rejected by the unit test.

Behavioral evidence is provided by `tests/components/plan24-rendering-fixture.test.tsx` and `tests/e2e/plan24-rendering.e2e.spec.ts`, covering the 2017Q4/2018Q1 boundary, null/all-missing GDP, GDP-only and CTI-only bars, no GDP line, and post-2018 tooltip exclusion.
