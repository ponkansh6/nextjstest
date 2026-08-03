import { test, expect } from "@playwright/test";

/**
 * E2E テスト: 消費支出グラフの描画範囲変更
 *
 * 開始年/終了年セレクトが正常に動作し、
 * グラフが描画されていることを確認する。
 */

test.describe("描画範囲変更 E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // グラフレンダリングを待機
    await page.waitForTimeout(1000);
  });

  test("チャートセレクトが表示される", async ({ page }) => {
    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    await expect(startYearSelect).toBeVisible({ timeout: 10000 });
    await expect(endYearSelect).toBeVisible({ timeout: 10000 });
  });

  test("消費支出（名目）グラフが描画される", async ({ page }) => {
    const heading = page.getByRole("heading", { name: "消費支出（名目）" });
    await expect(heading).toBeVisible();

    // グラフのセクションが存在する
    const section = heading.locator("xpath=following-sibling::*[1]");
    await expect(section).toBeVisible();
  });

  test("開始年を変更できる", async ({ page }) => {
    const startYearSelect = page.locator("#startYear");
    const options = await startYearSelect.locator("option").allTextContents();

    if (options.length > 1) {
      const secondYear = options[1]?.replace("年", "");
      if (secondYear) {
        await startYearSelect.selectOption(secondYear);
        const value = await startYearSelect.inputValue();
        expect(value).toBe(secondYear);
      }
    }
  });

  test("終了年を変更できる", async ({ page }) => {
    const endYearSelect = page.locator("#endYear");
    const options = await endYearSelect.locator("option").allTextContents();

    if (options.length > 1) {
      const year = options[options.length - 2]?.replace("年", "");
      if (year) {
        await endYearSelect.selectOption(year);
        const value = await endYearSelect.inputValue();
        expect(value).toBe(year);
      }
    }
  });

  test("複数回の範囲変更でもエラーが発生しない", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    const startOptions = await startYearSelect.locator("option").allTextContents();
    const endOptions = await endYearSelect.locator("option").allTextContents();

    // 複数回の変更を実行
    if (startOptions.length > 1) {
      const year = startOptions[1]?.replace("年", "");
      if (year) {
        await startYearSelect.selectOption(year);
        await page.waitForTimeout(500);
      }
    }

    if (endOptions.length > 1) {
      const year = endOptions[endOptions.length - 2]?.replace("年", "");
      if (year) {
        await endYearSelect.selectOption(year);
        await page.waitForTimeout(500);
      }
    }

    if (startOptions.length > 0) {
      const year = startOptions[0]?.replace("年", "");
      if (year) {
        await startYearSelect.selectOption(year);
        await page.waitForTimeout(500);
      }
    }

    // エラーなし
    expect(errors).toEqual([]);
  });

  test("開始年と終了年を組み合わせて変更できる", async ({ page }) => {
    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    const startOptions = await startYearSelect.locator("option").allTextContents();
    const endOptions = await endYearSelect.locator("option").allTextContents();

    if (startOptions.length > 1 && endOptions.length > 1) {
      const startYear = startOptions[1]?.replace("年", "");
      const endYear = endOptions[endOptions.length - 2]?.replace("年", "");

      if (startYear && endYear) {
        await startYearSelect.selectOption(startYear);
        await page.waitForTimeout(300);
        await endYearSelect.selectOption(endYear);
        await page.waitForTimeout(300);

        const startValue = await startYearSelect.inputValue();
        const endValue = await endYearSelect.inputValue();

        expect(startValue).toBe(startYear);
        expect(endValue).toBe(endYear);
      }
    }
  });

  test("グラフセクションがページに存在し続ける", async ({ page }) => {
    // 名目グラフ
    const nominalHeading = page.getByRole("heading", { name: "消費支出（名目）" });
    await expect(nominalHeading).toBeVisible();

    // 実質グラフ
    const realHeading = page.getByRole("heading", { name: "消費支出（実質）" });
    await expect(realHeading).toBeVisible();

    // セレクト変更後も表示され続ける
    const startYearSelect = page.locator("#startYear");
    const options = await startYearSelect.locator("option").allTextContents();
    if (options.length > 1) {
      const year = options[1]?.replace("年", "");
      if (year) {
        await startYearSelect.selectOption(year);
        await page.waitForTimeout(500);

        // グラフセクションがまだ存在
        await expect(nominalHeading).toBeVisible();
        await expect(realHeading).toBeVisible();
      }
    }
  });
});
