# Tooltip #231 Playwright retirement plan — 2026-09-27

## Goal

Stop invoking Playwright as a separate gate solely for the residual tooltip #231 behavior. Make the existing batch3-b Browser Mode case the sole test owner because it already covers the live E2E assertions and adds a post-scroll dismissal check.

## Evidence and decision

- `tests/e2e/tooltip-dismiss.e2e.spec.ts` contains one runnable test: the mobile Pixel 7 copy of #231. It hit-tests a bar, taps it, checks the close button and cursor, and sends a 60px wheel event. It does not assert a post-scroll outcome.
- `tests/browser-mode/batch3-b-route.command.ts` runs the same production-route bar hit-test and touch tap with `isMobile` and `hasTouch`; the `p45-b-tooltip-dismiss-231-case01` assertion in `tests/browser-mode/batch3-b-production-route.browser.test.ts` checks the same tooltip-open state and also checks that scrolling occurred and the tooltip/cursor disappeared.
- The only stated difference is the emulated profile: Playwright E2E uses Pixel 7; Browser Mode uses a 412×915 viewport with mobile touch enabled. No separate Pixel 7-only requirement is recorded, and the user approved the Browser Mode alternative.
- Therefore, remove only the runnable mobile #231 Playwright case and its stale `tooltip-dismiss` project matcher. Preserve the pre-existing empty desktop describe and the already-absent unknown-provenance test bodies. Keep the existing Browser Mode case unchanged as the owner.
- With no active Playwright E2E tests left, remove the `test:e2e` invocation from `test:full`; otherwise the full gate will call Playwright with zero discoverable tests. Preserve the standalone `test:e2e` script for future E2E cases and keep the hook-smoke script-presence contract intact.

## Planned changes

1. Remove only the active mobile #231 test block from `tests/e2e/tooltip-dismiss.e2e.spec.ts`; preserve the empty desktop describe and existing pre-task test-body deletions. Remove only declarations made newly unused by deleting #231 if the lint gate requires it.
2. Remove only the `tooltip-dismiss` matcher from `playwright.config.ts`; preserve other mobile-pixel selectors and project behavior.
3. Remove the no-longer-valid `pnpm run test:e2e` stage from `test:full`; retain the explicit `test:e2e` script for future tests.
4. Append a correction/superseding decision to the scenario inventory, shared Plan45 migration plan, Phase6 residual audit, and Phase5/6 cutover note. Preserve historical logs and counts as snapshots from before this retirement; do not change the original 33-case ledger or unknown-provenance notes.

## Acceptance and validation

- No active Playwright E2E case remains for tooltip #231; the stale project matcher is gone. The spec may remain as a shell with no runnable test.
- The Browser Mode `p45-b-tooltip-dismiss-231-case01` remains the sole owner and passes focused validation.
- `test:full` no longer invokes an empty Playwright E2E stage and still passes its remaining gates.
- Record the resulting E2E test listing accurately; do not claim an empty Playwright suite passed as a test run.
- `git diff --check` passes. No app runtime code or the existing Browser Mode test is changed.

## Boundary

This retirement relies on browser-emulated mobile touch and the production-route contract already tested in Browser Mode. It does not preserve a Pixel 7-specific UA/device-scale-factor guarantee. It does not alter any unknown-provenance deletion or historical Phase5/Phase6 test count.

## Implementation checkpoint and validation

The production build and its build TypeScript stage passed, and `pnpm run lint:fast` passed. Browser Mode aggregate results: B01–B14, 37 passed; production-route suite, 80 passed; WebKit, 21 passed / 5 skipped. The focused #231 Browser Mode filter passed 1 test with 79 name-filter skips; see the [focused log](phase6-tooltip-231-focused-browser-mode-validation-2026-09-27.log). See the [aggregate validation log](phase6-tooltip-231-browser-mode-validation-2026-09-27.log) for the aggregate run. Playwright `--list` showed zero tests and exited 1 because the suite is empty; no empty E2E execution is claimed. `test:full` and standalone `pnpm run type-check` were not run. `git diff --check` passed both before and after this documentation update.

JEV plan revalidation returned `valid_as_defined` (confidence 0.88, pass probability 0.89). The implementation checkpoint also returned `valid_as_defined` (confidence 0.54, pass probability 0.61, diagnosis complete, no follow-up); see the [implementation request](jev-tooltip-231-e2e-retirement-implementation-checkpoint-request.json) and [result](jev-tooltip-231-e2e-retirement-implementation-checkpoint-result.json). Plan revalidation artifacts are [request](jev-tooltip-231-e2e-retirement-plan-revalidation-request.json) and [result](jev-tooltip-231-e2e-retirement-plan-revalidation-result.json). Historical test counts remain snapshots from before retirement, and the original migration ledger remains `A=123/E=123/M=123` (33/33).
