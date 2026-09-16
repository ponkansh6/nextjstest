import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

/**
 * E2E テスト: モバイルでグラフをタップした際に出るRechartsツールチップの
 * クローズボタン動作およびタッチ操作（スワイプ、再タップ、タブジャンプ中抑制）を検証する。
 *
 * 背景: モバイルのツールチップは画面下端に固定表示されるボトムシートだが、
 * <Tooltip trigger="click"> を用いることで縦スクロール（スワイプ）時の誤表示を防ぐ。
 * また、同じ地点の再タップで再表示される機能や、プログラム的スクロール中の抑制を検証する。
 */
const NOMINAL = "spending-chart-nominal";
const REAL = "spending-chart-real";

type ViewportPoint = { x: number; y: number };
type ViewportBox = { x: number; y: number; width: number; height: number };

async function findViewportBar(
  page: Page,
  chart: Locator,
  scrollIntoView = true,
  horizontalRatio = 0.5,
): Promise<ViewportPoint> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable");

  let lastError: unknown;
  for (let retry = 0; retry < 4; retry += 1) {
    try {
      const bars = chart.locator(".recharts-bar-rectangle");
      if (scrollIntoView) await bars.first().scrollIntoViewIfNeeded();

      for (let index = 0; index < (await bars.count()); index += 1) {
        // Recharts can replace the SVG subtree between count(), boundingBox(),
        // and the eventual touch. Re-read the locator on every retry.
        const bar = chart.locator(".recharts-bar-rectangle").nth(index);
        const box = await bar.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) continue;

        // A partially clipped bar is still actionable when the actual tap point
        // is inside the fixed viewport. Keep the same point used for the tap in
        // the candidate check so this remains a real-coordinate interaction.
        const point = {
          x: box.x + box.width * horizontalRatio,
          y: box.y + box.height / 2,
        };
        if (
          point.x >= 0 &&
          point.x <= viewport.width &&
          point.y >= 0 &&
          point.y <= viewport.height
        ) {
          return point;
        }
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new Error(
    `No actionable bar tap point is inside the viewport (${viewport.width}x${viewport.height})`,
  );
}

const viewportBar = (page: Page, testId: string) => findViewportBar(page, page.getByTestId(testId));

function intersectionPoint(a: ViewportBox, b: ViewportBox): ViewportPoint | null {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return left < right && top < bottom ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
}

function pointOutsideBox(link: ViewportBox, covered: ViewportBox): ViewportPoint | null {
  const insetX = Math.min(2, link.width / 4);
  const insetY = Math.min(2, link.height / 4);
  const candidates: ViewportPoint[] = [
    { x: link.x + link.width / 2, y: link.y + link.height / 2 },
    { x: link.x + insetX, y: link.y + insetY },
    { x: link.x + link.width - insetX, y: link.y + insetY },
    { x: link.x + insetX, y: link.y + link.height - insetY },
    { x: link.x + link.width - insetX, y: link.y + link.height - insetY },
  ];
  const isInside = (box: ViewportBox, point: ViewportPoint) =>
    point.x > box.x &&
    point.x < box.x + box.width &&
    point.y > box.y &&
    point.y < box.y + box.height;

  const outside = candidates.find((point) => isInside(link, point) && !isInside(covered, point));
  if (outside) return outside;
  return null;
}

async function pointHitByLink(page: Page, link: Locator, point: ViewportPoint): Promise<boolean> {
  return page.evaluate(
    ({ x, y, href }) => {
      const target = document.elementFromPoint(x, y);
      return href != null && target?.closest("a")?.getAttribute("href") === href;
    },
    { ...point, href: await link.getAttribute("href") },
  );
}

async function waitForScrollYToSettle(page: Page): Promise<void> {
  let previous = await page.evaluate(() => window.scrollY);
  let stableSamples = 0;

  await expect
    .poll(
      async () => {
        const current = await page.evaluate(() => window.scrollY);
        stableSamples = current === previous ? stableSamples + 1 : 0;
        previous = current;
        return stableSamples;
      },
      { timeout: 5000, intervals: [100, 200, 300] },
    )
    .toBeGreaterThanOrEqual(2);
}

test.describe("モバイル ツールチップの閉じるボタンとインタラクション", () => {
  // このdescribeは、実touchを持つPixel 7相当のmobile-pixel projectだけを対象にする。
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-pixel",
      "isMobile/isTouch は narrow viewport + touch を持つ mobile-pixel のみで検証する",
    );
  });

  test("グラフをタップするとツールチップが表示され、✕ボタンとガイド線で閉じられる", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const point = await viewportBar(page, NOMINAL);
    await page.touchscreen.tap(point.x, point.y);

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton, "タップ後、ツールチップの閉じるボタンが表示されるべき").toBeVisible({
      timeout: 5000,
    });
    expect(await page.locator(".recharts-tooltip-cursor").count()).toBeGreaterThan(0);

    await closeButton.tap();

    await expect(
      closeButton,
      "閉じるボタンをタップした後、ツールチップは非表示になるべき",
    ).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".recharts-tooltip-cursor")).toHaveCount(0);
  });

  test("mobile-pixel: タップで表示したTooltipをEscapeで閉じ、Tooltipと閉じるボタンが消える", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const point = await viewportBar(page, NOMINAL);
    await page.touchscreen.tap(point.x, point.y);

    const tooltip = page.locator("[data-custom-tooltip]");
    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(closeButton).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");

    await expect(tooltip, "Escape後、Tooltipが非表示になるべき").not.toBeVisible({
      timeout: 5000,
    });
    await expect(closeButton, "Escape後、Tooltipの閉じるボタンも非表示になるべき").not.toBeVisible({
      timeout: 5000,
    });

    // Escapeからこのtouchまで、マウス/指を動かさずにdismissが完了していることを確認する。
    await page.touchscreen.tap(point.x, point.y);
    await expect(tooltip, "Escape後の次の正当なpointerdownでTooltipを再表示できるべき").toBeVisible(
      { timeout: 5000 },
    );
  });

  test("グラフ外をタップすると閉じるボタンとガイド線の両方が消える", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const point = await viewportBar(page, NOMINAL);
    await page.touchscreen.tap(point.x, point.y);

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    expect(await page.locator(".recharts-tooltip-cursor").count()).toBeGreaterThan(0);

    // Tap outside the chart (the chart title heading is outside .recharts-wrapper)
    const heading = page.getByRole("heading", { name: /消費支出（名目）/ }).first();
    await heading.tap();

    await expect(closeButton).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".recharts-tooltip-cursor")).toHaveCount(0);
  });

  test("別グラフをタップすると既存のガイド線が消え、新しいガイド線が1本だけになる", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const realChart = page.getByTestId(REAL);
    await realChart.scrollIntoViewIfNeeded();

    const nominalPoint = await viewportBar(page, NOMINAL);
    await page.touchscreen.tap(nominalPoint.x, nominalPoint.y);

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    expect(await page.locator(".recharts-tooltip-cursor").count()).toBe(1);

    const realPoint = await findViewportBar(page, realChart);
    await page.touchscreen.tap(realPoint.x, realPoint.y);

    await expect(closeButton).toBeVisible({ timeout: 5000 });
    // Total count of tooltip cursor across the page should still be 1 (old one dismissed)
    await expect(page.locator(".recharts-tooltip-cursor")).toHaveCount(1);
  });

  test("スクロールするとガイド線とツールチップが自動で消える", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const point = await viewportBar(page, NOMINAL);
    await page.touchscreen.tap(point.x, point.y);

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    expect(await page.locator(".recharts-tooltip-cursor").count()).toBe(1);

    // Scroll down by 60px
    await page.mouse.wheel(0, 60);

    await expect(closeButton).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".recharts-tooltip-cursor")).toHaveCount(0);
  });

  test("グラフ上を縦にスワイプしてもツールチップが表示されないこと（ネガティブテスト）", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chart = page.getByTestId(NOMINAL).locator(".recharts-wrapper");
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: cx, y: cy }],
    });
    for (let i = 1; i <= 5; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx, y: cy + i * 15 }],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).not.toBeVisible();
  });

  test("✕で閉じた後、同じバーをもう一度タップして再表示されること", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const point = await viewportBar(page, NOMINAL);
    await page.touchscreen.tap(point.x, point.y);
    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    await closeButton.tap();
    await expect(closeButton).not.toBeVisible({ timeout: 5000 });

    const repeatPoint = await viewportBar(page, NOMINAL);
    await page.touchscreen.tap(repeatPoint.x, repeatPoint.y);
    await expect(
      closeButton,
      "同じバーを再タップした際、閉じるボタンが再び表示されるべき",
    ).toBeVisible({ timeout: 5000 });
  });

  test.describe("固定viewportでのchartNote/Tooltip重なり", () => {
    // 実touchを持つmobile-pixel、viewport 412x915、実Tooltipと実座標の前提を固定する。
    test.use({ viewport: { width: 412, height: 915 } });

    test("tooltipと実質chartNoteリンクが重なる座標ではリンク遷移を遮蔽しtooltipを維持する", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const chart = page.getByTestId(REAL);
      const realTab = page
        .locator('[class*="sectionTabs"]')
        .getByRole("button", { name: "消費(実質)", exact: true });
      const waitForScrollYToSettleWithinTwoSeconds = async (): Promise<void> => {
        let previous = await page.evaluate(() => window.scrollY);
        let stableSamples = 0;
        await expect
          .poll(
            async () => {
              const current = await page.evaluate(() => window.scrollY);
              stableSamples = current === previous ? stableSamples + 1 : 0;
              previous = current;
              return stableSamples;
            },
            { timeout: 2000, intervals: [50, 100, 200] },
          )
          .toBeGreaterThanOrEqual(2);
      };
      await realTab.tap();
      await expect(chart).toBeInViewport({ timeout: 5000 });
      await waitForScrollYToSettleWithinTwoSeconds();

      const tooltip = page.locator("[data-custom-tooltip]");
      const chartNoteLink = chart.locator(
        'a[data-chart-note-link][href="#section-consumption-nominal"]',
      );
      await expect(chartNoteLink).toBeAttached();

      const getRect = async (locator: Locator): Promise<ViewportBox | null> =>
        locator.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
      const scrollInstantly = async (scrollY: number) => {
        await page.evaluate((nextScrollY) => {
          // Override a possible CSS scroll-behavior: smooth for this one real
          // page scroll. The following DOM reads must describe the settled page.
          const root = document.documentElement;
          const previousBehavior = root.style.scrollBehavior;
          root.style.scrollBehavior = "auto";
          window.scrollTo({ left: 0, top: nextScrollY, behavior: "auto" });
          root.style.scrollBehavior = previousBehavior;
        }, scrollY);
        await waitForScrollYToSettleWithinTwoSeconds();
      };
      const barCandidates = async () =>
        chart.locator(".recharts-bar-rectangle").evaluateAll((bars) =>
          bars.map((bar) => {
            const rect = bar.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
        );
      const tapVisibleBarUntilTooltip = async (label: string): Promise<void> => {
        const maxAttempts = 8;
        let lastCause: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            // Re-read the live bar before every real touch: the chart subtree can
            // be replaced while the tab's smooth scroll is settling.
            const point = await findViewportBar(page, chart, false);
            await page.touchscreen.tap(point.x, point.y);
            await expect
              .poll(() => tooltip.isVisible(), { timeout: 500, intervals: [50, 100] })
              .toBe(true);
            return;
          } catch (cause) {
            lastCause = cause;
          }
        }

        const scrollY = await page.evaluate(() => window.scrollY);
        const currentTooltipBox = await getRect(tooltip);
        const currentLinkBox = await getRect(chartNoteLink);
        const candidates = await barCandidates();
        throw new Error(
          `${label}: 実barへのtouchを${maxAttempts}回試行してもTooltipが表示されません ` +
            `(scrollY=${scrollY}, tooltip=${JSON.stringify(currentTooltipBox)}, ` +
            `link=${JSON.stringify(currentLinkBox)}, bars=${JSON.stringify(candidates)}, ` +
            `lastCause=${String(lastCause)})`,
        );
      };

      await tapVisibleBarUntilTooltip("初回Tooltip表示");

      let tooltipBox = await getRect(tooltip);
      let linkBox = await getRect(chartNoteLink);
      if (!tooltipBox || !linkBox) {
        throw new Error(
          `重なり探索の初期矩形を取得できません (tooltip=${JSON.stringify(tooltipBox)}, ` +
            `link=${JSON.stringify(linkBox)})`,
        );
      }

      const { currentScrollY, maxScrollY } = await page.evaluate(() => ({
        currentScrollY: window.scrollY,
        maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      }));
      const targetScrollY = Math.max(
        0,
        Math.min(
          maxScrollY,
          currentScrollY +
            (linkBox.y + linkBox.height / 2) -
            (tooltipBox.y + tooltipBox.height / 2),
        ),
      );
      await scrollInstantly(targetScrollY);

      // The absolute scroll can be changed by the browser while the chart is
      // settling. Re-read the live rectangles, then make one relative,
      // instant correction from their actual centers.
      tooltipBox = await getRect(tooltip);
      linkBox = await getRect(chartNoteLink);
      if (!tooltipBox || !linkBox) {
        throw new Error(
          "重なり補正の矩形を取得できません: " +
            `(scrollY=${await page.evaluate(() => window.scrollY)}, ` +
            `maxScrollY=${await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight))}, ` +
            `tooltip=${JSON.stringify(tooltipBox)}, link=${JSON.stringify(linkBox)})`,
        );
      }

      const correctionDelta =
        linkBox.y + linkBox.height / 2 - (tooltipBox.y + tooltipBox.height / 2);
      const correctionStartY = await page.evaluate(() => window.scrollY);
      const correctionMaxScrollY = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      );
      const expectedCorrectionScrollY = Math.max(
        0,
        Math.min(correctionMaxScrollY, correctionStartY + correctionDelta),
      );
      await page.evaluate((delta) => {
        const root = document.documentElement;
        const previousBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollBy(0, delta);
        root.style.scrollBehavior = previousBehavior;
      }, correctionDelta);
      await waitForScrollYToSettleWithinTwoSeconds();

      const correctedScrollY = await page.evaluate(() => window.scrollY);
      if (Math.abs(correctedScrollY - expectedCorrectionScrollY) > 1) {
        throw new Error(
          "Tooltipとリンクの相対スクロール補正に失敗しました: " +
            `(scrollY=${correctedScrollY}, maxScrollY=${correctionMaxScrollY}, ` +
            `delta=${correctionDelta}, tooltip=${JSON.stringify(await getRect(tooltip))}, ` +
            `link=${JSON.stringify(await getRect(chartNoteLink))})`,
        );
      }

      if (!(await tooltip.isVisible())) {
        await tapVisibleBarUntilTooltip("Tooltip再表示");
      }
      tooltipBox = await getRect(tooltip);
      linkBox = await getRect(chartNoteLink);

      const overlap =
        tooltipBox && linkBox
          ? {
              left: Math.max(tooltipBox.x, linkBox.x),
              right: Math.min(tooltipBox.x + tooltipBox.width, linkBox.x + linkBox.width),
              top: Math.max(tooltipBox.y, linkBox.y),
              bottom: Math.min(tooltipBox.y + tooltipBox.height, linkBox.y + linkBox.height),
            }
          : null;
      const coveredPoint = tooltipBox && linkBox ? intersectionPoint(tooltipBox, linkBox) : null;

      if (
        !coveredPoint ||
        !overlap ||
        overlap.left >= overlap.right ||
        overlap.top >= overlap.bottom
      ) {
        throw new Error(
          "重なりを再現できません: project=mobile-pixel, viewport=412x915, " +
            "実DOMの中心差分でwindow.scrollByし、実touchでTooltipを再表示済みだが矩形が交差しない " +
            `(scrollY=${await page.evaluate(() => window.scrollY)}, ` +
            `maxScrollY=${await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight))}, ` +
            `targetScrollY=${targetScrollY}, tooltip=${JSON.stringify(tooltipBox)}, ` +
            `link=${JSON.stringify(linkBox)}, bars=${JSON.stringify(await barCandidates())})`,
        );
      }

      expect(
        await page.evaluate(({ x, y }) => {
          return document.elementFromPoint(x, y)?.closest("[data-custom-tooltip]") != null;
        }, coveredPoint),
        "重なり座標の実ヒット対象はTooltip本体であるべき",
      ).toBe(true);
      await page.touchscreen.tap(coveredPoint.x, coveredPoint.y);
      await expect(page).not.toHaveURL(/#section-consumption-nominal$/);
      await expect(tooltip).toBeVisible();
    });
  });

  test("tooltip外の実質chartNoteリンクはtooltipを閉じて名目セクションへ遷移する", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chart = page.getByTestId(REAL);
    await chart.scrollIntoViewIfNeeded();
    const point = await findViewportBar(page, chart, false);
    await page.touchscreen.tap(point.x, point.y);

    const tooltip = page.locator("[data-custom-tooltip]");
    const chartNoteLink = chart.locator('a[href="#section-consumption-nominal"]');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await expect(chartNoteLink).toBeVisible();

    const tooltipBox = await tooltip.boundingBox();
    const linkBox = await chartNoteLink.boundingBox();
    expect(tooltipBox).not.toBeNull();
    expect(linkBox).not.toBeNull();
    if (!tooltipBox || !linkBox) return;

    const outsidePoint = pointOutsideBox(linkBox, tooltipBox);
    expect(outsidePoint, "tooltip外で同リンクをタップできる座標が必要").not.toBeNull();
    if (!outsidePoint) return;

    expect(
      await pointHitByLink(page, chartNoteLink, outsidePoint),
      "tooltip外の実座標がchartNoteリンクを実際にヒットすべき",
    ).toBe(true);
    expect(
      await page.evaluate(({ x, y }) => {
        return document.elementFromPoint(x, y)?.closest("[data-custom-tooltip]") == null;
      }, outsidePoint),
      "通常遷移の座標はTooltip本体の外側であるべき",
    ).toBe(true);

    await page.touchscreen.tap(outsidePoint.x, outsidePoint.y);
    await expect(page).toHaveURL(/#section-consumption-nominal$/);
    await expect(tooltip).not.toBeVisible({ timeout: 5000 });
  });

  test("エリアチャートをグラフ外タップで閉じるとアクティブドットも消える", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const stacked = page.locator("#section-stacked");
    await stacked.scrollIntoViewIfNeeded();
    const wrapper = stacked.locator(".recharts-wrapper").first();
    await expect(wrapper).toBeVisible({ timeout: 10000 });

    const box = await wrapper.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await wrapper.tap({ position: { x: box.width / 2, y: box.height / 2 } });

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".recharts-tooltip-cursor")).toHaveCount(1);
    const dotCountAfterTap = await page.locator(".recharts-active-dot").count();
    expect(
      dotCountAfterTap,
      "タップ後、エリアチャートにアクティブドットが表示されるべき",
    ).toBeGreaterThan(0);

    // グラフ外（チャートタイトル見出し）をタップして閉じる
    const heading = page.getByRole("heading", { name: /費目別寄与度/ }).first();
    await heading.tap();

    await expect(closeButton).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(".recharts-tooltip-cursor")).toHaveCount(0);
    await expect(
      page.locator(".recharts-active-dot"),
      "グラフ外タップで閉じた後、アクティブドットも消えるべき",
    ).toHaveCount(0);
  });

  test("エリアチャートを✕で閉じるとアクティブドットも消える", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const stacked = page.locator("#section-stacked");
    await stacked.scrollIntoViewIfNeeded();
    const wrapper = stacked.locator(".recharts-wrapper").first();
    await expect(wrapper).toBeVisible({ timeout: 10000 });

    const box = await wrapper.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await wrapper.tap({ position: { x: box.width / 2, y: box.height / 2 } });

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    expect(await page.locator(".recharts-active-dot").count()).toBeGreaterThan(0);

    await closeButton.tap();

    await expect(closeButton).not.toBeVisible({ timeout: 5000 });
    await expect(
      page.locator(".recharts-active-dot"),
      "✕で閉じた後、アクティブドットも消えるべき",
    ).toHaveCount(0);
  });

  test("タブジャンプ中（プログラム的スクロール中）にグラフへ触れてもツールチップが出ないこと", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const cpiWrapper = page.locator("#section-cpi-major .recharts-wrapper").first();
    await cpiWrapper.scrollIntoViewIfNeeded();

    const tabButton = page.getByRole("button", { name: "給与", exact: true });
    await tabButton.tap();

    const box = await cpiWrapper.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const client = await page.context().newCDPSession(page);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }

    const closeButton = page.getByRole("button", { name: "閉じる" });
    await expect(closeButton).not.toBeVisible({ timeout: 5000 });
    await waitForScrollYToSettle(page);
    await expect(closeButton).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("デスクトップ ツールチップのホバー回帰テスト", () => {
  // このdescribeは、実mouse/pointermoveを持つDesktop Chromeのchromium projectだけを対象にする。
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "デスクトップのホバー挙動は chromium プロジェクトでのみ検証する",
    );
  });

  test("chromium: ホバー表示後Escapeで閉じ、外部クリックでもdismissされること", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chart = page.getByTestId(NOMINAL);
    const tooltipWrapper = chart.locator(".recharts-tooltip-wrapper");
    let initialHoverError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const point = await findViewportBar(page, chart);
        await page.mouse.move(point.x, point.y);
        await expect
          .poll(() => tooltipWrapper.isVisible(), { timeout: 1200, intervals: [50, 100] })
          .toBe(true);
        initialHoverError = undefined;
        break;
      } catch (error) {
        initialHoverError = error;
      }
    }
    if (initialHoverError) throw initialHoverError;

    await page.keyboard.press("Escape");
    await expect(tooltipWrapper, "EscapeでデスクトップTooltipがdismissされるべき").not.toBeVisible({
      timeout: 5000,
    });

    // Escape単独のdismiss確認後、まずチャート外へ出てから別の有効bar座標へ移動する。
    await page.mouse.move(0, 0);
    const repeatPoint = await findViewportBar(page, chart, false, 0.75);
    await page.mouse.move(repeatPoint.x, repeatPoint.y);
    await expect(tooltipWrapper).toBeVisible({ timeout: 5000 });

    await page.mouse.move(0, 0);
    await expect(
      tooltipWrapper,
      "Tooltip外へマウスを移動するとデスクトップTooltipがdismissされるべき",
    ).not.toBeVisible({ timeout: 5000 });

    const heading = page.getByRole("heading", { name: /消費支出（名目）/ }).first();
    const headingBox = await heading.boundingBox();
    expect(headingBox).not.toBeNull();
    if (!headingBox) return;
    const finalPoint = await findViewportBar(page, chart, false);
    await page.mouse.move(finalPoint.x, finalPoint.y);
    await expect(tooltipWrapper).toBeVisible({ timeout: 5000 });
    await page.mouse.click(
      headingBox.x + headingBox.width / 2,
      headingBox.y + headingBox.height / 2,
    );

    await expect(
      tooltipWrapper,
      "Tooltip外の実座標をクリックするとデスクトップTooltipがdismissされるべき",
    ).not.toBeVisible({ timeout: 5000 });
  });
});
