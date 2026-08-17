import { test, expect } from "./fixtures";

/**
 * E2E テスト: CAGR コンパクトシート（R18）
 *
 * T-E2E-1: section-stacked 内のリンクからシートが開き、3 select と「計算する」がシート内に見える
 * T-E2E-2: シート内で設定変更 → 計算 → 結果がシート内に表示
 * T-E2E-3: 背景タップでシートが閉じる
 * T-E2E-4: モバイル幅で横スクロールなし（R7d 回帰）
 * T-E2E-5: シート表示中、グラフ描画領域の可視高さが 120px 以上（コンセプト検証）
 * T-E2E-6: section-cagr が DOM に存在せず、タブバーに「CPI年率」ボタンが無い
 * T-E2E-7: 375x667 で結果表示時、シートが内部スクロールを要しない（L-1 回帰）
 * T-E2E-8: 結果の詳細行と注記がビューポート内に収まる（L-1 回帰）
 * T-E2E-9: 667x375 横向きで結果の詳細行がビューポート内に収まる（L-2 回帰）
 */

test.describe("CAGR コンパクトシート", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("T-E2E-1: #section-stacked 内のリンクからシートが開き、3 select と「計算する」がシート内に見える", async ({
    page,
  }) => {
    // 費目別寄与度セクションにスクロール
    await page.locator("#section-stacked").scrollIntoViewIfNeeded();

    // グラフ直下の CAGR リンクをクリック
    const link = page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    await expect(link).toBeVisible();
    await link.click();

    // ダイアログが開く
    const dialog = page.getByRole("dialog", { name: "年率上昇率（CAGR）" });
    await expect(dialog).toBeVisible();

    // シート内に3つの select と「計算する」ボタンがある
    await expect(page.locator("#cagrStartYear")).toBeVisible();
    await expect(page.locator("#cagrEndYear")).toBeVisible();
    await expect(page.locator("#cagrMonth")).toBeVisible();
    await expect(page.getByRole("button", { name: "計算する" })).toBeVisible();
  });

  test("T-E2E-2: シート内で開始年変更 → 計算 → 結果がシート内に表示", async ({ page }) => {
    await page.locator("#section-stacked").scrollIntoViewIfNeeded();

    // シートを開く
    const link = page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    await link.click();
    const dialog = page.getByRole("dialog", { name: "年率上昇率（CAGR）" });
    await expect(dialog).toBeVisible();

    // 開始年を変更
    await page.locator("#cagrStartYear").selectOption("2015");

    // シートは開いたまま「計算する」をクリック
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "計算する" }).click();

    // 結果がシート内に表示される
    const resultValue = page.locator("[class*='cagrResultValue']");
    await expect(resultValue).toBeVisible({ timeout: 5000 });
    await expect(resultValue).toHaveText(/^-?\d+\.\d{2}%$/);
  });

  test("T-E2E-3: 背景タップでシートが閉じる", async ({ page }) => {
    await page.locator("#section-stacked").scrollIntoViewIfNeeded();

    await page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "年率上昇率（CAGR）" });
    await expect(dialog).toBeVisible();

    // バックドップの領域をクリック
    await page.mouse.click(10, 10);
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("T-E2E-4: モバイル幅で横スクロールが発生しない", async ({ page }) => {
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

  test("T-E2E-5: 375x667 でシートを開いた状態で、グラフ描画領域の可視高さが 120px 以上", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 費目別セクションにスクロール
    await page.locator("#section-stacked").scrollIntoViewIfNeeded();

    // CAGR リンクを開く
    const link = page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    await link.click();
    await expect(page.getByRole("dialog", { name: "年率上昇率（CAGR）" })).toBeVisible();

    // グラフ描画領域の可視高さを計算
    const visible = await page.evaluate(() => {
      const chart = document.querySelector("#section-stacked [class*='chartWrapper']")!;
      const sheet = document.querySelector("[class*='bottomSheet']:not([class*='Backdrop'])")!;
      const c = chart.getBoundingClientRect();
      const s = sheet.getBoundingClientRect();
      return Math.max(0, Math.min(c.bottom, s.top) - Math.max(c.top, 0));
    });
    expect(visible, `グラフ可視高さ ${visible}px が 120px 未満`).toBeGreaterThanOrEqual(120);
  });

  test("T-E2E-6: section-cagr が DOM に存在せず、タブバーに「CPI年率」ボタンが無い", async ({
    page,
  }) => {
    // section-cagr が存在しない
    const sectionCagr = page.locator("#section-cagr");
    await expect(sectionCagr).toHaveCount(0);

    // タブバーに「CPI年率」ボタンが無い
    const tabButton = page
      .locator('[class*="sectionTabs"]')
      .getByRole("button", { name: "CPI年率" });
    await expect(tabButton).toHaveCount(0);
  });

  test("T-E2E-7: 375x667 で結果表示時、シートが内部スクロールを要しないこと（L-1 回帰）", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("#section-stacked").scrollIntoViewIfNeeded();
    const link = page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    await link.click();
    await expect(page.getByRole("dialog", { name: "年率上昇率（CAGR）" })).toBeVisible();

    // 計算して結果を表示
    await page.getByRole("button", { name: "計算する" }).click();
    await expect(page.locator("[class*='cagrResultValue']")).toBeVisible({ timeout: 5000 });

    // シートが内部スクロールを要しないこと
    const overflow = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>(
        "[class*='bottomSheet']:not([class*='Backdrop']):not([class*='Header']):not([class*='Title']):not([class*='Close'])",
      )!;
      return sheet.scrollHeight - sheet.clientHeight;
    });
    expect(overflow, `シート内で ${overflow}px がスクロールしないと見えない`).toBeLessThanOrEqual(
      0,
    );
  });

  test("T-E2E-8: 結果の詳細行と注記がビューポート内に収まること（L-1 回帰）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("#section-stacked").scrollIntoViewIfNeeded();
    const link = page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    await link.click();
    await expect(page.getByRole("dialog", { name: "年率上昇率（CAGR）" })).toBeVisible();

    await page.getByRole("button", { name: "計算する" }).click();
    await expect(page.locator("[class*='cagrResultValue']")).toBeVisible({ timeout: 5000 });

    // 詳細行がビューポート内
    const detailBottom = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[class*='cagrResultDetail']")!;
      return el.getBoundingClientRect().bottom;
    });
    expect(detailBottom, "cagrResultDetail がビューポート外").toBeLessThanOrEqual(667);

    // 注記がビューポート内
    const noteBottom = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[class*='cagrSheetNote']")!;
      return el.getBoundingClientRect().bottom;
    });
    expect(noteBottom, "cagrSheetNote がビューポート外").toBeLessThanOrEqual(667);
  });

  test("T-E2E-9: 667x375 横向きでシート高さが70dvh以内に収まること（L-2 回帰）", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.locator("#section-stacked").scrollIntoViewIfNeeded();
    const link = page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    await link.click();
    await expect(page.getByRole("dialog", { name: "年率上昇率（CAGR）" })).toBeVisible();

    await page.getByRole("button", { name: "計算する" }).click();
    await expect(page.locator("[class*='cagrResultValue']")).toBeVisible({ timeout: 5000 });

    // シート高さが 70dvh = 262.5px 以内に収まること
    const sheetHeight = await page.evaluate(() => {
      const sheet = document.querySelector<HTMLElement>(
        "[class*='bottomSheet']:not([class*='Backdrop']):not([class*='Header']):not([class*='Title']):not([class*='Close'])",
      )!;
      return sheet.getBoundingClientRect().height;
    });
    expect(
      sheetHeight,
      `横向きでシート高さ ${sheetHeight}px が 70dvh（≈263px）を超過`,
    ).toBeLessThanOrEqual(263);
  });
});
