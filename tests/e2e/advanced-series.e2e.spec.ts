import { test, expect } from "./fixtures";

test.describe("比較グラフのCTI通常・advanced系列契約", () => {
  test("通常表示はCTI通常系列を含み、延長系列だけを非表示にする", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#section-new-graph");
    await expect(section).toBeVisible({ timeout: 15000 });
    await section.scrollIntoViewIfNeeded();
    const contract = section.getByTestId("chart-data-contract");
    const descriptors = await contract.getAttribute("data-descriptors");
    const series = await contract.getAttribute("data-series");
    expect(descriptors ?? "").toContain("CTIミクロ基本系列（名目・参考）");
    expect(series ?? "").toContain("CTIミクロ基本系列（名目・参考）");
    expect(series ?? "").not.toContain("CTIミクロ基本系列（名目・参考・延長）");
    await expect(
      section.getByRole("button", { name: "CTIミクロ基本系列(名目・総合)", exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "CTIミクロ基本系列(名目・延長)", exact: true }),
    ).toHaveCount(0);
    await expect(section.getByRole("button", { name: "給与(総合)" })).toBeVisible();
    await expect(section.getByRole("button", { name: "物価指数(総合)" })).toBeVisible();
  });

  test("adv=1はCTI通常・延長系列を同じregistryから公開する", async ({ page }) => {
    await page.goto("/?adv=1");
    const section = page.locator("#section-new-graph");
    await expect(section).toBeVisible({ timeout: 15000 });
    const contract = section.getByTestId("chart-data-contract");
    expect((await contract.getAttribute("data-descriptors")) ?? "").toContain(
      "CTIミクロ基本系列（名目・参考）",
    );
    expect((await contract.getAttribute("data-series")) ?? "").toContain(
      "CTIミクロ基本系列（名目・参考・延長）",
    );
    await expect(
      section.getByRole("button", { name: "CTIミクロ基本系列(名目・延長)", exact: true }),
    ).toBeVisible();
    const table = page.locator("#data-table-section-new-graph");
    await table.locator("summary").click();
    expect(await table.innerText()).toContain("CTIミクロ基本系列(名目・延長)");
  });
});
