import { test, expect } from "./fixtures";

/**
 * E2E テスト: モバイルでグラフをタップした際に出るRechartsツールチップの
 * クローズボタン動作およびタッチ操作（スワイプ、再タップ、タブジャンプ中抑制）を検証する。
 *
 * 背景: モバイルのツールチップは画面下端に固定表示されるボトムシートだが、
 * <Tooltip trigger="click"> を用いることで縦スクロール（スワイプ）時の誤表示を防ぐ。
 * また、同じ地点の再タップで再表示される機能や、プログラム的スクロール中の抑制を検証する。
 */
const NOMINAL = "spending-chart-nominal";

test.describe("モバイル ツールチップの閉じるボタンとインタラクション", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-pixel",
      "isMobile/isTouch は narrow viewport + touch を持つ mobile-pixel のみで検証する",
    );
  });

  test("グラフをタップするとツールチップが表示され、✕ボタンで閉じられる", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const bar = page.getByTestId(NOMINAL).locator(".recharts-bar-rectangle").first();
    await expect(bar).toBeVisible({ timeout: 10000 });

    await bar.tap();

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton, "タップ後、ツールチップの閉じるボタンが表示されるべき").toBeVisible({
      timeout: 5000,
    });

    await closeButton.tap();

    await expect(
      closeButton,
      "閉じるボタンをタップした後、ツールチップは非表示になるべき",
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("グラフ上を縦にスワイプしてもツールチップが表示されないこと（ネガティブテスト）", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chart = page.getByTestId(NOMINAL).locator(".recharts-wrapper");
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cx, y: cy }],
    });
    for (let i = 1; i <= 5; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx, y: cy + i * 15 }],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    // スワイプ操作のみの場合はツールチップが開かないため、閉じるボタンは最初から存在しない
    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).not.toBeVisible();
  });

  test("✕で閉じた後、同じバーをもう一度タップして再表示されること", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const bar = page.getByTestId(NOMINAL).locator(".recharts-bar-rectangle").first();
    await expect(bar).toBeVisible({ timeout: 10000 });

    // 1回目タップ＆クローズ
    await bar.tap();
    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    await closeButton.tap();
    await expect(closeButton).not.toBeVisible({ timeout: 5000 });

    // 同じバーをもう一度タップ
    await bar.tap();
    await expect(
      closeButton,
      "同じバーを再タップした際、閉じるボタンが再び表示されるべき",
    ).toBeVisible({ timeout: 5000 });
  });

  test("タブジャンプ中（プログラム的スクロール中）にグラフへ触れてもツールチップが出ないこと", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const cpiWrapper = page.locator("#section-cpi-major .recharts-wrapper").first();
    await cpiWrapper.scrollIntoViewIfNeeded();

    // SectionTabs のタブを正確に指定（CSS モジュールのハッシュに依存しない）
    const tabButton = page.getByRole("button", { name: "給与", exact: true });
    await tabButton.tap();

    // タブタップ直後、スクロール開始直後に CPI チャート上にタップを dispatch
    const box = await cpiWrapper.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const client = await page.context().newCDPSession(page);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }

    // 固定待ちではなく、プログラム的スクロール継続中〜抑制解除後まで一定時間
    // ポーリングして「一度も表示されない」ことを確認する。抑制解除のタイミングは
    // 環境負荷で変動するため（最大約3秒の追跡ループ + 150msテール）、単発の
    // アサーションでは抑制中タップの「後出し」表示を見逃す可能性がある。
    const closeButton = page.getByRole("button", { name: "閉じる" });
    for (let i = 0; i < 6; i++) {
      await expect(closeButton).not.toBeVisible();
      await page.waitForTimeout(500);
    }
  });
});

test.describe("デスクトップ ツールチップのホバー回帰テスト", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "デスクトップのホバー挙動は chromium プロジェクトでのみ検証する",
    );
  });

  test("デスクトップではホバーで従来どおりツールチップが表示されること", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chart = page.getByTestId(NOMINAL);
    const bar = chart.locator(".recharts-bar-rectangle").first();
    await expect(bar).toBeVisible({ timeout: 10000 });

    await bar.hover();

    const tooltipWrapper = chart.locator(".recharts-tooltip-wrapper");
    await expect(tooltipWrapper, "ホバー時にツールチップラッパーが表示されるべき").toBeVisible({
      timeout: 5000,
    });
  });
});
