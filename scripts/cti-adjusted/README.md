# CTI adjusted analysis and household composition research

The analysis validates inputs through the existing `loadCtiAdjustedInputs`
gate and saves its audit under `results/plan39/`. Calibration and backtest
training use 2018–2025, with 2017 as target and holdout. Sensitivity compares
2018–2025 with 2018–2024 under the same target, holdout, and `official_annual`
L rule. Periods, input coverage, and leakage status are recorded in the result
and `auditSummary`.

Run the canonical analysis command or validate an existing result with
`--check`:

```sh
pnpm cti-adjusted:analysis
pnpm cti-adjusted:analysis -- --check
```

When the source snapshots change, regenerate the manifest-validated
provisional 2+ household-share input before analysis:

```sh
node scripts/cti-adjusted/build-production-pi2plus.mjs
pnpm cti-adjusted:analysis
```

The endpoint-calibrated correction uses the 2025 residual and a retrospective
2018–2024 comparison; this backtest is not independent forecast evidence.

Pass `--artifact-root` and `--results-dir` to select the input artifact root
and output directory. The result JSON's top-level `auditSummary` stores the
verdict checks, selected threshold, sensitivity results, period contract,
input and analysis fingerprints, and artifact hashes. `--check <saved-json>`
uses loader-validated inputs and read-only checks for nested source equality,
artifact/manifest/audit SHA-256 values, period and L-rule contracts, verdict
consistency, thresholds, and sensitivity results.

The V2 Other-jump check compares adjacent-year changes in `Other / 総合 × 100`
in percentage points, rather than changes in the Other value itself. Its
threshold is derived from evaluable adjacent pairs in official A for
2017–2025. Missing values, non-positive totals, or inconsistencies close the
publication gate. The same threshold evaluates the estimated series and the
2016→2017 connection; violating pairs and their input values are recorded.
The old `residualBoundary` sweep in `scripts/cti-adjusted/run-analysis.mjs` is
a separate legacy diagnostic. A successful `--check` verifies structure,
hashes, and decision consistency; it does not mean the overall
`verdict.status` is `pass`. Failures and insufficient data are also saved as
JSON, using a temporary file and rename to avoid partial results.

`calendar_year_average` is not used. If artifact coverage misses a declared
period or sensitivity/residual-boundary inputs are insufficient, the overall
result fails closed with a reason.
