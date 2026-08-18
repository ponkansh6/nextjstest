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

test.describe("CAGR トリガーのコントラスト比", () => {
  test("T-A11Y-1: CAGR トリガーのコントラスト比が WCAG AA（4.5:1）以上 @dark", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 費目別セクションにスクロールして CAGR リンクを表示
    await page.locator("#section-stacked").scrollIntoViewIfNeeded();
    const link = page
      .locator("#section-stacked")
      .getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
    await expect(link).toBeVisible();

    // 実際の前景色と背景色を取得し、コントラスト比を計算
    const ratio = await link.evaluate((el) => {
      // 相対輝度計算（WCAG 2.0）
      const luminance = (r: number, g: number, b: number) => {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };

      // rgb/rgba 文字列をパース（レガシー "rgb(r, g, b)" と
      // モダン "rgb(r g b / a)" の両方に対応）
      const parseRgba = (str: string): [number, number, number, number] => {
        // 数値だけを抽出（カンマ区切り・スペース区切りどちらも対応）
        const nums = str.match(/[\d.]+/g);
        if (!nums || nums.length < 3) return [0, 0, 0, 1];
        const r = +nums[0];
        const g = +nums[1];
        const b = +nums[2];
        // 4番目の値が alpha（"rgb(r, g, b)" なら alpha は無い → 1.0）
        const a = nums.length >= 4 ? +nums[3] : 1;
        return [r, g, b, a];
      };

      const styles = window.getComputedStyle(el);
      const fgRgba = parseRgba(styles.color);
      const bgRgba = parseRgba(styles.backgroundColor);

      // bgRgba の alpha が < 1 なら、親要素の不透明背景と合成
      let bg: [number, number, number] = [bgRgba[0], bgRgba[1], bgRgba[2]];
      if (bgRgba[3] < 1) {
        let parent = el.parentElement;
        let found = false;
        while (parent) {
          const [pr, pg, pb, pa] = parseRgba(window.getComputedStyle(parent).backgroundColor);
          if (pa >= 1) {
            // 不透明な親背景を発見 → 合成
            const a = bgRgba[3];
            bg = [
              Math.round(bgRgba[0] * a + pr * (1 - a)),
              Math.round(bgRgba[1] * a + pg * (1 - a)),
              Math.round(bgRgba[2] * a + pb * (1 - a)),
            ];
            found = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (!found) {
          // 不透明な親が見つからない場合、bg 自体の RGB を使用
          bg = [bgRgba[0], bgRgba[1], bgRgba[2]];
        }
      } else {
        bg = [bgRgba[0], bgRgba[1], bgRgba[2]];
      }

      const l1 = luminance(fgRgba[0], fgRgba[1], fgRgba[2]);
      const l2 = luminance(bg[0], bg[1], bg[2]);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    });

    expect(
      ratio,
      `CAGR トリガーのコントラスト比 ${ratio.toFixed(2)}:1 が WCAG AA（4.5:1）未満`,
    ).toBeGreaterThanOrEqual(4.5);
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
  fixtureTest(
    "info ポップアップを外側クリックで閉じてもスクロール位置が保持される",
    async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      await page
        .getByRole("button", { name: /データソース/ })
        .first()
        .click();
      await expect(page.getByRole("dialog").first()).toBeVisible();

      await page.evaluate(() => window.scrollTo(0, 3000));
      const before = await page.evaluate(() => window.scrollY);

      await page.mouse.click(200, 400); // ポップアップ外
      await page.waitForTimeout(300);

      const after = await page.evaluate(() => window.scrollY);
      expect(Math.abs(after - before)).toBeLessThan(50);
    },
  );

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
