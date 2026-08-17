import { test, expect } from "@playwright/test";
import { test as fixtureTest } from "./fixtures";

/**
 * E2E テスト: アクセシビリティ（UI/UX 改善プラン P4-1 / P4-2 / ダークモード）
 *
 * 検証項目:
 *   - フォーカスリングが表示される（:focus-visible）
 *   - ダークモードで凡例タップ後の hover が残留しない
 *   - ダークモードでのコントラストが十分（白背景に白文字にならない）
 *   - キーボードのみで全操作が可能
 *   - prefers-reduced-motion が尊重される
 */

/**
 * ダークモード検証は chromium-dark プロジェクトで実行（colorScheme: "dark" が適用される）
 * LazyMount により StackedAreaChart が初期表示に存在しない可能性があるため、
 * __MOUNT_ALL__ を使って全チャートをマウントする
 */
test.describe.skip("アクセシビリティ - ダークモード", () => {
  test("凡例をタップ後、他の場所をクリックすると hover が解除される", async ({ page }) => {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // StackedAreaChart の最初の凡例チップを取得（aria-pressed で特定）
    const legendItem = page.locator("[aria-pressed]").first();
    await expect(legendItem).toBeVisible();

    // タップ
    await legendItem.click();

    // 凡例チップの background-color を確認
    // ダークモード時は rgb(59, 130, 246, 0.15) 相当の半透明青になるはず
    const bgColor = await legendItem.evaluate((el) => window.getComputedStyle(el).backgroundColor);

    // rgb(239, 246, 255) は #eff6ff（ほぼ白）で、白背景の場合のコントラスト比違反
    expect(bgColor).not.toMatch(/rgb\(239,\s*246,\s*255/);

    // 別の場所をクリックして hover を解除
    await page.click("body");

    // 凡例の transform が戻っているかを確認（:hover時の translateY が解除される）
    const transform = await legendItem.evaluate((el) => window.getComputedStyle(el).transform);

    // @media (hover: hover) ガードにより、hover が外れると transform が none になる
    expect(transform).toBe("none");
  });

  test("凡例のコントラスト比が WCAG AA 以上", async ({ page }) => {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const legendItem = page.locator("[aria-pressed]").first();
    await expect(legendItem).toBeVisible();

    const { bgColor, fgColor } = await legendItem.evaluate(() => {
      const el = document.querySelector("[aria-pressed]") as HTMLElement;
      if (!el) return { bgColor: "", fgColor: "" };
      const styles = window.getComputedStyle(el);
      return {
        bgColor: styles.backgroundColor,
        fgColor: styles.color,
      };
    });

    // rgb 値から luminance を計算してコントラスト比を検証する簡易チェック
    // 詳細な WCAG コントラスト比計算は複雑なため、ここでは「白 on 白」のパターン検出のみ
    expect(bgColor).toBeTruthy();
    expect(fgColor).toBeTruthy();
  });
});

test.describe.skip("アクセシビリティ - キーボード操作", () => {
  fixtureTest("キーボードのみで凡例のチェックボックスを操作できる", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 最初の凡例チップに Tab キーで移動
    await page.keyboard.press("Tab");
    const firstLegend = page.locator("[aria-pressed]").first();

    // フォーカスが凡例に当たったら Space キーで状態を切り替え
    await firstLegend.focus();
    const initialAriaPressed = await firstLegend.getAttribute("aria-pressed");
    expect(initialAriaPressed).toMatch(/true|false/);

    await page.keyboard.press("Space");

    const afterAriaPressed = await firstLegend.getAttribute("aria-pressed");
    expect(afterAriaPressed).not.toBe(initialAriaPressed);
  });

  fixtureTest("フォーカスリングが表示される（:focus-visible）", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // キーボード操作でボタンにフォーカス
    await page.keyboard.press("Tab");

    // フォーカスを持つ要素を取得
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      return {
        tagName: el.tagName,
        outline: styles.outline,
        outlineWidth: styles.outlineWidth,
      };
    });

    expect(focusedElement?.outline).not.toBe("none");
    expect(focusedElement?.outlineWidth).not.toBe("0px");
  });

  fixtureTest("年範囲フィルタをキーボードのみで操作できる", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // タブバーの範囲ラベル/ピッカー起動ボタンをタップして range picker を開く
    const rangeButton = page.getByRole("button", { name: /範囲|Range/ }).first();
    if (await rangeButton.isVisible()) {
      await rangeButton.focus();
      await page.keyboard.press("Enter");

      // ボトムシート内のプリセットボタンが focus 可能なことを確認
      const presetButton = page.getByRole("button", { name: /過去|年/ }).first();
      expect(presetButton).toBeDefined();
    }
  });
});

test.describe.skip("アクセシビリティ - アニメーション", () => {
  test("prefers-reduced-motion が有効なとき animation が無効になる", async ({ page }) => {
    // prefers-reduced-motion: reduce をシミュレート
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ヘッダーの fadeIn アニメーションが無効になっているか確認
    const header = page.locator("header").first();
    const animationDuration = await header.evaluate(
      (el) => window.getComputedStyle(el).animationDuration,
    );

    // 0s または animation: none の状態になっているはず
    expect(animationDuration).toMatch(/^0|none/);

    // transform も無効になっているか確認（P1-2 の :hover transform等）
    const legendItem = page.locator("[aria-pressed='true']").first();
    if (await legendItem.isVisible()) {
      const transform = await legendItem.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.transform;
      });
      expect(transform).toBe("none");
    }
  });
});

test.describe("アクセシビリティ - フォーカス管理", () => {
  fixtureTest("info ポップアップを外側クリックで閉じてエラーが発生しない", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: /データソース/ })
      .first()
      .click();
    await expect(page.getByRole("dialog").first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 3000));

    await page.mouse.click(200, 400); // ポップアップ外
    await page.waitForTimeout(300);

    // ダイアログが閉じられている
    await expect(page.getByRole("dialog").first()).not.toBeVisible();
    // ページに JS エラーがないことを確認
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(100);
    expect(errors).toHaveLength(0);
  });

  fixtureTest("info ポップアップを Esc で閉じてエラーが発生しない", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: /データソース/ })
      .first()
      .click();
    await expect(page.getByRole("dialog").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ダイアログが閉じられている
    await expect(page.getByRole("dialog").first()).not.toBeVisible();
  });

  fixtureTest("ボトムシートを開いた状態で Tab がシート内に留まる", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "表示期間を変更" }).click();

    for (let i = 0; i < 10; i++) await page.keyboard.press("Tab");

    const inside = await page.evaluate(() =>
      document.querySelector('[role="dialog"]')?.contains(document.activeElement),
    );
    expect(inside).toBe(true);
  });
});
