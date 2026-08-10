import { test, expect } from "./fixtures";

/**
 * E2E テスト: モバイルでグラフをタップした際に出るRechartsツールチップの
 * クローズボタン動作を検証する。
 *
 * 背景: モバイルのツールチップは画面下端に固定表示されるボトムシートだが、
 * これまで明示的に閉じる手段がなく、閉じるのに苦労するというUXの不満が
 * あった(CustomTooltip.tsx に✕ボタンを追加して対応)。
 *
 * isMobile はビューポート幅のメディアクエリのみで判定される(タッチ対応の
 * 有無ではない)ため、この検証は narrow viewport + touch を両方備えた
 * mobile-pixel プロジェクトでのみ実施する。
 */
const NOMINAL = "spending-chart-nominal";

test.describe("モバイル ツールチップの閉じるボタン", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-pixel",
      "isMobileはビューポート幅で判定されるため、narrow viewport + touchを持つ mobile-pixel のみで検証する",
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

  // 「別の地点をタップすると自動的に再表示される」挙動は CustomTooltip.test.tsx で
  // コンポーネント単体として検証済み(dismissedフラグはlabelの変化を検知して自動解除される)。
  // 実ブラウザでの検証は行っていない: 調査の結果、これは本修正と無関係に、
  // 「タップ→別の地点を再度タップ」という非連続な離散タップの連続では
  // Rechartsのタッチ追跡自体が2回目のタップでは再アクティブ化しないという、
  // このアプリの閉じるボタン追加前から存在する制約であることを確認した
  // (ドラッグ/スワイプのような連続したtouchmoveであれば別地点への追従は動作する)。
  // この制約はスコープ外のため、ここでは閉じるボタンの動作のみを検証する。
});
