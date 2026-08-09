#!/usr/bin/env node

/**
 * Lighthouse モバイル計測スクリプト
 *
 * 用途:
 *   - モバイルプリセット (Pixel 5 throttling + 4G) で Core Web Vitals を計測
 *   - 改善前後の Performance / Accessibility スコア比較
 *
 * 実行:
 *   pnpm build && pnpm start &
 *   node scripts/lighthouse-mobile.js http://localhost:3000
 *   kill %1
 *
 * 出力:
 *   lighthouse-reports/mobile-{timestamp}.json
 *   lighthouse-reports/summary.txt (改善前後の比較があれば記載)
 */

const lighthouse = require("lighthouse");
const fs = require("fs");
const path = require("path");

async function runLighthouse(url) {
  const timestamp = new Date().toISOString().split("T")[0];
  const reportDir = path.join(__dirname, "../lighthouse-reports");

  // ディレクトリ作成
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(
    reportDir,
    `mobile-${timestamp}-${Date.now()}.json`,
  );

  console.log(`🌐 Lighthouse 計測開始: ${url}`);
  console.log(`📱 デバイス: Pixel 5（モバイルプリセット）`);
  console.log(`⏱  スロットリング: 4G（実環境に近い遅延）`);

  try {
    const options = {
      logLevel: "info",
      output: "json",
      onlyCategories: ["performance", "accessibility"],
      // モバイルプリセット: CPU Slowdown 4x, Network Throttling 4G
      emulatedFormFactor: "mobile",
      formFactor: "mobile",
    };

    const runnerResult = await lighthouse(url, options);

    if (!runnerResult) {
      throw new Error("Lighthouse 計測失敗");
    }

    // レポートを JSON で保存
    fs.writeFileSync(reportPath, JSON.stringify(runnerResult.lhr, null, 2));

    const scores = runnerResult.lhr.categories;
    console.log("\n✅ 計測完了");
    console.log(`\n📊 スコア:`);
    console.log(
      `  Performance: ${scores.performance.score * 100 || "N/A"} (配点: 0-100)`,
    );
    console.log(
      `  Accessibility: ${scores.accessibility.score * 100 || "N/A"} (配点: 0-100)`,
    );

    if (runnerResult.lhr.audits["largest-contentful-paint"]) {
      const lcp = runnerResult.lhr.audits["largest-contentful-paint"].displayValue;
      console.log(`  LCP: ${lcp}`);
    }
    if (runnerResult.lhr.audits["cumulative-layout-shift"]) {
      const cls = runnerResult.lhr.audits["cumulative-layout-shift"].displayValue;
      console.log(`  CLS: ${cls}`);
    }
    if (runnerResult.lhr.audits["interaction-to-next-paint"]) {
      const inp = runnerResult.lhr.audits["interaction-to-next-paint"].displayValue;
      console.log(`  INP: ${inp}`);
    }

    console.log(`\n💾 レポート保存先: ${reportPath}`);

    // 過去のレポートと比較（あれば）
    const allReports = fs
      .readdirSync(reportDir)
      .filter((f) => f.startsWith("mobile-"))
      .sort()
      .reverse();

    if (allReports.length > 1) {
      const previousReportPath = path.join(reportDir, allReports[1]);
      const previousLhr = JSON.parse(fs.readFileSync(previousReportPath, "utf8"));
      const perfDiff = scores.performance.score - previousLhr.categories.performance.score;
      const a11yDiff = scores.accessibility.score - previousLhr.categories.accessibility.score;

      console.log(`\n📈 前回計測比:
  Performance: ${perfDiff > 0 ? "+" : ""}${(perfDiff * 100).toFixed(1)} (現在: ${(scores.performance.score * 100).toFixed(1)})
  Accessibility: ${a11yDiff > 0 ? "+" : ""}${(a11yDiff * 100).toFixed(1)} (現在: ${(scores.accessibility.score * 100).toFixed(1)})`);
    }
  } catch (error) {
    console.error(`❌ エラー: ${error.message}`);
    process.exit(1);
  }
}

const url = process.argv[2] || "http://localhost:3000";

if (!url.startsWith("http")) {
  console.error("❌ URL が必要です: node scripts/lighthouse-mobile.js <url>");
  process.exit(1);
}

runLighthouse(url);
