# Browser Modeテストソース一覧（2026-09-28）

ソースツリーに定義された全53ファイル・242ケースを、ファイルごとに列挙する。ここでの標準Browser Mode unionは `vitest.browser.config.ts` の`.tsx` include、`vitest.browser.aggregate-chromium.config.ts`、および `vitest.browser.webkit.config.ts` のincludeを合わせたものとする。これには51ファイル・211ケースが含まれる。phase5 feasibilityの2ファイル・31ケースはこのunionのinclude外なので **[対象外]** と明記した（各feasibility専用configでの単独実行対象かどうかとは区別する）。

| 区分                                  | ファイル数 | ケース数 |
| ------------------------------------- | ---------: | -------: |
| 標準Browser Mode config union         |         51 |      211 |
| phase5 feasibility（標準union対象外） |          2 |       31 |
| ソース全体                            |         53 |      242 |

ケース名はテスト定義のソース文字列を採用した。ループから生成されるタイトルはソース内の値で展開した。重複タイトルも別ケースとして記載する。

## B3m-controls-series-render.browser.test.tsx — 7件

- `B3m Chromium slices › p45-a-a11y-info-outside-click`
- `B3m Chromium slices › p45-a-advanced-series-normal`
- `B3m Chromium slices › p45-a-cagr-sheet-01`
- `B3m Chromium slices › p45-a-cpi-sections`
- `B3m Chromium slices › p45-b-plan24-rendering-71`
- `B3m Chromium slices › p45-b-plan24-rendering-88`
- `B3m Chromium slices › p45-b-tooltip-stack-total-108`

## B3m-responsive-mobile.browser.test.tsx — 11件

- `B3m responsive › p45-b-consumption-mobile-acceptance-187`
- `B3m responsive › p45-b-mobile-ux-243`
- `B3m responsive › p45-b-mobile-ux-47-375`
- `p45-b-consumption-boundary-85-768`
- `p45-b-consumption-boundary-85-769`
- `p45-b-consumption-mobile-readability-191-375`
- `p45-b-consumption-mobile-readability-191-430`
- `p45-b-mobile-ux-65-320`
- `p45-b-mobile-ux-65-375`
- `p45-b-mobile-ux-65-390`
- `p45-b-mobile-ux-65-430`

## BottomSheet-focus.browser.test.tsx — 1件

- `BottomSheet focus containment in Chromium › keeps real browser Tab navigation inside the open sheet`

## CagrPanel.browser.test.tsx — 8件

- `CagrPanel in Chromium › p45-a-cagr-sheet-06 — P42-055/-056: omits the CAGR section and tab in the real section composition`
- `CagrPanel in Chromium › p45-a-cagr-sheet-04 — P42-052: keeps the closed-sheet document within 375px`
- `CagrPanel in Chromium › p45-a-cagr-sheet-05 — P42-053/-054: keeps at least 120px of chart visible with the sheet open`
- `CagrPanel in Chromium › keeps the dialog open after changing the start year and shows a signed two-decimal result`
- `CagrPanel in Chromium › closes the actual sheet after clicking its backdrop`
- `CagrPanel in Chromium › fits the calculated result without internal sheet scrolling at 375x667`
- `CagrPanel in Chromium › keeps portrait result detail and note inside 375x667`
- `CagrPanel in Chromium › keeps landscape result detail inside 667x375`

## ChartFilters-max-range.browser.test.tsx — 1件

- `CpiChart maximum range in Chromium › selecting max range updates URL, periods, and quarter filtering`

## ChartInfoButton.browser.test.tsx — 1件

- `ChartInfoButton Escape dismissal in Chromium › closes the opened dialog when Escape is pressed`

## CpiChart-range-change.browser.test.tsx — 6件

- `CpiChart range changes › p45-b-range-change-119-e2e`
- `CpiChart range changes › p45-b-range-change-136-e2e`
- `CpiChart range changes › p45-b-range-change-153-e2e`
- `CpiChart range changes › p45-b-range-change-170-e2e`
- `CpiChart range changes › p45-b-range-change-242-e2e`
- `CpiChart range changes › p45-b-range-change-273-e2e`

## CpiChart-range-close.browser.test.tsx — 3件

- `CpiChart range selection closes the actual sheet in Chromium › closes the actual sheet after selecting a start year`
- `CpiChart range selection closes the actual sheet in Chromium › closes the actual sheet after selecting an end year`
- `CpiChart legend scroll preservation in Chromium › p45-a-cpi-legend-scroll — P42-263/-264: preserves fixture scroll after a real legend toggle`

## CpiChart-renderable-bars.browser.test.tsx — 1件

- `CpiChart bars › P42-457/-458 finite bar contract`

## CpiChart-single-year.browser.test.tsx — 3件

- `CpiChart single-year range in Chromium › selecting one year produces the actual four-period chart result`
- `CpiChart single-year range in Chromium › selecting and extending a one-year range updates periods and bars`
- `CpiChart single-year range in Chromium › P45 CPI tooltip rows`

## EarningsBreakdownChart.browser.test.tsx — 2件

- `EarningsBreakdownChart tooltip in Chromium › P42-309 earnings separator after hidden-series rehover`
- `EarningsBreakdownChart tooltip in Chromium › real earnings plot hover activates visible tooltip content`

## LazyMount.browser.test.tsx — 1件

- `LazyMount in Chromium › p45-b-mobile-ux-192-lazymount-p5-1 P42-349/-350 mounts after scrolling`

## MonthlyBoundaryAxis.browser.test.tsx — 2件

- `Monthly chart boundary labels in Chromium › p45-b-monthly-boundary-axis-21-cpi-2017-12-2018-1-svg — omits both boundary labels`
- `Monthly chart boundary labels in Chromium › p45-b-monthly-boundary-axis-21-2017-12-2018-1-svg — omits both earnings boundary labels`

## SectionTabsB3m.browser.test.tsx — 14件

- `B3m SectionTabs › p45-b-section-tabs-scroll-47-case02-chromium`
- `B3m SectionTabs › p45-b-section-tabs-scroll-47-3-chromium`
- `B3m SectionTabs › p45-b-section-tabs-scroll-82-case01-chromium`
- `B3m SectionTabs › p45-b-section-tabs-scroll-82-case02-chromium`
- `B3m SectionTabs › p45-b-section-tabs-scroll-82-3-chromium`
- `B3m SectionTabs › p45-b-section-tabs-scroll-120-case02-webkit`
- `B3m SectionTabs › p45-b-section-tabs-scroll-127-case02-webkit`
- `B3m SectionTabs › p45-b-section-tabs-scroll-142-mask-image-webkit`
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-47-case04-webkit`
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-47-case05-webkit`
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-47-3-webkit`
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-82-case04-webkit`
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-82-case05-webkit`
- `B3m SectionTabs WebKit › p45-b-section-tabs-scroll-82-3-webkit`

## SectionTabsTargets.browser.test.tsx — 8件

- `mobile SectionTabs and ChartFilters geometry in Chromium › p45-b-mobile-ux-112-ux-375px-select — P42-336–338: keeps start and end selects nearly equal in width`
- `mobile SectionTabs and ChartFilters geometry in Chromium › p45-b-mobile-ux-140-ux-375px-3 — P42-342–348: aligns both selects and max-range control`
- `mobile SectionTabs and ChartFilters geometry in Chromium › p45-b-mobile-ux-79-ux-375px-select — P42-329–333: keeps max range to the right of end year on the same row`
- `mobile SectionTabs tap targets in Chromium › p45-b-mobile-ux-19-ux — P42-323/-324: renders actual section controls meeting the 44px target`
- `SectionTabs section navigation in Chromium › p45-b-section-tabs-scroll-47-case01-chromium — P42-501/-502: clicking a tab scrolls its real target into view`
- `SectionTabs horizontal overflow in Chromium › p45-b-section-tabs-scroll-120-case01-chromium — P42-505: hides the native scrollbar`
- `SectionTabs horizontal overflow in Chromium › p45-b-section-tabs-scroll-127-case01-chromium — P42-506/-507: remains horizontally scrollable`
- `SectionTabs horizontal overflow in Chromium › p45-b-section-tabs-scroll-142-mask-image-chromium — P42-508/-509: applies the right-edge fade`

## SpendingBarChart-mobile.browser.test.tsx — 8件

- `SpendingBarChart mobile legend and tooltip in Chromium › dark tooltip shows a visible value and closes from its control`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal legend shows controls with 32px touch targets`
- `SpendingBarChart mobile legend and tooltip in Chromium › real legend shows controls with 32px touch targets`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal Recharts hover shows the nominal series payload`
- `SpendingBarChart mobile legend and tooltip in Chromium › real Recharts hover shows the real series payload`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal and real mobile summaries use computed nowrap`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal and real mobile tooltips stay readable inside a 320px viewport`
- `SpendingBarChart mobile legend and tooltip in Chromium › nominal legend clear hides every series and selecting one restores its bars`

## SpendingBarChart-readability.browser.test.tsx — 8件

- `SpendingBarChart mobile readability geometry in Chromium › 320px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 320px real chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 375px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 375px real chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 390px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 390px real chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 430px nominal chart geometry and rendered axes`
- `SpendingBarChart mobile readability geometry in Chromium › 430px real chart geometry and rendered axes`

## SpendingBarChart-tooltip-dismiss.browser.test.tsx — 2件

- `Spending tooltip dismissal › dismisses on Escape, chart leave, and outside click`
- `tooltip scroll › 231 P42-538/-539 scroll dismissal`

## SpendingBarChart-tooltip-rehover.browser.test.tsx — 1件

- `Spending tooltip › P42-588/-591 rehover visibility`

## SpendingBarChart-tooltip-scroll.browser.test.tsx — 6件

- `SpendingBarChart mobile tooltip scroll in Chromium › 375x667 nominal tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 375x667 real tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 320x480 nominal tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 320x480 real tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 667x375 landscape nominal tooltip scrolls to the close control`
- `SpendingBarChart mobile tooltip scroll in Chromium › 667x375 landscape real tooltip scrolls to the close control`

## SpendingBarChart-tooltip-total.browser.test.tsx — 1件

- `SpendingBarChart nominal tooltip total in Chromium › shows the stacked total after hovering a rendered 2022 bar`

## SpendingBarChart.browser.test.tsx — 4件

- `SpendingBarChart empty state in Chromium › announces the empty-state message when every supplied expense series is hidden`
- `SpendingBarChart quarter filter state in Chromium › p45-b-spending-filter-35-e2e-q1 — P42-511: clicking the actual Q1 control updates its pressed state`
- `SpendingBarChart nominal category filter in Chromium › P45 nominal category bar reduction`
- `SpendingBarChart all-series visibility in Chromium › p45-b-consumption-mobile-acceptance-139-mobile-pixel-acceptance-plan25-openspec-1 — P42-180/-183: removes and restores rendered bars`

## ThemeToggle-style.browser.test.tsx — 1件

- `ThemeToggle Chromium CSS layout › loads the component CSS module into Chromium's computed style`

## ThemeToggle.browser.test.tsx — 1件

- `ThemeToggle in a real Chromium page › cycles themes through a real browser click and persists each state`

## batch1-production-route.browser.test.ts — 21件

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

## batch3-a-production-route.browser.test.ts — 10件

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

## batch3-b-production-route.browser.test.ts — 10件

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

## batch4-a-production-route.browser.test.ts — 7件

- `p45-b-mobile-ux-243-sectiontabs-sticky-android-chrome — production route applies sticky compositing transform in mobile browser context`
- `p45-b-consumption-mobile-readability-191-375px-tooltip — production earnings rows and total remain readable in viewport`
- `p45-b-consumption-mobile-readability-191-430px-tooltip — production earnings rows and total remain readable in viewport`
- `p45-b-mobile-ux-65-320px-overflow — production document has no horizontal overflow`
- `p45-b-mobile-ux-65-375px-overflow — production document has no horizontal overflow`
- `p45-b-mobile-ux-65-390px-overflow — production document has no horizontal overflow`
- `p45-b-mobile-ux-65-430px-overflow — production document has no horizontal overflow`

## batch4-b-production-route.browser.test.ts — 7件

- `p45-b-range-change-242-e2e — production range interactions emit no console or page errors`
- `p45-b-range-change-273-e2e — production start-year change preserves scroll within 50px`
- `p45-b-section-tabs-scroll-47-3-chromium — production 3種比較 tab brings its section into the viewport`
- `p45-b-range-change-119-e2e — production spending-chart-nominal data and bars narrow after changing the range`
- `p45-b-range-change-136-e2e — production spending-chart-real data and bars narrow after changing the range`
- `p45-b-range-change-153-e2e — production spending-chart-nominal data and bars narrow after changing the range`
- `p45-b-range-change-170-e2e — production spending-chart-real data and bars narrow after changing the range`

## batch4-b-webkit-production-route.browser.test.ts — 4件

- `p45-b-section-tabs-scroll-120-case02-webkit — production route initially hides the native scrollbar`
- `p45-b-section-tabs-scroll-127-case02-webkit — production WebKit tabs overflow and scroll horizontally`
- `p45-b-section-tabs-scroll-142-mask-image-webkit — production WebKit applies the right-edge mask`
- `p45-b-section-tabs-scroll-47-3-webkit — production iPhone WebKit brings the 3種比較 section into view`

## batch5-lazy-tabs-chromium-production-route.browser.test.ts — 3件

- `p45-b-section-tabs-scroll-82-3-chromium`
- `p45-b-section-tabs-scroll-82-case01-chromium`
- `p45-b-section-tabs-scroll-82-case02-chromium`

## batch5-lazy-tabs-webkit-production-route.browser.test.ts — 3件

- `p45-b-section-tabs-scroll-82-3-webkit`
- `p45-b-section-tabs-scroll-82-case04-webkit`
- `p45-b-section-tabs-scroll-82-case05-webkit`

## batch5-standard-chromium-production-route.browser.test.ts — 1件

- `p45-b-section-tabs-scroll-47-case02-chromium — production desktop route scrolls the earnings target into view`

## batch5-standard-webkit-production-route.browser.test.ts — 1件

- `p45-b-section-tabs-scroll-47-case02-webkit — production iPhone 13 route scrolls the earnings target into view`

## harness-isolation.browser.test.tsx — 2件

- `Browser Mode file-level state isolation › mutates page, storage, cookie, and mock state through a browser interaction`
- `Browser Mode file-level state isolation › starts after the prior test's DOM, theme, storage, cookie, and mocks were reset`

## legend-color-token.browser.test.tsx — 3件

- `chart legend source CSS tokens in Chromium › p45-a-legend-dark-all12 — P42-321: renders all 12 CPI legend buttons under a dark root`
- `chart legend source CSS tokens in Chromium › p45-a-legend-entertainment-series9 — P42-316/-317: renders the CPI series-9 source token on the real legend swatch`
- `chart legend source CSS tokens in Chromium › p45-a-legend-food-nominal — P42-318/-319: renders the nominal-food source token on the real spending legend swatch`

## next-route-poc.browser.test.ts — 1件

- `Playwright Browser Mode custom command observes a production Next chart interaction`

## phase5-interaction-feasibility.browser.test.ts — 18件 — **[標準union対象外]**

- [対象外] `Phase 5 feasibility observation: real-flight`
- [対象外] `Phase 5 feasibility observation: real-hydration`
- [対象外] `Phase 5 feasibility observation: real-components`
- [対象外] `Phase 5 feasibility observation: real-legend-toggle`
- [対象外] `Phase 5 feasibility observation: real-accordion-closed`
- [対象外] `Phase 5 feasibility observation: real-accordion-open`
- [対象外] `Phase 5 feasibility observation: real-accordion-style`
- [対象外] `Phase 5 feasibility observation: touch-open-close`
- [対象外] `Phase 5 feasibility observation: touch-escape`
- [対象外] `Phase 5 feasibility observation: touch-outside`
- [対象外] `Phase 5 feasibility observation: touch-switch-chart`
- [対象外] `Phase 5 feasibility observation: touch-swipe-negative`
- [対象外] `Phase 5 feasibility observation: touch-retap`
- [対象外] `Phase 5 feasibility observation: touch-overlap`
- [対象外] `Phase 5 feasibility observation: touch-chart-note-navigation`
- [対象外] `Phase 5 feasibility observation: touch-area-outside`
- [対象外] `Phase 5 feasibility observation: touch-area-close`
- [対象外] `Phase 5 feasibility observation: touch-during-tab-scroll`

## phase5-rendering-feasibility.browser.test.ts — 13件 — **[標準union対象外]**

- [対象外] `Phase 5 rendering feasibility observation: p45-a-a11y-real-legend-header-default`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-a11y-real-legend-header-dark`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-advanced-series-adv-query`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-parity-advanced-anchors`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-parity-hidden-series`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-parity-section-cpi-major`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-parity-section-earnings`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-parity-section-new-graph`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-parity-section-residual`
- [対象外] `Phase 5 rendering feasibility observation: p45-a-parity-section-stacked`
- [対象外] `Phase 5 rendering feasibility observation: p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real`
- [対象外] `Phase 5 rendering feasibility observation: p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi`
- [対象外] `Phase 5 rendering feasibility observation: p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-`

## phase6-b01-cagr-contrast.browser.test.ts — 2件

- `T-A11Y-1 CAGR trigger contrast: default`
- `T-A11Y-1 CAGR trigger contrast: dark`

## phase6-b02-real-legend-contrast.browser.test.ts — 2件

- `T-A11Y-2 real-consumption legend header contrast: default`
- `T-A11Y-2 real-consumption legend header contrast: dark`

## phase6-b03-advanced-series.browser.test.ts — 3件

- `p45-a-advanced-series-adv-query preserves the original advanced-query assertions`
- `p45-a-parity-advanced-anchors preserves complete regular and advanced chart/table/CSV parity`
- `p45-a-parity-hidden-series preserves chart, table, and CSV data when a legend series is hidden`

## phase6-b04-parity.browser.test.ts — 3件

- `p45-a-parity-section-cpi-major preserves full monthly chart, table, and CSV parity`
- `p45-a-parity-section-earnings preserves full monthly chart, table, and CSV parity`
- `p45-a-parity-section-new-graph preserves full monthly chart, table, and CSV parity`

## phase6-b05-parity.browser.test.ts — 2件

- `p45-a-parity-section-residual preserves full monthly chart, table, and CSV parity`
- `p45-a-parity-section-stacked preserves full monthly chart, table, and CSV parity`

## phase6-b06-quarterly.browser.test.ts — 3件

- `B06 Plan27 ID 79: real CTI key boundary`
- `B06 Plan27 ID 9: 52-quarter table and CSV`
- `B06 Plan23 ID 26: quarterly public data`

## phase6-b07-real-consumption.browser.test.ts — 3件

- `B07 #21: extracts 48 quarterly real-consumption Flight rows and checks endpoint support values`
- `B07 #60: loads without hydration or console errors`
- `B07 #82: renders the real-consumption section after selecting its tab through normal LazyMount behavior`

## phase6-b08-real-consumption.browser.test.ts — 3件

- `B08 #99: first page-global legend item is visible and the source click attempt completes its settle interval`
- `B08 #128: closed real-consumption accordion hides all section-local legend items`
- `B08 #156: clicking the real-consumption accordion summary reveals its first legend item`

## phase6-b09-real-consumption.browser.test.ts — 1件

- `B09 #174: real-consumption section and summary are visible after scrolling`

## phase6-b10-tooltip-dismiss.browser.test.ts — 3件

- `B10 #138: touchscreen bar tap opens the cursor and close tap clears both`
- `B10 #159: Escape hides the tapped tooltip and same-coordinate retap reopens it`
- `B10 #188: touching the nominal chart heading outside the chart clears close button and cursor`

## phase6-b11-tooltip-dismiss.browser.test.ts — 3件

- `B11 #207: tapping a real chart replaces the single active guide line`
- `B11 #249: a vertical touch gesture ends with the close button hidden`
- `B11 #284: closing and retapping a fresh nominal bar point shows the close button again`

## phase6-b12-chartnote-tooltip.browser.test.ts — 2件

- `B12 #307: deliberately engineered actual link overlap is hit-tested by tooltip and blocks navigation`
- `B12 #430: a real touch on the actual chartNote link outside tooltip navigates and dismisses tooltip`

## phase6-b13-tooltip-dismiss.browser.test.ts — 3件

- `B13 #473: outside-heading touch clears stacked chart cursor and active dots`
- `B13 #508: close touch clears stacked chart active dots`
- `B13 #535: close button is hidden after salary-tab touch and scroll settle`

## phase6-b14-residual-accessibility.browser.test.ts — 4件

- `B14: dark stacked legend hover resets and keeps readable dark-theme contrast`
- `B14: Space toggles the production stacked legend pressed state`
- `B14: keyboard Tab reaches the named legend with a visible focus outline`
- `B14: reduced-motion context disables production header and legend motion`
