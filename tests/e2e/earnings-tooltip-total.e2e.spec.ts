import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const EARNINGS_SECTION = "#section-earnings";
const INCLUDED_KEYS = ["所定内給与", "所定外給与", "特別給与"] as const;
type ViewportBox = { x: number; y: number; width: number; height: number };

const earningsSection = (page: Page) => page.locator(EARNINGS_SECTION);

async function hoverFreshEarningsPlot(page: Page, section: Locator) {
  await section.scrollIntoViewIfNeeded();
  const chart = section.locator(".recharts-wrapper").first();
  const plots = chart.locator("path.recharts-area-area:visible, path.recharts-line-curve:visible");
  await expect(plots, "給与の表示中plotが実DOMに存在する").not.toHaveCount(0);

  const viewport = page.viewportSize();
  expect(viewport, "Playwright viewportが取得できる").not.toBeNull();
  if (!viewport) throw new Error("Playwright viewport is unavailable");

  let plotBox: ViewportBox | null = null;
  for (let index = 0; index < (await plots.count()); index += 1) {
    const candidate = await plots.nth(index).boundingBox();
    if (
      candidate &&
      candidate.width > 0 &&
      candidate.height > 0 &&
      candidate.x >= 0 &&
      candidate.y >= 0 &&
      candidate.x + candidate.width <= viewport.width &&
      candidate.y + candidate.height <= viewport.height
    ) {
      plotBox = candidate;
      break;
    }
  }
  expect(plotBox, "表示中plotにviewport内の有効なboundingBoxがある").not.toBeNull();
  if (!plotBox) throw new Error("No actionable earnings plot is fully inside the viewport");

  await page.mouse.move(0, 0);
  await page.mouse.move(plotBox.x + plotBox.width * 0.5, plotBox.y + plotBox.height * 0.45, {
    steps: 8,
  });

  const tooltip = section.locator('[data-tooltip-root="true"]');
  await expect(tooltip, "給与plotのhoverでtooltipが表示される").toBeVisible({ timeout: 5000 });
  return tooltip;
}

async function expectBrowserSeparatorStyle(tooltip: Locator) {
  const borderTop = await tooltip
    .locator('[data-tooltip-group-separator="true"]')
    .first()
    .evaluate((element) => getComputedStyle(element).borderTopWidth);
  expect(borderTop, "desktop separatorのcomputed borderが表示される").not.toBe("0px");
}

test.describe("給与tooltipの区分合計 desktop E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("給与plotへの実hoverでtooltipを表示する", async ({ page }) => {
    const section = earningsSection(page);
    await expect(section).toBeVisible({ timeout: 15000 });
    const tooltip = await hoverFreshEarningsPlot(page, section);
    await expectBrowserSeparatorStyle(tooltip);
  });

  test("系列をlegendでhiddenにした後も実chartをhoverしてtooltipを表示できる", async ({ page }) => {
    const section = earningsSection(page);
    await expect(section).toBeVisible({ timeout: 15000 });
    const initialTooltip = await hoverFreshEarningsPlot(page, section);
    await expectBrowserSeparatorStyle(initialTooltip);
    const hiddenKey = INCLUDED_KEYS[0];
    const legendButton = section.getByTestId(`legend-${hiddenKey}`);

    await legendButton.click();
    await expect(legendButton).toHaveAttribute("aria-pressed", "false");

    const freshTooltip = await hoverFreshEarningsPlot(page, section);
    await expectBrowserSeparatorStyle(freshTooltip);
  });
});
