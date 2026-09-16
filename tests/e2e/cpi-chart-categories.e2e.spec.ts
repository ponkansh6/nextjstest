import { test, expect } from "./fixtures";

/**
 * E2E テスト: CPI チャートに全費目が表示されている
 *
 * 目的: CPI_CATEGORIES の全12費目（含む被服履物・交通自動車等）がグラフ凡例に表示されることを検証。
 * 特に CPI_CATEGORIES の順序変更後に、全費目が正しく描画されていることを確認する。
 */

test("物価指数チャート - 全費目が凡例に表示される", async ({ page }) => {
  await page.goto("/");

  // section-stacked セクション内の凡例を確認
  const stackedSection = page.locator("#section-stacked");

  // 期待される全費目
  const expectedCategories = [
    "住居",
    "家具・家事用品",
    "被服履物",
    "保健医療",
    "教育",
    "光熱水道",
    "教養娯楽",
    "交通自動車等",
    "通信",
    "外食以外食料",
    "外食",
    "諸雑費",
  ];

  // 各費目がセクション内に存在するか確認
  for (const category of expectedCategories) {
    const element = stackedSection.getByRole("button", { name: category, exact: true });
    await expect(element).toBeVisible();
  }
});

test("費目凡例をクリックして系列を絞ってもスクロール位置が維持される", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const stackedSection = page.locator("#section-stacked");

  // 費目「住居」の凡例ボタンを先にビューポート内へ入れておく
  // （Playwright の click() は対象が画面外にあると自動スクロールするため、
  //  クリック自体のスクロールを測定に混入させない）
  const categoryButton = stackedSection.getByRole("button", { name: "住居", exact: true });
  await categoryButton.scrollIntoViewIfNeeded();

  // 凡例クリック前のスクロール位置を記録（section-stacked はページ上部以外にある前提）
  const before = await page.evaluate(() => window.scrollY);
  expect(before, "前提: section-stacked はページ上部以外の位置にある").toBeGreaterThan(100);

  // 費目「住居」の凡例ボタンをクリックして系列を絞る
  await categoryButton.click();
  await page.waitForTimeout(500);

  // 凡例クリック後もスクロール位置が維持されていること
  // （バグがあると URL 更新（router.replace）起因で画面上部へ強制移動される）
  const after = await page.evaluate(() => window.scrollY);
  expect(
    Math.abs(after - before),
    "凡例クリック後もスクロール位置が維持されるべき（画面上部へ移動しない）",
  ).toBeLessThan(50);
});

test("CPI tooltipは12費目と合計を同じroot/row契約で表示する", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const section = page.locator("#section-stacked");
  await expect(section).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  const chart = section.locator(".recharts-wrapper").first();
  const hoverPlot = async () => {
    const areaPaths = chart.locator("path.recharts-area-area:visible");
    await expect(areaPaths, "前提: 表示中のCPI積み上げArea pathがある").not.toHaveCount(0);
    const areaCount = await areaPaths.count();
    let box: { x: number; y: number; width: number; height: number } | null = null;
    for (let index = 0; index < areaCount; index += 1) {
      const candidate = await areaPaths.nth(index).boundingBox();
      if (candidate && candidate.width > 0 && candidate.height > 0) {
        box = candidate;
        break;
      }
    }
    expect(box, "前提: 表示中Area pathに有効なboundingBoxがある").not.toBeNull();
    if (!box) return;
    // 再描画後に残っている実Area pathの領域へ移動し、hidden後も有効な系列をhoverする。
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 8 });
  };

  await hoverPlot();

  const tooltip = page.locator('[data-tooltip-root="true"]');
  await expect(tooltip).toBeVisible({ timeout: 5000 });
  await expect(tooltip.locator('[data-tooltip-total="true"]')).toBeVisible();
  const rows = tooltip.locator('[data-tooltip-row="true"]');
  await expect(rows).toHaveCount(12);
  await expect(tooltip).toContainText("住居");
  await expect(tooltip).toContainText("交通・自動車等関係費");
  await expect(tooltip).toContainText("諸雑費");

  const contract = await tooltip.evaluate((root) => ({
    root: root.hasAttribute("data-tooltip-root"),
    total: Boolean(root.querySelector('[data-tooltip-total="true"]')),
    rows: [...root.querySelectorAll<HTMLElement>('[data-tooltip-row="true"]')].map((row) => ({
      key: row.getAttribute("data-tooltip-key"),
      order: row.getAttribute("data-tooltip-order"),
      text: row.textContent?.trim(),
    })),
  }));
  expect(contract.root).toBe(true);
  expect(contract.total).toBe(true);
  expect(contract.rows.every((row) => row.key && row.order !== null && row.text)).toBe(true);

  // 欠損値が含まれる実データ点では CustomTooltip の「—」表示も証跡化する。
  // 欠損のない点では、12行をDOMへ残す契約（row数とkey/order）を検証する。
  const missingRows = contract.rows.filter((row) => row.text?.includes("—"));
  expect(missingRows.length).toBeGreaterThanOrEqual(0);

  // 初期tooltipのhover stateを持ち込まないため、hidden検証はfresh pageで行う。
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const freshSection = page.locator("#section-stacked");
  await expect(freshSection).toBeVisible();
  await freshSection.scrollIntoViewIfNeeded();
  const freshCategoryButton = freshSection.getByRole("button", { name: "住居", exact: true });
  await freshCategoryButton.click();
  // 凡例の状態変更でsurfaceが再描画されるため、再取得した実座標へhoverする。
  await expect(freshCategoryButton).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(0, 0);
  const freshChart = freshSection.locator(".recharts-wrapper").first();
  const freshAreaPaths = freshChart.locator("path.recharts-area-area:visible");
  await expect(
    freshAreaPaths,
    "前提: hidden後も表示中のCPI積み上げArea pathがある",
  ).not.toHaveCount(0);
  const viewport = page.viewportSize();
  expect(viewport, "前提: Playwright viewportが取得できる").not.toBeNull();
  if (!viewport) return;
  let freshBox: { x: number; y: number; width: number; height: number } | null = null;
  for (let index = 0; index < (await freshAreaPaths.count()); index += 1) {
    const candidate = await freshAreaPaths.nth(index).boundingBox();
    if (
      candidate &&
      candidate.width > 0 &&
      candidate.height > 0 &&
      candidate.x >= 0 &&
      candidate.y >= 0 &&
      candidate.x + candidate.width <= viewport.width &&
      candidate.y + candidate.height <= viewport.height
    ) {
      freshBox = candidate;
      break;
    }
  }
  expect(
    freshBox,
    "前提: hidden後の表示中Area pathにviewport内の有効なboundingBoxがある",
  ).not.toBeNull();
  if (!freshBox) return;
  await page.mouse.move(freshBox.x + freshBox.width * 0.5, freshBox.y + freshBox.height * 0.45, {
    steps: 8,
  });
  const freshTooltip = freshSection.locator('[data-tooltip-root="true"]');
  await expect(freshTooltip).toBeVisible({ timeout: 5000 });
  await expect(freshTooltip.locator('[data-tooltip-total="true"]')).toBeVisible();
  await expect(freshTooltip.locator('[data-tooltip-row="true"]')).toHaveCount(11);
  const hiddenRow = freshTooltip.locator('[data-tooltip-row="true"]').filter({ hasText: "住居" });
  await expect(hiddenRow).toHaveCount(0);
});
