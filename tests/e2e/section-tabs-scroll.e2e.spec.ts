import { test as base, expect } from "@playwright/test";
import { test } from "./fixtures";

/**
 * E2E テスト: タブバー押下時に正しいセクションへスクロールすることを検証する。
 *
 * 実機(iPhone/Android)での「押下時に飛ぶセクションがおかしい」報告を調査し、
 * 独立した2つの原因を特定した:
 *
 * 1. WebKit(Safari)でのスクロール競合: タブクリック時に発火する2つの独立した
 *    scrollIntoView(smooth)呼び出し ―
 *      (a) CpiChart.tsx の handleSelectSection によるセクション本体への垂直スクロール
 *      (b) SectionTabs.tsx の useEffect によるタブボタン自体の水平再センタリング
 *    が競合し、後から発火する呼び出しが先の smooth スクロールをキャンセル/中断
 *    してしまう。横方向のタブスクロールが実際に発生する場合にのみ起きるため、
 *    初期表示で横スクロール無しに見えているタブ(CPI主要)では再現せず、それ
 *    以降のタブ(CPI年率等)でのみ再現する。Chromiumでは再現しないWebKit固有の
 *    挙動のため、専用の webkit-tabs-regression プロジェクト
 *    (playwright.config.ts)でのみ実行する。
 *
 * 2. LazyMount未マウント: ページ初回読み込み時、LazyMount配下のセクション
 *    (消費支出名目/実質・給与・給与物価差・3種比較)はまだDOMに存在しない。この
 *    状態でタブを押すと document.getElementById が null を返し、完全に何も
 *    起きなかった(WebKit/Chromium問わず発生)。CpiChart.tsx の
 *    handleSelectSection に LazyMount のプレースホルダー(data-lazy-section
 *    属性)へのフォールバックを追加して解消した。
 *
 * ⚠️ 1つ目の修正時、既存テストは全て __MOUNT_ALL__(fixtures.ts の test)で
 *    強制マウント済みの状態のみを検証しており、2つ目の不具合を見落とした
 *    (実際のユーザーの初回読み込み体験と乖離した検証だった)。そのため
 *    「タブバー押下時のスクロール(初回読み込み・未マウント状態)」ブロックは
 *    素の @playwright/test の test(force-mountしない)を使う。
 */
test.describe("タブバー押下時のスクロール", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  const cases = [
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

base.describe("タブバー押下時のスクロール(初回読み込み・未マウント状態)", () => {
  base.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  const lazyCases = [
    { label: "消費(名目)", sectionId: "section-consumption-nominal" },
    { label: "給与", sectionId: "section-earnings" },
    { label: "3種比較", sectionId: "section-new-graph" },
  ];

  for (const { label, sectionId } of lazyCases) {
    base(
      `未マウント状態から「${label}」タブを押しても該当セクションへ到達する`,
      async ({ page }) => {
        // 前提: このテストが検証したい「未マウント状態」が本当に成立していることを確認
        await expect(
          page.locator(`#${sectionId}`),
          `前提条件: ${label}のセクションはこの時点でまだマウントされていないはず`,
        ).toHaveCount(0);

        await page
          .locator('[class*="sectionTabs"]')
          .getByRole("button", { name: label, exact: true })
          .click();
        await page.waitForTimeout(1500);

        await expect(
          page.locator(`#${sectionId}`),
          `「${label}」タブ押下後、未マウントだったセクションが実際にマウントされ表示領域に入るべき`,
        ).toBeInViewport();
      },
    );
  }
});

/**
 * タブバー(.sectionTabsScroll)のスクロールバー非表示と右端フェードの検証。
 * shared_plan/03 参照。
 */
base.describe("タブバーのスクロールバー非表示と右端フェード", () => {
  base.beforeEach(async ({ page }) => {
    // モバイル幅でコンテンツが確実に横にはみ出す状態を作る
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  const scrollContainer = '[class*="sectionTabsScroll"]';

  base("リロード直後(タブ未操作)にネイティブスクロールバーが非表示である", async ({ page }) => {
    const scrollbarWidth = await page.locator(scrollContainer).evaluate((el) => {
      return getComputedStyle(el).scrollbarWidth;
    });
    expect(scrollbarWidth).toBe("none");
  });

  base("スクロールバー非表示でも横スクロールが機能する", async ({ page }) => {
    const result = await page.locator(scrollContainer).evaluate((el) => {
      const before = el.scrollLeft;
      el.scrollLeft = el.scrollWidth;
      return {
        before,
        after: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });
    expect(result.scrollWidth).toBeGreaterThan(result.clientWidth);
    expect(result.after).toBeGreaterThan(0);
  });

  base("右端フェード(mask-image)が適用されている", async ({ page }) => {
    const mask = await page.locator(scrollContainer).evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        maskImage: cs.maskImage,
        webkitMaskImage: (cs as unknown as { webkitMaskImage?: string }).webkitMaskImage ?? "none",
      };
    });
    expect(mask.maskImage).not.toBe("none");
    expect(mask.webkitMaskImage).not.toBe("none");
  });
});
