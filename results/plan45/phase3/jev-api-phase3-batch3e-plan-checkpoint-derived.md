# Plan45 B3e plan checkpoint — derived context

Status: fresh initial v3 plan review request prepared; response pending.

## Proposed scope

Exactly 17 new named Browser Mode cases across 10 stable rows:

- Four width rows × nominal/real SpendingBarChart geometry at widths 320, 375, 390, and 430: 8 cases.
- EarningsBreakdownChart plus actual CustomTooltip bounds at 375 and 430: 2 cases.
- Three viewport rows × nominal/real actual tooltip internal-scroll geometry at 375×667, 320×480, and 667×375: 6 cases.
- One actual StackedAreaChart area-path render smoke for P42-262: 1 case.

Split execution into B3e-a (3 rows/6 cases), B3e-b (3 rows/4 cases), B3e-c (3 rows/6 cases), B3e-d (1 row/1 case). Each subbatch gets focused Browser Mode verification, independent diff review, then its own fresh implementation JEV checkpoint before the next. One initial plan JEV covers the staged roadmap.

## Assertion boundary

- Width geometry rows transfer only P42-203–207, P42-209–213, and P42-215–217 for each nominal/real iteration. Keep P42-202 and P42-218 route/document checks, and keep P42-208 value-domain and P42-214 quarter-format checks in Playwright.
- Earnings rows use actual EarningsBreakdownChart and CustomTooltip. Transfer P42-230 and P42-232–240 bounds only. Keep P42-219–229 activation/content and P42-231 mixed row-value/label-measure assertion in Playwright.
- Internal-scroll rows use actual nominal/real SpendingBarChart + CustomTooltip fixtures with enough keys to create overflow. Transfer P42-246–248 and P42-250–260 only; retain P42-241–244 and P42-261. P42-245 is existing unit coverage; P42-249 is absent from E2E and its CSS declaration is unit-tested.
- CPI area smoke uses actual StackedAreaChart in the existing MonthlyBoundaryAxis Browser Mode fixture and takes only the area-path visibility P42-262. Keep route `#section-stacked` visibility and existing route/scroll E2E.

## Cadence/accounting

B3d contributes 2 of 20 since last consolidated E2E; B3e adds 17, reaching 19/20 only after all cases pass. The Explorer audit found no defensible 20th case; wait for one later justified, plan-reviewed, gated case. No E2E during B3e. Preserve `A=123`, `E=90`, `M=1`; no full stable-row migration is claimed. Exclude 768/769 page-shell-dependent cases.

## JEV plan checkpoint result

The stored response matches the submitted request and passes local response validation (`http-success`, `responseValidation.valid=true`). JEV selected `valid_as_defined`, confidence 0.78, pass probability 0.81. Distribution: `valid_as_defined` 0.81, `requirements_mismatch` 0.06, `scope_violation` 0.06, `implementation_issue` 0.06, `incomplete_implementation_info` 0.01, and zero for `missing_prerequisites_info`, `other`, and `indeterminate`. Diagnosis is complete; no follow-up was recommended. This approves the roadmap as a plan only; no assertion ownership moves until each implementation subbatch passes its focused/review/JEV gates.

- Request SHA-256: `4493bcedb466b027eb2e2fa2c71f00093c3eb5b50d1d263219f88641ae7a479b`
- Response SHA-256: `276cfcdb36f1d54b51e2ad07770e53c790d94c5735c3c1b783a216c7c5c57e12`
