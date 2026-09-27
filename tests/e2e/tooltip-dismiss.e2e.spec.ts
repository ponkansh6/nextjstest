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
          const hitsBar = await page.evaluate(
            ({ x, y }) =>
              document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
            point,
          );
          if (hitsBar) return point;
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

test.describe("デスクトップ ツールチップのホバー回帰テスト", () => {
  // このdescribeは、実mouse/pointermoveを持つDesktop Chromeのchromium projectだけを対象にする。
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "デスクトップのホバー挙動は chromium プロジェクトでのみ検証する",
    );
  });
});
