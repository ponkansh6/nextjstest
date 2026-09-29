# Batch2 全面 Vitest 標準移行: 最終測定

## 対象と実行条件

Batch2 の全面 Vitest 標準移行後に、対象 10 ファイルを Chromium で一括実行した最終測定です。一括測定は 1 回のみ実施しました。

- Vitest: `v4.1.11`
- Config: `vitest.browser.config.ts`
- Browser provider: `@vitest/browser-playwright`
- Browser: Chromium

## 実行コマンド

```sh
/usr/bin/time -f 'WALL_SECONDS=%e' pnpm exec vitest run --config vitest.browser.config.ts --reporter=dot tests/browser-mode/CpiChart-single-year.browser.test.tsx tests/browser-mode/CpiChart-range-close.browser.test.tsx tests/browser-mode/ChartFilters-max-range.browser.test.tsx tests/browser-mode/SectionTabsTargets.browser.test.tsx tests/browser-mode/SpendingBarChart.browser.test.tsx tests/browser-mode/SpendingBarChart-tooltip-dismiss.browser.test.tsx tests/browser-mode/SpendingBarChart-tooltip-rehover.browser.test.tsx tests/browser-mode/SpendingBarChart-tooltip-total.browser.test.tsx tests/browser-mode/SpendingBarChart-mobile.browser.test.tsx tests/browser-mode/SpendingBarChart-readability.browser.test.tsx
```

## 結果

- Test Files: `10 passed (10)`
- Tests: `39 passed (39)`
- Vitest Duration: `46.08s`
- 外部計測の wall time: `47.16s`
- `git diff --check`: passed

Vitest が表示した集計 `tests` 時間は `65.20s` でした。これは並列実行分が累積した値であり、wall time やファイル単位の所要時間ではありません。`dot` レポーターではファイル単位の所要時間は出力されていません。

## 別途確認された制約

別途実行した型チェックは、今回の Batch2 対象外にある既存ファイル `results/plan46/phase4/vitest-selector-route-probe.browser.test.ts(8,33)` で失敗しました。`BrowserCommands` に `inspectVitestSelectorOnProductionRoute` が存在しないというエラーです。この失敗は上記 Batch2 一括実行の結果には含まれず、Batch2 のテスト実行は全件成功しています。
