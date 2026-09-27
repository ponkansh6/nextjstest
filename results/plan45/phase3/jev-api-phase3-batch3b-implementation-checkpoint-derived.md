# Phase 3 Batch3b implementation checkpoint

**Verdict:** `valid_as_defined` (confidence 0.96; pass probability 0.97). JEV returned probabilities `valid_as_defined=0.97`, `implementation_issue=0.02`, `requirements_mismatch=0.01`, and 0 for `scope_violation`, `missing_prerequisites_info`, `incomplete_implementation_info`, `other`, and `indeterminate`. Diagnosis is complete; no follow-up was recommended. Response validation passed.

## Focused verification and correction

Focused Browser Mode verification passed: 2 files / 3 tests, exit 0, duration 5.32 seconds. The first attempt passed both axis cases but failed the earnings hover case because the selected horizontal line path had a zero-height bounding box and Browser Mode did not consider it visible. The selector was corrected to the actual visible, nonzero-area Recharts area path; the corrected run passed all three tests.

The focused run emitted unsuppressed React/Recharts development warnings for forwarded chart props and a false active attribute. The warnings remain visible; no zero-console-error claim is made.

Independent Oracle review found no blocker. It confirmed the axis cases exercise the shared P42-353/-354/-355 behavior for the two chart iterations, P42-356 is not covered or migrated, and the visible area path is a suitable hover target. Route-fed data and production layout remain outside these component fixtures.

## Assertion boundaries and accounting

- Monthly axes: the CPI `StackedAreaChart` and earnings `EarningsBreakdownChart` tests are green Browser Mode candidates for their respective loop iterations. They verify both boundary labels are absent and at least one axis tick is present. P42-353/-354/-355 are one shared Playwright source group across both iterations. P42-356 maps to test-end line 29 in the ledger, but there is no `labels.length` expect; it is not covered or moved. Keep the shared Playwright loop/assertions intact until the ten-case gate and final source crosswalk; remove that group once only after both axis tests pass. Remove the readiness helper only if unused.
- Earnings hover: the actual visible area-path hover to tooltip test is a green candidate for P42-290 only. Keep P42-287/-288/-289 plot/viewport assertions, P42-297 separator styling, route/data integration, and other Playwright assertions.

These are green implementation candidates, not completed E2E transfers. Keep all relevant Playwright assertion groups intact until all ten new Batch3 named Browser Mode cases pass and the final crosswalk is reviewed. Preserve `A=123`, `E=90`, `M=1`; do not mark the stable rows fully migrated or count P42-356 as moved. No E2E was run and no Playwright source edit was made.
