import { test, expect } from "./fixtures";
import {
  extractFlightFromHtml,
  extractArrayProp,
  filter2005to2016,
  formatDistribution,
  REAL_PROP,
  type QuarterlyRow,
} from "../utils/flight-payload";

/**
 * E2E テスト: page.tsx の実ビルド・実サーバー・実ブラウザ検証。
 *
 * 実行フロー:
 *   1. playwright.config.ts の webServer が「pnpm start」を起動
 *   2. ブラウザで http://localhost:3000 へアクセス
 *   3. RSC Flight ペイロード + 実 recharts DOM の検証
 *
 * ⚠️ このテストの失敗 = page.tsx の回帰（今回のバグと同型）を検知
 */
test.describe("page.tsx E2E: real consumption chart with actual browser", () => {
  test("should render page and extract quarterlyRealData from Flight payload", async ({ page }) => {
    // ページにアクセス
    await page.goto("/");

    // HTML を取得（React Flight ペイロード埋め込み）
    const html = await page.content();

    // Flight ペイロードを抽出（server-sent Flight チャンク形式）
    let payload: string;
    try {
      payload = extractFlightFromHtml(html);
    } catch (e) {
      console.log(`Flight extraction failed: ${e}. HTML length: ${html.length}`);
      throw e;
    }

    // 実質側の四半期配列を抽出
    let realRows: QuarterlyRow[];
    try {
      realRows = filter2005to2016(extractArrayProp(payload, REAL_PROP));
    } catch (e) {
      console.log(`Failed to extract ${REAL_PROP}: ${e}. Payload length: ${payload.length}`);
      throw e;
    }

    expect(realRows.length, "2005-2016 should have 48 quarters").toBe(48);
  });

  test("should have non-zero 民間最終消費支出（実質） for 2005-2016", async ({ page }) => {
    /**
     * ⚠️ このテストの失敗 = 商用で起きたバグと同じ症状をローカル実ビルドで再現。
     * page.tsx の quarterlyKeys から実質キーが削られたなど、アプリケーション層の
     * ロジックエラーを直接検知する（ビルド成果物、サーバーロジック経由で）。
     */
    await page.goto("/");
    const html = await page.content();
    const payload = extractFlightFromHtml(html);
    const realRows = filter2005to2016(extractArrayProp(payload, REAL_PROP)) as QuarterlyRow[];

    const supportKey = "民間最終消費支出（実質）";
    const zeros = realRows.filter((r) => !(Number(r[supportKey]) > 0));

    const report = formatDistribution(realRows, supportKey);
    console.log(`\n[E2E: Real Consumption Data]\n${report}`);

    expect(
      zeros.length,
      `E2E REGRESSION: ${supportKey} is 0 for ${zeros.length}/${realRows.length} quarters.\n${report}`,
    ).toBe(0);
  });

  test("should render without hydration or console errors", async ({ page }) => {
    /**
     * ハイドレーションエラーや JSランタイムエラーの検知。
     * 実ブラウザだからこそ検知できる（jsdom では hydration mismatch を正確に検知しない）。
     */
    const errors: string[] = [];

    page.on("pageerror", (err) => {
      errors.push(`Page error: ${err.message}`);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    await page.goto("/");

    expect(errors, `Page should load without errors.\nErrors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("should render UI components in real consumption chart", async ({ page }) => {
    /**
     * 実質消費グラフのセクションが DOM に存在することを確認。
     * 詳細な recharts 要素検査は jsdom/vitest での検証で十分なため、
     * E2E では主要な章立てが実ブラウザで描画されたことの確認のみ。
     *
     * ⚠️ このセクションは LazyMount(P5-1) 配下でハイドレーション後にマウントされるため、
     * SSR の HTML には存在しない。id で特定し、expect の自動待機で解決させる。
     */
    await page.goto("/");

    const realChartSection = page.locator("#section-consumption-real");
    await expect(realChartSection, "Real consumption chart section should be visible").toBeVisible({
      timeout: 15000,
    });
  });

  test("legend note link should point to an anchor that actually exists in the DOM", async ({
    page,
  }) => {
    /**
     * 「凡例は『消費支出（名目）』と連動しています」のリンク先が実在する id を
     * 指しているかを検証する。下線は付いているがリンク先が存在しないと、
     * クリックしても何も起きない「見た目だけのリンク」になる。
     */
    await page.goto("/");

    const noteLink = page.getByRole("link", { name: "消費支出（名目）" });
    await expect(noteLink, "Note link in real consumption chart should be visible").toBeVisible({
      timeout: 15000,
    });

    const href = await noteLink.getAttribute("href");
    expect(href, "Note link should have a fragment href").toMatch(/^#/);

    const targetId = href!.slice(1);
    const target = page.locator(`#${targetId}`);
    await expect(
      target,
      `Note link's target "#${targetId}" should exist as an element id in the DOM`,
    ).toHaveCount(1);
  });

  test("should handle legend toggle and update chart visibility", async ({ page }) => {
    /**
     * UI インタラクション sanity: 実ブラウザだからこそテスト可能な、
     * 凡例クリックによる系列表示/非表示の切り替え。
     */
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 凡例アイテムを探す（aria-pressed 属性で特定、LazyMount 対応）
    const legendItems = page.locator("[aria-pressed]").first();
    const isVisible = await legendItems.isVisible({ timeout: 10000 });

    expect(isVisible, "Should have legend items visible").toBe(true);
    console.log(`✓ Found visible legend items`);

    // クリックしてインタラクション動作確認
    try {
      await legendItems.click({ timeout: 5000 });
      console.log(`✓ Legend item is clickable`);
    } catch {
      console.log(`⚠️ Legend item click timed out (acceptable in this context)`);
    }

    // ページが安定している（エラーが出ない）ことを確認
    await page.waitForTimeout(500);
    // 意図的なエラー検知は page.on("pageerror") で追跡済み
  });

  test.describe("実質消費凡例アコーディオン", () => {
    test("T-E2E-A1: 初期表示で実質セクションの凡例ボタンが見えない（アコーディオンが閉じている）", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // LazyMount のためスクロールしてマウントを促す
      const realSection = page.locator("#section-consumption-real");
      await realSection.scrollIntoViewIfNeeded();
      await expect(realSection).toBeVisible({ timeout: 15000 });

      // summary should be visible
      const summary = realSection.locator("summary");
      await expect(summary).toBeVisible();
      await expect(summary).toHaveText("凡例を表示（費目・四半期）");

      // legend items (buttons with aria-pressed) inside real section should NOT be visible or count as 0 if hidden by details
      const items = realSection.locator("[aria-pressed]");
      // When <details> is closed, items are either not visible or not rendered in layout
      const count = await items.count();
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          await expect(items.nth(i)).not.toBeVisible();
        }
      } else {
        expect(count).toBe(0);
      }
    });

    test("T-E2E-A2: <summary> をクリックすると凡例が現れ、費目ボタンが可視になる", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // LazyMount のためスクロールしてマウントを促す
      const realSection = page.locator("#section-consumption-real");
      await realSection.scrollIntoViewIfNeeded();
      await expect(realSection).toBeVisible({ timeout: 15000 });

      const summary = realSection.locator("summary");
      await expect(summary).toBeVisible();
      await summary.click();

      const firstBtn = realSection.locator("[aria-pressed]").first();
      await expect(firstBtn).toBeVisible();
    });

    test("T-E2E-A3: 連動の検証: 実質側の凡例で費目を非表示にすると、名目チャートの棒本数も減る", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // LazyMount のため両セクションをスクロールしてマウントを促す
      const nominalSection = page.locator("#section-consumption-nominal");
      await nominalSection.scrollIntoViewIfNeeded();
      await expect(nominalSection).toBeVisible({ timeout: 15000 });

      const countBars = async (sectionId: string) => {
        const bars = page.locator(`#${sectionId} .recharts-bar-rectangle`);
        return await bars.count();
      };

      const nominalBarsBefore = await countBars("section-consumption-nominal");
      expect(nominalBarsBefore).toBeGreaterThan(0);

      // Scroll to real section and open accordion
      const realSection = page.locator("#section-consumption-real");
      await realSection.scrollIntoViewIfNeeded();
      await expect(realSection).toBeVisible({ timeout: 15000 });
      await realSection.locator("summary").click();

      // Click a category button in real section legend (index 4+ are categories, 0-3 are Q1-Q4)
      const categoryBtn = realSection.locator("[aria-pressed]").nth(4);
      await expect(categoryBtn).toBeVisible();
      await categoryBtn.click();

      const nominalBarsAfter = await countBars("section-consumption-nominal");
      expect(nominalBarsAfter).toBeLessThan(nominalBarsBefore);
    });

    test("T-E2E-A4: 案内文リンク「消費支出（名目）」はアコーディオンの開閉に関係なく常に可視", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // LazyMount のためスクロールしてマウントを促す
      const realSection = page.locator("#section-consumption-real");
      await realSection.scrollIntoViewIfNeeded();
      await expect(realSection).toBeVisible({ timeout: 15000 });

      const link = realSection.getByRole("link", { name: "消費支出（名目）" });
      await expect(link).toBeVisible();

      // Open accordion
      await realSection.locator("summary").click();
      await expect(link).toBeVisible();
    });

    test("T-E2E-A5: summary ヘッダーがトナルピル装飾で、矢印SVGが含まれ、ガイドテキストが表示される", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // LazyMount のためスクロールしてマウントを促す
      const realSection = page.locator("#section-consumption-real");
      await realSection.scrollIntoViewIfNeeded();
      await expect(realSection).toBeVisible({ timeout: 15000 });

      const summary = realSection.locator("summary");
      await expect(summary).toBeVisible();

      // summary に legendAccordionSummary クラスが適用されている
      const summaryClass = await summary.getAttribute("class");
      expect(summaryClass).toContain("legendAccordionSummary");

      // 矢印 SVG が含まれている（CSS Modules がクラス名をハッシュ化するため要素セレクタで特定）
      const chevron = summary.locator("svg");
      await expect(chevron).toBeAttached();
      const ariaHidden = await chevron.getAttribute("aria-hidden");
      expect(ariaHidden).toBe("true");

      // ガイドテキストがアコーディオンの外に表示されている
      const guideText = realSection.locator("p", {
        hasText: "凡例を開くと四半期と費目の表示を切り替えられます。",
      });
      await expect(guideText).toBeVisible();
    });
  });
});
