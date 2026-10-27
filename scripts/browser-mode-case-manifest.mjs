// Runtime Vitest fullName manifest. Keep this in sync with the active Browser
// Mode files and the tracked browser-test-migration-ledger.tsv.
export const STANDARD_BROWSER_MODE_FULL_NAMES = [
  "B3m Chromium slices p45-a-advanced-series-normal",
  "B3m Chromium slices p45-a-cpi-sections",
  "B3m Chromium slices p45-b-plan24-rendering-71",
  "B3m Chromium slices p45-b-plan24-rendering-88",
  "B3m Chromium slices p45-b-tooltip-stack-total-108",
  "CpiChart range changes changes both range years and renders the exact 2021 quarterly bar counts",
  "CpiChart bars P42-457/-458 finite bar contract",
  "EarningsBreakdownChart tooltip in Chromium real earnings plot hover activates visible tooltip content",
  "Spending tooltip P42-588/-591 rehover visibility",
  "SpendingBarChart nominal tooltip total in Chromium shows nominal stacked and calculated real totals without support total or CPI notes",
  "ThemeToggle Chromium CSS layout loads the component CSS module into Chromium's computed style",
  "Browser Mode file-level state isolation mutates page, storage, cookie, and mock state through a browser interaction",
  "Browser Mode file-level state isolation starts after the prior test's DOM, theme, storage, cookie, and mocks were reset",
  "uses the standard desktop Browser Mode viewport",
];

export const PIXEL7_BROWSER_MODE_FULL_NAMES = [
  "B3m responsive p45-b-mobile-ux-243",
  "BottomSheet focus containment in Chromium keeps real browser Tab navigation inside the open sheet",
  "CagrPanel in Chromium keeps keyboard focus through Escape and closes the reopened sheet from its backdrop",
  "CagrPanel in Chromium fits the calculated result and keeps its detail and note inside the Pixel 7 viewport",
  "ChartInfoContent disclosure in Chromium supports keyboard disclosure, focus, scrolling, and reopening",
  "chart tooltip Drawer datum selection selects the exact Area datum with a zero-movement touch",
  "chart tooltip Drawer datum selection selects the exact range-filtered Line datum with a zero-movement touch",
  "chart tooltip Drawer datum selection keeps a new selection after the previous Drawer exit completes",
  "LazyMount in Chromium p45-b-mobile-ux-192-lazymount-p5-1 P42-349/-350 mounts after scrolling",
  "B3m SectionTabs p45-b-section-tabs-scroll-47-case02-chromium",
  "B3m SectionTabs p45-b-section-tabs-scroll-82-case02-chromium",
  "mobile SectionTabs and ChartFilters geometry in Chromium keeps Pixel 7 year selects equal, aligned, and ordered before the max-range control",
  "mobile SectionTabs tap targets in Chromium p45-b-mobile-ux-19-ux — P42-323/-324: renders actual section controls meeting the 44px target",
  "SectionTabs section navigation in Chromium p45-b-section-tabs-scroll-47-case01-chromium — P42-501/-502: clicking a tab scrolls its real target into view",
  "SectionTabs horizontal overflow in Chromium hides the scrollbar, shows the right-edge fade, and remains horizontally scrollable",
  "Pixel 7 SpendingBarChart interactions in Chromium consolidates B3 mobile acceptance with spending legends, hover, and filtering",
  "touch Drawer dismissal keeps the selected data open while the modal Drawer owns scrolling",
  "B12 #307: deliberately engineered actual link overlap is hit-tested by tooltip and blocks navigation",
  "B13 #473: outside-heading touch clears stacked chart cursor and active dots",
  "B13 #508: close touch clears stacked chart active dots",
  "B13 #535: close button is hidden after salary-tab touch and scroll settle",
  "uses the Pixel 7 viewport and Playwright device context in Browser Mode",
];

export const PIXEL7_REQUIRED_INTERACTION_FULL_NAMES = [
  "B12 #307: deliberately engineered actual link overlap is hit-tested by tooltip and blocks navigation",
  "B13 #473: outside-heading touch clears stacked chart cursor and active dots",
  "B13 #508: close touch clears stacked chart active dots",
  "B13 #535: close button is hidden after salary-tab touch and scroll settle",
];
