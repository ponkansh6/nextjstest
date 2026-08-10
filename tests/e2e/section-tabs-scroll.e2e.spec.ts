import { test, expect } from "./fixtures";

/**
 * E2E テスト: タブバー押下時に正しいセクションへスクロールすることを検証する。
 *
 * 背景: WebKit(Safari)では、タブクリック時に発火する2つの独立した
 * scrollIntoView(smooth)呼び出し ―
 *   (1) CpiChart.tsx の handleSelectSection によるセクション本体への垂直スクロール
 *   (2) SectionTabs.tsx の useEffect によるタブボタン自体の水平再センタリング
 * が競合し、後から発火する呼び出しが先の smooth スクロールをキャンセルして
 * しまい、ページが全くスクロールしない不具合があった。
 *
 * この競合は横方向のタブスクロールが実際に発生する場合にのみ起きるため、
 * 初期表示で横スクロール無しに見えているタブ(CPI主要)では再現せず、
 * それ以降のタブ(CAGR等)でのみ再現する。
 *
 * Chromiumでは再現しないWebKit固有の挙動のため、専用の
 * webkit-tabs-regression プロジェクト(playwright.config.ts)でのみ実行する。
 */
test.describe("タブバー押下時のスクロール", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  const cases = [
    { label: "CAGR", sectionId: "section-cagr" },
    { label: "消費(名目)", sectionId: "section-consumption-nominal" },
    { label: "給与", sectionId: "section-earnings" },
    { label: "3種比較", sectionId: "section-new-graph" },
  ];

  for (const { label, sectionId } of cases) {
    test(`「${label}」タブを押すと該当セクションが表示領域に入る`, async ({ page }) => {
      const before = await page.evaluate(() => window.scrollY);

      await page
        .locator('[class*="sectionTabs"]')
        .getByRole("button", { name: label, exact: true })
        .click();
      await page.waitForTimeout(1000);

      const after = await page.evaluate(() => window.scrollY);
      expect(after, `「${label}」タブ押下後、ページがスクロールしているべき`).toBeGreaterThan(
        before,
      );

      await expect(
        page.locator(`#${sectionId}`),
        `「${label}」タブ押下後、対応するセクションが表示領域内にあるべき`,
      ).toBeInViewport();
    });
  }
});
