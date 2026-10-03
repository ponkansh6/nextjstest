# Specification: Economic Indicators Dashboard (nextjstest)

## Legacy CTI monthly compatibility field

### Data Sources

The legacy field `CTI消費支出（参考）` is a monthly adjustment series, distinct
from the Plan37 CTI micro basic series. Its source is the old
`loadCtiDataInternal()` path and its raw `消費支出（名目）` field; it does not
consume the Plan37 long-term artifact or the Plan38 quarterly projection.
This legacy calculation remains an internal compatibility field and is not a
NewGraph comparison series.

For NewGraph's monthly comparison projection, the old 3 comparison entries
(`CTI消費支出（参考）`, `CTIミクロ基本系列（名目・参考）`, `CTIミクロ基本系列（名目・参考・延長）`) have been replaced by a single entry `消費(総合)` using the dedicated monthly key `CONSUMPTION_TOTAL_12MA_KEY`, frequency `"monthly"`, and aggregation `strict_12_month_moving_average_rebased_to_2025_monthly_average`. Old CTI monthly fields may remain in merged loader data for internal compatibility, but are not registered or projected by NewGraph. The Plan38 quarterly key remains a separate nominal-spending contract.

### Data Flow

The legacy adjustment map computes a trailing 12-month average from the old CTI
loader raw values, including the preceding 11 months needed for the 2018-01
boundary. The loader emits the legacy key only from 2018-01 onward; 2017 and
earlier are `null`. The value is normalized as
`12MA(old CTI raw) * 100 / average(old CTI raw 2025 months)` and fails closed if
the old loader does not provide all twelve 2025 raw months.
The value field is carried at the top level of each loader row, with the same
value and metadata retained under `measurements["CTI消費支出（参考）"]`; the
scalar field is assigned after the measurement map is complete so the
same-name metadata object cannot overwrite it. This legacy measurement is not
projected into NewGraph. The salary registry and Plan38 quarterly view do not
include this monthly key.

For NewGraph comparison, `server/lib/consumptionTotal12Ma.ts` uses the composition-corrected Plan39 V2 annual anchors shared with the quarterly nominal projection for 2005–2016, two-or-more-person-household raw seasonal weights, and official all-household monthly observations (`000040499028`) from 2017 onward. The private 2004 prehistory applies the same V2 category base/gamma correction using the calendar-year 2004 two-plus household share `3459/4915`; it exists only to calculate the first public strict 12MA at 2005-01 and is never emitted as a public point.
When no source root is supplied, the loader resolves `data/source` relative to the repository root derived from its module location; an existing explicit source root remains supported, with the current-working-directory fallback retained if module-relative discovery cannot find a package root.

The 3種比較 display registry uses concise legend labels `物価`, `給与`, and `消費`, with orange, blue, and red series colors respectively. The consumption tooltip shows the short description `消費支出の12か月移動平均`; detailed source and window provenance remains available to table/CSV consumers.

### Component Tree

Plan39 V2 composition-corrected annual anchors + `000040499070` historical monthly seasonality
(including private 2004 prehistory) and `000040499028` official all-household monthly observations →
`computeConsumptionTotal12Ma()` (historical reconstruction, 2025 monthly
baseline, strict trailing 12MA, status/reason and provenance) →
`loadTotalEarningDataInternal` row scalar/measurement → `toEarningsView` →
NewGraph `COMPARISON_SERIES_REGISTRY` → graph/legend/tooltip/table/CSV. The
legacy adjustment field remains an internal compatibility path; the salary
registry and Plan38 quarterly projection remain separate consumers.

The comparison registry owns the legend labels and colors (`物価` / orange,
`給与` / blue, `消費` / red); tooltip series labels and data contracts retain
their existing metadata. Consumption tooltip provenance is summarized in one
short line.

The nominal consumption graph keeps the existing support contract
`CTIミクロ四半期系列（名目）` (displayed as
`CTIミクロ（名目・四半期平均）`), using the existing nominal historical
estimates for 2005Q1–2016Q4 and official adjusted nominal quarterly source values
from 2017Q1 through the latest complete quarter. The legacy monthly field does
not create an additional bar.

### Requirements

- **WHEN** the old CTI loader has finite raw `消費支出（名目）` values, **THEN**
  the legacy adjustment uses its 12-month trailing window and does not use
  Plan37 derived values or Plan38 derived values.
- **WHEN** a monthly row is before 2018-01, **THEN**
  `CTI消費支出（参考）` is `null`/not displayable; **WHEN** it is 2018-01 or
  later and the 12-month window is complete, **THEN** it is
  `12MA(raw) * 100 / average(raw CTI 2025 months)`, and the 2025 monthly
  comparison average is 100.
- **WHEN** the comparison registry or its public projection is created for NewGraph, **THEN**
  the old 3 consumption comparison entries are replaced by a single `消費(総合)` entry (`CONSUMPTION_TOTAL_12MA_KEY`, monthly frequency, strict 12-month moving average rebased to 2025 monthly average), while CPI and wage series remain.
- **WHEN** the comparison graph, legend, tooltip, table, or CSV renders for NewGraph, **THEN**
  the new `消費(総合)` series metadata and value have parity across every public surface.
- **WHEN** the 3種比較 legend and tooltip render, **THEN** the legend labels are `物価`, `給与`, and `消費` in orange, blue, and red respectively, and the consumption tooltip explanation is the concise `消費支出の12か月移動平均` description.
- **WHEN** 2005–2016 historical monthly estimation is computed, **THEN**
  it uses the same composition-corrected Plan39 V2 annual total anchors as the historical quarterly nominal projection and two-or-more-person household raw monthly seasonal weights (`m[y,m] = A[y] * r[y,m] / meanRaw[y]`), requiring all 12 months to be finite and `meanRaw[y]` to be positive and finite; any missing month invalidates the entire year.
- **WHEN** the Plan49 calculation constructs its 2004 prehistory, **THEN** it uses the official calendar-year IV-4 share `3459/4915`, applies the same V2 per-category base/gamma calculation used for the historical annual anchors, normalizes all twelve `000040499070` raw months to that corrected annual anchor, and keeps these values internal; 2004 is not added to the public V2 rows or quarterly graph.
- **WHEN** the 2004 IV-4 CSV is missing, duplicated, or contains invalid counts, **THEN** only the 2004 prehistory anchor is unavailable; shared 2005–2016 V2 anchors remain usable, and 2005-01 has no MA12 because its required 2004 months are incomplete.
- **WHEN** the first public monthly point is computed, **THEN** it is 2005-01 and its strict 12MA window is 2004-02..2005-01; no 2004 point is emitted to NewGraph, tables, or CSV.
- **WHEN** 2017-and-later monthly values are processed, **THEN**
  official all-household monthly adjusted observations (`000040499028`) are used as-is without quarterly back-filling. The separate Plan49 pre-implementation gate compares available three-month means with official quarterly values (`000040499087`) using its fixed tolerance; that offline check does not modify monthly values and is not a runtime fallback.
- **WHEN** a 12-month moving average window is computed for NewGraph consumption, **THEN**
  all 12 consecutive calendar months must be finite and complete; partial windows or missing months yield `null`.
- **WHEN** the NewGraph consumption value for 2014-01 is computed, **THEN**
  the 12MA uses 2013-02 through 2014-01, with the required 2013 input retained so all 2014 display months can use complete windows.
- **WHEN** the salary graph/table/CSV or Plan38 quarterly view renders, **THEN**
  legacy internal compatibility requirements remain unaffected.

## Plan38 CTI quarterly nominal support

### Plan38 responsibility boundary and completion evidence

The Plan38-only nominal CTI route is the only route that targets 2005Q1 through
2017Q4. Missing, non-finite, duplicate, or incomplete months inside that window
produce a retained shared row with `value=null` and a non-empty reason; artifact
records outside the window are ignored. Within this 2005Q1–2017Q4 source
window, the route never zero-fills, interpolates, merges duplicates, or falls
back to GDP.

The existing 2018Q1-and-later legacy expense path in
`server/lib/view-models/quarterlyAggregation.ts` and
`src/lib/math/quarterlyCompleteness.ts` may retain its established zero-fill
and 2018-start detection for compatibility. That path is unreachable from the
Plan38-only CTI route. Its legacy behavior is therefore not a Plan38 missing-data
permission or prohibition to be generalized; Plan38's fail-closed rule applies
only to its dedicated CTI route.

Plan38 implementation scope includes removing salary CTI series, separating GDP
keys/values from the public nominal CTI key, and maintaining graph/table/CSV
metadata parity. Related E2E and independent fixture updates, plus Playwright
configuration/profile compatibility checks, are included only to verify the
salary boundary, 52-quarter and 2017Q4/2018Q1 boundary, nominal-only output,
and three-surface parity at the public boundary. This does not claim unrelated
pre-existing diffs or existing real/legacy behavior as new Plan38 implementation.

Measurement-aware export requires metadata parity for the Plan38 nominal CTI
contract. Real/legacy export remains within its existing contract and is not
generalized to the Plan38 metadata requirement.

Plan38 is implementation- and audit-complete. The latest recorded evidence is
Vitest 115 passed / 4 skipped, Playwright 16 passed, successful type-check,
scoped lint, build, and `git diff --check`. Completion is determined by the
implementation, synchronized specification, and verification evidence; an
uncommitted worktree is not a completion prerequisite.

### Data Sources

The nominal pre-2018 support series uses only the official long-term CTI artifact
`data/source/official-cti-2025-long-term/000040499070`, with `series_index=1`,
`official_series_code=1`, and the nominal raw index. No GDP artifact is an input
to this public nominal key. Quarterly data can also contain legacy expense rows
(including 2018Q1 and later) alongside official Plan40 rows. Their periods may
overlap; the merge retains the distinct series values from both source families
and the measurement provenance attached to each series.

### Data Flow

`ctiBasicSeries2025LongTerm.ts` validates the fixed artifact, then
`aggregateCtiBasicNominalQuarterly` averages the three distinct calendar months
for each quarter from 2005Q1 through 2017Q4. Artifact records outside this
fixed Plan38 window are ignored by the quarterly projection. Missing,
non-finite, duplicate, or incomplete input inside the window produces no value
for that quarter and keeps the shared row available for a public `null`; zero
is valid. The projection then passes the dedicated CTI nominal key to the
nominal spending chart/table/CSV.
The real projection does not receive that key and retains its existing support
path. From 2018Q1, existing CTI expense stacking remains unchanged. Its
legacy zero-fill/2018-start compatibility checks remain confined to that path
and do not weaken the Plan38-only fail-closed rule above. Once source rows have
been assembled into the combined nominal collection, legacy quarterly rows and
official Plan40 rows are coalesced by year and quarter before public projection.
For a shared period, distinct keys from both rows are kept; when both sources
provide the same key, the official Plan40 value and its measurement metadata
take precedence. Each retained value keeps the provenance from its own series
measurement, rather than inheriting row-level provenance from the other source.
This quarterly row coalescing does not change the dedicated Plan38 route's
monthly input validation, including its fail-closed handling of duplicate
months.

### Data Model

`QuarterlyRow` and `QuarterlyView` carry a `measurements` map keyed by the
public series key. Each `SeriesMeasurement` contains the row value together
with `status`, `reason`, `unit`, `source`, `valueType`, `frequency`, and
`aggregation`. `projectQuarterlyPublicView()` takes an explicit nominal/real
mode and filters both scalar keys and the measurement map to that mode's public
keys; internal GDP names, values, and measurements cannot enter the nominal CTI
route. Chart, tooltip, table, and CSV consumers read the same map without
regenerating display metadata.

### Component Tree

`ctiBasicSeries2025LongTerm.ts` → `quarterlyAggregation.ts` →
`quarterlyGdpTransform.ts` (real support only) → `quarterlyPublicProjection.ts` →
`CpiChart` → `SpendingBarChart` / data table / CSV. The wage registry and wage
projection exclude the CTI raw, regular-comparison, and extended-comparison
series.

### Requirements

- **WHEN** a nominal consumption quarter is between 2005Q1 and 2017Q4 and its
  three official CTI months are finite (including zero), **THEN** the dedicated
  CTI nominal key is the simple three-month average.
- **WHEN** `projectQuarterlyPublicView()` receives a quarterly row, **THEN** it
  includes the row only when `年` and `quarter` are integers, `quarter` is from
  1 through 4, and `label` is a valid `YYYYQn` that exactly equals
  `${年}Q${quarter}`; an invalid quarter or label mismatch is omitted. For each
  accepted row, the projected public `年月` is `${年}Q${quarter}` regardless of
  the source row's `年月` value.
- **WHEN** any required month inside the Plan38 window is missing, non-finite,
  duplicated, or the quarter has fewer than three months, **THEN** the shared
  quarter remains and the CTI value is `null` with status/reason exposed;
  artifact records outside the window are ignored, and interpolation, zero-fill,
  duplicate merging, and GDP fallback are forbidden.
- **WHEN** the boundary changes from 2017Q4 to 2018Q1, **THEN** the CTI support
  line is explicitly separate from the existing 2018Q1-and-later expense stack.
- **WHEN** nominal and real consumption sections render, **THEN** the CTI
  nominal key appears only in nominal output and GDP names/values are absent
  from the CTI nominal contract.
- **WHEN** the Plan38 nominal public projection is produced, **THEN** GDP raw/
  comparison names, values, and measurements are absent; GDP is isolated to the
  real/legacy compatibility contract.
- **WHEN** wage graph, table, or CSV output renders, **THEN** all three CTI
  micro wage-comparison series are absent while other wage series remain.
- **WHEN** chart, tooltip, table, and CSV show the same CTI quarter, **THEN**
  label, value, unit, source, aggregation, missing value, status, and reason
  are identical.
- **WHEN** a quarterly row contains measurements for both modes or legacy GDP
  fields, **THEN** nominal projection publishes only nominal CTI/consumption
  keys and real projection publishes only real CTI/consumption keys; GDP raw or
  comparison names, values, and measurements are absent from both CTI public
  contracts.
- **WHEN** combined nominal rows contain a legacy quarterly row and an official
  Plan40 row for the same year and quarter, **THEN** they are merged into one
  row per period, distinct series keys and their per-series
  measurements/provenance from both sources are retained, and official Plan40
  values and measurements take precedence for keys present in both rows. This
  applies to the combined nominal row collection before public projection; it
  does not change the dedicated Plan38 route's monthly input validation or its
  fail-closed handling of duplicate months.
- **WHEN** a measurement-aware row is exported or shown in `DataTablesSection`,
  **THEN** label, unit, source, frequency, aggregation, status, and reason are
  emitted as CSV columns and displayed from the row measurement object.
- **WHEN** a monthly row has no row measurement, **THEN** `DataTablesSection`
  displays only its numeric or missing-value cell; the `unavailable` fallback
  metadata is reserved for the nominal CTI public key.
- **WHEN** a CTI row is invalid or unavailable, **THEN** its value is `null`
  and its reason is machine-distinguishable (`missing`, `non_finite`,
  `duplicate`, `insufficient_months`, or `unavailable`), with no fixed valid
  legend state.

## SharedPlan 39: annual adjusted public contract

SharedPlan 39 defines the core calculation contract and the planned
fail-closed public route for the adjusted annual series. It is independent of
the Plan49 NewGraph monthly `消費(総合)` comparison and the Plan38 quarterly
nominal CTI support line. The public route may be enabled only after the artifact and
validation contracts below pass; an unavailable route must not fabricate a
replacement value or silently expose an internal estimate.

### Data Sources

The nominal route requires a valid versioned artifact manifest before it may
consume nominal B and A annual columns and their metadata. L may remain in the
artifact set for historical audit/rollback, but it is not a required input to
the nominal estimate. Each artifact metadata record identifies its source, definition,
unit, covered years, revision state, schema/version, and the SHA-256 hash of
the exact source artifact. The annual contract covers every required year in
the public range, with official A observations complete from 2017 onward.
The 2005–2016 nominal public values are estimated from nominal B connected to
the nominal A/B overlap in 2017; they are not presented as official
observations.

The legacy consumption-level index is a separate contract. It may consume only
an official annual artifact that explicitly defines that index and its annual
basis. Monthly aggregation, monthly interpolation, or a monthly index derived
without an official annual source is not a permitted input or fallback.

The Plan39 annual artifacts are saved under `data/source/cti-adjusted/`:
`B.json` contains the official basic annual table and `A.json` contains the
official distribution-adjusted annual table. The nominal estimate path selects
the `消費支出（名目）` columns from both artifacts (`B`: 2002–2025; `A`:
2017–2025). The artifacts also contain real columns, but those columns are not
inputs to the nominal estimate. `L.json` is a real-only long-run benchmark
(`lev-jnb.xls`); because there is no corresponding nominal L series, L and the
real-only L-derived D household-composition correction are excluded from the
nominal historical estimate. This exclusion does not remove the official
distribution-adjusted nominal A anchor for 2017 onward. Each
manifest-declared artifact retains its `sourceUrl`, `downloadUrl`, and exact
SHA-256; source and saved-artifact hashes plus format/range/missing-value
inspection results are retained in the calculation audit artifact.

The nominal public v2 estimate source is the validated nominal B/A annual
contract and its projection metadata; display provenance is not inferred from
a year or from the raw category key. Official distribution-adjusted nominal A
is the source only when the projected measurement is `official_adjusted`; an
unavailable measurement remains unavailable regardless of which artifact
supplied the attempted row. The real-only L artifact is not an input to this
nominal contract.

At runtime, the Plan39 artifact root is resolved from the absolute
`CTI_ADJUSTED_ARTIFACT_ROOT` environment value when it is set. When it is not
set, the production page loader resolves `cwd/data/source/cti-adjusted` before
any bundle-relative path, including `.next/package.json`; the selected root
must contain the manifest that passes the normal artifact validation contract.

### Superseded/旧状態: initial Plan39 diagnostic history

The earlier Plan39 calculation audit at
`results/plan39/plan39-analysis-20c80ddac60344d0.json` recorded a fixed
`auditSummary`, `verdict.status=insufficient-data`, and `accepted=false`.
Input validation passes, and the backtest passes for calibration 2018..2025
and target 2017 across nine categories with `leakage=false`. Sensitivity
compares 2018..2025 with 2018..2024 using `official_annual` L; beta/D pass,
but seven of twelve 2005–2016 years have estimate coverage (2005, 2006, 2007,
2008, 2009, 2010, 2012) and the other five (2011, 2013, 2014, 2015, 2016)
are `residual_jump_threshold_exceeded`. The sensitivity reason is
`insufficient_estimate_difference`. This sensitivity result is retained as
non-blocking audit information. The 2016→2017 boundary passes with the
superseded legacy-v1 level threshold=1.4. Therefore 2017 onward remains official A, while
2005–2016 is null/unavailable and not publicly estimated because the mandatory
threshold redesign, rolling/leave-one-year-out backtest, Other/beta stability,
2017 connection, and comprehensive re-audit remain incomplete. This is
superseded historical diagnostic state. It neither determines nor validates
the current nominal Plan39-v2 gate; absent input-matched nominal evidence,
nominal estimated rows remain unavailable.

The adopted Plan39 rollback snapshot is fixed under
`data/source/cti-adjusted/snapshots/plan39-9b899d39bae3dd832fdc9ac2806a44cd678ea700f09ec5f7f5b58e0ed5c87fa3/`.
Its snapshot ID is the SHA-256 of deterministic `B:<artifact hash>`,
`A:<artifact hash>`, and `L:<artifact hash>` lines; current time, randomness,
and filesystem timestamps are excluded. The snapshot stores the exact B/A/L
JSON, extracted metadata, manifest, audit, and `hashes.json`. It is a rollback
record only and does not change the public Plan39 route.

### Data Flow

`nominal B/A annual artifacts + metadata` → artifact/schema/hash validation →
nominal annual contract validation → nominal historical connection estimate
(without real-only L or L-derived D) → status-preserving annual projection →
explicit public A-only projection → graph/table/tooltip/CSV. The calculation
retains official distribution-adjusted nominal A values for 2017 onward and
uses the connected nominal B path for 2005–2016. Missing L data cannot alter
the nominal estimate or erase, replace, or recalculate an official A value.

The Plan39-v2 adapter preserves, for each projected category, the same
`value`, `seriesType`, `status`, `reason`, `official`, `model`, and
`estimateVersion` in the measurement consumed by the graph, display note,
table, tooltip, and CSV. A row whose value is unavailable is projected as
`seriesType: unavailable` and cannot inherit the official source label or the
official display note, even when the row belongs to the official-year range.

For publication evidence, the flow is
`CTI_ADJUSTED_ANALYSIS_FILE` → explicit analysis artifact, or
`CTI_ADJUSTED_ANALYSIS_ROOT`/`results/plan39` → matching analysis artifact →
schema and input-fingerprint validation → the shared runtime/analysis gate.
Failure at artifact discovery or evidence validation leaves estimated rows
`unavailable`.

The superseded audit verdict made the public flow fail-closed for estimated
2005–2016 values and preserved only official A from 2017 onward. The nominal
Plan39-v2 route requires a publication gate whose evidence matches the nominal
B/A inputs; the former real-input gate is not inherited. Rollback
restoration is a separate operational flow:
`rollback snapshot` → snapshot/hash/metadata validation → exact B/A/L,
manifest, and audit restore → loader-compatible manifest SHA-256 verification.
It must not fetch, synthesize, interpolate, or silently replace an artifact.

The model and validation partition observations chronologically: production and
backtest calibration use 2018–2025, while target/holdout is 2017 and is
excluded from calibration. No target value or forbidden derived parameter may
leak into calibration. The public route exposes the A-key measurement;
B inputs, real-only L, R, beta, L-derived D, residuals, intermediate
parameters, and diagnostic series remain internal or audit-only. L-derived D
does not enter the nominal estimate.

The public status vocabulary is `estimated_adjusted`, `official_adjusted`,
and `unavailable`. A missing or invalid manifest, invalid artifact, failed
metadata/hash/annual validation, non-finite calculation input, or missing
required estimate input fails closed to `unavailable` with a machine-readable
reason. Candidate CSV/JSON files are not discovered without a valid manifest.
A valid official distribution-adjusted nominal A value is `official_adjusted`;
a validated 2005–2016 nominal B/A connection output may be
`estimated_adjusted` only after the applicable publication gate is accepted.
The old `insufficient-data` verdict is historical diagnostic state; current v2
publication uses the accepted gate in the Plan39-v2 section.

### Data Model

Each annual measurement carries the period, value (`number | null`), status,
reason, unit, source, frequency, and aggregation, together with the artifact
identity/version and validated hash references needed for audit. The public
measurement key is the adjusted A key; B, L, R, beta, D, residual, and
intermediate model fields are not public measurement keys. Audit records are
JSON-safe: they contain only finite numbers, strings, booleans, nulls, arrays,
and plain objects, with no `undefined`, `NaN`, `Infinity`, functions, class
instances, or circular references. Categories excluded from the calculation
are retained as auditable `ignored_category` records rather than silently
dropped.

For Plan39-v2, `CtiAdjustedV2PublicMeasurement` extends the shared
`SeriesMeasurement` contract with `model: "v2-bottom-up"`,
`estimateVersion: "plan39-v2"`, `year`, and the public category. Its
`seriesType` is `estimated_adjusted`, `official_adjusted`, or `unavailable`;
its `status` is `valid`, `invalid`, or `unavailable`; and an unavailable
measurement always has `value: null` and a non-empty machine-readable
`reason`. The adapted display row uses the existing row vocabulary
`available`, `invalid`, or `unavailable`; internal `insufficient-data` is not
exposed by the adapter. The display note and CSV metadata are derived from
this same measurement object rather than from the raw row or year.

### Component Tree

`nominal B/A artifact loader` → `metadata/hash/annual validator` →
`nominal B/A connection estimate (without real-only L/D)` → `status-preserving A-only public
projection` → `CpiChart`/annual graph → shared descriptor and measurement map
→ tooltip/table/CSV. Every public surface reads the same projected
measurement; none recomputes the adjusted value or derives display metadata
from the raw payload key. The v2 page adapter retains the measurement
provenance and maps only the compatibility category names; it does not turn an
unavailable row into an official row.

### Requirements

- **WHEN** the nominal B and A artifacts have valid schema, metadata, SHA-256
  references, source identity, units, and complete required annual coverage,
  **THEN** the annual contract is eligible for calculation and retains the
  artifact identity and hash references in the audit record.
- **WHEN** the artifact manifest is missing or invalid, **THEN** the loader does
  not discover candidate CSV/JSON files and the public route fails closed with
  `invalid_manifest` and `unavailable` status.
- **WHEN** `CTI_ADJUSTED_ARTIFACT_ROOT` is unset and a Next production bundle
  invokes the page loader, **THEN** the loader uses
  `cwd/data/source/cti-adjusted` before bundle-relative candidates, does not
  mistake `.next/package.json` for the artifact root, and proceeds only when
  that root's manifest validates; otherwise the public route is
  `unavailable` with the existing machine-readable reason.
- **WHEN** `CTI_ADJUSTED_ARTIFACT_ROOT` is set, **THEN** its absolute root is
  preferred for manifest and artifact resolution, and the same validation
  failure remains `unavailable` rather than falling back to another root.
- **WHEN** a valid manifest declares a required nominal B/A artifact as
  missing, **THEN** the corresponding `missing_b_artifact` or
  `missing_a_artifact` reason is retained and no candidate artifact replaces
  the declared missing input. The real-only L artifact is not a required input
  to this nominal estimate.
- **WHEN** any required nominal B/A artifact, metadata record, hash, annual period, or required
  value is missing, malformed, duplicated, non-finite, or inconsistent,
  **THEN** the public adjusted measurement is `null` with status
  `unavailable` and a machine-readable reason; no fallback or partial public
  estimate is emitted.
- **WHEN** the annual contract is validated, **THEN** official A observations
  are complete and authoritative for every year from 2017 onward, while
  2005–2016 is eligible for an estimated path only after the overall verdict
  is accepted and is never labeled official.
- **WHEN** the nominal core calculation runs, **THEN** it preserves applicable
  nominal connection parameters and residual diagnostics as internal/audit data,
  excludes real-only L-derived D from the estimate, and exposes only the
  adjusted A-key measurement and its status metadata.
- **WHEN** fitting or validating the model for the 2017 boundary, **THEN**
  2018–2025 observations are used for calibration/training, 2017 is the
  holdout/target and is excluded from calibration, and the audit verifies
  `leakage=false`; backtest pass alone does not authorize publication.
- **WHEN** a 2005–2016 estimate has finite validated nominal B/A inputs,
  **THEN** the public status is `estimated_adjusted` only when the overall
  audit verdict is accepted; **WHEN** the verdict is `insufficient-data` or
  `accepted=false`, **THEN** 2005–2016 is `null`/`unavailable`.
  Missing/invalid real-only L does not affect the nominal estimate; missing
  required nominal B/A input fails the estimate closed.
- **WHEN** a valid official distribution-adjusted nominal A observation is available from 2017 onward,
  **THEN** the public projection preserves that official value and status even
  if the estimate path is unavailable; estimation MUST NOT
  overwrite official A.
- **WHEN** backtest passes but sensitivity or another adoption gate is not
  evaluable or fails, **THEN** backtest success alone does not permit public
  estimated values.
- **WHEN** the superseded legacy v1 residual-boundary diagnostic is evaluated,
  **THEN** its historical provisional level-based threshold `1.4` and former
  2018–2025 maximum are retained only as legacy audit data; they do not define
  the current Plan39-v2 gate, which uses the official-A Other-share threshold
  specified in the active Plan39-v2 requirement below.
- **WHEN** the loader reads Plan39 nominal estimate artifacts, **THEN** it consumes only
  manifest-declared nominal B/A artifacts, validates `sourceUrl`/`downloadUrl` and
  SHA-256 hashes, and fails closed without candidate discovery on any mismatch.
- **WHEN** the public projection is created, **THEN** B inputs, real-only L,
  R, beta, D, residuals, and intermediate diagnostics are absent from the public
  A-only payload; they remain available only to the permitted audit contract.
- **WHEN** graph, table, tooltip, or CSV output renders the same annual
  measurement, **THEN** value, label, unit, source, frequency, aggregation,
  status, reason, and period are identical across all four surfaces, including
  `estimated_adjusted`, `official_adjusted`, and `unavailable` states.
- **WHEN** the Plan39-v2 projection produces a public annual measurement,
  **THEN** graph, table, tooltip, display note, and CSV metadata use the same
  `seriesType`, `status`, `reason`, `value`, `official`, `model`, and
  `estimateVersion`; the display note is `2016年以前は接続推計。公式遡及値ではない`
  only for `estimated_adjusted`, `公式調整値` only for
  `official_adjusted`/official values, and `利用不可: <reason>` for
  `unavailable`.
- **WHEN** a Plan39-v2 row is `unavailable` or has a non-available status,
  **THEN** every public category measurement has `value: null`,
  `seriesType: unavailable`, a non-empty reason, and `official: false`; it is
  never labeled or annotated as an official adjusted value, and CSV value cells
  remain empty while the status/seriesType/reason metadata columns are kept.
- **WHEN** the legacy consumption-level index is requested, **THEN** it is
  sourced only from the validated official annual artifact and its declared
  annual basis; unsupported monthly aggregation or an otherwise ungrounded
  monthly fallback is rejected and fails closed.
- **WHEN** an audit artifact is serialized, **THEN** the result is JSON-safe
  and preserves validation outcome, source metadata, hashes, status, reasons,
  holdout boundaries, and model diagnostics without exposing non-serializable
  values or secrets.
- **WHEN** rollback is requested, **THEN** snapshot, metadata, manifest, and
  hash validation is read-only by default; restoration requires an explicit
  force condition and never fetches, synthesizes, interpolates, or silently
  replaces an artifact.

### Final Plan39 audit synchronization (period-unified)

The initial verdict and publication result recorded in this subsection are
`superseded/旧状態` diagnostic history. They are retained for audit traceability
and are separate from the current Plan39-v2 publication decision below.

The final audit artifact is
`results/plan39/plan39-analysis-20c80ddac60344d0.json` with
`analysisFingerprint=sha256:d036e3fb1188eb8051da7ab099da28c3ee8369c39fe065f11a7f00943694c867`
and `inputFingerprint=sha256:20c80ddac60344d0a07eb7334d016b8ebf7c5d795f4c38fb60ea32941edc8030`.
Production/backtest calibration is `2018..2025`; target/holdout is `2017`,
which is excluded from calibration. Beta has nine categories and eight finite
observations per category; backtest passes with no leakage.

Sensitivity compares `baseline_2018_2025` with `alternative_2018_2024`, both
using `L=official_annual`; `calendar_average` is not adopted. Beta/D difference
checks pass, but estimate coverage is 7/12 years (2005, 2006, 2007, 2008, 2009,
2010, 2012). The other five years (2011, 2013, 2014, 2015, 2016) are
`residual_jump_threshold_exceeded`; this is retained as non-blocking
sensitivity information. The 2016→2017 residual boundary passes:
absolute `0.7122004367`, relative `0.0429351967`, legacy-v1 level threshold `1.4`,
`exceeded=false`. The superseded overall verdict was `insufficient-data` and
`accepted=false` because the mandatory threshold redesign,
rolling/leave-one-year-out backtest, Other/beta stability, 2017 connection,
and comprehensive re-audit are not complete.

In that superseded state, publication was a fail-closed gate on the overall verdict. The result was
`publication.globallyPublishable=false` with
`blockingReason=overall_verdict_not_accepted`. Audit-only `candidateRows` (7)
are separate from the public estimated rows; `estimatedRows=0`. Only the
estimated rows for 2005–2016 are `null`/`unavailable` under this unaccepted
overall verdict, while the official 2017–2025 publication rows are retained
with official A as `official_adjusted`/`available`.

The residual jump threshold MUST NOT be changed merely to hide an exceeded
year; threshold redesign was a mandatory audit task in that superseded state
and is complete for the current v2 route.
Inputs, category mapping, units, and definitions must be rechecked instead.
The old overall verdict was `insufficient-data` and `accepted=false` until
the mandatory Other/bottom-up stability, 2017 connection,
rolling/leave-one-year-out backtests, input reconciliation, threshold
redesign, and accepted publication conditions were complete. The 7/12
sensitivity coverage is retained as non-blocking audit information; it is not
by itself a publication gate. G is an external audit benchmark and is not a
standalone stop condition. L remains limited to official 1981–2018 data with
no 2019+ extrapolation or interpolation. Optional audit strengthening may
expand gamma comparisons and design G thresholds.

#### Final Plan39 scenarios

### Plan39-v2 public route

The Plan39 section displayed by `src/app/page.tsx` uses the server-only
`loadCtiAdjustedV2Estimate` loader and `projectCtiAdjustedV2PublicView`. The
nominal loader consumes manifest-validated nominal B/A inputs and builds the v2 result;
the legacy loader and `projectCtiAdjustedPublicView` remain available for v1
consumers. The v2 result is adapted to the existing
`CtiAdjustedDisplayRow`/measurement keys before it reaches the client chart.

Runtime publication and analysis use the same publication gate. The runtime
may adopt rolling/leave-one-out evidence only when the analysis artifact has
the required gate schema and its input fingerprint matches the runtime
inputs. `CTI_ADJUSTED_ANALYSIS_FILE` selects one explicit analysis artifact;
otherwise `CTI_ADJUSTED_ANALYSIS_ROOT` selects the analysis directory, whose
matching `plan39-analysis-*.json` artifact is resolved under the normal
`results/plan39` default. An old schema, missing evidence, or a fingerprint
mismatch fails closed and preserves `unavailable` estimated rows.

#### Requirements

- **WHEN** the v2 publication gate is rejected, **THEN** all twelve
  2005–2016 estimated rows are `null`/`unavailable` with the gate reason, and
  official A rows from 2017 onward remain available.
- **WHEN** the v2 publication gate is accepted, **THEN** all twelve
  2005–2016 rows are available and marked `estimated_adjusted`, while 2017+
  rows remain `official_adjusted` and official.
- **WHEN** the page adapter maps v2 rows, **THEN** chart, table, tooltip, and
  CSV use the same adapted measurement value and metadata, including
  `model=v2-bottom-up`, `estimateVersion=plan39-v2`, status, reason, and
  official/estimated provenance; an unavailable measurement remains
  `unavailable` and does not receive an official note or source.
- **WHEN** a v1 consumer requests the legacy route, **THEN** its loader,
  projection, and public API remain unchanged.

- **WHEN** production, backtest, or training calibration is recorded,
  **THEN** its period is 2018–2025; sensitivity baseline calibration is also
  2018–2025, while sensitivity alternative calibration is 2018–2024. The
  target/holdout is 2017, excluded from calibration, and `leakage=false`.
- **WHEN** a mandatory nominal-input Other/bottom-up, 2017 connection, rolling/LOO
  backtest, input-reconciliation, or threshold audit is incomplete or fails,
  **THEN** a future evaluation is `insufficient-data`, `accepted=false`, and
  no estimated row is public. Sensitivity coverage and G are retained for
  audit and do not independently determine the gate; the former real-input
  audit's pass state does not establish the nominal gate.
- **WHEN** the former real-input legacy-v1 residual boundary has `exceeded=false` under threshold `1.4`,
  **THEN** it is retained as a passing audit result and remains non-blocking
  historical evidence; it does not establish current nominal publication readiness.
- **WHEN** the nominal v2 publication gate is evaluated, **THEN** its accepted
  analysis fingerprint must match selected nominal B/A inputs; absent this
  nominal-specific evidence, 2005–2016 estimates remain unavailable, while
  official distribution-adjusted nominal A rows from 2017 onward remain official.
- **WHEN** the v2 loader and UI projection are connected, **THEN** chart,
  table, tooltip, and CSV use the same projected values and metadata.
- **WHEN** runtime publication evaluates rolling/LOO evidence from an analysis
  artifact, **THEN** it uses the same publication gate as analysis and requires
  the current evidence schema plus an identical input fingerprint; old schema,
  missing evidence, or mismatch yields `unavailable` estimated rows and does
  not publish estimates.
- **WHEN** `CTI_ADJUSTED_ANALYSIS_FILE` is set, **THEN** that explicit file is
  resolved first; **WHEN** it is unset and `CTI_ADJUSTED_ANALYSIS_ROOT` is set,
  **THEN** matching analysis artifacts are resolved from that root; otherwise
  the default root is `results/plan39`. Any selected artifact that fails the
  schema or fingerprint contract keeps the public gate closed.
- **WHEN** optional audit strengthening is considered, **THEN** it may expand
  gamma comparisons, G thresholds, or warning wording only; no mandatory task
  remains, and L has no 2019+ extrapolation.

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

| Field                                                   | Type           | Description                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 年月                                                    | string         | Source rows may use `YYYY年M月` (including quarter-start month labels); a quarterly public projection accepts integer `年` and `quarter` 1–4 with an exact valid `YYYYQn` label, then sets projected `年月` to `${年}Q${quarter}`. Monthly public views use `YYYY年M月`. |
| 総合                                                    | number         | Displayed all-items index: CPI and earnings both use the 2025 calendar-year average = 100 display basis; any source or compatibility basis is normalized separately                                                                                                      |
| 生鮮食品を除く総合                                      | number         | CPI excluding Fresh Food                                                                                                                                                                                                                                                 |
| 持家の帰属家賃を除く総合                                | number         | CPI excluding Imputed Rent                                                                                                                                                                                                                                               |
| 民間最終消費支出（名目・原値） / （実質・原値）         | number \| null | GDP raw amount for the independent annual/real compatibility contract only; never an input or output column of the earnings projection or Plan38 nominal CTI public rows.                                                                                                |
| 民間最終消費支出（名目・比較指数） / （実質・比較指数） | number \| null | GDP comparison-only value for the independent annual/real compatibility contract; never a CTI nominal fallback and omitted when validation is absent.                                                                                                                    |
| 民間最終消費支出（四半期raw）                           | number \| null | Plan21 original-series quarterly official amount, keyed by `YYYY-Qn`; nominal and real remain separate.                                                                                                                                                                  |
| 民間最終消費支出（四半期比較指数）                      | number \| null | Quarterly GDP reference index on the 2025 calendar-year average = 100 basis (the 2025Q1–Q4 average), emitted only when independent confirmation is `ready`; pending status is fail-closed.                                                                               |
| CTIミクロ四半期系列（名目）                             | number \| null | Plan38 fixed artifact 000040499070 series 1 nominal raw index, averaged over exactly three calendar months for 2005Q1〜2017Q4; the row measurement carries status/reason/source/unit/frequency/aggregation.                                                              |
| 消費支出（参考）                                        | number \| null | Legacy row-shape field retained only for historical loader compatibility; Plan37 never populates or projects this key.                                                                                                                                                   |
| CPI総合(参考)                                           | number         | CPI All Items reference index on the 2025 calendar-year average = 100 display basis                                                                                                                                                                                      |

### Plan38 quarterly public measurement contract

`SeriesMeasurement`/`SeriesDescriptor` (`src/types/chart.ts`) are the typed public
metadata contract for the dedicated quarterly nominal CTI support key. Every
measurement and descriptor has `key`, `label`, `unit`,
`source`, `valueType`, `status`, `reason`, and `value` (`number | null`); no
`Record<string, unknown>` is allowed at the Plan38 public boundary. The registry,
chart contract, public projection, tooltip, legend, table, and CSV refer to the
same descriptor identity. Failed baselines emit null comparison values,
`status: invalid`, and a non-empty reason; valid values emit `reason: null`.
The Plan37 CTI micro raw key is retained only in internal merged data; it is not
part of the earnings or comparison registry.
The Plan49 `消費(総合)` monthly key is the sole CTI-derived consumption entry in
the NewGraph comparison registry; the Plan38 quarterly key remains outside it.

**Major runtime-added fields per data loader:**

| Loader                                      | Example fields                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPI (`loadCpiData`)                         | 生鮮食品及びエネルギーを除く総合, 食料（酒類を除く）及びエネルギーを除く総合, 外食以外食料, 交通・自動車等関係費, 選択済みCPIペアの固定ウェイト加重費目 (住居, 家具・家事用品, 教育, …)                    |
| CTI (`loadCtiData`)                         | 消費支出（名目/実質）, 食料/住居/光熱・水道/…（名目/実質）, その他の消費支出（名目/実質）。GDP support fields are an independent compatibility input and never enter the Plan38 nominal CTI artifact rows. |
| CTI basic (`loadCtiBasicConsumptionOutput`) | 二人以上の世帯「消費支出（名目）」原数値、raw値の完全12か月単純平均による12MA、2025年raw値平均=100比較値、`valid`/`reason`状態                                                                             |
| 賃金 (`loadTotalEarningData`)               | 所定内給与, 所定外給与, 特別給与, 時間当たり給与, 15歳以上国民当たり給与, 残差, \*(12MA) 系列                                                                                                              |

Displayed salary, CPI, and GDP-reference index series use the 2025
calendar-year average = 100. CTI comparison lines use their explicit raw-value
baseline contracts (including the Plan37 basic line's 2025 raw monthly average).
A 2020-base source or compatibility set
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

NewGraph's consumption comparison uses the composition-corrected Plan39 V2 annual total anchors also used by the historical quarterly nominal projection for 2005–2016, two-or-more-person-household nominal monthly raw values from CTI artifact `000040499070`, and official all-household adjusted monthly observations from `000040499028` for 2017 onward. A private 2004 anchor is calculated by the same V2 category base/gamma logic using the 2004 calendar-year IV-4 two-plus household share (3,459 / 4,915); its twelve monthly raw values are normalized to that corrected annual anchor and held only as MA prehistory. The official 2004 share source is e-Stat Labor Force Survey annual table IV-4, `statInfId=000000116109`; the source's 2005–2017 historical shares retain their existing vintage caveat. The first public point is 2005-01, whose window is 2004-02 through 2005-01. No 2004 point is included in NewGraph, exported rows, or public V2 quarterly rows. The displayed series is
`消費(総合)`, unit `指数`, monthly frequency, with the strict 12-month moving
average rebased to its 2025 monthly average. Series-level status/reason and each
point's status/reason, source and household-scope provenance are carried in the
measurement; an available MA also identifies its inclusive window and the
source/status classes represented in that window. The CTI basic normal and
extension comparison fields may remain in internal merged rows, but are not
NewGraph public comparison entries. The Plan38 quarterly key remains a
different contract.

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

Production-route Browser Mode commands use the configured Vitest provider's
`Browser` and the command's device descriptor plus scenario overrides as test
configuration. This adds no external application-data source.

Browser-test selection uses the active Vitest Browser Mode configurations and
their discovered test cases as its authoritative catalog. Each selectable ID is
derived from the configuration, spec-file path, and complete test name
(`fullName`); cases with the same complete name within one configuration/file
are one indivisible selection group. The selector sends this finite catalog,
the discovered test names, the union of automatically detected and explicit
paths, and bounded sanitized diff context to JEV. Manual invocation derives
tracked changes from `HEAD` through the index and worktree, and adds non-ignored
untracked paths, including paths outside the diff-source extension allowlist;
positional paths are unioned with those detected paths. Only allowlisted text
files receive diff excerpts. Unsupported tracked, explicit, and untracked paths
remain selection inputs and are recorded with `unsupported_file_type` omission
metadata.
When the manual selector is invoked with validated push-range input, it derives
paths and diff context from each supplied `remote_oid`/`local_oid` update pair.
The pre-push hook does not invoke this selector. Explicit absolute paths inside
the repository are normalized to repository-relative paths. Outside paths and
explicit paths containing raw `..` segments, backslashes, control characters,
or over 512 UTF-8 bytes are omitted without exposing their values and
contribute only a pathless reason/count. Diff context is limited to
20 files, 512 UTF-8 bytes per diff-file path, 4 KiB per file, and 16 KiB total.
Every transmitted path is repository-relative, uses `/` separators, and rejects
absolute paths, `.`/`..` segments, control characters, backslashes, and
credential-looking markers. Unsafe or oversized paths are omitted from every
path-bearing field and represented only by pathless reason/count metadata,
marking the context incomplete. Credential-looking paths are
excluded from both `changedPaths` and per-file omission entries; only a generic
reason and count are reported. Binary content is omitted. A non-UTF-8 tracked
or untracked file's diff body is omitted in full and marks the context
incomplete; its non-sensitive path may remain in `changedPaths` and
`omittedFiles`. Diff lines
containing secret, token, password, authorization, private-key, API-key, or
access-key markers are redacted. Symlink untracked files are omitted. The
`changedPaths` list is capped at 256 entries, 512 UTF-8 bytes per path, and
16 KiB total path bytes; paths excluded by these caps are counted in the
summary and add the `changed_path_limit` reason. `omittedFiles` is capped at 64
entries, 512 UTF-8 bytes per path, and 8 KiB aggregate path bytes; overflow is
represented by a pathless reason/count aggregate. Explicit paths without a
detected diff have
unknown status and null line counts in the summary with reason
`explicit_path_no_detected_diff`.
The context reports its source, completeness, limits, included files,
redactions, omitted files, and omission reasons; redaction or omission marks
the context incomplete. `state.diffContext.summary` is always present and
contains structural statistics, never changed text lines. It reports per-file
entries only for omitted, truncated, redacted, or capped files; safe
non-sensitive paths are
included only when at most 512 UTF-8 bytes. Each entry reports status
(`added`, `modified`, `deleted`, or `unknown`), added/deleted line counts
(integer or null), and non-empty reasons. Its fields are `files`, `fileCount`,
`omittedFileCount`, `sensitiveOmittedFileCount`, `addedLines`, `deletedLines`,
`unknownLineCountFileCount`, `reasons`, `truncated`, and
`truncatedFileCount`; it also includes `changedPathCount` and
`omittedChangedPathCount`. Sensitive paths have no per-file entry or path and
contribute only to pathless aggregate counts and reasons. Binary, unsupported,
non-UTF-8, symlink, and redacted inputs contribute only safely available
statistics and reasons. The summary is capped at 40 entries and 4 KiB
serialized as UTF-8. Final counters are set before measuring serialized size;
if needed, file entries are removed and truncation counters updated. If fixed
metadata still does not fit, a smaller metadata-only fallback is emitted.
JEV is instructed to treat it as incomplete structural context. The diff and
summary are untrusted code data, not instructions for JEV to follow.
JEV's response may select only catalog IDs. Playwright E2E specs are a separate
test path and are outside this JEV Browser Mode selector unless a future change
adds them explicitly.
The component-only `test:browser` catalog is limited to
`vitest.browser.config.ts`. The route-scoped selector catalog includes
`vitest.browser.aggregate-chromium.config.ts` and every case in
`vitest.browser.webkit.config.ts`; all four files in the WebKit config are in
scope, including `SectionTabsB3m` under its WebKit title filter.

Hook execution inputs are derived from the Git state being validated, not from
the working-tree default branch: pre-commit reads the staged path list, while
pre-push consumes every ref line supplied by Git and classifies the actual
remote-oid to local-oid diff. `PREPUSH_PROFILE` accepts `full` or `changed`;
an unset value defaults to `changed`, and any other value is treated as the
safe `full` profile. Pre-push retains only safe repository-relative source,
server, and test paths as related-test candidates; unsafe, empty, malformed,
unresolvable, or otherwise indeterminate input selects the full profile.
Browser Mode selection receives the complete validated push-impact path set,
including configuration and cross-cutting paths, rather than only the
related-test subset.

Static CSV files (not publicly served) stored in `data/source/`:

- `data/source/cpi_data2025_long.csv` — Primary CPI index input, when generated: official nationwide monthly long connected index, 1970 through the latest month, converted/connected to 2025 annual average = 100.
- `data/source/contribution2025.csv` — Primary CPI weight input: published 2025-base weights per 10,000; values are retained without editing.
- `data/source/cpi_data2025_long.metadata.json` — Required provenance and readiness metadata for the 2025 pair; it identifies the index and contribution files, base year, source identifiers, expected row/series counts, covered period, generated-file SHA-256, source-original SHA-256, and official-snapshot SHA-256.
- `data/source/cpi-2025-official-series.csv` — Minimal offline snapshot of official series codes and names derived from the long-source CSV identified by `statInfId=000040482945`; it is retained for deterministic mapping verification and is not selected as a dashboard input.
- `data/source/cpi-2025-series-map.csv` — 78-series mapping table that records official series codes, dashboard keys, classification/missing-data handling, and mapping evidence; its code and name fields are verified against `cpi-2025-official-series.csv`, not merely against a hash of the mapping table itself.
- `data/source/cpi_data.csv` / `data/source/contribution.csv` — Historical 2020-base pair removed from the repository; the runtime never resolves them. The dashboard CPI input is the complete 2025 pair alone, and any missing or invalid 2025 input returns an unavailable status with a machine-readable reason code.
- `data/source/cpi_data2025.csv` — Saved 2025-base raw monthly data beginning in 2025; it is not a long connected series and MUST NOT be selected as the dashboard CPI input.
- `data/source/cti_data2025.csv` / `cti_data2025_distribution_adjusted.csv` — 2025-base CTI candidate CSVs, each covering 2017年1月〜2026年7月. They are not selected until the adopted variant, official map, and snapshot are complete.
- Plan36専用長期成果物: `data/source/official-cti-2025-long-term/` のe-Stat current 2025年基準 CTIミクロ基本系列（二人以上世帯）。原数値 `statInfId=000040499070`、季節調整値 `statInfId=000040499082`、公式 `fileKind=0` URL、raw 2002-01〜2026-07、normalized adopted 2005-01〜2026-07、2 variant各22系列×259月=5698 rows。raw XLSX 2、normalized CSV 2、metadata 2、manifest、series-map 44 rows、representative-snapshot 132 rowsを保存し、SHA-256/manifest相互参照を検証する。normalized columnsは `variant,series_index,official_series_code,series_name,month,raw_value,is_missing`。季節調整のofficial_series_codeは公式コード行がないためnull、`-`と数値0は区別し、補間・丸め・異基準接続は行わない。既存loader採用経路とは分離し、既存2025 loader dataは変更しない。
- Plan37の公開対象はこの長期成果物の公表済み最新月を動的に採用する。2026-07は計算対象、2026-08は成果物にないため行・値を生成せず、将来の更新月を実装やテストに固定しない。
- `data/source/cti_data2025.metadata.json` / `cti_data2025_distribution_adjusted.metadata.json` — Candidate provenance and integrity metadata; they do not by themselves make a 2025 CTI set selectable.
- `data/source/cti-2025-series-map.csv` / `cti-2025-official-series.csv` — Official-code map and independent snapshot required to verify the adopted CTI candidate; every mapped official row is matched against the snapshot by code, name, and representative values.
- `data/source/official-cti-2025-long-term/000040499070.normalized.csv` and `series-map.csv` — Plan37's official 2025-base monthly CTI basic-series input. The output line selects only nominal `series_index=1`, `official_series_code=1`, `消費支出（名目）`, for 二人以上の世帯 from 2005-01 through the published latest month. The seasonally adjusted artifact and nominal file's real series are not selected.
- `data/source/cti_support_nominal2025.metadata.json` / `cti_support_real2025.metadata.json` / `cti-gdp-display-normalization2025.json` — Provenance, hash, annual-period, and independent 2025 annual-value normalization records. Metadata, source CSV, and normalization JSON hashes must agree before use. Nominal remains current prices; real remains previous-year chain-linked at its recorded 2020 reference year.
- `data/source/cti_support_nominal_quarterly2025.csv` / `cti_support_real_quarterly2025.csv` — Plan21 official Cabinet Office original-series long data, 2005Q1–2025Q4 (84 rows), nominal current prices and real previous-year chain-linked values.
- Matching `.metadata.json`, `.official.csv`, and e-Stat snapshots record source URL, retrieval/revision state, CSV SHA-256, and ready independent confirmation. `gdpSupport.ts` calculates separate nominal/real average=100 factors from the quarterly CSV observations for 2025 Q1–Q4, and verifies the metadata, CSV, official, and e-Stat artifact SHA-256 consistency before comparison values are available. Invalid or unavailable confirmation disables comparison values and never silently falls back to annual data.
- Quarterly GDP transformation is implemented by the side-effect-free `server/lib/view-models/quarterlyGdpTransform.ts`; the shared `QuarterlyRow` boundary is defined in `src/types/chart.ts`, and `server/lib/view-models/quarterlyAggregation.ts` remains the compatibility adapter for `mergeQuarterlyGdpRows` and re-exports that type. The transform validates its independent period set and joins only the real compatibility rows on exact `YYYY-Qn` keys; fixed Plan38 nominal rows bypass it.
- `tests/fixtures/loader-comparison/golden.json` — fixed fixture-comparison contract for the validated CPI/CTI loaders, annual GDP, and quarterly GDP. The observation golden digests are CPI `d6490cfbb88a94eef4c6bc150a6b5698acbfa30c3e2bf8a5fae68648663f9f5e`, CTI `e44939cc5f6afeab444a69f3e499d30b1333f05d7d1d5c0357cd23c86869e3dd`, annual GDP `0c13f58a050723be8bafe6cd2fe13f42825f8d48749703d15535aa7613ad748c`, and quarterly GDP `147a57a94678246f9f697a9bda1c7f7f6e8ec39f23b6bb8e456fe4955a1b9b3b`. Volatile metadata timestamps are excluded from the digest contract; array ordering remains significant.
- The annual GDP golden source-artifact SHA-256 contract is: nominal CSV `9a6331e1cc0ff0f4acb8da67dbdf5ed0c2b1457122b1a1b8c990911dbce2038f`, real CSV `0c6973e2b4a2686b94a7954a5a55058a5101de05ebed316066f7d0b517e6e744`, nominal metadata `8e482d34a253360918e0acdd1c2c054e969cc3ff278761b4df9263bebed24d2f`, real metadata `b01785b1f7dc7022baddf1628b2fd16e985ef95e308a1bb1c7bb9775b537cb69`, and annual normalization JSON `359e02b2ac1b46e80de9234ac965f2d41cf915cd039a872baf1713887ad836a9`.
- The quarterly GDP golden source-artifact SHA-256 contract is: nominal CSV `0b5b4b21fcc03071973c96e4c7dfffba02eb63ee600c19de023aef1c345a49a7` and real CSV `4454cc36abdd556210e0bdea1f32055c1716d799d69368e883a39f445f1ef855`. Quarterly comparison factors are calculated from the validated 2025 Q1–Q4 CSV observations; no quarterly normalization JSON is an input artifact.
- `data/source/cti_data.csv` / `cti_support_nominal.csv` / `cti_support_real.csv` — Historical 2020-base set removed from the repository; the runtime never resolves them. When a required 2025 CTI artifact is unavailable or invalid the loader returns unavailable with a machine-readable reason code instead of any 2020 selection.
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
the existing legend contract. `COMPARISON_SERIES_REGISTRY` is the three-entry
comparison registry. Its concise legend labels (`物価`, `給与`, `消費`) are
independent of the full tooltip labels; each entry owns its `color` and `order`.
`projectTooltipMetadata` resolves these fields by `key`, never from Recharts
`payload.name`.

`formatCpiTooltipValue` and `formatCpiTooltipTotal` originate in
`src/app/components/CustomTooltip.tsx`. They accept CPI display-unit values and
format finite values to two decimals; null/undefined/missing/non-finite values
render as `—` and are excluded from totals. `formatCpiTooltipTotal` accepts
nullable input and returns `—` for non-finite values instead of throwing or
emitting `NaN`/`Infinity`. The applicable expense list is the keys passed to
`SpendingBarChart`: dedicated CTI nominal quarterly support before 2018Q1,
and CTI expense items from 2018Q1 onward; the real section retains its
existing real support path.

給与ツールチップの合計対象は `EARNINGS_SERIES_REGISTRY` から投影した
`EARNINGS_TOTAL_KEYS`（`所定内給与`、`所定外給与`、`特別給与`）である。
合計はloaderの生値ではなく、給与独自の2025年平均=100基準化および特別給与の
12か月移動平均を経た表示値を使用し、補助系列3種は含めない。

Chart info は `src/lib/chartInfoContent.ts` の指標別説明を表示する。Plan37対象線の
説明は二人以上の世帯、2005年1月〜公表最新月、名目原数値、raw値の完全12か月単純平均による12MA、2025年raw値平均=100を示し、
給与・CTI・CPIそれぞれの12か月移動平均を説明する。実装用のPlan22、raw値、
内部検証保持、四半期の月範囲、9大費目の列挙はユーザー向け説明に含めない。

### Data Flow

Source/compatibility data flows through normalization before public display:
salary, CPI, CTI consumption, and GDP reference indices are projected on the
2025 calendar-year average = 100 basis. A 2020-base input is provenance for
acquisition or compatibility and is not a display basis. The salary-minus-CPI
comparison uses those same-basis indices, then 2MA, then 2025-calendar-year
average = 0 rebasing.
For Plan38, GDP key/name/value fields are excluded from the nominal CTI public
projection. GDP is isolated to the real/legacy compatibility contract only.

Plan36の取得フローは、公式fileKind=0 URLのXLSX取得（retry/timeout、appId値をログへ出さない）→同一filesystem上のstaging→target sheet/title/header/order/identity/period/duplicate/continuity検証→raw/normalized/metadata/manifest/map/snapshotのSHA-256相互検証→atomic publishとする。HTML/404/空/未知形式は拒否し、失敗時は既存成果物を保持する。raw 2002-01〜2026-07を検証後、normalizedは2005-01〜2026-07のみとし、未提供期間は補完せず明示する。Plan37はこの成果物を専用loaderで公開earnings projectionへ接続する。
Plan37の専用loaderはこのnormalized成果物から名目系列1だけを読み、raw/12MA/normal/extensionを同じ型付きdescriptor/measurementへ投影する。artifact rootはimport時のcwdに依存せず、モジュールdirnameからrepo rootを上方向へ探索し、`CTI_BASIC_ARTIFACT_ROOT`で明示overrideできる。公開statusは絶対pathを漏らさず、resolved rootの公開ラベル、artifact status/reason、baselineを保持する。公開projectionは旧 `消費支出（参考）` を選択せず、2026-07を含む公表済み行だけを返し、2026-08のような未提供月は生成しない。既存loaderが持つ2020 rollback契約は別経路として存続し得るが、Plan37線へ流入しない。

For quarterly consumption, `quarterlyAggregation.ts` creates the fixed
2005Q1–2017Q4 nominal CTI artifact projection first: exactly 52 rows are
retained, every row has a CTI measurement with `valueType=raw`, and invalid quarters carry
`value=null` plus a reason. It performs no GDP join, zero-fill, interpolation,
partial-window acceptance, or duplicate merge. From 2018Q1, the existing CTI
expense-item aggregation remains unchanged. GDP loading/joining is isolated to
the independent real support path, and `src/lib/math/clientCalculations.ts`
does not recalculate, fill, or first-value-select either server support series.

`CpiChart` creates one request-scoped CPI/salary comparison registry and passes it
to `CpiChartSections`, `NewGraph`, tooltip projection, and the
`section-new-graph` `DataTableSpec`. The quarterly nominal CTI descriptor is kept
only on the nominal spending contract. `CpiChartSections` projects CPI and salary
comparison entries through
the shared `projectTooltipMetadata` helper. `useChartTooltipProps` passes that
projection through `useChartTooltipController` to `CustomTooltip`, which
resolves rows by `dataKey` and takes label, color, and order from the same key.
Missing registered payload values are complemented as `—`; Spending's explicit
`allowedKeys` function enforces the quarterly spending boundary. Comparison tooltip visibility uses the same advanced/hidden registry projection
as NewGraph drawing and legend; registered null values remain in the tooltip as `—`, so the
three surfaces have the same visible registered-series set for each period.

Plan37's raw CTI line is independently rendered by `EarningsBreakdownChart` and
never substitutes a comparison value when raw data is null. Normal/extension
selection remains controlled by the existing `adv` boundary; measurement unit,
source, status, and reason are retained in the public projection and CSV metadata.

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

After provider validation and Browser acquisition, a production-route command
calls `withIsolatedContext(browser, options, callback)`. The command retains
route navigation, page creation, assertions, and result handling; the shared
helper only creates and closes the independent `BrowserContext`.

### Component Tree

`CpiChart` → `CpiChartSections` → `NewGraph`, `EarningsBreakdownChart`, and
`SpendingBarChart`. `CustomTooltip` is the shared display contract consumed by
those charts through `useChartTooltipProps`. `ChartLegend` and each inline
legend preserve registry/key order, label, color, hidden state, and advanced
state; NewGraph additionally retains defined legend entries for all-null data.
Drawing, legend, tooltip, table, and CSV bind to the same metadata keys while retaining
each chart's existing renderer.
Plan37の専用loaderはraw/normal/extension CTI basic fieldsとtyped
`SeriesDescriptor`/`SeriesMeasurement`を内部互換用に保持する。これらのnormal/extension
keysはNewGraphのcomparison registryへは投影しない。NewGraphはPlan49の
`消費(総合)` measurementを使用し、status/reason、source/provenance、MA windowを
chart、legend、tooltip、table、CSVへ伝える。legacy `消費支出（参考）` もNewGraphでは選択・描画しない。

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
- `data/source/cti_support_nominal.csv` / `data/source/cti_support_real.csv`（2020基準・削除済み）— historical CTI supporting series

Plan36取得基盤による追加なし。成果物は既存loader/API、公開データモデル、画面へ接続しない。

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

Production-route Browser Mode test → route command →
`withIsolatedContext` → isolated `BrowserContext` → command-owned page/route
work. The production-route runner invokes these commands with its configured
Vitest provider; it does not share a context between command invocations.

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

Support-series normalization is a shared, server-independent domain calculation for explicit
real/legacy compatibility consumers. Its source values remain the validated GDP/CTI support CSVs
above; source loading and validation stay server-only. `server/lib/data-loader/gdpSupport.ts` uses
the shared pure domain at `src/lib/math/supportSeries.ts`; `src/lib/clientCalculations.ts` does not
invoke support-series math for CTI or its public quarterly projection. `server/lib/math/supportSeries.ts`
remains only the void-compatible compatibility adapter/re-export for existing server-side imports. The shared pure
`scaleSupportSeries` preserves missing, `NaN`, `±Infinity`, and out-of-period values without fabricating
finite zeroes and never mutates input rows. The server void `applySupportSeriesScaling` and any
explicit legacy compatibility adapter may retain the legacy zero-fill/`value || 0` behavior, but
neither is reachable from the Plan38 CTI public projection. The annual normalizer fails closed
unless given exactly one positive finite value. Public JSON shape and SSR boundary are unchanged.

- **WHEN** validated annual or quarterly support CSV values are normalized or scaled
- **THEN** server-side loading and validation supply inputs to the shared pure domain, while client
  and server use the same formulas without a client-to-server dependency
- **AND** the shared pure scale preserves missing, `NaN`, `±Infinity`, and out-of-period values without
  fabricating finite zeroes, while explicitly isolated legacy adapters may retain legacy
  zero-fill/`value || 0` behavior but cannot affect the Plan38 CTI public projection; the annual normalizer fails closed for any input other than one positive finite value
- **AND** the established 2025 display basis and rounding are preserved; a 2020 source or compatibility basis remains provenance and is not treated as the display basis

## Requirements

### R-Plan37: CTI basic series loader compatibility (NewGraph projection superseded by Plan49)

The legacy monthly raw/12MA wording below is retained only for internal
loader compatibility. Plan49 is authoritative for NewGraph monthly comparison
output (`消費(総合)`); Plan38 is authoritative for the separate public chart,
table, tooltip, CSV, and nominal quarterly row contract.

- **WHEN** the official CTI long-term input is valid
- **THEN** raw, normal 12MA, and extension 12MA values retain their typed
  descriptor fields and source/unit in the internal Plan37 loader contract; these
  keys are not projected to NewGraph chart, legend, tooltip, table, or CSV
- **WHEN** the Plan37 12MA baseline is incomplete, non-finite, or `B <= 0`
- **THEN** its internal comparison fields are null and the Plan37 loader status
  carries a machine-readable invalid reason; no GDP or rollback fallback is used.
  NewGraph uses the separate Plan49 status/reason contract.
- **WHEN** `adv` is off/on or the period crosses 2017-12/2018-01
- **THEN** the comparison graph exposes CPI12MA, salary12MA, and the single
  Plan49 `消費(総合)` key; `adv` does not add the retired Plan37 normal/extension
  CTI monthly keys, and neither GDP nor the Plan38 quarterly key is used by the
  comparison line
- **WHEN** the artifact latest month is 2026-07 and the requested period reaches 2026-08
- **THEN** 2026-07 is calculated and 2026-08 is absent/null; the implementation derives the boundary from artifact metadata rather than a fixed future month
- **WHEN** the Plan38 path is invoked with a 2020 rollback-capable loader state
- **THEN** the quarterly nominal CTI measurement still comes only from the fixed 2025 long-term artifact; the historical rollback contract remains isolated to its own loader tests
- **WHEN** CTI artifact loading or baseline validation returns `invalid`
- **THEN** Plan37 loader status/reason remains available internally, while NewGraph
  publishes only the Plan49 `消費(総合)` entry and its own status/reason; no GDP or
  Plan38 quarterly fallback is used
- **WHEN** the NewGraph table or CSV is produced
- **THEN** its `DataTableSpec.metadata`, `DataTablesSection`, `ChartExportButton`, and CSV columns contain the same ordered CPI12MA, salary12MA, and Plan49 `消費(総合)` registry entries

#### Plan37 skip classification

The measured classification is Plan37対象skip=0 and legacy skip=4. Two
Plan37-relevant checks are active: the current single-consumption-key
NewGraph/public-projection check and the 2016-12/2017-01 CTI continuity check. The remaining four are
explicitly named `legacy:` skips:
the GDP-backed NewGraph check, annual GDP normalization, the legacy display-base
compatibility check, and the 2020 rollback-only assertion. They remain outside
the Plan37 test contract because their GDP/legacy keys must not be re-enabled
against the CTI public line. Active Plan37 coverage separately verifies loader raw and measurement
compatibility, latest-month handling, normal/extension internal periods, and
rollback isolation; NewGraph coverage verifies the Plan49 registry projection. The four legacy test names are `legacy: verifies the regular
2025 GDP-backed NewGraph series independently`, `legacy: 年次GDP値に基づく2025基準の表示値を検証`,
`legacy: should base displayed index series on the 2025 calendar-year average`,
and `legacy: should keep 2020 fixed scaling rollback-only and leave GDP 2025 comparison keys unset`.
The Plan37 target skip count is therefore zero in both the audit log and this specification.

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

#### Scenario R-Hooks-1b: Staged secret detection

- **WHEN** a staged file contains a secret recognized by the recommended
  Secretlint preset, including a Git-ignored path explicitly added to the
  index
- **THEN** commit-scoped `lint-staged` fails before the commit and reports the
  finding with the default masked output
- **AND WHEN** a synthetic secret exists only in an untracked file while the
  staged files contain no detected secret
- **THEN** the staged secret scan succeeds without scanning the untracked file

#### Scenario R-Hooks-1a: Pre-push clean worktree guard

- **WHEN** a push is attempted from a repository with tracked changes that
  differ from `HEAD`
- **THEN** the pre-push hook stops before any validation gate runs and prints
  the changed paths so local-only fixes cannot make the push validation pass
- **AND WHEN** an untracked file exists under `src/`, `server/`, or `tests/`
- **THEN** the pre-push hook also stops and prints the untracked path because it
  would not be included in the pushed commit
- **AND WHEN** the repository has no tracked changes and no untracked source,
  server, or test files
- **THEN** the pre-push hook continues to detached-HEAD and push-impact checks;
  unrelated local artifacts remain outside this guard

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
- **THEN** gates execute in order: `lint:fast`, `type-check`, `test:coverage`,
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
    - Displays the CPI and wage comparison lines; the CTI micro monthly wage lines are not part of this registry.
- The nominal spending chart uses one dedicated CTI quarterly key: existing nominal estimates for 2005Q1〜2016Q4 and official adjusted nominal quarterly original values for 2017Q1 through the latest complete quarter. The value and row measurement metadata are public together.
- Missing, duplicate, non-finite, out-of-range, and incomplete CTI inputs fail closed with a retained reason. No interpolation, zero-fill, partial window, GDP fallback, seasonal-adjusted mix, or 2020 rollback path is used.
  - NewGraph does not use GDP for the Plan37 CTI basic line; GDP comparison remains an independent quarterly/annual contract elsewhere.
  - The 2016Q4/2017Q1 source boundary is owned by the quarterly aggregation/projection layer; from 2017Q1 the official adjusted nominal quarterly source is used. Quarterly public labels remain `YYYYQn`.
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

#### Scenario R2c: Plan38 CTI Bars and CTI Consumption Bars

- **WHEN** nominal consumption data is rendered in `SpendingBarChart`
- **THEN** 2016Q4以前は既存の名目推計系列を描画し、2017Q1以降は公式調整済み名目四半期系列を描画する
- **AND** 公式四半期値はe-Stat table 2-1-1の原数値と費目構成を保持する
- **AND** GDPとCTIを同一四半期に同時表示・合算せず、GDP専用key/value/nameは公開しない
- **AND** nominal CTI data, legend, and tooltip exclude GDP comparison values for every period
- **AND** CTI欠損を0埋めせず、境界で値の複製・補間・表示用係数合わせをしない
- **AND** 消費支出グラフはモバイル専用の余白・safe-area、棒幅・間隔を適用し、横overflowを発生させない
- **AND** tooltipはモバイルでも全費目を内部スクロール付きで表示する

#### Scenario R2c-missing-data: Quarterly CTI completeness and parity

- **WHEN** a 2005Q1〜2017Q4 CTI quarter lacks any of its three official monthly records, or a value is missing or non-finite
- **THEN** that shared nominal row remains present with a null CTI value and a reason; no zero row, interpolation, or GDP fallback is generated
- **AND** the chart, tooltip, data table, and CSV expose the same remaining quarter labels
- **AND WHEN** all three monthly observations are present and a consumption value is zero
- **THEN** the quarter remains visible as a valid zero-valued quarter
- **AND WHEN** `hiddenQuarters` or the displayed year range is changed
- **THEN** filtering is applied to the already-complete row set and cannot restore an omitted quarter
- **AND** GDP loading and null handling remain independent in the real/legacy compatibility path and cannot affect nominal CTI row retention

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
- **THEN** `cpiSource.ts` resolves the candidate paths, resolves and validates 2025 metadata, validates each index/contribution pair, and owns 2025-only pair validation and selection: it resolves only the complete 2025 pair and fails closed with a machine-readable reason code when that pair does not validate, never resolving 2020 paths
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
- **WHEN** the 2025 candidate is missing or invalid or incomplete
- **THEN** the same public `loadCpiData()` contract returns no CPI rows and `getCpiDataStatus()` reports `valid: false` with the machine-readable reason code, without accessing any 2020 input
- **WHEN** the 2025 pair does not validate
- **THEN** the same public adapter returns no CPI rows and `getCpiDataStatus()` reports `valid: false` with no selected base year or pair and the machine-readable reason code
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
- **THEN** the loader fails closed: it returns `valid: false` with the mapped machine-readable reason code and reads no 2020 file
- **AND** it never combines an index CSV from one base year with weights from another base year
- **AND WHEN** neither complete pair validates
- **THEN** the loader returns no CPI rows and `getCpiDataStatus()` reports an invalid status with no selected base year, rather than serving mixed or partially validated CPI data

#### Scenario R3h: CPI Data Status for the UI

- **WHEN** the dashboard page loads CPI data
- **THEN** it also obtains `getCpiDataStatus()` and passes the selected base year and source mode to the CPI information UI
- **AND** the UI identifies a validated 2025 pair as the official connected series, and for an unavailable or invalid 2025 pair it shows user-facing unavailable wording derived from the reason code, never describing a 2020 fallback state

#### Scenario R3h1: Unchanged CTI, GDP, and Quarterly Contracts

- **WHEN** the CPI source-responsibility split is used
- **THEN** CTI selection/transformation and its public loader contract remain unchanged
- **AND** annual GDP validation, normalization, raw/comparison separation, and its public status contract remain unchanged and independent of CPI/CTI selection
- **AND** quarterly GDP validation, status propagation, public projection, and fail-closed behavior remain unchanged and do not fall back to annual GDP

#### Scenario R3b: Legacy CTI / Earnings / Consumption Data Loading

- **WHEN** the historical `loadCtiData()` / consumption map builder contract is called
- **THEN** it selects a complete, verified 2025 CTI candidate only when its candidate CSV, metadata, official map, and snapshot validate; otherwise it returns unavailable with the mapped machine-readable reason code without opening any 2020 input
- **AND** it validates the CTI set and the nominal/real GDP comparison set independently and never treats GDP availability or a CTI base year as a condition for CTI selection
- **AND** it matches every adopted CTI map row to the official snapshot row-by-row, including official code, name, and representative values
- **AND** it returns an explicit unavailable state when neither complete set is valid
- **AND** missing CTI inputs remain missing; they are not converted to zero, and a derived residual is missing when any required component is missing.

When the legacy CTI map/snapshot or another candidate input fails validation, that contract returns unavailable with the mapped machine-readable reason code; no 2020 rollback is selected. This rule does not govern Plan37: its dedicated long-term line always uses only the fixed 2025 nominal series and fails closed without GDP, seasonal-adjusted, real, or rollback fallback. When the annual nominal/real GDP pair passes its independent validation, `getGdpSupportStatus()` reports available GDP comparison normalization without affecting either CTI contract.

#### Scenario R3b-validation: Duplicate CTI month diagnosis

- **WHEN** a legacy CTI main file contains repeated `年月` values, including a repeated month that also breaks chronological continuity
- **THEN** validation returns `invalid or duplicate CTI 年月` before checking continuity
- **AND WHEN** all month values are unique but their chronological sequence has a gap
- **THEN** validation returns `invalid or discontinuous CTI 年月`

#### Scenario R3b-plan36: Long-Term CTI Acquisition Foundation

- **WHEN** plan36 retrieves the official current 2025-base CTI micro basic-series XLSX for two-or-more-person households from the official `fileKind=0` URLs
- **THEN** raw `statInfId=000040499070` is recorded as original values and raw `statInfId=000040499082` as seasonally adjusted values, each covering 2002-01 through 2026-07; each variant has 22 series × 259 months = 5698 normalized rows for the adopted 2005-01 through 2026-07 range
- **AND** normalized columns are `variant,series_index,official_series_code,series_name,month,raw_value,is_missing`; seasonal-adjusted `official_series_code` is null when the source has no code row, and `-` remains distinct from numeric zero
- **AND** no interpolation, rounding, or cross-base linking is performed
- **WHEN** an HTML/404/empty/unknown response, target-sheet/title/header/order/identity/period/duplicate/continuity mismatch, or invalid schema is encountered
- **THEN** acquisition and publication are rejected closed, and an unavailable period is stated rather than inferred or filled
- **WHEN** any raw/normalized/metadata/manifest/series-map/representative-snapshot SHA-256 or manifest cross-reference is altered
- **THEN** integrity validation rejects the set and does not select it
- **WHEN** staging or atomic publication fails
- **THEN** existing plan36 artifacts remain unchanged
- **WHEN** appId configuration is absent or an acquisition error is reported
- **THEN** secrets/appId values are never emitted, and periods not provided by the official source are explicitly identified
- **AND** this plan36 long-term artifact remains separate from the existing 2025 candidate/2020 rollback loader adoption path; it does not connect a loader, UI, API, or component tree

#### Scenario R3d: Plan37 CTI Basic Source Basis, 12MA, and Comparison Rebase

- **WHEN** `computeConsumptionTotal12Ma()` is called without an explicit source root
- **THEN** it resolves `data/source` from the repository root relative to its module location, retaining the current-working-directory fallback only when that root cannot be discovered; an explicit existing source root is used directly
- **WHEN** the Plan37 long-term CTI basic loader is used for internal monthly data
- **THEN** it selects only `series_index=1`, `official_series_code=1`, nominal raw `消費支出（名目）` from the 2025 long-term artifact and retains raw separately from its normal/extension 12MA compatibility fields; NewGraph comparison uses Plan49 `消費(総合)`
- **AND** Plan37 internal CTI basic fields use only the official 2025 long-term input, with no GDP, seasonal-adjusted, real, 2020 rollback, or other fallback, and adopt the artifact's published latest month dynamically
- **AND** the Plan38 nominal quarterly public projection emits only the fixed CTI nominal key and row measurements; it does not emit GDP raw/comparison keys or earnings CTI micro keys even as null placeholders
- **AND** each fixed Plan38 nominal quarterly row measurement carries `valueType=raw`; its artifact index is not a comparison value
- **AND** CTI 12MA is calculated as a complete 12-calendar-month simple average of raw values first, then rebased by the average of the 12 finite 2025 raw monthly values; the comparison field is invalid/null with a reason when that raw baseline cannot be verified from 12 finite months or is non-positive
- **AND** the independent GDP/legacy loader and projection may retain their own raw/comparison/rollback keys, but they are separate contracts and cannot flow into the Plan37 projection.

#### Scenario R3d-advanced: Plan37 internal monthly extension compatibility

- **WHEN** the Plan37 internal extension compatibility field is generated
- **THEN** it uses the same official CTI raw/12MA maps as the normal field, with 2018-01 onward under the internal extension key; GDP availability never changes the values, and these keys are not NewGraph registry entries
- **AND** when a following month is absent from the artifact it is absent/null and never synthesized
- **AND** the normal/extension measurement metadata is taken from the same period row; internal compatibility export must not reuse the first row's metadata for later or invalid months

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

#### Scenario R3l: Legacy Fixture Comparison Gate

- **AND** this is a legacy-only loader/projection contract: its GDP raw/comparison and 2020 rollback keys are not part of the Plan37 CTI public output, which is guarded separately at the `toEarningsView` boundary
- **WHEN** the fixture comparison gate observes the normal loader path
- **THEN** CPI, CTI, annual GDP, and quarterly GDP observations match the fixed golden digests recorded in `tests/fixtures/loader-comparison/golden.json`
- **AND** the annual GDP nominal/real CSVs, metadata files, and annual normalization JSON, and the quarterly nominal/real CSVs plus their metadata, official snapshots, and e-Stat snapshots match their recorded source artifact SHA-256 values
- **AND** value, status, and load/status-error observations are compared independently, with normal observations reporting the expected valid/ready state
- **WHEN** the 2025 CPI or legacy CTI candidate is unavailable or invalid
- **THEN** the legacy loader contract fails closed with the mapped machine-readable reason code, selects no 2020 pair/set, and the fixture gate covers the reason-coded fail-closed behavior instead of any rollback; it is not a Plan37 line input
- **WHEN** any annual GDP source artifact is missing or invalid, or annual coverage is not continuous for every year 1994–2025
- **THEN** GDP validation fails closed and none of `民間最終消費支出（名目）`, `民間最終消費支出（実質）`, `民間最終消費支出（名目・原値）`, `民間最終消費支出（実質・原値）`, `民間最終消費支出（名目・比較指数）`, or `民間最終消費支出（実質・比較指数）` is emitted
- **WHEN** quarterly GDP artifacts are missing, contain duplicate/non-continuous periods, or contain non-finite values
- **THEN** the quarterly result is `{ rows: [], comparisonReady: false }`, its independent confirmation is failed, and it does not fall back to annual GDP or remove CTI rows
- **AND WHEN** quarterly GDP validation is normal
- **THEN** nominal and real periods form the exact continuous sequence `2005-Q1` through `2025-Q4` (84 rows), with separate quarter-specific values and comparison factors calculated from the validated 2025Q1–Q4 CSV observations
- **AND WHEN** the fixture gate records cache behavior
- **THEN** it records `not-applicable: no runtime cache wrapper`; no runtime cache wrapper is required or inferred by this gate

#### Scenario R3k: Quarterly GDP Consumption Join

- **WHEN** `page.tsx` receives quarterly CTI aggregates and the independent real support output from `loadQuarterlyGdpData()`
- **THEN** it joins them by an exact `YYYY-Qn` key regardless of input order
- **AND** it publishes only finite nominal/real comparison values when `comparisonReady` is true
- **AND** missing, non-finite, out-of-range, or non-ready GDP values remain absent while CTI rows remain present
- **AND** chart, tooltip, table, and CSV consume the same joined public rows
- **AND** the nominal consumption chart maps pre-2018Q1 fixed-artifact CTI rows to a standalone bar and 2018Q1+ CTI expense fields to stacked bars; the real compatibility path remains separate
- **AND** GDP values are excluded from 2018Q1+ chart data, legends, tooltips, and CTI totals; comparison keys may be retained as `null` only in the real/legacy compatibility projection, while the Plan38 nominal public projection emits no GDP key, name, value, measurement, or placeholder
- **AND** before 2018Q1 the nominal tooltip total includes only the CTI artifact value, while from 2018Q1 the tooltip total includes only visible CTI expense fields
- **AND** the real/legacy compatibility table and CSV may retain the normalized quarterly comparison column for verification, but never expose raw/internal GDP fields; the Plan38 nominal table and CSV emit no GDP key, name, value, measurement, or placeholder, and chart, legend, and tooltip visibility remains governed by the display-period contract
- **AND** the quarterly public chart, data-table, and CSV surfaces use the same complete selected `YYYYQn` period set
- **AND WHEN** a joined GDP value is missing, or the series ends before later CTI rows
- **THEN** the Plan38 nominal row retains only CTI data and does not zero-fill, copy, interpolate, or rescale GDP; any missing GDP handling remains confined to the real/legacy compatibility projection
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
  - **AND** a validated 2025 set explains the two-or-more-person-household nominal CTI basic series, its 2005-01〜latest range, raw/12MA distinction, and 2025 raw monthly average = 100 basis
  - **AND** it explains the independent GDP reference contract separately from the CTI total and miscellaneous/CPI-external difference in concise user-facing language
  - **AND** for the 3種比較 panel, it briefly describes the three monthly 12-month moving-average series as: 給与 from salary, 消費 from the monthly consumption total rebased to its 2025 monthly average, and 物価 from CPI
- **AND** it explains in the lower part of the info panel that the 2018年以降の CTI expense-item continuation is separate from the independent GDP reference contract
- **AND WHEN** the 2025 set is unavailable, invalid, or no complete compatible set exists
- **THEN** the panel shows user-facing unavailable wording derived from the reason code, without exposing internal file or validation terminology and without mentioning any 2020 rollback.

#### Scenario R6d: GDP and CTI Comparison Explanation

- **WHEN** a user opens the spending or 3種比較 information panel
- **THEN** it identifies GDP reference values as separate nominal and real comparison indices, distinguishing current-price and chain-linked concepts
- **AND** it explains that GDP reference values are comparison indices, that the CTI total is the displayed CTI expense total, and that 諸雑費・CPI外支出 is the residual difference from the total
  - **AND** it states that the Plan37 CTI basic series covers 2005-01〜公表最新月 and is not connected to GDP, seasonal-adjusted, or 2020 rollback values.
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
- **AND** the 2017Q4/2018Q1 boundary remains a standalone CTI artifact bar followed by CTI stacked bars, with no GDP overlap, interpolation, or independent GDP line

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
- **THEN** when every supplied expense series is hidden and no support series is available, the chart exposes its empty-state message in a `role="status"` region: `表示する系列がありません。凡例から費目を1つ以上選択してください。`
- **AND** the chart permits recovery without displaying nonexistent bars or values
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

- **WHEN** the comparison-display contract is rendered before/at the `2017Q4`/`2018Q1` boundary or with advanced on/off and hidden keys
  **THEN** drawing, tooltip, and legend use the same visible registry keys, complete tooltip/legend labels, colors, numeric order, and advanced state, while nominal tooltip detail/total includes CTI artifact values before 2018Q1 and CTI (including the opt-in extension) from 2018Q1.
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
- **AND** desktop mouse movement within a spending chart wrapper selects the
  corresponding tooltip index through the same controller path as pointer
  movement, including after Escape dismissal only when the pointer has first
  left the wrapper and then returned.
- **AND** DOM re-rendering that emits only mouse-entry events does not clear
  Escape dismissal.
- **AND** leaving the chart wrapper clears the controlled active chart unless
  the related target is inside `[data-custom-tooltip]`; after Escape dismissal,
  leaving the chart records the exit so the next chart move can clear that
  dismissal state.

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

#### Scenario R18e: Invalid Year State Falls Back to the Caller’s Initial Year

- **WHEN** the caller provides valid initial start and end years and a CAGR year setter receives `NaN`
- **THEN** rendering settles without a state-update loop, and calculation uses the corresponding configured initial year for the invalid selection

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
    │   ├── SpendingBarChart (nominal) — mobile-specific spacing/ticks, bar width, and all-value tooltip/details; closed-by-default legend; fixed CTI artifact rows before 2018Q1 and CTI expense fields from 2018Q1, with no GDP key
    │   ├── SpendingBarChart (real) — mobile-specific spacing/ticks, bar width, and all-value tooltip/details; closed-by-default legend; existing real support path and CTI expense fields from 2018Q1
    │   ├── EarningsBreakdownChart → CustomTooltip — 2025年平均=100 salary indices; complete registry labels with natural wrapping and stable value column; six rows plus `給与区分合計（所定内＋所定外＋特別）` from visible `EARNINGS_TOTAL_KEYS` (`showTotal`, `totalLabel`, and `totalIncludedKeys=EARNINGS_TOTAL_KEYS`); hidden included rows are removed and the total is recalculated from the remaining visible included rows; salary-only `separatorBetweenGroups` is placed on the first visible auxiliary row
    │   ├── ResidualAreaChart → CustomTooltip
    │   └── NewGraph → ChartInfoContentRenderer → CustomTooltip — comparison visualization receives 2025年平均=100 CPI and salary plus Plan49 `消費(総合)` monthly strict 12MA rebased to its 2025 monthly average; legacy CTI monthly keys and Plan38 quarterly CTI are not comparison registry entries
    ├── ChartInfoButton → ChartInfoContentRenderer — Indicator explanations (uses `chartKey` plus loader-resolved state in `src/lib/chartInfoContent.ts`)
    ├── ChartDataContract — stable normalized chart data attributes for each of the seven targets
    ├── ChartExportButton — CSV download of the displayed rows (inside each chart's <details>)
    ├── ChartLegend — defined visible-series legend contract; retains values whose current data is null
    └── CustomTooltip (React.memo, module-level component for charts, managed via `useChartTooltipController`; key-based metadata supplies label/color/order and the total row follows the Spending tooltip hierarchy)
```

Manual Browser Mode selection uses active Vitest Browser Mode catalog
discovery → JEV case selection → strict selected-ID validation → configured
component or production-route runner. The catalog is keyed by config, file,
and full test name; the selector does not execute model-supplied commands or
paths. Pre-push does not invoke the selector: it runs all component Browser
Mode cases and all production-route cases. Playwright E2E remains on its
separate runner.
The normal `test:browser:next-route-poc` and `test:browser:next-route-poc:built`
commands use the route selector. Raw unfiltered route execution is reserved
for the explicit `test:browser:next-route-poc:all` and
`test:browser:next-route-poc:built:all` commands.

The repository validation boundary is the Husky hook tree rather than a UI
component: the POSIX `.husky/pre-commit` and `.husky/pre-push` launchers exec
the Bash implementations in `.husky/pre-commit.bash` and
`.husky/pre-push.bash`, because Husky's generated `sh -e` launcher cannot
interpret Bash-only syntax. The Bash implementations run `lint:fast`, staged
typecheck, commit-scoped `lint-staged`, detached-HEAD validation,
clean-worktree validation, actual-push-ref impact classification, related-test
selection, all component Browser Mode cases, `build`, all built production
route cases, and the remaining full-profile gates. Production validation is a
separate gate and is not implied by the local pre-push hook.

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
owns CPI candidate-path resolution, metadata resolution/validation, and the 2025-only fail-closed selection policy with machine-readable reason codes. `server/lib/data-loader/cpiValidation.ts` owns CPI
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
adapter entry point; `quarterlyGdpTransform.ts` joins validated GDP comparisons only to the independent real support rows; and
`quarterlyPublicProjection.ts` selects and rounds the public fields; nominal
Plan38 rows bypass the GDP join entirely.

### Data Flow

- Pre-commit flow is `staged paths` → `staged_typecheck_required()` → either
  `pnpm exec tsgo --noEmit` or a recorded skip → `pnpm exec lint-staged`.
  Typecheck is required for TypeScript, type-boundary/shared/generated/config
  changes and for deletion/rename or unavailable-decision cases; documentation,
  assets, and other non-type changes may skip it. The lint-staged related test
  task may pass with zero tests only within the commit hook. lint-staged formats
  supported staged files and runs their related tests, while Secretlint scans
  every staged path with `--no-gitignore`; unstaged and untracked files are not
  scan inputs. `.secretlintrc.json` enables
  `@secretlint/secretlint-rule-preset-recommend`, and Secretlint's default
  masked findings are retained.
- Pre-push flow is `clean worktree guard` → `Git pre-push ref protocol` → actual
  ref diff collection and path/category classification → `PREPUSH_PROFILE`
  normalization. Configuration,
  dependency, build, Playwright, E2E, OpenSpec, generated, unknown, initial,
  deletion, rename, shallow, malformed, unresolved, or failed-diff cases are
  conservative full-profile inputs. Ordinary source/server/test changes retain
  safe related candidates and use the changed profile. The classifier unions
  all pushed refs before selecting a profile.
  Browser Mode gates run the complete configured suites and do not pass push
  paths or ref ranges to the JEV selector.
- Browser selection sends its per-case catalog request through the dedicated
  catalog-selection mode in `skills/jev-review/scripts/jev-request.mjs`:
  active Vitest catalog + automatically detected and explicit paths + bounded,
  redacted diff context → existing JEV auth/key resolution and HTTP transport
  → shared response-envelope validation plus selector-specific run/skip and
  catalog-ID validation → allowlisted selected IDs → scoped Browser Mode
  runner. Manual invocation collects tracked `HEAD`-to-worktree/index changes
  and non-ignored untracked source files. Diff context is capped at 20 files,
  512 UTF-8 bytes per diff-file path,
  4 KiB per file, and 16 KiB total. Every transmitted path is repository-relative,
  uses `/` separators, and rejects absolute paths, `.`/`..` segments, control
  characters, backslashes, and credential-looking markers. Unsafe or oversized
  paths are omitted from all path-bearing fields and represented only by
  pathless reason/count metadata, marking the context incomplete.
  Explicit absolute paths inside the repository are normalized to relative
  paths; outside paths, raw `..` segments, backslashes, control characters,
  and overlong explicit paths are omitted without exposing their values.
  Credential-looking paths are omitted from `changedPaths` and per-file
  omission entries, with only a generic reason/count exposed. Non-UTF-8 diff
  bodies are omitted in full and mark the context incomplete; non-sensitive
  paths may remain in `changedPaths` and `omittedFiles`. Binary and symlink
  untracked files are also omitted. Paths outside the diff-source extension
  allowlist remain selection inputs and receive `unsupported_file_type`
  omission metadata. `changedPaths` is bounded to 256 entries, 512 UTF-8 bytes
  per path, and 16 KiB aggregate path bytes; omitted paths are counted in the
  summary and add `changed_path_limit`. `omittedFiles` is bounded to 64 entries,
  512 UTF-8 bytes per path, and 8 KiB aggregate path bytes; overflow becomes a
  pathless reason/count aggregate. Secret-like lines are redacted. Redaction and other
  omissions mark the context incomplete; completeness and omission metadata
  accompany the excerpts. `state.diffContext.summary` is always sent alongside
  the excerpts and has no changed text lines. It includes aggregate statistics and
  reasons, plus per-file entries only for omitted, truncated, redacted, or
  capped files. Each safe path is limited to 512 UTF-8 bytes and includes
  status, added/deleted line counts (or null when unknown), and non-empty
  reasons; sensitive paths have no entry or path and affect only pathless
  aggregates. The summary has at most 40 entries and 4 KiB serialized UTF-8;
  entries that do not fit are omitted and reflected by omitted/truncated counts
  and `truncated`. Its fields also include `changedPathCount` and
  `omittedChangedPathCount`. Final counters are calculated before serialized
  UTF-8 size is measured; if it exceeds 4 KiB, file entries are removed and
  truncation counters updated with `summary_size_limit`, then a smaller
  metadata-only fallback is used if required. Its bounded fields include
  file/omitted/sensitive-omitted
  counts, added/deleted totals, unknown-line-count file count, reasons, and
  truncated-file count. The `limits` object reports `maxDiffFilePathBytes=512`,
  `maxSummaryFiles=40`, `maxSummaryBytes=4096`, `maxChangedPaths=256`,
  `maxChangedPathBytes=512`, `maxChangedPathTotalBytes=16384`,
  `maxOmittedFiles=64`, `maxOmittedPathBytes=512`, and
  `maxOmittedPathTotalBytes=8192`. Binary, unsupported, non-UTF-8, symlink,
  and redacted
  inputs expose only safely available statistics and reasons. The prompt tells
  JEV to treat the summary as incomplete structural evidence.
  The diff is untrusted data and the selector instructs JEV not to treat it as
  instructions. The same context is sent with each catalog chunk of at most 24
  candidates. It does not route the per-case request through normal `--request`,
  whose review contract accepts one review question or the fixed
  three-question diagnostic.
- Before any Browser Mode execution, the selector discovers current cases from
  the active Vitest Browser Mode configurations and forms catalog IDs from
  config + file path + complete `fullName`; same-`fullName` cases in one
  config/file form one indivisible group. JEV selects IDs from this finite
  catalog for the push paths, and only validated IDs reach the runner. Model
  text is never interpreted as a shell command, path, config, or test filter.
- Selected component cases run under their configured Browser Mode profile.
  Selected route-scoped cases run through the route runner, which
  retains its provider checks and managed production-server lifecycle. Existing
  Chromium/WebKit title filters remain in force and selection cannot widen
  them. Playwright E2E is a separate profile and is outside this catalog.
- In the changed profile, safe related candidates are passed to
  `vitest related --run --passWithNoTests --reporter=json`; a non-empty valid
  JSON result allows the changed integration gate to pass, followed by
  `test:browser:prepush:component`, `build`, and
  `test:browser:next-route-poc:prepush:built`. Documentation/assets-only
  changes skip related tests but still run the component pre-push selection,
  `build`, and the built production-route pre-push selection. Empty candidates,
  zero JSON `testResults`, missing/invalid/incompatible JSON, or a related-test
  failure invoke full non-browser validation exactly once while retaining the
  fixed Browser Mode selections.
- The full pre-push profile is ordered `lint:fast` → `type-check` → `test:coverage`
  → `test:browser:component:all` → `build` →
  `test:browser:next-route-poc:built:all` → `test:build-parity` →
  `security-check`; each gate stops later gates on failure. The changed profile
  runs selected related tests and fixed Browser Mode pre-push selections when
  applicable, then `build` and the fixed built production-route selection.
  Related-test fallback runs the full non-browser validation profile with the
  same fixed Browser Mode selections. The fixed selection comprises one
  BottomSheet focus case and six production-route cases; all-suite commands
  remain available for explicit full Browser Mode runs.
  Playwright E2E remains a separate command and is not part of the local
  pre-push profile. Production validation remains a separate gate and is
  reported as not run by local pre-push when its URL/network availability is
  not established.
- The pre-commit Secretlint gate rejects detected secrets in staged content,
  including paths force-added despite `.gitignore`; normal Git-ignored files
  outside the index are not scanned. Findings use Secretlint's masked output.
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

- `src/app/page.tsx` imports its CPI/CTI/GDP status and load functions from the sole public `server/lib/dataLoader.ts` facade, then calls `loadQuarterlyPublicData()` in `server/lib/view-models/quarterlyProjection.ts`. `quarterlyProjection.ts` loads CPI/CTI, computes the fixed 52-row nominal CTI artifact projection through `quarterlyAggregation.ts`, and separately loads GDP for the real compatibility path before calling `buildQuarterlyPublicViews()`; only the real rows use `mergeQuarterlyGdpRows()`/`quarterlyGdpTransform.ts`, followed by the explicit-mode `projectQuarterlyPublicView()` boundary.
- Support-series flow is `server/lib/data-loader/gdpSupport.ts` → `src/lib/math/supportSeries.ts` (shared pure normalization/scaling) for the independent real/legacy compatibility contract. `src/lib/clientCalculations.ts` does not import or invoke that support math for the CTI public route. `server/lib/math/supportSeries.ts` is a compatibility adapter/re-export for existing server-side imports and is not on the `gdpSupport.ts` path; client code does not import `server/`.
- Quarterly flow carries `QuarterlyRow` from `src/types/chart.ts` through the server aggregation/transform boundary into the client-safe `src/lib/quarterlyPublicProjection.ts`; that projection has no import from `server/`. `quarterlyAggregation.ts` preserves the existing compatibility adapter and re-export, while public projection keys, rounding, and JSON shape remain unchanged.
- The joined real rows and unjoined nominal rows are passed unchanged to `CpiChart`; chart, tooltip, table, and CSV derive their displayed values and measurement metadata from those same rows. `projectQuarterlyPublicView()` receives an explicit `nominal` or `real` mode and filters both scalar keys and `measurements` to that mode's public key set. GDP raw fields and their measurement metadata never cross the nominal CTI public boundary.
- The Phase 2-5 loader path ends at the server facade and its dashboard/quarterly consumers. The independent browser → `/api/estat/{stats-list,meta,data}` path is outside this refactoring; its route files remain unchanged by static inspection, and no API-route JSON test is claimed for Phase 2-5.
- `CpiChart` constructs the nominal/real public quarterly rows once, including the fixed 52-row nominal CTI artifact contract and optional advanced extension key, and passes those rows to both `SpendingBarChart`/`ChartDataContract` and `DataTablesSection`/`ChartExportButton`; the nominal CTI descriptor is passed through the same chart/table/CSV contract, while the real path receives no nominal CTI descriptor. Row measurements override the descriptor, and missing rows expose `invalid/unavailable` metadata without inheriting a first-row fallback. The nominal chart renders only the CTI artifact bar before 2018Q1 and CTI `Bar` stacks from 2018Q1.
- Each chart/table/CSV target consumes the same normalized display model. `ChartDataContract` exposes the data actually passed to the chart through stable data attributes; `DataTablesSection` renders unit/source/frequency/aggregation/status/reason from the target row's measurements; `ChartExportButton`/`buildCsv` emits the same metadata columns from that same row. A descriptor or first-row measurement is column/schema information only and MUST NOT be used as another row's metadata; when a target row has no measurement, chart/tooltip surfaces expose unavailable/null metadata and table/CSV surfaces leave row fields blank or mark them unavailable. Recharts internal SVG paths, classes, geometry, and coordinates are not a semantic contract.
- CSV export is serialized as RFC4180 records terminated by CRLF, including the final record, with existing comma/quote/CR/LF escaping and quote round-trip preserved.
- Phase 4-4 parity evidence is intentionally split: unit tests own CSV serializer edge cases, integration tests use the independent hand-written `tests/fixtures/chart-parity-independent.json` at the real component boundary, and Playwright E2E compares all rows and columns for all seven targets against production data/source, including `hidden`, `adv=1`, nominal/real, and the GDP boundary labels `2017Q4` / `2018Q1`. The fixture is not generated from app constants or the DOM.
- Tooltip aggregation follows the display contract: before 2018Q1 nominal receives only the CTI artifact field; from 2018Q1 it receives only visible CTI expense fields. GDP comparison values are never included in the nominal CTI total.
- Tooltip display flow is metadata-first: chart-side registry projections resolve the label, color, order, and advanced state before `CustomTooltip` renders rows; Recharts `payload.name` is only a legacy fallback for unregistered/direct callers. CPI rows are completed from the applicable visible category list, preserving zero and null/missing values independently of payload presence.
- Plan49 NewGraph comparison flow is `COMPARISON_SERIES_REGISTRY` → visible-key projection → graph/legend/tooltip/table/CSV; the CTI-derived entry is `消費(総合)` using `CONSUMPTION_TOTAL_12MA_KEY`. The registry owns its label, color, order, and metadata. The Plan38 public key `CTIミクロ四半期系列（名目）` is excluded from this registry and remains only in the quarterly nominal spending path.
- Chart-info flow for NewGraph describes Plan49 `消費(総合)`, its historical estimated and official monthly inputs, strict 12MA and 2025 monthly-average basis, and the provenance carried by its measurements. The separate Plan37 loader status remains available for its own internal compatibility path.
- The concrete client flow is `CpiChartSections → useChartTooltipProps → CustomTooltip`: category/registry metadata and period-specific `allowedKeys` are projected in `CpiChartSections`, forwarded by the existing controller, and used by `CustomTooltip` to complete missing payload rows. Hidden and GDP/CTI boundary-inapplicable keys are removed before detail rendering and totals.
- Legend/rendering and tooltip collections use the same hidden-key registry projection even when data is unavailable: legends and comparison tooltips retain defined all-null CPI, salary, and `消費(総合)` series, while registered missing values render as `—`. `adv` does not expose CTI normal/extension monthly entries.
- Missing, ended, unready, or failed-validation GDP comparison values remain `null` only in the real/legacy compatibility projection and are hidden at the chart boundary; the Plan38 nominal public projection emits no GDP key, name, value, measurement, or placeholder. GDP is never zero-filled, copied, interpolated, or rescaled at the boundary.
- The fixture comparison gate independently observes loader data, status, and load/status errors, compares each observation to the fixed golden digest, and verifies every declared GDP source artifact path and SHA-256 before treating the normal path as valid. The annual public loader has no runtime cache wrapper; cache behavior is therefore N/A and is not a required comparison dimension.
- The gate's invalid-input paths remain fail-closed: missing or malformed CPI/CTI 2025 inputs fail closed with the mapped machine-readable reason code and never select a 2020 pair, while invalid annual GDP omits every annual GDP raw/comparison key. Invalid quarterly artifacts return no quarterly rows with `comparisonReady: false`; validated raw quarterly rows are retained when independent confirmation is pending or failed, but comparison values are not generated or published, with no annual-data fallback. The readiness predicate is metadata-only, and never makes unready raw rows comparison-ready. CTI rows may remain present when GDP is unavailable.
- Quarterly GDP is accepted only as the complete continuous `2005-Q1` through `2025-Q4` sequence (84 rows), with both independent nominal and real series and valid comparison confirmation; duplicate, missing, non-continuous, non-numeric, or absent source artifacts fail closed.
- The annual GDP path used by NewGraph is separate from the quarterly public path: validated nominal raw annual observations are expanded onto calendar months, normalized by the independently validated 2025 annual factor, and then passed through a consecutive 12-month window. Raw amounts remain available for table/CSV contracts that request them, while the comparison line receives only normalized values.
- Consumption presentation state is client-side: hidden quarters, selected categories, and detail expansion control each chart without changing source-basis values, table values, or CSV values.
- On mobile (≤768px), `SpendingBarChart` uses consumption-only layout options for margins, CPI-style axis ticks, typography, bar width/spacing, all-value tooltip/details, and safe-area-aware internal scrolling; both nominal and real legends are closed-by-default collapsible controls whose single-line summaries report selected expense-item/quarter counts and filtering state, without a separate 四半期 heading. The real chart may additionally show the linked nominal-section note when `linkedSectionId` is provided; the nominal chart omits it. Selected-quarter emphasis is not added. Shared tooltip/axis behavior is not changed for other charts.

Data Sources are unchanged by the mobile-readability plan. Plan49's reconstructed/official monthly CTI total feeds NewGraph as `消費(総合)`;
Plan37 normal/extension fields remain internal loader compatibility. Plan38's
fixed CTI artifact before 2018Q1 and CTI-stacked-from-2018Q1 contract remains
authoritative for the separate quarterly nominal spending key. GDP wording here
refers only to the independent real/legacy compatibility contract.

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
  → server/lib/dataIo.ts (CPI file paths)
      → server/lib/data-loader/cpiSource.ts (candidate paths, metadata resolution/validation, pair selection)
        → server/lib/data-loader/cpiValidation.ts (CPI CSV/contribution parsing, header/content validation)
      → select the complete 2025 pair only; otherwise fail closed with a machine-readable reason code and invalid `getCpiDataStatus()`
        → server/lib/data-loader/cpiLoader.ts (pure 2004年以降 filter, weight denominators, missing propagation, derived series, unnecessary-series removal)
          → server/lib/dataLoader.ts (sole public status/load facade)
            → server/lib/data-loader/cpi.ts (internal status/load adapter)
          → apply selected-pair fixed weights: all-items denominator 10000; mutually exclusive 10-major-category comparison denominator 10002
          → derive `外食以外食料 = weighted 食料 − weighted 外食`; propagate source missing values to all dependent values
official all-household CTI micro CSV → official-code snapshot + series map + candidate metadata
data/source/cti_data2025.csv / data/source/cti_data2025_distribution_adjusted.csv (candidates)
  → `server/lib/dataLoader.ts` facade → `server/lib/data-loader/cpi.ts` internal CTI loader path
    → match every map row to the official snapshot row-by-row; select the verified 2025 candidate, otherwise return unavailable with the mapped reason code; preserve source-basis values and missing values
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
      → quarterlyProjection.ts: `loadQuarterlyPublicData()` computes CTI quarterly aggregates and loads GDP only for the independent real support path
        → quarterlyAggregation.ts: fixed Plan38 nominal rows plus unchanged 2018Q1+ CTI aggregation
          → quarterlyGdpTransform.ts: `joinQuarterlyGdpRows()` by exact `YYYY-Qn` key for real support only
            → src/lib/quarterlyPublicProjection.ts: `projectQuarterlyPublicView()`
              → page.tsx → CpiChart
      → fixture comparison gate: compare the fixed quarterly golden digest and source-artifact SHA-256 values
      → getQuarterlyGdpSupportStatus(): separate status; comparisonReady is false while independent confirmation is pending
        → page.tsx: pass granularity, comparisonReady, and independentConfirmation to chart info
          → pending-independent-confirmation: fail closed; do not render the quarterly comparison line
          → ready: quarterly GDP validation remains available internally for the real compatibility path; Plan38 nominal public rows never contain GDP raw/comparison keys, while pending/failed remains fail-closed for that independent path
- Plan39 annual nominal total anchors + Plan47/official CTI monthly inputs
  → `server/lib/consumptionTotal12Ma.ts` → `loadTotalEarningDataInternal` row measurement
  → NewGraph Plan49 comparison registry → graph/legend/tooltip/table/CSV
  (independent from Plan38's quarterly public CTI artifact and `CTIミクロ四半期系列（名目）` key)
Loader fixture comparison gate
  → tests/fixtures/loader-comparison/golden.json (fixed CPI/CTI/annual-GDP/quarterly-GDP observation digests and GDP artifact SHA-256 values)
    → tests/unit/server/lib/data-fixture-comparison.test.ts (independent value/status/error comparison, 2025-only fail-closed checks, GDP-key omission, annual and quarterly fail-closed checks)
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
- **AND** CTI公式map/snapshotの独立確認が`ready`の場合だけ2025候補を採用し、不成立時はreason付きのunavailableを返し、2020入力には到達しない
- **AND** GDP年次とGDP四半期は相互に独立してvalidationされ、各price conceptのraw/比較値を分離する
- **AND** 四半期は独立確認が`ready`でない場合に比較値をfail-closedとし、年次GDPへfallbackしない
- **AND** 関連60 tests / 全403 tests、typecheck、lint 0 errors / 5 warnings、最終静的監査が合格として記録され、Phase 2-4（四半期変換・連続性検証）の完了記録へ接続される

#### Scenario Phase 2-4 Quarterly Transformation and Connection Acceptance

- **WHEN** quarterly GDP rows and their support artifacts are transformed for the public view
- **THEN** `quarterlyGdpTransform.ts` performs the pure period validation and raw-to-comparison row transformation, while `quarterlyAggregation.ts` preserves the existing `mergeQuarterlyGdpRows` adapter contract
- **AND** GDP inputs retain their independent continuous period contract and are joined only by exact `YYYY-Qn` keys on the real compatibility path; nominal Plan38 CTI rows bypass GDP entirely
- **AND** `gdpSupport.ts` calculates quarterly comparison factors from the 2025Q1–Q4 CSV observations and verifies the required metadata, CSV, official-snapshot, e-Stat snapshot, and SHA-256 consistency before connection; no quarterly normalization JSON is an input, and `isQuarterlyComparisonReady` remains a metadata-only predicate
- **WHEN** a quarterly artifact is invalid or the independent comparison confirmation is unready
- **THEN** invalid artifacts fail closed, while validated raw rows are retained; comparison values are not generated or published and no annual-GDP fallback is used
- **AND** related 37 tests / all 416 tests, type-check, lint 0 errors / 5 warnings, and the final static audit are recorded as passed

#### Scenario Plan38 Earnings Boundary

- **WHEN** earnings input, projection, table, metadata, or CSV is produced
- **THEN** the earnings registry, table, tooltip, graph, and CSV expose wage/CPI series only; CTI raw, Plan37 comparison, Plan38 quarterly, and related GDP/consumption columns are absent from those public salary surfaces
- **AND** internal merged data may retain legacy CTI raw/Plan37 basic fields for compatibility; NewGraph comparison uses the Plan49 `消費(総合)` scalar and measurement

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

Phase 3-2 calculation flow is `CpiData` → `src/lib/math/clientCalculations.ts` for pure category sums and CAGR → `src/lib/clientCalculations.ts` for the existing public API → chart/table consumers. Quarterly CTI rows are server-owned public projections; client code only forwards and filters those rows for display. No client API performs CTI quarterly aggregation, zero-fill, first-value selection, or incomplete-row deletion. Explicit real/legacy support calculations remain separate from the CTI public route. `server/lib/view-models/quarterlyAggregation.ts` retains the existing 2018Q1+ expense-item aggregation and creates the fixed Plan38 rows independently.

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

#### Scenario Production-route command context lifecycle

- **WHEN** a production-route Browser Mode command has validated its provider
  and acquired a `Browser`
- **THEN** each invocation creates a fresh independent context through
  `withIsolatedContext(browser, options, callback)` and does not reuse a context
- **AND** the context is closed exactly once after callback success or failure
- **AND** if `newContext` fails, no close is attempted
- **AND** if the callback and close both fail, the callback's original thrown
  value remains primary and the close error is retained as supplemental
  information
- **AND** if only close fails, the close error propagates
- **AND** the production-route command retains provider checks, route work,
  assertions, and result handling

#### Scenario Production-route context options

- **WHEN** a command builds context options from a device descriptor and
  scenario-specific settings
- **THEN** it applies the complete device descriptor before scenario overrides
- **AND** each call receives a fresh top-level options object and fresh mutable
  `viewport` and `screen` objects when present

#### Scenario Default Vitest suite isolation

- **WHEN** `pnpm test` runs the default Vitest profile
- **THEN** it runs the existing happy-dom suite without collecting Browser Mode specs

#### Scenario Browser Mode test scope

- **WHEN** `pnpm test:browser` runs the browser profile
- **THEN** it uses `vitest.browser.config.ts` to discover component cases,
  asks JEV to select from that component-only catalog, and executes only the
  selected cases in headless Chromium
- **AND** this command does not require a production build or start the
  production-route runner
- **AND** component cases verify real client components in a browser; they do
  not verify Next.js production routing, SSR, Flight, or hydration
- **AND** route-scoped cases are selected only by the separate route-scoped
  commands and use the managed route runner

#### Scenario Browser Mode per-file cleanup and sequential isolation

- **WHEN** tests run sequentially in one Browser Mode spec file
- **THEN** they share that file's page/context, and the shared setup cleans up
  React mounts and resets the document body, `data-theme`, `localStorage`,
  JavaScript-visible cookies, mock call history, and spies before and after
  each test
- **AND** teardown restores spies before browser-state resets; clearing mock
  history does not reset mock implementations
- **AND** the harness isolation spec proves that a later test does not retain
  those states from an earlier test
- **AND** each test explicitly resets state rather than assuming a new
  page/context for every test

#### Scenario Browser Mode shared render and interaction helpers

- **WHEN** a current Browser Mode spec renders a client component or performs
  an interaction
- **THEN** it may use the shared render helper for current render behavior,
  the supported `userEvent` API and `page` APIs from `vitest/browser`, and
  Playwright locators where an existing spec specifically requires them
- **AND** asynchronous UI assertions use `expect.element(...)`
- **AND** the shared helper does not add a provider-wrapper abstraction until
  multiple current components need one
- **AND** native ESM namespace exports are not passed to `vi.spyOn`; use
  dependency injection or `vi.mock(..., { spy: true })` when module spying is
  needed
- **AND** blocking `alert`, `confirm`, or `print` behavior remains in
  Playwright E2E or is explicitly mocked

#### Scenario Batch2 Vitest component fixture scope

- **WHEN** the Batch2 Browser Mode cases verify chart and section UI behavior
- **THEN** they render the real `CpiChart`, `SectionTabs`, `ChartFilters`, or
  `SpendingBarChart` client component through the shared render helper into the
  Vitest Browser Mode test iframe, using deterministic fixture data
- **AND** they use the Vitest Browser `page` query APIs, `userEvent`, and
  `expect.element(...)` for UI queries, interactions, and asynchronous state
  assertions; iframe geometry, computed styles, and document overflow may be
  read through native DOM APIs
- **AND** a `next/navigation` `useSearchParams` mock may supply a fixed initial
  query snapshot, while changes made by the component are checked through the
  iframe's URL state
- **AND** they do not require a production route, SSR, Flight, production
  server data projection, hydration, real device touch emulation, or browser
  zoom, and passing these cases does not establish those behaviors

#### Scenario Batch2 range, URL, and range-sheet behavior

- **WHEN** the Batch2 fixture selects a single year and then a two-year range
- **THEN** the charts render the expected four and eight quarterly periods
  respectively, with corresponding nominal and real bars, and the selected
  range is reflected in the iframe URL state

#### Scenario Batch2 range-sheet selection

- **WHEN** the fixture chooses start/end years in the range sheet or selects
  the maximum range
- **THEN** the sheet closes after selection and the chart and URL state reflect
  the selected or fixture-bounded maximum range

#### Scenario Batch2 section navigation and tab overflow

- **WHEN** the Batch2 fixture selects a section tab
- **THEN** its target section is brought into view
- **AND** when tabs exceed their container width, horizontal scrolling advances
  the tab row, its native scrollbar is visually hidden, and the right-edge
  fade mask is present

#### Scenario Batch2 quarter and category filters

- **WHEN** the Batch2 fixture hides Q1, hides all quarters, or restores a
  quarter
- **THEN** the corresponding bars decrease, disappear when all quarters are
  hidden, and return when a quarter is restored, with the controls' accessible
  pressed state matching visibility

#### Scenario Batch2 category filter

- **WHEN** the fixture hides a spending category
- **THEN** that category's bars are removed, the chart remains visible, and the
  control's accessible pressed state reflects the change

#### Scenario Batch2 tooltip contents and dismissal

- **WHEN** the Batch2 fixture hovers a chart bar
- **THEN** the tooltip shows the expected category values and fixture-derived
  total

#### Scenario Batch2 hidden tooltip category

- **WHEN** the fixture hides a category and reopens its chart tooltip
- **THEN** the tooltip remains usable and the hidden category row is absent

#### Scenario Batch2 tooltip dismissal

- **WHEN** the fixture dismisses an open tooltip with Escape, pointer exit, or
  an outside click
- **THEN** the tooltip closes and can be opened again by hovering a bar

#### Scenario Batch2 mobile controls and readability

- **WHEN** the Batch2 fixture renders nominal and real charts at mobile widths
- **THEN** legend controls meet the 32 CSS-pixel minimum, summaries are visible
  and non-empty without wrapping, and hiding/restoring series updates both
  accessible pressed state and rendered bars
- **AND** dark-mode tooltips show category labels and values with a working
  close control, remain within the iframe viewport, and use the specified
  readable text sizes and value alignment
- **AND** at 320px, 375px, and 390px widths the expected bars and axis labels
  remain readable and the iframe document has no horizontal overflow

#### Scenario Browser Mode chart mock boundary

- **WHEN** a future Browser Mode spec requires a Recharts mock
- **THEN** the mock's guarantee is limited to props and rendered DOM and does
  not claim to validate actual chart layout or rendering
- **AND** no Recharts mock is part of the current Browser Mode harness

#### Scenario ChartInfoButton Escape dismissal in Browser Mode

- **WHEN** the Browser Mode test mounts the real `ChartInfoButton` with static
  children, opens its accessible trigger, and sends Escape in Chromium
- **THEN** the dialog becomes visible with `aria-expanded="true"`, then becomes
  hidden with `aria-expanded="false"` after Escape
- **AND** this verifies the component's Escape dismissal only; it does not
  verify the production route, focus integration, or page errors
- **AND** after this Browser Mode replacement passed, Playwright P42-021 is
  removed; the separate P42-018 outside-click / scroll integration case
  remains in Playwright

#### Scenario PRE-PUSH Browser Mode full execution

- **WHEN** `pnpm run test:full` reaches its Browser Mode gates
- **THEN** its component and production-route selector invocations each ask
  JEV to select from that gate's current eligible Vitest Browser Mode catalog
  and run only the selected catalog IDs
- **WHEN** the full pre-push profile reaches its Browser Mode gates
- **THEN** it runs `pnpm run test:browser:component:all` after `test:coverage`, then
  `pnpm run test:browser:next-route-poc:built:all` after `build`
- **WHEN** the changed pre-push profile selects a non-empty related code/test
  set
- **THEN** it runs those related tests, the fixed pre-push component Browser
  Mode selection, `pnpm run build`, and the fixed built production-route
  Browser Mode selection in that order
- **AND** the component selection runs only
  `BottomSheet focus containment in Chromium keeps real browser Tab navigation inside the open sheet`
- **AND** the production-route selection runs only
  `Playwright Browser Mode custom command observes a production Next chart interaction`,
  `p45-b-section-tabs-scroll-82-case01-chromium`,
  `p45-b-range-change-119-e2e — production spending-chart-nominal data narrows and a visible bar remains after changing the range`,
  `p45-a-parity-hidden-series preserves chart, table, and CSV data when a legend series is hidden`,
  `B13 #473: outside-heading touch clears stacked chart cursor and active dots`,
  and `B14: keyboard Tab reaches the named legend with a visible focus outline`
- **WHEN** a related-test selection falls back to full validation
- **THEN** it runs the full non-browser validation gates with the fixed
  pre-push Browser Mode selection
- **WHEN** `PREPUSH_PROFILE=full` is selected explicitly or the push-impact
  classifier selects full
- **THEN** the full pre-push profile continues to run
  `pnpm run test:browser:component:all` after `test:coverage`, then
  `pnpm run test:browser:next-route-poc:built:all` after `build`
- **WHEN** a changed-profile push contains only documentation and/or asset
  paths
- **THEN** it skips related code-test selection and `pnpm run test:all`, while
  it still runs the fixed pre-push component Browser Mode selection,
  `pnpm run build`, and the fixed built production-route Browser Mode
  selection in that order

#### Scenario Browser Mode catalog and stable case identity

- **WHEN** a scoped Browser Mode selector starts
- **THEN** it discovers the cases eligible for that existing component or
  route-scoped invocation from the active Vitest Browser Mode
  configurations and builds selectable IDs from config, repository-relative
  spec file, and complete `fullName`
- **AND** component scope uses only `vitest.browser.config.ts`
- **AND** route scope includes `vitest.browser.aggregate-chromium.config.ts`
  and every case in `vitest.browser.webkit.config.ts`, including
  `SectionTabsB3m` and all other files matched by that config's WebKit title
  filter
- **AND** cases sharing a `fullName` in the same config and file are selected
  and executed as one group
- **AND** the discovery and execution preserve each config's existing browser
  provider, include/exclude rules, and Chromium/WebKit title constraints

#### Scenario JEV Browser Mode case selection

- **WHEN** the selector submits the current case catalog and complete
  push-impact paths and diff context to JEV
- **THEN** it uses the dedicated catalog-selection mode in
  `skills/jev-review/scripts/jev-request.mjs`, reusing the client's existing
  API-key resolution, authenticated transport, and shared response validation
- **AND** the mode validates the per-case selection response against its
  submitted catalog IDs, without sending that payload through normal
  `--request`, whose review request contract accepts one review question or
  the fixed three-question diagnostic
- **AND** it accepts only a valid structured answer that accounts for every
  catalog ID and selects only allowed IDs; an explicit `skip` for every ID is
  a valid empty selection
- **AND** it executes only the selected catalog IDs; arbitrary response text is
  never interpreted as a command, path, Vitest config, or test-name pattern
- **AND** every catalog chunk receives the same bounded diff context and
  omission metadata, and the prompt identifies all diff excerpts as untrusted
  code data that must not be followed as instructions
- **WHEN** discovery fails, the JEV request fails, the response is malformed,
  or an ID is missing/duplicated/unknown
- **THEN** the selector exits nonzero before starting a browser test and does
  not fall back to running the full Browser Mode catalog
- **WHEN** JEV explicitly skips every catalog ID
- **THEN** the selector succeeds without starting a browser for that invocation
- **WHEN** the selector runs manually
  **THEN** it detects tracked changes from `HEAD` through the index/worktree,
  adds non-ignored untracked paths regardless of extension, and unions those
  paths with supplied positional paths; unsupported file types remain path
  inputs but receive `unsupported_file_type` omission metadata rather than
  diff excerpts
- **WHEN** changed paths exceed the configured path count, per-path byte, or
  aggregate byte limit
  **THEN** `changedPaths` contains at most 256 entries, each at most 512 UTF-8
  bytes, and at most 16 KiB of aggregate path bytes; it records the excluded
  path count as `omittedChangedPathCount` and adds `changed_path_limit` to the
  summary reasons
- **WHEN** a detected or explicit path is not repository-relative and safe, or
  exceeds the 512 UTF-8 byte per-path limit
  **THEN** it is excluded from `changedPaths`, `diffContext.files[].path`,
  `summary.files[].path`, and `omittedFiles[].path`; the selector reports only
  a pathless reason/count omission and marks the context incomplete
- **WHEN** an explicit absolute path resolves inside the repository
  **THEN** it is normalized to a repository-relative path before selection; an
  outside path or raw `..` segment, backslash, control character, or overlong
  path is omitted without exposing its value and contributes only a pathless
  reason/count
- **WHEN** omitted file metadata exceeds its configured entry, per-path, or
  aggregate path-byte limit
  **THEN** `omittedFiles` contains at most 64 entries, each path is at most
  512 UTF-8 bytes, and aggregate path bytes are at most 8 KiB; excess omissions
  are represented by a pathless reason/count aggregate
- **WHEN** an explicit path has no detected diff in the collected range or
  worktree/index state
  **THEN** its summary entry uses `status: unknown`, null added/deleted line
  counts, and reason `explicit_path_no_detected_diff`
- **WHEN** a changed file is considered for diff context
  **THEN** the context includes at most 20 files, 4 KiB per file, and 16 KiB
  total, limits each `diffContext.files[].path` to 512 UTF-8 bytes, omits binary
  content, and redacts lines containing secret-like markers
- **WHEN** a changed path looks like a credential or private-key path
  **THEN** it is excluded from `changedPaths` and per-file omission entries,
  its actual path is not sent to JEV, and a pathless aggregated omission
  reports the reason and number of excluded paths while marking the context
  incomplete
- **WHEN** a tracked or untracked diff is not valid UTF-8
  **THEN** its diff body is omitted in full, its non-sensitive path may remain
  in `changedPaths` and `omittedFiles`, and the context is marked incomplete
- **WHEN** a non-ignored untracked path is a symlink or binary file
  **THEN** its content is omitted and the context is marked incomplete
- **WHEN** a context entry is truncated, redacted, unsupported, or omitted
  **THEN** completeness and omission metadata report the limitation to JEV
- **WHEN** the selector creates the change context for a JEV catalog request
  **THEN** it always includes `state.diffContext.summary` with fields
  `files`, `fileCount`, `omittedFileCount`, `sensitiveOmittedFileCount`,
  `addedLines`, `deletedLines`, `unknownLineCountFileCount`, `reasons`,
  `truncated`, `truncatedFileCount`, `changedPathCount`, and
  `omittedChangedPathCount`, plus aggregate counts,
  line totals where available, omission/trigger reasons, and truncation fields,
  without including changed text lines
- **AND** it includes per-file summary entries only for omitted, truncated,
  redacted, or capped files; entries for safe non-sensitive paths report a
  path of at most 512 UTF-8 bytes, status, added/deleted line counts or null,
  and non-empty reasons
- **AND** sensitive paths have no per-file entry or path and contribute only
  pathless aggregate counts/reasons; binary, unsupported, non-UTF-8, symlink,
  and redacted inputs expose only safely available statistics and reasons
- **AND** final counters are set before the serialized UTF-8 summary is measured
  against 4 KiB; if needed, file entries are removed and truncation counters
  updated, and a smaller metadata-only fallback is used if fixed metadata still
  exceeds the limit
- **AND** the summary has at most 40 entries, reports changed-path and omitted
  file limits in `limits`, and JEV is instructed to treat it as incomplete
  structural context
- **WHEN** a new standard JEV checkpoint review starts
- **THEN** it supplies at least two complete, mutually exclusive, case-specific clarification candidates with `--clarification-candidates PATH` alongside `--request`, and candidate validation completes before any API request
- **AND** JEV is asked only for the listed choice, confidence, and probability distribution
- **WHEN** a new standard review receives a valid initial choice other than `valid_as_defined`
- **THEN** exactly one clarification request asks JEV to select a supplied candidate, and the client maps the selected ID to its locally supplied finding, affected location/requirement, evidence or needed evidence, next action or proposed fix, and remaining uncertainty
- **AND** the clarification is recorded with `resolution=selected`, `diagnosisSource=provided_candidate`, `diagnosisStatus=complete`, and `effectiveVerdict=requires_revalidation`, while preserving the initial decision and distribution
- **WHEN** a clarification response is invalid, unavailable, or selects an ID outside the candidate list
- **THEN** it is unresolved and no clarification is chained
- **WHEN** `--clarify` or `--follow-up` is used as a compatibility utility
- **THEN** its existing mode and validation behavior remain unchanged

#### Scenario Selected route-scoped Browser Mode lifecycle

- **WHEN** JEV selects one or more route-scoped Browser Mode cases
- **THEN** the configured route runner executes only those cases
- **AND** it retains its existing provider validation, build/readiness checks,
  server startup and cleanup, and per-command isolated BrowserContext lifecycle

#### Scenario Route-scoped command selection boundary

- **WHEN** `pnpm run test:browser:next-route-poc` or
  `pnpm run test:browser:next-route-poc:built` runs
- **THEN** it asks JEV to select from the current route-scoped catalog and
  executes only the selected cases through the managed route runner
- **WHEN** `pnpm run test:browser:next-route-poc:all` or
  `pnpm run test:browser:next-route-poc:built:all` runs
- **THEN** it executes the raw unfiltered route-scoped suite explicitly,
  without JEV selection

#### Scenario Playwright E2E remains separate

- **WHEN** the JEV Browser Mode selector creates its catalog
- **THEN** it includes only active Vitest Browser Mode cases and does not include
  Playwright E2E specs or replace the separate E2E gate

#### Scenario PRE-PUSH Browser install prerequisite

- **WHEN** a pre-push profile invokes Browser Mode
- **THEN** Chromium is installed once beforehand with
  `pnpm exec playwright install chromium`; the hook does not download browsers
  automatically
- **AND** Linux operating-system dependencies are installed separately when
  required

#### Scenario PRE-PUSH related-test fallback

- **WHEN** related-test selection in the changed profile is empty, invalid, or
  indeterminate
- **THEN** it falls back to the full profile, running `pnpm run test:coverage`
  followed by the full component and production-route Browser Mode suites
  exactly once, with `build` between them

#### Scenario PRE-PUSH Browser Mode failure stop

- **WHEN** the Browser Mode gate fails in either full or changed pre-push
  profile
- **THEN** the hook exits nonzero and rejects the push without updating the
  remote ref
- **AND** it skips every later gate in that profile

#### Scenario Hook smoke validation

- **WHEN** `pnpm run test:hook-smoke` is invoked
- **THEN** the temporary bare remote/work repository verifies hook stdin/ref handling, normal and multi-ref pushes, remote deletion, failure atomicity, and the explicit full profile
- **AND** the installed hook includes the clean-worktree guard before
  detached-HEAD and push-impact validation
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
- **THEN** it runs `test:coverage`, build, build-parity, security, and E2E validation with `contents: read` permissions, uses coverage in place of `test:all` for full validation, and records timings in `GITHUB_STEP_SUMMARY` plus logs/reports as artifacts
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

#### Source coverage policy

`pnpm run test:coverage` (`VITEST_MAX_WORKERS=2 vitest run --maxWorkers=2
--coverage`) measures every `src/**/*.{ts,tsx}` and `server/**/*.ts`
file, including files not imported by a test, and requires 100% statements,
branches, functions, and lines for every in-scope file and overall. Its text,
JSON summary, full JSON, and HTML reports make uncovered code visible. The
coverage command runs unit tests and is used by `test:full`, the full pre-push
profile, and the manual GitHub `full-validation` job in place of `test:all`,
so full-only profiles do not run unit tests twice. Ordinary push/pull-request
CI continues to run `test:all`; changed/fast pre-push validation runs related
tests and does not run coverage.

The only source exclusions are declaration files (`**/*.d.ts`) and these
documented boundaries:

- `src/types/data.ts` and `src/types/index.ts` contain type-only declarations.
- `src/app/layout.tsx` is a Next framework entry that composes `next/font`,
  metadata, and global CSS; production build and browser-route checks exercise
  the framework integration.
- `src/app/components/CtiAdjustedSeriesSection.tsx` is the unimported legacy
  Plan40 section. Its active calculation, loader, and projection modules remain
  in coverage.
- `server/lib/ctiAdjustedSensitivity.ts` is a Plan39 analysis entry point
  imported by its analysis script and unit tests, but not by the application
  runtime.
- `src/app/components/SectionTabs.tsx` owns scroll and effect behavior covered
  by the SectionTabsTargets, SectionTabsB3m, and B3m Browser Mode assertions.
- `src/app/components/LazyMount.tsx` owns IntersectionObserver mounting
  behavior covered by the dedicated LazyMount and B3m Browser Mode assertions.

Scripts, generated output, and static assets are outside the source include
patterns because they are not application runtime modules. Adding runtime
behavior to an excluded file requires revisiting its exclusion. Low coverage
or testing difficulty alone is not a reason to exclude a file. A branch may be
ignored only when a code invariant makes that branch unreachable through the
public contract and the invariant is documented next to the narrow ignore;
low coverage or an inconvenient test setup is not sufficient justification.

**WHEN** the explicit source coverage task runs, **THEN** the complete source
set is measured against 100% in all four metrics, apart from the explicitly
listed boundaries; missing tests or coverage fail the task. **WHEN**
application runtime code is added, **THEN** it enters the coverage denominator
unless its exclusion is explicitly justified here.

**WHEN** a branch inside an in-scope source file is excluded from the coverage
result, **THEN** the exclusion is limited to a narrow branch made unreachable
by a documented invariant of the public contract, with the invariant recorded
next to the ignore; broad file or line exclusions do not qualify.

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
  **THEN** a valid non-empty Vitest JSON result proceeds to the fixed
  component Browser Mode selection, build, and fixed built-route Browser Mode
  selection, while empty candidates, zero `testResults`, missing/invalid/
  incompatible JSON, or a related-test failure invokes full non-browser
  validation with the same two fixed browser selections exactly once.
- **WHEN** full pre-push execution is tested
  **THEN** the gate order is `lint:fast` → `type-check` → `test:coverage` →
  `test:browser:component:all` → `build` →
  `test:browser:next-route-poc:built:all` → `test:build-parity` →
  `security-check`, and a failed gate prevents later gates; production
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
  **AND** tests cover 2025-only selection and reason-coded fail-closed behavior when the 2025 pair does not validate through that public adapter, asserting that no 2020 file is read
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
- CPI loader tests MUST cover runtime validation of metadata row/series counts, period, generated-file SHA-256, monthly continuity, and 2025 all-items annual average, plus reason-coded fail-closed behavior when 2025 validation fails, asserting no 2020 access.
- CTI tests MUST require the map and snapshot to exist and MUST unconditionally match every official map row against the snapshot by official code, name, and representative values before selecting the 2025 candidate; otherwise the loader fails closed with the mapped machine-readable reason code.
- GDP tests MUST require continuous annual observations for every year 1994–2025, valid metadata/CSV/normalization-JSON hashes, and one finite non-zero 2025 value per price concept before generating raw and comparison values. They MUST verify raw and normalized values remain separate in table, CSV, and tooltip projections, MUST NOT mix price concepts or substitute a 2020/CTI factor, and MUST assert fail-closed omission when validation fails.
- Plan21 tests MUST require both 84-row quarterly artifacts, `YYYY-Qn` continuity from 2005Q1, metadata SHA-256 agreement, separate nominal/real 2025Q1–Q4 factors, and fail-closed comparison readiness for `pending-independent-confirmation`; validated raw rows remain available in that state while comparison values remain absent. The metadata-only `isQuarterlyComparisonReady` predicate MUST inspect only confirmation/comparison metadata and MUST NOT inspect or transform rows. They MUST also retain the annual `getGdpSupportStatus()` regression contract.
- The fixture comparison gate MUST compare the normal CPI, CTI, annual GDP, and quarterly GDP observations to the fixed golden digests in `tests/fixtures/loader-comparison/golden.json` (`d6490cfbb88a94eef4c6bc150a6b5698acbfa30c3e2bf8a5fae68648663f9f5e`, `e44939cc5f6afeab444a69f3e499d30b1333f05d7d1d5c0357cd23c86869e3dd`, `0c13f58a050723be8bafe6cd2fe13f42825f8d48749703d15535aa7613ad748c`, and `147a57a94678246f9f697a9bda1c7f7f6e8ec39f23b6bb8e456fe4955a1b9b3b3`) and MUST independently compare data, status, and errors.
- The gate MUST verify every annual and quarterly source artifact against the fixed SHA-256 values recorded by the golden fixture, assert reason-coded fail-closed behavior when a 2025 candidate is invalid with no 2020 access, assert omission of all six annual GDP keys when any annual artifact or continuity check fails, and assert quarterly fail-closed behavior for missing, duplicate, non-continuous, or non-finite inputs without annual fallback.
- The gate MUST assert the exact quarterly sequence `2005-Q1` through `2025-Q4` (84 rows), quarter-specific nominal/real values, separate 2025Q1–Q4 factors, and `not-applicable: no runtime cache wrapper`; it MUST NOT introduce a runtime cache wrapper as part of fixture comparison.
- Plan21 tests MUST verify that `page.tsx` obtains `getQuarterlyGdpSupportStatus()` and propagates `granularity`, `comparisonReady`, and `independentConfirmation` to chart info, while public quarterly chart/table/CSV projections contain only the existing nominal/real private-consumption keys and none of the four GDP raw/comparison keys. Internal loader validation and the annual rollback path MUST remain available. `tests/e2e/quarterly-gdp.e2e.spec.ts` provides the public projection smoke; E2E/build execution is environment-dependent and must be recorded when not run.
- Tests MUST NOT use any 2020 runtime input as a prerequisite; 2020 references are limited to historical provenance documentation, and 2020 MUST NOT be used as a general GDP normalization or continuity assumption.
- Component tests for chart rendering and interaction (`tests/components/`)
- Chart component tests MUST verify that MajorIndicesChart, StackedAreaChart, SpendingBarChart, EarningsBreakdownChart, ResidualAreaChart, and NewGraph use displayed-value maximum + 3 for the Y-axis upper bound; stacked tests MUST use per-time visible-series totals, hidden-series tests MUST exclude hidden values, and ResidualAreaChart tests MUST retain its lower-bound behavior.
- Integration tests for data mapping and computation accuracy (`tests/data-mapping/`, `tests/computation-contract/`)
- Constant/fixture tests for expected data quality (`tests/constants/`, `tests/fixtures/`)
- Performance checkpoint tests (`tests/perf-checkpoint.test.ts`)
- **Husky pre-push hook verification** (`tests/unit/husky-pre-push.test.ts`):
  - T1–T3: `check-detached-leftover.sh` detects and blocks detached HEAD commits not reachable from origin/main
  - T4–T5: Pre-push wrapper (using subprocess call, not source) correctly propagates exit codes and allows full validation sequence to run when safe
  - T6–T8: `check-clean-worktree.sh` blocks tracked differences and untracked `src/`/`server/`/`tests/` files, while allowing a clean tree with unrelated local artifacts
  - launcher contract: both hook wrappers remain POSIX-compatible and point to their `.bash` implementations
- E2E against a real build/server (`tests/e2e/`, Playwright) across three projects:
  `chromium` (Desktop Chrome), `chromium-dark` (dark mode), `mobile-pixel` (Pixel 7 / Chromium)
  - `range-change.e2e.spec.ts` — year-range filtering changes the rendered bars
  - `spending-filter.e2e.spec.ts` — quarter and category filters change the rendered bars; the quarter case covers hiding and restoring all Q1–Q4 buttons and their `aria-pressed` state
  - `real-consumption.e2e.spec.ts` — Flight payload integrity for the real-consumption series
  - `mobile-ux.e2e.spec.ts` — 44px tap targets (R8b), 375px horizontal overflow (R7d),
    horizontal layout for start year, end year, and max-range button on mobile viewports,
    and `LazyMount` deferral (R12)
  - `accessibility.e2e.spec.ts` — dark-mode legend contrast (P0-3 / P1-2 regression),
    `:focus-visible` rings (P4-1), keyboard-only operation (P4-1), `prefers-reduced-motion` (P4-2),
    and modal focus management — scroll preservation on dismiss & `Tab` containment (R8e)
- `cagr-sheet.e2e.spec.ts` — CAGR コンパクトシートの開閉・計算導線・グラフ可視性（R18）
- `plan27-private-consumption.e2e.spec.ts` — Plan38のCTIミクロ名目四半期系列について、2005Q1〜2017Q4の52期の実SVG・tooltip・表・CSV導線、行metadata parity、nominal-only境界を検証する。GDP専用keyや旧月次CTI wage registryは参照しない。
- `advanced-series.e2e.spec.ts` と `chart-table-csv-parity.e2e.spec.ts` — NewGraphの比較registryでCPI・給与・Plan49 `消費(総合)` のgraph/table/CSV parityと順序・ラベルを検証する。Plan37 CTI normal/extension monthly keysとPlan38 quarterly CTI keyは比較registryへ混入させない。
- `plan24-rendering.e2e.spec.ts` — Plan24の独立した四半期GDP/CTI棒グラフ契約。CTI/GDP境界、52期の期間契約、表・CSV・tooltipの値を検証する。Plan37実行プロファイルの対象外とし、GDP期待値をPlan37の比較線へ移管しない。旧契約の回帰として通常のPlan24実行でのみ検証する。
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
  - NewGraph does not use the retired CTI micro wage registry keys; the nominal quarterly CTI key belongs only to the nominal spending contract.
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

#### Scenario Plan37: CTI basic nominal loader boundary (distinct from Plan38)

- **WHEN** the long-term CTI artifact is loaded for the internal Plan37 basic-series compatibility fields
- **THEN** only `series_index=1`, `official_series_code=1`, and `消費支出（名目）` from the 2025-base nominal normalized CSV is used, with the official raw value retained separately.
- **AND** its internal 12MA fields are emitted only for a complete finite 12-calendar-month window; 2005-01 through 2005-11 are null, and the average of the 2025-01 through 2025-12 raw values is the sole positive baseline for `100*M/B`. These fields are not NewGraph comparison entries.
- **AND** duplicate, missing, non-finite, incomplete-baseline, or non-positive-baseline input fails closed with a reason and never interpolates, zero-fills, mixes seasonal/real values, or falls back to GDP/2020 rollback.
- **AND** the Plan37 monthly raw and normal/extension 12MA compatibility fields remain internal and are not emitted by the NewGraph comparison registry or Plan38 quarterly nominal public projection.
- **AND** NewGraph Plan49 E2E waits for the target section, `LazyMount` chart wrapper, Recharts surface, and visible SVG geometry by count/visibility after navigation; tooltip interaction obtains the rendered surface bounding box before hovering. It does not rely on `__MOUNT_ALL__` as the readiness contract.
- **AND** NewGraph table/CSV parity covers CPI, salary, and Plan49 `消費(総合)`. Plan38 owns the separate nominal quarterly CTI key and its graph/table/CSV metadata parity; internal Plan37 monthly compatibility fields do not enter the comparison registry.
- **AND** the NewGraph monthly comparison contract uses the dedicated Plan49 key `消費(総合)` and excludes the retired Plan37 normal/extension keys; `CTIミクロ四半期系列（名目）` remains separate in Plan38 and is never substituted for the monthly comparison series.

#### Scenario Plan49: NewGraph comparison registry parity

- **WHEN** the NewGraph comparison graph, tooltip, table, or CSV is rendered with advanced off/on
  **THEN** the same ordered registry supplies CPI, salary, and the single monthly `消費(総合)` CTI-derived entry and their labels, values, and metadata; advanced on/off does not add CTI normal or extension monthly comparison keys.
- **AND** `消費(総合)` uses `CONSUMPTION_TOTAL_12MA_KEY`, monthly frequency, and strict 12-month moving-average metadata, with row measurements carrying value/status/reason and source/provenance consistently through graph, tooltip, table, and CSV.
- **AND** the registry contains neither `CTIミクロ四半期系列（名目）` nor GDP raw/comparison keys; the quarterly CTI key is verified only by the Plan38 nominal spending contract.

## 期間統一方針（Plan39同期）

## Plan39-v2 公開層

### Data Sources

Plan39-v2 nominal estimates consume the validated nominal B/A annual artifacts and the
`CtiAdjustedV2Result` produced by `server/lib/ctiAdjustedConnectionEstimateV2.ts`
(model `v2-bottom-up`, estimateVersion `plan39-v2`). Major categories are
calculated first and `その他の消費支出` is derived as the explicit Other
category; the v1 diagnostic `残差` key is not an input to the v2 public
registry. A selects official distribution-adjusted nominal annual values for
2017 onward; B selects basic nominal annual values from each artifact's
`消費支出（名目）` field. Historical 2005–2016
estimates use nominal B connected to the nominal A/B overlap in 2017. The
artifacts' real columns are not selected. The external L artifact is real-only,
and the source set has no nominal L series; therefore L and its derived D
household-composition correction are excluded. Historical 2005–2016 estimates
receive a provisional endpoint-calibrated 2+ household-share correction from
the dedicated production `pi2plus` artifact. The official distribution-adjusted
nominal A anchor from 2017 onward is retained unchanged. Calibration is fixed to 2018–2025, with 2017 as the
holdout/connection year; 2017 is never used for learning. Rolling validation has 5 folds and
leave-one-year-out (LOO) validation has 8 folds; every fold is finite and
leakage-free, with model MAE `0.2272221271` versus baseline MAE
`1.1815238095` for rolling and model MAE `0.2260979458` versus baseline MAE
`0.9428571429` for LOO.

The previously implemented v2 audit included Other derivation and `β_other`,
2005–2016 estimation, official A retention from 2017 onward, residual
diagnostics, G and boundary diagnostics, the five fixed γ comparison cases,
and input validation. The v2 sensitivity path is connected to
`scripts/plan39/run-analysis.mjs`, and the latest analysis artifact contains a
v2 section. In that artifact, Other/bottom-up coverage is 12/12 for
2005–2016, `β_other=1.3004657346511044`, γ has five evaluated cases, G
coverage is 2/3 for 2005–2018, and the 2016→2017 boundary is available with
`absoluteDifference=0.7122004366712389`. The threshold is the maximum
official-A 2017–2025 Other year-over-year difference, `1.4`; the generated
bottom-up path covers 2005–2016, connects through 2016→2017, and all official
A years from 2017 onward pass. These are historical results from the former
real-input calculation and are retained as audit history only; they do not
validate the current nominal B/A estimate or authorize its publication. The
current nominal analysis is input-matched, but its gate is blocked at the
2016→2017 Other-share boundary as described below. Historical γ, L, G, and
legacy residual outputs remain diagnostic records.

Current Plan39-v2 residual-jump acceptance evaluates Other as a share of the
total: `100 × Other / 総合`. It compares absolute adjacent-year changes in
percentage points. The threshold is derived only from official adjusted A
2017–2025, using every adjacent pair from 2017→2018 through 2024→2025; it is
the exact maximum observed share change in those pairs rounded upward to the
next 0.01 percentage point (`ceil(raw×100)/100`). Diagnostics retain both the
unrounded maximum and effective rounded threshold. Missing/non-finite values,
non-positive totals, or Other outside `[0, 総合]` make a pair unevaluable. If
any official pair is unevaluable, threshold derivation fails closed. The same
threshold evaluates every adjacent pair in the displayed historical
connection, including estimated 2016→official 2017. Audit output records each
pair's Other, total, share, share change, source type, threshold, unit, and
pass/violation/unavailable state. Estimated values never contribute to
threshold derivation. The `residualBoundary` sweep in
`scripts/plan39/run-analysis.mjs` remains a separate legacy diagnostic and
does not control the V2 publication gate.

- **WHEN** the Plan39-v2 residual-jump gate is evaluated, **THEN** it compares
  the absolute adjacent-year change in `100 × Other / 総合` with a threshold
  in percentage points derived from the maximum adjacent share change in
  official A from 2017 through 2025 and rounded up to the next 0.01 point;
  it records the exact derived maximum and effective rounded threshold; **AND** any missing, invalid,
  non-positive-total, or inconsistent official pair fails threshold
  derivation closed rather than treating Other as zero.
- **WHEN** an estimated-to-official connection or historical adjacent pair is
  checked, **THEN** it uses the same official-derived threshold, includes the
  2016→2017 pair, and records each pair's source, values, unit, and result;
  **AND** estimated pairs do not affect the threshold value.

The provisional household-size correction preserves the existing category
anchor baseline `base[t,c]=B[t,c]×A[2017,c]/B[2017,c]` for each of the nine
major categories and Other (Other is derived as total minus the nine majors
where the published cell is unavailable). For each category, it estimates
`gamma[c]=(A[2025,c]-base[2025,c])/(piJan[2025]-piJan[2017])`, where `piJan`
comes from annual January `setai-n` national 2+ shares. Historical estimates
are `base[t,c]+gamma[c]×(piIV4[t]-piIV4[2017])`; total is always the sum of the
nine corrected major categories and corrected Other. The correction is zero at
the 2017 anchor and total gamma must reconcile to the sum of category gammas.
Applying the 2025 endpoint coefficient retrospectively to 2018–2024 is a
diagnostic, not independent or causal validation.

The production input is
`data/source/cti-size-composition/production-pi2plus.json`, generated by
`scripts/plan39/build-production-pi2plus.mjs`. The loader accepts it only when
`production-pi2plus-manifest.json` validates its artifact hash, normalized
source hashes and retained January source-file hashes. Historical annual IV-4
shares in `weights.csv` and January `setai-n` shares have distinct source and
vintage definitions; historical pi is centered on its own 2017 value, making
the correction zero at the anchor without claiming a verified bridge. The
2011 IV-4 share is synthetic linear interpolation from unverified 2010/2012
endpoints, included provisionally under the user's selected simple completion
and subject to revision if a verified national value becomes available.
January shares proxy the preceding/trailing-12-month distribution, and 2018
survey redesign plus 2017/2022 LFS benchmark changes remain caveats. Missing,
invalid, non-finite, or non-positive shares, coefficients, corrected categories,
or hashes fail closed. Result diagnostics include coefficients, caveats,
2018–2024 retrospective MAE/RMSE, and total reconciliation error.

#### 世帯人数構成候補（分析専用）

`scripts/plan39/prepare-size-composition-panel.mjs` は家計調査の年次詳細結果表
3-1（二人以上世帯）と単身世帯表1から、2005–2017の名目支出プロフィールを作る。
`household-survey-panel-manifest.json` は年別のe-Stat file ID/URL、元ファイルSHA-256、
対象sheetと正規化CSV hashを記録する。抽出器は実行前にmanifestと元ファイルhashを照合し、
候補計算器も必要年、ID/URL、元ファイルhash、正規化CSV hashを再検証する。
世帯ウェイトmanifestは2025年労働力調査IV-4原表とhash、および旧年ウェイトのvintage/statusを記録する。

2011年の全国ウェイト原表は分析入力として使わず、2010/2012年の各世帯人数shareを
線形補間し、丸め後に再正規化した診断値をweights.csvへ保存する。2010 IV-4
(`statInfId=000008597994`) は2005年国勢調査基準、2012 IV-4
(`statInfId=000018854323`) は2010年国勢調査基準で、共通基準への公式接続は確認できていない。
2011 IV-4 (`statInfId=000012675623`) は岩手・宮城・福島を除く44都道府県であり、全国の
世帯人数ウェイトとして代用しない。2011値には補間方式・端点・基準差のcaveatを付け、
年次R診断に含めるがlambda学習から除外する。2010または2012のshareを2011に代用した
端点シナリオとの差を年次candidateに併記する。これらはすべて未接続旧ウェイト由来の
感度診断であり、statusは `legacy_unharmonized_weights` のままとする。

候補式は2025年の世帯人数分布を固定参照にし、構成効果を2017年に正規化する。
費目別lambdaは家計調査パネルだけから推定し、CTI A/Bはlambda学習に使わない。
利用可能な旧年労働力調査ウェイトは基準接続が未検証で元ファイルID/hashも保持されていない。
2011年はrawウェイトが欠測し、年次Rに限って2010/2012 share補間の診断値を使うが、lambda学習からは
除外する。端点代替シナリオも出力し、出力は `legacy_unharmonized_weights` の感度診断に限る。
2017 A/B比は水準アンカーとしてのみ使い、2017一致は適合度・バックテストの根拠としない。
この候補は本番推計、loader、公開gate、Plan39公開measurementの入力ではない。
2018年だけは別枠の教育安定性診断として、家計調査の2017/2018年別プロフィールと
各年1月分の補正用特別集計として公表されたsetai-nウェイトを取得し、2017 anchorからの2018予測を調べる。
家計調査の標本設計では補正に用いる世帯数分布を労働力調査の直近12か月平均値と定義しており、暦年平均とは確認できない
（[家計調査2018年報 p.25](https://www.stat.go.jp/data/kakei/pdf/18gai00.pdf)、
[世帯数分布](https://www.stat.go.jp/data/kakei/setai_bunpu.html)）。2018年は家計簿様式全面改正年であり、
このウェイトは年平均IV-4でも2025 CTIの世帯人数×年齢joint weightでもない。
この二年断面を連続系列・本番ウェイトとみなさない。

CTI A/B anchor・照合値は丸め済みJSONではなく、公式2025年基準のbasic B
(`statInfId=000040499069`) と adjusted A (`000040499087`) の一次Excel sheet `総・年` から読む。
見出しはExcel行9、名目J:T、Aの2017/2018は行10/11、Bは行25/26であり、raw値とSHA-256、
年・列・費目の対応をmanifest/result JSONへ記録する。T列の「その他の消費支出」は`-`で公表値がないため、
総合−公表9費目の残差を使い、そのA/Bを公式公表Other比と呼ばない。2017比は予測の水準anchorのみで、
anchor一致を適合度やバックテストに数えない。

年別lambda `log(Q[t,c])/log(Q[t,total])` は各年1断面による不安定な診断で、回帰推定値と同等に扱わない。
2018 holdoutは2005–2016（2011除外）から推定した既存lambdaと2017 A/B anchorのみで予測し、
2018 A/Bは予測後の照合に使う。2017/2018二年lambdaの分母は
`log(Q2018,total/Q2017,total)` とし、絶対値が小さくても値を保持して不安定flagを付ける。
2018を使う二年較正・幾何平均anchorはin-sample参考値で、検証結果ではない。
この分析は本番推計、loader、公開gate、Plan39公開measurement、SharedPlan40四半期値の入力ではない。

### Data Flow

`nominal B/A annual artifacts` + manifest-validated provisional `pi2plus` artifact → nominal 2005–2016 connected estimate / official
distribution-adjusted nominal A from 2017 → `CtiAdjustedV2Result` → model/version-aware v2 public projection → separate
v2 key registry → chart/tooltip/table/CSV. The v1 registry and projection keep
`CTIミクロ調整系列（残差）` and its existing category/display contract.
The v2 registry maps the same `その他の消費支出` measurement to the public
key `CTIミクロ調整系列（その他の消費支出）` on every public surface.
The saved Plan39 artifact remains on the legacy `pass` / `insufficient-data`
audit contract. The nominal calculation requires nominal columns from B and A;
the real-only L artifact is not a required nominal estimate input. The
Plan40 runtime-evidence path is a separate strict contract that requires the
2005–2017 target years, `baseYear=2025`, compatible `adoptedRange`, and the
positive 2025 A anchor; those checks must not be applied to the Plan39 path.
Finite bottom-up estimates are published only when
`publicationGate.status === "pass" && accepted === true` and the accepted
analysis input fingerprint matches the selected nominal runtime artifacts.
Otherwise estimated rows are `unavailable`, null, and reasoned
(`overall_verdict_not_accepted` or the applicable input-fingerprint reason);
`accepted=false` means the estimated publication is incomplete. The previously
recorded `status="pass"`, `accepted=true` gate belongs to the former real-input
calculation and is not inherited by the nominal path. Official distribution-
adjusted nominal A observations from 2017 onward remain official and are never
overwritten by the gate.

The household-survey expenditure profiles, conditional 2+ expenditure panel,
and their lambda/composition candidate remain analysis-only. Their provenance
gate checks source manifests, year coverage, e-Stat IDs/URLs, raw hashes,
normalized CSV hashes, and weight vintage/status before calculation. Missing or
mismatched provenance fails closed. Those candidate coefficients and values do
not flow into `CtiAdjustedV2Result`. Separately, the production estimate uses
only the manifest-validated `production-pi2plus.json` annual household shares
described above; the research candidate formulas and outputs remain excluded.

### Data Model

Each v2 public row carries `year`, `model`, `estimateVersion`, `status`, and
`reason`. Each v2 measurement carries `year`, `category`, `value`, `source`,
`status`, `reason`, `model`, and `estimateVersion`, with the public key and
official/estimated provenance. The v2 category set contains Other and does not
contain the v1 residual diagnostic category. Residual diagnostics remain
internal/audit-only and are not mixed into the v2 public measurement map.
`CtiAdjustedV2Result.publicationGate` uses `status: CtiAdjustedV2Status | "pass"`
and `accepted: boolean`. The previously recorded `status="pass"`,
`accepted=true`, and empty `blockingReasonCodes` belong to the former real-input
calculation; they do not establish a valid nominal gate. The type continues to
represent the fail-closed state for invalid or incomplete nominal audits.

### Component Tree

`nominal B/A artifacts` → `v2 nominal connected estimate` → `CtiAdjustedV2Result` →
`projectCtiAdjustedV2PublicView` → v2 registry → chart/tooltip/table/CSV.
The v1 `projectCtiAdjustedPublicView` and registry remain a separate branch.

The former real-input artifact had `publicationGate.accepted=true` and
`blockingReasonCodes=[]`; this is historical state and does not establish
nominal acceptance. The current nominal analysis artifact is input-matched.
Before the approved upward-rounding rule, it reported
`threshold_redesign_incomplete` and `connection_2017_reaudit_incomplete`
because the corrected 2016→2017 share jump was 0.7661764640 percentage points
against the exact official-derived maximum 0.7639419404. The effective threshold
is now rounded upward to 0.77 percentage points; the refreshed analysis records
the boundary as passing and `publicationGate.accepted=true`; comparison and
sensitivity warnings remain non-blocking. The v1 contract remains unchanged,
including its residual key; v2 Other uses a separate key and is not treated as
v1 residual.

The nominal publication gate passes for the current input fingerprint under
the documented rounded threshold. This does not make the 2025-endpoint
retrospective correction an independent forecast validation or a causal
household-size estimate. Recompute and review the gate whenever inputs change.

### Requirements

- **WHEN** the v2 public registry is created, **THEN** it contains
  `CTIミクロ調整系列（その他の消費支出）`, while the v1 registry retains
  `CTIミクロ調整系列（残差）` and its category/display array is unchanged.
- **WHEN** v2 Other is derived, **THEN** the derivation is bottom-up from total
  minus the major categories and is published as Other, never as v1 residual.
- **WHEN** the nominal estimate is calculated, **THEN** it selects nominal
  columns from B and A, excludes their real columns, and does not require the
  real-only L artifact or L-derived D household-composition correction.
- **WHEN** the endpoint correction is calibrated or retrospectively compared,
  **THEN** it uses the saved nominal B/A annual JSON artifact precision (one
  decimal), records this in result diagnostics, and does not substitute the
  higher-precision research-only raw-workbook backtest values.
- **WHEN** the analysis-only 2017/2018 education stability diagnostic runs,
  **THEN** it verifies and reads the raw basic/adjusted CTI annual XLSX cells
  (2017 A row 10/B row 25; 2018 A row 11/B row 26; nominal J:T), records file
  hashes and raw values, and does not derive a published Other ratio from the
  T-column dash; **AND** if raw source identity, year row, header, or hash
  fails, the diagnostic stops without emitting a new result.
- **WHEN** the 2018 holdout is compared with the historical-lambda prediction,
  **THEN** lambda is fit only to the 2005–2016 household-survey panel excluding
  2011, the 2017 A/B ratio is only a level anchor, 2018 A/B is held out until
  post-prediction comparison, and the 2018 ledger-format revision plus
  setai-n special-weight definition are stated as limitations.
- **WHEN** the separate two-year 2017/2018 anchor scenario is calculated,
  **THEN** `log(Q2018,total/Q2017,total)` is the denominator, any small-denominator
  estimate is retained with an instability flag, and the scenario is labeled
  in-sample rather than validation.
- **WHEN** the external real-only L benchmark is used by a separate audit,
  **THEN** it remains diagnostic only and is not extrapolated or interpolated
  for 2019 onward; it does not affect nominal estimate values or publication.
- **WHEN** γ cases are compared, **THEN** they are recorded as non-blocking
  sensitivity analysis and γ is not fixed as a production parameter.
- **WHEN** G is evaluated, **THEN** it is recorded as an external audit
  benchmark and is not used as a standalone public stop condition.
- **WHEN** model calibration is performed, **THEN** calibration is fixed to
  2018–2025, 2017 is a holdout/connection year, and residual diagnostics are
  separate from public measurements.
- **WHEN** `publicationGate.status === "pass" && accepted === true`, **THEN**
  finite v2 estimates may be `estimated_adjusted` only when the accepted
  analysis fingerprint matches the selected nominal B/A inputs; **WHEN** the
  gate or fingerprint check fails, **THEN** estimated values are null/unavailable
  with a reason and are not publicly emitted.
- **WHEN** an official distribution-adjusted nominal A value from 2017 onward exists, **THEN** its value and
  official status are retained regardless of the estimated publication gate.
- **WHEN** chart, tooltip, table, or CSV renders v2 Other, **THEN** all surfaces
  resolve the same v2 key, measurement, model/version, source, year, value,
  status, and reason; v1 mapping is not reused.
- **WHEN** the Plan39 annual table renders a measurement, **THEN** the cell
  displays `推計`, `公式`, or `利用不可` from that measurement's
  `seriesType`/provenance, without deriving the label from a hard-coded year.
- **WHEN** Plan39 public data contains an official measurement, **THEN** the
  chart/table context displays the first official year detected from the data
  as the estimate-to-official boundary; **WHEN** no official measurement is
  present, **THEN** it states that no official adjusted value is available.
- **WHEN** the Plan39 CSV is offered for download, **THEN** the surrounding
  UI states that per-series value-type metadata is included, and the CSV
  retains the machine-readable `seriesType` columns for each series.
- **WHEN** the former real-input v2 artifact is inspected, **THEN** its
  coverage, γ cases, β_other, G coverage, boundary result, gate, and reason
  codes remain historical audit evidence only; they do not validate nominal
  estimates or establish a currently accepted nominal publication gate.
- **WHEN** nominal v2 publication is evaluated, **THEN** nominal-input
  backtests, Other/β stability, and the 2017 connection must be evaluated using
  an input-matched analysis artifact before estimates can be published.
  Historical real-input diagnostics do not satisfy these conditions.
- **WHEN** the household-size candidate is calculated, **THEN** required years,
  source IDs/URLs, raw hashes, normalized CSV hashes, and declared weight
  vintage/status are verified before calculating; **WHEN** any provenance check
  fails, **THEN** candidate coefficients and annual estimates are not emitted.
- **WHEN** weights have unverified benchmark connections or the raw national 2011 weight is missing,
  **THEN** a 2011 diagnostic row may be produced only from normalized 2010/2012 size shares by linear interpolation and renormalization; its manifest and rows identify it as derived, not observed, and the result remains `legacy_unharmonized_weights` and cannot satisfy the production publication gate. The 2010 and 2012 endpoint benchmark bases are not verified as connected, and the 2011 44-prefecture table is not a national substitute.
- **WHEN** annual R is calculated for 2011, **THEN** the interpolated distribution is included, lambda fitting continues to exclude 2011, and annual-candidate output includes 2010/2012 endpoint alternatives and their candidate range.
- **WHEN** the 2017 A/B ratio is used as an anchor, **THEN** its identity is not counted as fit or backtest evidence.
- **WHEN** Plan39-v2 estimates are built, **THEN** the loader verifies the
  dedicated `production-pi2plus` artifact and source hashes, applies endpoint
  corrections only to 2005–2016, keeps 2017–2025 official A unchanged, derives
  total as corrected categories' sum, and records coefficient/source
  diagnostics; **AND** missing or invalid required sources make the estimate
  unavailable and close the publication gate.
- **WHEN** the 2018–2024 retrospective validation is reported, **THEN** it
  identifies 2025 as the endpoint calibration year and labels the result
  retrospective and non-causal, not independent forecast evidence.
- **WHEN** historical IV-4 shares are applied, **THEN** their source/vintage is
  identified as distinct from January `setai-n` and centered on their own 2017
  value; 2011 is identified as synthetic interpolation and remains provisional.

#### Research-only education-share 2+ backtest and production share source

This supplemental diagnostic is separate from the Plan39 production estimator,
loader, publication gate, quarterly values, and the prior 2017/2018 education
stability artifact. It reads the retained raw official 2025-base CTI B/A
workbooks and annual January `setai-n` special-tabulation files for 2017–2025.
For each year, national size shares are each exact published size-bin count
divided by the reported 1,000,000-part national denominator; `pi2plus` is
`1 - pi1`. It preserves file URLs and SHA-256 hashes, reported year, sheet,
denominator, raw values, and extraction row/cell evidence. The special files
are each year's January tabulation, while the Household Survey design defines
the correction distribution for a month using the preceding/trailing 12-month
LFS distribution. January therefore serves only as an annual proxy, not a
calendar-year average. The 2018 Household Survey redesign and LFS population
benchmark changes to the 2015 Census base in January 2017 and 2020 Census base
in January 2022 are comparability caveats.

Calibration uses only 2017:
`K = (pAedu_2017 / pBedu_2017) / pi2plus_2017`, where
`pAedu=A_education/A_total` and `pBedu=B_education/B_total` come from exact raw
CTI XLSX cells. The candidate is
`pHat_Aedu_t = pBedu_t * pi2plus_t * K`; the anchor baseline is
`pHat_Aedu_t = pBedu_t * (pAedu_2017/pBedu_2017)`. Validation excludes 2017
and compares per-year residuals and aggregate MAE/RMSE/bias over 2018–2025.
The reproducible script is `scripts/plan39/two-plus-share-backtest.mjs`;
trace and results are stored under `data/source/cti-size-composition/two-plus-share-backtest/`
and `results/plan39/two-plus-share-backtest/`.

- **WHEN** the 2+ share backtest runs, **THEN** it reads unrounded annual CTI
  education/total values from the retained raw official A/B workbooks and
  validates each annual January `setai-n` file's year, national rows, and
  reported denominator before extracting 1/2/3/4/5+ shares; **AND** if a
  validation-year source check fails, that year is omitted and the failure is
  recorded in coverage; a missing/invalid 2017 calibration input stops without
  a new backtest result.
- **WHEN** the model is calibrated, **THEN** only 2017 determines `K`, and
  2017 is excluded from validation; the 2018–2025 results report each model's
  annual prediction/residual, `n`/coverage, MAE, RMSE, and bias against official
  adjusted A education share.
- **WHEN** the January LFS special shares are interpreted, **THEN** the result
  states that they proxy one January distribution rather than a calendar-year
  average of the preceding/trailing 12-month correction distribution, and
  records the 2018 Household Survey redesign and the January 2017/January 2022
  LFS benchmark changes.
- **WHEN** Plan39 production estimators run, **THEN** they do not consume this
  backtest's education formula, K, predictions, validation rows, or summary;
  they consume only the separately generated, manifest-validated
  `production-pi2plus.json`, whose January source shares are independently
  hash-checked and used in the endpoint-residual correction specified above.
- **WHEN** loaders, publication gates, quarterly values, or the previous
  2017/2018 stability analysis run, **THEN** the research backtest's calculated
  predictions and results do not affect their formulas or acceptance state.

#### Research-only 2017-anchor-only category-share backtest

This supplemental diagnostic reads exact raw cells from the retained 2025-base
CTI basic B (`000040499069`) and adjusted A (`000040499087`) workbooks, sheet
`総・年`, for 2017–2025. It maps the nine published nominal categories by exact
header and includes Other as a tenth category: use the workbook's numeric Other
cell when present, and derive total minus the nine published categories when
the cell is `-`. The source status and exact cell coordinates are retained per
series/year. Numeric Other values occur from 2020 onward; the 2020 switch from
residual to official values is a comparability caveat, with the maximum
official-minus-residual difference reported for each workbook.

For each category, `pB[t,c]=B[t,c]/B[t,total]`,
`pA[t,c]=A[t,c]/A[t,total]`, and the only calibration is
`q[c]=pA[2017,c]/pB[2017,c]`. The requested raw prediction is
`pHatRaw[t,c]=pB[t,c]*q[c]`. A separate coherent variant is
`pHatNorm[t,c]=pHatRaw[t,c]/sum_j(pHatRaw[t,j])`; it is reported distinctly and
does not replace the raw formula. Validation uses only 2018–2025. Per-category
MAE, RMSE, and bias are reported in percentage points, along with unweighted
macro metrics, annual actual/predicted/errors, and annual sums of raw predicted
shares. The script is `scripts/plan39/anchor-only-category-backtest.mjs`; its
summary and annual rows are saved under
`results/plan39/anchor-only-category-backtest/`.

`raw B/A CTI cells` → exact header/year validation → ten annual category shares
→ 2017 category anchors → raw predictions and separately normalized variant
→ 2018–2025 category/overall metrics and source-traced result files.

- **WHEN** the category-share backtest runs, **THEN** it extracts exact raw
  annual nominal values from the retained B/A XLSX files, records workbook
  hashes and cell evidence, derives `q[c]` only from 2017, and reports both the
  requested unnormalized formula and the separately labeled normalized
  variant over 2018–2025; **AND** if a year, required category header/value,
  total, or anchor cannot be identified unambiguously, it fails closed for the
  affected input instead of silently substituting another category.
- **WHEN** category metrics are emitted, **THEN** they include per-category
  MAE/RMSE/bias in percentage points, overall macro metrics, per-year
  predicted/actual/error values, and each year's raw predicted category-share
  sum; Other's per-year source status and direct-versus-residual maximum
  difference are included so the 2020 source-method boundary is auditable.
- **WHEN** Plan39 production estimators, loaders, publication gates, or
  quarterly values run, **THEN** this backtest's files and values are not
  consumed and do not alter production formulas.

### Data Flow

production/base calibration は 2018–2025 とし、target/holdout 2017 は calibration から除外する。sensitivity は baseline（2018–2025）と alternative（2018–2024）を、target/holdout 2017・同一 L ルール（`official_annual`）で期間だけ比較する。月次 L artifact がないため `calendar_year_average` は使用しない。期間、対象年、除外年、入力 coverage、leakage 判定を audit に保存し、必須項目の不足時は `insufficient-data` として fail-closed にする。

### Requirements

- production/base calibration は 2018–2025 でなければならない。
- sensitivity の calibration は baseline 2018–2025 と alternative 2018–2024 に分け、target/holdout 2017 をいずれの calibration にも含めてはならない。
- sensitivity の比較は baseline 2018–2025 と alternative 2018–2024 を、target/holdout 2017・同一 L ルールで行わなければならない。
- L は `official_annual` のみを使用し、`calendar_year_average` を採用してはならない。
- audit には期間、対象年、除外年、入力 coverage、leakage 判定を保存し、不足時は `insufficient-data` として fail-closed にしなければならない。
- 上記のthreshold、backtest、Other/β安定性、2017接続監査のpass記録と `1.4` のthresholdは旧real入力に対する歴史的監査記録であり、現行nominal推計の合格根拠にしない。
- 現行nominal推計の受入には、名目B/Aを入力として再生成しruntime artifact fingerprintと一致する監査結果が必要である。監査未実施時は2005–2016推計を公開しない。

### WHEN-THEN

- WHEN production/base または backtest を実行する THEN calibration は 2018–2025、target/holdout は 2017 とし、2017 を calibration から除外する。
- WHEN 旧real入力のsensitivity記録を読む THEN baseline 2018–2025 と alternative 2018–2024 およびL ruleは歴史的条件として扱い、nominal計算へ再利用しない。
- WHEN nominal v2を監査する THEN 名目B/Aの入力fingerprintを検証し、real-only LまたはL由来Dを推計へ使用しない。
- WHEN audit を確定する THEN 期間、対象年、除外年、入力 coverage、leakage 判定を保存し、いずれかが不足していれば `insufficient-data` として fail-closed にする。
- WHEN nominal inputsによる必須監査が未監査または不合格である THEN 公開を拒否し、`accepted=false` とする。旧real入力でのpass記録は引き継がない。
- WHEN nominal inputsによる必須監査がpassし、`accepted=true` と入力fingerprint一致を満たす THEN 公開可能状態へ進める。旧real入力auditのgamma/G結果だけでは公開可否を決めない。

## JEV 開発チェックポイントレビュー

### Data Sources

実装チェックポイント後のレビューは、リポジトリ内の
`skills/jev-review/SKILL.md` と同ディレクトリの汎用クライアントを入力契約とする。
クライアントは `TYPESAFE_API_KEY`、`TYPESAFE_MODEL`、`TYPESAFE_BASE_URL` を使って TypeSafe API に
レビュー依頼を送り、対象の差分、受入条件、検証結果、制約を渡す。JEV の返答は
作業中に確認して判断へ反映し、必要または有用な場合にのみローカル保存する。実在を確認していないレスポンスの verdict enum は契約として
固定しない。新標準フローはJEVから選択肢、confidence、probabilitiesを受け取り、ケース固有の
理由文をJEVに生成させない。認証には明示指定された `TYPESAFE_API_KEY` を優先し、未指定時は
リポジトリの `.env.local` にある `TYPESAFE_API_KEY` を既定値として読み込む。
`TYPESAFE_ENV_FILE` が指定されている場合は、その env ファイルを優先して読み込む。
認証情報はレビュー本文にも結果記録にも送らず、キーが得られない場合は送信を
fail-closed にする。今回のユーザー明示依頼により、レビュー文脈・計画・差分要約・
受入条件・検証結果など認証情報以外のデータは JEV への送信を承認済みとする。
この承認には、初回のJEV応答、Codexが作成する候補付き更問、およびその応答も含まれる。
認証情報は初回・clarification のいずれにも含めず、過去の別実行記録を現在のレビューへ混ぜない。
標準の候補JSONは実装固有の診断と即時アクションだけを含み、認証情報を含めない。

### Data Flow

`implementation checkpoint context` → `skills/jev-review/SKILL.md` の明示読込 → 実装証拠と候補JSONの準備
→ 汎用 TypeSafe API クライアント → JEV初回選択（choice/confidence/probabilities）
→（有効なnon-pass時のみ一度だけ候補選択）→ ローカル候補詳細の対応づけ → 必要な修正と再レビュー。
API エラー、タイムアウト、認証失敗、または HTTP 成功だけでは妥当と判定せず、結果が
得られない場合は未確定として扱う。JEV 判定は既存テスト・型チェック・lint の代替にしない。
送信時は `.env.local` の `TYPESAFE_API_KEY` を認証専用に使用し、レビュー本文へ
認証情報を含めない。新標準フローでは、実コード・要件・テスト・検証証拠から2件以上の
相互排他的なcase-specific即時アクション候補を初回送信前にCodexが準備し、
`--clarification-candidates PATH` で初回リクエストと同時に渡す。候補JSONは
`{ "choices": [...] }` であり、各候補に `id`、`label`、`finding`、`affected`、
`evidence` または正確な `neededEvidence` の一方、`nextAction` または `proposedFix` の一方、
`remainingUncertainty` を含める。不足候補はAPI送信前にローカル検証で拒否する。
正常に検証された新標準初回結果が `valid_as_defined` 以外なら、一度だけ更問リクエストを
送ってJEVに候補を選ばせる。Codexは候補選択を先取りせず、ユーザーにも選択を求めない。
初回合格、通信失敗、応答検証失敗、未対応形式、または初回回答の欠落・曖昧・不一致の場合、
更問は送らない。選択された候補IDは初回と同梱したローカル候補へ対応づけ、その詳細を
`resolution=selected`、`diagnosisSource=provided_candidate`、`diagnosisStatus=complete` として
記録する。これはCodexが提示した内容であり、JEV生成理由ではない。初回の `decisionSummary` と
確率分布を保持し、更問の `effectiveVerdict=requires_revalidation` とし、初回判定を合格へ変更しない。
失敗、無効応答、または選択肢外IDは未解決として記録し、更問を連鎖させない。追加証拠または
修正後に通常の初回JEV再判定を行う。候補fileのない旧CLI挙動、手動 `--clarify ... --choice` と
generic `--follow-up` は互換ユーティリティとして保持する。

### Component Tree

`AGENTS.md のチェックポイント手順` → `skills/jev-review/SKILL.md` → 実装証拠と候補JSONの準備
→ `skills/jev-review/scripts` 汎用クライアント → JEV初回判定 →（有効なnon-pass時のみ候補選択の
clarification）→ ローカル候補内容を含むclarification record → 修正対応 → 通常の初回JEV再判定。
初回 record と clarification record は分離し、現在の実行に属する文脈だけを渡す。これは開発補助の経路であり、
アプリケーションの runtime コンポーネントツリーには含めない。標準フローに generic follow-up の段階は設けず、
未解決の clarification も連鎖させない。

### Plan40 JEV checkpoint record

Plan40 の計画レビューでは、公式クライアントの送信前入力検証を通過し、続く本判定も成功した。
`rawResponse.answers.overall` は `choice=valid_but_limited`、`confidence=0.53`、確率は
`valid_as_defined=0.02`、`valid_but_limited=0.64`、`not_valid=0.26`、
`indeterminate=0.08` だった。`rawResponse` に `evidence` と `limitations` の明示はなく、
そのため計画の妥当性には未確定点が残る。結果は `/tmp/jev-plan40-review-live.json` に保存し、
この判定は既存テスト・型チェック・lintの代替、または無条件の妥当性承認とは扱わない。

初回判定に対する follow-up は理由 `evidence_insufficient` で実行した。初回レビューは
`priorReview` として保持して送信し、follow-up の送信前入力検証と本送信はともに成功した。
結果は `/tmp/jev-plan40-follow-up.json` に保存し、`rawResponse.answers.follow_up` は
`choice=needs_evidence`、`confidence=0.79`、確率は `needs_evidence=0.84`、
`clarified=0.14`、`needs_fix=0.01`、`indeterminate=0.01` だった。応答上、
`evidence` と `limitations` の明示はなかった。この判定は実装の否定ではなく、追加の
根拠提示が必要という意味であり、受入条件に対応する検証証拠が揃うまで未確定点を保持する。
JEVは既存テスト・型チェック・lintその他の検証の代替とは扱わない。

証拠付き implementation checkpoint review では、verification state に受入条件、具体的な
テストアサーション、`type-check`、変更コードの `oxlint`、production `build`、
`git diff --check` を明示した。初回・更問では `needs_evidence` だったが、これらの証拠を
独立した verification として提示して最終判定に到達した。最終の
`rawResponse.answers.implementation` は `choice=valid_as_defined`、
`confidence=0.35`、確率は `valid_as_defined=0.51`、`valid_but_limited=0.44`、
`not_valid=0.01`、`indeterminate=0.04` だった。`rawResponse` に `evidence` と
`limitations` の明示はなかった。JEVは既存テスト・型チェック・lint・buildその他の
検証の代替とは扱わない。

### Requirements

- **WHEN** 実装チェックポイントに到達する、**THEN**
  `skills/jev-review/SKILL.md` を明示的に読み込み、同スキルの汎用クライアントで
  JEV レビューを依頼する。
- **WHEN** `TYPESAFE_API_KEY` がプロセス環境にない、**THEN** `.env.local` の
  `TYPESAFE_API_KEY` を認証専用の既定値として読み込み、キーが得られなければ
  リクエストを送信せず fail-closed にする。
- **WHEN** JEV へレビューを送信する、**THEN** 今回のユーザー明示依頼で承認済みの
  計画、レビュー文脈、差分要約、受入条件、検証結果など認証情報以外のデータだけを
  送信し、API キーその他の認証情報は本文に含めない。この承認は今回の明示依頼の
  範囲に限る。
- **WHEN** JEV の結果を受け取る、**THEN** 妥当性、修正点、未確定点を記録し、修正点が
  あれば対応して必要に応じて再レビューする。未確認のレスポンス enum を前提にしない。
- **WHEN** 新標準フローで実装チェックポイントレビューを始める、**THEN** 実コード・要件・テスト・
  検証証拠に基づく相互排他的なcase-specific候補を2件以上用意し、
  `--clarification-candidates PATH` で初回 `--request` と同時に渡す。候補JSONの各要素は
  `id`、`label`、`finding`、`affected`、`evidence` または正確な `neededEvidence` の一方、
  `nextAction` または `proposedFix` の一方、`remainingUncertainty` を持つ。JEVは選択、confidence、
  probabilitiesのみを返し、候補不足は送信前にローカル検証で拒否する。
- **WHEN** 有効な新標準初回応答が `valid_as_defined` を選択する、**THEN** 合格として扱い、自動更問を送らない。
- **WHEN** 有効な新標準初回応答が `valid_as_defined` 以外を選択する、**THEN** 一度だけ候補選択の
  clarificationを送る。CodexはJEVの候補選択を先取りせず、ユーザーにも選択を求めない。
- **WHEN** clarification が候補リスト内の有効な選択を返す、**THEN** 選択IDをローカル候補へ対応づけ、
  `resolution=selected`、`diagnosisSource=provided_candidate`、`diagnosisStatus=complete` とする。
  候補詳細はCodexが提示した内容として扱い、JEV生成理由と表示しない。初回 `decisionSummary` と
  確率分布を保持し、`effectiveVerdict=requires_revalidation` として初回不合格を合格へ変更しない。
- **WHEN** 初回応答が失敗・無効・未対応または回答が欠落・曖昧・不一致である、**THEN** 自動更問を
  送らず初回のエラー/未確定動作を維持する。clarificationが失敗・無効または選択肢外IDである場合は
  未解決として記録し、更問を連鎖させない。追加証拠または修正後に通常の初回JEV再判定を行う。
- **WHEN** `--clarify ... --choice` または `--follow-up` を互換用途として実行する、**THEN** それらの
  既存モードと検証動作を保持し、新標準候補フローには混ぜない。
- **WHEN** 初回または候補付き clarification を JEV へ送信する、**THEN** 初回応答、候補、質問および
  回答を含む今回のレビュー文脈は送信承認済みとして扱い、
  API キーその他の認証情報は本文・ログ・結果記録へ含めない。
- **WHEN** API が失敗する、応答が得られない、または HTTP 成功だけが確認できる、
  **THEN** 妥当とは判定せず、レビュー未確定または失敗として記録する。
- **WHEN** JEV レビューを行う、**THEN** その判定を既存テスト・型チェック・lint の代替にせず、
  アプリケーション runtime のデータソースやコンポーネントとして組み込まない。

## Plan38 historical/legacy contract and Plan40 replacement contract

Plan38 remains the historical/legacy contract for the dedicated support-series
surface: its `CTIミクロ四半期系列（名目）` key, loader, aggregation, and
standalone contract tests remain valid for callers that use that API. Plan40
replaces the normal page quarterly public projection: the 2005–2016 Plan39-v2
nominal estimate and the 2017Q1 onward official adjusted nominal quarterly
values are integrated into the existing nominal section, and the dedicated
Plan39 annual section is not rendered. The legacy API remains available to
legacy callers and the Plan40 page contract is separate.

- **WHEN** a legacy caller omits `QuarterlyRow.kind`, **THEN** projection uses
  the `legacy-cti` fallback and emits the established legacy keys only.
- **WHEN** a row has `kind=legacy-cti`, **THEN** the row is projected with the
  legacy contract regardless of its year; v2 keys are absent rather than
  synthesized as null fields.
- **WHEN** a row has `kind=plan40-v2-cost-stack`, **THEN** projection adds the
  registry-owned Plan40 v2 expense keys to the existing nominal public surface
  without inferring the kind from the year.
- **WHEN** a row has `kind=plan40-official-quarterly`, **THEN** projection adds
  the registry-owned Plan40 v2 expense keys with official-quarterly measurements
  and preserves their unavailable reasons without inferring the kind from the year.
- **WHEN** the normal page is rendered under Plan40, **THEN** the existing
  active chart sections, table, tooltip, and CSV surfaces remain, the dedicated
  Plan39 annual section is hidden, and the legacy annual component API remains
  available to its unit/legacy contract tests.

## SharedPlan 40: CTI adjusted quarterly nominal graph (current integrated contract)

本節は、Plan38 の専用サポート系列および Plan39-v2 の専用年次表示に関する
表示契約を、既存の名目消費グラフへ統合する現行仕様である。過去の監査記録や
計算式の説明は保持するが、本節と競合する専用グラフ・専用年次セクションの
表示要件は本節を優先する。

### Data Sources

2005Q1–2016Q4 の名目推計は既存のPlan39-v2名目B/A接続推計と名目月次季節プロファイルを
維持する。2017Q1以降は `data/source/cti-distribution-adjusted-000040499087.xlsx` の
sheet `総・四(原)` にある公式2025年基準・総世帯・調整系列（分布調整値）・原数値の
名目四半期列を直接使い、対象期間は2017Q1から最新の完全四半期までとする。
公式四半期値は月次値から再集計・再正規化しない。実質列は選択しない。

実装runtimeは公式Excel sheetからbuild時に生成・正規化した
`data/source/cti_data2025_distribution_adjusted_quarterly.csv` と
`data/source/cti_data2025_distribution_adjusted_quarterly.metadata.json` を読み込む。
これらは公式Excelを一次sourceとする生成artifactであり、sidecar metadataにはworkbook relative pathとfilename、
sheet、統計表ID、基準年、世帯範囲、系列区分、値種別、頻度、収録期間、公式source columnからcanonical
category/public seriesへの対応、元ExcelのSHA-256、および生成CSVのSHA-256を記録する。
runtimeはmetadataと内容の対応を検証し、
Excel由来の公式名目原数値を保つ。

Plan39-v2 の nominal B（基本系列）/A（調整系列）で2005–2016の名目推計を作る。
A/B の実質列および実質のみの L と L 由来 D は名目推計から除外する
（対応する名目 L 系列がないため）。過去の推計値、接続係数、季節プロファイルは変更しない。
2005–2016のOtherはv2専用の年次anchorから導出し、e-Stat同名月次は
季節プロファイルとして使う。2017Q1以降は公式四半期sheetの主要9費目と総合を使い、
Otherを総合−主要9費目のderived residualとして計算する。
v1のResidualをそのまま代用せず、専用の B/A、
`R_other`、`β_other` から導出する。
Plan39世帯人数構成候補のデータ・係数・legacyウェイト（2011年の端点share補間を含む）と、
2017/2018教育安定性診断のsetai-n特別集計ウェイト・様式改正年プロフィールは分析専用であり、
Plan40の年次推計、月次profile、四半期値を補正または再スケールする入力にはしない。

nominal B/A artifact は source、artifact、取得時刻、単位、値種別、世帯範囲、年次頻度、
基準年、欠損表現を含む metadata を入力契約として保持する。A は `baseYear=2025` と
2025年公式名目A総合アンカー（有限かつ正）を 2025=100 契約の検証可能な不変条件とする。
実質列および実質のみのL artifact metadataは nominal input contract の対象外とする。
四半期source metadataには `workbookRelativePath`、`workbookFilename`、sheet `総・四(原)`、統計表ID
`000040499087`、2025年基準、総世帯、調整系列（分布調整値）、原数値、名目、四半期頻度、収録期間、
公式 `sourceColumnToCanonicalCategory` mapping、`sourceSha256` と生成CSVの `csvSha256` を保持する。
runtime用normalized CSVとsidecar metadataはこのExcelからのbuild生成artifactとして
`manifest.artifacts.quarterlyNominal` に登録し、少なくともCSV path/hash、metadata path/hash、revision、
statInfId、sourceUrl、sourceSha256、statusを持つ。bootstrap、rollback snapshot、artifact pair validationの対象に含める。どちらかが欠落・不一致なら
2005–2016年の歴史推計は保持し、2017Q1に `value=null`、`status=unavailable`、
reason `official_quarterly_source_unavailable_latest_period_unknown` のmarkerを置いて、2017Q1以降の値と
最新対象期が不明である旨を画面へ伝える。

### Data Flow

既存の名目B/A接続推計と名目月次季節profileを維持（2005–2016） →
公式Excel `cti-distribution-adjusted-000040499087.xlsx` sheet `総・四(原)` からbuild生成された
normalized CSV/sidecar metadataを検証して公式2025基準・総世帯・調整系列（分布調整値）・
原数値・名目四半期列を選択（2017Q1–最新完全四半期） → 主要9費目の原数値と総合を検証し、
Otherを総合−主要9費目のderived residualとして計算 → measurement → 既存名目グラフ、注記、
tooltip、data table、CSV。公式四半期列は月次平均や年次Aアンカーから再計算せず、未完成期は公開しない。
source pairまたは検証が失敗した場合も2005–2016年の歴史推計は保持する。2017Q1にunavailable markerを
追加し、reason `official_quarterly_source_unavailable_latest_period_unknown` を画面、tooltip、表、CSVへ
伝播して2017Q1以降の欠損と最新対象期不明を示す。月次値や歴史推計へのfallbackはしない。

2005–2016の既存歴史推計は従来どおり対象年の月次profile完全性・重複を検証する。
当該年の年次meanを汚染する重複があれば、その年の全対象四半期・全10カテゴリを
`duplicate_month`、`value=null`、`status=unavailable` として一括fail-closedにする。
2017Q1以降は公式四半期artifactの期・カテゴリ・値を直接検証し、月次値へfallbackしない。

2005–2016は既存の名目歴史推計10カテゴリを積み上げ、2017Q1以降は公式調整済み名目
四半期表の主要9費目の原数値と総合から計算したOther residualを積み上げる。
10費目の合計は公式総合に一致させる。2016Q4/2017Q1で入力経路を切り替える。
Plan39専用年次セクションは表示せず、既存の名目消費グラフに統合する。推計／公式、
四半期派生／公式原数値、境界は注記、tooltip、表、CSVのmeasurement metadataから
同じ値を参照して表示する。

公開投影は行の内部 `kind` を明示的に受け取る。`legacy-cti`（kind省略時の後方互換を
含む）は既存の22キー（名目11＋実質11）のみを投影し、`plan40-v2-cost-stack` は
名目の既存11キーにregistry由来のv2 10費目キーを加える。通常表示では2005–2016行に
v2 kind、2017Q1以降の行に専用の `plan40-official-quarterly` kindを付与する。Kindは年から推測せず、
旧 `legacy-cti` 契約はlegacy API consumer向けに保持する。
投影結果の公開JSONには内部kindを出さない。

Plan39の月次 `seriesIndex` 対応はartifact固有契約として `PLAN39_CATEGORY_SERIES` に
保持する一方、公開キーの対応は共通 `CTI_ADJUSTED_V2_PUBLIC_REGISTRY` から導出する。
seriesIndexをregistryへ無理に混在させず、キーの二重管理だけを避ける。

年次入力契約が閉じた場合、計算結果の全対象行を既存の status/reason 体系で
`seriesType=unavailable`、`value=null` とし、四半期層が別系列フォールバック、
0補完、補間を実行しない。

### Data Model

各行は既存の `SeriesMeasurement` / `SeriesDescriptor`（`src/types/chart.ts`）を
用い、`value`、`status`、`reason`、`unit`、`source`、`frequency`、
`aggregation`、`seriesType`、`official`、`annualAnchorType`、`quarterlyDerived`、
note、計測期間を同一 measurement に保持する。2005–2016の推計行は
`seriesType=estimated_adjusted`、`annualAnchorType=estimated`、`official=false`、
`quarterlyDerived=true` とする。2017Q1以降の公式四半期行は `sourceId` / `statInfId`、公式Excel artifact、
workbook relative path/filename、sheet、period、source/artifact hash、Excel source columnからcanonical
categoryへのmappingをmeasurement provenanceに保持する。9費目は原数値を使い、
`seriesType=official_adjusted`、`official=true`、
`frequency=quarterly`、`aggregation=official_quarterly_original_value`、`annualAnchorType=official`、
`quarterlyDerived=false` とする。Otherは公式総合−主要9費目のderived residualで、
`aggregation=derived_quarterly_residual_from_official_nominal_total_minus_nine_categories`、
`seriesType=estimated_adjusted`、`official=false`、`quarterlyDerived=true` とする。
公式行のrow kindは `plan40-official-quarterly`。source欠損・不整合時は2005–2016歴史推計を保持したまま
2017Q1に `value=null`、`status=unavailable`、reason `official_quarterly_source_unavailable_latest_period_unknown`
のmarkerを置き、2017Q1以降unavailableかつ最新対象期不明である旨を表示する。
`QuarterlyRow.kind` は共有型上のoptional/internal metadataであり、aggregationが
差し替え境界で設定する。表示側はkindや値を再計算しない。
2005–2016 は `estimated_adjusted`、2017Q1以降の9公式費目は `official_adjusted`、Other residualは
`estimated_adjusted` とし、入力不備または計算不能は `unavailable`、unavailable の `value` は必ず `null` とする。
Plan40 の rolling/leave-one-out (LOO) evidence は、同じ実行で検証済みの nominal B/A
入力snapshotから算出し、canonical evidence schema と当該snapshotのinput fingerprintに
結び付ける。stale fingerprint、canonical schema不一致、必須evidenceの欠落または不正は
gate入力として受理せず、既存の共有publication gateを変更せずに評価する。ゲートが閉じている
場合は対象値を `unavailable` / `null` とし、invalidなevidenceや他のPlan40入力・anchor・月次検証の
阻害要因を迂回しない。全入力検証と必須evidenceが通り、共有gateが `accepted=true` のときは、
2005–2016の歴史推計値を `estimated_adjusted` として公開可能にする。
2017Q1以降は推計gateに
かかわらず公式四半期artifactを使い、9公式費目は `official_adjusted`、`official=true`、
`quarterlyDerived=false`、Other residualは `estimated_adjusted`、`official=false`、
`quarterlyDerived=true` とする。source validationが失敗しても歴史推計を保持し、2017Q1 unavailable markerを追加する。
chart/table/tooltip/CSV はこの measurement と同じ数値・metadata を使用し、
表示側で再計算しない。凡例は既存名目グラフと共通にする。

Phase 1 の runtime evidence は実データ入力から共有 projection、`ChartDataContract`、tooltip、
data table、CSV の契約境界を検証する。Recharts の実ブラウザ描画そのものはこのテストの対象外であり、
チャート側は `ChartDataContract` の key/status/reason 属性を比較する。

入力契約の判定結果は `valid`、`status`、`reasonCodes`、診断、対象年、10入力カテゴリ、
検証済み `normalizedBaseYear` を持つ。年次アンカーが invalid の場合も公開 API の
既存 result 形状を維持し、対象10カテゴリの値だけを null にする。

### Component Tree

`Plan39 nominal B/A + 000040499070 historical loader` → `historical profile validator` →
`2005–2016 Plan39-v2 estimate adapter` +
`000040499087 Excel build artifact (normalized quarterly CSV + metadata) loader and validator` →
`official-quarterly row mapper (9 source categories + derived Other; dedicated kind)` →
`existing nominal series registry` → `CpiChart` / nominal graph →
shared tooltip・data table・CSV projection。

Plan40 の年次アンカー入力は `validateCtiAdjustedV2Plan40Inputs` で、2005–2017 の対象年、
10入力カテゴリ、有限かつ正の名目値、nominal B/A の source/artifact metadata、`adoptedRange` が
Plan40対象年と実データ行および `rawRange` に整合することを先に検証する。
検証失敗は既存の `unavailable` / reason 経路へ渡し、四半期表示層で別系列、0補完、補間を
選択しない。
Plan39 の実 artifact/runtime は `buildCtiAdjustedV2Estimate` の typed `contract: "plan39"`
を明示して既存の nominal B/A 契約を使用し、Plan40 の対象年・metadata 厳格検証を適用しない。
Plan40 runtime evidence は `contract: "plan40"` を明示するため、両契約の検証結果を
混同しない。指定がない既存 builder 呼び出しは後方互換の Plan39 契約として扱う。
Plan40 の必須 rolling/LOO evidence は、Plan40 input validation を通過した同一の nominal B/A
snapshotから生成する。evidence recordにはcanonical schema識別子とsnapshotのinput fingerprintを
記録し、evidenceのfingerprintが実行中snapshotと一致し、schema・期間・必須diagnosticが有効な場合のみ、
そのevidenceを既存の共有publication gateへ渡す。evidence不正・不一致、または別の必須Plan40検証が
失敗した場合はfail-closedとし、古いpass evidenceやPlan39/実質入力の判定を再利用しない。

### Requirements

- **WHEN** the production nominal stacked chart renders real data rows, **THEN**
  its DOM contract contains all ten `CTIミクロ調整系列（費目）` public expense
  keys with finite numeric values, `status=available`, and series type `official_adjusted` or
  `estimated_adjusted`, and the sum of those categories for every row is within
  the inclusive range 50–150. The Browser Mode command returns every hidden
  contract row; after validating that every row has a `YYYYQn` DOM `data-period`,
  the test targets rows whose period is 2005Q1 or later, beginning at 2005Q1 and
  continuing through the last contract period. Period alone selects target rows;
  the 2005–2016 Plan39 estimated stack is included, and missing metadata,
  null/non-finite values, or unavailable status are failures. Only the
  legacy/support-only 1994–2004 rows are outside this check. The test verifies
  uniqueness and quarterly continuity and confirms each category's Recharts bar
  and at least one visible rectangle are rendered.
- **WHEN** 2005–2016の既存名目歴史推計の対象月が一意で有限である、
  **THEN** 既存の名目B/A接続推計と名目月次profileの式・値を維持する。
- **WHEN** SharedPlan40の年次・月次・四半期値を生成する、**THEN** Plan39世帯人数構成候補や
  legacy unharmonized weight（2011年linear-share interpolationを含む）、2017/2018教育安定性診断のsetai-n特別集計weight、
  または2018様式改正年の世帯人数プロフィールを適用して既存推計、季節profile、四半期値を補正または再スケールしない。
- **WHEN** 2005–2016歴史推計の対象月が欠損、重複、非有限、または3か月未満である、**THEN**
  その四半期の全10カテゴリを一括して `value=null`、`status=unavailable`、非空の
  機械可読 `reason` とし、不完全なstackを表示せず、補間、0補完、重複マージ、
  別系列フォールバックを行わない。
- **WHEN** 年次meanに使う2005–2016の対象年の月次入力に1件でも重複月がある、
  **THEN** その対象年の全Plan40四半期行・全10カテゴリを同じ
  `duplicate_month`、`value=null`、`status=unavailable` とし、重複が存在しない別四半期を
  正常値として公開しない。この判定は公式四半期source（2017Q1以降）には適用しない。
- **WHEN** `cti-distribution-adjusted-000040499087.xlsx` の `総・四(原)` に2017Q1以降の完全な
  名目四半期値がある、**THEN** 主要9費目の公式原数値を使い、Otherを公式総合−主要9費目の
  derived residualとして計算する。月次平均、年次Aアンカー、または別CTI入力で再計算・置換しない。
- **WHEN** 公式四半期sourceの対象期、費目系列または名目原数値が欠落・重複・非有限である、
  **THEN** 2005–2016年推計を保持し、2017Q1に `official_quarterly_source_unavailable_latest_period_unknown`
  reasonの `unavailable` / `value=null` markerを公開する。グラフ注記、tooltip、表、CSVへreasonを伝播し、
  2017Q1以降の値がなく最新対象期も不明であることを示す。月次profileや推計値へfallbackしない。
- **WHEN** 公式四半期normalized CSV、sidecar metadata、manifest entryまたはsource/artifact hash pairが
  欠落・不一致である、**THEN** 2005–2016の歴史推計は保持し、2017Q1に
  `value=null`、`status=unavailable`、reason `official_quarterly_source_unavailable_latest_period_unknown`
  のmarkerを公開する。UIは2017Q1以降の公式値がunavailableで最新対象期が不明と伝え、
  月次値、推計値、legacy CTIへfallbackしない。
- **WHEN** 2005–2016の年次契約が有効で対象月だけが不備である、**THEN** 月次 failure matrix の
  `insufficient_months` または `duplicate_month` などを reason とし、年次アンカー不備の
  reason に置き換えない。**WHEN** Plan40 の入力契約自体が不備である、**THEN** 別ケースとして
  全10カテゴリを同一の機械可読年次契約 reason、`value=null`、`status=unavailable` とする。
- **WHEN** nominal B/A、費目別β、またはOtherの年次anchorが欠損・重複・不正である、
  **THEN** その対象四半期の全10カテゴリを一括fail-closedにし、不完全なstackを表示しない。
- **WHEN** 2005Q1–2016Q4を表示する、**THEN** 月次から派生した名目推計であることを
  `quarterlyDerived=true`、`annualAnchorType=estimated`、metadata、noteに示す。
- **WHEN** 2017Q1以降の完全な公式四半期値を表示する、**THEN** `frequency=quarterly`,
  `aggregation=official_quarterly_original_value`, `official=true`, `annualAnchorType=official`,
  `quarterlyDerived=false`、専用の `kind=plan40-official-quarterly` を9費目の公式観測に記録する。
  Other residualは同じrow kindを使うが、`derived_quarterly_residual_from_official_nominal_total_minus_nine_categories`、
  `seriesType=estimated_adjusted`、`official=false`、`quarterlyDerived=true` とし、10費目の合計を公式総合に一致させる。
- **WHEN** Plan39-v2 の名目歴史推計を計算する、**THEN** B/Aの名目列を使い、実質列、
  実質のみのL、およびL由来Dを推計入力にせず、既存の名目B/A接続による2005–2016推計と
  Other専用導出を維持する。2017年Aアンカーは歴史推計の接続に使い、公式四半期値の代替にしない。
- **WHEN** 2005–2016の名目推計を作る、**THEN** 実質Lから導く長期世帯構成補正を
  適用せず、名目Bを名目A/Bの2017重複年で接続する。
- **WHEN** 名目グラフを描画する、**THEN** 2005–2016は既存の推計10カテゴリ、2017Q1以降は
  `総・四(原)` の9公式名目四半期原数値と総合−主要9費目のOther residualを積み上げる。
- **WHEN** 名目グラフを描画する、**THEN** Plan39専用年次セクションを表示せず、
  既存名目グラフの共通凡例とregistryへ統合する。
- **WHEN** 2016Q4から2017Q1へ遷移する、**THEN** 既存歴史推計から公式調整済み四半期原数値への
  入力切替を注記で明示する。
- **WHEN** chart、tooltip、data table、CSVの同一行を出力する、**THEN**
  measurement metadata（source、unit、frequency、aggregation、status、reason、
  `seriesType`、`official`、`annualAnchorType`、`quarterlyDerived`、note）と数値が
  一致し、推計／公式の状態も全て同じである。
- **WHEN** 推計値、公式値、または unavailable 値を表示する、**THEN** 注記、tooltip、
  表、CSVで同一の状態を示し、unavailable の数値セルは空欄とする。
- **WHEN** 2005–2016の月次検証またはbottom-up必須入力/anchor検証が失敗する、**THEN**
  対象四半期の全10カテゴリを一括fail-closedにし、不完全なstackを表示せず、公式Aや
  別期間の既存CTIを推計値へ置換しない。
- **WHEN** Plan40 の nominal B/A 入力に 2005–2017 の対象年、10入力カテゴリ、source/artifact
  metadata のいずれかが欠落する、または値が非有限・非正値である、**THEN**
  年次アンカー契約を invalid とし、四半期計算層は対象期間の全10カテゴリを
  `value=null`、`status=unavailable`、非空の reason 付きで扱う。欠損年を別系列、0、補間で
  埋めない。失敗measurementも正常measurementと同じ `model=v2-bottom-up`、
  `estimateVersion=plan39-v2`、source、unit、frequency、aggregation、
  `annualAnchorType`、`quarterlyDerived` を保持する。
- **WHEN** Plan40 の `baseYear`、`adoptedRange`、または A の2025 anchor のいずれかが不備である、
  **THEN** 対象四半期の全10カテゴリを同一の年次契約 reason で
  `value=null`、`status=unavailable` とし、カテゴリごとに正常値や別の failure reason を混在させない。
- **WHEN** Plan39 の既存 artifact/runtime publication gate を評価する、**THEN** `contract: "plan39"`
  の通常検証と publication gate を維持し、Plan40 の厳格な対象年検証を Plan39 の正常契約へ
  適用しない。
- **WHEN** Plan40 の必須 rolling/LOO evidence を生成する、**THEN** Plan40 input validation を通過した
  同一の nominal B/A input snapshotから計算し、canonical evidence schemaとsnapshotのinput fingerprintを
  evidenceへ記録して既存の共有publication gateに渡す。別snapshot、旧real/Plan39 evidence、または
  fingerprint不一致のevidenceを代用しない。
- **WHEN** Plan40 rolling/LOO evidenceが欠落・不正・canonical schema不一致・input fingerprint不一致である、
  または別の必須Plan40 input、anchor、月次検証に失敗がある、**THEN** 共有publication gateを通過扱いにせず、
  対象値を既存の fail-closed `unavailable` / `value=null` 契約で扱う。
- **WHEN** Plan40 の全必須入力、anchor、月次検証およびrolling/LOO evidenceが有効で、共有publication gateが
  `accepted=true` を返す、**THEN** 2005–2016の歴史的費目値を `estimated_adjusted` として公開可能にし、
  公開範囲内の他の有効なPlan40費目値も欠損扱いにしない。
- **WHEN** nominal B/A の `adoptedRange` が Plan40対象年を包含しない、実データ行を包含しない、
  または `rawRange` の外側にある、**THEN** 同じ fail-closed reason体系で年次アンカー契約を
  invalid とし、対象measurementを `value=null`、`status=unavailable` とする。
- **WHEN** 実質のみのLの実データ行が欠損する、**THEN** 名目推計値と公式名目A年を
  unavailable にせず、Lの状態を名目計算から独立した監査情報として扱う。
- **WHEN** nominal A の metadata が `baseYear=2025` を宣言し、2025年の公式名目A総合アンカーが
  有限かつ正である、**THEN** Plan40 は 2025年基準化契約を満たすものとして扱い、
  四半期値を2025年四半期平均で再正規化しない。**WHEN** この不変条件を検証できない、
  **THEN** 契約は fail-closed となり、理由 `A:base_year_not_2025` または
  `A:missing_or_non_positive_2025_anchor` を返す。
- **WHEN** 2005–2016の年次アンカー検証に成功する、**THEN** 名目B/A接続推計から得る
  四半期値を `estimated_adjusted`／`annualAnchorType=estimated`／`quarterlyDerived=true` とする。
- **WHEN** 2017Q1以降の公式四半期原数値を公開する、**THEN** Excel sheet `総・四(原)` の
  9費目名目列をそのまま使用し、`official_adjusted`／`official=true`／`quarterlyDerived=false` とする。
  Otherは公式総合−主要9費目から計算し、`derived_quarterly_residual_from_official_nominal_total_minus_nine_categories`／
  `estimated_adjusted`／`official=false`／`quarterlyDerived=true` とする。年次Aアンカー、Tの月次平均、
  またはその他の系列から公式四半期値を再計算しない。
- **WHEN** 実 runtime の月次検証または Plan40 年次入力契約が失敗する、**THEN** 対象四半期の
  10費目すべてを同じ reason の `value=null`、`status=unavailable` とし、正常経路と同じ
  measurement 契約（source、unit、frequency、aggregation、seriesType、official、
  annualAnchorType、quarterlyDerived、model、estimateVersion、note）を保持する。
- **WHEN** unavailable measurement が公開 projection に渡される、**THEN** chart、tooltip、
  table、CSV は同じ registry/measurement の値と metadata を参照し、表示側で値や metadataを
  再計算しない。Plan40 の `baseYear`、`rawRange`、`adoptedRange` は対象年と整合する provenance
  として追跡可能である。
- **WHEN** 欠損、重複、非有限値、3か月未満、または anchor 不備を runtime 入力へ与える、
  **THEN** それぞれを fail-closed failure matrix として固定し、別系列、0補完、補間を行わない。
- **WHEN** Plan40 の `2017Q4` v2 行を公開する、**THEN** 10費目すべてを既存の名目四半期
  グラフへ同じ measurement 契約で渡し、専用年次セクションへ分岐しない。
- **WHEN** 公開期間が `2017Q1` に進む、**THEN** v2歴史推計から公式四半期Excel経路へ
  切り替え、公式sheetの名目原数値を使う。
- **WHEN** `projectQuarterlyPublicView()` が `legacy-cti` 行を受け取る、**THEN**
  年に関係なく既存22キーだけを投影し、v2 10キーを出力しない。
- **WHEN** `projectQuarterlyPublicView()` が `plan40-v2-cost-stack` 行を受け取る、
  **THEN** 年を推測せず、既存名目キーとregistry由来v2 10キーを投影する。
- **WHEN** `projectQuarterlyPublicView()` が `quarter` が1〜4の整数ではない行、または
  `label` が `${row.年}Q${row.quarter}` と一致しない行を受け取る、**THEN** その行を公開projection
  の結果から除外し、他の有効な四半期行は返す。正規データ生成と有効行の投影結果は変更しない。
- **WHEN** 2016Q4から2017Q1へ行を差し替える、**THEN** aggregationは歴史推計側へ
  `plan40-v2-cost-stack`、公式データ側へ専用の公式quarterly source kindを設定し、projectionは
  年だけから入力経路を再推定しない。
- **WHEN** 2017Q1以降の公式四半期measurementを公開する、**THEN** 9公式費目は `official=true`、
  `quarterlyDerived=false` とし、Other residualは `official=false`、`quarterlyDerived=true` とする。
  両者で元のsource mappingとderived formulaをmeasurement provenanceに保持する。
- **WHEN** Plan40 の同一行を chart、tooltip、data table、CSV に投影する、**THEN**
  数値と全 measurement metadata の状態を同一 registry から参照し、全 surface で parity を保つ。
- **WHEN** 同一の Plan40 公式四半期fixtureを各 surface adapter へ渡す、
  **THEN** registry の全10 v2カテゴリで key 集合、value、status、reason、source、unit、frequency、
  aggregation、seriesType、official、quarterlyDerived、note、model（9公式費目のofficial metadataとOtherの
  derived residual metadataの違いを含む）、
  estimateVersion、baseYear、rawRange、adoptedRange が measurement 基準と一致し、table の状態・理由・注記、
  tooltip payload/metadata、CSV の `key__status`、`key__reason`、
  `key__quarterlyDerived` 等も同じ値を示す。Recharts の実 DOM 描画はこの adapter-contract parity の対象外とする。
- **WHEN** 同じ fixture を unavailable にした場合、**THEN** 全10カテゴリを `value=null`、
  `status=unavailable`、同一の非空 reason とし、全 surface の数値セル／CSV 数値セルを空欄にする。
- **WHEN** legacy `2018Q1` fixture を同じ公開投影へ渡す、**THEN** v2 10キーとその metadata は
  chart、table、CSV のいずれにも出力しない。
- **WHEN** Plan40 の通常表示経路を描画する、**THEN** `CtiAdjustedSeriesSection` は
  表示せず、Plan39 の年次 measurement 契約、loader、projection、旧契約テストは存続させる。

## SharedPlan 41: 正式調整済みCTIへの名目四半期接続

Plan41 は Plan39 の年次原本・年次契約と2005–2016年の既存名目推計を保持し、
2017Q1以降の表示値を公式調整済み名目四半期原数値へ接続する。
本節は同じ期間を扱うPlan40の旧入力source・旧季節比式に優先する。2005–2016年の年次値は
nominal Bを2017年のnominal A/B重複年で接続して作り、real-only Lおよびそこから導くDの
長期世帯構成補正は適用しない。2017年の公式分布調整済みnominal Aアンカーは保持する。

### Data Sources / Data Flow

Plan39-v2 の名目年次アンカー H（2005–2016 は nominal B を nominal A/B の2017重複年で
接続した推計値、接続点は公式分布調整済み nominal A の2017年値）と、歴史四半期推計に使う
名目 T/M を入力とする。Tは選択済み `loadCtiDataInternal` の `CpiData[]`（`data/source/cti_data2025.csv`、
`statInfId=000040499069`、2025年基準、総世帯、2017年12か月を含む）、Mは
`statInfId=000040499070`（二人以上世帯、2005–2016）の`消費支出（名目）`系列である。
Tの2017年平均は2005–2016の既存接続係数を維持するためだけに用い、2017Q1以降の公開値には使わない。
2017Q1以降は `data/source/cti-distribution-adjusted-000040499087.xlsx` sheet `総・四(原)` の
公式2025年基準・総世帯・調整系列（分布調整値）・原数値の名目四半期列を使う。主要9費目は
公式値、Otherは公式総合−主要9費目のderived residualとする。
runtimeではこの一次sourceからbuild生成された `data/source/cti_data2025_distribution_adjusted_quarterly.csv`
と同名 `.metadata.json` sidecarを読み、workbook relative path/filename・sheet・統計表ID・系列metadata・
Excel source columnからcanonical category/public seriesへのmapping、`sourceSha256` と `csvSha256` を検証する。
CSV/sidecarはmanifest、bootstrap、rollback snapshot、artifact pair validationの対象である。
欠損・hash不一致時も2005–2016の歴史推計は保持し、2017Q1に
`official_quarterly_source_unavailable_latest_period_unknown` reasonのunavailable markerを出して、
2017Q1以降の値と最新対象期が不明である旨を表す。
年次推計ではreal-only LとL由来Dを使わず、歴史推計に長期世帯構成補正を適用しない。
A/Bの実質列も選択しない。

公式四半期artifactの完全な期・費目・名目列のみを使用し、最終の公開期は入力artifactの
最新完全四半期までとする。

2005–2016の既存推計では各費目の `s_i = mean(T_i,2017) / H_i,2017` を保持し、
`Q_i,y,q = s_i H_i,y × mean(M_i,y,q) / mean(M_i,y,1..12)` をそのまま用いる。
`H_i,2017` は nominal A/B接続の公式分布調整済み名目Aアンカーである。この計算の2017年T平均は
歴史推計の接続係数にのみ使われ、公開する2017Q1以降の値は公式四半期表から直接取得する。
2017Q1以降は `Q_i,y,q = official_sheet_nominal_original_value_i,y,q` とし、月次四半期平均へ変換しない。
2016→2017の季節source切替と2016Q4/2017Q1の公開source境界はprovenanceに記録し、値連続性を推定しない。

2005–2016年の歴史推計では主要9費目にHを対応させ、OtherはPlan39の既存 `result.other` 推計値を保持する。
歴史的な接続計算でHの2017 Otherを必要とする箇所では、Aの公式分布調整済み名目総合から主要9費目を
引いた残差（`17.3`）を使う。一方、T/Mの月次Otherは各月の総合から主要9費目を引いた残差とする。
2017Q1以降の公開Otherも公式四半期総合から主要9費目を差し引いて計算し、独立した公式
series 11は使わない。10費目の合計は公式総合と一致させる。`quarterlyAggregation` から既存の公開projection、グラフ、
tooltip、データ表、CSVまで同一のmeasurementとprovenanceを渡す。T/Mの月次Other残差は総合から主要9費目を直接減算し、
丸めやゼロ下限を適用せず恒等式を保つ。ただしR4に従い、負または非正の季節性入力は表示値として通さず、
measurementを`status=unavailable`、`reason=invalid_seasonal_input`としてfail-closedにする。負残差の検証では
入力の`total−Σmajor`恒等式と、このunavailable理由を検証し、負のquarter outputは期待しない。非enumerableな`ctiMetadata`は
選択済みTから明示引数として四半期aggregationへ渡し、そこからUI・CSVの公開projectionへ伝播する。

### Data Model

2005–2016の歴史推計measurementには既存の `SeriesMeasurement` / `SeriesDescriptor` のsource、
接続係数、季節source、`annualAnchorType=estimated`、`official=false`、`quarterlyDerived=true` を保持する。
2017Q1以降の9公式measurementはExcel artifact、workbook relative path/filename、sheet `総・四(原)`、
statInfId `000040499087`、quarter、名目列、source/artifact hash、Excel column-to-canonical mappingを
provenanceへ記録し、`official=true`、`frequency=quarterly`、
`aggregation=official_quarterly_original_value`、`annualAnchorType=official`、`quarterlyDerived=false` とする。
Other measurementは公式総合から主要9費目を差し引いたderived residualであり、
`aggregation=derived_quarterly_residual_from_official_nominal_total_minus_nine_categories`、
`seriesType=estimated_adjusted`、`official=false`、`quarterlyDerived=true` を記録する。
公式rowには専用の `kind=plan40-official-quarterly` を付与する。公式四半期値はA annual anchorや
T monthly bridgeから再計算しない。公式source欠損時は2005–2016年値を維持しつつ2017Q1 unavailable markerと
機械可読reasonを公開する。両経路ともchart、tooltip、
data table、CSVは同一measurementを参照し、表示側で値を再計算しない。

### Component Tree

`Plan39 nominal B/A + selected T historical bridge` + `historical seasonal M loader` →
Plan39 H と費目対応の検証 → `2005–2016 s_i`／四半期推計 builder +
`000040499087 Excel-derived normalized CSV/metadata official nominal-quarter loader` →
`server/lib/view-models/quarterlyAggregation.ts`（`aggregation=plan41_bridge`）→
`src/lib/quarterlyPublicProjection.ts` → 名目グラフ、tooltip、データ表、CSV。

### Requirements

- **WHEN** nominal B/Aから作るH、選択済みnominal Tの2017年12か月、nominal Mの対象年12か月、および10費目の対応が検証済みである、
  **THEN** 費目ごとに固定 `s_i` を一度だけ計算し、2005–2016の既存歴史推計へ適用する。
- **WHEN** 2005–2016を四半期化する、**THEN** nominal Mの同年12か月平均を季節比分母に用い、年次平均は
  `s_i H_i,y` と一致させる。Hはnominal B/A接続値で、real-only L由来の長期世帯構成補正を含まない。
- Mの名目月次プロファイルは四半期内の形状に使い、Mを2017年の水準または季節性に使わない。
- **WHEN** `s_i` を計算する、**THEN** `mean(T_i,2017) / H_i,2017` を使い、Hの2017値は
  公式分布調整済み名目A/B接続アンカーである。この係数は2005–2016歴史推計の維持にのみ使う。
- **WHEN** 2017Q1以降を表示する、**THEN** Excel `総・四(原)` の公式調整済み名目四半期原数値を
  直接使い、T月次平均や `s_i` で再計算しない。
- **WHEN** 歴史推計の10費目と公式四半期系列を構築する、**THEN** 2005–2016年HのOtherは既存
  `result.other` 推計値、過去の接続計算で必要な2017年HのOtherは公式分布調整済み名目A総合−主要9費目、
  T/M月次のOtherは各々の総合−主要9費目とする。2017Q1以降の公開Otherは公式四半期総合から
  主要9費目を差し引いたderived residualとし、10費目の合計を公式総合に一致させる。
  歴史推計の総合は10費目の合算とし、残差には丸めやゼロ下限を
  適用せず恒等式を保つ。ただし負または非正の季節性入力は`invalid_seasonal_input`でfail-closedにし、
  負のquarter outputを表示しない。独立した総合係数やseries 11を生成・使用しない。
- **WHEN** 2005–2016の補正値を投影する、**THEN** 元source、先source、seasonal source、係数、基準年、単位、
  世帯範囲、適用期間をprovenanceへ記録し、四半期measurementは `official=false` とする。
- **WHEN** 2017Q1以降の公式measurementを投影する、**THEN** Excel filename, sheet, statInfId,
  workbook relative path, period, nominal source column, original-value type, household scope, base year,
  source/artifact hashes, and source-column-to-canonical mapping are recorded in measurement provenance.
  The 9 official expenses have `official=true`, `annualAnchorType=official`, `quarterlyDerived=false`;
  Other has aggregation `derived_quarterly_residual_from_official_nominal_total_minus_nine_categories`,
  `seriesType=estimated_adjusted`, `official=false`, `quarterlyDerived=true`. The row kind is
  `plan40-official-quarterly`.
- **WHEN** official quarterly source CSV, sidecar, manifest entry, or source/artifact hash pair is missing or invalid,
  **THEN** historical estimates for 2005–2016 remain intact and a 2017Q1 marker is emitted with
  `value=null`, `status=unavailable`, and reason `official_quarterly_source_unavailable_latest_period_unknown`.
  The chart, tooltip, table, and CSV explain that 2017Q1 onward is unavailable and the latest target period is unknown;
  no monthly, estimated, or legacy fallback is allowed.
- **WHEN** T/M/Hまたは公式四半期sheetのmetadata、費目対応、単位、基準年、頻度、期間の完全性、値の有限性・正値を
  検証できない、**THEN** 対象費目または対象期間を `value=null`、`status=unavailable` とし、機械可読な
  reasonを全projectionへ伝播する。0補完、補間、重複マージ、別loader選択、月次値や旧supportへのfallbackをしない。
- **WHEN** 歴史推計用runtime Tの検証に失敗する、**THEN** 欠損月は `runtime_t_insufficient_months`、重複月は
  `duplicate_month`、値の不正は `runtime_t_invalid`、metadata不一致は
  `runtime_t_metadata_mismatch` として対象期間をfail-closedにする。Hの年次アンカー不正は
  `v2_annual_anchor_unavailable` とする。
- **WHEN** 選択済みTへ付与された `ctiMetadata` を伝播する、**THEN** 同じTのsourceId、statInfId、
  householdScope、seasonalitySourceId、targetSourceId、targetHouseholdScope、bridgeAppliedRange、
  bridgeCoefficientをchart、tooltip、data table、CSVへ保持し、loaderで別sourceを再選択しない。
- **WHEN** 2016Q4と2017Q1を比較する、**THEN** 2017Q1の公式sourceへの切替をprovenanceで明示し、
  Mから公式四半期sourceへの境界で値連続性は要求しない。
- **WHEN** chart、tooltip、data table、CSVへ同じ行を投影する、**THEN** 数値、状態、理由、出所、
  `official`、季節source、係数、注記が同一measurementと一致する。

### Non-goals

- 2005–2016年の既存名目推計や、2017年の公式分布調整済みnominal A接続アンカーを再計算しない。
- 2017Q1以降の公開値を月次値や年次アンカーから再計算しない。
- real-only L または L 由来Dを名目推計に加えず、2005–2016年推計へ長期世帯構成補正を適用しない。
- TとMの世帯範囲差や2016→2017の季節source切替から母集団差・因果効果を推定しない。

### Plan41 implementation checkpoint（2026-09-23）

このcheckpointの数値は nominal B/AおよびL/D除外への切替前に取得した歴史的証跡であり、
現行nominal年次推計の検証として扱わない。選択済みTへの `ctiMetadata` 付与・注入、Tの2017年水準／季節性、Mの2005–2016年季節比、
Other残差、fail-closed理由、および `plan41_bridge` のmeasurement伝播を実装へ反映した。
実データ検証では年次130件の最大誤差が `7.1e-15`、2017年四半期40値がTと一致し、
2018年以降34四半期が深い比較で不変だった。2017Q4の総合は旧値109.8598505から
T raw 98.2431333へ接続され、2018Q1はraw 95.5640667（公開値95.56）だった。
これは実装チェックポイントの証拠であり、JEV通常checkpointの合格判定を意味しない。
関連テスト、type-check、lintの最終結果とJEV再判定はOrchestratorの検証記録に従う。

### Plan41 最終検証記録（2026-09-23）

この最終検証はnominal B/A切替前の実装に対する記録である。現行nominal推計のテスト・
型検査・lint・JEV再判定は未実施であり、この証跡から現行推計の合格を推論しない。

公開面の実runtime provenanceは証跡JSONの29/29を確認した。最終実測の`pnpm test`は78 files、
750 passed、4 skippedであり、hookのfocused runはsandbox外で2 files / 32 passedだった。`pnpm test`には
hookテストも含まれるため、hookの別実行は補助確認として記録する。type-check、lint、buildはいずれもexit 0だった。
旧記録のfocused tests 85/131は対象コマンドと実行ログがなく再現不能なため、確定値から除外する。これらは
Plan41の実装・公開面検証の証拠であり、JEV判定の代替とは扱わない。

JEV再判定は親エージェントが結果を確定して追記する。再判定ファイルは
`<JEV再判定ファイルのパス>`、最終choiceは`<未確定：親が追記>`と記録し、ここでは最終choiceを断定しない。
現状の既存判定を併記する必要がある場合は`valid_but_limited`として保持する。

### Plan41 JEV v2最終再判定

訂正版JEV v2を`.tmp/plan41-jev-final-revalidated-v2-result.json`へ記録した歴史的証跡では、判定は
`choice=valid_but_limited`、`confidence=0.56`、確率は`valid_but_limited=0.67`、
`valid_as_defined=0.32`、`not_valid=0.01`、`indeterminate=0`。公開証拠は
`hasBridgeCoefficient=true`、29/29だった。これは旧JEV v2の結果であり、今回の最終実測（78 files、750 passed、4 skipped、hook 2 files / 32 passed）と混同しない。follow-upは`reason=constraint_conflict`、
`choice=clarified`、`confidence=0.70`、確率は`clarified=0.77`、`needs_fix=0.19`、
`needs_evidence=0.03`、`indeterminate=0.01`である。CSV列偽陰性は修正済みで、残る限定は
M→T seasonal source切替等の既知データ契約である。これは完了報告であり、テストは親が実行済みである。

## SharedPlan 40 続編: ユーザー視点の最小操作評価（履歴・後続記録により更新済み）

> **履歴上の中間評価。** 以下の「2005–2017 が `unavailable`/`null`」という記述は、修正前の観測結果を保存したものであり、後続の「完了時のユーザー視点検証」および「実装完了チェックポイント」により superseded されている。現在の判定には使用しない。

ただし、後続のPlan40完了・検証記録も今回の nominal B/A・L/D除外の改訂前に作られた履歴である。
旧Plan40のL必須入力契約と旧real-input publication gateは現行名目契約に適用せず、名目版の受入証拠として再利用しない。

Plan40 の続編評価では、実装内部の fixture や adapter ではなく、利用者が画面で行う最小限の操作を判定根拠とする。評価時点では、名目消費を選択してデータ表を展開し、CSVをダウンロードした。その結果、2005–2017 の全行は数値を持たず `unavailable`/`null` で、画面上の文言は「利用できません」だった。一方、2018Q1以降は数値を表示し、データ表の展開、CSVダウンロード、期間ごとの出所注記は操作できた。この観測は、2005Q1–2017Q4の表示可能な値と欠損理由の利用者向け説明を満たした証拠にはならない。

### User-perspective acceptance criteria

- **WHEN** 利用者が名目消費を開き、2005Q1–2017Q4を確認する、**THEN** 各対象行は数値と月次派生／年次アンカーの注記を表示し、全期間が一律に `unavailable`/`null` にならない。
- **WHEN** 対象行が本当に利用不能である、**THEN** グラフ、tooltip、データ表、CSVで空値と同じ機械可読理由を示し、画面文言「利用できません」だけで原因を隠さない。
- **WHEN** 利用者が2017Q4から2018Q1へ移動する、**THEN** 2017Q4以前のPlan40経路と2018Q1以降の既存CTI経路の切替、およびそれぞれの出所が画面上で判別できる。
- **WHEN** 利用者がデータ表を展開してCSVをダウンロードする、**THEN** 画面の値、空値、状態、理由、出所がCSVにも同じ行単位で反映される。

### Minimum re-evaluation operation

同じ環境で名目消費を選択し、2005Q1、2017Q4、2018Q1の表示を順に確認する。次にデータ表を展開し、同じ3期間の値・状態・理由・出所を確認してCSVを1回ダウンロードする。2005Q1–2017Q4に数値があり、2018Q1で既存経路へ切り替わること、また画面とCSVのmetadataが一致することを記録する。対象期間の全行が `unavailable`/`null` のまま、または原因が「利用できません」だけの場合は、操作可能であっても受入不可と判定する。

### Current evaluation result（修正前の履歴）

最小操作で確認できたのは、2018Q1以降の数値表示、出所注記、データ表展開、CSV出力である。2005–2017は全行 `unavailable`/`null` で画面文言も「利用できません」だったため、2005Q1–2017Q4の値表示と原因説明に関する受入条件は未達である。これはユーザー視点の評価結果であり、原因調査や実装完了を意味しない。

### 続編で確認した実装上の阻害要因と最小修正方針（修正前の履歴）

診断では、`server/lib/data-loader/ctiAdjusted.ts` が常に `contract: "plan39"` を使用しており、Plan40 の対象年・metadata検証結果を生成していない。また、Plan39 の evidence gate が `accepted=false` のため、`quarterlyAggregation` の2005–2016行が `unavailable` になっている。これが画面で2005–2017を数値化できない現状の実装上の阻害要因である。

最小修正方針は、既存Plan39契約を変更せず、Plan40専用のロード経路を追加して `contract: "plan40"` と対象年・10カテゴリ・source/artifact metadataの厳格な検証を通すことである。Plan40経路では、検証成功時に2005–2016のbottom-up値と2017の公式Aアンカーから月次派生四半期値を生成し、失敗時は対象10カテゴリを同一reasonの `value=null`/`unavailable` とする。四半期層でPlan39 gateを迂回して値を補完すること、既存2018Q1以降の経路を変更することは受入条件に含めない。

### Plan40 runtime 検証の続編（修正前の中間記録）

Plan40 loader の接続修正は完了した。`contract: "plan40"` のロード経路は Plan39 の analysis/evidence gate を適用せず、builder の Plan40 input validation と annual/publication 状態を保持する。Plan39 の既存経路と既定呼び出しは維持する。

実 artifact の Plan40 契約検証はなお invalid であり、`A:raw_range_excludes_target:2005`、`A:adopted_range_excludes_target:2005..2016`、`L:ignored_category`、`L:extra_category` 等を確認した。fail-closed のため、ブラウザ上の2005–2017は引き続き `null` / `unavailable` である。したがって loader 接続修正は必要条件を満たしたが、表示可能な Plan40 数値の完了条件は未達である。

次の完了条件は、Plan40 用 B/A/L artifact を2005–2017、10カテゴリ、source/artifact metadata 契約に整備し、Plan40 関連テスト、type-check、対象2ファイルの oxlint、ブラウザ最小操作、JEVレビューを再実施して通過させることである。Plan39 既存経路は維持する。

検証記録では、Plan40 関連41件、type-check、対象2ファイルの oxlint は通過した。全体 lint は `jev-request.mjs` の既存 `no-unsafe-finally` により失敗した。この既存失敗は Plan40 runtime の fail-closed 検証結果と別に記録する。

### Plan40 実装完了チェックポイント（旧Plan40履歴: nominal B/A・L/D改訂前、現行証拠ではない）

以下は当時のPlan40実装に対する完了評価である。当時は受入済みと記録したが、その実装は後のnominal B/A・L/D除外改訂より前の契約に基づくため、現在の仕様・データ経路の完了証拠としては扱わない。

続編JEVの中間 follow-up は `choice=needs_fix`、`confidence=0.47`（`needs_fix=0.60`、
`clarified=0.34`、`needs_evidence=0.06`）だった。これは実装前の中間判定として保持し、完了判定とは扱わない。

- runtime は `loadCtiAdjustedV2Estimate({ contract: "plan40" })` を明示し、既存の
  `contract: "plan39"` と publication gate を維持する。
- Plan40 の A/B/L 検証範囲を役割別に整合させた（A: 2017–2025、B: 2005–2025、L: 2005–2017）。
  Other は series 11 の直接値を互換入力として扱い、production の年次値は total から
  series 2–10 を差し引いて導出する。
- L の `missing_required_year` を入力契約違反として検証失敗にし、対象値を
  fail-closed で公開しないことを回帰確認した。実 artifact を使う integration regression test も追加した。
- v2 registry を chart・tooltip・data table・CSV 経路へ統合した。legacy 22キー契約は維持し、
  Plan40 行にだけ v2 10費目を追加する。

Plan40 targeted tests 43件（実 artifact integration regression test を含む）、`type-check`、対象変更の
oxlint、`git diff --check` は通過した。
全体 lint は既存 `skills/jev-review/scripts/jev-request.mjs` の `no-unsafe-finally` で失敗した。

### 旧Plan40完了時のユーザー視点検証（nominal B/A・L/D改訂前の履歴、現行証拠ではない）

以下は当時の受入操作と結果の記録であり、当時のPlan40受入条件を満たしたと評価した。現行の公式四半期名目値を直接使う契約に対する検証ではない。

名目消費を選択し、データ表を展開し、CSVを1回ダウンロードする最小操作を再実施した。
画面に「利用できません」の表示はなく、2005Q1 と 2017Q4 は v2 数値、2018Q1 は既存
legacy CTI 数値を確認した。CSV は87行で、同じ3期間と対応する metadata を含み、画面とCSVの
値・状態・出所が一致した。ユーザー視点の最小操作に関するPlan40受入条件を満たす。

### 旧Plan40実装後JEVレビュー（nominal B/A・L/D改訂前の履歴、現行判定ではない）

以下のJEV評価は当時の実装に対する履歴であり、現行の名目専用・公式四半期値経路を審査した結果ではない。

実装後の通常の初回判定は `choice=valid_but_limited`、`confidence=0.39` だった。
確率は `valid_but_limited=0.54`、`valid_as_defined=0.44`、`not_valid=0.01`、
`indeterminate=0.01`。follow-up は `choice=clarified`、`confidence=0.44` で、
確率は `clarified=0.58`、`needs_evidence=0.35`、`needs_fix=0.06`、
`indeterminate=0.01` だった。いずれの raw response にも `evidence` と `limitations` の
明示はなかったため、JEV判定にはこの記録上の制約がある。受入の根拠は、43件の targeted
tests、type-check、対象oxlint、git diff check、およびブラウザとCSVのユーザー視点証拠とする。

## 旧Plan40 完了判定記録（nominal B/A・L/D改訂前の履歴、現行判定ではない）

この完了判定はnominal B/A・L/D除外改訂前のPlan40契約に対する当時の記録であり、当時は完了と評価した。そこで確認したLの `missing_required_year`、最小操作、v2数値およびlegacy CTIとの対応は旧実装の証拠である。現行契約の判定には再利用しない。
当時の最後の実装後JEVレビューはHTTP成功し、`choice=valid_as_defined`、`confidence=0.50`、確率は `valid_as_defined=0.63`、`valid_but_limited=0.37`、`not_valid=0`、`indeterminate=0` だった。`rawResponse` に `evidence` と `limitations` の明示はなかったため、この制約を記録する。この結果は旧Plan40履歴内で直前の `valid_but_limited` / `clarified` 判定をsupersedeしたものに限られ、現行nominal契約のJEV判定ではない。既存のテスト・型チェック・lintの代替とも扱わない。

## 続編: 実装完了チェックポイント

前回のユーザー視点評価で判明した境界表示と費目色の課題に対し、公開表示契約を次のように固定する。既存のPlan39契約、legacy 22キー、過去の評価履歴は変更しない。

### 境界行の共通metadata契約

- **WHEN** 2018Q1以降の行に旧Plan40 v2費目キーが存在せず、表またはCSVが宣言済みv2 descriptorを解決する、**THEN** 共通fallbackは `value=null`、`status=unavailable`、`reason=outside_period`、`seriesType=unavailable`、空の `source` を返す。
- **WHEN** 同じ旧Plan40 v2境界行をデータ表へ表示する、**THEN** 数値セルは空欄相当で、利用者向け表示は「対象期間外」とし、状態と理由は `unavailable` / `outside_period` と表示する。
- **WHEN** 同じ旧Plan40 v2境界行をCSVへ出力する、**THEN** メイン数値列とmetadata value列は空欄で、系列ごとの `__status=unavailable`、`__reason=outside_period`、`__source=` を出力する。
- **WHEN** legacy SUPPORT系列またはその他の非Plan40 descriptorに行measurementが存在しない、**THEN** 従来契約どおり `status=invalid`、`reason=unavailable`、`seriesType=unavailable`、空の `source` を出力し、行にあるlegacy数値はメインデータ列で保持する。
- **WHEN** 同じ行を表とCSVへ渡す、**THEN** 表とCSVは同じ数値空欄、status、reason、sourceを参照し、fallbackの実装を各surfaceで再定義しない。

### Plan40 v2費目色契約

- **WHEN** Plan40 v2の10費目キーを棒グラフまたは凡例へ描画する、**THEN** 費目名から共通color resolverで既存の費目パレットを引き、同じ費目のlegacy系列とv2系列は安定して同色になる。
- **WHEN** 利用者が費目凡例を確認する、**THEN** 凡例アイコンと棒のfillは同じresolver結果を使い、系列位置に依存した色ずれを起こさない。
- **WHEN** Plan40 v2の費目キーが既存の色定義にない、**THEN** 既存のcategory mappingに従って解決し、未解決時だけ既定色へfallbackする。

### 実装後の検証記録と未確定事項

今回の実装完了チェックポイントでは、targeted tests 49件、Plan40 runtime tests 40件、`type-check`、対象変更のoxlint、`git diff --check` を証拠として記録する。これらは既存のテスト・型チェック・lintの代替ではなく、今回の境界metadata parityと費目色契約を確認する証拠である。

追加証拠を反映したJEVの通常再判定は未実施であり、JEVは追加証拠後の再判定待ちとする。今回のユーザー視点評価では表とCSVの値・状態・出所を確認したが、tooltipの同一境界fallbackとのparityは未確認である。

### 実装完了チェックポイント補遺: tooltip境界parity

- **WHEN** 2018Q1以降のPlan40 v2費目キーについて、Rechartsのrow payloadに既存の
  `available` measurementや`source`が残っていても値がnull/undefinedである、**THEN** tooltipは
  表・CSVと同じ共通fallbackを優先し、`status=unavailable`、`reason=outside_period`、
  `seriesType=unavailable`、空の`source`、表示「対象期間外」を示す。
- **WHEN** Rechartsのrow payloadに`年月`または`label`が含まれない、**THEN** tooltipの
  props `label`（例: `2018Q1`）を期間判定に使い、2018Q1以降のPlan40 v2境界fallbackを
  適用する。
- **WHEN** 2005Q1–2017Q4のPlan40 v2数値行をtooltipへ渡す、**THEN** 既存row measurementを
  優先し、推計／公式区分、source、数値を境界fallbackで上書きしない。

tooltip fallback修正後の証拠は targeted tests 80件、runtime tests 29件、`type-check`、対象変更の
oxlint、`git diff --check`、および実DOM tooltipの10キーmetadata parityである。実DOMでは2018Q1の
10キーすべてが `unavailable / outside_period / 対象期間外 / source空` と一致し、Plan40 v2の10費目は
色が一意で、対応するlegacy費目と同色であることを確認した。

tooltipの全viewport・全interaction状態での網羅的な手動確認と、追加証拠を反映したJEV通常再判定は
未実施であり、引き続き未確定事項として記録する。

### 実装完了チェックポイント補遺: JEV再判定

追加証拠後のJEV再判定を `/tmp/plan40-continuation-jev-revalidation.json` に記録した。HTTPは成功し、
判定は `choice=valid_as_defined`、`confidence=0.33`、確率は
`valid_as_defined=0.49`、`valid_but_limited=0.49`、`not_valid=0.01`、`indeterminate=0.01` だった。
これにより、直前の「通常再判定未実施」「JEV再判定待ち」という記録は本補遺でsupersedeする。

今回の変更については、Plan40 v2境界のtable・CSV・tooltip parity、payloadに期間列がない場合のtooltip
label fallback、v2費目10色の一意性とlegacy同色を受入条件達成として完了と記録する。ただしJEVの
confidenceが低く、`valid_but_limited` と同率であるため、実DOMでの証拠範囲、console warningの確認、
全viewport・全interaction状態の手動確認が制約として残る。

全体lintは既存のLazyMount `prefer-const`で失敗しており、今回のPlan40変更に起因する失敗とは分離して
記録する。既存テスト、type-check、対象oxlint、runtime evidence、ユーザー操作証拠は引き続き完了判定の
根拠とし、JEVはそれらの代替とは扱わない。

### production最終証拠

`pnpm build` は成功し、production server `http://127.0.0.1:3102` でユーザー視点の最小操作を再確認した。
2005Q1・2017Q4はPlan40 v2数値、2018Q1は「対象期間外」となり、データ表の展開とCSV downloadも成功した。
ブラウザエラーは発生しなかった。

production tooltipは10行すべてで `status=unavailable`、`reason=outside_period`、表示「対象期間外」、
空の`source`を示した。Plan40 v2色は10色が一意で、対応するlegacy同費目10組は全て同色だった。
追加証拠後JEVの `valid_as_defined`（confidence `0.33`）は完了根拠として維持する。全体lintの既存
LazyMount `prefer-const`失敗は制約として残る。

### 既存問題の解消と最終検証

Plan40 続編で判明した既存問題を解消し、既存のPlan40受入条件および履歴を維持した。

- **WHEN** `LazyMount` の遅延描画実装をlintする、**THEN** 再代入されないローカル束縛は
  `const` として宣言され、`prefer-const` によるlintエラーを出さない。
- **WHEN** `XAxisEdgeTick` がRechartsから受け取ったtick propsをSVG要素へ渡す、**THEN**
  `verticalAnchor`、`tickFormatter` などRecharts内部用propsをDOMへ漏出さず、React console warningを
  発生させない。
- **WHEN** lint対象の設定・ローダー・コンポーネント・計算関数を検査する、**THEN** anonymous
  default export、未使用の分割代入、未使用の公開オプション引数を整理し、挙動と既存APIを保ったまま
  残存4 warningを解消する。
- **WHEN** リポジトリ全体の検証を実行する、**THEN** `pnpm lint` は0 error/0 warning、type-check、
  関連114 tests、production buildが成功する。
- **WHEN** production環境で利用者が名目消費を選択し、2005Q1・2017Q4・2018Q1を確認して表とCSVを
  操作する、**THEN** 3境界の値・状態・出所が一致し、console errorsは空配列である。
- **WHEN** productionでtooltipの10行を確認する、**THEN** 表・CSVと同じ10行のmetadata parityを
  示し、既存問題の解消後もPlan40 v2の境界fallbackおよび費目色契約を維持する。

最終検証では、`pnpm lint` が0 error/0 warning、type-check、関連114 tests、production buildが成功した。
productionの最小操作（表展開、CSVダウンロード、2005Q1・2017Q4・2018Q1の3境界確認）も成功し、
tooltip 10行のparityと `console errors=[]` を確認した。これにより、前項で制約として残していた
LazyMountのlint失敗およびproduction上のReact console warningを解消済みとして記録する。

### 最終JEVレビュー補遺

既存問題修正後の最終JEVレビューを `/tmp/jev-plan40-checkpoint-review.json` に記録した。判定は
`choice=valid_but_limited`、`confidence=0.8`、確率は `valid_but_limited=0.84`、
`indeterminate=0.13`、`not_valid=0.01`、`valid_as_defined=0.02` だった。

JEVは、全体lint 0 error/0 warning、React console warning解消、およびPlan40の既存証拠を受容可能と
評価し、追加の修正要求は出していない。一方、全viewport・全interaction状態の網羅的確認は未実施のため、
判定は限定付きである。この制約を残したまま、既存のPlan40受入条件、完了判定、検証履歴は維持する。

### 最終実装チェックポイント補遺: 操作契約と行単位の公開系列

- **WHEN** 利用者がPlan40 v2の費目凡例をクリックする、**THEN** 対応するlegacy名目キーとクリックされたv2キーを同時にhiddenへ反映し、表示中の棒と凡例の状態を一致させる。実質側は対応するlegacy実質キーを切り替える。
- **WHEN** モバイル利用者が棒を短くタップして停止する、**THEN** tooltipを表示したままにし、縦方向のスワイプとして判定された操作ではtooltipを閉じる。
- **WHEN** 範囲変更E2EがChartDataContractの系列セルを数える、**THEN** Plan40 v2系列が存在しない行を待機失敗にせず、その行に実在する数値セルだけを描画本数との比較対象にする。

## SharedPlan 47: 名目消費10費目のcanonical系列統合（現行優先仕様）

本節は名目消費の10費目公開契約について、Plan38/40/41および旧続編にある相反する記述に優先する。旧節の実装チェックポイントや検証記録は当時の履歴として保持するが、そこにある「Plan40を現行採用する」「世帯構成補正を適用しない」「旧名目キーとv2キーを同時に公開する」という記述は現行要件ではない。計画書に記載された実装前の観測・制約を実装済みの事実として扱わず、公開契約は以下のWHEN/THENによって定める。

### Data Sources

2005Q1–2016Q4は、Plan39のnominal B/A接続年次アンカーに既存の二人以上世帯割合（Pi）による費目別世帯構成補正を適用し、名目月次系列の季節形状で四半期へ配分した推定系列を使う。対象期間の年次値には無補正Plan40 baseを採用しない。2017Q1以降は統計表 `000040499087` の総世帯・2025年基準・「総・四(原)」にある公式調整済み名目四半期の9費目を使う。公式総合から9費目を差し引いた「その他の消費支出」は派生残差として扱い、公式観測費目とは区別する。

採用系列は期間ごと・canonical費目ごとに一つとする。Plan39の保存分析・manifest・B/A/L/Pi入力fingerprintおよび既存publication gateを照合し、Plan40由来の有用なsource metadata、coverage、base year、frequency等の検査はモデル選択と分離したinput-integrity gateとして保つ。入力の一致やgate状態を確認できないことを、保存結果の `accepted` 値だけで補わない。

### Data Flow

nominal B/A、Piおよび関連artifact/manifest → 入力metadata・範囲・hash・費目・単位・基準年・頻度検証 → Plan39補正年次アンカーと一致する分析証拠・publication gateの確認 → 2005–2016の季節配分済み推定、または2017Q1以降の公式四半期9費目と公式総合由来Other残差 → 期間別source selection → canonical 10費目の公開投影 → `CpiChart` / `SpendingBarChart`、tooltip、data table、CSV。

期間別のsource selectionは公開投影前に行い、チャート・表・tooltip・CSVへ同じ選択済み値とmeasurement provenanceを渡す。公開チャート・凡例・名目および実質消費tooltipは同じpresentation mappingを使い、凡例とtooltip項目を同じ表示順・ラベルで揃える。旧名目aliasや互換用v2名を同じ公開stackへ重ねず、aliasの値が有効・極端値・poison値のいずれであってもcanonical出力に影響させない。公式その他残差は公式totalとの整合用derived measurementとして由来を保持する。

### Data Model

公開名目行は `src/types/chart.ts` の `QuarterlyRow` と `SeriesMeasurement` / `SeriesDescriptor` を用い、費目ごとにcanonicalなseries key/descriptorを一つだけ持つ。source期間、値、status/reason、単位、基準年、頻度、集計方法、source、model、official/derived区分およびfingerprint由来のprovenanceをmeasurementに保持する。2005–2016のPlan39値は推定・非公式の四半期派生値、2017Q1以降の9費目は公式四半期観測値である。Otherは総合から9費目を差し引いた残差で、歴史推定と公式期間のどちらも独立した公式費目として扱わない。総合値は10番目のstack費目に含めない。

### Component Tree

Plan39 nominal B/A・Pi loaderとmanifest/evidence validation → `ctiAdjustedConnectionEstimateV2.ts` のPlan39年次アンカー → `server/lib/view-models/quarterlyAggregation.ts` の歴史季節配分および公式四半期loader・期間別選択 → `src/lib/quarterlyPublicProjection.ts` のcanonical名目投影 → `CpiChart` → `SpendingBarChart` / tooltip / data table / CSV。

### Requirements

- **WHEN** 2005Q1–2016Q4の年次アンカーを公開候補として計算する、**THEN** nominal B/A接続値に既存Plan39のPi世帯構成補正を適用し、Plan40の無補正baseを採用値として使わない。
- **WHEN** 有効な歴史年次アンカーと対象年の12か月季節入力が揃う、**THEN** 各四半期値を「補正済み年次アンカー × 当該四半期3か月平均 ÷ 同年12か月平均」で算出し、同年の四半期平均が年次アンカーと一致する。
- **WHEN** 2017Q1以降の公式四半期行が有効である、**THEN** 9費目はe-Stat公式四半期値をそのまま採り、月次平均・Plan39推定値・旧名目値を加算またはfallbackしない。
- **WHEN** 公式四半期のOtherを構成する、**THEN** 公式総合から公式9費目を引いた残差とし、measurementにderived provenanceを付けて `official=false` と識別する。10費目合計は丸め許容内で公式総合に一致し、総合自体をstack費目に含めない。
- **WHEN** 名目公開row、projection、chart stack、tableまたはCSVを生成する、**THEN** 期間ごとにcanonical 10費目だけを一度ずつ含め、旧名目aliasとv2/互換名キーの二重投影を行わない。aliasへpoison値を設定してもcanonical 10値とstack合計は変わらず、追加stack keyが公開されない。
- **WHEN** Plan39モデルと現在のB/A/L/Pi・manifest fingerprintが保存analysisに一致しない、またはinput-integrity/publication gateの必須条件を確認できない、**THEN** 対象推定値を`null`/`unavailable`と機械可読reasonで公開し、無補正Plan40値やlegacy aliasで穴埋めしない。必要な分析を対応するモデル・入力で再評価する。
- **WHEN** 公式artifact、sidecar、manifest、hash、必要期間、category mappingまたは公式行が欠損・不正である、**THEN** 公式期間を推定値・月次値・legacy aliasで埋めず、既存のunavailable marker、`null`、status/reasonを保持する。
- **WHEN** chart、tooltip、data table、CSVで同一期間・費目を表示する、**THEN** 値、canonical category、status/reason、source、model、official/derived区分、単位、frequency、aggregationおよびprovenanceが同じmeasurementに基づき一致する。
- **WHEN** `CpiChart` が2018Q1以降の正式系列を描画する、**THEN** 棒の表示順と凡例の表示順を、canonical key「住居、家具・家事用品、被服及び履物、保健医療、教育、光熱・水道、教養娯楽、交通・通信、食料、その他の消費支出」に対応する可視ラベル「住居、家具・家事用品、被服履物、保健医療、教育、光熱水道、教養娯楽、交通通信、食料、諸雑費・CPI外」の順にする。変更対象はレンダリング時の系列・棒の表示順と凡例のラベル・表示順に限り、canonical data keys、row/objectのキー順、およびinput projectionの順序は変更しない。
- **WHEN** `CpiChart` の名目または実質消費tooltipとチャート情報を表示する、**THEN** tooltip項目は凡例と同じ「住居、家具・家事用品、被服履物、保健医療、教育、光熱水道、教養娯楽、交通通信、食料、諸雑費・CPI外」の順・ラベルで表示し、各費目に繰り返す歴史系列の非公式注記は省く。チャート情報には「2016Q4以前の接続推定値は非公式」であることを明記する（2016年を含む）。
- **WHEN** 2016Q4から2017Q1へ移る、**THEN** 2016Q4まではPlan39補正済み歴史推定、2017Q1からは公式四半期sourceと明示し、接続点の再基準化・平滑化や公式値への補正式適用を暗黙に行わない。

## SharedPlan 48: 表示中の名目消費から導く実質CTI（現行優先仕様、実装・検証済み）

本節は、現行の実質消費系列についてPlan38/40等にある旧「民間最終消費支出（実質）」support経路の記述に優先する。名目表示と同じ対象期間・canonical 10費目を入力としてCPI実質値を作る。GDPの比較用raw source、loader、内部型は独立した互換用途のため維持するが、旧実質GDP公開キーは実質CTIの公開系列として使用しない。ここに記す実装と仕様同期は完了し、検証結果を下記に記録する。

### Data Sources

名目入力はSharedPlan 47の選択済みcanonical系列を使う。2005Q1–2016Q4はPlan39の名目B/A接続にPi世帯構成補正を適用した四半期推定、2017Q1以降は公式調整済み四半期系列とする。名目値、対象期間、10費目の対応を実質化処理で再選択・再集計しない。

CPI入力はPlan18の検証済み2025年基準月次接続系列（e-Stat CPI統計表 `0004052037`）とする。実装は2025年基準pairだけを採用し、2020年基準へのfallbackが必要な状態ではCPI入力を空としてfail-closedにする。9費目は同名のCPI大分類に対応させる。ただし住居は `持家の帰属家賃を除く住居` を使う。CTI「その他の消費支出」はCPI「諸雑費」と分類同等ではないため、残差のデフレーターには広義の代理として `持家の帰属家賃を除く総合` を使い、proxyである限界をmeasurementと表示情報に残す。実質総合にも `持家の帰属家賃を除く総合` を使う。CPIは2025年基準の定義値100を使い、実測平均による再基準化はしない。

方式選定の測定は2017Q1–2026Q2の38四半期で行い、選定案では実質総合−名目総合の平均が+9.116246pt、MAE 9.289186pt、実質総合−実質10費目和の平均が−0.218398pt、MAE 0.241581ptだった。これは方式影響の比較であり、独立した実質正解値との誤差検証ではない。また、この測定だけでは2005–2016年へ同じ方式を適用する妥当性や当該期間のCPI/category coverageを証明しない。

### Data Flow

Plan39/公式名目rowのcanonical 10費目および総合 → 同じ四半期の3か月CPI算術平均 → 各名目値 `× 100 / CPI` の変換 → 既存の実質10費目keysと新しい総合key `CTIミクロ調整系列（総合・実質）` を持つ公開row → 共通public projection → `CpiChart` の実質チャート、tooltip、data table、CSV。実質チャートは10費目を棒で表示し、独立変換した総合 (`CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY` / `CTIミクロ調整系列（総合・実質）`) はチャートの凡例に含めず、点マーカーも描かず、stackや費目合計にも加算しない。ツールチップは名目と同じ簡潔な費目行に、表示対象の費目値を足し上げた `合計` を表示する。独立変換した総合の行とCPIの計測・出典メモは表示しない。ツールチップの合計は独立実質総合keyとは別計算で、両者が一致する保証はない。独立総合keyはchart data、table、CSVの契約に保持する。内部総合名目key `CTIミクロ調整系列（総合・名目）` は2005Q1–2016Q4にPlan39年次総合アンカーとnominal月次seasonalityから、2017Q1以降は公式四半期総合から得て、同じ期間の実質総合計算に使う。

四半期は名目表示側で決定済みの期間を保つ。各四半期の実質10費目は同名対応CPI（住居のみ帰属家賃除外系列）で変換し、実質総合は表示名目総合を帰属家賃除外総合CPIで独立して変換する。従って実質総合は費目合計から作らず、異なるデフレーターと分類差により実質10費目の和と一致する保証はない。Otherの残差が負でも値をclampしない。

各四半期CPIには当該暦四半期の3か月すべてが必要である。欠月、重複、非有限値、非正値または不正CPIを補間・前値・別系列で埋めない。該当実質measurementは `null` / `unavailable` とし、少なくとも欠月・重複月・無効値を区別できる利用不能理由を保持する。値を再基準化しない。

### Data Model

実質の既存canonical 10費目keysは維持し、新しい実質総合keyは `CTIミクロ調整系列（総合・実質）` とする。旧 `民間最終消費支出（実質）` はこのCTI公開projectionから除外する。実質measurementは値に加えてstatus/reason、指数単位、2025年基準、四半期頻度・3か月CPI平均という集計方法、変換元nominal source/measurement provenance、CPIの `sourceId` / `statInfId`、CPI系列名・対象期間・集計情報を追跡できる。チャートでは実質10費目だけを棒と凡例に表示し、独立した実質総合は凡例に含めず、点マーカーも描かず、stack合計や費目値にも加算しない。総合の値と関連metadataはchart data、table、CSVの契約に保持する。実質ツールチップは名目と同様に費目行と表示対象費目の計算合計を表示し、独立総合の行とmeasurement note/provenanceを表示しない。計算合計と独立変換総合は別の値であり、一致を保証しない。Otherには一般proxyの限界を示すmeasurement note、総合には独立変換と費目和が一致しない定義を示すmeasurement noteをmetadataとして付ける。GDP比較のraw source、loader、内部型は互換用途として保持するが、実質CTIの値に流用しない。

### Component Tree

検証済みCPI月次系列（`loadCpiIndexData`）とPlan39/公式nominal quarterly aggregation → `quarterlyProjection.ts::deriveQuarterlyRealRows` によるserver側の四半期CPI集計・nominal row実質変換 → `QuarterlyRow` measurement/public projection → `CpiChart` → `SpendingBarChart`（real: 10費目の棒と凡例。独立総合は凡例に含めず、点マーカーも描かず、chart data、table、CSVの契約に保持。tooltipは費目行と費目値の計算合計を表示し、独立総合行とmeasurement note/provenanceを表示しない）/tooltip/data table/CSV。GDP loaderとGDP比較値は互換経路として分離して保持し、実質CTI projectionの入力にはしない。

### 実装・検証記録

実装後の検証では、`pnpm run type-check`、`pnpm run lint`、`pnpm run test:all`、coverage、`pnpm run build`、およびroute smoke `pnpm run test:browser:routes:jev` が成功した。lintは成功したがwarningが残る。`test:all` は92 files / 811 tests passed / 4 skipped。coverageはstatements 86.64%、branches 81.12%、functions 91%、lines 88.55%。spec-refs gateは実行していない。対応するスクリプトが存在しないためであり、passとは記録しない。

測定・方式選択の限界は維持する。2017Q1–2026Q2の比較は独立した実質正解値との誤差検証ではなく、2005–2016年の適用妥当性やCPI/category coverageを証明しない。特にCTI Otherの総合CPI proxyと住居の帰属家賃除外CPIは分類上の近似であり、同一概念を保証しない。

### Requirements

- **WHEN** 2005Q1–2016Q4の実質系列を生成する、**THEN** Plan39の補正済み名目canonical値を同じ四半期の9対応CPIで変換し、名目10費目・総合の対象期間と対応を維持する。
- **WHEN** 2017Q1以降の実質系列を生成する、**THEN** SharedPlan 47の公式調整名目canonical値に同じCPI変換規則を適用し、公式CTI実質列、GDP値または別のCTI系列へ入力を切り替えない。
- **WHEN** 各実質canonical費目を計算する、**THEN** 当該四半期の3か月CPI平均を用いて `nominal × 100 / CPI` とし、9費目は同名CPIに対応させ、住居は `持家の帰属家賃を除く住居` を使う。
- **WHEN** Otherの実質値を計算する、**THEN** 名目側のsigned residualを変更せず、`持家の帰属家賃を除く総合` を広義のproxyとして使い、CPI「諸雑費」との分類同等性を主張しない。
- **WHEN** 実質総合を計算する、**THEN** 同じ四半期の内部総合名目key `CTIミクロ調整系列（総合・名目）` を `持家の帰属家賃を除く総合` で独立変換し、新key `CTIミクロ調整系列（総合・実質）` へ格納する。総合を費目合計から再構成せず、実質総合と費目和の一致を前提にしない。
- **WHEN** 四半期内CPIの3か月の一つ以上が欠落・重複・非有限・非正値または無効である、**THEN** 対応する実質値を `null` / `unavailable` と理由付きで出し、補間、0補完、前値、別CPIへのfallbackをしない。少なくとも欠月は `cpi_month_missing`、重複月は `duplicate_cpi_month`、非正値・非有限値は `cpi_value_invalid` として識別する。
- **WHEN** CPI実質値を公開する、**THEN** 2025年基準100を使い出力を再基準化せず、名目値とCPIをともに指数として扱い円建て額とは説明しない。
- **WHEN** real projection、chart、tooltip、data tableまたはCSVを生成する、**THEN** 旧 `民間最終消費支出（実質）` keyを公開CTI系列から外し、旧GDP実質比較値を実質CTI入力に使わず、新しい実質総合と10費目の値・status/reason・provenanceをchart data、table、CSVの契約に保持する。
- **WHEN** 実質消費チャートを描画する、**THEN** 10費目だけを棒および凡例に表示し、独立変換した総合key `CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY`（`CTIミクロ調整系列（総合・実質）`）は凡例に含めず、点マーカーも描かず、stackの棒や10費目合計にも加算しない。総合keyの値とstatus/reason/provenanceはchart data、table、CSVの契約に保持する。
- **WHEN** 実質消費のツールチップを表示する、**THEN** 名目と同じ簡潔な費目行と、表示対象の費目値を足し上げた `合計` を表示する。独立した実質総合の行およびCPIの計測・出典に関するmeasurement note/provenanceは表示せず、ツールチップの合計と独立実質総合の一致を前提にしない。
- **WHEN** 実質CTI経路を切り替える、**THEN** GDP比較のraw source、loader、内部型は独立した互換用途として維持する。
- **WHEN** 本節の仕様同期を完了扱いにする、**THEN** Data Sources / Data Flow / Data Model / Component Tree / Requirementsが実装と一致し、実装・関連検証が未完了ならその状態を完了済みと記録しない。
