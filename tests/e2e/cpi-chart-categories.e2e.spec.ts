import { test, expect } from "./fixtures";

/**
 * E2E テスト: CPI チャートに全費目が表示されている
 *
 * 目的: CPI_CATEGORIES の全12費目（含む被服履物・交通自動車等）がグラフ凡例に表示されることを検証。
 * 特に CPI_CATEGORIES の順序変更後に、全費目が正しく描画されていることを確認する。
 */

test("物価指数チャート - 全費目が凡例に表示される", async ({ page }) => {
  await page.goto("/");

  // section-stacked セクション内の凡例を確認
  const stackedSection = page.locator("#section-stacked");

  // 期待される全費目
  const expectedCategories = [
    "住居",
    "家具・家事用品",
    "被服履物",
    "保健医療",
    "教育",
    "光熱・水道",
    "教養娯楽",
    "交通自動車等",
    "通信",
    "外食以外食料",
    "外食",
    "諸雑費",
  ];

  // 各費目がセクション内に存在するか確認
  for (const category of expectedCategories) {
    const element = stackedSection.getByRole("button", { name: category, exact: true });
    await expect(element).toBeVisible();
  }
});
