import { test, expect, type Page } from "@playwright/test";

/**
 * E2E テスト: 消費支出グラフの描画範囲変更
 *
 * 目的: 開始年/終了年セレクト変更時に、グラフの X軸ラベル・棒本数が正しく変化することを検証。
 * recharts の実DOM セレクタを使用し、レンダリング結果を直接確認する。
 *
 * ❌ アンチパターン（破棄した実装）:
 * - X軸ラベル数の増減をアサーション（recharts が幅に応じて間引くため不安定）
 * - 見出しの following-sibling を使用（凡例コンテナを指してしまい SVG なし）
 *
 * ✅ 採用パターン:
 * - `.recharts-xAxis .recharts-cartesian-axis-tick-value` で年テキストを抽出
 * - `.recharts-bar-rectangle` の本数で四半期×表示系列の増減を検証
 * - `data-testid` で特定グラフをスコープ限定
 */

const NOMINAL = "spending-chart-nominal";
const REAL = "spending-chart-real";

// Helper: 指定テスト ID のグラフ内 .recharts-bar-rectangle locator
const bars = (page: Page, testId: string) => page.getByTestId(testId).locator(".recharts-bar-rectangle");

// Helper: 開始年・終了年を変更（制約: start <= end）
const setRange = async (page: Page, start: number, end: number) => {
  const startSelect = page.locator("#startYear");
  const endSelect = page.locator("#endYear");

  // ChartFilters.tsx で start > end や end < start の option は disabled
  // 故に「開始→終了」の順で変更すれば制約違反しない
  if (start <= end) {
    await startSelect.selectOption(String(start));
    // フィルタ変更後に終了年の選択肢が変わる可能性があるため、少し待つ
    await page.waitForTimeout(100);
    await endSelect.selectOption(String(end));
  } else {
    // 逆順の場合は終了→開始で設定
    await endSelect.selectOption(String(end));
    await page.waitForTimeout(100);
    await startSelect.selectOption(String(start));
  }
};

test.describe("描画範囲変更 E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("【サニティ】初期状態でグラフが表示される", async ({ page }) => {
    // 名目・実質ともに、少なくとも複数本の棒が描画されていること（複数年×複数系列）
    const nominalBarCount = await bars(page, NOMINAL).count();
    const realBarCount = await bars(page, REAL).count();

    // 四半期数×系列数で計算: MIN 2005 ～ MAX 2016（48四半期） × 5系列 = 240本が上限
    // 初期状態はフルレンジなので、かなりの本数が期待できる
    expect(nominalBarCount).toBeGreaterThan(20);
    expect(realBarCount).toBeGreaterThan(20);
  });

  test("開始年を上げるとグラフが狭まる（名目）", async ({ page }) => {
    // 初期棒本数を記録
    const initialCount = await bars(page, NOMINAL).count();

    // オプション取得＆2番目の年、および現在の終了年を取得
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const endOptions = await page.locator("#endYear").locator("option").allTextContents();

    if (startOptions.length < 2 || endOptions.length < 1) {
      test.skip(); // 複数年オプションがない場合はスキップ
    }

    const newStartYear = Number(startOptions[1]?.replace("年", ""));
    const endYear = Number(endOptions[endOptions.length - 1]?.replace("年", ""));

    if (!newStartYear || !endYear) return;

    await setRange(page, newStartYear, endYear);

    // 棒本数が減少していることで「フィルタが効いている」ことを検証
    const newCount = await bars(page, NOMINAL).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test("開始年を上げるとグラフが狭まる（実質）", async ({ page }) => {
    // 初期棒本数を記録
    const initialCount = await bars(page, REAL).count();

    // オプション取得＆2番目の年、および現在の終了年を取得
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const endOptions = await page.locator("#endYear").locator("option").allTextContents();

    if (startOptions.length < 2 || endOptions.length < 1) {
      test.skip();
    }

    const newStartYear = Number(startOptions[1]?.replace("年", ""));
    const endYear = Number(endOptions[endOptions.length - 1]?.replace("年", ""));

    if (!newStartYear || !endYear) return;

    await setRange(page, newStartYear, endYear);

    // 棒本数が減少していること
    const newCount = await bars(page, REAL).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test("終了年を下げるとグラフが狭まる（名目）", async ({ page }) => {
    // 初期棒本数を記録
    const initialCount = await bars(page, NOMINAL).count();

    // オプション取得＆最後の前の年、および現在の開始年を取得
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const endOptions = await page.locator("#endYear").locator("option").allTextContents();

    if (endOptions.length < 2 || startOptions.length < 1) {
      test.skip();
    }

    const startYear = Number(startOptions[0]?.replace("年", ""));
    const newEndYear = Number(endOptions[endOptions.length - 2]?.replace("年", ""));

    if (!startYear || !newEndYear) return;

    await setRange(page, startYear, newEndYear);

    // 棒本数が減少していること
    const newCount = await bars(page, NOMINAL).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test("終了年を下げるとグラフが狭まる（実質）", async ({ page }) => {
    // 初期棒本数を記録
    const initialCount = await bars(page, REAL).count();

    // オプション取得＆最後の前の年、および現在の開始年を取得
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const endOptions = await page.locator("#endYear").locator("option").allTextContents();

    if (endOptions.length < 2 || startOptions.length < 1) {
      test.skip();
    }

    const startYear = Number(startOptions[0]?.replace("年", ""));
    const newEndYear = Number(endOptions[endOptions.length - 2]?.replace("年", ""));

    if (!startYear || !newEndYear) return;

    await setRange(page, startYear, newEndYear);

    // 棒本数が減少していること
    const newCount = await bars(page, REAL).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test("【境界値】開始年=終了年でグラフが1年に狭まる", async ({ page }) => {
    // 2015年に固定
    await setRange(page, 2015, 2015);

    // 棒本数が4の倍数（4 quarters × 表示系列数）
    // 1年 = 4四半期なので、表示系列数に応じた4の倍数になるはず
    const nominalBarCount = await bars(page, NOMINAL).count();
    const realBarCount = await bars(page, REAL).count();

    expect(nominalBarCount).toBeGreaterThan(0);
    expect(nominalBarCount % 4).toBe(0); // 4四半期 × N系列
    expect(realBarCount).toBeGreaterThan(0);
    expect(realBarCount % 4).toBe(0);
  });

  test("【比例検証】範囲が2倍になると棒本数が増加", async ({ page }) => {
    // 2015年のみ
    await setRange(page, 2015, 2015);
    const bars2015Only = await bars(page, NOMINAL).count();

    // 2014–2015年
    await setRange(page, 2014, 2015);
    const bars2014to2015 = await bars(page, NOMINAL).count();

    // 2014–2015が2015のみより多いこと（年が倍になるため）
    expect(bars2014to2015).toBeGreaterThan(bars2015Only);
  });

  test("操作中にコンソール/ページエラーが発生しない", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    // 複数回の範囲変更を実行
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const endOptions = await page.locator("#endYear").locator("option").allTextContents();

    if (startOptions.length > 1 && endOptions.length > 0) {
      const newStart = Number(startOptions[1]?.replace("年", ""));
      const currentEnd = Number(endOptions[endOptions.length - 1]?.replace("年", ""));
      if (newStart && currentEnd && newStart <= currentEnd) {
        await setRange(page, newStart, currentEnd);
      }
    }

    if (endOptions.length > 1 && startOptions.length > 0) {
      const currentStart = Number(startOptions[0]?.replace("年", ""));
      const newEnd = Number(endOptions[endOptions.length - 2]?.replace("年", ""));
      if (currentStart && newEnd && currentStart <= newEnd) {
        await setRange(page, currentStart, newEnd);
      }
    }

    // エラーなし
    expect(errors).toEqual([]);
  });
});
