import { test, expect } from "@playwright/test";
import { loadTotalEarningData } from "../src/lib/cpiData";

test("inspect chart data via browser console", async ({ page }) => {
  // コンソールログをキャプチャ
  page.on("console", (msg) => {
    console.log("Browser Log:", msg.text());
  });

  // アプリケーションページにアクセス
  await page.goto("http://localhost:3000");

  // 少し待って描画を待機
  await page.waitForTimeout(5000);
});
