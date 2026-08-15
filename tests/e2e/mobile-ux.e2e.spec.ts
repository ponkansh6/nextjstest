import { test as base, expect } from "@playwright/test";
import { test } from "./fixtures";

/**
 * E2E テスト: モバイル UX のルール回帰防止（UI/UX 改善プラン P1-1 / P5-1 / P5-3）。
 *
 * ここは「個別の見た目」ではなく、プラン上ルールとして書ける不変条件を検証する:
 *   - タップターゲットは 44x44px 以上（WCAG 2.5.8 AAA / Apple HIG）
 *     ただし凡例チップ(.legendItem)は、多系列凡例の折り返し行数を減らすため
 *     意図的にこの基準を下回る(WCAG 2.5.8 AA相当の絶対最小24pxには余裕を残す32px)。
 *   - 375px 幅で横方向にはみ出さない（overflow-x: hidden で隠していないこと）
 *   - LazyMount がビューポート外のチャートを実際に遅延させている
 */

const MIN_TAP_TARGET_PX = 44;
const MIN_LEGEND_CHIP_TAP_TARGET_PX = 32;

test.describe("モバイル UX ルール", () => {
  test("表示中のボタンはすべて基準のタップターゲット以上", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const buttons = await page.getByRole("button").all();
    expect(buttons.length, "検証対象のボタンが取得できていること").toBeGreaterThan(0);

    const tooSmall: string[] = [];
    for (const button of buttons) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      if (!box) continue;
      const isLegendChip = await button.evaluate((el) => el.className.includes("legendItem"));
      const minSize = isLegendChip ? MIN_LEGEND_CHIP_TAP_TARGET_PX : MIN_TAP_TARGET_PX;
      if (box.width < minSize || box.height < minSize) {
        const label =
          (await button.getAttribute("aria-label")) ??
          (await button.textContent())?.trim() ??
          "(no label)";
        tooSmall.push(
          `${label}: ${Math.round(box.width)}x${Math.round(box.height)} (基準: ${minSize}px)`,
        );
      }
    }

    expect(tooSmall, `基準未満のタップターゲット:\n${tooSmall.join("\n")}`).toEqual([]);
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

  test("モバイル幅（375px）でも最大期間ボタンが終了年 select の右側に配置されること", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "表示期間を変更" }).click();

    const endYearSelect = page.locator("#endYear");
    const maxButton = page.getByRole("button", { name: "最大期間" });

    await expect(endYearSelect).toBeVisible();
    await expect(maxButton).toBeVisible();

    const selectBox = await endYearSelect.boundingBox();
    const buttonBox = await maxButton.boundingBox();

    expect(selectBox, "endYear select boundingBox").not.toBeNull();
    expect(buttonBox, "maxButton boundingBox").not.toBeNull();

    if (selectBox && buttonBox) {
      // 1. ボタンの左端が select の右端 (x + width) 以上 → 確実に右側（縦積みなら x が揃うので FAIL する）
      expect(buttonBox.x).toBeGreaterThanOrEqual(selectBox.x + selectBox.width - 1); // 1px 許容
      // 2. 同一行判定: y 差が小さい側の高さの 50% 未満（縦積みなら ≈ select.height で FAIL する）
      const verticalDiff = Math.abs(selectBox.y - buttonBox.y);
      const maxAllowedVerticalDiff = Math.min(selectBox.height, buttonBox.height) * 0.5;
      expect(verticalDiff).toBeLessThan(maxAllowedVerticalDiff);
      // 3. 冗長チェック: ボタン右端が select 右端より右
      expect(buttonBox.x + buttonBox.width).toBeGreaterThan(selectBox.x + selectBox.width);
    }
  });

  test("モバイル幅（375px）で開始年と終了年の select 幅がほぼ一致すること", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "表示期間を変更" }).click();

    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    await expect(startYearSelect).toBeVisible();
    await expect(endYearSelect).toBeVisible();

    const startBox = await startYearSelect.boundingBox();
    const endBox = await endYearSelect.boundingBox();

    expect(startBox, "startYear boundingBox").not.toBeNull();
    expect(endBox, "endYear boundingBox").not.toBeNull();

    if (startBox && endBox) {
      console.log(
        `[MEASURE] startYear width: ${startBox.width}, endYear width: ${endBox.width}, diff: ${Math.abs(startBox.width - endBox.width)}`,
      );
      // 現状の赤出し確認用: 差が4px以内であることを検証するが、最初は失敗するはず
      expect(Math.abs(startBox.width - endBox.width)).toBeLessThanOrEqual(4);
    }
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

/**
 * バグ報告: Android Chrome で下にスワイプ(スクロール)する際、画面上部のタブバー
 * (SectionTabs / .sectionTabs、position: sticky; top: 0)が一時的に約1/3隠れる
 * ことがある。
 *
 * 実機で報告されている挙動は、Android Chrome がスクロール中にアドレスバーを
 * 表示/非表示アニメーションさせる際、position: sticky 要素がメインスレッドの
 * レイアウト再計算に同期して再描画されず、アドレスバーの高さ分だけタブバーが
 * 一時的にクリップされて見える描画競合(Chrome for Android の position: sticky +
 * 動的ツールバーアニメーションに関する既知の相性問題)。
 *
 * この描画競合はブラウザの実アドレスバーのアニメーションタイミングに依存する
 * 純粋な描画/コンポジタ側の問題であり、Playwright のヘッドレス環境には実ブラウザの
 * UIクロム(アドレスバー)自体が存在しないため、タッチスワイプやスクロールを
 * 実際に発火させても再現しないことを事前調査で確認済み(diagnose script で
 * .sectionTabs の getBoundingClientRect().top を各 scroll イベントで記録したが
 * 一度も負値にならなかった)。そのため本テストは「隠れる瞬間」そのものではなく、
 * 既知の回避策である「タブバーを独立した合成レイヤーに昇格させる(transform を
 * 付与しメインスレッドのレイアウト再計算から描画を切り離す)」が適用されている
 * ことを検証する回帰ガードとして機能する。
 */
test.describe("タブバー(SectionTabs)の sticky ちらつき対策", () => {
  test("タブバーが独立した合成レイヤーに昇格している(Android Chrome のアドレスバー競合対策)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const transform = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[class*="sectionTabs"]')).find(
        (e) => !e.className.includes("sectionTabsScroll"),
      );
      return el ? getComputedStyle(el).transform : null;
    });

    expect(
      transform,
      "Android Chrome でスクロール中にアドレスバーの表示/非表示アニメーションと " +
        "position: sticky の再描画タイミングがずれ、タブバーが一時的に隠れる不具合の " +
        "対策として、独立した合成レイヤーへの昇格(transform)が必要",
    ).not.toBe("none");
  });
});
