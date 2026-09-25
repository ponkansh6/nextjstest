# plan42 現時点スナップショットの E2E 計測計画

## 目的と位置づけ

ユーザー指示により、移行をいったん止め、現時点の実装済み workspace でフル Playwright E2E を1回計測して既存 baseline と比較する。これは clean candidate に対する最終受け入れ測定ではなく、移行途中の参考値である。baseline と現在のテスト件数が異なるため、差を因果的な短縮効果とは断定しない。

## 比較対象

- Baseline: commit `3a5c16d467a994b5c168afec5265c0fa8b7257b0`、`pnpm run test:e2e`、141 listed (122 passed / 19 skipped / 0 failed)、222.482656104 秒。正式記録は [`baseline-e2e-20260925.md`](baseline-e2e-20260925.md)、JSON、raw log。
- Current snapshot anchor: HEAD は同じ baseline commit `3a5c16d467a994b5c168afec5265c0fa8b7257b0`、作業ツリーは変更・未追跡ファイルを含む dirty state。
- 事前に `pnpm exec playwright test --list` で確認した現在の inventory: **139 tests / 21 files / 24 project-file pairs**。project counts: chromium 85、chromium-dark 2、mobile-pixel 43、webkit-tabs-regression 9。テストは実行していない。この一覧は計測直前に再確認する。
- 記録時の host/runtime: `shunki-20u4s1j300`, Linux `7.0.0-34-generic` x86_64、Node `v24.19.0`、pnpm `11.9.0`。lockfile SHA-256 は baseline と同じ `e10ab5f3ec885be4d31cf777f24d7b1038dbd77b4ad32597ce9afcb8941738e9`。

## 計測前の準備

1. 計測直前の HEAD、host/OS、Node/pnpm、lockfile SHA-256 を記録する。baseline と同じ host/runtime を使う。
2. workspace は dirty のまま測る。テスト・設定・ソース変更を戻したり cherry-pick したりしない。計測直前に `git status --short` と `git diff --binary`、未追跡ファイル一覧と内容の SHA-256 を保存し、変更ファイル manifest と snapshot digest を作る。manifest はこの計画作成時点から計測時点までに変わり得るため、必ず計測直前の状態を正とする。
3. build / install / preflight はタイマー外で行う。`pnpm run build` をクリーンに成功させ、exit code と `.next/BUILD_ID` を記録する。Playwright browser cache、port 3100、inventory 139件/24 pairs の一致もタイマー開始前に確認する。build failure や inventory mismatch があれば時間を比較可能な完走値として報告しない。
4. baseline と同じく、継承環境から `TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|AUTH` に一致する環境変数名を除いて起動する。資格情報を成果物へ保存しない。

## 実行・算出

- 一回だけ実行し、historical baseline と同じ n=1 の測定条件にする。
- 正確な timed command: `pnpm run test:e2e`。
- monotonic clock で process launch の直前から process exit まで計る。build、install、inventory確認、preflight、後処理は含めない。
- command argv、開始/終了時刻、monotonic elapsed seconds、exit code、listed/passed/skipped/failed 件数、raw output path を保存する。
- 短縮秒数 = `222.482656104 - currentElapsedSeconds`。
- 参考短縮率 = `(222.482656104 - currentElapsedSeconds) / 222.482656104 * 100`。
- 経過時間が baseline より長い場合は負の短縮秒数・短縮率をそのまま示す。失敗・中断時は差分を算出せず、status のみを記録する。

## 解釈上の制約

baseline と current は listed 件数が **141 対 139** で異なる。並列実行の揺らぎを推定する反復測定もない（各 n=1）。従って、算出値は現時点の実行所要時間差であり、移行による短縮量の確定値、統計的な改善、または品質受け入れの結論として扱わない。今回の dirty snapshot は後続実装・変更とも異なる可能性がある。clean candidate の正式測定は必要なら別に行う。

## 計測直前の workspace manifest

以下はこの計画を作成中に観測した status の要約であり、最終 snapshot の manifest ではない。正確な状態は上記手順に従い計測直前に保存する。

- Modified: `.depcheckrc`, `.oxfmtrc.json`, `.oxlintrc.json`, `AGENTS.md`, `eslint.config.mjs`, `next-env.d.ts`, `openspec/specs/nextjstest/spec.md`, `package.json`, `skills/jev-review/SKILL.md`, `skills/jev-review/references/requests.md`, `skills/jev-review/scripts/jev-request.mjs`, `src/lib/quarterlyPublicProjection.ts`, `tests/components/CagrPanel.test.tsx`, `tests/components/CustomTooltip.test.tsx`, `tests/components/SpendingBarChart.test.tsx`, `tests/components/all.test.tsx`, `tests/components/plan24-rendering-fixture.test.tsx`, `tests/components/useChartTooltipController.test.tsx`, `tests/e2e/accessibility.e2e.spec.ts`, `tests/e2e/cagr-sheet.e2e.spec.ts`, `tests/e2e/chart-table-csv-parity.e2e.spec.ts`, `tests/e2e/consumption-mobile-acceptance.e2e.spec.ts`, `tests/e2e/consumption-mobile-readability.e2e.spec.ts`, `tests/e2e/cpi-chart-categories.e2e.spec.ts`, `tests/e2e/earnings-tooltip-total.e2e.spec.ts`, `tests/e2e/mobile-ux.e2e.spec.ts`, `tests/e2e/monthly-boundary-axis.e2e.spec.ts`, `tests/e2e/plan24-rendering.e2e.spec.ts`, `tests/e2e/plan27-private-consumption.e2e.spec.ts`, `tests/e2e/quarterly-gdp.e2e.spec.ts`, `tests/e2e/range-change.e2e.spec.ts`, `tests/e2e/real-consumption.e2e.spec.ts`, `tests/e2e/spending-filter.e2e.spec.ts`, `tests/e2e/tooltip-dismiss.e2e.spec.ts`, `tests/e2e/tooltip-stack-total.e2e.spec.ts`, `tests/unit/quarterly-public-projection-boundary.test.ts`, `tsconfig.json`, `vitest.config.ts`.
- Untracked: `.codex/`, `.jev-plan-request.json`, `.jev-plan-review.json`, `.plan42-phase0/`, `.secretlintignore`, `.tmp/`, `9`, `results/plan42/`, `shared_plan/42-assertion-callsite-ledger.md`, `shared_plan/42-assertion-case-responsibility-matrix.md`, `shared_plan/42-happy-dom-e2e-migration-plan.md`, `shared_plan/43-nominal-consumption-shared-legend-plan.md`, `shared_plan/44-audit-log-2026-09-25.md`, `tests/components/LazyMount.test.tsx`, `tests/helpers/`, `tests/unit/csv-parser.test.ts`, `tests/unit/monthly-axis-boundary.test.ts`, `tests/unit/plan27-private-consumption-contract.test.ts`, `tests/unit/real-consumption-contract.test.ts`, `tests/unit/useCpiChartDisplayData.test.ts`.

## 計測結果

計測完了。結果と制約は [current E2E summary](current-e2e-20260925.md)、機械可読値は `current-e2e-20260925.json`、raw output は `current-e2e-20260925.log`、計測直前 snapshot は `current-snapshot-pre-run-20260925.json` に記録した。baseline 222.482656104秒に対し current snapshot は 221.638426491秒で、記述的な観測差は0.844229613秒（約0.38%）短い。JEVは `valid_as_defined` / pass（confidence 0.99、passProbability 1.0、diagnosis complete、clarificationなし）と判定した（[結果レビュー](current-snapshot-measurement-result-jev.json)）。これはdirty workspaceの中間スナップショットを説明する結果の承認であり、因果的な速度改善の証明やPhase 3の最終candidate受け入れではない。件数差（141対139）、各n=1、monotonic endpointsとinventory取得時刻の欠落などの制約はsummaryに記載したとおり。
