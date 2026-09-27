# Phase 6: Make pre-push E2E gate safe when no Playwright tests are registered

## Finding

The repository's configured hooks are active: `.git/config` sets `core.hooksPath` to `.husky/_`, whose pre-push shim loads Husky and executes `.husky/pre-push`. In `.husky/pre-push.bash`, `run_e2e` cleans the E2E port and unconditionally calls `pnpm run test:e2e`; both the full and ordinary changed-file profiles use it. The current Playwright suite has zero discoverable cases, so the hook currently fails at this step for either profile. The standalone E2E command should remain a normal Playwright command and continue to fail when explicitly run with an empty suite.

## Proposed changes

1. Add a hook-only `test:e2e:if-present` wrapper that runs `pnpm exec playwright test --list` to discover cases without starting the web server or a browser.
2. If the listing reports exactly zero cases, print an explicit skip and exit successfully. If it reports one or more cases, run the existing `pnpm run test:e2e` and propagate its status. If discovery fails or its output cannot be parsed, fail closed rather than silently skipping validation.
3. Keep `.husky/pre-push.bash`'s `test:e2e:clean` step and replace the unconditional Playwright call with the wrapper.
4. Update `scripts/hook-smoke.mjs` and `tests/unit/husky-push-impact.test.ts` to cover empty, nonempty, malformed, and failed discovery while preserving the direct `test:e2e` contract and gate ordering.

## Acceptance criteria

- Empty Playwright discovery lets the pre-push profile continue after an explicit skip message, without launching Playwright or Next server.
- Nonempty discovery still runs the existing E2E command; E2E failures propagate.
- Listing errors or unrecognized output fail closed.
- `test:e2e` stays unchanged for direct callers; E2E port cleanup remains before discovery.
- Hook smoke and focused unit tests verify the new behavior and existing profile sequencing.

## Validation plan

- Run hook smoke and focused `husky-push-impact` unit tests.
- Run relevant lint/type validation and `git diff --check`.
- Run JEV implementation checkpoint after validation.
- Do not push. Once the pre-push setup and commit contents have been reviewed, create a normal commit with hooks enabled.

## Boundary

This is a Git-hook/tooling change only. It does not add or restore Playwright cases, alter Browser Mode coverage, or change the Plan45 migration ledger. Unknown-provenance changes already present in the shared worktree remain outside the hook fix.

## Superseding direction — 2026-09-28

The user clarified that the empty E2E hook stage should be replaced directly by the existing production-route Browser Mode aggregate. The wrapper-plan JEV initial result selected `incomplete_implementation_info`; its one automatic clarification selected evidence collection but lacked required diagnosis details, ending with `resolution: unresolved` and `diagnosisStatus: incomplete`. Those records remain historical at the [initial result](jev-prepush-empty-e2e-gate-plan-result.json) with its embedded clarification, and the later [evidence reassessment request](jev-prepush-empty-e2e-gate-plan-reassessment-request.json) and [result](jev-prepush-empty-e2e-gate-plan-reassessment-result.json). This wrapper-based plan is superseded by the user direction and the passing direct-replacement plan: see the [Browser Mode cutover plan](phase6-prepush-browser-mode-cutover-plan-2026-09-28.md) and its [JEV plan result](jev-prepush-browser-mode-cutover-plan-result.json).
