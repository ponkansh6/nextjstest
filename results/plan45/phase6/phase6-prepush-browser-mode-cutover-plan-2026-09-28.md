# Phase 6: Replace the pre-push E2E gate with the production-route Browser Mode aggregate

## Finding

The configured Husky pre-push hook is active. Its full and ordinary changed-file profiles already run `pnpm run build` before calling the E2E gate. The E2E suite now has zero discoverable Playwright tests, and the user directed that E2E be replaced simply by Browser Mode. The repository already defines `test:browser:next-route-poc:built`, which runs the production-route Browser Mode aggregate.

`scripts/run-next-route-poc.mjs` requires `.next/BUILD_ID`, starts a loopback Next production server, runs the B01–B14, production-route, and WebKit Browser Mode configurations, and stops the server in a `finally` block. The full validation script already uses this command after the build. Therefore the hook can replace its E2E cleanup/execution pair with the same Browser Mode aggregate; no empty-suite detection or wrapper is needed.

## Planned changes

1. In `.husky/pre-push.bash`, replace the E2E gate function with a production-route Browser Mode gate that invokes `pnpm run test:browser:next-route-poc:built`.
2. Remove `test:e2e:clean` from pre-push because the Browser Mode runner owns its server lifecycle. Keep the standalone `test:e2e` script unchanged for manual/future use.
3. Update `scripts/hook-smoke.mjs` and `tests/unit/husky-push-impact.test.ts` to verify the Browser Mode gate's order after build, profile behavior, and failure short-circuiting.
4. Do not add a Playwright discovery wrapper or alter app coverage and the original 33-case ledger.

## Acceptance criteria

- Both full and ordinary changed-file pre-push profiles run the built production-route Browser Mode aggregate after a successful production build.
- Pre-push no longer invokes Playwright E2E or E2E port cleanup.
- The aggregate can find `.next/BUILD_ID`, manages its own server lifecycle, and propagates a failure to block the push.
- Hook smoke and focused push-impact tests assert the new command order and failure behavior.
- The direct `test:e2e` script remains unchanged.

## Validation plan

- Run `pnpm run test:hook-smoke` and focused `husky-push-impact` unit tests.
- Run relevant lint/type validation and `git diff --check`.
- Run a JEV implementation checkpoint after validation.
- Do not push. Review pre-push configuration and commit scope before creating a normal commit.

## Boundary

This is a Git-hook/tooling change only. Browser Mode is the replacement for pre-push E2E validation. No Playwright case is added or restored, and historical migration totals remain unchanged. The earlier zero-test-wrapper proposal and its JEV results remain recorded as superseded review history; they are not the implementation plan.

## Validation and JEV checkpoint

Hook smoke passed, and `tests/unit/husky-push-impact.test.ts` passed 10/10. `pnpm run lint:fast` and the final `git diff --check` passed. The prior production build and Browser Mode aggregate run recorded B01–B14 37 passed, production-route 80 passed, and WebKit 21 passed / 5 skipped; see the [aggregate log](phase6-tooltip-231-browser-mode-validation-2026-09-27.log). JEV plan review and implementation reassessment both returned `valid_as_defined`; see the [plan result](jev-prepush-browser-mode-cutover-plan-result.json) and [implementation reassessment result](jev-prepush-browser-mode-cutover-implementation-reassessment-result.json). The actual push/full hook profile was not run, so this record does not claim end-to-end pre-push execution.
