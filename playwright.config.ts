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
  workers: 1,
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
      name: "chromium-dark",
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "mobile-pixel",
      use: { ...devices["Pixel 7"] },
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
