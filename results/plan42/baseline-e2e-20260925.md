# Plan42 baseline E2E measurement

- Status: **passed** (process exit code 0)
- Revision: baseline `3a5c16d467a994b5c168afec5265c0fa8b7257b0`
- Temporary clean checkout: `/tmp/plan42-baseline-clean-20260925`
- Host: `shunki-20u4s1j300`
- Runtime: Node `v24.19.0`, pnpm `11.9.0`
- Lockfile SHA-256: `e10ab5f3ec885be4d31cf777f24d7b1038dbd77b4ad32597ce9afcb8941738e9`
- Exact command: `pnpm run test:e2e`
- Timer boundary: immediately before launching the test command through process exit. Dependency install, baseline build, and preflight were outside the timer.
- Start (UTC): `2026-09-25T02:29:37.321118+00:00`
- End (UTC): `2026-09-25T02:33:19.805776+00:00`
- Elapsed: **222.483 seconds** (monotonic clock)
- Expected / listed cases: **141** across 21 E2E specs and 24 project/spec pairs
- Project inventory: chromium 87, chromium-dark 2, mobile-pixel 43, webkit-tabs-regression 9
- Executed: **122 passed, 19 skipped, 0 failed** (141 total)
- Baseline build prerequisite: `pnpm run build`, exit 0; generated `.next/BUILD_ID` `FX52v_PCut14B6GcBy1nm`
- Dependency preparation: `pnpm install --offline --frozen-lockfile`, succeeded; 768 packages reused, 0 downloaded
- Pre-run checks: tracked checkout clean; 21 spec files present; `playwright test --list` reported 141; port 3100 free; cached Chromium and WebKit present; source/tests/config/lockfile unchanged.
- Raw output: [`baseline-e2e-20260925.log`](baseline-e2e-20260925.log)
- Machine-readable record: [`baseline-e2e-20260925.json`](baseline-e2e-20260925.json)

This is a reference measurement for the baseline revision. Baseline has 141 listed cases while the candidate has 139; elapsed time is not a performance-improvement score.
