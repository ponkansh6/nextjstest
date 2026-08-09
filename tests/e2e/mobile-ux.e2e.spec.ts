import { test as base, expect } from "@playwright/test";
import { test } from "./fixtures";

/**
 * E2E テスト: モバイル UX のルール回帰防止（UI/UX 改善プラン P1-1 / P5-1 / P5-3）。
 *
 * ここは「個別の見た目」ではなく、プラン上ルールとして書ける不変条件を検証する:
 *   - タップターゲットは 44x44px 以上（WCAG 2.5.8 AAA / Apple HIG）
 *   - 375px 幅で横方向にはみ出さない（overflow-x: hidden で隠していないこと）
 *   - LazyMount がビューポート外のチャートを実際に遅延させている
 */

const MIN_TAP_TARGET_PX = 44;

test.describe("モバイル UX ルール", () => {
  test("表示中のボタンはすべて 44x44px 以上", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const buttons = await page.getByRole("button").all();
    expect(buttons.length, "検証対象のボタンが取得できていること").toBeGreaterThan(0);

    const tooSmall: string[] = [];
    for (const button of buttons) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      if (!box) continue;
      if (box.width < MIN_TAP_TARGET_PX || box.height < MIN_TAP_TARGET_PX) {
        const label =
          (await button.getAttribute("aria-label")) ??
          (await button.textContent())?.trim() ??
          "(no label)";
        tooSmall.push(`${label}: ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }

    expect(tooSmall, `44x44px 未満のタップターゲット:\n${tooSmall.join("\n")}`).toEqual([]);
  });

  test("375px 幅で横方向にはみ出さない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // overflow-x: hidden を外した状態での真の横溢れを検知する（P5-3）
    expect(
      scrollWidth,
      `375px 幅で ${scrollWidth - clientWidth}px はみ出している`,
    ).toBeLessThanOrEqual(clientWidth);
  });
});

/**
 * 遅延マウント自体の検証は `window.__MOUNT_ALL__` を立てない素の test を使う。
 * fixtures.ts の test は全チャートを即時マウントさせるため、ここでは使えない。
 */
base.describe("LazyMount 遅延マウント (P5-1)", () => {
  base("初期表示では下部のチャートがマウントされていない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 最下部の「移動平均」セクションはファーストビューから遠く、まだ DOM にない
    await expect(page.locator("#section-new-graph")).toHaveCount(0);
  });

  base("スクロールするとチャートがマウントされる", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    await expect(page.locator("#section-new-graph")).toHaveCount(1, { timeout: 15000 });
  });

  base("__MOUNT_ALL__ を立てると初期表示で全チャートがマウントされる", async ({ page }) => {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#section-new-graph")).toHaveCount(1);
  });
});
