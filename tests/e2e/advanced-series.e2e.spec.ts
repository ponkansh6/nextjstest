import { test, expect } from "./fixtures";

/**
 * E2E テスト: 3種比較チャートにおける上級者向け隠し系列（民間最終消費支出・2017年以降）の表示切り替え
 */
test.describe("3種比較チャートの上級者向け隠し系列 (adv=1)", () => {
  test("既定では延長系列の凡例チップが表示されない", async ({ page }) => {
    await page.goto("/");
    const newGraphSection = page.locator("#section-new-graph");
    await expect(newGraphSection).toBeVisible();

    // 既定の凡例ボタンが存在することを確認
    await expect(
      newGraphSection.getByRole("button", { name: "民間最終消費(総合)", exact: true }),
    ).toBeVisible();
    await expect(
      newGraphSection.getByRole("button", { name: "CTI消費(総合)", exact: true }),
    ).toBeVisible();

    // 延長・参考系列の凡例ボタンが存在しないことを確認
    const extendedLegend = newGraphSection.getByRole("button", {
      name: "民間最終消費(延長・参考)",
      exact: true,
    });
    await expect(extendedLegend).toHaveCount(0);
  });

  test("?adv=1 付きで開くと延長系列の凡例チップが追加で表示される", async ({ page }) => {
    await page.goto("/?adv=1");
    const newGraphSection = page.locator("#section-new-graph");
    await expect(newGraphSection).toBeVisible();

    // 延長・参考系列の凡例ボタンが存在することを確認
    const extendedLegend = newGraphSection.getByRole("button", {
      name: "民間最終消費(延長・参考)",
      exact: true,
    });
    await expect(extendedLegend).toBeVisible();
  });
});
