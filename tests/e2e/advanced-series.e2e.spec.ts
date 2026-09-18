import { test, expect } from "./fixtures";

test.describe("比較グラフの現行系列契約", () => {
  test("通常表示は給与・CPIの実系列だけを表示し、旧CTI給与系列を表示しない", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#section-new-graph");
    await expect(section).toBeVisible({ timeout: 15000 });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByTestId("chart-data-contract")).toBeVisible();
    const contract = await section
      .getByTestId("chart-data-contract")
      .getAttribute("data-descriptors");
    expect(contract ?? "").not.toMatch(/CTIミクロ基本系列/);
    expect(await section.locator("svg").innerText()).not.toMatch(/CTIミクロ基本系列/);
    await expect(section.getByRole("button", { name: "給与(総合)" })).toBeVisible();
    await expect(section.getByRole("button", { name: "物価指数(総合)" })).toBeVisible();
  });

  test("adv=1も旧CTI給与registryを再導入しない", async ({ page }) => {
    await page.goto("/?adv=1");
    const section = page.locator("#section-new-graph");
    await expect(section).toBeVisible({ timeout: 15000 });
    await expect(section.getByTestId("chart-data-contract")).toBeVisible();
    expect(await section.innerText()).not.toMatch(/CTIミクロ基本系列/);
    const table = page.locator("#data-table-section-new-graph");
    await table.locator("summary").click();
    expect(await table.innerText()).not.toMatch(/CTIミクロ基本系列/);
  });
});
