# Specification: Economic Indicators Dashboard (nextjstest)

## Purpose

A dashboard application to visualize and track Japanese economic indicators — CPI (Consumer Price Index), CTI (Consumption Trend Index micro), wage statistics, and population trends. CPI selects its complete validated 2025-base set when available. CTI 2025 candidates are selectable only after the official map and snapshot pass official-row-level matching. GDP comparison readiness is assessed independently from CTI: verified nominal and real annual artifacts must cover every year from 1994 through 2025 and pass metadata, CSV, and normalization-JSON hash checks. Successful validation generates separate raw and comparison values; comparison-only normalization never overwrites official source values, and incomplete validation fails closed.

Phase 1-1〜1-3の内部責務分割は、公開UI挙動、公開データモデル、loader/APIレスポンス、API routes、URL形式、storage key、Server/Client境界を変更しない。新設hookの内部型は公開データモデルではない。

### CpiChart composition

`CpiChart` SHALL remain the composition root for chart state, hooks, derived data,
section navigation, filters, and data-table specification generation. The seven
chart section renderings SHALL be provided by `CpiChartSections` without changing
the existing DOM contract or chart props.

#### Scenario CpiChart section extraction

- **WHEN** the CPI chart is rendered
- **THEN** the seven sections retain their existing order, ids, lazy-mount attributes, chart test ids, tooltip bindings, advanced toggle, labels, and data-table links
- **AND** `CpiChart` continues to generate `dataTables` and passes the calculated props to `CpiChartSections`

## Data Model

### CpiData (src/types/data.ts)

The shared data type with an index signature `[key: string]: string | number` for extensibility. Below are the explicitly defined fields; additional fields are added at runtime by each data loader.

| Field                                                   | Type           | Description                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 年月                                                    | string         | Public period label; quarterly views use `label` such as `2025Q1` (and `年月` is the same `YYYYQn` label), while monthly views use `YYYY年M月`                                                                                                     |
| 総合                                                    | number         | Displayed all-items index: CPI and earnings both use the 2025 calendar-year average = 100 display basis; any source or compatibility basis is normalized separately                                                                                |
| 生鮮食品を除く総合                                      | number         | CPI excluding Fresh Food                                                                                                                                                                                                                           |
| 持家の帰属家賃を除く総合                                | number         | CPI excluding Imputed Rent                                                                                                                                                                                                                         |
| 民間最終消費支出（名目・原値） / （実質・原値）         | number \| null | GDP private final consumption official raw amount. The loader emits these only when the complete nominal-and-real GDP comparison set validates; nominal is current prices and real is previous-year chain-linked with its recorded reference year. |
| 民間最終消費支出（名目・比較指数） / （実質・比較指数） | number \| null | GDP comparison-only normalized value; separate from official raw values and omitted when either verified 2025 annual value is absent or invalid.                                                                                                   |
| 民間最終消費支出（四半期raw）                           | number \| null | Plan21 original-series quarterly official amount, keyed by `YYYY-Qn`; nominal and real remain separate.                                                                                                                                            |
| 民間最終消費支出（四半期比較指数）                      | number \| null | Quarterly GDP reference index on the 2025 calendar-year average = 100 basis (the 2025Q1–Q4 average), emitted only when independent confirmation is `ready`; pending status is fail-closed.                                                         |
| CTI消費支出（参考）                                     | number \| null | Displayed all-household CTI consumption expenditure index on the 2025 calendar-year average = 100 basis (12MA; official availability begins in 2017; no legacy CTI connection)                                                                     |
| 消費支出（参考）                                        | number         | Compatibility consumption-expenditure series, displayed on the 2025 calendar-year average = 100 basis after normalization; its possible 2020 source basis is not the display basis                                                                 |
| CPI総合(参考)                                           | number         | CPI All Items reference index on the 2025 calendar-year average = 100 display basis                                                                                                                                                                |

**Major runtime-added fields per data loader:**

| Loader                        | Example fields                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPI (`loadCpiData`)           | 生鮮食品及びエネルギーを除く総合, 食料（酒類を除く）及びエネルギーを除く総合, 外食以外食料, 交通・自動車等関係費, 選択済みCPIペアの固定ウェイト加重費目 (住居, 家具・家事用品, 教育, …) |
| CTI (`loadCtiData`)           | 消費支出（名目/実質）, 食料/住居/光熱・水道/…（名目/実質）, その他の消費支出（名目/実質）, 民間最終消費支出（名目/実質）                                                                |
| 賃金 (`loadTotalEarningData`) | 所定内給与, 所定外給与, 特別給与, 時間当たり給与, 15歳以上国民当たり給与, 残差, \*(12MA) 系列                                                                                           |

All displayed salary, CPI, CTI-consumption, and GDP-reference index series use
the 2025 calendar-year average = 100. A 2020-base source or compatibility set
describes acquisition/compatibility provenance only and MUST be normalized to
the 2025 display basis; it MUST NOT be treated as the display base year. The
給与物価差 uses the same-basis salary index minus CPI index, applies a 2-month
moving average, and then sets the 2025 calendar-year average to 0.

### PopulationData (src/types/index.ts)

| Field | Type   | Description      |
| ----- | ------ | ---------------- |
| total | number | Total population |
| index | number | Indexed value    |
| ma    | number | Moving average   |

### Data Sources

Browser state sources are explicit and remain separate from server data
sources: `from`, `to`, `hidden`, and `adv` are read from the URL by
`useUrlState`, where `hidden` represents only CpiChart's stacked-series
visibility (`stackedHiddenKeys`); `newGraphShowAdvanced` is written to
localStorage by `useAdvancedPreference` but is not read for initialization;
and section, quarter, normal-legend (`hiddenKeys`), moving-average-legend
(`maHiddenKeys`), nominal/real, and CAGR interaction state is held in React
state. The `theme` storage key is used by `ThemeToggle` for `light` and `dark`,
and is removed for `system`; theme has no URL key. A non-`light`/`dark` legacy
value is retained through the current `as Theme` assertion and therefore
renders the existing `undefined` label/icon result; no fallback is added.
Theme storage reads throw through the current initial evaluation path, while
only the `setItem`/`removeItem` write operations are absorbed during interaction;
DOM theme application and React state updates continue after a write failure. No browser-state source changes
the server-loaded data model.

Hook execution inputs are derived from the Git state being validated, not from
the working-tree default branch: pre-commit reads the staged path list, while
pre-push consumes every ref line supplied by Git and classifies the actual
remote-oid to local-oid diff. `PREPUSH_PROFILE` accepts `full` or `changed`;
an unset value defaults to `changed`, and any other value is treated as the
safe `full` profile. Pre-push retains only safe repository-relative source,
server, and test paths as related-test candidates; unsafe, empty, malformed,
unresolvable, or otherwise indeterminate input selects the full profile.

Static CSV files (not publicly served) stored in `data/source/`:

- `data/source/cpi_data2025_long.csv` — Primary CPI index input, when generated: official nationwide monthly long connected index, 1970 through the latest month, converted/connected to 2025 annual average = 100.
- `data/source/contribution2025.csv` — Primary CPI weight input: published 2025-base weights per 10,000; values are retained without editing.
- `data/source/cpi_data2025_long.metadata.json` — Required provenance and readiness metadata for the 2025 pair; it identifies the index and contribution files, base year, source identifiers, expected row/series counts, covered period, generated-file SHA-256, source-original SHA-256, and official-snapshot SHA-256.
- `data/source/cpi-2025-official-series.csv` — Minimal offline snapshot of official series codes and names derived from the long-source CSV identified by `statInfId=000040482945`; it is retained for deterministic mapping verification and is not selected as a dashboard input.
- `data/source/cpi-2025-series-map.csv` — 78-series mapping table that records official series codes, dashboard keys, classification/missing-data handling, and mapping evidence; its code and name fields are verified against `cpi-2025-official-series.csv`, not merely against a hash of the mapping table itself.
- `data/source/cpi_data.csv` / `data/source/contribution.csv` — Compatible 2020-base fallback pair. They are selected together only when the complete 2025 pair cannot be validated; the 2020 source basis is normalized to the 2025 display basis and is never presented as the display base year.
- `data/source/cpi_data2025.csv` — Saved 2025-base raw monthly data beginning in 2025; it is not a long connected series and MUST NOT be selected as the dashboard CPI input.
- `data/source/cti_data2025.csv` / `cti_data2025_distribution_adjusted.csv` — 2025-base CTI candidate CSVs, each covering 2017年1月〜2026年7月. They are not selected until the adopted variant, official map, and snapshot are complete.
- `data/source/cti_data2025.metadata.json` / `cti_data2025_distribution_adjusted.metadata.json` — Candidate provenance and integrity metadata; they do not by themselves make a 2025 CTI set selectable.
- `data/source/cti-2025-series-map.csv` / `cti-2025-official-series.csv` — Official-code map and independent snapshot required to verify the adopted CTI candidate; every mapped official row is matched against the snapshot by code, name, and representative values.
- `data/source/cti_support_nominal2025.csv` / `cti_support_real2025.csv` — Official annual GDP artifacts for 1994–2025, each containing e-Stat series code 12 (`民間最終消費支出`) in 10億円. The nominal source is 0003109786 and the real source is 0003109751.
- `data/source/cti_support_nominal2025.metadata.json` / `cti_support_real2025.metadata.json` / `cti-gdp-display-normalization2025.json` — Provenance, hash, annual-period, and independent 2025 annual-value normalization records. Metadata, source CSV, and normalization JSON hashes must agree before use. Nominal remains current prices; real remains previous-year chain-linked at its recorded 2020 reference year.
- `data/source/cti_support_nominal_quarterly2025.csv` / `cti_support_real_quarterly2025.csv` — Plan21 official Cabinet Office original-series long data, 2005Q1–2025Q4 (84 rows), nominal current prices and real previous-year chain-linked values.
- Matching `.metadata.json`, `.official.csv`, and e-Stat snapshots record source URL, retrieval/revision state, CSV SHA-256, and ready independent confirmation. `gdpSupport.ts` calculates separate nominal/real average=100 factors from the quarterly CSV observations for 2025 Q1–Q4, and verifies the metadata, CSV, official, and e-Stat artifact SHA-256 consistency before comparison values are available. Invalid or unavailable confirmation disables comparison values and never silently falls back to annual data.
- Quarterly GDP transformation is implemented by the side-effect-free `server/lib/view-models/quarterlyGdpTransform.ts`; the shared `QuarterlyRow` boundary is defined in `src/types/chart.ts`, and `server/lib/view-models/quarterlyAggregation.ts` remains the compatibility adapter for `mergeQuarterlyGdpRows` and re-exports that type. The transform validates the continuous period set, keeps nominal/real period sets identical, and joins only on exact `YYYY-Qn` keys.
- `tests/fixtures/loader-comparison/golden.json` — fixed fixture-comparison contract for the validated CPI/CTI loaders, annual GDP, and quarterly GDP. The observation golden digests are CPI `d6490cfbb88a94eef4c6bc150a6b5698acbfa30c3e2bf8a5fae68648663f9f5e`, CTI `e44939cc5f6afeab444a69f3e499d30b1333f05d7d1d5c0357cd23c86869e3dd`, annual GDP `0c13f58a050723be8bafe6cd2fe13f42825f8d48749703d15535aa7613ad748c`, and quarterly GDP `147a57a94678246f9f697a9bda1c7f7f6e8ec39f23b6bb8e456fe4955a1b9b3b`. Volatile metadata timestamps are excluded from the digest contract; array ordering remains significant.
- The annual GDP golden source-artifact SHA-256 contract is: nominal CSV `9a6331e1cc0ff0f4acb8da67dbdf5ed0c2b1457122b1a1b8c990911dbce2038f`, real CSV `0c6973e2b4a2686b94a7954a5a55058a5101de05ebed316066f7d0b517e6e744`, nominal metadata `8e482d34a253360918e0acdd1c2c054e969cc3ff278761b4df9263bebed24d2f`, real metadata `b01785b1f7dc7022baddf1628b2fd16e985ef95e308a1bb1c7bb9775b537cb69`, and annual normalization JSON `359e02b2ac1b46e80de9234ac965f2d41cf915cd039a872baf1713887ad836a9`.
- The quarterly GDP golden source-artifact SHA-256 contract is: nominal CSV `0b5b4b21fcc03071973c96e4c7dfffba02eb63ee600c19de023aef1c345a49a7` and real CSV `4454cc36abdd556210e0bdea1f32055c1716d799d69368e883a39f445f1ef855`. Quarterly comparison factors are calculated from the validated 2025 Q1–Q4 CSV observations; no quarterly normalization JSON is an input artifact.
- `data/source/cti_data.csv` / `cti_support_nominal.csv` / `cti_support_real.csv` — Complete compatible 2020-base CTI rollback set; never mixed with a 2025 CTI input. If selected, its CTI consumption values are normalized for display to the 2025 calendar-year average = 100; 2020 is source/compatibility provenance only.
- CTI monthly observations are the source of truth for quarterly consumption completeness: from 2018Q1, all three normalized `YYYY年M月` records and every nominal/real consumption key must contain finite numeric values. A valid zero is retained; a missing or non-finite observation is not converted to zero.
- `data/source/total_earning.csv` — Total earnings
- `data/source/contractual_earnings.csv` — Contractual earnings
- `data/source/scheduled_earnings.csv` — Scheduled earnings
- `data/source/total_worked_hours.csv` — Total worked hours
- `data/source/population_statistics.csv` — Population statistics

Chart display metadata is sourced from `src/lib/chartConstants.ts`: the ordered
12-item `CPI_CATEGORIES` list is positionally paired with the 12-item
`stackedColors` palette at the same index. The CPI expense keys are 住居,
家具・家事用品, 被服及び履物, 保健医療, 教育, 光熱・水道, 教養娯楽,
交通・自動車等関係費, 通信, 外食以外食料, 外食, 諸雑費; their values are
validated CPI contribution/display-unit values. `EARNINGS_SERIES_REGISTRY` is the six-series salary registry;
`tooltipLabel` is the complete tooltip name and `displayName`/`legendLabel` keep
the existing legend contract. `COMPARISON_SERIES_REGISTRY` is the five-entry
comparison registry, where `tooltipLabel === legendLabel` is required; each entry
also owns `color`, `order`, and `advanced`. `projectTooltipMetadata` resolves
these fields by `key`, never from Recharts `payload.name`.

`formatCpiTooltipValue` and `formatCpiTooltipTotal` originate in
`src/app/components/CustomTooltip.tsx`. They accept CPI display-unit values and
format finite values to two decimals; null/undefined/missing/non-finite values
render as `—` and are excluded from totals. `formatCpiTooltipTotal` accepts
nullable input and returns `—` for non-finite values instead of throwing or
emitting `NaN`/`Infinity`. The applicable expense list is the keys passed to
`SpendingBarChart`: standalone GDP before 2018Q1, and CTI expense items from
2018Q1 onward.

給与ツールチップの合計対象は `EARNINGS_SERIES_REGISTRY` から投影した
`EARNINGS_TOTAL_KEYS`（`所定内給与`、`所定外給与`、`特別給与`）である。
合計はloaderの生値ではなく、給与独自の2025年平均=100基準化および特別給与の
12か月移動平均を経た表示値を使用し、補助系列3種は含めない。

Chart info は `src/lib/chartInfoContent.ts` の指標別説明を表示する。消費支出の
説明は GDP参考値、CTI合計、諸雑費・CPI外支出の関係を簡潔に示し、3種比較では
給与・GDP・CTI・CPIそれぞれの12か月移動平均を説明する。実装用のPlan22、raw値、
内部検証保持、四半期の月範囲、9大費目の列挙はユーザー向け説明に含めない。

### Data Flow

Source/compatibility data flows through normalization before public display:
salary, CPI, CTI consumption, and GDP reference indices are projected on the
2025 calendar-year average = 100 basis. A 2020-base input is provenance for
acquisition or compatibility and is not a display basis. The salary-minus-CPI
comparison uses those same-basis indices, then 2MA, then 2025-calendar-year
average = 0 rebasing.

For quarterly consumption, `loadCtiData()` normalizes monthly keys before
quarterly aggregation builds a completeness set from the original monthly
records and nominal/real CTI keys. The server aggregation and the legacy
`src/lib/math/clientCalculations.ts` path both remove incomplete 2018Q1-and-later
quarters before public projection, so `SpendingBarChart`, data tables, and CSV
share the same nominal/real row set. GDP support rows before 2018Q1 remain an
independent exact-quarter join and are not filtered by CTI completeness.

`CpiChartSections` projects CPI, salary, and comparison entries through the
shared `projectTooltipMetadata` helper. `useChartTooltipProps` passes that
projection through `useChartTooltipController` to `CustomTooltip`, which
resolves rows by `dataKey` and takes label, color, and order from the same key.
Missing registered payload values are complemented as `—`; Spending's explicit
`allowedKeys` function enforces the GDP-before-2018Q1 / CTI-from-2018Q1 boundary.
Comparison tooltip visibility uses the same advanced/hidden registry projection
as NewGraph drawing and legend, then applies the 2017Q4/2018Q1 boundary to
GDP/CTI detail rows; registered null values remain in the tooltip as `—`, so the
three surfaces have the same visible registered-series set for each period.

`allowedKeys` is applied before totals and registered metadata rows. Spending,
CPI, salary, and comparison paths retain strict filtering: when `allowedKeys` is
present, every payload key (including unknown keys) must be in that set, so
boundary-inapplicable and hidden series cannot return in detail rows or totals.
`includeUnmappedPayload` only permits the original payload-key fallback on an
explicit caller path that omits `allowedKeys`.

For the CPI `StackedAreaChart`, the visible `CPI_CATEGORIES` projection is the
tooltip row source: a normal hover renders all 12 applicable expense rows and a
`合計` row, while a hidden legend series is excluded from both the rows and the
total.

給与は `earnings loader → normalized rows → CpiChartSections` の可視metadata投影を
`useChartTooltipController` 経由で `CustomTooltip` に渡す。給与tooltipは6系列の行を
metadata順で維持し、`EARNINGS_TOTAL_KEYS` に含まれる可視行の有限な表示値だけを
給与の全表示系列は取得元の基準にかかわらず2025年平均=100へ基準化する。hidden系列は行と合計から除外するが、metadataに存在するpayload欠落行は
`—`として残す。0は有効値として0.00表示・加算し、null/undefined/NaN/Infinityは
`—`表示・非加算とする。

給与tooltipの `separatorBetweenGroups` は可視metadata投影上の給与3系列と補助3系列の境界だけを
装飾する。表示中の各グループを再計算して補助系列の先頭行へ境界を移動し、どちらか一方の
グループが空なら境界を生成しない。CPI・消費支出・比較tooltipはこの指定を受け取らず、行順・
表示値・読み上げ内容は変わらない。

### Component Tree

`CpiChart` → `CpiChartSections` → `NewGraph`, `EarningsBreakdownChart`, and
`SpendingBarChart`. `CustomTooltip` is the shared display contract consumed by
those charts through `useChartTooltipProps`. `ChartLegend` and each inline
legend preserve registry/key order, label, color, hidden state, and advanced
state; NewGraph additionally retains defined legend entries for all-null data.
Drawing, legend, and tooltip bind to the same metadata keys while retaining
each chart's existing renderer.

`SpendingBarChart` receives only complete quarterly consumption rows from the
public projection (or the synchronized legacy calculation path). The table and
CSV consume that same filtered row collection; GDP support values remain
independent and may still be null at the existing 2017Q4/2018Q1 boundary.

- `data/source/population_statistics.metadata.json` — 総務省統計局「労働力調査（基本集計）」長期時系列 表1-b-1（e-Stat `statInfId=000031831366`）の取得URL、表ID、取得日時、公式Excelサイズ/SHA-256、欠測ポリシーを記録する。
- `data/source/employment_indices.csv` — Employment indices
- `data/source/hon-mks202512.csv` — 毎月勤労統計調査の生データ（常用労働者数、出勤日数、実労働時間数、現金給与額）
- `data/source/hon-mks202606.xls` / `earnings_method_b_202606.csv` — Plan26方式Bの公式一括原表と、実数原表から抽出した2026-06確報5系列の断面成果物。既存の指数・前年比履歴CSVとは単位と定義が異なるため混在させない。
- `data/source/employment_indices.metadata.json` — `employment_indices.csv` の公式長期指数系列（statInfId `000032189777`、TL/T/0、取得元は2020年平均=100）の出典・抽出条件・SHA-256。取得元の2020年基準は表示基準ではなく、断面 `hon-mks202606.xls` はこの系列へ混在させない。
- `data/source/earnings_method_b_202606.metadata.json` — 方式Bの取得元URL、統計表ID、シート、表頭、対象区分、単位、確報状態、SHA-256、系列対応表を記録する。
- 方式Bの断面抽出は公式履歴CSVと単位・期間が互換でないため、履歴入力へ自動連結せず、5月・6月など未取得月を補完しない。履歴ファイルが対象系列・対象区分・単位・改訂状態を満たすまで、既存の検証済み履歴と表示範囲を維持する。
- `data/source/cti_support_nominal.csv` / `data/source/cti_support_real.csv` — CTI supporting series

Tooltip group separators use no additional source data: the salary-only boundary is derived from
the visible metadata projection and does not change source values or accessible row content.

For CPI, these candidate files are resolved and validated as complete same-base
pairs by `server/lib/data-loader/cpiSource.ts`. The 2025 metadata is resolved and
validated there before the 2025 pair is eligible; `server/lib/data-loader/cpiValidation.ts`
parses and validates CPI index/contribution CSV content, and
`server/lib/data-loader/cpiLoader.ts` performs the pure CPI transformation and row
mapping. `server/lib/data-loader/cpi.ts` is the internal CPI/CTI/GDP/quarterly adapter;
`server/lib/dataLoader.ts` is the sole public loader/status facade and delegates to
the internal loader modules. These responsibilities do not change the public
loader/API contracts or SSR boundary.

The fixture-comparison gate is a test-only source contract. It compares loader
observations and status/error observations independently; it does not add a
runtime cache layer. Its cache result is explicitly `not-applicable: no runtime
cache wrapper`.

The e-Stat API route files under `src/app/api/estat/*` remain an independent
same-origin source boundary and are outside the Phase 2-5 facade refactoring
path. They are not changed by that phase; this is confirmed by static inspection.

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

Support-series normalization is a shared, server-independent domain calculation. Its source values
remain the validated GDP/CTI support CSVs above; source loading and validation stay server-only.
`server/lib/data-loader/gdpSupport.ts` and `src/lib/clientCalculations.ts` directly use the shared
pure domain at `src/lib/math/supportSeries.ts`; `server/lib/math/supportSeries.ts` remains only the
void-compatible compatibility adapter/re-export for existing server-side imports. The shared pure
`scaleSupportSeries` preserves missing, `NaN`, `±Infinity`, and out-of-period values without fabricating
finite zeroes and never mutates input rows. The server void `applySupportSeriesScaling` and client
compatibility adapter retain the legacy zero-fill/`value || 0` behavior. The annual normalizer fails closed
unless given exactly one positive finite value. Public JSON shape and SSR boundary are unchanged.

- **WHEN** validated annual or quarterly support CSV values are normalized or scaled
- **THEN** server-side loading and validation supply inputs to the shared pure domain, while client
  and server use the same formulas without a client-to-server dependency
- **AND** the shared pure scale preserves missing, `NaN`, `±Infinity`, and out-of-period values without
  fabricating finite zeroes, while the server void adapter and client compatibility adapter retain legacy
  zero-fill/`value || 0` behavior; the annual normalizer fails closed for any input other than one positive finite value
- **AND** the established 2025 display basis and rounding are preserved; a 2020 source or compatibility basis remains provenance and is not treated as the display basis

## Requirements

### R-Hooks: Commit and Push Validation Architecture

#### Scenario R-Hooks-0: Husky `sh` launcher reaches Bash implementations

- **WHEN** Husky invokes either hook through its generated `sh -e` launcher
- **THEN** `.husky/pre-commit` and `.husky/pre-push` are POSIX-compatible thin
  wrappers that `exec bash -e` the corresponding `.bash` implementation and
  forward `"$@"`
- **AND** all Bash-only syntax and shared-library references remain in
  `.husky/pre-commit.bash` and `.husky/pre-push.bash`, respectively
- **AND** the generated `.husky/_/*` files are not edited

#### Scenario R-Hooks-1: Staged pre-commit typecheck decision

- **WHEN** a commit is attempted
- **THEN** `lint:fast` runs first, the staged path classifier requires full
  typecheck for type-bearing/configuration changes and for unsafe deletion,
  rename, or unavailable decisions, and `tsgo --noEmit` runs before
  commit-scoped `lint-staged`
- **AND WHEN** staged changes are limited to documentation, assets, or other
  non-type paths
- **THEN** typecheck is skipped and `lint-staged` still runs
- **AND** a zero-test result is tolerated only by the commit-scoped
  lint-staged related-test task

#### Scenario R-Hooks-2: Actual pre-push ref classification

- **WHEN** a push is attempted
- **THEN** every Git pre-push ref line is validated and its remote-oid to
  local-oid diff is classified; refs are unioned before profile selection
- **AND WHEN** a ref is initial/deleted, malformed, unresolved, shallow, or
  its diff cannot be inspected safely, or a configuration/dependency,
  Playwright, E2E, build, generated, OpenSpec, unknown, deletion, or rename
  path is present
- **THEN** the `full` profile is selected as the safe fallback
- **AND WHEN** only safe repository-relative source/server/test candidates are
  present
- **THEN** the `changed` profile may select those candidates for related tests

#### Scenario R-Hooks-3: Pre-push profile normalization and related fallback

- **WHEN** `PREPUSH_PROFILE` is unset, `changed` is selected; **WHEN** it is
  `full` or `changed`, that profile is used; **WHEN** it has any other value,
  the safe `full` profile is selected
- **WHEN** the changed profile has safe candidates
- **THEN** `vitest related --run --passWithNoTests` runs with JSON output, and
  a valid result with at least one `testResults` entry permits the changed
  gate to continue
- **WHEN** candidates are empty/unsafe, JSON is missing, invalid, or
  incompatible, `testResults` is empty, or related execution fails
- **THEN** the full profile runs exactly once

#### Scenario R-Hooks-4: Full and changed gate order

- **WHEN** the changed profile succeeds
- **THEN** `build` runs before `test:e2e:clean` and `test:e2e`
- **WHEN** the full profile runs
- **THEN** gates execute in order: `lint:fast`, `type-check`, `test:all`,
  `build`, `test:build-parity`, `security-check`, `test:e2e:clean`, and
  `test:e2e`
- **AND WHEN** any gate fails
- **THEN** later gates do not run
- **AND** production validation is a separate gate and is not substituted for
  local pre-push validation when production URL/network availability is not
  established

#### Scenario R-Hooks-5: Isolated validation-detection audit

- **WHEN** `pnpm run audit:validation-detection -- --output /tmp/plan31-validation-detection.json` is invoked
- **THEN** it creates and removes an OS-temporary fixture, emits schema
  `nextjstest.validation-detection v1.0.0` JSON evidence for 12 classification
  cases, and does not modify the shared worktree, Git index, `.next`, existing
  PIDs, or shared remotes
- **AND** the measured classification precision, recall, and accuracy are `1`,
  and full-gate failure detection rate is `1` for lint, type-check, unit, build,
  build-parity, security, and E2E injections
- **AND** each injected full-gate failure exits nonzero, stops subsequent gates,
  and does not write the push marker
- **AND** changed-E2E detection rate is `1`; changed execution order is
  `related → build → e2e`, with a nonzero failure and no marker on failure and
  a marker on success
- **AND** the fixture cleanup status is `completed`, the artifact remains in OS
  temporary storage rather than the shared repository, and the audit does not
  claim to measure real application lint, type-check, build, or browser failure
  detection, real push, CI, or production validation
- **WHEN** a representative path classification or injected gate/E2E contract
  does not match the documented result
- **THEN** the audit exits non-zero and preserves failure details when the
  artifact can be written

### R4-4: Public chart data contract and export parity

- **WHEN** any of the seven chart/table/CSV targets is rendered or exported
- **THEN** it SHALL expose the normalized data actually passed to its chart through `data-testid="chart-data-contract"`, `data-series`, `data-points`, and child `data-period`, `data-series-key`, `data-value`, and `data-value-type` attributes
- **AND** chart, table, and CSV SHALL use the same normalized display model, including explicit null/missing values
- **AND** SVG path/class/geometry/coordinates SHALL remain implementation details; SVG checks are limited to non-empty rendering and series visibility smoke checks
- **WHEN** CSV is serialized
- **THEN** every RFC4180 record SHALL be terminated by CRLF, including the final record, while comma, quote, CR, and LF escaping and quote round-trip remain valid
- **WHEN** parity tests run
- **THEN** the production Playwright E2E layer SHALL compare all rows and columns for all seven targets and cover hidden, `adv=1`, nominal/real, and GDP boundary labels `2017Q4` / `2018Q1`
- **AND** integration tests SHALL use the independent hand-written fixture `tests/fixtures/chart-parity-independent.json` at the real component boundary, while unit tests own CSV serializer edge cases; fixture expectations SHALL not be generated from app constants or the DOM
- **AND** integration GDP-boundary checks SHALL read the public nominal/real quarterly table rows (`2017Q4` and `2018Q1`) from that fixture; monthly CPI rows are not treated as quarterly GDP evidence
- **AND** integration contract collection SHALL resolve each contract within its owning section id, so lazy/dynamic wrappers cannot change the seven-target mapping
- **AND** the `adv=1` NewGraph check SHALL retain all-row/all-column equality across the advanced table, CSV, and `ChartDataContract`, while independently checking only the two fixture anchors (`2018年1月` and `2025年12月`) for period/value; full-period advanced branching and display coverage SHALL remain delegated to the existing advanced-series E2E
- **AND** this public contract SHALL NOT require an advanced extension in the nominal or real Spending charts
- **AND** nominal and real quarterly chart, contract DOM, table, and CSV rows SHALL use the same complete selected-period row set; no latest-twelve-row truncation is applied
- **AND** advanced anchor expectations SHALL be calculated from the independent frozen GDP-comparison input in `tests/fixtures/chart-parity-advanced.json`; the raw-quality fixture `tests/fixtures/minkan-extension-anchors.json` SHALL remain reserved for raw normalization checks and SHALL NOT define this production-path expectation
- **AND** nominal and real SHALL be distinguished by their owning section context and public `ChartDataContract` keys, while each table retains the public label `民間最終消費`; header text SHALL NOT be required to contain `名目` or `実質`
- **AND** Phase 4-4 is complete (implementation, audit, and verification): `pnpm test` passed with 55 files / 486 tests, the targeted Chromium E2E passed 5/5, `pnpm test:build-parity` passed 3/3, `pnpm type-check` passed, `pnpm lint` passed with 0 errors / 5 warnings, `pnpm build` passed, and `git diff --check` passed

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
    - Uses the difference between the 2025 calendar-year average = 100 salary index and the same-basis CPI index; it is a comparison-only field and does not rewrite CPI, CTI, earnings, or GDP source values.
    - The index difference is smoothed with a 2-month moving average (2MA), then rebased so that its 2025 calendar-year average is 0 when every required series has 12 valid months.
  - NewGraph (supplementary view, 3種比較):
    - Displays four main series in legend order: 物価指数(総合), 給与(総合), CTI消費(総合), 民間最終消費(総合); all four are displayed as indices with the 2025 calendar-year average = 100.
    - GDP reference and CTI consumption are shown as separate series with `null` outside their validated active periods so lines correctly truncate instead of dropping to zero.
    - CTI begins in its official 2017 availability range and is not connected to a legacy CTI series. GDP and CTI remain separate lines.
    - NewGraph receives GDP comparison indices normalized to the 2025 annual average; a GDP line is omitted when the required GDP data is unavailable, regardless of the CTI state.
    - Also includes an advanced reference-only series "民間最終消費支出（参考・延長）" (2018-) which is hidden by default and can be enabled via `?adv=1` URL query parameter or the lower toggle in the ⓘ info panel; the regular "民間最終消費支出（参考）" covers through 2017, and both boundary series derive from the same `maMinkan * minkanFactor` values.
    - When `adv=1` is enabled, only the NewGraph renders the 2018年以降の「民間最終消費支出（参考・延長）」 series; nominal and real quarterly Spending charts keep the regular public key set and the default GDP-before-2018Q1 / CTI-from-2018Q1 boundary. Quarterly public labels remain `YYYYQn`.
    - When validated GDP comparison is available, it is preferred as the `minkanMap` input for the advanced series; that map is expanded to monthly values and then smoothed with a 12-month moving average.
  - Time-series charts render the first/last (start year / end year) tick label in `--foreground` via the shared `XAxisEdgeTick` component (`src/app/components/charts/XAxisEdgeTick.tsx`), while other tick labels use the default `--chart-text` color. MajorIndicesChart, ResidualAreaChart, NewGraph, EarningsBreakdownChart, and StackedAreaChart delegate their XAxis configuration to `TimeSeriesXAxis`.
  - Time-series charts use the shared period-based tick policy for their year/month axis. MajorIndicesChart, ResidualAreaChart, NewGraph, EarningsBreakdownChart, and StackedAreaChart use `TimeSeriesXAxis`; its boundary-tick policy is equivalent to `includeBoundaryTicks: false` for these charts. The axis displays only the start/end labels and data-present round-number milestones (2010/1, 2015/1, 2020/1, 2025/1); non-round series-boundary labels such as 2017/12・2018/1 are omitted because the hand-off remains visible through reference lines. The shared selector preserves endpoints, de-duplicates label values, and suppresses milestone candidates within the configured period distance of either endpoint; endpoint labels retain the existing centered `text-anchor="middle"` behavior. On mobile, `XAxisEdgeTick` avoids rendering an interior tick close enough to overlap an endpoint label.

#### Scenario R2c: Data-driven earnings derivation

- **WHEN** the five earnings inputs (three wage series, worked hours, and employment) and population observations share compatible target, unit, and revision metadata, have a complete consecutive 12-month window, and the 2025 calendar-year factors can be calculated
- **THEN** hourly and per-capita earnings are calculated from those observations, including 2026年5月 and 2026年6月 when their current CSV values are complete
- **WHEN** any required observation, metadata match, 12-month window, or 2025 factor is missing
- **THEN** the affected derived value is `null`; no date-based cutoff, zero substitution, or gap filling is applied, and legitimate zero inputs remain zero

#### Scenario R2ba: Displayed-value Y-axis upper bounds

- **WHEN** MajorIndicesChart, StackedAreaChart, SpendingBarChart, or EarningsBreakdownChart is rendered
- **THEN** its Y-axis upper bound is the nearest integer to the maximum displayed value plus 3
- **AND** hidden series are excluded from that maximum
- **AND** for StackedAreaChart, the candidate maximum at each time point is the sum of the visible series at that time, and the nearest integer to the largest such sum plus 3 is used
- **AND** for ResidualAreaChart (給与物価差) and NewGraph (3種比較), the existing automatic Y-axis maximum behavior is preserved
- **AND** non-finite and missing values do not contribute to the maximum

#### Scenario R2c: Legacy GDP Bars and CTI Consumption Bars

- **WHEN** nominal or real consumption data is rendered in `SpendingBarChart`
- **THEN** 2017Q4以前はGDP比較値だけを単独のBarとして描画する
- **AND** 2018Q1以降は検証済みCTI費目だけを積み上げBarとして描画する
- **AND** GDPとCTIを同一四半期に同時表示・合算せず、GDP Lineは描画しない
- **AND** 2018Q1以降の表示データ、凡例、tooltipからGDP比較値を除外する
- **AND** GDP欠損を0埋めせず、境界で値の複製・補間・表示用係数合わせをしない
- **AND** 消費支出グラフはモバイル専用の余白・safe-area、棒幅・間隔を適用し、横overflowを発生させない
- **AND** tooltipはモバイルでも全費目を内部スクロール付きで表示する

#### Scenario R2c-missing-data: Quarterly CTI completeness and parity

- **WHEN** a 2018Q1-or-later CTI quarter lacks any of its three normalized monthly records, or any nominal/real consumption key is missing or non-finite
- **THEN** that quarter is omitted from both nominal and real public rows without generating a zero row
- **AND** the chart, tooltip, data table, and CSV expose the same remaining quarter labels
- **AND WHEN** all three monthly observations are present and a consumption value is zero
- **THEN** the quarter remains visible as a valid zero-valued quarter
- **AND WHEN** `hiddenQuarters` or the displayed year range is changed
- **THEN** filtering is applied to the already-complete row set and cannot restore an omitted quarter
- **AND** GDP rows through 2017Q4 and GDP null handling remain independent of CTI completeness

#### Scenario R2c-axis: Spending chart quarterly X-axis ticks

- **WHEN** `SpendingBarChart` renders quarterly data
- **THEN** its candidate ticks are selected by the shared period-based tick core using the Q1 rows for fixed calendar years 2010, 2015, 2020, and 2025, limited to years present in the data range
- **AND** the first and last data labels are always retained as endpoints, including a one-row dataset or a dataset beginning outside Q1
- **AND** a candidate within 12 quarters of either endpoint is suppressed
- **AND** labels with the same value are emitted only once, even when distinct data objects share that label
- **AND** every emitted label uses the `YYYYQn` format

#### Scenario R2c-axis-mobile: Spending chart mobile endpoint labels

- **WHEN** `SpendingBarChart` renders on a mobile viewport (≤768px)
- **THEN** its `XAxisEdgeTick` receives `avoidEndpointOverlap`
- **AND** interior ticks near either endpoint are omitted at render time
- **AND** the mobile selector does not impose a fixed candidate-count cap; eligible milestones remain subject to the shared endpoint-gap and duplicate-label rules
- **AND** no collision detection is added between interior tick labels

### R3: Data Transformation (Server-Side)

#### Scenario R3p: Official Population Data and Missing Values

- **WHEN** population statistics are loaded
- **THEN** the source is the official nationwide, both-sexes, original-value series in table 1-b-1 and its provenance metadata is present
- **AND** official 2026-05 and 2026-06 totals are 10,976 and 10,969万人 respectively
- **AND WHEN** a population observation is missing
- **THEN** it remains missing and is never treated as zero, interpolated, or otherwise inferred
- **AND** dependent 15歳以上国民当たり給与 values remain missing when their population moving-average window is incomplete
- **AND** dependent hourly and per-capita wage values remain missing when their related hours/employment inputs are incomplete

The system SHALL load and process CSV data on the server before rendering.

#### Scenario R3a: CPI Pair Selection and Data Loading

- **WHEN** `loadCpiData()` is called
- **THEN** the public loader contract in `server/lib/dataLoader.ts` delegates to the internal CPI loader without changing its public name, arguments, return shape, or server-only execution boundary
- **AND** the internal CPI loader delegates source discovery and pair selection to `server/lib/data-loader/cpiSource.ts`, CSV parsing and content validation to `server/lib/data-loader/cpiValidation.ts`, and pure CPI conversion and row mapping to `server/lib/data-loader/cpiLoader.ts`
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

#### Scenario R3a1: CPI Loader Responsibility Boundaries

- **WHEN** CPI source selection is performed
- **THEN** `cpiSource.ts` resolves the candidate paths, resolves and validates 2025 metadata, validates each index/contribution pair, and owns the selection order 2025 first, complete 2020 fallback second, and fail-closed when neither pair validates
- **AND WHEN** a validated pair is handed to the CPI transformation path
- **THEN** `cpiLoader.ts` owns pure CPI conversion: the 2004-and-later filter, weight denominators, missing-value propagation, derived series, and removal of unnecessary series
- **AND** `cpiValidation.ts` owns CPI index/contribution CSV parsing plus header and content validation
- **AND** `cpi.ts` owns the internal CPI status/load adapter and continues to own CTI, annual GDP, and quarterly GDP loading; `dataLoader.ts` owns the public facade
- **AND** no CPI source-resolution, pair-selection, CSV-validation, or pure CPI-transformation responsibility is moved back into `cpi.ts`

#### Scenario R3a2: Public CPI Adapter Compatibility and Selection Outcomes

- **WHEN** the public `loadCpiData()` adapter is called with a valid 2025 candidate pair
- **THEN** it preserves the existing public rows and status contract and returns rows transformed from the validated 2025 pair
- **AND** source candidate-path resolution, metadata resolution/validation, and pair selection are performed by `cpiSource.ts`
- **AND** CPI CSV/contribution parsing and header/content validation are performed by `cpiValidation.ts`
- **AND** pure CPI conversion and row mapping are performed by `cpiLoader.ts`, while `cpi.ts` provides the internal status/load adapter behind `dataLoader.ts`
- **WHEN** the 2025 candidate is missing or invalid and the complete compatible 2020 pair validates
- **THEN** the same public `loadCpiData()` contract returns rows from the 2020 fallback pair without mixing base years
- **WHEN** neither the 2025 pair nor the complete 2020 pair validates
- **THEN** the same public adapter returns no CPI rows and `getCpiDataStatus()` reports `valid: false` with no selected base year or pair
- **AND** CTI, annual GDP, and quarterly GDP source selection, transformation, status, and public projection contracts remain unchanged in all three outcomes

#### Scenario R3ab: 2025 Series Mapping

- **WHEN** the 2025 long connected index is generated or maintained
- **THEN** `cpi-2025-series-map.csv` provides a traceable mapping for all 78 supported official series, including official series code, dashboard key, classification or derivation handling, start month, missing-data policy, and source evidence
- **AND** every mapping code and official name is unconditionally checked against `cpi-2025-official-series.csv`, whose SHA-256 and its `statInfId=000040482945` source-original SHA-256 are recorded in the metadata; the verification MUST NOT be conditionally skipped or replaced by a hash of the mapping table itself
- **AND** an official series with no confirmed equivalent is retained as missing rather than fabricated as zero or substituted by name alone

#### Scenario R3e: CPI Fixed-Weight Derivation

- **WHEN** CPI category values are transformed for display
- **THEN** `cpiLoader.ts` filters input rows to 2004年以降 and each available official index is multiplied by the published weight from the selected same-base pair
- **AND** all-items calculations use the published all-items denominator of 10,000
- **AND** mutually exclusive 10-major-category comparisons use the actual sum of their published weights as the denominator, without changing the CSV values; the 2025 weights total 10002
- **AND** the resulting values are fixed-weighted index levels displayed on the 2025 calendar-year average = 100 basis, not official month-on-month or year-on-year contribution measures
- **AND** the pure transformation does not perform source discovery, metadata resolution, or CSV validation

#### Scenario R3f: CPI Derived Values and Missing Data

- **WHEN** both weighted `食料` and weighted `外食` are available for a month
- **THEN** `外食以外食料` equals weighted `食料` minus weighted `外食`, so weighted `食料 = 外食以外食料 + 外食`
- **AND WHEN** either source value is missing or non-finite
- **THEN** the dependent weighted and derived values remain missing and are never replaced with zero
- **AND** `cpiLoader.ts` removes the unnecessary `教養娯楽サービス`, `教養娯楽用品`, `交通`, and `自動車等関係費` output series after deriving the combined series

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

#### Scenario R3h1: Unchanged CTI, GDP, and Quarterly Contracts

- **WHEN** the CPI source-responsibility split is used
- **THEN** CTI selection/transformation and its public loader contract remain unchanged
- **AND** annual GDP validation, normalization, raw/comparison separation, and its public status contract remain unchanged and independent of CPI/CTI selection
- **AND** quarterly GDP validation, status propagation, public projection, and fail-closed behavior remain unchanged and do not fall back to annual GDP

#### Scenario R3b: CTI / Earnings / Consumption Data Loading

- **WHEN** `loadCtiData()` / `loadTotalEarningData()` / consumption map builder is called
- **THEN** it selects a complete, verified 2025 CTI set only when the adopted CTI CSV, metadata, official map, and official snapshot validate; otherwise it selects the complete compatible 2020 rollback set
- **AND** it validates the CTI set and the nominal/real GDP comparison set independently and never treats GDP availability or a CTI base year as a condition for CTI selection
- **AND** it matches every adopted CTI map row to the official snapshot row-by-row, including official code, name, and representative values
- **AND** it returns an explicit unavailable state when neither complete set is valid
- **AND** missing CTI inputs remain missing; they are not converted to zero, and a derived residual is missing when any required component is missing.

When the CTI map/snapshot or any other candidate input fails validation, the complete 2020 CTI rollback is selected. When the annual nominal/real GDP pair passes its independent validation, `getGdpSupportStatus()` reports available GDP comparison normalization without affecting CTI selection.

#### Scenario R3d: CTI Source Basis, 12MA, and Comparison Rebase

- **WHEN** a validated selected CTI series (2025 candidate or complete compatible 2020 rollback) is used for the consumption charts
- **THEN** the chart and data table retain its official source basis; the source basis is not overwritten by comparison normalization
- **AND** CTI consumption expenditure is displayed as an index rebased to the 2025 calendar-year average = 100; a selected 2020-compatible source is normalized to that display basis and is not identified as a 2020 display base
- **AND WHEN** a 3種比較 or wage-price-difference field is generated
- **THEN** its component series use the 2025 calendar-year average = 100 display basis, its 12MA is calculated from continuous raw values first, and its display factor is derived only from the corresponding raw calendar-year average
- **AND** the comparison field is omitted when the 2025 average cannot be verified from 12 valid months.

#### Scenario R3d-advanced: GDP comparison priority for monthly extension

- **WHEN** a validated annual GDP comparison set is available while the advanced reference series is generated
- **THEN** the production path SHALL prefer the GDP comparison values for `minkanMap`, expand them to monthly values, and calculate the 12-month moving average before display
- **AND** a raw normalization fixture used for data-quality evidence SHALL remain separate from this production-path expectation

#### Scenario R3i: GDP Raw and Comparison Values

- **WHEN** GDP has complete, verified annual observations through 2025 and one finite non-zero 2025 value per price concept
- **THEN** annual coverage is continuous for every year 1994–2025 and metadata, source CSV, and normalization JSON SHA-256 values agree
- **THEN** nominal and real GDP each receive their own 2025 annual-value normalization factor for the comparison view
- **AND** GDP reference values exposed as indices use the 2025 calendar-year average = 100 display basis; the official raw amount and any source reference-year basis remain separate
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

#### Scenario R3l: Fixture Comparison Gate

- **WHEN** the fixture comparison gate observes the normal loader path
- **THEN** CPI, CTI, annual GDP, and quarterly GDP observations match the fixed golden digests recorded in `tests/fixtures/loader-comparison/golden.json`
- **AND** the annual GDP nominal/real CSVs, metadata files, and annual normalization JSON, and the quarterly nominal/real CSVs plus their metadata, official snapshots, and e-Stat snapshots match their recorded source artifact SHA-256 values
- **AND** value, status, and load/status-error observations are compared independently, with normal observations reporting the expected valid/ready state
- **WHEN** the 2025 CPI or CTI candidate is unavailable or invalid
- **THEN** the complete validated 2020 pair/set is selected, without mixing base years, and the rollback remains covered by the fixture gate
- **WHEN** any annual GDP source artifact is missing or invalid, or annual coverage is not continuous for every year 1994–2025
- **THEN** GDP validation fails closed and none of `民間最終消費支出（名目）`, `民間最終消費支出（実質）`, `民間最終消費支出（名目・原値）`, `民間最終消費支出（実質・原値）`, `民間最終消費支出（名目・比較指数）`, or `民間最終消費支出（実質・比較指数）` is emitted
- **WHEN** quarterly GDP artifacts are missing, contain duplicate/non-continuous periods, or contain non-finite values
- **THEN** the quarterly result is `{ rows: [], comparisonReady: false }`, its independent confirmation is failed, and it does not fall back to annual GDP or remove CTI rows
- **AND WHEN** quarterly GDP validation is normal
- **THEN** nominal and real periods form the exact continuous sequence `2005-Q1` through `2025-Q4` (84 rows), with separate quarter-specific values and comparison factors calculated from the validated 2025Q1–Q4 CSV observations
- **AND WHEN** the fixture gate records cache behavior
- **THEN** it records `not-applicable: no runtime cache wrapper`; no runtime cache wrapper is required or inferred by this gate

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
- **AND** the quarterly public chart, data-table, and CSV surfaces use the same complete selected `YYYYQn` period set
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

#### Scenario R4c: Collapsed Legend Accordion (Mobile Consumption)

- **WHEN** either 消費支出（名目） or 消費支出（実質） section renders on a mobile viewport (≤768px)
- **THEN** its legend is placed in a native `<details>` accordion that is **closed by default**
- **AND** the closed summary is a single line and shows the selected expense-item and quarter counts, and whether filtering is active
- **AND** the summary does not display a separate 四半期 heading
- **AND** the real chart displays a link note to the nominal consumption section, while the nominal chart does not display that note
- **AND WHEN** the user opens the accordion
- **THEN** the same quarter and category controls as the nominal chart become operable

#### Scenario R4e: Desktop Legend Preservation

- **WHEN** either consumption section renders on a viewport wider than 768px
- **THEN** the existing desktop legend behavior remains available without the mobile collapsed-summary contract

#### Scenario R4f: Modernized Accordion Summary Header (Tonal Pill)

- **WHEN** either 消費支出（名目） or 消費支出（実質） legend accordion renders
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
- **AND** a validated 2025 set explains the all-household official connected CTI series, its selected variant, the three household surveys combined in CTI micro, and the GDP reference series
- **AND** it explains GDP reference values, the CTI total, and the miscellaneous/CPI-external difference in concise user-facing language
- **AND** for the 3種比較 panel, it describes the 12-month moving average separately as: 給与（総合） from the salary series, 民間最終消費（総合） from the GDP reference series, CTI消費（総合） from CTI consumption, and 物価指数（総合） from CPI
- **AND** it explains in the lower part of the info panel that the 2018年以降のGDP reference extension can be switched on
- **AND WHEN** the 2025 set is unavailable, invalid, or no complete compatible set exists
- **THEN** the panel uses user-facing language to identify the 2020 rollback data or that consumption data cannot currently be displayed, without exposing internal file or validation terminology.

#### Scenario R6d: GDP and CTI Comparison Explanation

- **WHEN** a user opens the spending or 3種比較 information panel
- **THEN** it identifies GDP reference values as separate nominal and real comparison indices, distinguishing current-price and chain-linked concepts
- **AND** it explains that GDP reference values are comparison indices, that the CTI total is the displayed CTI expense total, and that 諸雑費・CPI外支出 is the residual difference from the total
- **AND** it states that CTI begins in 2017 and is not statistically connected to GDP or a legacy CTI series.
- **AND** it does not expose Plan22, raw値, 内部検証保持, 四半期の月範囲, or 9大費目の列挙などの実装詳細をユーザー向け文言に含めない

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

### R20: Mobile Consumption Readability

The system SHALL make the nominal and real consumption charts readable and operable on narrow viewports while preserving the Plan24 data and rendering contract.

#### Scenario R20a: Mobile Chart Geometry, Axis, and Bars

- **WHEN** a consumption chart is rendered at 320–430px width
- **THEN** its dedicated mobile layout preserves a zero-based Y axis, keeps the largest labels visible, uses a chart right margin of 8–12px with a measured Y-axis width of approximately 40–48px, and uses mobile-specific bar width and spacing
- **AND** X-axis ticks follow the CPI-style cadence of every five years at Q1, with candidates near either endpoint omitted as needed, and use at least 12px text
- **AND** each X-axis endpoint label is centered on its endpoint coordinate (`text-anchor="middle"`) and may extend outside the chart/SVG area horizontally
- **AND** browser acceptance checks obtain the painted native X-axis `text` nodes from `.recharts-xAxis-tick-labels`, measure viewport CSS-pixel rectangles with `getBoundingClientRect()`, and verify every label is finite and non-zero and remains vertically within the chart SVG display rectangle; endpoint labels may extend horizontally beyond the SVG, and collision detection between interior labels is neither required nor guaranteed
- **AND** no new horizontal scrolling is introduced

#### Scenario R20b: Preserved Boundary Contract

- **WHEN** the user views the consumption charts on mobile
- **THEN** no new 「直近5年」/「全期間」 period control or selected-quarter emphasis is introduced
- **AND** the 2017Q4/2018Q1 boundary remains a standalone GDP bar followed by CTI stacked bars, with no overlap, interpolation, or independent GDP line

#### Scenario R20c: Mobile Details

- **WHEN** the user taps a consumption bar
- **THEN** the tooltip/detail view shows all applicable category values, with category names at least 14px, the total at least 16px, and right-aligned numeric values
- **AND** the period label font size is outside the Plan25 approval scope
- **AND** the detail content accounts for safe-area insets, scrolls internally when expanded, and keeps the close control reachable
- **AND** after scrolling the detail content to its internal bottom, the entire tooltip and its close control remain within the viewport on portrait and landscape mobile viewports

#### Scenario R20e: Consumption Tooltip Full Payload

- **WHEN** a nominal or real consumption chart requests `showAllPayload=true`
- **THEN** its tooltip displays every applicable category value on mobile and desktop regardless of touch state
- **AND** when `showAllPayload` is not specified, the existing mobile/desktop payload omission behavior remains unchanged

#### Scenario R20d: Mobile Empty and Accessibility States

- **WHEN** the user clears every category or enlarges text/uses landscape/dark mode
- **THEN** the chart explains the empty state and permits recovery without displaying nonexistent bars or values
- **AND** category names, selected/focused states, and close/reopen actions remain understandable without relying on color alone
- **AND** the page has no horizontal overflow at 375px

### R21: Chart Tooltip and Legend Display Contract

The system SHALL resolve tooltip display rows from chart-side series metadata while preserving the existing tooltip interaction controller.

#### Scenario R21a: CPI rows and total

- **WHEN** a CPI category has value `0`, null/undefined, or is absent from the Recharts payload
  **THEN** the applicable visible category row remains in registry order, `0` uses the existing two-decimal formatter, null/undefined/missing renders as `—`, and only finite numeric values contribute to `合計`.
- **WHEN** a CPI category is hidden through its legend
  **THEN** its row is excluded by visibility state, independently from payload omission, and GDP/support series are not added to the CPI total.
- **WHEN** a CPI stacked tooltip is shown before or after a legend visibility change
  **THEN** its shared tooltip root contains 12 visible expense rows plus `合計` initially, and 11 rows with `住居` absent after hiding `住居`.

#### Scenario R21b: Earnings full labels on mobile

- **WHEN** a salary tooltip is displayed at 375px or 430px
  **THEN** its date, salary category/item, and complete registry tooltip labels are visible without ellipsis, nowrap, fixed-width truncation, or horizontal scrolling; labels wrap naturally and the numeric value column remains readable.

#### Scenario R21e: Earnings category total

- **WHEN** a salary tooltip is displayed
  **THEN** it contains the six existing registry rows in their existing label, color, and order, plus `給与区分合計（所定内＋所定外＋特別）`, calculated only from visible finite 2025年平均=100 display values for `所定内給与`, `所定外給与`, and `特別給与`.
- **WHEN** one of those three salary categories is hidden
  **THEN** its row and value are excluded and the explicit total is recalculated from the remaining visible category rows; hiding or showing the three auxiliary series does not affect it.
- **WHEN** a visible included row is 0, null/undefined, missing from payload, NaN, or Infinity
  **THEN** its row remains with `0.00` for zero or `—` for the other cases, and only finite values contribute to the total.
- **WHEN** the tooltip is shown at 375px or 430px
  **THEN** the six rows and explicit total label/value remain within the viewport and readable, while existing hover/click/touch/dismiss/scroll behavior remains unchanged.

#### Scenario R21f: Earnings group separator

- **WHEN** a salary tooltip has at least one visible category from `所定内給与`・`所定外給与`・`特別給与` and at least one visible auxiliary series from `時間当たり給与`・`15歳以上国民当たり給与`・`CPI総合(参考)`
  **THEN** exactly one decorative separator is rendered on the first visible auxiliary row, including after hidden-series metadata projection, and the 375px/430px mobile tooltip retains readable row spacing and viewport fit
- **WHEN** all three salary categories or all three auxiliary series are hidden
  **THEN** no group separator is rendered
- **WHEN** a CPI, consumption-expenditure, or comparison tooltip is displayed
  **THEN** no separator metadata or separator CSS is applied and the decorative line adds no screen-reader/read-aloud content

#### Scenario R21c: Comparison registry synchronization

- **WHEN** the three-series comparison is rendered before/at the `2017Q4`/`2018Q1` boundary or with advanced on/off and hidden keys
  **THEN** drawing, tooltip, and legend use the same visible registry keys, complete tooltip/legend labels, colors, numeric order, and advanced state, while tooltip detail/total includes GDP before 2018Q1 and CTI (including the opt-in extension) from 2018Q1.
- **WHEN** an unregistered comparison key reaches the tooltip
  **THEN** the comparison tooltip excludes it whenever `allowedKeys` is present, including when the key is hidden or outside the GDP/CTI boundary; the original payload-key fallback is available only through an explicit opt-in path with no `allowedKeys`.

#### Scenario R21d: Interaction compatibility

- **WHEN** users use hover, click, touch, close/Escape dismissal, or page/programmatic scrolling
  **THEN** the existing trigger, active dot, guide line, dismissal, and scroll-suppression behavior remains unchanged while only display metadata and row formatting differ.
- **AND** `tests/components/CustomTooltip.test.tsx` covers the independent
  `CPI_CATEGORIES.length === stackedColors.length` contract, all 12 CPI rows,
  positional colors/order, zero/null/undefined/missing payload, hidden metadata,
  finite-only totals, safe value/NaN/null/total formatter behavior, the
  2017Q4 GDP and 2018Q1 CTI detail boundary, and six complete salary labels at
  the 375px/430px jsdom viewport-width contract (with no fixed-width tooltip
  style).
- **AND** the 375px/430px test is explicitly a component/DOM check: jsdom does
  not paint layout, so it checks `clientWidth`, fixed mobile width,
  `scrollWidth <= clientWidth`, mocked root `getBoundingClientRect().width`,
  overflow handling, and label presence; painted browser rectangles remain an
  E2E responsibility.
- **AND** real-browser E2E evidence is maintained by
  `tests/e2e/consumption-mobile-readability.e2e.spec.ts` (375px and 430px salary
  tooltip viewports: six complete labels, all `data-tooltip-row` elements,
  root/row viewport bounding boxes, label `scrollWidth`/`clientWidth`, and value
  columns), `tests/e2e/cpi-chart-categories.e2e.spec.ts` (all 12 CPI rows,
  `合計`, missing-value `—` contract when present, and hidden-row behavior using
  the shared `data-tooltip-root`/`data-tooltip-row`/`data-tooltip-total` DOM),
  `tests/e2e/earnings-tooltip-total.e2e.spec.ts` (desktop Chromium hover of a
  real salary plot, six rows, explicit salary total, auxiliary-series exclusion,
  and fresh re-hover after hiding an included legend series with recalculated
  total), and `tests/e2e/advanced-series.e2e.spec.ts` (advanced on/off comparison of
  legend and tooltip labels, colors, and numeric order, including the existing
  2018Q1 boundary data when available).
- **AND** `tests/unit/series-registry.test.ts` covers every salary/comparison registry entry, key-based projection, labels, colors, order, advanced state, and tooltip/legend equality; `tests/components/chart-tooltip-legend-contract.test.tsx` drives all comparison registry entries from one projection and verifies legend/tooltip DOM equality, advanced on/off, hidden keys, all-null legend retention, and unregistered-payload exclusion.
- **AND** that same component contract records the unchanged hover/click trigger,
  touch outside-dismiss, chart switching, Escape dismissal, and scroll
  suppression/re-tap path; `tests/hooks/useChartTooltipController.test.tsx`
  remains the focused controller regression contract.

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

#### Scenario R15j: Tooltip Overlay Input Interception

- **WHEN** the user performs a real touch at coordinates that are inside both the visible tooltip body and the chart note link identified by the dedicated `data-chart-note-link` attribute
- **THEN** the tooltip receives the input, remains visible, and the link does not navigate to the nominal consumption section

#### Scenario R15k: Touch Scroll Dismissal Threshold

- **WHEN** the user has a visible tooltip on a touch device and the page scroll position changes by 40px or more
- **THEN** the tooltip, guide line, and active data point dots are dismissed

#### Scenario R15l: Existing Tooltip Interaction Preservation

- **WHEN** the user presses Escape while a tooltip is visible, without moving the mouse or finger beforehand
- **THEN** the tooltip is dismissed immediately, and the next valid pointerdown or pointermove can show it again
- **WHEN** the user interacts through the desktop `chromium` project or the touch-enabled `mobile-pixel` project
- **THEN** the existing outside-tap, close, desktop-hover, and mobile-tap tooltip behaviors remain unchanged

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

#### Scenario R11a: Stacked-Series URL Synchronization

- **WHEN** the year range, stacked-series visibility, or advanced-series state changes
- **THEN** `useUrlState` writes the applicable `?from`, `?to`, `?hidden`, or `?adv` value via `window.history.replaceState`; `?hidden` contains only `stackedHiddenKeys`
- **AND WHEN** the page is opened with those params
- **THEN** the dashboard restores that range, stacked-series visibility, and advanced-series toggle; normal legend (`hiddenKeys`), moving-average legend (`maHiddenKeys`), and nominal/real series state remain React-owned.

### R16: Chart Tooltip Stack Total

The system SHALL display the sum of active series in stacked chart tooltips when requested.

#### Scenario R16a: Consumption Expenditure Tooltip Total

- **WHEN** the user taps or hovers over a data point in the Consumption Expenditure (nominal/real) charts
- **THEN** the tooltip displays the sum of currently visible series as `合計` right below the date label
- **AND WHEN** series are hidden via legend toggles
- **THEN** the total reflects only the remaining visible series
- **AND WHEN** mobile view truncates series list to the top 5 entries
- **THEN** the total is calculated from all active series prior to truncation
- **AND WHEN** an unrelated non-stacked chart is viewed
- **THEN** no total row is rendered.

#### Scenario R16b: CPI Stacked Tooltip Total

- **WHEN** the user hovers over a data point in the CPI `StackedAreaChart`
- **THEN** the tooltip renders all 12 visible CPI expense rows in registry order and a `合計` row in the same root
- **AND WHEN** the user hides the `住居` series through its legend
- **THEN** the tooltip renders the remaining 11 rows, excludes `住居`, and recalculates `合計` from only those visible rows

#### Scenario R11c: Advanced Series Toggle

- **WHEN** 3種比較 is opened without `?adv=1`
- **THEN** the advanced series is not rendered and does not appear in the legend.
- **WHEN** the user turns ON the toggle in the ⓘ panel
- **THEN** the advanced series and its legend chip appear, and `adv=1` is added to the URL.
- **WHEN** the user opens a URL with `?adv=1`
- **THEN** the advanced series is rendered from initial load.

#### Scenario R11b: Scroll Position Preservation

- **WHEN** the user filters stacked series via its legend click or changes the year range
- **THEN** URL parameters (`?from`, `?to`, `?hidden`) are synchronized using `window.history.replaceState`, with `?hidden` limited to stacked-series visibility
- **AND** the page scroll position is preserved without resetting to the top of the page.

#### Scenario R11d: State ownership and one-way synchronization

- **WHEN** the dashboard is initialized
- **THEN** `useUrlState` supplies the URL snapshot for `from`, `to`, `hidden` (stacked-series `stackedHiddenKeys` only), and `adv`, while CpiChart owns the live React state for those values
- **AND** `useAdvancedPreference` persists only the advanced React state value to `newGraphShowAdvanced`; its effect also reruns when `startYear`, `endYear`, or the hidden-key dependency changes, but those dependencies are not written to storage; it does not restore storage into initial state or write storage back to the URL
- **AND** section navigation, quarter visibility, normal legend (`hiddenKeys`), moving-average legend (`maHiddenKeys`), nominal/real state, and CAGR remain React-owned
- **AND** no new `popstate` listener or URL/localStorage precedence rule is introduced

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
- **THEN** `light` or `dark` is saved under the `theme` key, or the key is removed for `system`; `data-theme` is set for `light`/`dark` and removed for `system`
- **AND** no theme URL parameter is read or written
- **AND WHEN** the page reloads
- **THEN** the layout inline script applies the stored theme before paint to avoid FOUC
- **AND** actual reload behavior is not claimed as tested by the current component tests

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
  - `description`: "物価指数・現金給与総額・消費支出を各系列の基準で一画面に比較。給与は2025年平均=100、CPI/CTI/GDPの基準化とは独立して表示。費目別寄与度・年率上昇率・給与と物価の乖離を可視化。凡例クリックで系列の表示/非表示を切替可能。"

#### Scenario R11d: Regular GDP-backed NewGraph continuity

- **WHEN** the normal 2025-base loader is called without rollback options
- **THEN** the regular private-consumption reference series contains every month from 2005-01 through 2017-12, with finite positive values; its raw GDP fields remain separate from comparison values computed as raw × the independently validated 2025 factor.
- **AND** a 12MA is emitted only for a complete consecutive 12-month window, while insufficient windows, internal gaps, and months after the regular period remain `null`.

#### Scenario R11e: NewGraph browser projection parity

- **WHEN** the real browser opens NewGraph for the full period and a 2014-centered range
- **THEN** the selected private-consumption SVG path, tooltip, table, and CSV expose the same displayed value, and the regular series is present in both ranges.
- **AND** `adv=1` and the information-panel state expose the extended 2018+ series without changing the 2017/2018 boundary; the same assertions remain usable at a 375px viewport.
- **AND** the Plan27 browser acceptance fixture supplies independent 2014 representative values, and tooltip, matching table cells, and downloaded CSV cells are numerically equal within the fixture tolerance; presence-only assertions are insufficient.
- **AND** every SVG path selected directly by `data-key` is checked for its `d` coordinates, full-period/2014 coverage, and continuous target-period subpaths; `adv=1` checks both 2017-12 regular and 2018-01 extended boundary values.
- **AND** switching the information panel preserves the selected series keys and matching explanation, and the same chart, tooltip, table, and CSV operations are exercised at 375px.

#### Scenario R9b: Page Header Description

- **THEN** `page.tsx` header displays:
  - "すべての指標を2025年平均=100で表示。凡例クリックで系列の表示/非表示を切替可能。"
- **AND** the header does not render the `経済指標ダッシュボード` badge

## Architecture

### Component Tree (src/app/components/)

```
Page (RSC)
├── header (ThemeToggle, title, description)
└── CpiChart (client component)
    ├── SectionTabs — Sticky navigation section tabs & range display
    ├── useUrlState — URL snapshot and replaceState synchronization for from/to/hidden/adv
    ├── useAdvancedPreference — one-way React state to newGraphShowAdvanced persistence
    ├── useSectionNavigation — active section state, scroll observation, smooth tab navigation, lazy-section fallback, and programmatic-scroll suppression
    ├── BottomSheet — shared bottom-sheet shell (backdrop / header / close / Escape)
    ├── ChartFilters — Date range (start year / end year selects with "最大期間" button)
    ├── Range sheet — BottomSheet wrapping ChartFilters (start year / end year selects with "最大期間" button)
    ├── CpiChartSections
    │   ├── MajorIndicesChart → CustomTooltip
    │   ├── StackedAreaChart → CustomTooltip — registry-resolved all-applicable CPI rows, colors, values, and total (12 rows + 合計; hidden rows excluded)
    │   │   └── belowChartSlot: CagrPanel — popup link + compact BottomSheet (R18)
    │   ├── SpendingBarChart (nominal) — mobile-specific spacing/ticks, bar width, and all-value tooltip/details; closed-by-default legend; legacy GDP before 2018Q1 and CTI expense fields from 2018Q1
    │   ├── SpendingBarChart (real) — mobile-specific spacing/ticks, bar width, and all-value tooltip/details; closed-by-default legend; legacy GDP before 2018Q1 and CTI expense fields from 2018Q1
    │   ├── EarningsBreakdownChart → CustomTooltip — 2025年平均=100 salary indices; complete registry labels with natural wrapping and stable value column; six rows plus `給与区分合計（所定内＋所定外＋特別）` from visible `EARNINGS_TOTAL_KEYS` (`showTotal`, `totalLabel`, and `totalIncludedKeys=EARNINGS_TOTAL_KEYS`); hidden included rows are removed and the total is recalculated from the remaining visible included rows; salary-only `separatorBetweenGroups` is placed on the first visible auxiliary row
    │   ├── ResidualAreaChart → CustomTooltip
    │   └── NewGraph → ChartInfoContentRenderer → CustomTooltip — comparison visualization receives 2025年平均=100 CPI, salary, CTI-consumption, and GDP-reference indices; unavailable registered lines remain as null-compatible line contracts
    ├── ChartInfoButton → ChartInfoContentRenderer — Indicator explanations (uses `chartKey` plus loader-resolved state in `src/lib/chartInfoContent.ts`)
    ├── ChartDataContract — stable normalized chart data attributes for each of the seven targets
    ├── ChartExportButton — CSV download of the displayed rows (inside each chart's <details>)
    ├── ChartLegend — defined visible-series legend contract; retains values whose current data is null
    └── CustomTooltip (React.memo, module-level component for charts, managed via `useChartTooltipController`; key-based metadata supplies label/color/order and the total row follows the Spending tooltip hierarchy)
```

The repository validation boundary is the Husky hook tree rather than a UI
component: the POSIX `.husky/pre-commit` and `.husky/pre-push` launchers exec
the Bash implementations in `.husky/pre-commit.bash` and
`.husky/pre-push.bash`, because Husky's generated `sh -e` launcher cannot
interpret Bash-only syntax. The Bash implementations run `lint:fast`, staged
typecheck, commit-scoped `lint-staged`, detached-HEAD validation,
actual-push-ref impact classification, related-test selection, build, E2E, and
the full validation profile. Production validation is a separate gate and is
not implied by the local pre-push hook.

`CpiChart` remains the composition root. The static seven-section definition is owned by the typed `CPI_CHART_SECTIONS` in `src/app/components/cpiChartConfig.ts`; its existing ids and order are `section-cpi-major`, `section-stacked`, `section-consumption-nominal`, `section-consumption-real`, `section-earnings`, `section-residual`, and `section-new-graph`. `CpiChart` passes this same array to the active-section initial value, `SectionTabs`, and DOM/scroll observation.

The support-series domain boundary is `src/lib/math/supportSeries.ts`, a pure module shared by
server and client. `server/lib/math/supportSeries.ts` is a void-compatible server adapter for the
legacy mutating call shape; it delegates to the shared pure functions and does not own the domain
formula. No server-only dependency is allowed in the shared module.

The quarterly view-model boundary uses the shared `QuarterlyRow` type from `src/types/chart.ts`.
`src/lib/quarterlyPublicProjection.ts` is client-safe and imports no module from `server/`; it
projects only the established public quarterly keys and preserves the public JSON shape. The
server-side `quarterlyAggregation.ts` keeps the existing adapter entry point and re-exports the
shared type for compatibility.

Quarterly component data crosses this boundary as `QuarterlyRow` from `src/types/chart.ts`; the
client-safe projection owns only the established public keys and rounded values. No component or
client projection imports a module from `server/`.

The Phase 2-5 facade change does not add API-route components or alter the
`src/app/api/estat/*` route tree; those routes remain outside the loader facade
component/data path and are confirmed unchanged by static inspection.

Every chart renders `role="img"` on its wrapper plus a `<details>` data table (R8a) containing a
`ChartExportButton` (R13a). Charts under `LazyMount` are absent from the SSR HTML and appear after
hydration — tests must wait for them rather than reading the initial markup.

Server-side loader responsibilities are split by domain: `server/lib/dataLoader.ts` is the sole
public loader/status facade at the Server boundary. `server/lib/data-loader/cpi.ts` is an internal
adapter and is not a public entry point. `server/lib/data-loader/cpiSource.ts`
owns CPI candidate-path resolution, metadata resolution/validation, and the 2025-first → complete
2020 fallback → fail-closed selection policy. `server/lib/data-loader/cpiValidation.ts` owns CPI
index/contribution CSV parsing and header/content validation. `server/lib/data-loader/cpiLoader.ts`
owns pure CPI transformation: filtering to 2004年以降, fixed-weight denominators, missing-value
propagation, derived series, and removal of unnecessary output series. The public
`server/lib/data-loader/cpi.ts` remains the internal CPI status/load adapter and continues to own CTI,
annual GDP, and quarterly GDP loading. `server/lib/dataLoader.ts` is the compatibility boundary for
the existing name, arguments, return shape, error behavior, and server-only execution boundary.
`page.tsx` and `quarterlyProjection.ts` import loader functions through `dataLoader.ts`; CTI, annual GDP,
and quarterly GDP retain their existing contracts; this CPI split does not change their source
selection, normalization, status, or public projection behavior. `gdpSupport.ts` validates annual
GDP support artifacts and normalization records, and validates quarterly CSV, metadata, official,
and e-Stat artifacts plus their hashes; it calculates quarterly factors from the 2025 Q1–Q4 CSV
observations. Its
`isQuarterlyComparisonReady` check is a metadata-only predicate and does not validate or transform
raw rows.

The quarterly server-side branch is `page.tsx` → `quarterlyProjection.ts`'s
`loadQuarterlyPublicData()` / `buildQuarterlyPublicViews()` → `quarterlyAggregation.ts`'s
`computeQuarterlyAggregates()` / `mergeQuarterlyGdpRows()` and
`quarterlyGdpTransform.ts`'s `joinQuarterlyGdpRows()` exact-key join → `src/lib/quarterlyPublicProjection.ts`'s
`projectQuarterlyPublicView()` → `CpiChart`. `quarterlyProjection.ts` loads the source data and
assembles the pipeline; `quarterlyAggregation.ts` aggregates CTI and preserves the existing
adapter entry point; `quarterlyGdpTransform.ts` joins validated GDP comparisons to CTI rows; and
`quarterlyPublicProjection.ts` selects and rounds the public fields.

### Data Flow

- Pre-commit flow is `staged paths` → `staged_typecheck_required()` → either
  `pnpm exec tsgo --noEmit` or a recorded skip → `pnpm exec lint-staged`.
  Typecheck is required for TypeScript, type-boundary/shared/generated/config
  changes and for deletion/rename or unavailable-decision cases; documentation,
  assets, and other non-type changes may skip it. The lint-staged related test
  task may pass with zero tests only within the commit hook.
- Pre-push flow is `Git pre-push ref protocol` → actual ref diff collection and
  path/category classification → `PREPUSH_PROFILE` normalization. Configuration,
  dependency, build, Playwright, E2E, OpenSpec, generated, unknown, initial,
  deletion, rename, shallow, malformed, unresolved, or failed-diff cases are
  conservative full-profile inputs. Ordinary source/server/test changes retain
  safe related candidates and use the changed profile. The classifier unions
  all pushed refs before selecting a profile.
- In the changed profile, safe related candidates are passed to
  `vitest related --run --passWithNoTests --reporter=json`; a non-empty valid
  JSON result allows the changed integration gate to pass, followed by
  `build` and then `test:e2e:clean` → `test:e2e`. Empty candidates, zero JSON
  `testResults`, missing/invalid/incompatible JSON, or a related-test failure
  invoke the full profile exactly once.
- The full profile is ordered `lint:fast` → `type-check` → `test:all` → `build`
  → `test:build-parity` → `security-check` → `test:e2e:clean` → `test:e2e`;
  each gate stops later gates on failure. Build always precedes E2E. Production
  validation remains a separate production gate and is reported as not run by
  local pre-push when its URL/network availability is not established.
- The normal GitHub build job grants only `contents: read` and runs the full
  dependency `pnpm audit --audit-level=high` plus secretlint on every push and
  pull request; the dispatch-only full validation repeats its all-dependency
  `security-check`. Neither security gate uses `continue-on-error`.
  `PROD_URL` is scoped only to the conditional production-validation step.
- The cache/E2E measurement writes its artifact after managed-process cleanup;
  a failed server startup, port conflict, or readiness timeout records a failed
  server status and exits non-zero rather than treating the artifact as success.

#### Scenario final audit boundaries

- **WHEN** dependencies are installed from the repository lockfile
  **THEN** xlsx 0.20.3 resolves from `vendor/xlsx-0.20.3.tgz`, and the package
  and lockfile retain the official SheetJS tarball's SHA-512 integrity value
  (`oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`)
  without a live CDN URL dependency.
- **WHEN** the measurement CLI receives `--output`
  **THEN** it accepts only a path under the repository root or OS temporary
  directory and rejects arbitrary absolute paths before creating directories.
- **WHEN** the measurement CLI receives `--e2e-command`
  **THEN** it requires a non-empty JSON array of argument strings and starts
  the command with `spawn` and `shell: false`, preserving argv boundaries.
- **WHEN** the measurement process receives SIGINT or SIGTERM
  **THEN** it stops managed process groups, removes its temporary directory,
  writes the completed artifact, and exits with a non-zero signal-derived code.
- **WHEN** the pre-push hook smoke command is run
  **THEN** it exercises the installed hook through a real temporary Git push,
  verifies hook failure prevents remote advancement, and returns non-zero on
  any fixture or hook failure.
- **WHEN** the normal GitHub build job runs for a push or pull request
  **THEN** all-dependency `pnpm audit --audit-level=high` and secretlint are
  visible required steps, and either failure fails the job rather than being
  hidden by `continue-on-error`.

- `src/app/page.tsx` imports its CPI/CTI/GDP status and load functions from the sole public `server/lib/dataLoader.ts` facade, then calls `loadQuarterlyPublicData()` in `server/lib/view-models/quarterlyProjection.ts`. `quarterlyProjection.ts` also imports its loader functions from that facade. It loads CPI/CTI and `loadQuarterlyGdpData()`, computes CTI aggregates through `quarterlyAggregation.ts`, and calls `buildQuarterlyPublicViews()`; the latter uses `mergeQuarterlyGdpRows()`/`quarterlyGdpTransform.ts` for the exact `YYYY-Qn` join and then `projectQuarterlyPublicView()` in `src/lib/quarterlyPublicProjection.ts`. Nominal and real rows must have the same complete period set.
- Support-series flow is `server/lib/data-loader/gdpSupport.ts` → `src/lib/math/supportSeries.ts` (shared pure normalization/scaling), while `src/lib/clientCalculations.ts` imports the same shared pure module directly. `server/lib/math/supportSeries.ts` is a compatibility adapter/re-export for existing server-side imports and is not on the `gdpSupport.ts` path. Both client and server calculations depend on the same pure domain module; client code does not import `server/`.
- Quarterly flow carries `QuarterlyRow` from `src/types/chart.ts` through the server aggregation/transform boundary into the client-safe `src/lib/quarterlyPublicProjection.ts`; that projection has no import from `server/`. `quarterlyAggregation.ts` preserves the existing compatibility adapter and re-export, while public projection keys, rounding, and JSON shape remain unchanged.
- The joined public rows are passed unchanged to `CpiChart`; chart, tooltip, table, and CSV derive their displayed values from those same rows. GDP raw fields never cross the public projection boundary.
- The Phase 2-5 loader path ends at the server facade and its dashboard/quarterly consumers. The independent browser → `/api/estat/{stats-list,meta,data}` path is outside this refactoring; its route files remain unchanged by static inspection, and no API-route JSON test is claimed for Phase 2-5.
- `CpiChart` constructs the nominal/real public quarterly rows once, including the optional advanced extension key in the order period + regular keys + advanced key, and passes those rows to both `SpendingBarChart`/`ChartDataContract` and `DataTablesSection`/`ChartExportButton`; the chart component renders only GDP bars before 2018Q1 and only CTI `Bar` stacks from 2018Q1.
- Each chart/table/CSV target consumes the same normalized display model. `ChartDataContract` exposes the data actually passed to the chart through stable data attributes; Recharts internal SVG paths, classes, geometry, and coordinates are not a semantic contract.
- CSV export is serialized as RFC4180 records terminated by CRLF, including the final record, with existing comma/quote/CR/LF escaping and quote round-trip preserved.
- Phase 4-4 parity evidence is intentionally split: unit tests own CSV serializer edge cases, integration tests use the independent hand-written `tests/fixtures/chart-parity-independent.json` at the real component boundary, and Playwright E2E compares all rows and columns for all seven targets against production data/source, including `hidden`, `adv=1`, nominal/real, and the GDP boundary labels `2017Q4` / `2018Q1`. The fixture is not generated from app constants or the DOM.
- Tooltip aggregation follows the display contract: before 2018Q1 it receives only the standalone GDP comparison field; from 2018Q1 it receives only visible CTI expense fields. GDP comparison values are never included in the post-2018 CTI total.
- Tooltip display flow is metadata-first: chart-side registry projections resolve the label, color, order, and advanced state before `CustomTooltip` renders rows; Recharts `payload.name` is only a legacy fallback for unregistered/direct callers. CPI rows are completed from the applicable visible category list, preserving zero and null/missing values independently of payload presence.
- Chart-info flow is `page.tsx` loader state → `CpiChart` → `ChartInfoButton`/`ChartInfoContentRenderer`; the info panel keeps implementation and validation terminology out of its user-facing descriptions, places the 2018年以降GDP reference-extension switch at the lower part of the panel, and uses the page-wide 2025年平均=100 header wording with legend visibility guidance.
- The concrete client flow is `CpiChartSections → useChartTooltipProps → CustomTooltip`: category/registry metadata and period-specific `allowedKeys` are projected in `CpiChartSections`, forwarded by the existing controller, and used by `CustomTooltip` to complete missing payload rows. Hidden and GDP/CTI boundary-inapplicable keys are removed before detail rendering and totals.
- Legend/rendering and tooltip collections use the same advanced/hidden registry projection even when data is unavailable: legends and comparison tooltips retain defined all-null series, while registered missing values render as `—`.
- Missing, ended, unready, or failed-validation GDP comparison values remain `null` in the public projection and are hidden at the chart boundary; GDP is never zero-filled, copied, interpolated, or rescaled at the boundary.
- The fixture comparison gate independently observes loader data, status, and load/status errors, compares each observation to the fixed golden digest, and verifies every declared GDP source artifact path and SHA-256 before treating the normal path as valid. The annual public loader has no runtime cache wrapper; cache behavior is therefore N/A and is not a required comparison dimension.
- The gate's invalid-input paths remain fail-closed: missing or malformed CPI/CTI 2025 inputs select the complete compatible 2020 pair when it validates, while invalid annual GDP omits every annual GDP raw/comparison key. Invalid quarterly artifacts return no quarterly rows with `comparisonReady: false`; validated raw quarterly rows are retained when independent confirmation is pending or failed, but comparison values are not generated or published, with no annual-data fallback. The readiness predicate is metadata-only, and never makes unready raw rows comparison-ready. CTI rows may remain present when GDP is unavailable.
- Quarterly GDP is accepted only as the complete continuous `2005-Q1` through `2025-Q4` sequence (84 rows), with both independent nominal and real series and valid comparison confirmation; duplicate, missing, non-continuous, non-numeric, or absent source artifacts fail closed.
- The annual GDP path used by NewGraph is separate from the quarterly public path: validated nominal raw annual observations are expanded onto calendar months, normalized by the independently validated 2025 annual factor, and then passed through a consecutive 12-month window. Raw amounts remain available for table/CSV contracts that request them, while the comparison line receives only normalized values.
- Consumption presentation state is client-side: hidden quarters, selected categories, and detail expansion control each chart without changing source-basis values, table values, or CSV values.
- On mobile (≤768px), `SpendingBarChart` uses consumption-only layout options for margins, CPI-style axis ticks, typography, bar width/spacing, all-value tooltip/details, and safe-area-aware internal scrolling; both nominal and real legends are closed-by-default collapsible controls whose single-line summaries report selected expense-item/quarter counts and filtering state, without a separate 四半期 heading. The real chart may additionally show the linked nominal-section note when `linkedSectionId` is provided; the nominal chart omits it. Selected-quarter emphasis is not added. Shared tooltip/axis behavior is not changed for other charts.

Data Sources are unchanged by the mobile-readability plan: no new source, transformation, normalization, or CTI/GDP join is adopted. Plan24's standalone-GDP-before-2018Q1 and CTI-stacked-from-2018Q1 contract remains authoritative.

Display metadata is sourced from `CPI_CATEGORIES`/`stackedColors`, `EARNINGS_SERIES_REGISTRY`, and `COMPARISON_SERIES_REGISTRY`; their key/color/label/order/advanced projection is passed from `CpiChartSections` through `useChartTooltipProps` to `CustomTooltip`. Chart rendering and legends use the same visible-key projection. Charts with an explicit registry/allowed-key contract exclude unregistered, hidden, and boundary-inapplicable payload keys. The raw-key fallback is only available when `allowedKeys` is absent and the caller explicitly opts in; Spending, CPI, and salary do not opt in.

The component/DOM contract tests measure salary tooltip conditions at 375px and
430px by setting `document.documentElement.clientWidth` and asserting the
mobile root's fixed `width: 100%`, `clientWidth`, `scrollWidth <= clientWidth`,
and `getBoundingClientRect().width <= viewport width`; jsdom does not paint
layout. The salary full-label, CPI 12-row/total, and comparison boundary,
unknown/hidden DOM contracts therefore remain deterministic component checks.
The corresponding real-data browser E2E checks are implemented in the existing
production-data specs: salary full labels and root/row rectangles at
375px/430px, CPI 12 rows/total, and comparison tooltip/legend name equality.
They intentionally use the shared fixture and existing chart locators; comments
in each spec record the live-data and lazy-mount prerequisites rather than
skipping when a prerequisite is unavailable.

Phase 1-1〜1-3 responsibilities are split without changing the public flow: `useCpiChartDisplayData` is the existing adapter boundary that calls `filterDataByYear`, excludes quarters, and calls `mergeChartData`; `useCagrState` owns the existing calculation calls plus CAGR input, result, error, and reset state; `src/lib/urlState.ts` performs pure URL query conversion; `useUrlState` owns `history.replaceState`; and `useAdvancedPreference` owns the `newGraphShowAdvanced` saving effect. The URL keys are `from`, `to`, `hidden`, and `adv`, with `hidden` limited to `stackedHiddenKeys`; normal/moving-average legend and nominal/real visibility remain React-owned. URL conversion preserves existing query parameters and deletes a key when its value is the default. The storage keys remain `newGraphShowAdvanced` and `theme`; the advanced preference effect reruns for changes to `showAdvanced` and its `startYear`/`endYear`/hidden-key dependencies, but saves only `showAdvanced` as `1` or `0` at the existing effect timing and remains guarded by `try/catch`. No module performs `window` or `localStorage` access during render or at module scope, including during SSR/module loading.

`useSectionNavigation` owns `activeId` and the `scroll`/`scrollend` listeners. Active-section detection uses `scrollY + innerHeight * 0.4` and each section's `offsetTop`/`offsetHeight` range. Tab selection sets the active id and performs smooth scrolling, resolving a mounted section by id or using the `data-lazy-section` fallback for a `LazyMount` section that is not yet mounted. It tracks programmatic scrolling with `requestAnimationFrame`, suppresses active-section updates and tooltip display while that scroll is in progress, and releases suppression on `scrollend` or the 150ms timer (with stable-frame/max-frame tracking as the fallback). Unmount cleanup removes listeners and clears the timer and all outstanding rAF callbacks. The existing public UI, data model, API, URL/storage contracts, and `SectionTabs` horizontal-scroll contract remain unchanged.

```
e-Stat official CPI long connected CSV (`statInfId=000040482945`) + source-original SHA-256
  → data/source/cpi-2025-official-series.csv (minimal official code/name snapshot; SHA-256 recorded in metadata)
  → cpi-2025-series-map.csv (unconditional 78-series official-code/name verification against snapshot; classification and missing-data rules)
  → data/source/cpi_data2025_long.csv + cpi_data2025_long.metadata.json (generated 2025 index and ready metadata)
data/source/contribution2025.csv (published 2025-base weights per 10,000)
data/source/cpi_data.csv + data/source/contribution.csv (compatible 2020 fallback pair)
  → server/lib/dataIo.ts (CPI file paths)
      → server/lib/data-loader/cpiSource.ts (candidate paths, metadata resolution/validation, pair selection)
        → server/lib/data-loader/cpiValidation.ts (CPI CSV/contribution parsing, header/content validation)
      → select complete 2025 pair; otherwise select complete 2020 pair; otherwise fail closed with invalid `getCpiDataStatus()`
        → server/lib/data-loader/cpiLoader.ts (pure 2004年以降 filter, weight denominators, missing propagation, derived series, unnecessary-series removal)
          → server/lib/dataLoader.ts (sole public status/load facade)
            → server/lib/data-loader/cpi.ts (internal status/load adapter)
          → apply selected-pair fixed weights: all-items denominator 10000; mutually exclusive 10-major-category comparison denominator 10002
          → derive `外食以外食料 = weighted 食料 − weighted 外食`; propagate source missing values to all dependent values
official all-household CTI micro CSV → official-code snapshot + series map + candidate metadata
data/source/cti_data2025.csv / data/source/cti_data2025_distribution_adjusted.csv (candidates)
data/source/cti_data.csv + cti_support_nominal.csv + cti_support_real.csv (complete 2020 rollback set)
  → `server/lib/dataLoader.ts` facade → `server/lib/data-loader/cpi.ts` internal CTI loader path
    → match every map row to the official snapshot row-by-row; select the verified 2025 candidate or complete 2020 rollback; preserve source-basis values and missing values
GDP nominal/real annual CSVs + ready metadata + independent annual-2025 factors
  → `server/lib/dataLoader.ts` facade → `server/lib/data-loader/cpi.ts` internal annual GDP loader path
    → validate both price concepts and their one 2025 annual value as one comparison set
  → verify 1994–2025 continuity and metadata/CSV/normalization-JSON hash agreement
  → fixture comparison gate: compare the fixed annual golden digest and source-artifact SHA-256 values
  → valid result: generate separate raw official amounts and comparison-only normalized values for tables, CSV, tooltips, and NewGraph
  → invalid result: fail closed and omit all annual GDP raw/comparison keys from public rows and the NewGraph GDP line without altering CTI selection
Plan21 quarterly nominal/real CSVs (2005Q1–2025Q4) + metadata + official/e-Stat snapshots
  → server/lib/dataIo.ts (quarterly paths)
  → `server/lib/dataLoader.ts` facade → `server/lib/data-loader/cpi.ts` internal quarterly GDP loader path
    (gdpSupport.ts: 84-row continuity, duplicate/missing/zero, metadata/CSV/official/e-Stat SHA-256 consistency, and 2025Q1–Q4 factor calculation)
      → quarterlyProjection.ts: `loadQuarterlyPublicData()` loads the validated GDP data and computes CTI quarterly aggregates
        → quarterlyAggregation.ts: `computeQuarterlyAggregates()` / `mergeQuarterlyGdpRows()`
          → quarterlyGdpTransform.ts: `joinQuarterlyGdpRows()` by exact `YYYY-Qn` key
            → src/lib/quarterlyPublicProjection.ts: `projectQuarterlyPublicView()`
              → page.tsx → CpiChart
      → fixture comparison gate: compare the fixed quarterly golden digest and source-artifact SHA-256 values
      → getQuarterlyGdpSupportStatus(): separate status; comparisonReady is false while independent confirmation is pending
        → page.tsx: pass granularity, comparisonReady, and independentConfirmation to chart info
          → pending-independent-confirmation: fail closed; do not render the quarterly comparison line
          → ready: quarterly validation remains available internally; public projection exposes only the existing nominal/real private-consumption keys, while pending/failed remains fail-closed
Loader fixture comparison gate
  → tests/fixtures/loader-comparison/golden.json (fixed CPI/CTI/annual-GDP/quarterly-GDP observation digests and GDP artifact SHA-256 values)
    → tests/unit/server/lib/data-fixture-comparison.test.ts (independent value/status/error comparison, complete 2020 rollback, GDP-key omission, annual and quarterly fail-closed checks)
data/source/{total_earning,contractual_earnings,scheduled_earnings,total_worked_hours,population_statistics,employment_indices}.csv
  → server/lib/dataIo.ts
    → server/lib/data-loader/{earnings,population}.ts (domain-specific loading + caching)

CPI / CTI / earnings / population loader results
  → server/lib/dataLoader.ts (sole public compatibility facade at the Server boundary)
    → server/lib/data-loader/cpi.ts (internal CPI/CTI/GDP/quarterly adapter) and server/lib/data-loader/{earnings,population}.ts
    → server/lib/dataProcessor.ts (transform + clean)
      → server/lib/serverCalculations.ts (derive)
        → server/lib/view-models/dashboard.ts (project: select columns, round 2 decimals)
          → src/app/page.tsx (RSC: load + project + CPI/CTI selected data state + pass props)
            → src/app/components/CpiChart.tsx ("use client": resolve info content and pass CTI state to consumption and NewGraph UI)
              → src/app/components/charts/TimeSeriesXAxis.tsx (shared year/month X-axis rendering for CPI major, residual, NewGraph, earnings, and stacked area charts)
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

The `/api/estat/*` API routes are outside the Phase 2-5 public-loader-facade
refactoring path. Phase 2-5 does not modify these routes; this was confirmed by
static inspection. No API-route JSON test is claimed as executed for Phase 2-5.

### Refactoring Phase Status

Phase 0〜1-6（fixture比較ゲート）、Phase 2-1〜2-5（CTI/GDP loader・検証分離、四半期変換・
連続性検証を含む）は実装・監査完了 `[x]`。Phase 2-4では、`quarterlyGdpTransform.ts`の
pure変換、`quarterlyAggregation.ts`の互換adapter、`gdpSupport` artifact検証/接続、exact
`YYYY-Qn` join、nominal/real期間集合一致、invalid artifact fail-closed、unready raw rows保持・
comparison非生成、metadata-only predicateを確認した。関連37 tests / 全416 tests、typecheck
成功、lint 0 errors / 5 warnings、最終静的監査合格・検証済みを記録した。Phase 2-5（既存公開
エントリポイントの薄いadapter整理）は実装・検証・最終静的監査完了 `[x]` とし、関連75 tests
passed、全体432 tests passed、type-check成功、lint 0 errors / 5 warningsを記録した。Phase 3-1は
共有`QuarterlyRow`型境界とclient-safe公開projection経路を含め、実装・検証・最終静的監査完了 `[x]` とする。
focused 60 tests passed、Phase 3-1の全体実績は50 files / 458 tests passed、
type-check成功、lint 0 errors / 5 warnings、最終静的監査合格と記録する。Phase 3-2はshared pure計算移設と薄いclient adapter化を完了（実装・監査・検証済み）とし、Phase 3-3も完了（実装・監査・検証済み）、Phase 4-1〜4-4、Phase 5-1〜5-2は完了（実装・監査・検証済み）とする。Phase 5-2は対象2 files / 17 tests passed、全体57 files / 506 tests passed、type-check成功、lint成功（警告5件）を記録する。実ブラウザのリロードと`popstate`、厳格な旧値fallbackの追加・確認は未実施・未追加のまま残す。Phase 5-3は完了（実装・監査・検証済み）とする。API routeは独立GET境界、共通処理は既存`_shared.ts`/`fetchEStat`で充足し、新規route runner/adapter抽出なし、削減量・戻り値影響0、`getStatsData`のみVALUE正規化差分、src→server不正importなしを記録する。既存506テスト/type-check/lint（警告5）が確認済みで、route JSON専用テストは未実施である。architecture/data flowは不変のため要件本文は変更しない。Phase 5-1〜5-3、Phase 6-1完了。Phase 6-2は任意項目で、追加抽出の根拠がないため未実施。
これは公開データモデル、loader/APIレスポンス、既存の検証済み挙動を変更する状態宣言ではない。

#### Scenario Phase 2-2 CPI Responsibility Split Acceptance

- **WHEN** Phase 2-2の実装・監査が進行中である
- **THEN** `cpiSource.ts` は候補path、metadata解決/検証、pair選択を担い、`cpiValidation.ts` はCPI CSV/contribution parseとheader/content validationを担い、`cpiLoader.ts` は2004年以降filter、weight分母、欠損伝播、派生系列、不要系列除去を担い、`cpi.ts` は公開status/load adapterとCTI/GDP/quarterlyを維持する
- **AND** CPIペア選択、2025系列マッピング、固定ウェイト、欠損値の扱い、公開CPI戻り値は不変である
- **AND** 既存のPhase 1-6 fixture比較ゲート完了記録は維持され、Phase 2-4（四半期変換・連続性検証）の完了記録とPhase 2-5の実装完了記録が維持される

#### Scenario Phase 2-3 CTI/GDP Validation Split Acceptance

- **WHEN** Phase 2-3の実装・監査が完了している
- **THEN** CTI validation、GDP年次validation、GDP四半期validationは責務として分離され、CTI名目/実質、GDP raw/比較、projection、既存の検証エラーと公開戻り値が維持される
- **AND** CTI公式map/snapshotの独立確認が`ready`の場合だけ2025候補を採用し、不成立時は完全な2020 rollbackを検証する
- **AND** GDP年次とGDP四半期は相互に独立してvalidationされ、各price conceptのraw/比較値を分離する
- **AND** 四半期は独立確認が`ready`でない場合に比較値をfail-closedとし、年次GDPへfallbackしない
- **AND** 関連60 tests / 全403 tests、typecheck、lint 0 errors / 5 warnings、最終静的監査が合格として記録され、Phase 2-4（四半期変換・連続性検証）の完了記録へ接続される

#### Scenario Phase 2-4 Quarterly Transformation and Connection Acceptance

- **WHEN** quarterly GDP rows and their support artifacts are transformed for the public view
- **THEN** `quarterlyGdpTransform.ts` performs the pure period validation and raw-to-comparison row transformation, while `quarterlyAggregation.ts` preserves the existing `mergeQuarterlyGdpRows` adapter contract
- **AND** nominal and real inputs have the same continuous period set from `2005-Q1` through `2025-Q4`, and CTI/GDP rows are joined only by exact `YYYY-Qn` keys regardless of input order
- **AND** `gdpSupport.ts` calculates quarterly comparison factors from the 2025Q1–Q4 CSV observations and verifies the required metadata, CSV, official-snapshot, e-Stat snapshot, and SHA-256 consistency before connection; no quarterly normalization JSON is an input, and `isQuarterlyComparisonReady` remains a metadata-only predicate
- **WHEN** a quarterly artifact is invalid or the independent comparison confirmation is unready
- **THEN** invalid artifacts fail closed, while validated raw rows are retained; comparison values are not generated or published and no annual-GDP fallback is used
- **AND** related 37 tests / all 416 tests, type-check, lint 0 errors / 5 warnings, and the final static audit are recorded as passed

#### Scenario Phase 2-5 Public Facade Acceptance

- **WHEN** the application loads dashboard or quarterly data through its server entry points
- **THEN** `server/lib/dataLoader.ts` is the sole public loader/status facade and delegates to internal loader modules, while `server/lib/data-loader/cpi.ts` remains an internal adapter
- **AND** `src/app/page.tsx` and `server/lib/view-models/quarterlyProjection.ts` import their loader functions through `server/lib/dataLoader.ts`
- **AND** the existing public signatures, return shapes, error behavior, and SSR Server/Client boundary remain unchanged; internal loaders are not exposed as additional public entry points
- **AND** `/api/estat/*` routes are outside this facade-refactoring path and static inspection confirms that they are unchanged; no API-route JSON test is claimed as executed
- **AND** the facade contract records 75 related tests passed and the whole suite records 432 tests passed, with type-check successful, lint 0 errors / 5 warnings, and the final static audit passed
- **AND** Phase 3-1 is recorded as complete after its additional boundary-gate audit; the earlier wording that the current Phase 3-2 was implemented, pending verification, and incomplete is an implementation-before-history record, and the current Phase 3-2 completion judgment is established by the subsequent record

#### Scenario Phase 3-1 Shared Support-Series and Quarterly Boundary Acceptance

- **WHEN** support-series normalization or scaling is used by server or client calculations
- **THEN** `src/lib/math/supportSeries.ts` provides the shared pure functions and `SupportSeriesRow` type, `server/lib/data-loader/gdpSupport.ts` imports that shared domain directly, and `server/lib/math/supportSeries.ts` provides the void-compatible legacy adapter/re-export for existing server-side imports
- **AND** `gdpSupport` is not routed through `server/lib/math/supportSeries.ts`; `clientCalculations` also depends directly on the same shared domain module, and no client module imports `server/lib/math/supportSeries.ts`
- **AND** `QuarterlyRow` is defined in shared `src/types/chart.ts`, `src/lib/quarterlyPublicProjection.ts` imports no module from `server/`, and `quarterlyAggregation.ts` preserves the existing compatibility adapter and re-exports `QuarterlyRow`
- **AND** the public quarterly projection keys, rounding, period labels, and JSON shape remain unchanged
- **AND** the shared pure `scaleSupportSeries` preserves missing, `NaN`, `±Infinity`, and out-of-period values without fabricating finite zeroes and without mutating input rows; the server void `applySupportSeriesScaling` and client compatibility adapter retain legacy zero-fill/`value || 0` behavior
- **AND** the annual normalizer accepts only exactly one positive finite value and fails closed otherwise; established formulas, rounding, public JSON shape, and SSR boundary remain unchanged
- **AND** focused 60 tests passed and the final record is 50 files / 458 tests passed, with type-check successful, lint 0 errors / 5 warnings, and the final static audit passed
- **AND** Phase 3-1 is complete; the earlier Phase 3-2 pending-verification wording in this historical record predates its implementation, and Phase 3-2 is subsequently complete (implementation, audit, and verification); the earlier “Phase 3-3 onward unstarted” wording is pre-implementation history, while Phase 3-3 is subsequently complete and Phase 4 onward remains unstarted

Phase 3-2 calculation flow is `CpiData` → `src/lib/math/clientCalculations.ts` for pure category sums, CAGR, monthly normalization/completion, quarterly aggregation, and hidden-quarter filtering → `src/lib/clientCalculations.ts` for the existing public API and legacy support-series scaling → chart/table consumers. The math module has no React, Next.js, Node, server, or browser-storage dependency; public names, arguments, return shapes, caller-provided `nominalKeys`/`realKeys` precedence, and support-series compatibility remain at the adapter boundary. `server/lib/view-models/quarterlyAggregation.ts` remains on its existing server-compatible implementation and is outside Phase 3-2. Verification evidence: `pnpm type-check` succeeded; `pnpm lint` succeeded (0 errors / 5 existing warnings); `pnpm test` passed (50 files / 458 tests); `pnpm build` succeeded; `pnpm test:build-parity` passed on the post-build rerun (1 file / 3 tests); `git diff --check` succeeded; prohibited-dependency search found no code matches (one comment in `supportSeries.ts` only). Other-phase working-tree differences are outside Phase 3-2 and excluded from its completion judgment. Phase 3-3 is subsequently complete; the earlier “Phase 3-3 onward remains unstarted” wording is pre-implementation history, and Phase 4 onward remains unstarted.

#### Scenario Phase 3-3 Shared Math Verification Boundary

- **WHEN** client and server calculations consume shared support-series logic
- **THEN** direct shared-math unit coverage verifies calculation boundaries and determinism, `computeChartData` exposes the environment-independent `ClientCalculationResult` type with exported `QuarterlyAggregationRow` rows, and cwd-independent source-boundary tests scan all `src/lib/math` files plus the client adapter and confirm the server support-series boundaries use `src/lib/math/supportSeries.ts`
- **AND** client calculation modules contain no server, React, Next.js, Node runtime, or browser-storage dependency, while the existing server compatibility adapter remains unchanged
- **AND** Phase 3-3 is complete (implementation, audit, and verification): `tests/unit/math/clientCalculations.test.ts` and `tests/unit/math/dependency-boundary.test.ts` were added; direct 2 files / 9 tests passed, full 52 files / 467 tests passed, type-check succeeded, lint reported 0 errors / 5 existing warnings, production build succeeded, build parity passed with 1 file / 3 tests, cwd-independent dependency-boundary audit passed, and explicit `ClientCalculationResult` was provided

Phase 3-3 is complete (implementation, audit, and verification). Phase 3-2 completion is retained, and Phase 4 onward remains unstarted. Any historical wording stating “Phase 3-3 onward unstarted” refers to the pre-implementation history only.

#### Scenario Phase 4-1 Shared X-Axis Acceptance

- **WHEN** `EarningsBreakdownChart` or `StackedAreaChart` is rendered
- **THEN** its X-axis uses the shared `TimeSeriesXAxis` contract while existing ticks, Y-axis behavior, tooltip, legend, `data-testid`, and series rendering are preserved
- **AND** the shared core in `src/app/components/charts/xAxisTicks.ts` is used by both the monthly CPI axis and the quarterly `SpendingBarChart` axis, while `SpendingBarChart` retains its chart-specific quarterly contract: a 12-quarter edge gap and mobile endpoint avoidance; no intermediate-label collision detection is added
- **AND** Phase 4-1 is complete (implementation, audit, and verification): unit 13 files / 132 tests passed, type-check succeeded, lint reported 0 errors / 5 existing warnings, production build succeeded, and related Playwright E2E ran 128 tests with 112 passed / 16 skipped / 0 failed, including 320/375/390/430/768px coverage; `git diff --check` succeeded

Phase 4-1 and Phase 4-2 are complete (implementation, audit, and verification). Phase 4-3 and Phase 4-4 are also complete (implementation, audit, and verification). Phase 3-1 through Phase 3-3 completion states are retained, and Phase 4-5 onward remains unstarted. Earlier wording that Phase 4-2 or Phase 4-3 was unstarted refers to pre-implementation history only.

#### Scenario Phase 4-4 Public Chart Data Contract and CSV Parity Acceptance

- **WHEN** the Phase 4-4 verification gates are executed
- **THEN** `pnpm test` passes with 55 files / 486 tests, the targeted Chromium E2E passes 5/5, `pnpm test:build-parity` passes 3/3, `pnpm type-check` passes, `pnpm lint` passes with 0 errors / 5 warnings, `pnpm build` passes, and `git diff --check` passes
- **AND** Phase 4-4 is complete (implementation, audit, and verification), while the existing chart data, CSV, fixture, boundary, and WHEN-THEN contracts remain in force

#### Scenario Phase 4-2 Tooltip and Legend Contract Acceptance

- **WHEN** desktop/fine-pointer or mobile/coarse-pointer charts display tooltip and legend controls
- **THEN** hover/tap, outside-tap and scroll dismiss, same-point re-tap, chart switching, stack total/hidden-series filtering, legend `aria-pressed`/keyboard activation, mobile `details`/chevron, and the 44px minimum-style contract remain preserved
- **AND** `SpendingBarChart`'s quarterly axis participates in the shared `xAxisTicks.ts` core while retaining its 12-quarter edge gap and mobile endpoint avoidance; intermediate-label collision detection is not added
- **AND** Phase 4-2 is complete (implementation, audit, and verification): `tests/components/chart-tooltip-legend-contract.test.tsx` passed as 1 file / 6 tests; the full suite including related existing tests passed with 53 files / 473 tests; type-check succeeded; lint reported 0 errors / 5 existing warnings; related E2E after Phase 4-1 ran 128 tests with 112 passed / 16 skipped / 0 failed; production build and `git diff --check` succeeded

#### Scenario Phase 4-3 Series Registry Acceptance

- **WHEN** Earnings chart/table and NewGraph/comparison table consume shared series metadata
- **THEN** typed `SeriesMetadata`, `EARNINGS_SERIES_REGISTRY`, and `COMPARISON_SERIES_REGISTRY` are used directly by those consumers, while legacy aliases reference the same arrays
- **AND** existing keys, labels, colors, order, `advanced`, and `strokeDasharray` contracts remain unchanged
- **AND** GDP raw/comparison series and `SpendingBarChart` remain outside this registry scope
- **AND** Phase 4-3 is complete (implementation, audit, and verification): registry test passed as 1 file / 5 tests; the full suite passed with 54 files / 478 tests; type-check succeeded; lint reported 0 errors / 5 existing warnings; production build succeeded; build parity passed as 1 file / 3 tests; `git diff --check` succeeded

### Client Modules

#### src/hooks/

| Module                      | Description                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useToggleSet.ts`           | Legend toggle state (React state using `useToggleSet`)                                                                                                                                                                                                              |
| `useChartTheme.ts`          | Chart theme management; `isMobile` and `isTouch` (`pointer: coarse`)                                                                                                                                                                                                |
| `useCpiChartData.ts`        | CPI chart data filtering (quarter visibility) — server-side processing complete                                                                                                                                                                                     |
| `useCpiChartDisplayData.ts` | Existing display-data adapter for year filtering, quarter exclusion, and merged chart data                                                                                                                                                                          |
| `useCagrState.ts`           | Existing CAGR calculation calls and input/result/error/reset state                                                                                                                                                                                                  |
| `useUrlState.ts`            | Syncs `?from` / `?to` / `?hidden` / `?adv` with `window.history.replaceState` (R11)                                                                                                                                                                                 |
| `useAdvancedPreference.ts`  | Saves `newGraphShowAdvanced` as `1` / `0` in the existing effect boundary                                                                                                                                                                                           |
| `useSectionNavigation.ts`   | Owns `activeId`, scroll/scrollend observation using `scrollY + innerHeight * 0.4` and offset ranges, smooth tab scrolling, `data-lazy-section` fallback, rAF tracking, programmatic-scroll/tooltip suppression, suppression release, and listener/timer/rAF cleanup |
| `useFocusTrap.ts`           | Initial focus, `Tab` containment, and scroll-preserving focus restore for modal surfaces (R8e)                                                                                                                                                                      |

#### src/lib/

| Module                                  | Description                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `chartInfoContent.ts`                   | Info button content definitions (`CHART_INFO`)                                                                                     |
| `chartConstants.ts`                     | Chart colors, keys, and shared constants                                                                                           |
| `chartUtils.ts`                         | Chart rendering and data manipulation helpers                                                                                      |
| `math/supportSeries.ts`                 | Shared pure support-series normalization/scaling functions and environment-independent row type                                    |
| `components/charts/TimeSeriesXAxis.tsx` | Shared year/month X-axis rendering and responsive tick policy for CPI major, residual, NewGraph, earnings, and stacked area charts |
| `clientCalculations.ts`                 | Client-side utility functions for calculations                                                                                     |
| `resetLogic.ts`                         | Application state reset logic                                                                                                      |
| `unstableCache.ts`                      | Caching utility                                                                                                                    |
| `breakpoints.ts`                        | Single source of truth for `MOBILE_BREAKPOINT_PX = 768`                                                                            |
| `csvExport.ts`                          | Pure CSV serialization for the export button (R13)                                                                                 |
| `urlState.ts`                           | Pure conversion of the existing URL query state (`from` / `to` / `hidden` / `adv`)                                                 |

`src/app/components/cpiChartConfig.ts` is a typed static configuration module and must not contain React, Next.js, hooks, or browser API dependencies. `src/lib/math/supportSeries.ts` is likewise server/client-shared and must not depend on Next.js, React, Node-only APIs, or browser storage; the server adapter is the only compatibility layer for its legacy void mutation shape.

### ETL Scripts

```
scripts/
├── ts_converters/   — TypeScript CSV conversion scripts (e.g. convert_scheduled.ts, convert_contractual.ts)
├── python_backup/   — 過去の生成物・比較用（Legacy Python converters and parity verification、現行実行経路ではない）
├── build_*.sh       — Build scripts for standalone executables (PyInstaller)
└── *.spec           — PyInstaller spec files
```

`scripts/python_backup/` は過去の生成物・比較用の履歴置き場であり、現行の実行経路、実行対象、および Data Sources ではない。現行のデータ入力は上記 Data Sources に記載した `data/source/` と、現行の TypeScript converter／loader 経路に限定する。

### State Management

- Legend toggle state: React state (via `useToggleSet` custom hook)
- Year range, stacked-series visibility (`stackedHiddenKeys`), and advanced series toggle: mirrored into the URL query by `useUrlState` via `window.history.replaceState` without altering scroll position (R11); normal/moving-average legend and nominal/real visibility remain React-owned
- Theme: `data-theme` on `<html>`, persisted in `localStorage`, applied pre-paint by an inline script (R14)
- Chart data: React props from server component (no client-side re-fetch on initial load)
- API routes available for dynamic client-side queries
- Section navigation: `useSectionNavigation` owns `activeId` and browser scroll effects. It determines the active section from `scrollY + innerHeight * 0.4` against `offsetTop`/`offsetHeight`, smooth-scrolls selected tabs, resolves not-yet-mounted `LazyMount` targets through `data-lazy-section`, and tracks programmatic scrolling with rAF until `scrollend` or the 150ms timer releases active-tab/tooltip suppression. Its listeners, timer, and rAF callbacks are cleaned up on unmount. `SectionTabs` retains its existing horizontal-scroll contract.

Phase 1-1〜1-3 state boundaries preserve the above contracts. `useUrlState` updates `from`, `to`, `hidden`, and `adv` through `history.replaceState`, preserving unrelated query parameters and removing default-valued keys; `hidden` is only the stacked-series visibility state. `src/lib/urlState.ts` is the side-effect-free conversion layer. `useAdvancedPreference` reruns its effect when `showAdvanced`, `startYear`, `endYear`, or the hidden-key dependency changes, but saves only `newGraphShowAdvanced` as `1` or `0` in its existing effect timing and ignores `setItem` exceptions; it does not restore storage into initial state or write storage back to the URL. The added advanced tests cover the observed `adv=1`/stored-`0` React-input conflict (React state remains authoritative and the URL is unchanged) and unmount/remount reload equivalent (stored advanced state is not restored). `ThemeToggle` reads the `theme` key during initial client state evaluation, wraps only `setItem`/`removeItem` in interaction-time `try/catch`, and continues applying `data-theme` and the React display state when writes fail; it saves `light`/`dark` and removes the key for `system`; read failures follow the current initial evaluation path and are surfaced by the specified test. The layout inline script applies saved `light`/`dark` before paint. The specified tests confirm the SSR-equivalent no-window initial path, actual `setItem`/`removeItem` write failures with continued attribute/display updates, read failure behavior, and the current invalid legacy-value result. These cases do not establish a general URL/storage precedence rule, and actual browser reload plus `popstate` behavior remain unconfirmed.

The state ownership contract is explicit: `useUrlState` reads `from`, `to`, `hidden`, and `adv` as the initial shared URL snapshot, with `hidden` applying only to `stackedHiddenKeys`; CpiChart owns the live React mirrors and sends their changes back through `updateUrl`. `adv` is initialized only from `adv=1` and is saved to `newGraphShowAdvanced` without restoring that value on initialization. The advanced save effect may rerun for `startYear`, `endYear`, and hidden-key dependency changes, while persisting only the advanced boolean and ignoring `setItem` exceptions. Theme uses the `theme` storage key and the `data-theme` attribute on `<html>`; `ThemeToggle` saves `light`/`dark` and removes the key for `system`, while the layout inline script applies saved theme before paint. Theme does not use the URL. `useChartTheme` observes mobile/touch media queries with `matchMedia` through `useSyncExternalStore`, and its SSR snapshots are `false`. Quarter visibility, normal/moving-average legend state, nominal/real visibility, CAGR inputs/results, and section navigation are React-owned state. URL/storage conflict precedence, actual reload behavior, and new popstate synchronization are not specified as confirmed contracts.

## Operational validation contracts

#### Scenario Hook smoke validation

- **WHEN** `pnpm run test:hook-smoke` is invoked
- **THEN** the temporary bare remote/work repository verifies hook stdin/ref handling, normal and multi-ref pushes, remote deletion, failure atomicity, and the explicit full profile
- **AND** the smoke fixture uses only a stubbed `pnpm`, cleans its temporary directory, and exits nonzero when a hook gate fails

#### Scenario Cache/E2E measurement safety

- **WHEN** `pnpm run measure:cache-e2e` receives `--output` or `--e2e-command`
- **THEN** output is restricted to the repository or OS temporary directory, and the E2E command is parsed as a non-empty JSON argv array and spawned without a shell
- **AND** cache/server/test failures, invalid JSON, unsafe output paths, cleanup failures, or signal termination produce a nonzero result while writing the JSON artifact when possible

#### Scenario Vendor archive integrity

- **WHEN** package lifecycle runs `preinstall`
- **THEN** `scripts/verify-vendor-integrity.mjs` computes SHA512 with only Node standard `crypto` and compares `vendor/xlsx-0.20.3.tgz` with its checked-in `.sha512` manifest
- **AND** a missing archive, missing/invalid manifest, or digest mismatch fails installation with a nonzero exit, while the existing pnpm-only preinstall guard remains active

#### Scenario Required ordinary CI security gates

- **WHEN** a push or pull request targets `main`
- **THEN** the ordinary CI job requires `lint:fast`, `type-check`, `test:all`, `build`, `pnpm audit --audit-level=high`, and `pnpm exec secretlint "**/*"`
- **AND** each nonzero result fails the job without `continue-on-error`

#### Scenario Manual full validation scope

- **WHEN** `workflow_dispatch` runs `full-validation`
- **THEN** it runs build, build-parity, security, and E2E validation with `contents: read` permissions and records timings in `GITHUB_STEP_SUMMARY` plus logs/reports as artifacts
- **AND** when `run_production=true`, production validation is attempted in an independent step with `always()` even if build, build-parity, security, or E2E failed; when `run_production=false`, it is not run
- **AND** production validation requires the external secret `PROD_URL` and network access, passes `PROD_URL` only to that production step, and explicitly fails when the secret is unset

## Non-Goals

- Real-time data updates (data is loaded from static CSVs)
- User authentication or personalization
- Database backend (data lives in CSV files processed by ETL scripts)
- PNG/image export of charts (CSV export is supported — see R13)
- Multi-language support
- Migrating off Recharts, PWA/offline support, or a state-management library
- Phase 1-1〜1-3 does not change public UI behavior, the public data model, loader/API responses, API routes, URL format, storage keys, or the Server/Client boundary. Internal types introduced by the new hooks are not public data-model changes.

## Test Requirements

#### Hook execution architecture

- **WHEN** staged-path classification is tested
  **THEN** TypeScript, shared/type-boundary, generated, and configuration
  changes require typecheck; documentation/assets may skip it; staged
  deletion, rename, or an unavailable decision requires typecheck.
- **WHEN** the pre-push classifier is tested with multiple ref lines
  **THEN** it uses the actual pushed ref ranges, unions their paths, retains
  only safe repository-relative source/server/test candidates for related
  testing, and selects full for initial/deleted, malformed, unresolved,
  shallow, empty, or failed-diff cases and all full-impact categories.
- **WHEN** `PREPUSH_PROFILE` normalization is tested
  **THEN** unset and `changed` select changed, `full` selects full, and any
  other value selects full.
- **WHEN** the changed pre-push related runner is tested
  **THEN** a valid non-empty Vitest JSON result proceeds to build and then E2E,
  while empty candidates, zero `testResults`, missing/invalid/incompatible
  JSON, or a related-test failure invokes the full profile exactly once.
- **WHEN** full pre-push execution is tested
  **THEN** the gate order is `lint:fast` → `type-check` → `test:all` → `build`
  → `test:build-parity` → `security-check` → `test:e2e:clean` → `test:e2e`,
  build precedes E2E, and a failed gate prevents later gates; production
  validation remains a separately reported gate.

#### Phase 1 regression requirements

- **WHEN** `CpiChart` is displayed
  **THEN** the seven section ids, labels, and order remain the existing values, and the active-section initial value, `SectionTabs` props, and DOM/scroll observation receive the same section definition.
- **WHEN** the display period, quarter visibility, or other display-derived data is calculated
  **THEN** the values, order, and missing-value representation are identical to the existing adapter, including `filterDataByYear`, quarter exclusion, and `mergeChartData` results.
- **WHEN** CAGR inputs change
  **THEN** the existing calculation calls, numeric result, error state, and reset behavior remain identical.
- **WHEN** URL state is updated
  **THEN** unrelated query parameters are preserved, default `from` / `to` / `hidden` / `adv` keys are deleted, and the resulting URL is applied with `history.replaceState`; the `hidden` value represents only stacked-series visibility.
- **WHEN** the advanced preference effect runs because `showAdvanced`, `startYear`, `endYear`, or its hidden-key dependency changes
  **THEN** only `newGraphShowAdvanced` is saved as `1` or `0` at the existing effect timing, with the existing `try/catch` protection; the `theme` storage key remains unchanged and the URL is not changed.
- **WHEN** the page is initialized with URL and storage values
  **THEN** URL `from` / `to` / `hidden` / `adv` values initialize the URL snapshot consumed by CpiChart's live React state, with `hidden` applying only to stacked-series visibility; `newGraphShowAdvanced` is not used to restore advanced state, and theme is represented by the `theme` storage key plus `data-theme` on `<html>`.
- **AND** the specified advanced tests confirm that an existing `newGraphShowAdvanced` value is not read on initialization, that an `adv=1`-equivalent React input is not overwritten by stored `0` and does not rewrite the URL, and that unmount/remount does not restore stored advanced state; a general URL/storage precedence rule is not confirmed.
- **WHEN** chart theme media queries are evaluated
  **THEN** `matchMedia` subscriptions are consumed through `useSyncExternalStore`, with `false` SSR snapshots for mobile and touch.
- **WHEN** quarter visibility, CAGR, or section navigation changes
  **THEN** the corresponding state remains owned by React hooks and is not persisted to URL or localStorage.
- **WHEN** the modules render or load in SSR/module scope
  **THEN** the `ThemeToggle` SSR-equivalent no-window initial evaluation does not throw, an invalid legacy value yields the current undefined label/icon result, `setItem`/`removeItem` write failures during theme changes are absorbed while the theme attribute and display state update, and read failures follow the current initial evaluation path and are surfaced; URL/storage precedence and other unavailable-storage behavior remain unspecified.

- **WHEN** CPI loading is tested through the public `server/lib/dataLoader.ts` adapter
  **THEN** it preserves the public `loadCpiData()` rows and status contract while delegating source resolution and pair selection to `cpiSource.ts`, CSV/contribution parsing and header/content validation to `cpiValidation.ts`, and pure CPI conversion/row mapping to `cpiLoader.ts`
  **AND** `cpi.ts` remains the internal status/load adapter behind `dataLoader.ts` and retains CTI, annual GDP, and quarterly GDP responsibilities
  **AND** tests cover 2025-first selection, complete compatible 2020 fallback, and fail-closed behavior when neither pair validates through that public adapter
- **WHEN** the CPI source/transformation responsibility split is regression-tested
  **THEN** CTI, annual GDP, and quarterly GDP loader/status/public-projection contracts remain unchanged, including independent GDP validation and quarterly fail-closed behavior without annual fallback.

These regression requirements do not add requirements for a new `popstate` listener or URL/storage conflict precedence; the `data-lazy-section` fallback requirement records the existing section-navigation behavior.

- **WHEN** the user scrolls through the sections
  **THEN** the section whose `offsetTop`/`offsetHeight` range contains `scrollY + innerHeight * 0.4` selects the correct active tab.
- **WHEN** the selected section has not yet mounted under `LazyMount`
  **THEN** navigation reaches the target through its `data-lazy-section` fallback.
- **WHEN** a tab initiates programmatic smooth scrolling
  **THEN** active-section updates and tooltip display are suppressed during the scroll and suppression is released by `scrollend` or the 150ms timer after tracking ends.
- **WHEN** the section-navigation hook unmounts
  **THEN** its scroll/scrollend listeners, timer, and outstanding rAF callbacks are cleaned up.
- **WHEN** the viewport is mobile, the current section is the first or last section, or the display period changes
  **THEN** the existing mobile, boundary-section, and period-change behavior is preserved.

- Quarterly GDP regression tests MUST cover quarter-specific (not annual-repeated) values, input reordering, year boundaries, non-ready state, missing/non-finite values, and periods outside the CTI rows, while asserting CTI rows remain present and the public projection excludes internal GDP fields.

- Unit tests for data loading, transformation, and data quality/integrity (`tests/unit/`, `tests/data-quality/`)
- CPI pair integrity tests MUST unconditionally validate the 78 mapping records against `data/source/cpi-2025-official-series.csv`, including official code and name; they MUST validate the metadata-recorded source-original and snapshot SHA-256 values rather than relying only on a mapping-table hash.
- CPI loader tests MUST cover runtime validation of metadata row/series counts, period, generated-file SHA-256, monthly continuity, and 2025 all-items annual average, plus complete 2020-pair fallback when 2025 validation fails.
- CTI tests MUST require the map and snapshot to exist and MUST unconditionally match every official map row against the snapshot by official code, name, and representative values before selecting the 2025 candidate; otherwise the complete 2020 rollback is selected.
- GDP tests MUST require continuous annual observations for every year 1994–2025, valid metadata/CSV/normalization-JSON hashes, and one finite non-zero 2025 value per price concept before generating raw and comparison values. They MUST verify raw and normalized values remain separate in table, CSV, and tooltip projections, MUST NOT mix price concepts or substitute a 2020/CTI factor, and MUST assert fail-closed omission when validation fails.
- Plan21 tests MUST require both 84-row quarterly artifacts, `YYYY-Qn` continuity from 2005Q1, metadata SHA-256 agreement, separate nominal/real 2025Q1–Q4 factors, and fail-closed comparison readiness for `pending-independent-confirmation`; validated raw rows remain available in that state while comparison values remain absent. The metadata-only `isQuarterlyComparisonReady` predicate MUST inspect only confirmation/comparison metadata and MUST NOT inspect or transform rows. They MUST also retain the annual `getGdpSupportStatus()` regression contract.
- The fixture comparison gate MUST compare the normal CPI, CTI, annual GDP, and quarterly GDP observations to the fixed golden digests in `tests/fixtures/loader-comparison/golden.json` (`d6490cfbb88a94eef4c6bc150a6b5698acbfa30c3e2bf8a5fae68648663f9f5e`, `e44939cc5f6afeab444a69f3e499d30b1333f05d7d1d5c0357cd23c86869e3dd`, `0c13f58a050723be8bafe6cd2fe13f42825f8d48749703d15535aa7613ad748c`, and `147a57a94678246f9f697a9bda1c7f7f6e8ec39f23b6bb8e456fe4955a1b9b3b3`) and MUST independently compare data, status, and errors.
- The gate MUST verify every annual and quarterly source artifact against the fixed SHA-256 values recorded by the golden fixture, cover the complete 2020 CPI/CTI rollback when a 2025 candidate is invalid, assert omission of all six annual GDP keys when any annual artifact or continuity check fails, and assert quarterly fail-closed behavior for missing, duplicate, non-continuous, or non-finite inputs without annual fallback.
- The gate MUST assert the exact quarterly sequence `2005-Q1` through `2025-Q4` (84 rows), quarter-specific nominal/real values, separate 2025Q1–Q4 factors, and `not-applicable: no runtime cache wrapper`; it MUST NOT introduce a runtime cache wrapper as part of fixture comparison.
- Plan21 tests MUST verify that `page.tsx` obtains `getQuarterlyGdpSupportStatus()` and propagates `granularity`, `comparisonReady`, and `independentConfirmation` to chart info, while public quarterly chart/table/CSV projections contain only the existing nominal/real private-consumption keys and none of the four GDP raw/comparison keys. Internal loader validation and the annual rollback path MUST remain available. `tests/e2e/quarterly-gdp.e2e.spec.ts` provides the public projection smoke; E2E/build execution is environment-dependent and must be recorded when not run.
- Tests that use 2020 as a prerequisite MUST be limited to the CTI rollback path; 2020 MUST NOT be used as a general GDP normalization or continuity assumption.
- Component tests for chart rendering and interaction (`tests/components/`)
- Chart component tests MUST verify that MajorIndicesChart, StackedAreaChart, SpendingBarChart, EarningsBreakdownChart, ResidualAreaChart, and NewGraph use displayed-value maximum + 3 for the Y-axis upper bound; stacked tests MUST use per-time visible-series totals, hidden-series tests MUST exclude hidden values, and ResidualAreaChart tests MUST retain its lower-bound behavior.
- Integration tests for data mapping and computation accuracy (`tests/data-mapping/`, `tests/computation-contract/`)
- Constant/fixture tests for expected data quality (`tests/constants/`, `tests/fixtures/`)
- Performance checkpoint tests (`tests/perf-checkpoint.test.ts`)
- **Husky pre-push hook verification** (`tests/unit/husky-pre-push.test.ts`):
  - T1–T3: `check-detached-leftover.sh` detects and blocks detached HEAD commits not reachable from origin/main
  - T4–T5: Pre-push wrapper (using subprocess call, not source) correctly propagates exit codes and allows full validation sequence to run when safe
  - launcher contract: both hook wrappers remain POSIX-compatible and point to their `.bash` implementations
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
- `plan27-private-consumption.e2e.spec.ts` — NewGraphの民間最終消費支出について、全期間/2014範囲の実SVG・tooltip・表・CSV導線、adv=1延長系列、情報パネル、375px表示を検証する。
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

- **Private-consumption series identification**:
  - NewGraph uses `民間最終消費支出（参考）` / `民間最終消費(総合)` for the regular line and `民間最終消費支出（参考・延長）` / `民間最終消費(延長・参考)` for the advanced line.
- Legend and line nodes expose stable `data-key` and `data-testid` attributes.
- The advanced-series browser regression MUST identify the regular and extended
  lines through those attributes, associate each node's `stroke` with its
  expected key, and verify the SVG path coordinate range against the X-axis
  ticks: regular covers 2005-01 through 2017-12 and extended covers 2018-01
  through the available final month. It MUST NOT select an arbitrary path by
  color alone.
- It MUST parse every SVG path command and aggregate the minimum/maximum x over
  every path belonging to the selected data key; first/last numeric tokens are
  insufficient. Missing internal path segments are failures.
- X-axis assertions MUST resolve labels and `getBoundingClientRect()` centers,
  including `2005/1`, `2018/1`, and the available final month label, and verify that the
  aggregated path ranges cover the corresponding ticks within tolerance.
- Each advanced screenshot MUST have adjacent JSON metadata containing commit,
  URL, capture time, axis ticks, and target-path coordinates.
- Extended-series anchors MUST be checked from an independent raw-data fixture:
  the test verifies raw/base/scale calculation, an independently recorded
  known value, and the loader output.

#### Scenario R11c-a: Complete SVG X coverage and command continuity

- **WHEN** the regular and advanced NewGraph lines are rendered, including multiple `M/m` subpaths in one SVG `d` attribute
- **THEN** the browser test parses every command, tracks each command interval and subpath interval, and explicitly fails on missing internal X ranges or discontinuities; a single-subpath path is still required to cover every expected month continuously.

#### Scenario R11c-b: Screenshot evidence metadata reflects the current tree

- **WHEN** the default and `?adv=1` screenshots are captured
- **THEN** each adjacent JSON file explicitly lists the ordered eight-file evidence target list, hashes each listed path and its bytes (including the independent raw fixture and anchor), and requires valid `head`, 64-character `diffHash`, URL, capture timestamp, axis ticks, and per-target-path coordinates including all x min/max values, subpath intervals, command intervals, and start/end points. The target list MUST be read directly and MUST NOT depend on tracked/untracked status or `git diff HEAD`; only the explicitly marked Plan26 field that records this generated hash may be canonicalized to prevent recursive self-hashing, and all other historical `diffHash` values MUST remain unchanged.
- **AND** the current default and advanced evidence MUST use the same ordered hash-target list: `openspec/specs/nextjstest/spec.md`, `shared_plan/26-salary-data-update-plan.md`, `src/app/components/NewGraph.tsx`, `src/app/components/charts/xAxisTicks.ts`, `tests/data-quality/earning-data-integrity.test.ts`, `tests/e2e/advanced-series.e2e.spec.ts`, `tests/fixtures/csv/minkan-extension-raw.csv`, and `tests/fixtures/minkan-extension-anchors.json`.
- **AND** the default and advanced path metadata MUST use the same schema, and one shared assertion MUST validate every command's `type`, absolute x `min/max`, and `subpath` fields in both modes.

#### Scenario R11c-c: E2E execution under restricted network permissions

- **WHEN** the Playwright web server cannot bind its configured loopback port because the environment returns `listen EPERM`
- **THEN** the sandbox failure is recorded as not-run and the same targeted command is retried with approved normal host permissions; its actual pass/fail result and command are recorded in Plan26.
