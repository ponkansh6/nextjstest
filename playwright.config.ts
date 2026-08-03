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
  ],

  webServer: {
    command: "pnpm start",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
