# Residual E2E audit and migration plan — 2026-09-27

## Purpose

Decide whether the post-Phase6 Playwright cases contain required coverage that is absent from Browser Mode, migrate unique executable behavior where justified, and retire cases that are already covered or have no meaningful assertion.

## Audit evidence

- The final Phase6 residual E2E run reported 3 passed and 7 skipped. The passing cases were mobile LazyMount force-mount (no `expect`), normal advanced-series, and tooltip-dismiss #231; the skips were six accessibility tests and the Chromium project copy of #231.
- `tests/browser-mode/batch3-b-production-route.browser.test.ts` already asserts the production normal/advanced-series registry, legend, and table contract checked by `tests/e2e/advanced-series.e2e.spec.ts`.
- `tests/browser-mode/phase6-b07-real-consumption.browser.test.ts` and `tests/browser-mode/LazyMount.browser.test.tsx` cover normal LazyMount behavior; `tests/components/LazyMount.test.tsx` covers the `__MOUNT_ALL__` override. The remaining mobile E2E only navigates after setting the override and has no assertion.
- Accessibility E2E has six tests in three unconditional `describe.skip` blocks and no skip rationale. Existing Browser Mode does not verify all of their predicates. The keyboard legend toggle, a named legend control's visible keyboard focus ring, reduced-motion behavior, and dark-mode legend presentation are meaningful production-route checks. The original dark color predicate only rejects one background color, and the original range-picker assertion only checks that a locator object exists.
- Tooltip-dismiss #231 remains an active mobile touch case. Its prior post-wheel assertions were removed in a worktree change with unknown provenance; this plan neither restores nor deletes those edits. Other removed tooltip and focus-management bodies also have unknown provenance and are outside this plan.
- The installed Next.js Playwright guide was read at `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` before planning browser tests.

## Planned disposition

1. Add a focused Browser Mode production-route suite (B14) with four assertions: dark-mode legend readability/hover reset, keyboard activation of a legend, keyboard-visible focus on a named legend, and `prefers-reduced-motion` styles.
2. Retire the six disabled accessibility E2E bodies after those meaningful predicates have active Browser Mode coverage. Do not preserve the vacuous truthy-color and locator-defined-only checks as accessibility acceptance criteria.
3. Retire the normal advanced-series E2E as an exact duplicate of the existing production-route Browser Mode assertion.
4. Retire the mobile LazyMount E2E because it has no behavioral assertion; retain existing unit and Browser Mode LazyMount checks.
5. Keep tooltip-dismiss #231 and its surrounding spec. Do not alter any source whose deletion provenance is unknown.
6. Update the residual inventory and shared migration plan to distinguish the original 33 Phase5-eligible cutovers from these four residual accessibility predicates and record the retained #231 exception.

## Acceptance criteria

- B14 checks run against the production route in Browser Mode, with isolated dark and reduced-motion contexts where needed.
- Every B14 case has a meaningful assertion tied to a preserved residual behavior.
- Equivalent or assertion-free E2E cases are removed only as listed above; #231 and unknown-provenance deletions remain untouched.
- The production build's TypeScript stage, Browser Mode B14, the residual E2E suite, lint, and aggregate Browser Mode suite pass. Run standalone `pnpm run type-check`; if it reports existing test-file errors, record them and ensure B14 introduces no new errors.
- Plan, test roster, inventory, and validation logs accurately report the remaining E2E state and any limits.

## Scope boundaries and uncertainty

- This follow-up is not a re-count of the original 33 Phase5 migration-eligible cases. B14 adds four residual accessibility predicates outside that roster.
- The skipped range-picker assertion is not migrated because its current assertion proves no behavior. The skipped contrast-string-presence test is not migrated as written; B14 uses a real contrast threshold for the dark legend instead.
- The source E2E history for deleted tooltip and focus tests is unknown, so no conclusion about the missing historical assertions is made.

## Execution result

The plan passed JEV v3 review as `valid_as_defined` (confidence `0.65`, pass probability `0.69`); see the [plan request](jev-residual-e2e-plan-request.json) and [result](jev-residual-e2e-plan-result.json).

B14 implemented the four active predicates in `tests/browser-mode/phase6-b14-residual-accessibility.browser.test.ts`. Its dedicated focused run passed 4/4. The normal advanced-series E2E was removed after verifying that the existing `batch3-b` production-route Browser Mode case inspects the same normal route registry, regular/extended series exclusion, visible legends, and advanced table values. The mobile LazyMount E2E was removed because its only remaining body had no expectation; unit and Browser Mode coverage already exercise the override and lazy mounting. The six skipped accessibility bodies were removed after their useful predicates were replaced by B14; the range-picker locator-presence and truthy-color-string checks were not retained as behavioral criteria.

The final built Browser Mode run passed B01–B14 (37/37 cases), legacy Chromium (9 files / 80 passed), and WebKit (5 files / 21 passed / 5 skipped), for 138 passed / 5 skipped. The fresh E2E run passed 1 and skipped 1: the active case is tooltip #231 in the mobile-pixel project; its Chromium copy is skipped by project configuration. See the [full Browser Mode log](phase6-b14-full-browser-mode-validation-pass2-2026-09-27.log), [residual E2E log](phase6-b14-residual-e2e-validation-2026-09-27.log), [lint log](phase6-b14-lint-validation-2026-09-27.log), and [standalone type-check log](phase6-b14-type-check-validation-pass2-2026-09-27.log). Production build/TypeScript and `pnpm run lint:fast` passed, as did `git diff --check`. Standalone `pnpm run type-check` still exits 2 with 71 errors across 23 existing Browser Mode test files (custom BrowserCommands typing, Locator typing, and fixture/type issues); after a local command cast, none of those errors reference B14. These repository-wide Browser Mode test typing errors are outside this residual E2E audit and remain a validation limitation.

The initial implementation checkpoint passed JEV v3 as `valid_as_defined` (confidence `0.88`, pass probability `0.89`), with complete diagnosis and no clarification; see the [checkpoint request](jev-residual-e2e-implementation-checkpoint-request.json) and [result](jev-residual-e2e-implementation-checkpoint-result.json). After the standalone type-check result was collected and the B14-only command typing error was removed, the latest initial checkpoint revalidation also returned `valid_as_defined` (confidence `0.95`, pass probability `0.96`), with complete diagnosis and no follow-up; see the [revalidation request](jev-residual-e2e-implementation-checkpoint-revalidation-request.json) and [result](jev-residual-e2e-implementation-checkpoint-revalidation-result.json). This revalidation is the current checkpoint for the audit.

The original Phase 6 roster remains `A=123 / E=123 / M=123`, 33/33 migrated. B14 is four additional residual accessibility checks outside that roster. Tooltip #231 remains Playwright-owned because its live mobile bar-touch/open assertions are unique in the current source. Its post-wheel dismissal assertions, the desktop hover test body deletion, and the prior focus-management test body deletions remain of unknown provenance and were not restored, removed, or assigned by this audit.

### Superseding decision: tooltip #231 E2E retirement — 2026-09-27

The existing `p45-b-tooltip-dismiss-231-case01` in `tests/browser-mode/batch3-b-production-route.browser.test.ts` uses the production-route hit-tested mobile touch target, verifies tooltip opening, and additionally confirms tooltip/cursor dismissal after scroll. The residual Playwright case had no post-scroll assertion, so it added no unique behavior coverage. With no Pixel 7-specific requirement recorded, Browser Mode is the sole owner; its 412×915 mobile-touch profile does not preserve a Pixel 7 UA/device-scale-factor assertion. Only the runnable mobile #231 test case was removed from `tests/e2e/tooltip-dismiss.e2e.spec.ts`; the spec remains as a no-runnable-test shell with the empty desktop describe and previously present helpers/comments intact. No other pre-existing deleted test bodies were restored. Its stale `mobile-pixel` matcher was removed. `test:e2e` remains available for future standalone use, but `test:full` no longer invokes it with no active Playwright cases. The prior 1-pass/1-skip E2E run and other counts in this report are historical pre-retirement snapshots. This decision does not alter the original 33-case ledger or unknown-provenance findings. See the [retirement plan](phase6-tooltip-231-e2e-retirement-plan-2026-09-27.md) and [JEV plan review](jev-tooltip-231-e2e-retirement-plan-result.json).

Retirement checkpoint validation: production build and build TypeScript passed, as did `pnpm run lint:fast`. Browser Mode aggregate results were B01–B14 37 passed, production-route 80 passed, and WebKit 21 passed / 5 skipped. Focused #231 Browser Mode passed 1 test with 79 name-filter skips ([log](phase6-tooltip-231-focused-browser-mode-validation-2026-09-27.log)); the [aggregate log](phase6-tooltip-231-browser-mode-validation-2026-09-27.log) records the full result. Playwright `--list` reported zero tests and exited 1 because the suite is empty; no empty-suite E2E execution is claimed. `test:full` and standalone `pnpm run type-check` were not run. `git diff --check` passed both before and after this documentation update. JEV plan revalidation and implementation checkpoint both returned `valid_as_defined`; implementation confidence was 0.54, pass probability 0.61, diagnosis complete, no follow-up. See the [plan revalidation](jev-tooltip-231-e2e-retirement-plan-revalidation-result.json), [implementation request](jev-tooltip-231-e2e-retirement-implementation-checkpoint-request.json), and [implementation result](jev-tooltip-231-e2e-retirement-implementation-checkpoint-result.json). Historical suite counts and the original 33/33 ledger remain unchanged.
