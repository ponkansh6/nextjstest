import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * E2E テスト: 消費支出グラフの絞り込み（四半期 / 費目）
 *
 * 目的: 四半期(Q1〜Q4)・費目の凡例ボタンをクリックすると、対応する棒が
 * 実際にグラフから消える（または減る）ことを検証する。
 *
 * 既存の E2E カバレッジ調査で判明した穴を埋めるテスト:
 * - コンポーネントテスト（tests/components/all.test.tsx）は onToggleQuarter /
 *   onToggle が呼ばれることしか検証しておらず、呼ばれた先で実データが変わるかは見ていない
 * - computeChartData の単体/computation-contract テストは hiddenQuarters を
 *   手動で渡した場合の計算ロジック自体は正しいが、本番コード（CpiChart.tsx）が
 *   その関数を呼んでいるかどうかは検証していない
 * - range-change.e2e.spec.ts は開始年/終了年セレクトの変更のみを対象に
 *   スコープしており（ファイル冒頭コメント参照）、四半期・費目ボタンは対象外
 * - real-consumption.e2e.spec.ts の「legend toggle」テストは、最初に見つかった
 *   [aria-pressed] 要素をクリックしてクラッシュしないことだけを確認しており、
 *   実データが変わることまでは検証していなかった
 */

const NOMINAL = "spending-chart-nominal";

const bars = (page: Page, testId: string) =>
  page.getByTestId(testId).locator(".recharts-bar-rectangle");

test.describe("消費支出絞り込み E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(bars(page, NOMINAL).first()).toBeVisible({ timeout: 10000 });
  });
});
