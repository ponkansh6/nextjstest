import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

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
 *
 * 注意: 開始年/終了年のいずれかを変更すると、ボトムシートは自動的に閉じる
 * (片方のみを変更するのが主流のユースケースであるため)。開始年・終了年を
 * 連続して変更する場合は、1つ目の変更後にシートが閉じた前提で、2つ目を
 * 変更する前に再度シートを開き直す必要がある(setRange ヘルパー内の
 * ensureSheetOpen を参照)。
 */

const NOMINAL = "spending-chart-nominal";
const REAL = "spending-chart-real";

// Helper: 指定テスト ID のグラフ内 .recharts-bar-rectangle locator
const bars = (page: Page, testId: string) =>
  page.getByTestId(testId).locator(".recharts-bar-rectangle");

// Helper: 開始年/終了年のいずれかを変更するとボトムシートが自動的に閉じるため、
// シートが閉じていれば「表示期間を変更」ボタンを再クリックして開き直す
const ensureSheetOpen = async (page: Page) => {
  const isOpen = await page
    .locator("#startYear")
    .isVisible()
    .catch(() => false);
  if (!isOpen) {
    await page.getByRole("button", { name: "表示期間を変更" }).click();
  }
};

// Helper: 開始年・終了年を変更（制約: start <= end）
const setRange = async (page: Page, start: number, end: number) => {
  await ensureSheetOpen(page);
  const startSelect = page.locator("#startYear");
  const endSelect = page.locator("#endYear");

  // ChartFilters.tsx で start > end や end < start の option は disabled
  // 故に「開始→終了」の順で変更すれば制約違反しない
  if (start <= end) {
    await startSelect.selectOption(String(start));
    // フィルタ変更後に終了年の選択肢が変わる可能性があるため、少し待つ
    await page.waitForTimeout(100);
    // 開始年の変更でシートが自動的に閉じているため、終了年を選ぶ前に開き直す
    await ensureSheetOpen(page);
    await endSelect.selectOption(String(end));
  } else {
    // 逆順の場合は終了→開始で設定
    await endSelect.selectOption(String(end));
    await page.waitForTimeout(100);
    // 終了年の変更でシートが自動的に閉じているため、開始年を選ぶ前に開き直す
    await ensureSheetOpen(page);
    await startSelect.selectOption(String(start));
  }
};

test.describe("描画範囲変更 E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // networkidle はチャートの非同期描画(ResizeObserver経由)完了を保証しないため、
    // 実際に棒が描画されるまで明示的に待つ
    await expect(bars(page, NOMINAL).first()).toBeVisible({ timeout: 10000 });
    await expect(bars(page, REAL).first()).toBeVisible({ timeout: 10000 });
    // 開始年/終了年セレクトは常時表示ではなくボトムシート内にのみ存在するため、
    // 各テストの前にシートを開いておく(年変更で自動的に閉じるため、以後
    // 必要に応じて setRange 内の ensureSheetOpen で開き直す)
    await page.getByRole("button", { name: "表示期間を変更" }).click();
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

    // オプション取得＆現在の終了年を取得、開始年を変更
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const currentEndYear = Number(await page.locator("#endYear").inputValue());

    if (startOptions.length < 2) {
      test.skip();
    }

    const newStartYear = Number(startOptions[1]?.replace("年", ""));
    if (!newStartYear || isNaN(currentEndYear)) return;

    await setRange(page, newStartYear, currentEndYear);

    // 棒本数が減少していることで「フィルタが効いている」ことを検証
    const newCount = await bars(page, NOMINAL).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test("開始年を上げるとグラフが狭まる（実質）", async ({ page }) => {
    // 初期棒本数を記録
    const initialCount = await bars(page, REAL).count();

    // オプション取得＆現在の終了年を取得、開始年を変更
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const currentEndYear = Number(await page.locator("#endYear").inputValue());

    if (startOptions.length < 2) {
      test.skip();
    }

    const newStartYear = Number(startOptions[1]?.replace("年", ""));
    if (!newStartYear || isNaN(currentEndYear)) return;

    await setRange(page, newStartYear, currentEndYear);

    // 棒本数が減少していること
    const newCount = await bars(page, REAL).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test("終了年を下げるとグラフが狭まる（名目）", async ({ page }) => {
    // 初期棒本数を記録
    const initialCount = await bars(page, NOMINAL).count();

    // オプション取得＆現在の開始年を取得、終了年を変更
    const endOptions = await page.locator("#endYear").locator("option").allTextContents();
    const currentStartYear = Number(await page.locator("#startYear").inputValue());

    if (endOptions.length < 2) {
      test.skip();
    }

    const newEndYear = Number(endOptions[endOptions.length - 2]?.replace("年", ""));
    if (!newEndYear || isNaN(currentStartYear)) return;

    await setRange(page, currentStartYear, newEndYear);

    // 棒本数が減少していること
    const newCount = await bars(page, NOMINAL).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test("終了年を下げるとグラフが狭まる（実質）", async ({ page }) => {
    // 初期棒本数を記録
    const initialCount = await bars(page, REAL).count();

    // オプション取得＆現在の開始年を取得、終了年を変更
    const endOptions = await page.locator("#endYear").locator("option").allTextContents();
    const currentStartYear = Number(await page.locator("#startYear").inputValue());

    if (endOptions.length < 2) {
      test.skip();
    }

    const newEndYear = Number(endOptions[endOptions.length - 2]?.replace("年", ""));
    if (!newEndYear || isNaN(currentStartYear)) return;

    await setRange(page, currentStartYear, newEndYear);

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

  test("開始年または終了年を変更するとボトムシートが自動的に閉じる", async ({ page }) => {
    // beforeEach でシートは開いている
    await expect(page.locator("#startYear")).toBeVisible();

    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const currentEndYear = Number(await page.locator("#endYear").inputValue());
    const newStartYear = Number(startOptions[1]?.replace("年", ""));
    if (!newStartYear || isNaN(currentEndYear)) return;

    await page.locator("#startYear").selectOption(String(newStartYear));

    // 開始年変更のみでシートが自動的に閉じること
    await expect(page.locator("#startYear")).toBeHidden();

    // シートを開き直し、終了年変更でも同様に閉じることを確認
    await page.getByRole("button", { name: "表示期間を変更" }).click();
    await expect(page.locator("#endYear")).toBeVisible();

    const endOptions = await page.locator("#endYear").locator("option").allTextContents();
    const newEndYear = Number(endOptions[endOptions.length - 2]?.replace("年", ""));
    if (!newEndYear) return;

    await page.locator("#endYear").selectOption(String(newEndYear));

    await expect(page.locator("#endYear")).toBeHidden();
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

  test("年範囲変更後もスクロール位置が維持されるべき", async ({ page }) => {
    // NOMINAL チャートは data-testid なので getByTestId で取得し、十分下にスクロールする
    const nominalLocator = page.getByTestId("spending-chart-nominal");
    await nominalLocator.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 300));

    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(50);

    // 開始年を1回だけ変更する。
    // 注意: setRange は変更後にシートを開き直してページ上部の「表示期間を変更」
    // ボタンを再クリックするため、それが自動スクロールを誘発して測定を汚染する。
    // ここでは beforeEach で開いたシートのまま直接 selectOption する。
    const startOptions = await page.locator("#startYear").locator("option").allTextContents();
    const currentEndYear = Number(await page.locator("#endYear").inputValue());
    if (startOptions.length < 2) {
      test.skip();
      return;
    }

    const newStartYear = Number(startOptions[1]?.replace("年", ""));
    if (!newStartYear || isNaN(currentEndYear)) return;

    await page.locator("#startYear").selectOption(String(newStartYear));
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(50);
  });

  test("最大期間ボタンで2005年から最新年に一括設定され、シートが閉じ、URLに反映される", async ({
    page,
  }) => {
    // 1. まず範囲を狭める
    await setRange(page, 2015, 2020);
    await page.waitForTimeout(300);

    // 2. シートを開いて「最大期間」ボタンをクリック
    await ensureSheetOpen(page);
    const maxButton = page.getByRole("button", { name: "最大期間" });
    await expect(maxButton).toBeVisible();
    await maxButton.click();
    await page.waitForTimeout(400);

    // 3. ボトムシートが自動的に閉じることを確認
    const isOpen = await page
      .locator("#startYear")
      .isVisible()
      .catch(() => false);
    expect(isOpen, "最大期間ボタンクリック後はボトムシートが自動的に閉じるべき").toBe(false);

    // 4. 再度シートを開いて値が 2005 と最新年になっているか確認
    await ensureSheetOpen(page);
    const startVal = await page.locator("#startYear").inputValue();
    const endSelect = page.locator("#endYear");
    const endOptions = await endSelect.locator("option").allTextContents();
    const latestYear = endOptions[endOptions.length - 1]?.replace("年", "");

    expect(startVal).toBe("2005");
    expect(await endSelect.inputValue()).toBe(latestYear);

    // 5. URL に from=2005 や終了年のパラメータが反映されていること（デフォルト範囲以外の場合のみクエリが立つ仕様のため、2005はデフォルトの場合は省略され得るが、今回は開始年がデフォルト等で挙動を確認）
    const url = page.url();
    // デフォルトと異なる範囲を指定したためURLが変化していること、あるいはURLに含まれることを確認
    expect(url).toContain("to=");
  });
});
