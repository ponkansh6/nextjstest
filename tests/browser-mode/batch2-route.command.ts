import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { devices } from "@playwright/test";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Batch2RouteCase =
  | "range-two-year"
  | "range-sheet-close"
  | "range-max-url"
  | "section-tab-target"
  | "section-scrollbar"
  | "section-horizontal-scroll"
  | "section-mask"
  | "spending-q1-filter"
  | "spending-category-filter"
  | "tooltip-escape"
  | "tooltip-total"
  | "tooltip-hidden-row"
  | "mobile-legend-size"
  | "mobile-tooltip-style"
  | "mobile-summary"
  | "mobile-hide-restore"
  | "mobile-dark-zoom-tooltip"
  | "readability-320"
  | "readability-375"
  | "readability-390";

export interface Batch2RouteObservation {
  url: string;
  responseStatus: number;
  values: Record<string, unknown>;
}

const mobileCases = new Set<Batch2RouteCase>([
  "mobile-legend-size",
  "mobile-tooltip-style",
  "mobile-summary",
  "mobile-hide-restore",
  "mobile-dark-zoom-tooltip",
  "readability-320",
  "readability-375",
  "readability-390",
]);
const sectionCases = new Set<Batch2RouteCase>([
  "section-tab-target",
  "section-scrollbar",
  "section-horizontal-scroll",
  "section-mask",
]);
export const inspectBatch2ProductionCase: BrowserCommand<
  [scenario: Batch2RouteCase],
  Batch2RouteObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright") {
    throw new Error(`Batch 2 production checks require Playwright; received ${provider.name}.`);
  }
  const browser = context.browser();
  if (!browser) throw new Error("The Playwright Browser is unavailable to the batch command.");
  const webkit = browser.browserType().name() === "webkit";
  const webkitSectionCase = webkit && sectionCases.has(scenario);
  const mobile = mobileCases.has(scenario) || webkitSectionCase;
  const width =
    scenario === "readability-320"
      ? 320
      : scenario === "readability-375" ||
          scenario === "section-scrollbar" ||
          scenario === "section-horizontal-scroll" ||
          scenario === "section-mask"
        ? 375
        : scenario === "readability-390" || (webkit && scenario === "section-tab-target")
          ? 390
          : mobile
            ? 412
            : 1280;
  const viewportHeight =
    scenario === "tooltip-escape"
      ? 720
      : webkit && scenario === "section-tab-target"
        ? 844
        : scenario.startsWith("section-")
          ? 800
          : scenario.startsWith("readability-")
            ? 667
            : mobile
              ? 915
              : 800;
  const iphone13WebkitTarget = webkit && scenario === "section-tab-target";
  const isolatedContext = await browser.newContext(
    iphone13WebkitTarget
      ? { ...devices["iPhone 13"] }
      : {
          viewport: { width, height: viewportHeight },
          ...(mobile
            ? { isMobile: true, hasTouch: true, deviceScaleFactor: webkitSectionCase ? 3 : 1 }
            : {}),
        },
  );
  const page = await isolatedContext.newPage();
  try {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    if (scenario === "mobile-dark-zoom-tooltip") {
      await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    }
    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
      waitUntil: "domcontentloaded",
    });
    if (!response) throw new Error("Production route navigation returned no response.");
    await page
      .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const values: Record<string, unknown> = {};
    const chart = page.getByTestId("spending-chart-nominal");
    const bars = (id = "spending-chart-nominal") =>
      page.getByTestId(id).locator(".recharts-bar-rectangle");
    const openRange = async () => {
      await page.getByRole("button", { name: "表示期間を変更" }).click();
      await page.locator("#startYear").waitFor({ state: "visible" });
    };
    const setYear = async (label: "開始年:" | "終了年:", year: number) => {
      await openRange();
      await page.getByLabel(label).selectOption(String(year));
    };
    const tap = async (locator: import("@playwright/test").Locator) => {
      const box = await locator.boundingBox();
      if (!box) throw new Error("The route control has no visible bounding box.");
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    };
    const tapVisibleBar = async (root: import("@playwright/test").Locator) => {
      await root.scrollIntoViewIfNeeded();
      const candidates = root.locator(".recharts-bar-rectangle");
      for (let index = (await candidates.count()) - 1; index >= 0; index -= 1) {
        const box = await candidates.nth(index).boundingBox();
        if (
          box &&
          box.width > 0 &&
          box.height > 0 &&
          box.x >= 0 &&
          box.x + box.width <= width &&
          box.y >= 0 &&
          box.y + box.height <= (mobile ? 915 : 800)
        ) {
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          return;
        }
      }
      throw new Error("No visible production bar can be tapped in the configured viewport.");
    };
    const findHoverPoint = async (root: import("@playwright/test").Locator) => {
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("Playwright viewport is unavailable.");
      const candidates = root.locator(".recharts-bar-rectangle");
      await candidates.first().scrollIntoViewIfNeeded();
      for (let index = 0; index < (await candidates.count()); index += 1) {
        const box = await root.locator(".recharts-bar-rectangle").nth(index).boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) continue;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (point.x < 0 || point.x > viewport.width || point.y < 0 || point.y > viewport.height)
          continue;
        const hitsBar = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
          point,
        );
        if (hitsBar) return point;
      }
      throw new Error(
        `No actionable bar is inside the viewport (${viewport.width}x${viewport.height}).`,
      );
    };

    switch (scenario) {
      case "range-two-year": {
        await setYear("開始年:", 2017);
        await setYear("終了年:", 2017);
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-testid="spending-chart-nominal"] [data-chart-data-row]',
            ).length === 4,
          undefined,
          { timeout: 10_000 },
        );
        values.singleYearUrl = page.url();
        values.singleYearNominalPeriods = await page
          .locator('[data-testid="spending-chart-nominal"] [data-chart-data-row]')
          .count();
        await setYear("終了年:", 2018);
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-testid="spending-chart-nominal"] [data-chart-data-row]',
            ).length === 8 &&
            document.querySelectorAll('[data-testid="spending-chart-real"] [data-chart-data-row]')
              .length === 8,
          undefined,
          { timeout: 10_000 },
        );
        values.url = page.url();
        values.nominalPeriods = await page
          .locator('[data-testid="spending-chart-nominal"] [data-chart-data-row]')
          .count();
        values.realPeriods = await page
          .locator('[data-testid="spending-chart-real"] [data-chart-data-row]')
          .count();
        values.nominalBars = await bars().count();
        values.nominalContractValues = await page
          .locator(
            '[data-testid="spending-chart-nominal"] [data-series-key][data-value-type="number"]',
          )
          .count();
        values.realBars = await bars("spending-chart-real").count();
        values.realContractValues = await page
          .locator(
            '[data-testid="spending-chart-real"] [data-series-key][data-value-type="number"]',
          )
          .count();
        break;
      }
      case "range-sheet-close": {
        await openRange();
        const options = await page.locator("#startYear option").allTextContents();
        const start = Number(options[1]?.replace("年", ""));
        await page.locator("#startYear").selectOption(String(start));
        values.closedAfterStart = await page
          .locator("#startYear")
          .isVisible()
          .catch(() => false);
        await openRange();
        const endOptions = await page.locator("#endYear option").allTextContents();
        const end = Number(endOptions[endOptions.length - 2]?.replace("年", ""));
        await page.locator("#endYear").selectOption(String(end));
        values.closedAfterEnd = await page
          .locator("#endYear")
          .isVisible()
          .catch(() => false);
        break;
      }
      case "range-max-url": {
        await setYear("開始年:", 2015);
        await setYear("終了年:", 2020);
        values.customRangeUrl = page.url();
        await openRange();
        const latestYearOption =
          (await page.locator("#endYear option").last().textContent())?.trim() ?? "";
        values.latestYearOption = latestYearOption;
        values.latestYear = Number(latestYearOption.replace("年", ""));
        const max = page.getByRole("button", { name: "最大期間", exact: true });
        values.maxButtonVisible = await max.isVisible();
        await max.click();
        values.sheetClosed = !(await page
          .locator("#startYear")
          .isVisible()
          .catch(() => false));
        values.url = page.url();
        await openRange();
        values.startYear = await page.locator("#startYear").inputValue();
        values.endYear = await page.locator("#endYear").inputValue();
        values.nominalRows = await page
          .locator('[data-testid="spending-chart-nominal"] [data-chart-data-row]')
          .count();
        break;
      }
      case "section-tab-target": {
        const targetId = "section-consumption-nominal";
        const tabName = "消費(名目)";
        const target = page.locator(`#${targetId}`);
        const scrollYBefore = await page.evaluate(() => window.scrollY);
        await page
          .locator('[class*="sectionTabs"]')
          .getByRole("button", { name: tabName, exact: true })
          .click();
        await page.waitForFunction(
          (id) => {
            const element = document.querySelector(`#${id}`);
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < innerHeight;
          },
          targetId,
          { timeout: 10_000 },
        );
        const rect = await target.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            top: box.top,
            bottom: box.bottom,
            scrollY,
            inViewport: box.bottom > 0 && box.top < innerHeight,
          };
        });
        Object.assign(values, rect, { scrollYBefore, scrollYAfter: rect.scrollY });
        break;
      }
      case "section-scrollbar":
      case "section-horizontal-scroll":
      case "section-mask": {
        const tabs = page.locator('[class*="sectionTabsScroll"]');
        values.scrollbarWidth = await tabs.evaluate(
          (element) => getComputedStyle(element).scrollbarWidth,
        );
        values.geometry = await tabs.evaluate((element) => {
          const css = getComputedStyle(element);
          const before = element.scrollLeft;
          element.scrollLeft = element.scrollWidth;
          return {
            before,
            after: element.scrollLeft,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            maskImage: css.maskImage,
            webkitMaskImage:
              (css as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage ?? "none",
            viewportWidth: innerWidth,
          };
        });
        break;
      }
      case "spending-q1-filter":
      case "spending-category-filter": {
        const root = page.getByTestId("spending-chart-nominal");
        const categoryButton = root.getByTestId("legend-CTIミクロ調整系列（食料）");
        // This migrated case uses the desktop E2E layout, where the legend is
        // expanded. Wait for the responsive client render before inspecting it;
        // an early isVisible() can run during hydration before the mobile-only
        // disclosure is replaced by the desktop legend.
        await categoryButton.waitFor({ state: "visible", timeout: 15_000 });
        const initial = await bars().count();
        if (scenario === "spending-q1-filter") {
          const button = root.getByRole("button", { name: "Q1", exact: true });
          await button.click();
          values.pressedAfter = await button.getAttribute("aria-pressed");
          values.filteredCount = await bars().count();
          await button.click();
          for (const quarter of ["Q1", "Q2", "Q3", "Q4"])
            await root.getByRole("button", { name: quarter, exact: true }).click();
          values.allQuartersHiddenCount = await bars().count();
          for (const quarter of ["Q1", "Q2", "Q3", "Q4"])
            await root.getByRole("button", { name: quarter, exact: true }).click();
          values.restoredCount = await bars().count();
        } else {
          await categoryButton.click();
          values.pressedAfter = await categoryButton.getAttribute("aria-pressed");
          values.filteredCount = await bars().count();
          values.chartVisible = await root.isVisible();
        }
        values.initialCount = initial;
        break;
      }
      case "tooltip-escape": {
        const tooltip = chart.locator(".recharts-tooltip-wrapper");
        let initialHoverError: unknown;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            await chart.waitFor({ state: "visible", timeout: 5_000 });
            await bars().first().waitFor({ state: "visible", timeout: 5_000 });
            const point = await findHoverPoint(chart);
            await page.mouse.move(0, 0);
            await page.mouse.move(point.x, point.y, { steps: 8 });
            await page.waitForFunction(
              () => {
                const wrapper = document.querySelector(
                  '[data-testid="spending-chart-nominal"] .recharts-tooltip-wrapper',
                );
                return (
                  wrapper != null &&
                  getComputedStyle(wrapper).display !== "none" &&
                  getComputedStyle(wrapper).visibility !== "hidden" &&
                  wrapper.getBoundingClientRect().width > 0
                );
              },
              undefined,
              { timeout: 5_000 },
            );
            initialHoverError = undefined;
            break;
          } catch (error) {
            initialHoverError = error;
          }
        }
        if (initialHoverError) throw initialHoverError;
        values.visibleBeforeEscape = await tooltip.isVisible();
        await page.keyboard.press("Escape");
        await tooltip.waitFor({ state: "hidden", timeout: 5_000 });
        values.hiddenAfterEscape = !(await tooltip.isVisible().catch(() => false));

        await page.mouse.move(0, 0);
        await chart.waitFor({ state: "visible", timeout: 5_000 });
        await bars().first().waitFor({ state: "visible", timeout: 5_000 });
        const repeatPoint = await findHoverPoint(chart);
        await page.mouse.move(repeatPoint.x, repeatPoint.y, { steps: 8 });
        await tooltip.waitFor({ state: "visible", timeout: 5_000 });
        values.visibleAfterRehover = await tooltip.isVisible();

        await page.mouse.move(0, 0);
        await tooltip.waitFor({ state: "hidden", timeout: 5_000 });
        values.hiddenAfterMouseLeave = !(await tooltip.isVisible().catch(() => false));

        const heading = page.getByRole("heading", { name: /消費支出（名目）/ }).first();
        const headingBox = await heading.boundingBox();
        if (!headingBox)
          throw new Error("The nominal spending chart heading has no visible bounding box.");
        const finalPoint = await findHoverPoint(chart);
        await page.mouse.move(finalPoint.x, finalPoint.y, { steps: 8 });
        await tooltip.waitFor({ state: "visible", timeout: 5_000 });
        values.visibleBeforeOutsideClick = await tooltip.isVisible();
        await page.mouse.click(
          headingBox.x + headingBox.width / 2,
          headingBox.y + headingBox.height / 2,
        );
        await tooltip.waitFor({ state: "hidden", timeout: 5_000 });
        values.hiddenAfterOutsideClick = !(await tooltip.isVisible().catch(() => false));
        break;
      }
      case "tooltip-total": {
        await setYear("開始年:", 2022);
        await setYear("終了年:", 2025);
        const allBars = bars();
        const count = await allBars.count();
        const target = allBars.nth(Math.min(count - 2, 5));
        await target.hover();
        const tooltip = chart.locator(".recharts-tooltip-wrapper");
        await tooltip.waitFor({ state: "visible", timeout: 10_000 });
        values.barCount = count;
        values.totalVisible = await tooltip.locator('[data-tooltip-total="true"]').isVisible();
        values.totalText = await tooltip.locator('[data-tooltip-total="true"]').textContent();
        break;
      }
      case "tooltip-hidden-row": {
        await setYear("開始年:", 2022);
        await setYear("終了年:", 2025);
        const allBars = bars();
        const count = await allBars.count();
        const targetIndex = Math.min(count - 2, 5);
        await allBars.nth(targetIndex).hover();
        const tooltip = chart.locator(".recharts-tooltip-wrapper");
        const row = tooltip.locator('[data-tooltip-row="true"][data-tooltip-key="食料（名目）"]');
        await row.waitFor({ state: "visible", timeout: 10_000 });
        values.foodRowVisibleBefore = await row.isVisible();
        const food = chart.getByRole("button", { name: "食料", exact: true });
        values.ariaBefore = await food.getAttribute("aria-pressed");
        await food.click();
        values.ariaAfter = await food.getAttribute("aria-pressed");
        await page.mouse.move(0, 0);
        await allBars.nth(targetIndex).hover();
        await tooltip.waitFor({ state: "visible", timeout: 10_000 });
        values.tooltipVisibleAfterRehover = await tooltip.isVisible();
        await row.waitFor({ state: "detached", timeout: 10_000 });
        values.foodRowCountAfter = await row.count();
        break;
      }
      case "mobile-legend-size": {
        const sizes: Record<string, { width: number; height: number }[]> = {};
        for (const id of ["spending-chart-nominal", "spending-chart-real"]) {
          const root = page.getByTestId(id);
          await root.locator("summary").click();
          sizes[id] = await root.locator("button[aria-pressed]").evaluateAll((elements) =>
            elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            }),
          );
        }
        values.sizes = sizes;
        break;
      }
      case "mobile-tooltip-style": {
        const metrics: Record<string, unknown>[] = [];
        for (const id of ["spending-chart-nominal", "spending-chart-real"]) {
          const root = page.getByTestId(id);
          await tapVisibleBar(root);
          const tooltip = root.locator('.recharts-tooltip-wrapper > div[style*="position: fixed"]');
          await tooltip.waitFor({ state: "visible", timeout: 10_000 });
          metrics.push(
            await tooltip.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const rows = [...element.querySelectorAll<HTMLElement>(":scope > div")];
              const total = rows.find((row) => row.textContent?.trim().startsWith("合計"));
              const expense = rows.filter(
                (row) =>
                  !row.textContent?.trim().startsWith("合計") &&
                  row.querySelectorAll(":scope > span").length >= 2,
              );
              const labelSizes = expense.map((row) => {
                const label = [...row.querySelectorAll<HTMLElement>(":scope > span")].find(
                  (cell) =>
                    cell.textContent?.trim() &&
                    getComputedStyle(cell).marginLeft !== "auto" &&
                    getComputedStyle(cell).width !== "8px",
                );
                return label ? parseFloat(getComputedStyle(label).fontSize) : 0;
              });
              return {
                visible: rect.width > 0 && rect.height > 0,
                inViewport:
                  rect.left >= 0 &&
                  rect.right <= innerWidth &&
                  rect.top >= 0 &&
                  rect.bottom <= innerHeight,
                totalFontSize: total ? parseFloat(getComputedStyle(total).fontSize) : 0,
                labelSizes,
                valueRightAligned: expense.every(
                  (row) =>
                    getComputedStyle(
                      row
                        .querySelectorAll<HTMLElement>(":scope > span")
                        .item(row.querySelectorAll(":scope > span").length - 1),
                    ).textAlign === "right",
                ),
              };
            }),
          );
        }
        values.metrics = metrics;
        break;
      }
      case "mobile-summary": {
        const summaries: { open: boolean; visible: boolean; text: string; whiteSpace: string }[] =
          [];
        for (const id of ["spending-chart-nominal", "spending-chart-real"]) {
          const root = page.getByTestId(id);
          const details = root.locator("details");
          const summary = details.locator("summary");
          summaries.push({
            open: await details.evaluate((element) => (element as HTMLDetailsElement).open),
            visible: await summary.isVisible(),
            text: (await summary.textContent())?.trim() ?? "",
            whiteSpace: await summary.evaluate((element) => getComputedStyle(element).whiteSpace),
          });
        }
        values.summaries = summaries;
        break;
      }
      case "mobile-hide-restore": {
        await chart.locator("summary").click();
        const release = chart.getByRole("button", { name: "全選択解除" });
        await release.click();
        const legendButtons = chart.locator('button[data-testid^="legend-"][aria-pressed]');
        await page.waitForFunction(
          () => {
            const root = document.querySelector('[data-testid="spending-chart-nominal"]');
            if (!root) return false;
            const series = [
              ...root.querySelectorAll<HTMLButtonElement>(
                'button[data-testid^="legend-"][aria-pressed]',
              ),
            ];
            return (
              series.length > 0 &&
              series.every((button) => button.getAttribute("aria-pressed") === "false") &&
              root.querySelectorAll(".recharts-bar-rectangle").length === 0
            );
          },
          undefined,
          { timeout: 10_000 },
        );
        const statesAfterHide = await legendButtons.evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("aria-pressed")),
        );
        values.barsWhenHidden = await bars().count();
        const series = legendButtons.nth(4);
        values.seriesBeforeTap = await series.getAttribute("aria-pressed");
        const seriesTestId = await series.getAttribute("data-testid");
        if (!seriesTestId) throw new Error("Selected production series is missing its test id.");
        await tap(series);
        await page.waitForFunction(
          (testId) => {
            const root = document.querySelector('[data-testid="spending-chart-nominal"]');
            const series = root?.querySelector<HTMLButtonElement>(
              `button[data-testid="${testId}"][aria-pressed]`,
            );
            return (
              series?.getAttribute("aria-pressed") === "true" &&
              (root?.querySelectorAll(".recharts-bar-rectangle").length ?? 0) > 0
            );
          },
          seriesTestId,
          { timeout: 10_000 },
        );
        values.seriesAfterTap = await series.getAttribute("aria-pressed");
        values.barsAfterRestore = await bars().count();
        values.allHiddenAfterRelease =
          statesAfterHide.length > 0 && statesAfterHide.every((state) => state === "false");
        break;
      }
      case "mobile-dark-zoom-tooltip": {
        await page.keyboard.press("Control++");
        values.theme = await page.locator("html").getAttribute("data-theme");
        await tapVisibleBar(chart);
        const tooltip = chart.locator('.recharts-tooltip-wrapper > div[style*="position: fixed"]');
        await tooltip.waitFor({ state: "visible", timeout: 10_000 });
        values.closeVisible = await tooltip.getByRole("button", { name: "閉じる" }).isVisible();
        values.categoryVisible = await tooltip
          .locator('[data-tooltip-row="true"]')
          .first()
          .isVisible();
        values.categoryText = await tooltip
          .locator('[data-tooltip-row="true"]')
          .first()
          .textContent();
        values.valueVisible = await tooltip
          .locator('[data-tooltip-row="true"]')
          .filter({ hasText: /\d/ })
          .first()
          .isVisible();
        await tooltip.getByRole("button", { name: "閉じる" }).click();
        values.closed = !(await tooltip.isVisible().catch(() => false));
        break;
      }
      case "readability-320":
      case "readability-375":
      case "readability-390": {
        const measurements: Record<string, unknown>[] = [];
        for (const id of ["spending-chart-nominal", "spending-chart-real"]) {
          const root = page.getByTestId(id);
          await root.waitFor({ state: "visible", timeout: 15_000 });
          await root.scrollIntoViewIfNeeded();
          await page.waitForFunction(
            (testId) => {
              const section = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
              if (!section) return false;
              const wrapper = section.querySelector<HTMLElement>('[class*="spendingChartWrapper"]');
              const svg = section.querySelector<SVGSVGElement>("svg.recharts-surface");
              const yTicks = section.querySelectorAll(".recharts-yAxis-tick-labels text");
              const xTicks = section.querySelectorAll(".recharts-xAxis-tick-labels text");
              const bar = [
                ...section.querySelectorAll<SVGGraphicsElement>(".recharts-bar-rectangle"),
              ].find(
                (item) =>
                  item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0,
              );
              return (
                wrapper != null &&
                wrapper.getBoundingClientRect().width > 0 &&
                svg != null &&
                svg.getBoundingClientRect().width > 0 &&
                yTicks.length > 1 &&
                xTicks.length > 1 &&
                bar != null
              );
            },
            id,
            { timeout: 15_000 },
          );
          measurements.push(
            await root.evaluate((element) => {
              const section = element as HTMLElement;
              const wrapper = section.querySelector<HTMLElement>('[class*="spendingChartWrapper"]');
              const svg = section.querySelector<SVGSVGElement>("svg.recharts-surface");
              const yTicks = [
                ...section.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text"),
              ];
              const xTicks = [
                ...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
              ];
              const bars = [
                ...section.querySelectorAll<SVGGraphicsElement>(".recharts-bar-rectangle"),
              ];
              if (!wrapper || !svg || !yTicks.length || !xTicks.length || !bars.length)
                throw new Error("Rendered chart geometry is incomplete");
              const svgBox = svg.getBoundingClientRect();
              const barBoxes = bars.map((bar) => bar.getBoundingClientRect());
              const visibleBars = barBoxes.filter((box) => box.width > 0 && box.height > 0);
              const centers = visibleBars
                .map((box) => box.left + box.width / 2)
                .sort((a, b) => a - b)
                .filter((center, index, all) => index === 0 || center - all[index - 1] > 1);
              const xTextGeometry = xTicks
                .map((tick) => {
                  const box = tick.getBoundingClientRect();
                  return {
                    left: box.left,
                    right: box.right,
                    top: box.top,
                    bottom: box.bottom,
                    width: box.width,
                    height: box.height,
                    textAnchor: tick.getAttribute("text-anchor"),
                  };
                })
                .sort((a, b) => a.left - b.left);
              return {
                viewportWidth: innerWidth,
                sectionPaddingBottom: parseFloat(getComputedStyle(section).paddingBottom),
                wrapperWidth: wrapper.getBoundingClientRect().width,
                svgLeft: svgBox.left,
                svgRight: svgBox.right,
                svgTop: svgBox.top,
                svgBottom: svgBox.bottom,
                barWidth: visibleBars[0]?.width ?? 0,
                barCenterGaps: centers.slice(1).map((center, index) => center - centers[index]),
                yTickCount: yTicks.length,
                yValues: yTicks
                  .map((tick) => Number(tick.textContent?.trim().replaceAll(",", "")))
                  .filter(Number.isFinite),
                yValueCount: yTicks
                  .map((tick) => Number(tick.textContent?.trim().replaceAll(",", "")))
                  .filter(Number.isFinite).length,
                xTickCount: xTicks.length,
                xTexts: xTicks.map((tick) => tick.textContent?.trim() ?? ""),
                xTextGeometry,
              };
            }),
          );
        }
        values.measurements = measurements;
        values.documentOverflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        break;
      }
    }
    return { url: page.url(), responseStatus: response.status(), values };
  } finally {
    await isolatedContext.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch2ProductionCase: (scenario: Batch2RouteCase) => Promise<Batch2RouteObservation>;
  }
}
