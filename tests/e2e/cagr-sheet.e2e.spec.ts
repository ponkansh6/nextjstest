import { test, expect } from "./fixtures";

/**
 * E2E テスト: CAGR 設定ボトムシート（R18）
 *
 * T-E2E-1: トリガーボタンでボトムシートが開く
 * T-E2E-2: シート内で設定 → 閉じる → 計算で結果表示
 * T-E2E-3: 背景タップでシートが閉じる
 * T-E2E-4: モバイル幅で CAGR セクションに横スクロールなし（R7d 回帰）
 */

const CAGR_SECTION = "#section-cagr";

test.describe("CAGR 設定ボトムシート", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("T-E2E-1: トリガーボタンをタップするとボトムシートが開く", async ({ page }) => {
    // CPI年率セクションにスクロール
    await page.locator(CAGR_SECTION).scrollIntoViewIfNeeded();

    const trigger = page.getByRole("button", { name: /CAGRの期間・評価月を変更/ });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // ダイアログ（ボトムシート）が開く
    const dialog = page.getByRole("dialog", { name: "CAGRの期間・評価月" });
    await expect(dialog).toBeVisible();

    // シート内に3つの select がある
    await expect(page.locator("#cagrStartYear")).toBeVisible();
    await expect(page.locator("#cagrEndYear")).toBeVisible();
    await expect(page.locator("#cagrMonth")).toBeVisible();
  });

  test("T-E2E-2: 設定変更 → 閉じる → 計算で結果またはエラーが表示される", async ({ page }) => {
    await page.locator(CAGR_SECTION).scrollIntoViewIfNeeded();

    // シートを開く
    await page.getByRole("button", { name: /CAGRの期間・評価月を変更/ }).click();
    const dialog = page.getByRole("dialog", { name: "CAGRの期間・評価月" });
    await expect(dialog).toBeVisible();

    // 開始年を変更（デフォルトの終了年の範囲内に収まるよう 2015 を選択）
    await page.locator("#cagrStartYear").selectOption("2015");

    // ✕ で閉じる
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).not.toBeVisible();

    // トリガーボタンのラベルが更新されている
    const trigger = page.getByRole("button", { name: /CAGRの期間・評価月を変更/ });
    await expect(trigger).toContainText("2015年01月");

    // 「計算する」をクリック
    await page.getByRole("button", { name: "計算する" }).click();

    // 結果カード内の値を直接検証（見出し「年率上昇率」の常時マッチを回避）
    const resultValue = page.locator("[class*='cagrResultValue']");
    await expect(resultValue).toBeVisible({ timeout: 5000 });
    await expect(resultValue).toHaveText(/^-?\d+\.\d{2}%$/);

    // トリガーボタンのラベルから期待値を導出し、終了年のハードコードを排除
    const triggerLabel = (await trigger.textContent())?.replace(" ▾", "").trim();
    const resultDetail = page.locator("[class*='cagrResultDetail']");
    await expect(resultDetail).toContainText(triggerLabel!);
  });

  test("T-E2E-3: 背景タップでシートが閉じる", async ({ page }) => {
    await page.locator(CAGR_SECTION).scrollIntoViewIfNeeded();

    await page.getByRole("button", { name: /CAGRの期間・評価月を変更/ }).click();
    const dialog = page.getByRole("dialog", { name: "CAGRの期間・評価月" });
    await expect(dialog).toBeVisible();

    // バックドップ（position:fixed; inset:0）の領域をページ左上座標でクリック
    await page.mouse.click(10, 10);

    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("T-E2E-4: モバイル幅で CAGR セクションに横スクロールが発生しない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(
      scrollWidth,
      `375px 幅で ${scrollWidth - clientWidth}px はみ出している`,
    ).toBeLessThanOrEqual(clientWidth);
  });
});
