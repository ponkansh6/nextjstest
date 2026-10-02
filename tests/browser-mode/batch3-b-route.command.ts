import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";
import { buildContextOptions, withIsolatedContext } from "./isolated-route-context";
import type { BrowserCommand } from "vitest/node";
import { getSpendingPresentationLabel } from "../../src/lib/spendingSeriesPresentation";

export type Batch3BRouteCase =
  | "tooltip-scroll-dismiss"
  | "info-outside-scroll"
  | "advanced-series"
  | "cagr-sheet"
  | "cpi-area"
  | "plan24-legacy-gdp"
  | "plan24-2025-table-tooltip"
  | "t9-total"
  | "boundary-768"
  | "boundary-769";

export interface Batch3BRouteObservation {
  responseStatus: number;
  url: string;
  values: Record<string, unknown>;
}

export const inspectBatch3BProductionCase: BrowserCommand<
  [scenario: Batch3BRouteCase],
  Batch3BRouteObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright") throw new Error("Batch 3B requires Playwright.");
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable.");
  const boundary = scenario === "boundary-768" || scenario === "boundary-769";
  const mobile = scenario === "tooltip-scroll-dismiss";
  const width =
    scenario === "boundary-768" ? 768 : scenario === "boundary-769" ? 769 : mobile ? 412 : 1280;
  return withIsolatedContext(
    browser,
    buildContextOptions({
      viewport: { width, height: boundary ? 667 : mobile ? 915 : 720 },
      ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    }),
    async (isolated) => {
      const page = await isolated.newPage();
      await page.addInitScript(() => {
        window.__MOUNT_ALL__ = true;
        const createObjectUrl = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (value: Blob | MediaSource) => {
          if (value instanceof Blob)
            (window as Window & { __capturedCsv?: Promise<string> }).__capturedCsv = value.text();
          return createObjectUrl(value);
        };
      });
      const response = await page.goto(NEXT_ROUTE_POC_BASE_URL + "/", {
        waitUntil: "domcontentloaded",
      });
      if (!response) throw new Error("Production route navigation returned no response.");
      await page
        .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
        .waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForLoadState("networkidle");
      const values: Record<string, unknown> = {};
      const nominal = page.getByTestId("spending-chart-nominal");
      const range = async (start: number, end: number) => {
        const open = async () => {
          if (
            !(await page
              .locator("#startYear")
              .isVisible()
              .catch(() => false))
          )
            await page.getByRole("button", { name: "表示期間を変更" }).click();
        };
        if (start < end) {
          await open();
          await page.locator("#startYear").selectOption(String(start));
          await open();
          await page.locator("#endYear").selectOption(String(end));
        } else {
          await open();
          await page.locator("#endYear").selectOption(String(end));
          await open();
          await page.locator("#startYear").selectOption(String(start));
        }
      };
      switch (scenario) {
        case "tooltip-scroll-dismiss": {
          const bars = nominal.locator(".recharts-bar-rectangle");
          const mobileViewport = page.viewportSize();
          if (!mobileViewport) throw new Error("Mobile Playwright viewport is unavailable.");
          let point: { x: number; y: number } | undefined;
          let lastError: unknown;
          for (let retry = 0; retry < 4 && !point; retry += 1) {
            try {
              await nominal.locator(".recharts-bar-rectangle").first().scrollIntoViewIfNeeded();
              for (
                let index = 0;
                index < (await nominal.locator(".recharts-bar-rectangle").count());
                index += 1
              ) {
                // Recharts can replace its SVG subtree between measurement and tap.
                const bar = nominal.locator(".recharts-bar-rectangle").nth(index);
                const box = await bar.boundingBox();
                if (!box || box.width <= 0 || box.height <= 0) continue;
                const candidate = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
                if (
                  candidate.x < 0 ||
                  candidate.x > mobileViewport.width ||
                  candidate.y < 0 ||
                  candidate.y > mobileViewport.height
                )
                  continue;
                const hitsBar = await page.evaluate(
                  ({ x, y }) =>
                    document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
                  candidate,
                );
                if (hitsBar) {
                  point = candidate;
                  break;
                }
              }
            } catch (error) {
              lastError = error;
            }
          }
          if (lastError && !point) throw lastError;
          if (!point) throw new Error("No visible production bar available for touch.");
          await page.touchscreen.tap(point.x, point.y);
          const tooltip = page.locator("[data-custom-tooltip]");
          await tooltip.waitFor({ state: "visible", timeout: 10_000 });
          const closeButton = page.getByRole("button", { name: "閉じる" });
          await closeButton.waitFor({ state: "visible" });
          values.tooltipVisibleBeforeScroll = await tooltip.isVisible();
          values.closeVisibleBeforeScroll = await closeButton.isVisible();
          values.cursorCountBeforeScroll = await page.locator(".recharts-tooltip-cursor").count();
          await page.mouse.wheel(0, 60);
          await page.waitForFunction(() => window.scrollY > 0, undefined, { timeout: 5_000 });
          await tooltip.waitFor({ state: "hidden", timeout: 5_000 });
          values.closeButtonHidden = !(await page
            .getByRole("button", { name: "閉じる" })
            .isVisible()
            .catch(() => false));
          values.cursorCount = await page.locator(".recharts-tooltip-cursor").count();
          values.scrollY = await page.evaluate(() => window.scrollY);
          break;
        }
        case "info-outside-scroll": {
          await page
            .getByRole("button", { name: /データソース/ })
            .first()
            .click();
          const dialog = page.getByRole("dialog").first();
          await dialog.waitFor({ state: "visible" });
          await page.evaluate(() => window.scrollTo(0, 3000));
          values.scrollBefore = await page.evaluate(() => window.scrollY);
          if ((values.scrollBefore as number) <= 100)
            throw new Error("Info popup scroll precondition did not place the page below 100px.");
          await page.mouse.click(200, 400);
          await page.waitForTimeout(300);
          values.dialogClosed = !(await dialog.isVisible().catch(() => false));
          values.scrollAfter = await page.evaluate(() => window.scrollY);
          break;
        }
        case "advanced-series": {
          const section = page.locator("#section-new-graph");
          await section.waitFor({ state: "visible" });
          const normalContract = section.getByTestId("chart-data-contract");
          values.normalDescriptors = await normalContract.getAttribute("data-descriptors");
          values.normalSeries = await normalContract.getAttribute("data-series");
          values.normalExtendedLegendVisible = await section
            .getByRole("button", { name: "CTIミクロ基本系列(名目・延長)", exact: true })
            .isVisible()
            .catch(() => false);
          values.normalMainLegendVisible = await section
            .getByRole("button", { name: "CTIミクロ基本系列(名目・総合)", exact: true })
            .isVisible();
          values.normalSalaryLegendVisible = await section
            .getByTestId("new-graph-legend-総合(12MA)")
            .isVisible();
          values.normalCpiLegendVisible = await section
            .getByTestId("new-graph-legend-CPI総合(12MA)")
            .isVisible();
          values.normalCtiLegendVisible = await section
            .getByRole("button", { name: "CTI消費支出(参考)", exact: true })
            .isVisible();
          await page.goto(NEXT_ROUTE_POC_BASE_URL + "/?adv=1", { waitUntil: "domcontentloaded" });
          await page.locator("#section-new-graph").waitFor({ state: "visible" });
          const advSection = page.locator("#section-new-graph");
          const contract = advSection.getByTestId("chart-data-contract");
          values.advancedDescriptors = await contract.getAttribute("data-descriptors");
          values.advancedSeries = await contract.getAttribute("data-series");
          values.advancedExtendedLegendVisible = await advSection
            .getByRole("button", { name: "CTIミクロ基本系列(名目・延長)", exact: true })
            .isVisible();
          const table = page.locator("#data-table-section-new-graph");
          await table.locator("summary").click();
          values.tableText = await table.innerText();
          break;
        }
        case "cagr-sheet": {
          const section = page.locator("#section-stacked");
          await section.scrollIntoViewIfNeeded();
          const trigger = section.getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
          values.triggerVisible = await trigger.isVisible();
          await trigger.click();
          values.dialogVisible = await page
            .getByRole("dialog", { name: "年率上昇率（CAGR）" })
            .isVisible();
          break;
        }
        case "cpi-area": {
          const section = page.locator("#section-stacked");
          await section.waitFor({ state: "visible" });
          values.sectionVisible = await section.isVisible();
          const initialPaths = section.locator(".recharts-wrapper path.recharts-area-area:visible");
          values.areaPathCount = await initialPaths.count();
          values.firstAreaPathVisible = await initialPaths.first().isVisible();

          const housing = section.getByRole("button", { name: "住居", exact: true });
          await housing.scrollIntoViewIfNeeded();
          values.scrollBeforeLegend = await page.evaluate(() => window.scrollY);
          if ((values.scrollBeforeLegend as number) <= 100)
            throw new Error("CPI legend scroll precondition did not place the page below 100px.");
          await housing.click();
          await page.waitForTimeout(500);
          values.scrollAfterLegend = await page.evaluate(() => window.scrollY);

          await page.goto(NEXT_ROUTE_POC_BASE_URL + "/", { waitUntil: "domcontentloaded" });
          await page
            .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
            .waitFor({ state: "visible", timeout: 30_000 });
          await page.waitForLoadState("networkidle");
          await section.scrollIntoViewIfNeeded();
          const findAreaPoint = async () => {
            const viewport = page.viewportSize();
            if (!viewport) throw new Error("Playwright viewport is unavailable.");
            const paths = section.locator(".recharts-wrapper path.recharts-area-area:visible");
            for (let index = 0; index < (await paths.count()); index++) {
              const candidate = await paths.nth(index).boundingBox();
              if (
                candidate &&
                candidate.width > 0 &&
                candidate.height > 0 &&
                candidate.x >= 0 &&
                candidate.y >= 0 &&
                candidate.x + candidate.width <= viewport.width &&
                candidate.y + candidate.height <= viewport.height
              ) {
                return {
                  x: candidate.x + candidate.width * 0.5,
                  y: candidate.y + candidate.height * 0.45,
                  box: candidate,
                };
              }
            }
            throw new Error("No production CPI area path is actionable within the viewport.");
          };
          const point = await findAreaPoint();
          await page.mouse.move(
            point.box.x + point.box.width * 0.1,
            point.box.y + point.box.height * 0.1,
          );
          await page.mouse.move(point.x, point.y, { steps: 8 });
          const tooltip = section.locator('[data-tooltip-root="true"]');
          await tooltip.waitFor({ state: "visible", timeout: 10_000 });
          values.tooltipRootPresent = await tooltip.evaluate((element) =>
            element.hasAttribute("data-tooltip-root"),
          );
          values.totalAttributePresent =
            (await tooltip.locator('[data-tooltip-total="true"]').count()) === 1;
          values.totalVisible = await tooltip.locator('[data-tooltip-total="true"]').isVisible();
          values.totalText = await tooltip.locator('[data-tooltip-total="true"]').textContent();
          values.tooltipRows = await tooltip
            .locator('[data-tooltip-row="true"]')
            .evaluateAll((elements) =>
              elements.map((element) => ({
                key: element.getAttribute("data-tooltip-key"),
                order: element.getAttribute("data-tooltip-order"),
                text: element.textContent?.trim() ?? "",
              })),
            );
          const requiredNames = ["住居", "交通・自動車等関係費", "諸雑費"];
          values.requiredNamesPresent = await Promise.all(
            requiredNames.map(
              async (name) => (await tooltip.getByText(name, { exact: false }).count()) > 0,
            ),
          );

          await page.goto(NEXT_ROUTE_POC_BASE_URL + "/", { waitUntil: "domcontentloaded" });
          await page
            .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
            .waitFor({ state: "visible", timeout: 30_000 });
          await page.waitForLoadState("networkidle");
          const freshSection = page.locator("#section-stacked");
          await freshSection.scrollIntoViewIfNeeded();
          const freshHousing = freshSection.getByRole("button", { name: "住居", exact: true });
          await freshHousing.click();
          values.housingAriaAfterHide = await freshHousing.getAttribute("aria-pressed");
          await page.mouse.move(0, 0);
          const viewport = page.viewportSize();
          if (!viewport) throw new Error("Playwright viewport is unavailable.");
          const freshPaths = freshSection.locator(
            ".recharts-wrapper path.recharts-area-area:visible",
          );
          let freshBox: { x: number; y: number; width: number; height: number } | undefined;
          for (let index = 0; index < (await freshPaths.count()); index++) {
            const candidate = await freshPaths.nth(index).boundingBox();
            if (
              candidate &&
              candidate.width > 0 &&
              candidate.height > 0 &&
              candidate.x >= 0 &&
              candidate.y >= 0 &&
              candidate.x + candidate.width <= viewport.width &&
              candidate.y + candidate.height <= viewport.height
            ) {
              freshBox = candidate;
              break;
            }
          }
          if (!freshBox)
            throw new Error("No production CPI area path is actionable after hiding housing.");
          await page.mouse.move(
            freshBox.x + freshBox.width * 0.5,
            freshBox.y + freshBox.height * 0.45,
            { steps: 8 },
          );
          const freshTooltip = freshSection.locator('[data-tooltip-root="true"]');
          await freshTooltip.waitFor({ state: "visible", timeout: 10_000 });
          values.hiddenTooltipRootPresent = await freshTooltip.evaluate((element) =>
            element.hasAttribute("data-tooltip-root"),
          );
          values.hiddenTooltipTotalVisible = await freshTooltip
            .locator('[data-tooltip-total="true"]')
            .isVisible();
          values.hiddenTooltipRowCount = await freshTooltip
            .locator('[data-tooltip-row="true"]')
            .count();
          values.hiddenHousingRowCount = await freshTooltip
            .locator('[data-tooltip-row="true"]')
            .filter({ hasText: "住居" })
            .count();
          break;
        }
        case "plan24-legacy-gdp": {
          await range(2005, 2017);
          for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
            const button = nominal.getByRole("button", { name: quarter, exact: true });
            if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
          }
          const nominalTable = page.locator("#data-table-section-consumption-nominal");
          const realTable = page.locator("#data-table-section-consumption-real");
          await nominalTable.locator("summary").click();
          await realTable.locator("summary").click();
          values.nominal2005to2017Headers = await nominalTable
            .locator("thead th")
            .allTextContents();
          values.real2005to2017Headers = await realTable.locator("thead th").allTextContents();
          values.nominal2005to2017Bars = await nominal.locator(".recharts-bar-rectangle").count();
          values.expenseLines2005to2017 = await nominal.locator(".recharts-line-curve").count();
          values.real2005to2017Bars = await page
            .getByTestId("spending-chart-real")
            .locator(".recharts-bar-rectangle")
            .count();
          values.realTotalSupportPeriods2005to2017 =
            (await page.getByTestId("spending-chart-real").getAttribute("data-support-periods")) ??
            "";
          const realTotalMarker = page
            .getByTestId("spending-chart-real")
            .locator(
              'circle[data-testid="spending-series-marker-CTIミクロ調整系列（総合・実質）"]:visible',
            );
          values.realTotalMarkers2005to2017 = await realTotalMarker.count();
          await range(2018, 2018);
          values.realTotalSupportPeriods2018 =
            (await page.getByTestId("spending-chart-real").getAttribute("data-support-periods")) ??
            "";
          values.nominal2018Bars = await nominal.locator(".recharts-bar-rectangle").count();
          values.real2018Bars = await page
            .getByTestId("spending-chart-real")
            .locator(".recharts-bar-rectangle")
            .count();
          values.realTotalMarkers2018 = await realTotalMarker.count();
          values.nominal2018Headers = await nominalTable.locator("thead th").allTextContents();
          values.real2018Headers = await realTable.locator("thead th").allTextContents();
          break;
        }
        case "plan24-2025-table-tooltip": {
          await range(2025, 2025);
          const tableResults: Record<string, unknown>[] = [];
          for (const [id, tableId, label, isIndependentTotal] of [
            [
              "spending-chart-nominal",
              "#data-table-section-consumption-nominal",
              "CTIミクロ調整系列（食料）",
              false,
            ],
            [
              "spending-chart-real",
              "#data-table-section-consumption-real",
              "CTIミクロ総合（実質・CPI調整）",
              true,
            ],
          ] as const) {
            const table = page.locator(tableId);
            await table.getByText(/データテーブルを表示/).click();
            const headers = await table.locator("thead th").allTextContents();
            const supportIndex = headers.findIndex((header) => header.includes(label));
            const valueIndex = headers.findIndex((header) => header.includes("食料"));
            const foodLabel = headers[valueIndex]?.trim() ?? "";
            if (supportIndex < 0 || valueIndex < 0)
              throw new Error("Expected production table columns are missing.");
            const periodResults: Record<string, unknown>[] = [];
            for (const [period, barIndex] of [
              ["2025Q1", 0],
              ["2025Q4", 3],
            ] as const) {
              const tableRow = table.locator("tbody tr").filter({ hasText: period });
              const tableCells = tableRow.locator("td");
              const cells = await tableCells.evaluateAll((elements) =>
                elements.map((cell) =>
                  Array.from(cell.childNodes)
                    .filter((node) => node.nodeType === Node.TEXT_NODE)
                    .map((node) => node.textContent ?? "")
                    .join("")
                    .trim(),
                ),
              );
              const foodValue = cells[valueIndex] ?? "";
              const foodKey = await tableCells.nth(valueIndex).getAttribute("data-series-key");
              if (!foodKey) throw new Error(`Table series key for ${foodLabel} is missing.`);
              const tooltipLabel = getSpendingPresentationLabel(foodKey) ?? foodLabel;
              const total = cells
                .slice(1)
                .map((value, offset) => ({ value: Number(value), index: offset + 1 }))
                .filter(({ index }) => !isIndependentTotal || index !== supportIndex)
                .map(({ value }) => value)
                .filter(Number.isFinite)
                .reduce((sum, value) => sum + value, 0)
                .toFixed(2);
              await page.getByTestId(id).locator(".recharts-bar-rectangle").nth(barIndex).hover();
              const tooltip = page.getByTestId(id).locator(".recharts-tooltip-wrapper");
              await tooltip.waitFor({ state: "visible" });
              const tooltipText = await tooltip.innerText();
              const totalElement = tooltip.locator('[data-tooltip-total="true"]');
              const totalText =
                (await totalElement.count()) > 0
                  ? (await totalElement.innerText()).replace(/\s+/g, "")
                  : "";
              const foodRows = tooltip.locator('[data-tooltip-row="true"]');
              const foodRowIndex = await foodRows.evaluateAll(
                (rows, target) =>
                  rows.findIndex(
                    (row) =>
                      row.getAttribute("data-tooltip-key") === target.key &&
                      row.getAttribute("data-tooltip-label") === target.label,
                  ),
                { key: foodKey, label: tooltipLabel },
              );
              if (foodRowIndex < 0)
                throw new Error(`Tooltip row for ${foodKey} (${foodLabel}) is missing.`);
              const foodRow = foodRows.nth(foodRowIndex);
              const tooltipFoodValueVisible = await foodRow.isVisible();
              const tooltipFoodValue = await foodRow.evaluate((row) => {
                const valueCell = Array.from(row.querySelectorAll(":scope > span")).at(-1);
                return valueCell?.textContent?.trim() ?? "";
              });
              const cpiSeries = await foodRow.getAttribute("data-tooltip-cpi-series");
              const cpiBaseYear = await foodRow.getAttribute("data-tooltip-base-year");
              const cpiPeriod = await foodRow.getAttribute("data-tooltip-cpi-period");
              const cpiAggregation = await foodRow.getAttribute("data-tooltip-cpi-aggregation");
              const nominalSource = await foodRow.getAttribute("data-tooltip-nominal-source");
              periodResults.push({
                period,
                supportValue: cells[supportIndex],
                foodValue,
                cpiSeries,
                cpiBaseYear,
                cpiPeriod,
                cpiAggregation,
                nominalSource,
                tooltipHasPeriod: tooltipText.includes(period),
                tooltipFoodValueVisible,
                tooltipFoodValue,
                tooltipHasCalculatedTotal: totalText.includes("合計" + total),
                tooltipHasGdp: tooltipText.includes("GDP"),
                calculatedTotal: total,
                tooltipText,
              });
            }
            await table.getByRole("button", { name: /データをCSVでダウンロード/ }).click();
            const csv = await page.evaluate(async () => {
              const stored = (window as Window & { __capturedCsv?: Promise<string> }).__capturedCsv;
              return stored ? await stored : "";
            });
            tableResults.push({ headers, supportIndex, foodLabel, periods: periodResults, csv });
          }
          values.tables = tableResults;
          break;
        }
        case "t9-total": {
          const stacked = page.locator("#section-stacked");
          values.sectionVisible = await stacked.isVisible();
          await stacked.scrollIntoViewIfNeeded();
          const areaPaths = stacked.locator("path.recharts-area-area:visible");
          const viewport = page.viewportSize();
          if (!viewport) throw new Error("Viewport unavailable.");
          let box: { x: number; y: number; width: number; height: number } | null = null;
          for (let index = 0; index < (await areaPaths.count()); index++) {
            const candidate = await areaPaths.nth(index).boundingBox();
            if (
              candidate &&
              candidate.width > 0 &&
              candidate.height > 0 &&
              candidate.x >= 0 &&
              candidate.y >= 0 &&
              candidate.x + candidate.width <= viewport.width &&
              candidate.y + candidate.height <= viewport.height
            ) {
              box = candidate;
              break;
            }
          }
          if (!box) throw new Error("No visible in-viewport production CPI area path.");
          await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
          await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 8 });
          const tooltip = stacked.locator('[data-tooltip-root="true"]');
          await tooltip.waitFor({ state: "visible", timeout: 10_000 });
          values.areaPathCount = await areaPaths.count();
          values.viewportBox = box;
          values.viewport = viewport;
          values.tooltipVisible = await tooltip.isVisible();
          values.totalVisible = await tooltip.locator('[data-tooltip-total="true"]').isVisible();
          values.totalText = await tooltip.locator('[data-tooltip-total="true"]').textContent();
          values.rowCount = await tooltip.locator('[data-tooltip-row="true"]').count();
          values.tooltipRootPresent = await tooltip.evaluate((element) =>
            element.hasAttribute("data-tooltip-root"),
          );
          values.totalAttributePresent =
            (await tooltip.locator('[data-tooltip-total="true"]').count()) === 1;
          values.tooltipRows = await tooltip
            .locator('[data-tooltip-row="true"]')
            .evaluateAll((elements) =>
              elements.map((element) => ({
                key: element.getAttribute("data-tooltip-key"),
                order: element.getAttribute("data-tooltip-order"),
                text: element.textContent?.trim() ?? "",
              })),
            );
          values.requiredNamesPresent = await Promise.all(
            ["住居", "交通・自動車等関係費", "諸雑費"].map(
              async (name) => (await tooltip.getByText(name, { exact: false }).count()) > 0,
            ),
          );
          await page.goto(NEXT_ROUTE_POC_BASE_URL + "/", { waitUntil: "domcontentloaded" });
          await page
            .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
            .waitFor({ state: "visible", timeout: 30_000 });
          const freshSection = page.locator("#section-stacked");
          await freshSection.scrollIntoViewIfNeeded();
          const freshHousing = freshSection.getByRole("button", { name: "住居", exact: true });
          await freshHousing.click();
          values.housingAriaAfterHide = await freshHousing.getAttribute("aria-pressed");
          await page.mouse.move(0, 0);
          const freshPaths = freshSection.locator("path.recharts-area-area:visible");
          let freshBox: { x: number; y: number; width: number; height: number } | undefined;
          for (let index = 0; index < (await freshPaths.count()); index++) {
            const candidate = await freshPaths.nth(index).boundingBox();
            if (
              candidate &&
              candidate.width > 0 &&
              candidate.height > 0 &&
              candidate.x >= 0 &&
              candidate.y >= 0 &&
              candidate.x + candidate.width <= viewport.width &&
              candidate.y + candidate.height <= viewport.height
            ) {
              freshBox = candidate;
              break;
            }
          }
          if (!freshBox)
            throw new Error("No production CPI area path is actionable after hiding housing.");
          await page.mouse.move(
            freshBox.x + freshBox.width * 0.5,
            freshBox.y + freshBox.height * 0.45,
            { steps: 8 },
          );
          const freshTooltip = freshSection.locator('[data-tooltip-root="true"]');
          await freshTooltip.waitFor({ state: "visible", timeout: 10_000 });
          values.hiddenTooltipRootPresent = await freshTooltip.evaluate((element) =>
            element.hasAttribute("data-tooltip-root"),
          );
          values.hiddenTooltipTotalVisible = await freshTooltip
            .locator('[data-tooltip-total="true"]')
            .isVisible();
          values.hiddenTooltipRowCount = await freshTooltip
            .locator('[data-tooltip-row="true"]')
            .count();
          values.hiddenHousingRowCount = await freshTooltip
            .locator('[data-tooltip-row="true"]')
            .filter({ hasText: "住居" })
            .count();
          break;
        }
        case "boundary-768":
        case "boundary-769": {
          const measurements: Record<string, unknown>[] = [];
          const initialNominal = page.getByTestId("spending-chart-nominal");
          await initialNominal.scrollIntoViewIfNeeded();
          await initialNominal
            .locator('[role="img"][aria-label$="の推移グラフ"]')
            .waitFor({ state: "visible", timeout: 15_000 });
          await initialNominal
            .locator(".recharts-xAxis-tick-labels text")
            .first()
            .waitFor({ state: "attached", timeout: 15_000 });
          await initialNominal
            .locator(".recharts-yAxis-tick-labels text")
            .first()
            .waitFor({ state: "attached", timeout: 15_000 });
          values.initialNominalGeometryReady = await initialNominal.evaluate((section) => {
            const chart = section.querySelector('[role="img"][aria-label$="の推移グラフ"]');
            const svg = section.querySelector("svg.recharts-surface");
            const x = section.querySelector(".recharts-xAxis-tick-labels text");
            const y = section.querySelector(".recharts-yAxis-tick-labels text");
            return Boolean(
              chart &&
              svg &&
              x &&
              y &&
              chart.getBoundingClientRect().width > 0 &&
              svg.getBoundingClientRect().width > 0,
            );
          });
          for (const id of ["spending-chart-nominal", "spending-chart-real"]) {
            const root = page.getByTestId(id);
            await root.scrollIntoViewIfNeeded();
            await root
              .locator('[role="img"][aria-label$="の推移グラフ"]')
              .waitFor({ state: "visible", timeout: 15_000 });
            await page.waitForFunction(
              (testId) => {
                const section = document.querySelector<HTMLElement>(
                  '[data-testid="' + testId + '"]',
                );
                const svg = section?.querySelector("svg.recharts-surface");
                return (
                  !!svg &&
                  [
                    ...section!.querySelectorAll(
                      ".recharts-xAxis-tick-labels text, .recharts-yAxis-tick-labels text",
                    ),
                  ].length >= 3
                );
              },
              id,
              { timeout: 15_000 },
            );
            measurements.push(
              await root.evaluate((section) => {
                const chart = section.querySelector<HTMLElement>(
                  '[role="img"][aria-label$="の推移グラフ"]',
                )!;
                const svg = section.querySelector<SVGSVGElement>("svg.recharts-surface")!;
                const pageContainer = section.closest<HTMLElement>(".container");
                const xTicks = [
                  ...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
                ];
                const yTicks = [
                  ...section.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text"),
                ];
                const rect = (element: Element) => {
                  const r = element.getBoundingClientRect();
                  return {
                    left: r.left,
                    right: r.right,
                    top: r.top,
                    bottom: r.bottom,
                    width: r.width,
                    height: r.height,
                  };
                };
                return {
                  chart: rect(chart),
                  svg: rect(svg),
                  section: rect(section),
                  paddingTop: pageContainer ? getComputedStyle(pageContainer).paddingTop : null,
                  aspectRatio: getComputedStyle(chart).aspectRatio,
                  xTicks: xTicks.map((tick) => ({
                    ...rect(tick),
                    anchor: tick.getAttribute("text-anchor"),
                  })),
                  yTicks: yTicks.map(rect),
                };
              }),
            );
          }
          values.measurements = measurements;
          values.overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          break;
        }
      }
      return { responseStatus: response.status(), url: page.url(), values };
    },
  );
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch3BProductionCase: (scenario: Batch3BRouteCase) => Promise<Batch3BRouteObservation>;
  }
}
