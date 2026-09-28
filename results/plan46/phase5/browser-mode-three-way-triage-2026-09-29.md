# Browser Mode 242ケースの三分類トリアージ（2026-09-29）

これはテスト整理の**レビュー提案**であり、テスト削除・変更の承認ではない。既存の[ソースインベントリ](browser-mode-test-inventory-2026-09-28.md)にある全242ケースを、1件ずつ重複なく分類した。各タイトルは同インベントリの記載を保つ。

## 集計

| 範囲                                     | Browser Mode keep | unit/DOMへ移動 | 既存ケースへ統合 | 合計 |
| ---------------------------------------- | ----------------: | -------------: | ---------------: | ---: |
| ソース全体                               |               160 |              9 |               73 |  242 |
| 現行config union（51ファイル）           |               160 |              9 |               42 |  211 |
| config union外のPhase 5診断（2ファイル） |                 0 |              0 |               31 |   31 |

補助内訳: `.tsx` 106件は keep 56 / move 9 / consolidate 41。Production route等のactive `.ts` 105件は keep 104 / consolidate 1（B08 #99）。Phase 5診断31件はすべてconfig union外で、対応するactive routeケースに統合する提案であるため、現行バッチの実行時間は短縮しない。

### 判断上の条件

- consolidate対象を削除する前に、移行先へ元ケース固有のassertion、viewport、series、browser engine条件を移し、移行先の検証を通す。
- source-only Phase 5診断はactive config外であり、統合しても現在のバッチ実行時間は減らない。診断観測と製品要件の同等性を確認する。
- unit/DOMへ移す9件は、真のfocus、event propagation、storage、表示UIに依存する場合はBrowser Modeに残す。DOM層で意味のある挙動を維持できることを確認する。
- 統合後の実行時間への影響は未測定。route E2Eへassertionを移すと、かえって実行時間が増える場合がある。

## Browser Mode keep — 160件（Phase 5統合前のinventory分類）

維持対象は固有の動作、実production route、browser engine、viewport、series/data条件を確認するもの。ここに列挙した各ケースは現時点で独立性があるため維持を推奨する。

### B3m-controls-series-render.browser.test.tsx — 5件

- `B3m Chromium slices › p45-a-advanced-series-normal`
- `B3m Chromium slices › p45-a-cpi-sections`
- `B3m Chromium slices › p45-b-plan24-rendering-71`
- `B3m Chromium slices › p45-b-plan24-rendering-88`
- `B3m Chromium slices › p45-b-tooltip-stack-total-108`

### B3m-responsive-mobile.browser.test.tsx — 3件

- `B3m responsive › p45-b-mobile-ux-243`
- `p45-b-consumption-boundary-85-768`
- `p45-b-consumption-boundary-85-769`

### BottomSheet-focus.browser.test.tsx — 1件

- `BottomSheet focus containment in Chromium › keeps real browser Tab navigation inside the open sheet`

### CagrPanel.browser.test.tsx — 1件

- `CagrPanel in Chromium › closes the actual sheet after clicking its backdrop`

### CpiChart-range-close.browser.test.tsx — 2件

- `CpiChart range selection closes the actual sheet in Chromium › closes the actual sheet after selecting a start year`
- `CpiChart range selection closes the actual sheet in Chromium › closes the actual sheet after selecting an end year`

### CpiChart-renderable-bars.browser.test.tsx — 1件

- `CpiChart bars › P42-457/-458 finite bar contract`

### CpiChart-single-year.browser.test.tsx — 2件

- `CpiChart single-year range in Chromium › selecting one year produces the actual four-period chart result`
- `CpiChart single-year range in Chromium › selecting and extending a one-year range updates periods and bars`

### LazyMount.browser.test.tsx — 1件

- `LazyMount in Chromium › p45-b-mobile-ux-192-lazymount-p5-1 P42-349/-350 mounts after scrolling`

### SectionTabsB3m.browser.test.tsx — 1件

- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-47-case04-webkit`

### SectionTabsTargets.browser.test.tsx — 7件

- `mobile SectionTabs and ChartFilters geometry in Chromium › p45-b-mobile-ux-112-ux-375px-select — P42-336–338: keeps start and end selects nearly equal in width`
- `mobile SectionTabs and ChartFilters geometry in Chromium › p45-b-mobile-ux-140-ux-375px-3 — P42-342–348: aligns both selects and max-range control`
- `mobile SectionTabs and ChartFilters geometry in Chromium › p45-b-mobile-ux-79-ux-375px-select — P42-329–333: keeps max range to the right of end year on the same row`
- `SectionTabs section navigation in Chromium › p45-b-section-tabs-scroll-47-case01-chromium — P42-501/-502: clicking a tab scrolls its real target into view`
- `SectionTabs horizontal overflow in Chromium › p45-b-section-tabs-scroll-120-case01-chromium — P42-505: hides the native scrollbar`
- `SectionTabs horizontal overflow in Chromium › p45-b-section-tabs-scroll-127-case01-chromium — P42-506/-507: remains horizontally scrollable`
- `SectionTabs horizontal overflow in Chromium › p45-b-section-tabs-scroll-142-mask-image-chromium — P42-508/-509: applies the right-edge fade`

### SpendingBarChart-mobile.browser.test.tsx — 8件

- `SpendingBarChart mobile legend and tooltip in Chromium › dark tooltip shows a visible value and closes from its control`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal legend shows controls with 32px touch targets`
- `SpendingBarChart mobile legend and tooltip in Chromium › real legend shows controls with 32px touch targets`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal Recharts hover shows the nominal series payload`
- `SpendingBarChart mobile legend and tooltip in Chromium › real Recharts hover shows the real series payload`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal and real mobile summaries use computed nowrap`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal and real mobile tooltips stay readable inside a 320px viewport`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal legend clear hides every series and selecting one restores its bars`

### SpendingBarChart-readability.browser.test.tsx — 8件

- `SpendingBarChart mobile readability geometry in Chromium › 320px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 320px real chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 375px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 375px real chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 390px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 390px real chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 430px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 430px real chart geometry and rendered axes`

### SpendingBarChart-tooltip-dismiss.browser.test.tsx — 2件

- `Spending tooltip dismissal › dismisses on Escape, chart leave, and outside click`
- `tooltip scroll › 231 P42-538/-539 scroll dismissal`

### SpendingBarChart-tooltip-rehover.browser.test.tsx — 1件

- `Spending tooltip › P42-588/-591 rehover visibility`

### SpendingBarChart-tooltip-scroll.browser.test.tsx — 6件

- `SpendingBarChart mobile tooltip scroll in Chromium › 375x667 nominal tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 375x667 real tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 320x480 nominal tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 320x480 real tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 667x375 landscape nominal tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 667x375 landscape real tooltip scrolls to the close control`

### SpendingBarChart-tooltip-total.browser.test.tsx — 1件

- `SpendingBarChart nominal tooltip total in Chromium › shows the stacked total after hovering a rendered 2022 bar`

### ThemeToggle-style.browser.test.tsx — 1件

- `ThemeToggle Chromium CSS layout › loads the component CSS module into Chromium's computed style`

### batch1-production-route.browser.test.ts — 21件

- `p45-a-a11y-sheet-tab-trap — production route traps keyboard focus in the open sheet`
- `p45-a-cagr-sheet-02 — production sheet accepts a start year and renders its result`
- `p45-a-cagr-sheet-03 — production (10,10) hit test lands on the backdrop and closes the sheet`
- `p45-a-cagr-sheet-04 — production page has no horizontal overflow at 375px`
- `p45-a-cagr-sheet-05 — production open sheet leaves 120px of chart visible at 375x667`
- `p45-a-cagr-sheet-06 — production page omits the CAGR section and tab`
- `p45-a-cagr-sheet-07 — production result sheet does not need inner scrolling`
- `p45-a-cagr-sheet-08 — production result detail and note fit 375x667`
- `p45-a-cagr-sheet-09 — production result detail fits 667x375`
- `p45-a-cpi-legend-scroll — production CPI legend toggle preserves scroll`
- `p45-a-cpi-tooltip-rows — production CPI tooltip has the 12-row root/row contract`
- `p45-a-cpi-tooltip-rows — production hidden CPI series is absent after rehover`
- `p45-a-earnings-hover — production earnings plot hover shows its tooltip`
- `p45-a-earnings-hidden-series-hover — production hidden-series rehover keeps tooltip and separator`
- `p45-a-legend-entertainment-series9 — production CPI legend swatch matches --series-9`
- `p45-a-legend-food-nominal — production spending legend swatch matches --nominal-food`
- `p45-a-legend-dark-all12 — production dark theme exposes all 12 source-colored legends`
- `p45-b-monthly-boundary-axis-21-cpi-2017-12-2018-1-svg — production CPI axis omits both boundary labels`
- `p45-b-monthly-boundary-axis-21-2017-12-2018-1-svg — production earnings axis omits both boundary labels`
- `p45-b-range-change-107-e2e — production route starts with nominal and real bars`
- `p45-b-range-change-187-e2e-1 — production single-year selection renders four periods`

### batch3-a-production-route.browser.test.ts — 10件

- `p45-b-consumption-mobile-readability-52-430px-y-x — production route keeps both charts and axes readable`
- `p45-b-mobile-ux-19-ux — production visible buttons meet their own target thresholds`
- `p45-b-mobile-ux-79-ux-375px-select — production sheet and max button geometry`
- `p45-b-mobile-ux-112-ux-375px-select — production sheet start and end controls have matching widths`
- `p45-b-mobile-ux-140-ux-375px-3 — production sheet controls share one row`
- `p45-b-mobile-ux-192-lazymount-p5-1 — production route initially leaves the lower chart unmounted`
- `p45-b-mobile-ux-201-lazymount-p5-1 — production route mounts the lower chart after scrolling`
- `p45-b-consumption-mobile-readability-297-375x667-tooltip — production tooltip data, viewport bounds, scroll close and dismissal`
- `p45-b-consumption-mobile-readability-297-320x480-tooltip — production tooltip data, viewport bounds, scroll close and dismissal`
- `p45-b-consumption-mobile-readability-297-667x375 landscape-tooltip — production tooltip data, viewport bounds, scroll close and dismissal`

### batch3-b-production-route.browser.test.ts — 10件

- `p45-b-tooltip-dismiss-231-case01 — production touch opens, then scrolling dismisses tooltip and cursor`
- `p45-a-a11y-info-outside-click — production info dialog closes without changing scroll`
- `p45-a-advanced-series-normal — production advanced route publishes registry and table series`
- `p45-a-cagr-sheet-01 — production section trigger opens the CAGR dialog`
- `p45-a-cpi-sections — production CPI section renders an area path`
- `p45-b-plan24-rendering-71 — production ranges render legacy and CTI data without GDP headers`
- `p45-b-plan24-rendering-88 — 2025 production tables contain Q1/Q4 values and tooltips omit GDP`
- `p45-b-tooltip-stack-total-108-e2e-t9 — production area hover exposes live total and transferred row count`
- `p45-b-consumption-boundary-85-768px — production route axes and chart geometry fit viewport`
- `p45-b-consumption-boundary-85-769px — production route axes and chart geometry fit viewport`

### batch4-a-production-route.browser.test.ts — 7件

- `p45-b-mobile-ux-243-sectiontabs-sticky-android-chrome — production route applies sticky compositing transform in mobile browser context`
- `p45-b-consumption-mobile-readability-191-375px-tooltip — production earnings rows and total remain readable in viewport`
- `p45-b-consumption-mobile-readability-191-430px-tooltip — production earnings rows and total remain readable in viewport`
- `p45-b-mobile-ux-65-320px-overflow — production document has no horizontal overflow`
- `p45-b-mobile-ux-65-375px-overflow — production document has no horizontal overflow`
- `p45-b-mobile-ux-65-390px-overflow — production document has no horizontal overflow`
- `p45-b-mobile-ux-65-430px-overflow — production document has no horizontal overflow`

### batch4-b-production-route.browser.test.ts — 7件

- `p45-b-range-change-242-e2e — production range interactions emit no console or page errors`
- `p45-b-range-change-273-e2e — production start-year change preserves scroll within 50px`
- `p45-b-section-tabs-scroll-47-3-chromium — production 3種比較 tab brings its section into the viewport`
- `p45-b-range-change-119-e2e — production spending-chart-nominal data and bars narrow after changing the range`
- `p45-b-range-change-136-e2e — production spending-chart-real data and bars narrow after changing the range`
- `p45-b-range-change-153-e2e — production spending-chart-nominal data and bars narrow after changing the range`
- `p45-b-range-change-170-e2e — production spending-chart-real data and bars narrow after changing the range`

### batch4-b-webkit-production-route.browser.test.ts — 4件

- `p45-b-section-tabs-scroll-120-case02-webkit — production route initially hides the native scrollbar`
- `p45-b-section-tabs-scroll-127-case02-webkit — production WebKit tabs overflow and scroll horizontally`
- `p45-b-section-tabs-scroll-142-mask-image-webkit — production WebKit applies the right-edge mask`
- `p45-b-section-tabs-scroll-47-3-webkit — production iPhone WebKit brings the 3種比較 section into view`

### batch5-lazy-tabs-chromium-production-route.browser.test.ts — 3件

- `p45-b-section-tabs-scroll-82-3-chromium`
- `p45-b-section-tabs-scroll-82-case01-chromium`
- `p45-b-section-tabs-scroll-82-case02-chromium`

### batch5-lazy-tabs-webkit-production-route.browser.test.ts — 3件

- `p45-b-section-tabs-scroll-82-3-webkit`
- `p45-b-section-tabs-scroll-82-case04-webkit`
- `p45-b-section-tabs-scroll-82-case05-webkit`

### batch5-standard-chromium-production-route.browser.test.ts — 1件

- `p45-b-section-tabs-scroll-47-case02-chromium — production desktop route scrolls the earnings target into view`

### batch5-standard-webkit-production-route.browser.test.ts — 1件

- `p45-b-section-tabs-scroll-47-case02-webkit — production iPhone 13 route scrolls the earnings target into view`

### harness-isolation.browser.test.tsx — 2件

- `Browser Mode file-level state isolation › mutates page, storage, cookie, and mock state through a browser interaction`
- `Browser Mode file-level state isolation › starts after the prior test's DOM, theme, storage, cookie, and mocks were reset`

### legend-color-token.browser.test.tsx — 3件

- `chart legend source CSS tokens in Chromium › p45-a-legend-dark-all12 — P42-321: renders all 12 CPI legend buttons under a dark root`
- `chart legend source CSS tokens in Chromium › p45-a-legend-entertainment-series9 — P42-316/-317: renders the CPI series-9 source token on the real legend swatch`
- `chart legend source CSS tokens in Chromium › p45-a-legend-food-nominal — P42-318/-319: renders the nominal-food source token on the real spending legend swatch`

### next-route-poc.browser.test.ts — 1件

- `Playwright Browser Mode custom command observes a production Next chart interaction`

### phase6-b01-cagr-contrast.browser.test.ts — 2件

- `T-A11Y-1 CAGR trigger contrast: default`
- `T-A11Y-1 CAGR trigger contrast: dark`

### phase6-b02-real-legend-contrast.browser.test.ts — 2件

- `T-A11Y-2 real-consumption legend header contrast: default`
- `T-A11Y-2 real-consumption legend header contrast: dark`

### phase6-b03-advanced-series.browser.test.ts — 3件

- `p45-a-advanced-series-adv-query preserves the original advanced-query assertions`
- `p45-a-parity-advanced-anchors preserves complete regular and advanced chart/table/CSV parity`
- `p45-a-parity-hidden-series preserves chart, table, and CSV data when a legend series is hidden`

### phase6-b04-parity.browser.test.ts — 3件

- `p45-a-parity-section-cpi-major preserves full monthly chart, table, and CSV parity`
- `p45-a-parity-section-earnings preserves full monthly chart, table, and CSV parity`
- `p45-a-parity-section-new-graph preserves full monthly chart, table, and CSV parity`

### phase6-b05-parity.browser.test.ts — 2件

- `p45-a-parity-section-residual preserves full monthly chart, table, and CSV parity`
- `p45-a-parity-section-stacked preserves full monthly chart, table, and CSV parity`

### phase6-b06-quarterly.browser.test.ts — 3件

- `B06 Plan27 ID 79: real CTI key boundary`
- `B06 Plan27 ID 9: 52-quarter table and CSV`
- `B06 Plan23 ID 26: quarterly public data`

### phase6-b07-real-consumption.browser.test.ts — 3件

- `B07 #21: extracts 48 quarterly real-consumption Flight rows and checks endpoint support values`
- `B07 #60: loads without hydration or console errors`
- `B07 #82: renders the real-consumption section after selecting its tab through normal LazyMount behavior`

### phase6-b08-real-consumption.browser.test.ts — 2件

- `B08 #128: closed real-consumption accordion hides all section-local legend items`
- `B08 #156: clicking the real-consumption accordion summary reveals its first legend item`

### phase6-b09-real-consumption.browser.test.ts — 1件

- `B09 #174: real-consumption section and summary are visible after scrolling`

### phase6-b10-tooltip-dismiss.browser.test.ts — 3件

- `B10 #138: touchscreen bar tap opens the cursor and close tap clears both`
- `B10 #159: Escape hides the tapped tooltip and same-coordinate retap reopens it`
- `B10 #188: touching the nominal chart heading outside the chart clears close button and cursor`

### phase6-b11-tooltip-dismiss.browser.test.ts — 3件

- `B11 #207: tapping a real chart replaces the single active guide line`
- `B11 #249: a vertical touch gesture ends with the close button hidden`
- `B11 #284: closing and retapping a fresh nominal bar point shows the close button again`

### phase6-b12-chartnote-tooltip.browser.test.ts — 2件

- `B12 #307: deliberately engineered actual link overlap is hit-tested by tooltip and blocks navigation`
- `B12 #430: a real touch on the actual chartNote link outside tooltip navigates and dismisses tooltip`

### phase6-b13-tooltip-dismiss.browser.test.ts — 3件

- `B13 #473: outside-heading touch clears stacked chart cursor and active dots`
- `B13 #508: close touch clears stacked chart active dots`
- `B13 #535: close button is hidden after salary-tab touch and scroll settle`

### phase6-b14-residual-accessibility.browser.test.ts — 4件

- `B14: dark stacked legend hover resets and keeps readable dark-theme contrast`
- `B14: Space toggles the production stacked legend pressed state`
- `B14: keyboard Tab reaches the named legend with a visible focus outline`
- `B14: reduced-motion context disables production header and legend motion`

## Move to non-Browser unit/DOM — 9件

These moves apply only if the destination preserves the listed visible or event-driven contract; otherwise keep the case in Browser Mode.

### B3m-controls-series-render.browser.test.tsx — 2件

- `B3m Chromium slices › p45-a-a11y-info-outside-click` → **ChartInfoButtonのDOMテスト**。保持: 閉じる操作がダイアログ状態に反映され、背後の状態やクリック伝播に影響しないことを保持。
- `B3m Chromium slices › p45-a-cagr-sheet-01` → **CagrPanelのDOMテスト**。保持: トリガー名・表示状態・クリック後の表示を保持。

### CagrPanel.browser.test.tsx — 2件

- `CagrPanel in Chromium › p45-a-cagr-sheet-06 — P42-055/-056: omits the CAGR section and tab in the real section composition` → **CagrSectionCompositionのDOMテスト**。保持: CAGRセクションとタブが組成から欠落することを保持。
- `CagrPanel in Chromium › keeps the dialog open after changing the start year and shows a signed two-decimal result` → **CagrPanelのDOMテスト**。保持: 開始年変更後も開いた状態を保ち、符号付き小数2桁の結果を表示することを保持。

### ChartFilters-max-range.browser.test.tsx — 1件

- `CpiChart maximum range in Chromium › selecting max range updates URL, periods, and quarter filtering` → **ChartFiltersのDOMテスト**。保持: 最大期間選択後のURL、両チャートのperiod、四半期filter stateを保持。

### ChartInfoButton.browser.test.tsx — 1件

- `ChartInfoButton Escape dismissal in Chromium › closes the opened dialog when Escape is pressed` → **ChartInfoButtonのDOMキーボードテスト**。保持: Escapeキーによる実際のイベント処理とダイアログ閉鎖を保持。

### SpendingBarChart.browser.test.tsx — 2件

- `SpendingBarChart empty state in Chromium › announces the empty-state message when every supplied expense series is hidden` → **SpendingBarChartのDOMレンダーテスト**。保持: 全系列非表示時の空状態とアクセシブルな案内を保持。
- `SpendingBarChart quarter filter state in Chromium › p45-b-spending-filter-35-e2e-q1 — P42-511: clicking the actual Q1 control updates its pressed state` → **四半期filterのDOM状態テスト**。保持: Q1選択時のpressed stateと選択状態更新を保持。

### ThemeToggle.browser.test.tsx — 1件

- `ThemeToggle in a real Chromium page › cycles themes through a real browser click and persists each state` → **ThemeToggleのDOMイベント・storageテスト**。保持: クリック伝播、テーマ切替、永続化値、再読込後の状態を保持。

## Consolidate with existing case — 73件（Phase 5統合前のinventory分類）

Consolidation is conditional on first moving each assertion and its scenario constraints to the destination, then verifying that destination.

### B3m-responsive-mobile.browser.test.tsx — 8件

- `B3m responsive › p45-b-consumption-mobile-acceptance-187` → **batch4-a-production-route.browser.test.ts › p45-b-consumption-mobile-readability-191-375px-tooltip**。保持条件: 375pxのSpendingBarChart系列データ、実クリックによるtooltip表示、close操作後の非表示を移植。
- `B3m responsive › p45-b-mobile-ux-47-375` → **batch4-a-production-route.browser.test.ts › p45-b-mobile-ux-65-375px-overflow**。保持条件: 375pxでのCpiChart実containerのscrollWidthがclientWidthを超えないassertionを保持。
- `p45-b-consumption-mobile-readability-191-375` → **batch4-a-production-route.browser.test.ts › p45-b-consumption-mobile-readability-191-375px-tooltip**。保持条件: 同じ幅のPixel 7 viewport、6行と合計、各row/tooltipのviewport内配置を保持。
- `p45-b-consumption-mobile-readability-191-430` → **batch4-a-production-route.browser.test.ts › p45-b-consumption-mobile-readability-191-430px-tooltip**。保持条件: 同じ幅のPixel 7 viewport、6行と合計、各row/tooltipのviewport内配置を保持。
- `p45-b-mobile-ux-65-320` → **batch4-a-production-route.browser.test.ts › p45-b-mobile-ux-65-320px-overflow**。保持条件: 同じ幅でscrollWidthがclientWidthを超えないことを保持。
- `p45-b-mobile-ux-65-375` → **batch4-a-production-route.browser.test.ts › p45-b-mobile-ux-65-375px-overflow**。保持条件: 同じ幅でscrollWidthがclientWidthを超えないことを保持。
- `p45-b-mobile-ux-65-390` → **batch4-a-production-route.browser.test.ts › p45-b-mobile-ux-65-390px-overflow**。保持条件: 同じ幅でscrollWidthがclientWidthを超えないことを保持。
- `p45-b-mobile-ux-65-430` → **batch4-a-production-route.browser.test.ts › p45-b-mobile-ux-65-430px-overflow**。保持条件: 同じ幅でscrollWidthがclientWidthを超えないことを保持。

### CagrPanel.browser.test.tsx — 5件

- `CagrPanel in Chromium › p45-a-cagr-sheet-04 — P42-052: keeps the closed-sheet document within 375px` → **batch1-production-route.browser.test.ts › p45-a-cagr-sheet-04**。保持条件: 375pxで閉じたsheetのdocument横overflowなしを保持。
- `CagrPanel in Chromium › p45-a-cagr-sheet-05 — P42-053/-054: keeps at least 120px of chart visible with the sheet open` → **batch1-production-route.browser.test.ts › p45-a-cagr-sheet-05**。保持条件: 375x667でsheet表示中にchartを120px以上見せる条件を保持。
- `CagrPanel in Chromium › fits the calculated result without internal sheet scrolling at 375x667` → **batch1-production-route.browser.test.ts › p45-a-cagr-sheet-07**。保持条件: 同じ375x667でresult sheet内scrollが不要なことを保持。
- `CagrPanel in Chromium › keeps portrait result detail and note inside 375x667` → **batch1-production-route.browser.test.ts › p45-a-cagr-sheet-08**。保持条件: 375x667で結果詳細と注記がviewport内に収まることを保持。
- `CagrPanel in Chromium › keeps landscape result detail inside 667x375` → **batch1-production-route.browser.test.ts › p45-a-cagr-sheet-09**。保持条件: 667x375で結果詳細がviewport内に収まることを保持。

### CpiChart-range-change.browser.test.tsx — 6件

- `CpiChart range changes › p45-b-range-change-119-e2e` → **batch4-b-production-route.browser.test.ts › p45-b-range-change-119-e2e**。保持条件: 同じ開始/終了変更、nominal/real chart、console/page errorまたはscroll条件を保持。
- `CpiChart range changes › p45-b-range-change-136-e2e` → **batch4-b-production-route.browser.test.ts › p45-b-range-change-136-e2e**。保持条件: 同じ開始/終了変更、nominal/real chart、console/page errorまたはscroll条件を保持。
- `CpiChart range changes › p45-b-range-change-153-e2e` → **batch4-b-production-route.browser.test.ts › p45-b-range-change-153-e2e**。保持条件: 同じ開始/終了変更、nominal/real chart、console/page errorまたはscroll条件を保持。
- `CpiChart range changes › p45-b-range-change-170-e2e` → **batch4-b-production-route.browser.test.ts › p45-b-range-change-170-e2e**。保持条件: 同じ開始/終了変更、nominal/real chart、console/page errorまたはscroll条件を保持。
- `CpiChart range changes › p45-b-range-change-242-e2e` → **batch4-b-production-route.browser.test.ts › p45-b-range-change-242-e2e**。保持条件: 同じ開始/終了変更、nominal/real chart、console/page errorまたはscroll条件を保持。
- `CpiChart range changes › p45-b-range-change-273-e2e` → **batch4-b-production-route.browser.test.ts › p45-b-range-change-273-e2e**。保持条件: 同じ開始/終了変更、nominal/real chart、console/page errorまたはscroll条件を保持。

### CpiChart-range-close.browser.test.tsx — 1件

- `CpiChart legend scroll preservation in Chromium › p45-a-cpi-legend-scroll — P42-263/-264: preserves fixture scroll after a real legend toggle` → **batch1-production-route.browser.test.ts › p45-a-cpi-legend-scroll**。保持条件: 実データfixtureでlegend toggle後のscroll位置を保持。

### CpiChart-single-year.browser.test.tsx — 1件

- `CpiChart single-year range in Chromium › P45 CPI tooltip rows` → **batch1-production-route.browser.test.ts › p45-a-cpi-tooltip-rows**。保持条件: 12行tooltipのroot/row属性・必要な行情報を保持。

### EarningsBreakdownChart.browser.test.tsx — 2件

- `EarningsBreakdownChart tooltip in Chromium › P42-309 earnings separator after hidden-series rehover` → **batch1-production-route.browser.test.ts › p45-a-earnings-hidden-series-hover**。保持条件: hidden-series rehover後のtooltipと区切り線を保持。
- `EarningsBreakdownChart tooltip in Chromium › real earnings plot hover activates visible tooltip content` → **batch1-production-route.browser.test.ts › p45-a-earnings-hover**。保持条件: 実チャートhover後の可視tooltipを保持。

### MonthlyBoundaryAxis.browser.test.tsx — 2件

- `Monthly chart boundary labels in Chromium › p45-b-monthly-boundary-axis-21-cpi-2017-12-2018-1-svg — omits both boundary labels` → **batch1-production-route.browser.test.ts › p45-b-monthly-boundary-axis-21-cpi-2017-12-2018-1-svg**。保持条件: CPIの両境界ラベル除去を保持。
- `Monthly chart boundary labels in Chromium › p45-b-monthly-boundary-axis-21-2017-12-2018-1-svg — omits both earnings boundary labels` → **batch1-production-route.browser.test.ts › p45-b-monthly-boundary-axis-21-2017-12-2018-1-svg**。保持条件: earningsの両境界ラベル除去を保持。

### SectionTabsB3m.browser.test.tsx — 13件

- `B3m SectionTabs › p45-b-section-tabs-scroll-47-case02-chromium` → **batch5-standard-chromium-production-route.browser.test.ts › p45-b-section-tabs-scroll-47-case02-chromium**。保持条件: Chromium給与tab scroll先の可視性を保持。
- `B3m SectionTabs › p45-b-section-tabs-scroll-47-3-chromium` → **batch4-b-production-route.browser.test.ts › p45-b-section-tabs-scroll-47-3-chromium**。保持条件: Chromium 3種比較sectionへのscrollを保持。
- `B3m SectionTabs › p45-b-section-tabs-scroll-82-case01-chromium` → **batch5-lazy-tabs-chromium-production-route.browser.test.ts › p45-b-section-tabs-scroll-82-case01-chromium**。保持条件: 初期未mountとtab click後のnominal section表示を保持。
- `B3m SectionTabs › p45-b-section-tabs-scroll-82-case02-chromium` → **batch5-lazy-tabs-chromium-production-route.browser.test.ts › p45-b-section-tabs-scroll-82-case02-chromium**。保持条件: 初期未mountとtab click後のearnings section表示を保持。
- `B3m SectionTabs › p45-b-section-tabs-scroll-82-3-chromium` → **batch5-lazy-tabs-chromium-production-route.browser.test.ts › p45-b-section-tabs-scroll-82-3-chromium**。保持条件: 初期未mountとtab click後の比較section表示を保持。
- `B3m SectionTabs › p45-b-section-tabs-scroll-120-case02-webkit` → **batch4-b-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-120-case02-webkit**。保持条件: WebKitでnative scrollbarが隠れることを保持。
- `B3m SectionTabs › p45-b-section-tabs-scroll-127-case02-webkit` → **batch4-b-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-127-case02-webkit**。保持条件: WebKitのhorizontal overflowとscroll可能性を保持。
- `B3m SectionTabs › p45-b-section-tabs-scroll-142-mask-image-webkit` → **batch4-b-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-142-mask-image-webkit**。保持条件: WebKitのright-edge maskを保持。
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-47-case05-webkit` → **batch5-standard-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-47-case02-webkit**。保持条件: iPhone WebKit earnings tabのviewport到達を保持。
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-47-3-webkit` → **batch4-b-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-47-3-webkit**。保持条件: iPhone WebKit 3種比較sectionへのscrollを保持。
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-82-case04-webkit` → **batch5-lazy-tabs-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-82-case04-webkit**。保持条件: iPhone WebKitで初期未mountとnominal section表示を保持。
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-82-case05-webkit` → **batch5-lazy-tabs-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-82-case05-webkit**。保持条件: iPhone WebKitで初期未mountとearnings section表示を保持。
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-82-3-webkit` → **batch5-lazy-tabs-webkit-production-route.browser.test.ts › p45-b-section-tabs-scroll-82-3-webkit**。保持条件: iPhone WebKitで初期未mountと比較section表示を保持。

### SectionTabsTargets.browser.test.tsx — 1件

- `mobile SectionTabs tap targets in Chromium › p45-b-mobile-ux-19-ux — P42-323/-324: renders actual section controls meeting the 44px target` → **batch3-a-production-route.browser.test.ts › p45-b-mobile-ux-19-ux — production visible buttons meet their own target thresholds**。保持条件: 44px target条件と各production buttonの個別thresholdを保持。

### SpendingBarChart.browser.test.tsx — 2件

- `SpendingBarChart nominal category filter in Chromium › P45 nominal category bar reduction` → **SpendingBarChart DOM state test (統合)**。保持条件: nominal category filterによるbar減少とclear/remove後のrestoreを1ケース内で双方保持。
- `SpendingBarChart all-series visibility in Chromium › p45-b-consumption-mobile-acceptance-139-mobile-pixel-acceptance-plan25-openspec-1 — P42-180/-183: removes and restores rendered bars` → **SpendingBarChart DOM state test (統合)**。保持条件: nominal category filterによるbar減少とclear/remove後のrestoreを1ケース内で双方保持。

### phase5-interaction-feasibility.browser.test.ts — 18件（統合後は2件を維持、16件を削除）

- `Phase 5 feasibility observation: real-flight` → **phase6-b07-real-consumption.browser.test.ts › B07 #21**。保持条件: 48四半期Flight行、端点support値。
- `Phase 5 feasibility observation: real-hydration` → **phase6-b07-real-consumption.browser.test.ts › B07 #60**。保持条件: hydration/console errorの不在。
- `Phase 5 feasibility observation: real-components` → **phase6-b07-real-consumption.browser.test.ts › B07 #82**。保持条件: tab選択後のreal-consumption section mount/visibility。
- `Phase 5 feasibility observation: real-legend-toggle` → **phase6-b08-real-consumption.browser.test.ts › B08 #128/#156**。保持条件: global legend visibilityとclosed/open accordion時の凡例状態。
- `Phase 5 feasibility observation: real-accordion-closed` → **phase6-b08-real-consumption.browser.test.ts › B08 #128**。保持条件: closed時にsection-local legendがすべて隠れること。
- `Phase 5 feasibility observation: real-accordion-open` → **phase6-b08-real-consumption.browser.test.ts › B08 #156**。保持条件: summary click後に最初のsection-local legendが見えること。
- `Phase 5 feasibility observation: real-accordion-style` → **phase6-b02-real-legend-contrast.browser.test.ts › default/dark**。保持条件: real-consumption legend headerのlight/dark contrast。
- `Phase 5 feasibility observation: touch-open-close` → **phase6-b10-tooltip-dismiss.browser.test.ts › B10 #138**。保持条件: Pixel 7 touchでbar tap表示、close tap後cursor消去。
- `Phase 5 feasibility observation: touch-escape` → **phase6-b10-tooltip-dismiss.browser.test.ts › B10 #159**。保持条件: Pixel 7 tap、Escape dismiss、同座標retap再表示。
- `Phase 5 feasibility observation: touch-outside` → **phase6-b10-tooltip-dismiss.browser.test.ts › B10 #188**。保持条件: Pixel 7 chart外tap後にclose/cursorを消去。
- `Phase 5 feasibility observation: touch-switch-chart` → **phase6-b11-tooltip-dismiss.browser.test.ts › B11 #207**。保持条件: Pixel 7でnominalからrealへ単一guide lineを切替。
- `Phase 5 feasibility observation: touch-swipe-negative` → **phase6-b11-tooltip-dismiss.browser.test.ts › B11 #249**。保持条件: Pixel 7 vertical gesture後にclose buttonを隠す。
- `Phase 5 feasibility observation: touch-retap` → **phase6-b11-tooltip-dismiss.browser.test.ts › B11 #284**。保持条件: Pixel 7 close後retapでclose button再表示。
- `Phase 5 feasibility observation: touch-overlap` → **phase6-b12-chartnote-tooltip.browser.test.ts › B12 #307**。保持条件: Pixel 7の実リンク/tooltip overlap hit-testとnavigation block。
- `Phase 5 feasibility observation: touch-chart-note-navigation` → **phase6-b12-chartnote-tooltip.browser.test.ts › B12 #430**。保持条件: Pixel 7のchartNote link touch navigationとtooltip dismiss。
- `Phase 5 feasibility observation: touch-area-outside` → **phase6-b13-tooltip-dismiss.browser.test.ts › B13 #473**。保持条件: Pixel 7 heading外touchでcursor/dotsをclear。
- `Phase 5 feasibility observation: touch-area-close` → **phase6-b13-tooltip-dismiss.browser.test.ts › B13 #508**。保持条件: Pixel 7 close touch後にactive dotsをclear。
- `Phase 5 feasibility observation: touch-during-tab-scroll` → **phase6-b13-tooltip-dismiss.browser.test.ts › B13 #535**。保持条件: Pixel 7 salary-tab touch/scroll settle後にcloseを隠す。

### phase5-rendering-feasibility.browser.test.ts — 13件（全件削除、4件の固有条件を移行先へ統合）

- `Phase 5 rendering feasibility observation: p45-a-a11y-real-legend-header-default` → **phase6-b02-real-legend-contrast.browser.test.ts › default**。保持条件: default themeのlegend header contrast ratio。
- `Phase 5 rendering feasibility observation: p45-a-a11y-real-legend-header-dark` → **phase6-b02-real-legend-contrast.browser.test.ts › dark**。保持条件: dark themeのlegend header contrast ratio。
- `Phase 5 rendering feasibility observation: p45-a-advanced-series-adv-query` → **phase6-b03-advanced-series.browser.test.ts › p45-a-advanced-series-adv-query**。保持条件: original advanced-query assertion。
- `Phase 5 rendering feasibility observation: p45-a-parity-advanced-anchors` → **phase6-b03-advanced-series.browser.test.ts › p45-a-parity-advanced-anchors**。保持条件: regular/advanced chart-table-CSV parity。
- `Phase 5 rendering feasibility observation: p45-a-parity-hidden-series` → **phase6-b03-advanced-series.browser.test.ts › p45-a-parity-hidden-series**。保持条件: hidden series時のchart/table/CSV保持。
- `Phase 5 rendering feasibility observation: p45-a-parity-section-cpi-major` → **phase6-b04-parity.browser.test.ts › p45-a-parity-section-cpi-major**。保持条件: CPI major chart/table/CSV parity。
- `Phase 5 rendering feasibility observation: p45-a-parity-section-earnings` → **phase6-b04-parity.browser.test.ts › p45-a-parity-section-earnings**。保持条件: earnings chart/table/CSV parity。
- `Phase 5 rendering feasibility observation: p45-a-parity-section-new-graph` → **phase6-b04-parity.browser.test.ts › p45-a-parity-section-new-graph**。保持条件: new-graph chart/table/CSV parity。
- `Phase 5 rendering feasibility observation: p45-a-parity-section-residual` → **phase6-b05-parity.browser.test.ts › p45-a-parity-section-residual**。保持条件: residual chart/table/CSV parity。
- `Phase 5 rendering feasibility observation: p45-a-parity-section-stacked` → **phase6-b05-parity.browser.test.ts › p45-a-parity-section-stacked**。保持条件: stacked chart/table/CSV parity。
- `Phase 5 rendering feasibility observation: p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real` → **phase6-b06-quarterly.browser.test.ts › B06 Plan27 ID 79**。保持条件: Pixel 7 contextとCTI key boundary。
- `Phase 5 rendering feasibility observation: p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi` → **phase6-b06-quarterly.browser.test.ts › B06 Plan27 ID 9**。保持条件: Pixel 7 context、52-quarter table/CSV、不正後続値。
- `Phase 5 rendering feasibility observation: p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-` → **phase6-b06-quarterly.browser.test.ts › B06 Plan23 ID 26**。保持条件: quarterly public projection ready state。

### phase6-b08-real-consumption.browser.test.ts — 1件

- `B08 #99: first page-global legend item is visible and the source click attempt completes its settle interval` → **phase6-b08-real-consumption.browser.test.ts › B08 #156 only after its first assertion is extended to check page-global first-legend visibility**。保持条件: preserve the original page-global first-legend visibility assertion; then keep #156’s accordion-open local legend assertion. If this assertion cannot be preserved, keep #99 in Browser Mode.。

## Phase 5 統合後の状態

Phase 5診断のwrapper 31件中29件を削除した。interaction側は`real-legend-toggle`と`touch-swipe-negative`の2件を維持し、他16件を削除した。rendering側は13件すべてを削除した。

移行した12件の条件は次のactiveケースで直接assertする: `real-hydration`→B07 #60（1秒settle後のpage/console error不在）、closed/open accordion→B08 #128/#156（detailsの状態）、touch close/Escape retap/outside/retap/overlap→B10 #138/#159/#188、B11 #284、B12 #307（tooltip/close状態とURL/hash不変）、advanced query/anchors/hidden series→B03の各ケース（reload後のqueryと5 series、pressed遷移とSVG geometry変化、既存chart/table/CSV不変条件）、Plan27 ID9→B06（正サイズbar rect）。Phase 5の`*.route.command.ts`診断定義は変更していない。

## 対象範囲と注記

対象は既存インベントリで定義した標準Browser Mode config union（全`.tsx` Browser Mode tests、aggregate Chromium、WebKit）のactive 51ファイル・211ケースと、union外に記録されたPhase 5診断31ケース。source-only Phase 5診断の除外は対象範囲の可視化であり、実行中のactive batchからの削除や時間短縮を意味しない。

今回の統合では上記Phase 5 wrapperと移行先assertionを変更した。テストは実行していない。
