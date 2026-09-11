# Specification: Economic Indicators Dashboard (nextjstest)

## Purpose

A dashboard application to visualize and track Japanese economic indicators — CPI (Consumer Price Index), CTI (Consumption Trend Index micro), wage statistics, and population trends. CPI selects its complete validated 2025-base set when available. CTI 2025 candidates are selectable only after the official map and snapshot pass official-row-level matching. GDP comparison readiness is assessed independently from CTI: verified nominal and real annual artifacts must cover every year from 1994 through 2025 and pass metadata, CSV, and normalization-JSON hash checks. Successful validation generates separate raw and comparison values; comparison-only normalization never overwrites official source values, and incomplete validation fails closed.

## Data Model

### CpiData (src/types/data.ts)

The shared data type with an index signature `[key: string]: string | number` for extensibility. Below are the explicitly defined fields; additional fields are added at runtime by each data loader.

| Field                                                   | Type           | Description                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 年月                                                    | string         | Public period label; quarterly views use `label` such as `2025Q1`, while monthly views use `YYYY年M月`                                                                                                                                             |
| 総合                                                    | number         | CPI all-items index (2025 annual average = 100) or earnings total index (2020 annual average = 100), depending on loader                                                                                                                           |
| 生鮮食品を除く総合                                      | number         | CPI excluding Fresh Food                                                                                                                                                                                                                           |
| 持家の帰属家賃を除く総合                                | number         | CPI excluding Imputed Rent                                                                                                                                                                                                                         |
| 民間最終消費支出（名目・原値） / （実質・原値）         | number \| null | GDP private final consumption official raw amount. The loader emits these only when the complete nominal-and-real GDP comparison set validates; nominal is current prices and real is previous-year chain-linked with its recorded reference year. |
| 民間最終消費支出（名目・比較指数） / （実質・比較指数） | number \| null | GDP comparison-only normalized value; separate from official raw values and omitted when either verified 2025 annual value is absent or invalid.                                                                                                   |
| 民間最終消費支出（四半期raw）                           | number \| null | Plan21 original-series quarterly official amount, keyed by `YYYY-Qn`; nominal and real remain separate.                                                                                                                                            |
| 民間最終消費支出（四半期比較指数）                      | number \| null | Separate 2025Q1–Q4 average=100 value, emitted only when independent confirmation is `ready`; pending status is fail-closed.                                                                                                                        |
| CTI消費支出（参考）                                     | number \| null | Consumption expenditure (selected all-household CTI micro series, 12MA, official availability begins in 2017; no legacy CTI connection)                                                                                                            |
| 消費支出（参考）                                        | number         | Consumption expenditure (combined legacy series, 12MA, indexed 2020=100) — kept for compatibility                                                                                                                                                  |
| CPI総合(参考)                                           | number         | CPI All Items (reference)                                                                                                                                                                                                                          |

**Major runtime-added fields per data loader:**

| Loader                        | Example fields                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPI (`loadCpiData`)           | 生鮮食品及びエネルギーを除く総合, 食料（酒類を除く）及びエネルギーを除く総合, 外食以外食料, 交通・自動車等関係費, 選択済みCPIペアの固定ウェイト加重費目 (住居, 家具・家事用品, 教育, …) |
| CTI (`loadCtiData`)           | 消費支出（名目/実質）, 食料/住居/光熱・水道/…（名目/実質）, その他の消費支出（名目/実質）, 民間最終消費支出（名目/実質）                                                                |
| 賃金 (`loadTotalEarningData`) | 所定内給与, 所定外給与, 特別給与, 時間当たり給与, 15歳以上国民当たり給与, 残差, \*(12MA) 系列                                                                                           |

### PopulationData (src/types/index.ts)

| Field | Type   | Description      |
| ----- | ------ | ---------------- |
| total | number | Total population |
| index | number | Indexed value    |
| ma    | number | Moving average   |

### Data Sources

Static CSV files (not publicly served) stored in `data/source/`:

- `data/source/cpi_data2025_long.csv` — Primary CPI index input, when generated: official nationwide monthly long connected index, 1970 through the latest month, converted/connected to 2025 annual average = 100.
- `data/source/contribution2025.csv` — Primary CPI weight input: published 2025-base weights per 10,000; values are retained without editing.
- `data/source/cpi_data2025_long.metadata.json` — Required provenance and readiness metadata for the 2025 pair; it identifies the index and contribution files, base year, source identifiers, expected row/series counts, covered period, generated-file SHA-256, source-original SHA-256, and official-snapshot SHA-256.
- `data/source/cpi-2025-official-series.csv` — Minimal offline snapshot of official series codes and names derived from the long-source CSV identified by `statInfId=000040482945`; it is retained for deterministic mapping verification and is not selected as a dashboard input.
- `data/source/cpi-2025-series-map.csv` — 78-series mapping table that records official series codes, dashboard keys, classification/missing-data handling, and mapping evidence; its code and name fields are verified against `cpi-2025-official-series.csv`, not merely against a hash of the mapping table itself.
- `data/source/cpi_data.csv` / `data/source/contribution.csv` — Compatible 2020-base fallback pair. They are selected together only when the complete 2025 pair cannot be validated.
- `data/source/cpi_data2025.csv` — Saved 2025-base raw monthly data beginning in 2025; it is not a long connected series and MUST NOT be selected as the dashboard CPI input.
- `data/source/cti_data2025.csv` / `cti_data2025_distribution_adjusted.csv` — 2025-base CTI candidate CSVs, each covering 2017年1月〜2026年7月. They are not selected until the adopted variant, official map, and snapshot are complete.
- `data/source/cti_data2025.metadata.json` / `cti_data2025_distribution_adjusted.metadata.json` — Candidate provenance and integrity metadata; they do not by themselves make a 2025 CTI set selectable.
- `data/source/cti-2025-series-map.csv` / `cti-2025-official-series.csv` — Official-code map and independent snapshot required to verify the adopted CTI candidate; every mapped official row is matched against the snapshot by code, name, and representative values.
- `data/source/cti_support_nominal2025.csv` / `cti_support_real2025.csv` — Official annual GDP artifacts for 1994–2025, each containing e-Stat series code 12 (`民間最終消費支出`) in 10億円. The nominal source is 0003109786 and the real source is 0003109751.
- `data/source/cti_support_nominal2025.metadata.json` / `cti_support_real2025.metadata.json` / `cti-gdp-display-normalization2025.json` — Provenance, hash, annual-period, and independent 2025 annual-value normalization records. Metadata, source CSV, and normalization JSON hashes must agree before use. Nominal remains current prices; real remains previous-year chain-linked at its recorded 2020 reference year.
- `data/source/cti_support_nominal_quarterly2025.csv` / `cti_support_real_quarterly2025.csv` — Plan21 official Cabinet Office original-series long data, 2005Q1–2025Q4 (84 rows), nominal current prices and real previous-year chain-linked values.
- Matching `.metadata.json`, `.official.csv`, and e-Stat snapshots record source URL, retrieval/revision state, CSV SHA-256, and ready independent confirmation; `cti-gdp-quarterly-display-normalization2025.json` records separate nominal/real 2025Q1–Q4 average=100 factors. Invalid or unavailable confirmation disables comparison values and never silently falls back to annual data.
- `data/source/cti_data.csv` / `cti_support_nominal.csv` / `cti_support_real.csv` — Complete compatible 2020-base CTI rollback set; never mixed with a 2025 CTI input.
- `data/source/total_earning.csv` — Total earnings
- `data/source/contractual_earnings.csv` — Contractual earnings
- `data/source/scheduled_earnings.csv` — Scheduled earnings
- `data/source/total_worked_hours.csv` — Total worked hours
- `data/source/population_statistics.csv` — Population statistics
- `data/source/employment_indices.csv` — Employment indices
- `data/source/hon-mks202512.csv` — 毎月勤労統計調査の生データ（常用労働者数、出勤日数、実労働時間数、現金給与額）
- `data/source/cti_support_nominal.csv` / `data/source/cti_support_real.csv` — CTI supporting series

> Note: These files are loaded server-side during data loading and are not publicly accessible via HTTP. The `data/` directory is excluded from static file serving.

### e-Stat Connection Foundation

The application also provides a same-origin e-Stat API proxy for dynamic statistical
catalogue, metadata, and data queries. The e-Stat `appId` is server-only configuration:
it is read from the server environment and MUST NOT be returned to, embedded in, or
otherwise exposed to the browser. A shared e-Stat client centralizes upstream request
construction, response handling, timeout handling, and error normalization for all
three proxy routes.

| Route                   | e-Stat operation | Purpose                                           |
| ----------------------- | ---------------- | ------------------------------------------------- |
| `/api/estat/stats-list` | StatsList        | Search available statistics tables                |
| `/api/estat/meta`       | MetaInfo         | Retrieve metadata for a selected statistics table |
| `/api/estat/data`       | StatsData        | Retrieve values for a selected statistics table   |

The existing `data/source/*.csv` datasets remain the dashboard's compatible fallback
source when e-Stat is unavailable or a dynamic query cannot be completed.

## Requirements

### R1: Dashboard Page (SSR)

The system SHALL render the main dashboard as a server-rendered page at `/`.

#### Scenario R1a: View Dashboard

- **WHEN** user visits `/`
- **THEN** the server loads CPI, CTI, and earnings data from CSV files
- **AND** renders the dashboard with charts and indicators

#### Scenario R1b: Data Loading Error

- **WHEN** CSV data fails to load or is empty
- **THEN** the system displays a descriptive error message with guidance to the current `data/source/` CPI input paths
- **AND** it does not direct operators to the obsolete `public/cpi_data.csv` path

### R2: Chart Visualization

The system SHALL display economic indicators as interactive Recharts-based charts; CPI and CTI select only complete compatible base-year sets, and comparison-only fields are normalized independently from their official source basis.

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
    - Uses comparison-only fields normalized from each series’ raw 2025 calendar-year average when every required series has 12 valid months; it is not a rewrite of CPI, CTI, earnings, or GDP source values.
    - The residual series is smoothed with a 2-month moving average (2MA).
  - NewGraph (supplementary view, 3種比較):
    - Displays four main series in legend order: 物価指数(総合), 給与(総合), CTI消費(総合), 民間最終消費(総合)
    - GDP reference and CTI consumption are shown as separate series with `null` outside their validated active periods so lines correctly truncate instead of dropping to zero.
    - CTI begins in its official 2017 availability range and is not connected to a legacy CTI series. GDP and CTI remain separate lines.
    - NewGraph receives only GDP comparison indices normalized independently from each series' official 2025 annual value. A GDP line is omitted when that GDP validation is incomplete, regardless of the CTI state.
    - Also includes an advanced reference-only series "民間最終消費支出（参考・延長）" (2017-) which is hidden by default and can be enabled via `?adv=1` URL query parameter or the ⓘ info panel toggle.
  - Charts using `interval="preserveStartEnd"` on their XAxis (MajorIndicesChart, EarningsBreakdownChart, StackedAreaChart, SpendingBarChart, ResidualAreaChart, NewGraph) render the first/last (start year / end year) tick label in `--foreground` via the shared `XAxisEdgeTick` component (`src/app/components/charts/XAxisEdgeTick.tsx`), while other tick labels use the default `--chart-text` color

#### Scenario R2c: Legacy GDP Bars and CTI Consumption Bars

- **WHEN** nominal or real consumption data is rendered in `SpendingBarChart`
- **THEN** 2017Q4以前はGDP比較値だけを単独のBarとして描画する
- **AND** 2018Q1以降は検証済みCTI費目だけを積み上げBarとして描画する
- **AND** GDPとCTIを同一四半期に同時表示・合算せず、GDP Lineは描画しない
- **AND** 2018Q1以降の表示データ、凡例、tooltipからGDP比較値を除外する
- **AND** GDP欠損を0埋めせず、境界で値の複製・補間・表示用係数合わせをしない

### R3: Data Transformation (Server-Side)

The system SHALL load and process CSV data on the server before rendering.

#### Scenario R3a: CPI Pair Selection and Data Loading

- **WHEN** `loadCpiData()` is called
- **THEN** it selects one complete, validated CPI pair before parsing and transforming either file
- **AND** the preferred pair is `cpi_data2025_long.csv` with `contribution2025.csv`, whose index represents nationwide monthly official connected indices from 1970 through the latest available month at 2025 annual average = 100
- **AND** the selected index and contribution CSV always have the same base year
- **AND** the loader retains the dashboard display range of 2005 through the latest available month

#### Scenario R3aa: CPI Pair Validation

- **WHEN** a CPI pair is considered for selection
- **THEN** the loader requires both index and contribution files, the `年月` index header, a row with a valid year-month, unique contribution headers including `総合`, and finite weights for every declared contribution header
- **AND** it rejects a pair whose contribution headers are absent from the index CSV
- **AND** for the 2025 pair, it also requires ready, valid metadata declaring base year 2025 and the expected index and contribution filenames
- **AND** it verifies the metadata-declared row count, series count, covered period, and SHA-256 against the generated index CSV
- **AND** it verifies unique, gap-free monthly keys and that the all-items 2025 calendar-year average is approximately 100 within the documented rounding tolerance

#### Scenario R3ab: 2025 Series Mapping

- **WHEN** the 2025 long connected index is generated or maintained
- **THEN** `cpi-2025-series-map.csv` provides a traceable mapping for all 78 supported official series, including official series code, dashboard key, classification or derivation handling, start month, missing-data policy, and source evidence
- **AND** every mapping code and official name is unconditionally checked against `cpi-2025-official-series.csv`, whose SHA-256 and its `statInfId=000040482945` source-original SHA-256 are recorded in the metadata; the verification MUST NOT be conditionally skipped or replaced by a hash of the mapping table itself
- **AND** an official series with no confirmed equivalent is retained as missing rather than fabricated as zero or substituted by name alone

#### Scenario R3e: CPI Fixed-Weight Derivation

- **WHEN** CPI category values are transformed for display
- **THEN** each available official index is multiplied by the published weight from the selected same-base pair
- **AND** all-items calculations use the published all-items denominator of 10,000
- **AND** mutually exclusive 10-major-category comparisons use the actual sum of their published weights as the denominator, without changing the CSV values; the 2025 weights total 10002
- **AND** the resulting values are selected-base fixed-weighted index levels, not official month-on-month or year-on-year contribution measures

#### Scenario R3f: CPI Derived Values and Missing Data

- **WHEN** both weighted `食料` and weighted `外食` are available for a month
- **THEN** `外食以外食料` equals weighted `食料` minus weighted `外食`, so weighted `食料 = 外食以外食料 + 外食`
- **AND WHEN** either source value is missing or non-finite
- **THEN** the dependent weighted and derived values remain missing and are never replaced with zero

#### Scenario R3g: CPI CSV Fallback and Fail-Closed Behavior

- **WHEN** the 2025 pair is missing or fails any pair validation
- **THEN** the loader selects the complete, validated 2020 pair (`cpi_data.csv` and `contribution.csv`) only
- **AND** it never combines an index CSV from one base year with weights from another base year
- **AND WHEN** neither complete pair validates
- **THEN** the loader returns no CPI rows and `getCpiDataStatus()` reports an invalid status with no selected base year, rather than serving mixed or partially validated CPI data

#### Scenario R3h: CPI Data Status for the UI

- **WHEN** the dashboard page loads CPI data
- **THEN** it also obtains `getCpiDataStatus()` and passes the selected base year and source mode to the CPI information UI
- **AND** the UI identifies a validated 2025 pair as the official connected series, a validated 2020 pair as the fallback CSV, and does not describe either state as another base year

#### Scenario R3b: CTI / Earnings / Consumption Data Loading

- **WHEN** `loadCtiData()` / `loadTotalEarningData()` / consumption map builder is called
- **THEN** it selects a complete, verified 2025 CTI set only when the adopted CTI CSV, metadata, official map, and official snapshot validate; otherwise it selects the complete compatible 2020 rollback set
- **AND** it validates the CTI set and the nominal/real GDP comparison set independently and never treats GDP availability or a CTI base year as a condition for CTI selection
- **AND** it matches every adopted CTI map row to the official snapshot row-by-row, including official code, name, and representative values
- **AND** it returns an explicit unavailable state when neither complete set is valid
- **AND** missing CTI inputs remain missing; they are not converted to zero, and a derived residual is missing when any required component is missing.

When the CTI map/snapshot or any other candidate input fails validation, the complete 2020 CTI rollback is selected. When the annual nominal/real GDP pair passes its independent validation, `getGdpSupportStatus()` reports available GDP comparison normalization without affecting CTI selection.

#### Scenario R3d: CTI Source Basis, 12MA, and Comparison Rebase

- **WHEN** a validated selected CTI 2025 series is used for the consumption charts
- **THEN** the chart and data table retain its official source basis; the source basis is not overwritten by comparison normalization
- **AND WHEN** a 3種比較 or wage-price-difference field is generated
- **THEN** its 12MA is calculated from continuous raw values first and its display factor is derived only from the raw selected-base calendar-year average
- **AND** the comparison field is omitted when the 2025 average cannot be verified from 12 valid months.

#### Scenario R3i: GDP Raw and Comparison Values

- **WHEN** GDP has complete, verified annual observations through 2025 and one finite non-zero 2025 value per price concept
- **THEN** annual coverage is continuous for every year 1994–2025 and metadata, source CSV, and normalization JSON SHA-256 values agree
- **THEN** nominal and real GDP each receive their own 2025 annual-value normalization factor for the comparison view
- **AND** raw official amounts remain internal for validation while public quarterly table, CSV, and tooltip surfaces expose only the normalized comparison values
- **AND** public quarterly `年月`, table period labels, CSV period labels, and tooltip period labels all use the row `label` (`YYYYQn`)
- **AND** displayed comparison values are rounded to two decimal places
- **AND WHEN** GDP values or provenance are incomplete
- **THEN** validation fails closed: raw and comparison GDP outputs are omitted, the GDP comparison line is not rendered, and the system does not interpolate values, fit the CTI/GDP boundary, or reuse a CTI factor

#### Scenario R3j: Quarterly GDP Support Status and Fail-Closed Comparison

- **WHEN** `page.tsx` loads the quarterly GDP support status
- **THEN** it obtains `getQuarterlyGdpSupportStatus()` and passes `granularity`, `comparisonReady`, and `independentConfirmation` to chart info
- **AND WHEN** `independentConfirmation` is `pending-independent-confirmation` or `comparisonReady` is false
- **THEN** chart info reports the pending state and the quarterly comparison line is not rendered
- **AND** the status propagation does not imply that quarterly raw or comparison values are connected to the chart, table, or CSV output

#### Scenario R3k: Quarterly GDP Consumption Join

- **WHEN** `page.tsx` receives quarterly CTI aggregates and `loadQuarterlyGdpData()` output
- **THEN** it joins them by an exact `YYYY-Qn` key regardless of input order
- **AND** it publishes only finite nominal/real comparison values when `comparisonReady` is true
- **AND** missing, non-finite, out-of-range, or non-ready GDP values remain absent while CTI rows remain present
- **AND** chart, tooltip, table, and CSV consume the same joined public rows
- **AND** the consumption chart maps pre-2018Q1 GDP comparison fields to standalone bars and 2018Q1+ CTI expense fields to stacked bars
- **AND** GDP values are excluded from 2018Q1+ chart data, legends, tooltips, and CTI totals while the public projection retains the comparison keys as `null`
- **AND** before 2018Q1 the tooltip total includes the standalone GDP comparison value, while from 2018Q1 the tooltip total includes only visible CTI expense fields
- **AND** the public table and CSV may retain the normalized quarterly comparison column for verification, but never expose raw/internal GDP fields; chart, legend, and tooltip visibility remains governed by the display-period contract
- **AND WHEN** a joined GDP value is missing, or the series ends before later CTI rows
- **THEN** the public row retains the CTI data and does not zero-fill, copy, interpolate, or rescale the missing GDP value
- **AND WHEN** quarterly GDP confirmation is not ready or validation fails
- **THEN** the GDP comparison field remains absent and its line is not rendered, while CTI data remains available

#### Scenario R3c: Data Processing & Projection

- **WHEN** raw data is loaded
- **THEN** `dataProcessor.ts` applies server-side calculations (indexing, moving averages, smoothing)
- **AND** `serverCalculations.ts` performs derived computations
- **AND** `server/lib/view-models/dashboard.ts` projects the full dataset to remove unused columns and round floating-point values to 2 decimal places
- **AND** the projected data (as `CpiView[]`, `CtiView[]`, `EarningsView[]`) is passed to the client component instead of raw `CpiData[]`
- **THEN** the RSC payload size is reduced by ~56% (1,169 KB → 505 KB uncompressed)

### R19: e-Stat API Connection Foundation

The system SHALL provide server-mediated access to e-Stat statistics search, metadata,
and data operations while protecting the e-Stat application ID and preserving existing
CSV-backed dashboard data as a fallback.

#### Scenario R19a: Server-Only Application ID and Shared Client

- **WHEN** an e-Stat proxy route makes an upstream request
- **THEN** it obtains the `appId` only from server-side environment configuration
- **AND** it uses the common e-Stat client for request construction and response handling
- **AND** the `appId` is absent from route responses, browser-visible configuration, and client bundles

#### Scenario R19b: Statistics List Proxy

- **WHEN** a client requests `/api/estat/stats-list` with supported statistics-search parameters
- **THEN** the route requests the corresponding e-Stat StatsList resource through the common client
- **AND** it returns the normalized upstream result without exposing the server-side `appId`

#### Scenario R19c: Metadata Proxy

- **WHEN** a client requests `/api/estat/meta` for a statistics table identifier
- **THEN** the route requests the corresponding e-Stat MetaInfo resource through the common client
- **AND** it returns the metadata required to interpret that table

#### Scenario R19d: Statistics Data Proxy

- **WHEN** a client requests `/api/estat/data` for a statistics table identifier and supported filters
- **THEN** the route requests the corresponding e-Stat StatsData resource through the common client
- **AND** it returns the resulting statistical values and associated response metadata

#### Scenario R19e: Invalid Requests and Upstream Errors

- **WHEN** an e-Stat proxy request is missing required input, has invalid input, or e-Stat returns an error response
- **THEN** the route returns a consistent error response with an appropriate HTTP status
- **AND** it does not disclose the `appId`, upstream credentials, or internal implementation details

#### Scenario R19f: Timeout Handling

- **WHEN** an e-Stat upstream request exceeds the configured request timeout
- **THEN** the common client cancels the upstream request
- **AND** the proxy route returns a timeout error response that clients can distinguish from a successful result

#### Scenario R19g: CSV Fallback Continuity

- **WHEN** e-Stat cannot be reached, times out, or returns an error for a dynamic query
- **THEN** existing dashboard loading continues to use the compatible server-side CSV datasets in `data/source/`
- **AND** no e-Stat failure makes previously available CSV-backed dashboard indicators unavailable

#### Scenario R19h: e-Stat Attribution

- **WHEN** e-Stat-sourced statistics or metadata are presented to a user
- **THEN** the interface displays an e-Stat credit identifying e-Stat as the source
- **AND** the credit remains available alongside the presented e-Stat-derived content

### R4: Interactive Legend

The system SHALL allow users to toggle chart series visibility.

#### Scenario R4a: Toggle Series

- **WHEN** user clicks a legend item
- **THEN** the corresponding series is hidden/shown on the chart
- **AND** other series re-scale to fill the chart area

#### Scenario R4b: Legend State Persistence

- **WHEN** legend state changes
- **THEN** the state is managed via `useToggleSet` hook (React state)

#### Scenario R4c: Linked Nominal / Real Legends

- **WHEN** the user toggles a category in either the 消費支出（名目） or 消費支出（実質） legend
- **THEN** `handleLegendToggle` resolves the nominal/real key pair and hides the series in **both** charts
- **AND** the quarter filter (`hiddenQuarters`) and 全選択解除 are likewise shared by both charts

#### Scenario R4d: Collapsed Legend Accordion (Real Consumption)

- **WHEN** the 消費支出（実質） section renders
- **THEN** its legend is placed in a native `<details>` accordion that is **closed by default**
- **AND** the "凡例は「消費支出（名目）」と連動しています" note stays visible outside the accordion
- **AND WHEN** the user opens the accordion
- **THEN** the same quarter and category controls as the nominal chart become operable

#### Scenario R4e: Modernized Accordion Summary Header (Tonal Pill)

- **WHEN** the 消費支出（実質） legend accordion renders
- **THEN** the `<summary>` element uses the `.legendAccordionSummary` tonal pill class with `--cta-tonal-bg` / `--cta-tonal-text` tokens
- **AND** the native marker is hidden (`::-webkit-details-marker: display: none`, `::marker: content: ""`)
- **AND** a chevron SVG (`aria-hidden="true"`) is rendered inside the summary
- **AND WHEN** the accordion is open (`details[open]`)
- **THEN** the chevron rotates 180° via CSS transition

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

#### Scenario R6b: CPI Calculation Explanation

- **WHEN** a user opens the `cpi-major` or `stacked-area` information panel
- **THEN** it identifies the base year and source mode returned by `getCpiDataStatus()`; for a validated 2025 pair, it identifies the nationwide monthly 2025 annual average = 100 connected CPI series and explains that pre-2025 values are connected from earlier base years
- **AND** it explains that category values use the selected pair's fixed-base weights rather than official contribution measures
- **AND** the stacked-area explanation identifies `外食以外食料` as a weighted difference and describes the major-category normalization (10002 for the 2025 pair)

#### Scenario R6c: CTI Data-State Explanation

- **WHEN** a user opens the consumption-expenditure or 3種比較 information panel
- **THEN** it identifies the CTI compatibility set selected by the loader without inferring a series variant from a filename
- **AND** a validated 2025 set explains the all-household official connected CTI series, its selected variant, the three household surveys combined in CTI micro, and the separately verified GDP reference connection
- **AND** it explains that 12MA is calculated from raw continuous monthly values and that a valid GDP comparison uses a separate raw 2025 annual value without changing official source values
- **AND WHEN** the 2025 set is unavailable, invalid, or no complete compatible set exists
- **THEN** the panel uses user-facing language to identify the 2020 rollback data or that consumption data cannot currently be displayed, without exposing internal file or validation terminology.

#### Scenario R6d: GDP and CTI Comparison Explanation

- **WHEN** a user opens the spending or 3種比較 information panel
- **THEN** it identifies GDP raw values as official amounts, distinguishing nominal current prices from real previous-year chain-linked values and their reference year
- **AND** it explains that GDP comparison values use a separate 2025 annual-value display normalization
- **AND** it states that CTI begins in 2017 and is not statistically connected to GDP or a legacy CTI series.

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

#### Scenario R8e: Modal Focus Management

- **WHEN** a `BottomSheet` or `ChartInfoButton` popup opens
- **THEN** focus moves to the first focusable element inside it and `Tab` / `Shift+Tab` cycle within it (`useFocusTrap`)
- **AND WHEN** it closes
- **THEN** focus returns to the trigger via `focus({ preventScroll: true })` so the scroll position is preserved

### R10: Section Navigation

The system SHALL let users move between the seven chart sections without unbounded scrolling.

#### Scenario R10a: Sticky Section Tabs

- **WHEN** the user scrolls the dashboard
- **THEN** `SectionTabs` stays pinned and marks the section in view with `aria-current`
- **AND WHEN** a tab is selected
- **THEN** the page smooth-scrolls to that section

#### Scenario R10b: Range Display and Picker

- **WHEN** the user is anywhere on the page
- **THEN** the tab bar shows the active year range (e.g. `2000–2026`)
- **AND WHEN** the range label is tapped
- **THEN** a `BottomSheet` opens with start-year / end-year selects

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

### R18: CAGR Compact Sheet Under the Contribution Chart

The system SHALL expose CAGR as a compact bottom sheet anchored to the 費目別寄与度 chart,
so that part of the chart stays visible while the user adjusts and reads the CAGR.

#### Scenario R18a: Entry Point

- **WHEN** the user views the 費目別寄与度 chart
- **THEN** a tonal pill button appears between the chart and the "データテーブルを表示" link,
  visually stronger than that plain text link and weaker than the filled 計算する button
- **AND** its label and text contrast meet WCAG AA (4.5:1) in both light and dark themes
- **AND** no standalone CAGR section or `CPI年率` tab exists

#### Scenario R18b: Self-Contained Sheet

- **WHEN** the link is tapped
- **THEN** a compact `BottomSheet` opens containing start-year / end-year / evaluation-month
  selects on one row, the 計算する button, and the result or error
- **AND** none of these controls are rendered outside the sheet

#### Scenario R18c: Chart Remains Visible

- **WHEN** the sheet is open on a 375x667 viewport
- **THEN** at least 120px of the contribution chart's plot area remains visible above the sheet

#### Scenario R18d: Sheet Stays Open While Editing

- **WHEN** the user changes one of the three selects
- **THEN** the sheet stays open and the previously calculated result is cleared

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
    ├── BottomSheet — shared bottom-sheet shell (backdrop / header / close / Escape)
    ├── ChartFilters — Date range (start year / end year selects with "最大期間" button)
    ├── Range sheet — BottomSheet wrapping ChartFilters (start year / end year selects with "最大期間" button)
    ├── [Chart variants]                     — eager: rendered directly
    │   ├── MajorIndicesChart → CustomTooltip
    │   └── StackedAreaChart → CustomTooltip — always-expanded 12-series legend (compact on mobile)
    │       └── belowChartSlot: CagrPanel — popup link + compact BottomSheet (R18)
    ├── [Chart variants]                     — deferred: wrapped in LazyMount
    │   ├── SpendingBarChart (nominal / real) — renders legacy GDP as standalone bars before 2018Q1 and CTI expense fields as stacked bars from 2018Q1; GDP is excluded thereafter
     │   ├── EarningsBreakdownChart → CustomTooltip
    │   ├── ResidualAreaChart → CustomTooltip
    │   └── NewGraph → ChartInfoContentRenderer → CustomTooltip — comparison visualization receives CTI plus GDP comparison-only normalized values; it omits unavailable GDP lines
    ├── ChartInfoButton → ChartInfoContentRenderer — Indicator explanations (uses `chartKey` plus loader-resolved state in `src/lib/chartInfoContent.ts`)
    ├── ChartExportButton — CSV download of the displayed rows (inside each chart's <details>)
    └── CustomTooltip (React.memo, module-level component for charts, managed via `useChartTooltipController`)
```

Every chart renders `role="img"` on its wrapper plus a `<details>` data table (R8a) containing a
`ChartExportButton` (R13a). Charts under `LazyMount` are absent from the SSR HTML and appear after
hydration — tests must wait for them rather than reading the initial markup.

### Data Flow

- `src/app/page.tsx` loads `loadQuarterlyGdpData()` alongside CTI, computes quarterly CTI aggregates, and calls the pure `buildQuarterlyPublicViews()` path, which joins by exact `YYYY-Qn` keys before applying the public projection.
- The joined public rows are passed unchanged to `CpiChart`; chart, tooltip, table, and CSV derive their displayed values from those same rows. GDP raw fields never cross the public projection boundary.
- `CpiChart` passes CTI expense keys and legacy GDP comparison keys to `SpendingBarChart`; the chart component renders only GDP bars before 2018Q1 and only CTI `Bar` stacks from 2018Q1.
- Tooltip aggregation follows the display contract: before 2018Q1 it receives only the standalone GDP comparison field; from 2018Q1 it receives only visible CTI expense fields. GDP comparison values are never included in the post-2018 CTI total.
- Missing, ended, unready, or failed-validation GDP comparison values remain `null` in the public projection and are hidden at the chart boundary; GDP is never zero-filled, copied, interpolated, or rescaled at the boundary.

```
e-Stat official CPI long connected CSV (`statInfId=000040482945`) + source-original SHA-256
  → data/source/cpi-2025-official-series.csv (minimal official code/name snapshot; SHA-256 recorded in metadata)
  → cpi-2025-series-map.csv (unconditional 78-series official-code/name verification against snapshot; classification and missing-data rules)
  → data/source/cpi_data2025_long.csv + cpi_data2025_long.metadata.json (generated 2025 index and ready metadata)
data/source/contribution2025.csv (published 2025-base weights per 10,000)
data/source/cpi_data.csv + data/source/contribution.csv (compatible 2020 fallback pair)
  → server/lib/dataIo.ts (CPI file paths)
    → server/lib/data-loader/cpi.ts (validate metadata, file names, row/series counts, period, SHA-256, monthly continuity, 2025 average≈100, required headers, finite weights, and valid 年月)
      → select complete 2025 pair; otherwise select complete 2020 pair; otherwise fail closed with invalid `getCpiDataStatus()`
      → apply selected-pair fixed weights: all-items denominator 10000; mutually exclusive 10-major-category comparison denominator 10002
      → derive `外食以外食料 = weighted 食料 − weighted 外食`; propagate source missing values to all dependent values
official all-household CTI micro CSV → official-code snapshot + series map + candidate metadata
data/source/cti_data2025.csv / data/source/cti_data2025_distribution_adjusted.csv (candidates)
data/source/cti_data.csv + cti_support_nominal.csv + cti_support_real.csv (complete 2020 rollback set)
  → server/lib/dataIo.ts → server/lib/data-loader/cpi.ts
    → match every map row to the official snapshot row-by-row; select the verified 2025 candidate or complete 2020 rollback; preserve source-basis values and missing values
GDP nominal/real annual CSVs + ready metadata + independent annual-2025 factors
  → validate both price concepts and their one 2025 annual value as one comparison set
    → verify 1994–2025 continuity and metadata/CSV/normalization-JSON hash agreement
    → valid result: generate separate raw official amounts and comparison-only normalized values for tables, CSV, tooltips, and NewGraph
    → invalid result: fail closed and omit GDP raw/comparison fields and the NewGraph GDP line without altering CTI selection
Plan21 quarterly nominal/real CSVs + metadata + official snapshots
  → server/lib/dataIo.ts (quarterly paths)
    → server/lib/data-loader/cpi.ts (84-row continuity, duplicate/missing/zero, SHA-256, and 2025Q1–Q4 factor validation)
      → getQuarterlyGdpSupportStatus(): separate status; comparisonReady is false while independent confirmation is pending
        → page.tsx: pass granularity, comparisonReady, and independentConfirmation to chart info
          → pending-independent-confirmation: fail closed; do not render the quarterly comparison line
          → ready: quarterly validation remains available internally; public projection exposes only the existing nominal/real private-consumption keys, while pending/failed remains fail-closed
data/source/{total_earning,contractual_earnings,scheduled_earnings,total_worked_hours,population_statistics,employment_indices}.csv
  → server/lib/dataIo.ts
    → server/lib/data-loader/{earnings,population}.ts (domain-specific loading + caching)

CPI / CTI / earnings / population loader results
  → server/lib/dataLoader.ts (caching wrapper with maybeCache)
    → server/lib/dataProcessor.ts (transform + clean)
      → server/lib/serverCalculations.ts (derive)
        → server/lib/view-models/dashboard.ts (project: select columns, round 2 decimals)
          → src/app/page.tsx (RSC: load + project + CPI/CTI selected data state + pass props)
            → src/app/components/CpiChart.tsx ("use client": resolve info content and pass CTI state to consumption and NewGraph UI)
```

**Key optimization:** The view-models layer reduces RSC payload from 1,169 KB to ~505 KB by removing unused columns and rounding to 2 decimal places before sending to client.

### e-Stat Request Flow

```
Browser
  → /api/estat/{stats-list,meta,data}
    → common server-side e-Stat client (server environment appId, validation, timeout, error normalization)
      → e-Stat REST API

e-Stat request failure or timeout
  → existing server-side data/source/*.csv loading for compatible dashboard indicators
```

The e-Stat proxy applies a bounded upstream timeout as a non-functional reliability
requirement; an upstream request MUST NOT wait indefinitely or expose server-side
configuration in its error result.

### Client Modules

#### src/hooks/

| Module               | Description                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `useToggleSet.ts`    | Legend toggle state (React state using `useToggleSet`)                                         |
| `useChartTheme.ts`   | Chart theme management; `isMobile` and `isTouch` (`pointer: coarse`)                           |
| `useCpiChartData.ts` | CPI chart data filtering (quarter visibility) — server-side processing complete                |
| `useUrlState.ts`     | Syncs `?from` / `?to` / `?hidden` / `?adv` with `window.history.replaceState` (R11)            |
| `useFocusTrap.ts`    | Initial focus, `Tab` containment, and scroll-preserving focus restore for modal surfaces (R8e) |

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

- Quarterly GDP regression tests MUST cover quarter-specific (not annual-repeated) values, input reordering, year boundaries, non-ready state, missing/non-finite values, and periods outside the CTI rows, while asserting CTI rows remain present and the public projection excludes internal GDP fields.

- Unit tests for data loading, transformation, and data quality/integrity (`tests/unit/`, `tests/data-quality/`)
- CPI pair integrity tests MUST unconditionally validate the 78 mapping records against `data/source/cpi-2025-official-series.csv`, including official code and name; they MUST validate the metadata-recorded source-original and snapshot SHA-256 values rather than relying only on a mapping-table hash.
- CPI loader tests MUST cover runtime validation of metadata row/series counts, period, generated-file SHA-256, monthly continuity, and 2025 all-items annual average, plus complete 2020-pair fallback when 2025 validation fails.
- CTI tests MUST require the map and snapshot to exist and MUST unconditionally match every official map row against the snapshot by official code, name, and representative values before selecting the 2025 candidate; otherwise the complete 2020 rollback is selected.
- GDP tests MUST require continuous annual observations for every year 1994–2025, valid metadata/CSV/normalization-JSON hashes, and one finite non-zero 2025 value per price concept before generating raw and comparison values. They MUST verify raw and normalized values remain separate in table, CSV, and tooltip projections, MUST NOT mix price concepts or substitute a 2020/CTI factor, and MUST assert fail-closed omission when validation fails.
- Plan21 tests MUST require both 84-row quarterly artifacts, `YYYY-Qn` continuity from 2005Q1, metadata SHA-256 agreement, separate nominal/real 2025Q1–Q4 factors, and fail-closed comparison readiness for `pending-independent-confirmation`; they MUST also retain the annual `getGdpSupportStatus()` regression contract.
- Plan21 tests MUST verify that `page.tsx` obtains `getQuarterlyGdpSupportStatus()` and propagates `granularity`, `comparisonReady`, and `independentConfirmation` to chart info, while public quarterly chart/table/CSV projections contain only the existing nominal/real private-consumption keys and none of the four GDP raw/comparison keys. Internal loader validation and the annual rollback path MUST remain available. `tests/e2e/quarterly-gdp.e2e.spec.ts` provides the public projection smoke; E2E/build execution is environment-dependent and must be recorded when not run.
- Tests that use 2020 as a prerequisite MUST be limited to the CTI rollback path; 2020 MUST NOT be used as a general GDP normalization or continuity assumption.
- Component tests for chart rendering and interaction (`tests/components/`)
- Integration tests for data mapping and computation accuracy (`tests/data-mapping/`, `tests/computation-contract/`)
- Constant/fixture tests for expected data quality (`tests/constants/`, `tests/fixtures/`)
- Performance checkpoint tests (`tests/perf-checkpoint.test.ts`)
- **Husky pre-push hook verification** (`tests/unit/husky-pre-push.test.ts`):
  - T1–T3: `check-detached-leftover.sh` detects and blocks detached HEAD commits not reachable from origin/main
  - T4–T5: Pre-push wrapper (using subprocess call, not source) correctly propagates exit codes and allows full validation sequence to run when safe
- E2E against a real build/server (`tests/e2e/`, Playwright) across three projects:
  `chromium` (Desktop Chrome), `chromium-dark` (dark mode), `mobile-pixel` (Pixel 7 / Chromium)
  - `range-change.e2e.spec.ts` — year-range filtering changes the rendered bars
  - `real-consumption.e2e.spec.ts` — Flight payload integrity for the real-consumption series
  - `mobile-ux.e2e.spec.ts` — 44px tap targets (R8b), 375px horizontal overflow (R7d),
    horizontal layout for start year, end year, and max-range button on mobile viewports,
    and `LazyMount` deferral (R12)
  - `accessibility.e2e.spec.ts` — dark-mode legend contrast (P0-3 / P1-2 regression),
    `:focus-visible` rings (P4-1), keyboard-only operation (P4-1), `prefers-reduced-motion` (P4-2),
    and modal focus management — scroll preservation on dismiss & `Tab` containment (R8e)
  - `cagr-sheet.e2e.spec.ts` — CAGR コンパクトシートの開閉・計算導線・グラフ可視性（R18）
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
