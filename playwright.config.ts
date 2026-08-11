import { defineConfig, devices } from "@playwright/test";

/**
 * page.tsx の実ビルド・実サーバー・実ブラウザ検証。
 *
 * 実行フロー:
 *   pnpm build (キャッシュ再利用で高速化)
 *   -> pnpm start (バックグラウンド)
 *   -> playwright test (http://localhost:3000 へブラウザアクセス)
 *   -> サーバ停止
 *
 * 特徴:
 *   - vitest related のようなインポートグラフ依存の選定ロジックを使わない
 *   - 実際に next build && next start を実行するため、page.tsx 単体の回帰を確実に検知
 *   - Flight ペイロード直接検証（tests/utils/flight-payload.ts を流用）
 *   - 実 recharts の描画健全性も確認（モックではなく実DOM）
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 各テストは beforeEach でページを新規取得しファイル間で状態を共有しないため、
  // 複数ワーカーでの並列実行が安全。実測(4コア環境)では 3 で頭打ちだったため 3 に設定。
  workers: 3,
  reporter: "html",
  timeout: 60 * 1000,

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // ダークモード固有のアサーションは accessibility.e2e.spec.ts の
      // 「アクセシビリティ - ダークモード」ブロックのみが持つ(現在は
      // 仕様精査待ちで describe.skip 中、コミット 808fa99 参照)。それ以外の
      // 全ファイルは colorScheme に依存しないロジック検証であり、chromium
      // プロジェクトと完全に重複する。testMatch を絞らずに全ファイルを
      // 実行すると、chromium と同じ35件を毎回そのまま重複実行することになり、
      // pre-push の所要時間を大きく押し上げていた(実測でE2E全体の約1/3)。
      name: "chromium-dark",
      testMatch: /accessibility\.e2e\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    {
      // モバイルは Pixel (Chromium) のみ検証。iPhone (WebKit) はテスト1件あたり
      // 約2倍遅く、実測でこのプロジェクトを外すと E2E 全体が約38%短縮された。
      //
      // testMatch でモバイル/タッチ固有のアサーションを持つファイルのみに限定する。
      // range-change/real-consumption/spending-filter/accessibility(ダークモード除く)
      // はビューポートに依存しないロジック検証で chromium プロジェクトと内容が
      // 完全に重複しており、絞り込まず全ファイルを実行すると43件が丸ごと重複し、
      // pre-push の所要時間を大きく押し上げていた(実測でE2E全体の約1/3)。
      name: "mobile-pixel",
      testMatch: /(mobile-ux|tooltip-dismiss)\.e2e\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      // タブ押下時のスクロール競合はWebKit(Safari)固有の不具合で、Chromiumでは
      // 再現しない(進行中のsmooth scrollIntoViewを別のscrollIntoView呼び出しが
      // キャンセルする挙動の差異による)。iPhone WebKit全体を通常のE2E行列に
      // 含めると実測で約38%遅くなるため、この回帰検知専用テスト1ファイルのみに
      // 限定して実行する。
      name: "webkit-tabs-regression",
      testMatch: /section-tabs-scroll\.e2e\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],

  webServer: {
    command: "pnpm start",
    // url が無いと Playwright は起動完了を待たず、初回 goto が
    // ERR_CONNECTION_REFUSED になる（特にテストを絞って実行したとき）
    url: "http://localhost:3000",
    // 常に false: ローカルにポート3000で古い next-server プロセスが残っていると、
    // ビルドID/アセットの不整合により無関係なテストが大量に失敗する事故が実際に発生した。
    // 起動済みサーバーを使い回さず、必ずこの実行の pnpm build 結果でサーバーを立て直す。
    reuseExistingServer: false,
    timeout: 180 * 1000,
  },
});
