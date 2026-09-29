# Batch2全面Vitest Browser Mode移行計画

## 目的・完了条件

Batch2で確認したいのは、production routeの再現ではなく、CpiChart、SectionTabs、ChartFilters、SpendingBarChartのユーザー向け表示・操作契約である。既存のrenderBrowserComponentでVitest test iframeへClient Componentをmountし、Vitest Browser Modeの公開APIとiframe内DOMで確認する。Next route、SSR、Flight、hydration、production data loadingは目的に含めない。

完了条件:

1. 現行Chromium 20ケースの各期待結果を下表の既存/追加component assertionへ対応させる。
2. 対象テストからcommands、Playwright locator/page/mouse/touchscreen、独立Page、route navigationへの直接依存をなくす。
3. page.getByRole/getByLabelText/getByTestId、userEvent、expect.element、iframe内native DOMを用いる。
4. route専用Batch2 test/commandとconfig登録を削除する。@vitest/browser-playwrightはChromium起動用providerとして残す。
5. spec.mdのOperational validation contractsを更新する。アプリ本体のData Sources/Data Flow/Component Treeは変更しない。

固定データと固定viewportで可視・操作可能な契約が確認できればよい。実端末touch、browser zoom、iPhone WebKit、production routeの手順を再現しない。

## 現行20ケースのcoverage対応表

既存テスト欄は、その契約の一部をVitest component testが既に確認するという意味であり、production routeの全挙動を検証済みという意味ではない。

| 現行ケース                                                                | Vitest標準で確認する期待                                                                                            | 既存coverage・追加作業                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| range-two-year — p45-b-range-change-200-e2e-2                             | 2017単年は4期間、2017–2018はnominal/real各8期間。契約データに対応するbarが描画され、URL queryが選択期間を反映する。 | CpiChart-single-year.browser.test.tsx の p45-b-range-change-187-e2e-1 が実ChartFilters操作と4/8期間を確認済み。query同期と両chartのbar/契約値数を追加。                                                      |
| range-sheet-close — p45-b-range-change-215-e2e                            | 開始年、終了年の選択後に期間シートが閉じる。                                                                        | CpiChart-range-close.browser.test.tsx に両選択後のsheet close coverageあり。期待条件との対応を確認して流用。                                                                                                 |
| range-max-url — p45-b-range-change-303-e2e-2005-url                       | custom rangeがqueryに反映され、最大期間操作後にfixture最小/最大年、sheet close、chart data表示となる。              | ChartFilters-max-range.browser.test.tsx の P45 max range values はボタンと年値のみ。CpiChart接続後のquery、close、期間を追加。                                                                               |
| section-tab-target — p45-b-section-tabs-scroll-47-case01-chromium         | tab操作で対象sectionがviewport内に来る。                                                                            | SectionTabsTargets.browser.test.tsx の同名caseがsynthetic targetへのscrollを確認済み。                                                                                                                       |
| section-scrollbar — p45-b-section-tabs-scroll-120-case01-chromium         | overflow tabsのnative scrollbarを隠す。                                                                             | SectionTabsTargets.browser.test.tsx の同名caseでcomputed styleを確認済み。                                                                                                                                   |
| section-horizontal-scroll — p45-b-section-tabs-scroll-127-case01-chromium | tab containerが横overflowし、scroll positionを進められる。                                                          | SectionTabsTargets.browser.test.tsx の同名caseでscrollWidth/clientWidthとscrollLeftを確認済み。                                                                                                              |
| section-mask — p45-b-section-tabs-scroll-142-mask-image-chromium          | tabs右端にfade maskがある。                                                                                         | SectionTabsTargets.browser.test.tsx の同名caseでmaskImage/webkitMaskImageを確認済み。                                                                                                                        |
| spending-q1-filter — p45-b-spending-filter-35-e2e-q1                      | Q1を隠すとbarが減る。全四半期を隠すとbarが消え、戻すと復元する。                                                    | SpendingBarChart.browser.test.tsx の同名caseはaria-pressedだけ。固定四半期fixtureのbar減少/ゼロ/復元を追加。                                                                                                 |
| spending-category-filter — p45-b-spending-filter-64-e2e                   | 食料カテゴリを隠すとbarが減り、chartは表示されたまま。                                                              | SpendingBarChart.browser.test.tsx の P45 nominal category bar reduction がbar減少を確認済み。aria-pressedとchart visibilityを追加。                                                                          |
| tooltip-escape — p45-b-tooltip-dismiss-578-chromium-escape-dismiss        | hoverで開き、Escapeで閉じ、rehoverで開き、chart外へ移ると閉じる。                                                   | SpendingBarChart-tooltip-dismiss.browser.test.tsx の hover and Escape dismiss は表示/Escapeのみ。rehover/mouseleaveを追加。outside clickも目的ならuserEvent clickで追加。                                    |
| tooltip-total — p45-b-tooltip-stack-total-65-e2e-t7-2022                  | 固定値barのhoverで合計行が表示され、ラベルと集計値が合う。                                                          | SpendingBarChart-tooltip-total.browser.test.tsx の shows the actual total contract after hovering a rendered 2022 bar が対応済み。fixtureの期待集計値を明示する。                                            |
| tooltip-hidden-row — p45-b-tooltip-stack-total-81-e2e-t8-tooltip          | tooltipを開き食料を隠してrehoverすると、tooltipは表示されたまま食料行が消える。                                     | SpendingBarChart-tooltip-rehover.browser.test.tsx の P42-588/-591 rehover visibility は同一契約ではない。食料行count=0、tooltip表示、aria stateを追加。                                                      |
| mobile-legend-size — p45-b-consumption-mobile-acceptance-37               | nominal/real legendを開くと各操作buttonが32 CSS px以上。                                                            | SpendingBarChart-mobile.browser.test.tsx の nominal/real legend shows controls with 32px touch targets が対応済み。touch emulationはせずiframe viewportで測る。                                              |
| mobile-tooltip-style — p45-b-consumption-mobile-acceptance-63             | nominal/real tooltipがviewport内、total文字16px以上、category label 14px以上、値は右寄せ。                          | B3m-responsive-mobile.browser.test.tsx の p45-b-consumption-mobile-acceptance-187 はtooltip open/closeのみ。固定fixtureの両chartでstyle/rect assertionを追加。                                               |
| mobile-summary — p45-b-consumption-mobile-acceptance-122                  | nominal/real summaryは初期closed、可視、非空、nowrap。                                                              | SpendingBarChart-mobile.browser.test.tsx の nominal and real mobile summaries use computed nowrap はnowrapのみ。details state、visibility、textを追加。                                                      |
| mobile-hide-restore — p45-b-consumption-mobile-acceptance-139             | series全解除でaria-pressed=falseかつbarなし。ひとつ戻すとaria-pressed=trueかつbar復元。                             | SpendingBarChart.browser.test.tsx の plan25 all-series case がbar解除/復元を確認済み。userEvent操作とARIA stateを明記する。                                                                                  |
| mobile-dark-zoom-tooltip — p45-b-consumption-mobile-acceptance-161        | dark themeでmobile tooltipにカテゴリ、値、close buttonがあり、closeで閉じる。                                       | SpendingBarChart-mobile.browser.test.tsx の P42-187/-190 はdark category、B3m-responsive-mobile.browser.test.tsx はmobile closeを確認済み。固定dark fixtureで値とcloseを併せて追加。browser zoom自体は除外。 |
| readability-320 — p45-b-consumption-mobile-readability-52-320px-y-x       | nominal/realのaxis、barが320幅で読め、iframe documentに横overflowがない。                                           | SpendingBarChart-readability.browser.test.tsx の320px nominal/real geometry testsがchart geometryを確認済み。iframe document overflowを追加/明確化。                                                         |
| readability-375 — p45-b-consumption-mobile-readability-52-375px-y-x       | 同条件を375幅で確認。                                                                                               | 同specの375px nominal/real geometry testsが対応。viewport内のtick labels、bar、横overflowを明記。                                                                                                            |
| readability-390 — p45-b-consumption-mobile-readability-52-390px-y-x       | 同条件を390幅で確認。                                                                                               | 同specの390px nominal/real geometry testsが対応。viewport内のtick labels、bar、横overflowを明記。                                                                                                            |

現行batch2-section-tabs-webkit.browser.test.tsの4ケースはSectionTabsの同種CSS/scroll契約をWebKit route上で測るものなので、Chromium iframe component coverageで目的を満たし、WebKit固有実行は移行対象外とする。route HTTP 200、最新のproduction year、production data、hydration、iPhone device profile、document全体のroute overflowも対象外とし、component testで代替済みと主張しない。

## FixtureとAPIの方針

- CpiChart、SectionTabs、ChartFilters、SpendingBarChartを既存renderBrowserComponentでrenderする。新たな大きなprovider wrapperは作らない。
- Next固有のuseSearchParamsだけを既存と同様vi.mock("next/navigation", ...)で固定snapshotへmockする。変更されるfrom/to queryはiframe内window.historyとlocationで確認する。React、Recharts、対象componentはmockしない。
- deterministicなnominal/real/quarter/chart dataを用意し、合計値とperiod数を手計算できるようにする。route fetchや時刻依存dataは使わない。
- viewportはVitest page.viewport(width, height)。操作はuserEvent.click/selectOptions/hover/keyboard。非同期状態はexpect.elementで待つ。
- geometry、computed style、SVG tick、tooltip rowsはiframe内native DOMから同期的に読む。getBoundingClientRectとdocument/body scrollWidthを必要な箇所で比較する。waitForFunctionの再実装はしない。
- locatorのselector文字列だけVitestから作り、provider-side Playwright Pageで実行する形は採らない。対象specからBrowserCommand経路をなくす。

## 依存順の変更計画

|  順 | 作業                                                                   | ファイル所有範囲                                                                                                                                                                                                                                                                                                       | 完了条件                                                                                                                             |
| --: | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | coverage表と既存assertionを照合。range/sheet/max-rangeの不足を埋める。 | CpiChart-single-year.browser.test.tsx、CpiChart-range-close.browser.test.tsx、ChartFilters-max-range.browser.test.tsx                                                                                                                                                                                                  | query/period/bar count、sheet close、最大期間を含む。計画JEV初回判定を記録。                                                         |
|   2 | SectionTabsとfilter操作をVitest標準で完結させる。                      | SectionTabsTargets.browser.test.tsx、SpendingBarChart.browser.test.tsx                                                                                                                                                                                                                                                 | tab scroll/overflow/mask、Q1全状態、category stateとbar減少がDOMで確認される。                                                       |
|   3 | tooltip/mobile/readability不足を固定fixtureで補完。                    | SpendingBarChart-tooltip-dismiss.browser.test.tsx、SpendingBarChart-tooltip-rehover.browser.test.tsx、SpendingBarChart-mobile.browser.test.tsx、SpendingBarChart-readability.browser.test.tsx                                                                                                                          | 対応表のtooltip、dark/mobile、summary、320/375/390条件がそろう。implementation JEV checkpointを実施。                                |
|   4 | route-only Batch2 specs/commandと登録を削除。                          | 削除: batch2-production-route.browser.test.ts、batch2-section-tabs-webkit.browser.test.ts、batch2-route.command.ts。変更: vitest.browser.next-route.config.ts、vitest.browser.aggregate-chromium.config.ts、vitest.browser.webkit.config.ts、aggregate-chromium.sequencer.ts、tests/unit/next-route-poc-runner.test.ts | import、command registry、include、sequencer、unit guardからdangling referenceがない。残存する他バッチ登録は維持。                   |
|   5 | Operational validation contractsを実装と同期。                         | openspec/specs/nextjstest/spec.mdのOperational validation contractsのみ                                                                                                                                                                                                                                                | WHEN/THENでVitest公開API、iframe component fixture、coverage限界を記録。Data Sources/Data Flow/Component Treeとapp要件は変更しない。 |
|   6 | 結果一覧と一回のfocused timing記録を作る。                             | results/plan46/phase5/                                                                                                                                                                                                                                                                                                 | 20件の新旧対応、route対象外、検証結果、計測条件を記録し、証拠追加後にJEV初回再判定。                                                 |

route test/commandの削除はcoverage対応を実装してから行う。既存component specを優先して小さく拡張し、routeケースの一括コピーで重複specを作らない。

## 仕様書追記案

Operational validation contracts内のBrowser Mode shared render and interaction helpersを次の意味に更新する。

- component Browser Mode testはrenderBrowserComponentでClient ComponentをVitest test iframeへrenderする。
- UI queryはVitest Browser公開APIのgetByRole/getByLabelText/getByTestId、操作はVitest userEvent、非同期 assertionはexpect.elementを使用する。
- chart geometry/computed styleの測定にはiframe内native DOMを使用する。
- component fixture testはClient Componentの表示・操作を検証する。Next route、SSR、Flight、hydration、production data loadingを検証したとは扱わない。
- @vitest/browser-playwrightはbrowser providerとして残るが、Batch2 component specsはPlaywright APIやBrowser Commandsを直接呼ばない。

新しいWHEN/THEN scenarioはrange query、SectionTabs target、quarter/category filter、tooltip、mobile controls/readabilityを規定する。HTTP status、production latest year、route URLは含めない。

## 検証・レビューゲート

実装担当と検証担当を分離し、親agentが変更差分と指示の一致を確認した後に実行する。

1. 本書20行全てを新規/既存の具体的test assertionへ対応させる。WebKit routeとproduction route専用条件は「対象外」に明示し、component testで代替したと言わない。
2. Batch2対象specにcommands、@playwright/test、Playwright locator/page/mouse/touchscreen、route navigationがないこと、configにinspectBatch2ProductionCaseとBatch2 test参照がないことを検索確認する。
3. 変更したBrowser Mode specs/configにlintとtype-checkを実行する。変更specをVitest Browser Mode Chromiumで選択実行する。関連unit guardも実行する。他バッチの全suiteは必要性がなければ走らせない。
4. coverage対応表、spec refs、git diff --check、route config参照の整合性を確認する。production smokeが他目的で必要なら別記し、component testの成功条件と混同しない。
5. JEVは計画初回、段階3の実装checkpoint、最終証拠後の初回再判定で実施する。初回所見が理由項目またはindeterminateならAGENTS.mdの一回限りのchoice follow-up/診断要件に従い、欠落時はunresolvedで記録する。API/HTTP成功を妥当性判定と混同しない。

## 一回だけの時間測定

移行後のfocused Batch2 component spec群を一度だけ計測し、再計測しない。比較値は未変更focused production-route Batch2 runのVitest file duration約63.856秒（20 route cases、profile assertion sum約63.8318秒）。移行後はiframeへのcomponent mountと固定fixtureを測り、production Next navigation、hydration/networkidle、独立Page/context、production data待機を含まない。そのため数値差をprovider自体の速度改善率とは解釈しない。実行command、browser、test件数、file/CLI/wall duration、tree状態を記録する。
