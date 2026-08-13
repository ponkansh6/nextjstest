import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures";
import { hexToRgb } from "../../scripts/validate-palette.mjs";
import { stackedColors, CPI_CATEGORIES, getLegendLabel } from "../../src/lib/chartConstants";

/**
 * E2E テスト: 凡例の色がソースの globals.css と一致している
 *
 * 目的: --series-* の色を globals.css で変更したにもかかわらず、古い .next
 * ビルドを再ビルドせずに `pnpm run test:e2e` / `pnpm start` を実行すると、
 * ブラウザ上には変更前の色が表示され続ける（"色の変更が反映されていない"）。
 * 既存の cpi-chart-categories.e2e.spec.ts は凡例のテキストラベルの存在だけを
 * 確認しており、色の値そのものは一切検証していなかったため、このクラスの
 * リグレッションを検知できなかった。
 *
 * このテストは globals.css（ソース）から --series-9 の値を直接読み取り、
 * 実際にレンダリングされた凡例スウォッチの computed background-color と
 * 突き合わせる。ビルドが古いままだとここが不一致になり FAIL する。
 */
test("凡例スウォッチの色が globals.css の最新値と一致する（教養娯楽 / --series-9）", async ({
  page,
}) => {
  const cssPath = path.resolve(__dirname, "../../src/app/globals.css");
  const cssContent = readFileSync(cssPath, "utf-8");

  // ライトモードブロック（:root, :root[data-theme="light"]）内の最初の出現を採用。
  // ダークモードブロックより前に定義されているため、最初のマッチがライト値になる。
  const match = cssContent.match(/--series-9:\s*#([0-9a-fA-F]{6})/);
  if (!match) {
    throw new Error("globals.css に --series-9 が見つからない");
  }
  const expectedHex = `#${match[1]}`;
  const [r, g, b] = hexToRgb(expectedHex);
  const expectedRgb = `rgb(${r}, ${g}, ${b})`;

  await page.goto("/");

  const stackedSection = page.locator("#section-stacked");
  const legendButton = stackedSection.getByRole("button", { name: "教養娯楽", exact: true });
  await expect(legendButton).toBeVisible();

  const swatch = legendButton.locator("span").first();
  const actualRgb = await swatch.evaluate((el) => window.getComputedStyle(el).backgroundColor);

  expect(actualRgb).toBe(expectedRgb);
});

/**
 * 食料は消費支出バーチャート専用の独立色（--nominal-food）を使う。
 * CPIの「外食以外食料」(--series-10)とは値が異なるため、誤って series-10
 * を参照する実装に戻ってしまうリグレッションもこのテストで検知できる。
 */
test("凡例スウォッチの色が globals.css の最新値と一致する（食料 / --nominal-food）", async ({
  page,
}) => {
  const cssPath = path.resolve(__dirname, "../../src/app/globals.css");
  const cssContent = readFileSync(cssPath, "utf-8");

  const match = cssContent.match(/--nominal-food:\s*#([0-9a-fA-F]{6})/);
  if (!match) {
    throw new Error("globals.css に --nominal-food が見つからない");
  }
  const expectedHex = `#${match[1]}`;
  const [r, g, b] = hexToRgb(expectedHex);
  const expectedRgb = `rgb(${r}, ${g}, ${b})`;

  await page.goto("/");

  const nominalSection = page.locator("#section-consumption-nominal");
  const legendButton = nominalSection.getByRole("button", { name: "食料", exact: true });
  await expect(legendButton).toBeVisible();

  const swatch = legendButton.locator("span").first();
  const actualRgb = await swatch.evaluate((el) => window.getComputedStyle(el).backgroundColor);

  expect(actualRgb).toBe(expectedRgb);
});

/**
 * ダークモード時、:root[data-theme="dark"] スコープの全12系列（--series-1 〜 --series-12）
 * の色がパレットと一致し、リグレッションがないことを全系列ループで検証する。
 * （本番コード chartConstants からカテゴリ・系列対応・凡例ラベルを導出）
 */
test("凡例スウォッチの色が globals.css の最新値と一致する（ダークモード / 全12系列）", async ({
  page,
}) => {
  const cssPath = path.resolve(__dirname, "../../src/app/globals.css");
  const cssContent = readFileSync(cssPath, "utf-8");

  // :root[data-theme="dark"] ブロックを抽出するヘルパー
  function extractBlock(css: string, start: RegExp): string | null {
    const startIdx = css.search(start);
    if (startIdx === -1) return null;
    const braceStart = css.indexOf("{", startIdx);
    if (braceStart === -1) return null;
    let depth = 0;
    for (let i = braceStart; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) return css.slice(braceStart + 1, i);
      }
    }
    return null;
  }

  const darkBlock = extractBlock(cssContent, /^:root\[data-theme="dark"\]\s*\{/m);
  if (!darkBlock) {
    throw new Error('globals.css に :root[data-theme="dark"] ブロックが見つからない');
  }

  // 明示的にダークテーマを初期設定
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
  });

  await page.goto("/");

  // data-theme="dark" が適用されていることを確認
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const stackedSection = page.locator("#section-stacked");

  // 全12系列を本番コードから導出して検証
  for (let i = 0; i < CPI_CATEGORIES.length; i++) {
    const category = CPI_CATEGORIES[i];
    const label = getLegendLabel(category);
    const varRef = stackedColors[i]; // 例: "var(--series-3)"
    const seriesMatch = varRef.match(/--series-(\d+)/);
    if (!seriesMatch) continue;
    const seriesNum = seriesMatch[1];

    const cssMatch = darkBlock.match(new RegExp(`--series-${seriesNum}:\\s*#([0-9a-fA-F]{6})`));
    if (!cssMatch) {
      throw new Error(`globals.css ダークモードスコープに --series-${seriesNum} が見つからない`);
    }

    const expectedHex = `#${cssMatch[1]}`;
    const [r, g, b] = hexToRgb(expectedHex);
    const expectedRgb = `rgb(${r}, ${g}, ${b})`;

    const legendButton = stackedSection.getByRole("button", { name: label, exact: true });
    await expect(legendButton).toBeVisible();
    const swatch = legendButton.locator("span").first();
    const actualRgb = await swatch.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(actualRgb, `--series-${seriesNum} (${label}) should match dark palette`).toBe(
      expectedRgb,
    );
  }
});
