# Browser Mode 9件のDOM/単体移行結果（2026-09-29）

## 実施結果

承認済み計画の9件をDOM/単体テストへ移し、source側の該当Browser Modeケースを退役させた。source-only Phase 5の2件には変更なし。

|   # | 退役したBrowser Modeケース                                                        | 移行先DOMテスト             | 移行したassertion                                                                                                                                                                                                                                                                       |
| --: | --------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | `B3m-controls-series-render.browser.test.tsx` › `p45-a-a11y-info-outside-click`   | `ChartInfoButton.test.tsx`  | 実ボタンのpointer/clickでdialogが閉じ、外側actionが一度実行され、triggerが閉状態になる。既存inside-pointerdownテストも保持。                                                                                                                                                            |
|   2 | `B3m-controls-series-render.browser.test.tsx` › `p45-a-cagr-sheet-01`             | `CagrPanel.test.tsx` T3     | 名前付きCAGR dialogがroleで取得でき、開いた状態で3 selectと計算ボタンを表示。                                                                                                                                                                                                           |
|   3 | `CagrPanel.browser.test.tsx` › `p45-a-cagr-sheet-06`                              | `CpiChart.test.tsx`         | 実CpiChartSectionsとSectionTabs compositionでCAGR triggerを表示し、CAGR sectionと「CPI年率」tabを持たない。                                                                                                                                                                             |
|   4 | `CagrPanel.browser.test.tsx` › 開始年変更後のsigned resultケース                  | `CagrPanel.test.tsx`        | 実useCagrState fixtureをUI操作し、開始年選択後もdialogを開いたまま計算し、`-12.94%`を表示。                                                                                                                                                                                             |
|   5 | `ChartFilters-max-range.browser.test.tsx` › 統合max-rangeケース（ファイル内唯一） | `CpiChart.test.tsx`         | 実CpiChart、ChartFilters、URL/data計算を使用。useSearchParams mockはwindow.locationを読む。Area/bar presentation mockのperiod/矩形は実data propsから生成。custom→maxのCPI月次期間、reopen後の選択年2005/2025、URL query除去、名目/実質のperiodとbar、Q1 aria遷移および縮小/復元を確認。 |
|   6 | `ChartInfoButton.browser.test.tsx` › Escape dismissal（ファイル内唯一）           | `ChartInfoButton.test.tsx`  | 既存Escape操作でdialog閉鎖と`aria-expanded=false`を確認。                                                                                                                                                                                                                               |
|   7 | `SpendingBarChart.browser.test.tsx` › 全系列非表示empty-stateケース               | `SpendingBarChart.test.tsx` | role=statusと空状態の完全一致文言。                                                                                                                                                                                                                                                     |
|   8 | `SpendingBarChart.browser.test.tsx` › `p45-b-spending-filter-35-e2e-q1`           | `SpendingBarChart.test.tsx` | 既存controlled-quarterケースでQ1 true→false→true。Q2–Q4も各往復する。                                                                                                                                                                                                                   |
|   9 | `ThemeToggle.browser.test.tsx` › click/persistenceケース（ファイル内唯一）        | `ThemeToggle.test.tsx`      | 既存DOMテストでsystem→light→dark→systemのクリック後のlocalStorageと`data-theme`を確認。saved stateの初期化テストも保持。                                                                                                                                                                |

ThemeToggleの元Browser Modeケースはreload後の状態をassertしていない。移行対象はクリック後のtheme表示・localStorage・`data-theme`であり、reload persistenceはpredicateではない。saved dark/light値の復元とstorageなしのsystem初期状態は既存DOM initialization casesが別途確認する。

## 検証

Orchestratorが移行先を先に実行し、以下が成功した。

```sh
pnpm exec vitest run --config vitest.config.ts tests/components/ChartInfoButton.test.tsx tests/components/CagrPanel.test.tsx tests/components/SpendingBarChart.test.tsx tests/components/ThemeToggle.test.tsx tests/components/CpiChart.test.tsx
```

結果: **5 files passed, 72/72 tests passed**。Browser Mode suiteは実行していない。

## 件数

- active config union: 194→185（9件減）
- source-only Phase 5: 2→2
- 全ソースケース: 196→187（9件減）

inventoryは元の242ケースの履歴スナップショットとして維持した。ChartFiltersとSpendingBarChartの既存index stagingには触れていない。該当sourceファイル削除・case削除はworking tree側に反映されており、今回`git add`はしていない。

計画レビューのJEV結果 `valid_as_defined` は[既存の計画レビュー記録](jev-browser-mode-dom-unit-migration-plan-review-result.json)に保持し、変更していない。実装チェックポイントのJEV判定は `valid_as_defined`（合格）、diagnosis complete、clarificationなし。[実装チェックポイント結果](jev-browser-mode-dom-unit-migration-implementation-checkpoint-result.json)に記録した。過去の他のJEV判定も再解釈・上書きしていない。
