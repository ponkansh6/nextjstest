import { test, expect } from "./fixtures";

const MONTHLY_CHARTS = [
  { id: "section-stacked", name: "CPI費目別" },
  { id: "section-earnings", name: "給与" },
] as const;

async function visibleXAxisLabels(section: import("@playwright/test").Locator) {
  const labels = section.locator(".recharts-xAxis-tick-labels text");
  await expect(labels.first()).toBeAttached({ timeout: 15000 });
  return labels.allTextContents();
}

test.describe("月次チャートの系列境界ラベル", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  for (const { id, name } of MONTHLY_CHARTS) {
    test(`${name}: 2017年12月・2018年1月を最終SVGに表示しない`, async ({ page }) => {
      const section = page.locator(`#${id}`);
      await section.scrollIntoViewIfNeeded();
      const labels = await visibleXAxisLabels(section);

      expect(labels).not.toContain("2017年12月");
      expect(labels).not.toContain("2018年1月");
      // Boundary filtering must retain ordinary endpoint/milestone labels.
      expect(labels.length).toBeGreaterThanOrEqual(2);
    });
  }
});

// SpendingBarChart uses quarterly labels (e.g. 2017 Q4 / 2018 Q1), so it is
// intentionally excluded from this monthly year/month boundary assertion.
