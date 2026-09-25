# Plan 45 production build / E2E same-revision evidence (2026-09-25)

- **Source revision:** `876880158d5a942926c192395edee7d9856a7e71`.
- **Order:** production build completed, then the canonical E2E suite ran immediately afterward, on the same source revision.
- **Commands / exit codes:** `pnpm run build` (exit 0; emitted command `next build --webpack`), followed by `pnpm run test:e2e` (exit 0).
- **Build:** elapsed `28.35s` (`PLAN45_BUILD_ELAPSED_SECONDS`); build output reports compilation, TypeScript, static page generation, and trace collection completed. `.next/BUILD_ID` was `i19UhhqsK4IGeNgenzwbj`, preserved verbatim in [`production-build-id-20260925.txt`](production-build-id-20260925.txt) (SHA-256 `f5b1541467aa7f095d04737001bf0749831753ef0b59d568cacdd780d12839ab`). It was captured after the E2E run with no intervening rebuild and matches the build used by `next start`.
- **E2E:** `120 passed`, `19 skipped`, `0 failed` (139 listed executions); Playwright reported `3.6m`; outer elapsed `219.85s` (`PLAN45_ELAPSED_SECONDS`).
- **Environment / configuration:** Node `24.19.0`; pnpm `11.9.0`; Ubuntu `26.04.1`, x86_64, kernel `7.0.0-34-generic`; lockfile SHA-256 `e10ab5f3ec885be4d31cf777f24d7b1038dbd77b4ad32597ce9afcb8941738e9`; Playwright `1.62.1`; browser revisions Chromium `1234`, headless shell `1234`, WebKit `2336`. Projects: chromium, chromium-dark, mobile-pixel, webkit-tabs-regression. Workers `3`; non-CI retries `0` (CI retries `2`); test timeout `60s`; webServer timeout `90s`; `reuseExistingServer: false`. The build log identifies `.env.local` as an environment file; its values are not recorded here. Runner identity and other environment variables are unknown.
- **Worktree context:** the pre-existing Plan 42 deletion `D results/plan42/current-worktree-status-20260925.txt` remained untouched. Plan 45 markdown-only worktree changes do not alter application source or build inputs.

## Raw artifacts

The four copied files were compared byte-for-byte with their `/tmp` sources using `cmp` (all matched).

| Artifact                                      | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `production-build-same-sha-20260925.log`      | `d50b4b83627e02dad844caec2727c36c5705b78d5c1fe97282666d394272e892` |
| `production-build-same-sha-20260925.time.txt` | `101d3d3e4081222e6a8f18a64e1ced5fa3cb6d7526ee7950d28e79b649c97840` |
| `production-build-id-20260925.txt`            | `f5b1541467aa7f095d04737001bf0749831753ef0b59d568cacdd780d12839ab` |
| `test-e2e-same-sha-20260925.log`              | `9b00520561a0b543c669dd66600256167d4f529e598acae2a680a13c67be9533` |
| `test-e2e-same-sha-20260925.time.txt`         | `5dbe138a90f1ab9680b600fcf21b3b13d8baac73e1cfe1ba94778af23d4620d9` |
