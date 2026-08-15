# Specification: Economic Indicators Dashboard (nextjstest)

## Purpose

A dashboard application to visualize and track Japanese economic indicators — CPI (Consumer Price Index), CTI (Business Cycle Index), wage statistics, and population trends — with a unified 2020-base scale for long-term comparison.

## Data Model

### CpiData (src/types/data.ts)

The shared data type with an index signature `[key: string]: string | number` for extensibility. Below are the explicitly defined fields; additional fields are added at runtime by each data loader.

| Field                          | Type           | Description                                                                                                                                                                        |
| ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 年月                           | string         | Year-month (e.g. "2020年1月")                                                                                                                                                      |
| 総合                           | number         | CPI / earnings total index (2020=100)                                                                                                                                              |
| 生鮮食品を除く総合             | number         | CPI excluding Fresh Food                                                                                                                                                           |
| 持家の帰属家賃を除く総合       | number         | CPI excluding Imputed Rent                                                                                                                                                         |
| 民間最終消費支出（参考）       | number \| null | Consumption expenditure (private final, 2005-2017, 12MA, indexed 2020=100); null outside period                                                                                    |
| 民間最終消費支出（参考・延長） | number \| null | Consumption expenditure (private final, 2017-, advanced/reference-only series, 12MA, indexed 2020=100); null outside period; hidden by default, shown via ?adv=1 or ⓘ panel toggle |
| CTI消費支出（参考）            | number \| null | Consumption expenditure (CTI distribution-adjusted, 2018-, 12MA window uses 2017 data, indexed 2020=100); null outside period                                                      |
| 消費支出（参考）               | number         | Consumption expenditure (combined legacy series, 12MA, indexed 2020=100) — kept for compatibility                                                                                  |
| CPI総合(参考)                  | number         | CPI All Items (reference)                                                                                                                                                          |

**Major runtime-added fields per data loader:**

| Loader                        | Example fields                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPI (`loadCpiData`)           | 生鮮食品及びエネルギーを除く総合, 食料（酒類を除く）及びエネルギーを除く総合, 外食以外食料, 交通・自動車等関係費, 寄与度カテゴリ (住居, 家具・家事用品, 教育, …) |
| CTI (`loadCtiData`)           | 消費支出（名目/実質）, 食料/住居/光熱・水道/…（名目/実質）, その他の消費支出（名目/実質）, 民間最終消費支出（名目/実質）                                         |
| 賃金 (`loadTotalEarningData`) | 所定内給与, 所定外給与, 特別給与, 時間当たり給与, 15歳以上国民当たり給与, 残差, \*(12MA) 系列                                                                    |

### PopulationData (src/types/index.ts)

| Field | Type   | Description      |
| ----- | ------ | ---------------- |
| total | number | Total population |
| index | number | Indexed value    |
| ma    | number | Moving average   |

### Data Sources

Static CSV files (not publicly served) stored in `data/source/`:

- `data/source/cpi_data.csv` — CPI time-series
- `data/source/cti_data.csv` — Business Cycle Index
- `data/source/total_earning.csv` — Total earnings
- `data/source/contractual_earnings.csv` — Contractual earnings
- `data/source/scheduled_earnings.csv` — Scheduled earnings
- `data/source/total_worked_hours.csv` — Total worked hours
- `data/source/population_statistics.csv` — Population statistics
- `data/source/employment_indices.csv` — Employment indices
- `data/source/hon-mks202512.csv` — 毎月勤労統計調査の生データ（常用労働者数、出勤日数、実労働時間数、現金給与額）
- `data/source/contribution.csv` — CPI contribution breakdown
- `data/source/cti_support_nominal.csv` / `data/source/cti_support_real.csv` — CTI supporting series

> Note: These files are loaded server-side during data loading and are not publicly accessible via HTTP. The `data/` directory is excluded from static file serving.

## Requirements

### R1: Dashboard Page (SSR)

The system SHALL render the main dashboard as a server-rendered page at `/`.

#### Scenario R1a: View Dashboard

- **WHEN** user visits `/`
- **THEN** the server loads CPI, CTI, and earnings data from CSV files
- **AND** renders the dashboard with charts and indicators

#### Scenario R1b: Data Loading Error

- **WHEN** CSV data fails to load or is empty
- **THEN** the system displays a descriptive error message with file path guidance

### R2: Chart Visualization

The system SHALL display economic indicators as interactive Recharts-based charts with 2020-base normalization.

#### Scenario R2a: CPI Chart

- **WHEN** the dashboard renders
- **THEN** a CPI multi-series line chart is displayed showing "総合", "生鮮食品を除く総合", "持家の帰属家賃を除く総合", and reference series

#### Scenario R2b: CTI / Earnings / Breakdown Charts

- **WHEN** data is available
- **THEN** the following charts are rendered:
  - CtiChart / MajorIndicesChart (CTI indicators)
  - EarningsBreakdownChart (wage breakdown)
  - StackedAreaChart / SpendingBarChart (additional breakdowns)
  - ResidualAreaChart (給与と物価の差(実質賃金相当)):
    - Displays the difference between "給与指数（総合）" and "物価指数（総合）".
    - Both indices are 2020-base (2020 average = 100), so the difference is 2020 average = 0.
    - The residual series is smoothed with a 2-month moving average (2MA).
  - NewGraph (supplementary view, 3種比較):
    - Displays four main series in legend order: 物価指数(総合), 給与(総合), CTI消費(総合), 民間最終消費(総合)
    - "民間最終消費支出（参考）" (2005-2017) and "CTI消費支出（参考）" (2018-) are shown as two separate series with `null` outside their respective active periods so lines correctly truncate instead of dropping to zero.
    - Also includes an advanced reference-only series "民間最終消費支出（参考・延長）" (2017-) which is hidden by default and can be enabled via `?adv=1` URL query parameter or the ⓘ info panel toggle.
  - Charts using `interval="preserveStartEnd"` on their XAxis (MajorIndicesChart, EarningsBreakdownChart, StackedAreaChart, SpendingBarChart, ResidualAreaChart, NewGraph) render the first/last (start year / end year) tick label in `--foreground` via the shared `XAxisEdgeTick` component (`src/app/components/charts/XAxisEdgeTick.tsx`), while other tick labels use the default `--chart-text` color

### R3: Data Transformation (Server-Side)

The system SHALL load and process CSV data on the server before rendering.

#### Scenario R3a: CPI Data Loading

- **WHEN** `loadCpiData()` is called
- **THEN** it reads `data/source/cpi_data.csv`, parses with PapaParse, transforms columns, and returns `CpiData[]`

#### Scenario R3b: CTI / Earnings / Consumption Data Loading

- **WHEN** `loadCtiData()` / `loadTotalEarningData()` / consumption map builder is called
- **THEN** corresponding CSV files are read from `data/source/`, processed through `server/lib/dataLoader.ts`, and consumption expenditure is split into `民間最終消費支出（参考）` (2005-2017) and `CTI消費支出（参考）` (2017-) with `null` for periods outside their active ranges, while `民間最終消費支出（参考・延長）` is generated for 2017 onwards as an advanced reference-only series.

#### Scenario R3d: 2020 Base Alignment Across Series

- **WHEN** a series in 3種比較 is normalized to the 2020 base
- **THEN** the scaling factor is derived from the **raw** (pre-moving-average) 2020 calendar-year average, never from the 12MA series
- **AND** `ctiFactor` in `server/lib/data-loader/earnings.ts` uses the raw CTI `消費支出（名目）` 2020 average, consistent with `calculateSupportScale` (`src/lib/chartUtils.ts`)
- **AND** `CTI消費支出（参考）` at 2020年12月 — whose 12MA window is exactly 2020年1月〜12月 — equals 100
- **AND** normalizing on the 12MA series instead would blend the pre-COVID 2019 level into the denominator (101.97 vs raw 100.00), sinking the CTI series ~1.9% below `CPI総合(12MA)` and `給与 総合(12MA)` and breaking cross-series comparison

#### Scenario R3c: Data Processing & Projection

- **WHEN** raw data is loaded
- **THEN** `dataProcessor.ts` applies server-side calculations (indexing, moving averages, smoothing)
- **AND** `serverCalculations.ts` performs derived computations
- **AND** `server/lib/view-models/dashboard.ts` projects the full dataset to remove unused columns and round floating-point values to 2 decimal places
- **AND** the projected data (as `CpiView[]`, `CtiView[]`, `EarningsView[]`) is passed to the client component instead of raw `CpiData[]`
- **THEN** the RSC payload size is reduced by ~56% (1,169 KB → 505 KB uncompressed)

### R4: Interactive Legend

The system SHALL allow users to toggle chart series visibility.

#### Scenario R4a: Toggle Series

- **WHEN** user clicks a legend item
- **THEN** the corresponding series is hidden/shown on the chart
- **AND** other series re-scale to fill the chart area

#### Scenario R4b: Legend State Persistence

- **WHEN** legend state changes
- **THEN** the state is managed via `useToggleSet` hook (React state)

### R5: Chart Filters

The system SHALL provide date range and indicator filters.

#### Scenario R5a: Apply Filter

- **WHEN** user adjusts a filter control
- **THEN** the visible date range or indicator set updates accordingly

#### Scenario R5b: Uniform Select Width on Mobile

- **WHEN** user views period selection filters on a mobile viewport (≤768px)
- **THEN** start year select and end year select have uniform width (both `width: 70px` via the shared `.select` rule, `flex: 1 1 70px`) to eliminate layout asymmetry caused by the adjacent max range button
- **AND** start year item, end year item, and max range button are all laid out in a single horizontal row (same baseline Y coordinate) without overflowing a 375px viewport

#### Scenario R5c: Mobile Filter Row Horizontal Invariant

- **WHEN** the period selection filters are displayed on a mobile viewport (≤768px)
- **THEN** the start year select, end year select, and max range button share the same row (Y-coordinate difference below the element height threshold)
- **AND** they are ordered left-to-right as start year select → end year select → max range button
- **AND** the start year select and end year select widths match within 4px

### R6: Chart Information

The system SHALL provide explanatory info for each chart/metric.

#### Scenario R6a: View Chart Info

- **WHEN** user clicks the info button on a chart
- **THEN** a tooltip/modal displays the definition, source, and calculation method for the indicator
- **AND** the content is retrieved based on the `chartKey` defined in `src/lib/chartInfoContent.ts` (supported charts: `cpi-major`, `stacked-area`, `earnings`, `residual`, `consumption-expenditure`, `new-graph`)

### R7: Responsive Layout

The system SHALL adapt to viewport size for mobile and desktop, designed mobile-first.

#### Scenario R7a: Responsive Charts

- **WHEN** viewport width changes
- **THEN** charts resize to fit available space without overflow or clipping

#### Scenario R7b: Single Mobile Breakpoint

- **WHEN** JavaScript and CSS both decide "is this mobile?"
- **THEN** both derive the boundary from `MOBILE_BREAKPOINT_PX = 768` in `src/lib/breakpoints.ts`
- **AND** no viewport band exists where JS treats the client as mobile while CSS treats it as desktop

#### Scenario R7c: Fluid Typography

- **WHEN** viewport width crosses 768px
- **THEN** font sizes and spacing scale continuously via `clamp()` with no step change
- **AND** only layout switches (`.chartWrapper` aspect ratio) remain in a `min-width: 769px` media query

#### Scenario R7d: No Horizontal Overflow

- **WHEN** the page is rendered at 375px width
- **THEN** `document.documentElement.scrollWidth` does not exceed `clientWidth`
- **AND** the overflow is genuinely absent rather than hidden by `overflow-x: hidden`

#### Scenario R7e: Viewport-Linked Chart Height

- **WHEN** the device is held in landscape with a short viewport
- **THEN** chart height follows the viewport (`svh`/`dvh` units) instead of a fixed 500px

### R15: Touch Tooltip Interaction & Scroll Suppression

The system SHALL ensure that chart tooltips on touch devices open only on explicit taps and do not trigger during vertical scrolling or programmatic scroll animations.

#### Scenario R15a: Touch Pointer Trigger

- **WHEN** the device has coarse pointer (`pointer: coarse`)
- **THEN** chart tooltip trigger is set to `"click"` and tooltips never open during touchmove / vertical scrolling.

#### Scenario R15b: Fine Pointer Hover

- **WHEN** the device has fine pointer (`pointer: fine`)
- **THEN** chart tooltip trigger remains `"hover"`.

#### Scenario R15c: Re-taping Dismissed Tooltip

- **WHEN** a tooltip is closed via the close button on a touch device
- **THEN** tapping the same point again re-opens the tooltip.

#### Scenario R15d: Programmatic Scroll Suppression

- **WHEN** a section tab is pressed triggering programmatic scroll
- **THEN** tooltips are suppressed during the scroll animation.

#### Scenario R15e: No Late Tooltip After Suppression Release

- **WHEN** a tap occurs during programmatic scroll suppression and the suppression is then released
- **THEN** the tooltip does not appear afterwards without a new legitimate tap, because taps during suppression do not update the `activeChartId` display state.
- **AND** a legitimate tap after the suppression is released still opens the tooltip.

#### Scenario R15f: Outside Tap Dismissal

- **WHEN** the user taps outside the chart (outside `.recharts-wrapper`) on a touch device while a tooltip is shown
- **THEN** both the tooltip and the guide line (`.recharts-tooltip-cursor`) disappear.

#### Scenario R15g: Single Guide Line Across Charts

- **WHEN** the user taps a second chart while the first chart's tooltip is shown
- **THEN** the first chart's guide line disappears and at most one guide line is visible at a time.

#### Scenario R15h: Guide Line Dismissal with Close / Scroll

- **WHEN** the user closes the tooltip via the close button or scrolls 40px or more on a touch device
- **THEN** the guide line disappears together with the tooltip.

#### Scenario R15i: Active Dot Dismissal

- **WHEN** the user dismisses a tooltip on a touch device (close button, outside tap, or scroll) on an area or line chart
- **THEN** the active data point dots (`.recharts-active-dot`) disappear together with the guide line and tooltip.

### R8: Accessibility

The system SHALL be navigable and interpretable by assistive technologies.

#### Scenario R8a: Chart Labels

- **WHEN** a screen reader encounters a chart
- **THEN** the chart wrapper exposes `role="img"` with a descriptive `aria-label`
- **AND** a collapsible `<details>` data table provides the underlying values

#### Scenario R8b: Tap Targets

- **WHEN** an interactive control is rendered
- **THEN** its hit area is at least 44x44px (WCAG 2.5.8 AAA / Apple HIG)

#### Scenario R8c: Pointer-Aware Hover

- **WHEN** the device has no fine pointer (`hover: none`)
- **THEN** hover styles are not applied and `:active` provides press feedback instead

#### Scenario R8d: Focus and Motion

- **WHEN** a control receives keyboard focus
- **THEN** a `:focus-visible` outline is shown
- **AND WHEN** the user requests reduced motion
- **THEN** animations and transitions are suppressed

### R10: Section Navigation

The system SHALL let users move between the eight chart sections without unbounded scrolling.

#### Scenario R10a: Sticky Section Tabs

- **WHEN** the user scrolls the dashboard
- **THEN** `SectionTabs` stays pinned and marks the section in view with `aria-current`
- **AND WHEN** a tab is selected
- **THEN** the page smooth-scrolls to that section

#### Scenario R10b: Range Display and Picker

- **WHEN** the user is anywhere on the page
- **THEN** the tab bar shows the active year range (e.g. `2000–2026`)
- **AND WHEN** the range label is tapped
- **THEN** a range sheet opens with start-year / end-year selects

#### Scenario R10c: Horizontal Tab Scroll

- **WHEN** the tab row content overflows the viewport width
- **THEN** the tab row scrolls horizontally without showing a native scrollbar (`scrollbar-width: none` / `::-webkit-scrollbar { display: none }`)
- **AND** a right-edge fade (`mask-image`) indicates that more tabs are available

### R11: Shareable State

The system SHALL keep view state in the URL so it survives reload and can be shared.

#### Scenario R11a: URL Synchronization

- **WHEN** the year range, hidden series, or advanced series state changes
- **THEN** `useUrlState` writes `?from`, `?to`, `?hidden`, `?adv` via `window.history.replaceState`
- **AND WHEN** the page is opened with those params
- **THEN** the dashboard restores that range, series visibility, and advanced series toggle.

### R16: Chart Tooltip Stack Total

The system SHALL display the sum of active series in stacked chart tooltips when requested.

#### Scenario R16a: Consumption Expenditure Tooltip Total

- **WHEN** the user taps or hovers over a data point in the Consumption Expenditure (nominal/real) charts
- **THEN** the tooltip displays the sum of currently visible series as `合計` right below the date label
- **AND WHEN** series are hidden via legend toggles
- **THEN** the total reflects only the remaining visible series
- **AND WHEN** mobile view truncates series list to the top 5 entries
- **THEN** the total is calculated from all active series prior to truncation
- **AND WHEN** other charts (such as stacked contributions) are viewed
- **THEN** no total row is rendered.

#### Scenario R11c: Advanced Series Toggle

- **WHEN** 3種比較 is opened without `?adv=1`
- **THEN** the advanced series is not rendered and does not appear in the legend.
- **WHEN** the user turns ON the toggle in the ⓘ panel
- **THEN** the advanced series and its legend chip appear, and `adv=1` is added to the URL.
- **WHEN** the user opens a URL with `?adv=1`
- **THEN** the advanced series is rendered from initial load.

#### Scenario R11b: Scroll Position Preservation

- **WHEN** the user filters series via legend click or changes the year range
- **THEN** URL parameters (`?from`, `?to`, `?hidden`) are synchronized using `window.history.replaceState`
- **AND** the page scroll position is preserved without resetting to the top of the page.

### R12: Deferred Chart Mounting

The system SHALL defer off-screen chart mounting to protect mobile responsiveness.

#### Scenario R12a: Lazy Mount on Approach

- **WHEN** a chart wrapped in `LazyMount` is more than 200px outside the viewport
- **THEN** its Recharts subtree is not mounted, and a placeholder of equal height reserves the space
- **AND WHEN** the user scrolls it into range
- **THEN** the chart mounts

#### Scenario R12b: Test Override

- **WHEN** `window.__MOUNT_ALL__` is set before page scripts run
- **THEN** every `LazyMount` mounts immediately, so E2E tests can address all charts

### R13: Data Export

The system SHALL let users take the displayed data with them.

#### Scenario R13a: CSV Download

- **WHEN** the user opens a chart's data table and activates the CSV button
- **THEN** a UTF-8 BOM CSV of the currently filtered rows and series downloads
- **AND** the file name derives from the chart title

### R17: Max Period Button

The system SHALL provide a "最大期間" button within the range filter sheet to quickly reset the date range to 2005 through the latest available year.

#### Scenario R17a: Max Period Activation

- **WHEN** the user opens the range filter and clicks the "最大期間" button
- **THEN** the start year is set to 2005 and the end year is set to the latest available year in `allYears`
- **AND** the URL parameters `from=2005` and `to=<latestYear>` are updated via `replaceState`
- **AND** the range bottom sheet automatically closes
- **AND WHEN** the range is already set to the maximum period and the button is clicked again
- **THEN** the range remains unchanged (idempotent).

#### Scenario R14a: Manual Theme Toggle

- **WHEN** the user selects a theme via `ThemeToggle`
- **THEN** `data-theme` is set on `<html>` and persisted to `localStorage`
- **AND WHEN** the page reloads
- **THEN** an inline script applies the stored theme before paint to avoid FOUC

#### Scenario R14b: Theme-Aware Series Palette & Visual Enhancements

- **WHEN** the dashboard renders in light or dark mode
- **THEN** `--series-1` through `--series-12` CSS custom properties are applied from `globals.css`
- **AND** `StackedAreaChart` series colors adapt automatically to the active theme via `var(--series-N)` references in `chartConstants.ts`
- **AND** fill opacity is set to 1.0, and stacking separator gaps use `var(--card-bg)` for clear layer distinction
- **AND** hidden legend items (`.legendItem.hidden`) display enhanced borders and swatches with rings
- **AND** each `globals.css` theme scope (`:root` / `@media (prefers-color-scheme: dark)` / `:root[data-theme="dark"]`) applies the validated palette values (`PALETTES.light` / `PALETTES.dark` in `scripts/validate-palette.mjs`) to `--series-1` through `--series-12`, and the two dark scopes remain identical

### R9: Page Metadata and Header

The system SHALL provide SEO-friendly metadata and descriptive headers.

#### Scenario R9a: Layout Metadata

- **THEN** `layout.tsx` defines:
  - `title`: "日本の経済指標ダッシュボード | 物価・賃金・消費の長期推移"
  - `description`: "物価指数・現金給与総額・消費支出の2020年基準指数を一画面で比較。費目別寄与度・年率上昇率・給与と物価の乖離を可視化。凡例クリックで系列の表示/非表示を切替可能。"

#### Scenario R9b: Page Header Description

- **THEN** `page.tsx` header displays:
  - "2020年基準でスケール統一した主要指標を一覧。各グラフは凡例クリックで系列の表示/非表示を切替可能。"

## Architecture

### Component Tree (src/app/components/)

```
Page (RSC)
├── header (badge, ThemeToggle, title, description)
└── CpiChart (client component)
    ├── SectionTabs — Sticky navigation section tabs & range display
    ├── ChartFilters — Date range (start year / end year selects with "最大期間" button)
    ├── Range sheet — ChartFilters (start year / end year selects with "最大期間" button)
    ├── [Chart variants]                     — eager: rendered directly
    │   ├── MajorIndicesChart → CustomTooltip
    │   └── StackedAreaChart → CustomTooltip — always-expanded 12-series legend (compact on mobile)
    ├── CagrPanel — CAGR calculation controls & result card
    ├── [Chart variants]                     — deferred: wrapped in LazyMount
     │   ├── SpendingBarChart (nominal / real) — supports `showTotal` opt-in via tooltip controller
     │   ├── EarningsBreakdownChart → CustomTooltip
    │   ├── ResidualAreaChart → CustomTooltip
    │   └── NewGraph → CustomTooltip — Supplementary visualization
    ├── ChartInfoButton → ChartInfoContentRenderer — Indicator explanations (uses `chartKey` mapped to `CHART_INFO` in `src/lib/chartInfoContent.ts`)
    ├── ChartExportButton — CSV download of the displayed rows (inside each chart's <details>)
    └── CustomTooltip (React.memo, module-level component for charts, managed via `useChartTooltipController`)
```

Every chart renders `role="img"` on its wrapper plus a `<details>` data table (R8a) containing a
`ChartExportButton` (R13a). Charts under `LazyMount` are absent from the SSR HTML and appear after
hydration — tests must wait for them rather than reading the initial markup.

### Data Flow

```
data/source/*.csv
  → server/lib/dataIo.ts (path definitions + CSV parsing utilities)
    → server/lib/data-loader/{cpi,earnings,population}.ts (domain-specific loading + caching)
      → server/lib/dataLoader.ts (caching wrapper with maybeCache)
        → server/lib/dataProcessor.ts (transform + clean)
          → server/lib/serverCalculations.ts (derive)
            → server/lib/view-models/dashboard.ts (project: select columns, round 2 decimals)
              → src/app/page.tsx (RSC: load + project + pass props)
                → src/app/components/CpiChart.tsx ("use client": render + interact)
```

**Key optimization:** The view-models layer reduces RSC payload from 1,169 KB to ~505 KB by removing unused columns and rounding to 2 decimal places before sending to client.

### Client Modules

#### src/hooks/

| Module               | Description                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| `useToggleSet.ts`    | Legend toggle state (React state using `useToggleSet`)                              |
| `useChartTheme.ts`   | Chart theme management; `isMobile` and `isTouch` (`pointer: coarse`)                |
| `useCpiChartData.ts` | CPI chart data filtering (quarter visibility) — server-side processing complete     |
| `useUrlState.ts`     | Syncs `?from` / `?to` / `?hidden` / `?adv` with `window.history.replaceState` (R11) |

#### src/lib/

| Module                  | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `chartInfoContent.ts`   | Info button content definitions (`CHART_INFO`)          |
| `chartConstants.ts`     | Chart colors, keys, and shared constants                |
| `chartUtils.ts`         | Chart rendering and data manipulation helpers           |
| `clientCalculations.ts` | Client-side utility functions for calculations          |
| `resetLogic.ts`         | Application state reset logic                           |
| `unstableCache.ts`      | Caching utility                                         |
| `breakpoints.ts`        | Single source of truth for `MOBILE_BREAKPOINT_PX = 768` |
| `csvExport.ts`          | Pure CSV serialization for the export button (R13)      |

### ETL Scripts

```
scripts/
├── ts_converters/   — TypeScript CSV conversion scripts (e.g. convert_scheduled.ts, convert_contractual.ts)
├── python_backup/   — Legacy Python converters and parity verification
├── build_*.sh       — Build scripts for standalone executables (PyInstaller)
└── *.spec           — PyInstaller spec files
```

### State Management

- Legend toggle state: React state (via `useToggleSet` custom hook)
- Year range, hidden stacked series, and advanced series toggle: mirrored into the URL query by `useUrlState` via `window.history.replaceState` without altering scroll position (R11)
- Theme: `data-theme` on `<html>`, persisted in `localStorage`, applied pre-paint by an inline script (R14)
- Chart data: React props from server component (no client-side re-fetch on initial load)
- API routes available for dynamic client-side queries

## Non-Goals

- Real-time data updates (data is loaded from static CSVs)
- User authentication or personalization
- Database backend (data lives in CSV files processed by ETL scripts)
- PNG/image export of charts (CSV export is supported — see R13)
- Multi-language support
- Migrating off Recharts, PWA/offline support, or a state-management library

## Test Requirements

- Unit tests for data loading, transformation, and data quality/integrity (`tests/unit/`, `tests/data-quality/`)
- Component tests for chart rendering and interaction (`tests/components/`)
- Integration tests for data mapping and computation accuracy (`tests/data-mapping/`, `tests/computation-contract/`)
- Constant/fixture tests for expected data quality (`tests/constants/`, `tests/fixtures/`)
- Performance checkpoint tests (`tests/perf-checkpoint.test.ts`)
- E2E against a real build/server (`tests/e2e/`, Playwright) across three projects:
  `chromium` (Desktop Chrome), `chromium-dark` (dark mode), `mobile-pixel` (Pixel 7 / Chromium)
  - `range-change.e2e.spec.ts` — year-range filtering changes the rendered bars
  - `real-consumption.e2e.spec.ts` — Flight payload integrity for the real-consumption series
  - `mobile-ux.e2e.spec.ts` — 44px tap targets (R8b), 375px horizontal overflow (R7d),
    horizontal layout for start year, end year, and max-range button on mobile viewports,
    and `LazyMount` deferral (R12)
  - `accessibility.e2e.spec.ts` — dark-mode legend contrast (P0-3 / P1-2 regression),
    `:focus-visible` rings (P4-1), keyboard-only operation (P4-1), and `prefers-reduced-motion` (P4-2)
  - `fixtures.ts` — shared `test` that sets `window.__MOUNT_ALL__` (R12b); specs verifying
    deferral itself must use the plain `@playwright/test` `test`

- **Performance baseline & regression detection** (`scripts/lighthouse-mobile.js`):
  - Lighthouse CLI with mobile preset (Pixel 5 throttling, 4G)
  - Captures Performance & Accessibility scores pre/post improvement
  - Run via `pnpm lighthouse:mobile <url>` after `pnpm build && pnpm start`
  - Stores JSON report in `lighthouse-reports/{date}-{timestamp}.json` and prints summary
  - Supports diff against previous run if available

- **Dark mode E2E regression** via `pnpm test:e2e:dark`:
  - Validates that `colorScheme: "dark"` fixture in chromium-dark project
  - Ensures legend `:hover` background doesn't degenerate to white-on-white contrast
