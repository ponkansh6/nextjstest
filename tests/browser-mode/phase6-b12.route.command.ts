import type { Locator, Page } from "@playwright/test";
import { devices } from "@playwright/test";
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B12Id =
  | "p45-b-tooltip-dismiss-307-viewport-chartnote-tooltip-tooltip-chartnote-tooltip"
  | "p45-b-tooltip-dismiss-430-tooltip-chartnote-tooltip";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Pixel7Evidence = {
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  deviceScaleFactor: number;
  touchPoints: number;
  userAgent: string;
};

async function stage<T>(
  id: Phase6B12Id,
  name: string,
  timeoutMs: number,
  action: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  console.info(`[phase6-b12-stage] ${id} ${name} started (timeout ${timeoutMs}ms)`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action().then((result) => {
        console.info(`[phase6-b12-stage] ${id} ${name} completed in ${Date.now() - started}ms`);
        return result;
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `[phase6-b12-stage] ${id} ${name} failed after ${Date.now() - started}ms (${detail})`,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function findViewportBar(page: Page, chart: Locator, scrollIntoView = true): Promise<Point> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Playwright viewport is unavailable");
  let lastError: unknown;
  for (let retry = 0; retry < 4; retry += 1) {
    try {
      const bars = chart.locator(".recharts-bar-rectangle");
      if (scrollIntoView) await bars.first().scrollIntoViewIfNeeded({ timeout: 5_000 });
      for (let index = 0; index < (await bars.count()); index += 1) {
        // Refresh the locator each time because Recharts may replace the SVG subtree.
        const bar = chart.locator(".recharts-bar-rectangle").nth(index);
        const box = await bar.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) continue;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (point.x < 0 || point.x > viewport.width || point.y < 0 || point.y > viewport.height)
          continue;
        const hitsBar = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
          point,
        );
        if (hitsBar) return point;
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new Error(
    `No actionable bar tap point is inside the viewport (${viewport.width}x${viewport.height}) after 4 retries`,
  );
}

function intersectionPoint(a: Rect, b: Rect): Point | null {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return left < right && top < bottom ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
}

function pointOutsideBox(link: Rect, covered: Rect): Point | null {
  const insetX = Math.min(2, link.width / 4);
  const insetY = Math.min(2, link.height / 4);
  const candidates: Point[] = [
    { x: link.x + link.width / 2, y: link.y + link.height / 2 },
    { x: link.x + insetX, y: link.y + insetY },
    { x: link.x + link.width - insetX, y: link.y + insetY },
    { x: link.x + insetX, y: link.y + link.height - insetY },
    { x: link.x + link.width - insetX, y: link.y + link.height - insetY },
  ];
  const isInside = (box: Rect, point: Point) =>
    point.x > box.x &&
    point.x < box.x + box.width &&
    point.y > box.y &&
    point.y < box.y + box.height;
  return candidates.find((point) => isInside(link, point) && !isInside(covered, point)) ?? null;
}

async function getRect(locator: Locator): Promise<Rect | null> {
  if ((await locator.count()) === 0) return null;
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function prepare(
  page: Page,
  id: Phase6B12Id,
  setFixedViewportBeforeNavigation: boolean,
): Promise<Pixel7Evidence> {
  if (setFixedViewportBeforeNavigation) {
    await stage(id, "set 412x915 viewport before production navigation", 5_000, () =>
      page.setViewportSize({ width: 412, height: 915 }),
    );
  }
  await stage(id, "install shared fixture mount behavior", 5_000, () =>
    page.addInitScript(() => {
      (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
    }),
  );
  await stage(id, "navigate to production route", 30_000, async () => {
    await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, { timeout: 30_000 });
  });
  await stage(id, "wait for network idle", 20_000, () =>
    page.waitForLoadState("networkidle", { timeout: 15_000 }),
  );
  return stage(id, "record effective Pixel 7 touch context", 5_000, () =>
    page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      screen: { width: screen.width, height: screen.height },
      deviceScaleFactor: devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
    })),
  );
}

export const inspectPhase6B12: BrowserCommand<[id: Phase6B12Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  const overlapCase = id.startsWith("p45-b-tooltip-dismiss-307-");
  // #307 corresponds to nested test.use(viewport); #430 changes page viewport before goto.
  const isolated = await browser.newContext({
    ...devices["Pixel 7"],
    ...(overlapCase ? { viewport: { width: 412, height: 915 } } : {}),
  });
  const page = await isolated.newPage();
  try {
    const contextEvidence = await prepare(page, id, !overlapCase);
    const chart = page.getByTestId("spending-chart-real");
    const tooltip = page.locator("[data-custom-tooltip]");
    const chartNoteLink = overlapCase
      ? chart.locator('a[data-chart-note-link][href="#section-consumption-nominal"]')
      : chart.locator('a[href="#section-consumption-nominal"]');

    await stage(id, "scroll real-consumption chart into view", 15_000, () =>
      chart.scrollIntoViewIfNeeded(),
    );
    if (overlapCase) {
      await stage(id, "wait for chart to intersect the viewport", 7_000, () =>
        page.waitForFunction(
          () => {
            const element = document.querySelector('[data-testid="spending-chart-real"]');
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            return (
              rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight
            );
          },
          undefined,
          { timeout: 5_000 },
        ),
      );
      await stage(id, "wait for actual chartNote link attachment", 7_000, () =>
        chartNoteLink.waitFor({ state: "attached", timeout: 5_000 }),
      );

      const tapVisibleBarUntilTooltip = async (): Promise<void> => {
        let lastCause: unknown;
        for (let attempt = 1; attempt <= 8; attempt += 1) {
          console.info(`[phase6-b12-stage] ${id} real bar touch attempt ${attempt}/8`);
          try {
            const point = await findViewportBar(page, chart, false);
            await page.touchscreen.tap(point.x, point.y);
            await tooltip.waitFor({ state: "visible", timeout: 1_500 });
            return;
          } catch (cause) {
            lastCause = cause;
          }
        }
        const scrollY = await page.evaluate(() => window.scrollY);
        const tooltipBox = await getRect(tooltip);
        const linkBox = await getRect(chartNoteLink);
        const bars = await chart.locator(".recharts-bar-rectangle").evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
        );
        throw new Error(
          `Tooltip did not open after 8 hit-tested bar touches (scrollY=${scrollY}, tooltip=${JSON.stringify(tooltipBox)}, link=${JSON.stringify(linkBox)}, bars=${JSON.stringify(bars)}, lastCause=${String(lastCause)})`,
        );
      };
      await stage(
        id,
        "retry hit-tested real bar touch until tooltip visible (max 8)",
        20_000,
        tapVisibleBarUntilTooltip,
      );

      const tooltipBox = await stage(id, "read live tooltip rectangle", 5_000, () =>
        getRect(tooltip),
      );
      const linkBox = await stage(id, "read live chartNote rectangle", 5_000, () =>
        getRect(chartNoteLink),
      );
      if (!tooltipBox || !linkBox) {
        throw new Error(
          `Initial overlap rectangles missing (tooltip=${JSON.stringify(tooltipBox)}, link=${JSON.stringify(linkBox)})`,
        );
      }
      const originalStyle = await stage(id, "save actual chartNote inline style", 5_000, () =>
        chartNoteLink.getAttribute("style"),
      );
      let intersection: Point | null = null;
      let movedLinkBox: Rect | null = null;
      let elementFromPointHitTooltip = false;
      let hashAfterTouch = "";
      let hashBeforeTouch = "";
      let urlBeforeTouch = "";
      let urlAfterTouch = "";
      let tooltipVisibleAfterTouch = false;
      let touchPerformed = false;
      try {
        // Deliberately engineer the overlap by positioning the actual link over the live tooltip.
        await stage(
          id,
          "position actual link at tooltip with positive size and z-index 0",
          5_000,
          () =>
            chartNoteLink.evaluate((element, rect) => {
              const link = element as HTMLElement;
              link.style.position = "fixed";
              link.style.left = `${rect.x}px`;
              link.style.top = `${rect.y}px`;
              link.style.width = `${Math.max(rect.width, 1)}px`;
              link.style.height = `${Math.max(rect.height, 1)}px`;
              link.style.zIndex = "0";
            }, tooltipBox),
        );
        movedLinkBox = await stage(id, "read repositioned actual link rectangle", 5_000, () =>
          getRect(chartNoteLink),
        );
        if (!movedLinkBox)
          throw new Error("Repositioned actual chartNote rectangle is unavailable");
        intersection = intersectionPoint(tooltipBox, movedLinkBox);
        if (!intersection)
          throw new Error(
            `Could not create tooltip/link intersection (tooltip=${JSON.stringify(tooltipBox)}, link=${JSON.stringify(movedLinkBox)})`,
          );
        elementFromPointHitTooltip = await stage(
          id,
          "hit-test overlap coordinate against actual tooltip",
          5_000,
          () =>
            page.evaluate(
              ({ x, y }) =>
                document.elementFromPoint(x, y)?.closest("[data-custom-tooltip]") != null,
              intersection!,
            ),
        );
        if (elementFromPointHitTooltip) {
          urlBeforeTouch = page.url();
          hashBeforeTouch = new URL(urlBeforeTouch).hash;
          await stage(id, "real touchscreen tap at deliberately engineered overlap", 10_000, () =>
            page.touchscreen.tap(intersection!.x, intersection!.y),
          );
          touchPerformed = true;
          await stage(id, "wait for tooltip visible after overlap tap", 7_000, () =>
            tooltip.waitFor({ state: "visible", timeout: 5_000 }),
          );
        }
        tooltipVisibleAfterTouch = await stage(
          id,
          "read tooltip visibility after overlap action",
          5_000,
          () => tooltip.isVisible(),
        );
        urlAfterTouch = page.url();
        hashAfterTouch = new URL(page.url()).hash;
      } finally {
        await stage(id, "restore original actual chartNote inline style", 5_000, () =>
          chartNoteLink.evaluate((element, style) => {
            if (style == null) element.removeAttribute("style");
            else element.setAttribute("style", style);
          }, originalStyle),
        );
      }
      if (!movedLinkBox)
        throw new Error(
          "Repositioned actual chartNote rectangle is unavailable after style restoration",
        );
      return {
        id,
        contextEvidence,
        chartInViewport: true,
        linkAttached: true,
        tooltipBox,
        linkBox,
        movedLinkBox,
        intersection,
        elementFromPointHitTooltip,
        touchPerformed,
        urlBeforeTouch,
        urlAfterTouch,
        hashBeforeTouch,
        hashAfterTouch,
        tooltipVisibleAfterTouch,
      };
    }

    const point = await stage(
      id,
      "find hit-tested real bar point without extra scroll (up to 4 retries)",
      45_000,
      () => findViewportBar(page, chart, false),
    );
    await stage(id, "real touchscreen tap on actual bar", 10_000, () =>
      page.touchscreen.tap(point.x, point.y),
    );
    await stage(id, "wait for tooltip visible after bar tap", 7_000, () =>
      tooltip.waitFor({ state: "visible", timeout: 5_000 }),
    );
    await stage(id, "wait for actual chartNote link visible", 7_000, () =>
      chartNoteLink.waitFor({ state: "visible", timeout: 5_000 }),
    );
    const tooltipVisibleAfterTap = await stage(
      id,
      "read tooltip visibility after bar tap",
      5_000,
      () => tooltip.isVisible(),
    );
    const linkVisibleAfterTap = await stage(id, "read link visibility after bar tap", 5_000, () =>
      chartNoteLink.isVisible(),
    );
    const tooltipBox = await stage(id, "read tooltip bounding box", 5_000, () =>
      tooltip.boundingBox(),
    );
    const linkBox = await stage(id, "read link bounding box", 5_000, () =>
      chartNoteLink.boundingBox(),
    );
    if (!tooltipBox || !linkBox) {
      return {
        id,
        contextEvidence,
        tooltipVisibleAfterBarTap: tooltipVisibleAfterTap,
        linkVisibleAfterTap,
        tooltipBox,
        linkBox,
        outsidePoint: null,
        pointHitByLink: false,
        pointOutsideTooltip: false,
        touchPerformed: false,
        hashAfterTap: new URL(page.url()).hash,
        tooltipVisibleAfterNavigation: tooltipVisibleAfterTap,
      };
    }
    const outsidePoint = pointOutsideBox(linkBox, tooltipBox);
    if (!outsidePoint) {
      return {
        id,
        contextEvidence,
        tooltipVisibleAfterBarTap: tooltipVisibleAfterTap,
        linkVisibleAfterTap,
        tooltipBox,
        linkBox,
        outsidePoint: null,
        pointHitByLink: false,
        pointOutsideTooltip: false,
        touchPerformed: false,
        hashAfterTap: new URL(page.url()).hash,
        tooltipVisibleAfterNavigation: tooltipVisibleAfterTap,
      };
    }
    const pointHitByLink = await stage(
      id,
      "hit-test outside point against actual link href",
      5_000,
      async () => {
        const href = await chartNoteLink.getAttribute("href");
        return page.evaluate(
          ({ x, y, expectedHref }) => {
            const target = document.elementFromPoint(x, y);
            return (
              expectedHref != null && target?.closest("a")?.getAttribute("href") === expectedHref
            );
          },
          { ...outsidePoint, expectedHref: href },
        );
      },
    );
    const pointOutsideTooltip = await stage(
      id,
      "hit-test outside point against tooltip",
      5_000,
      () =>
        page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-custom-tooltip]") == null,
          outsidePoint,
        ),
    );
    if (!pointHitByLink || !pointOutsideTooltip) {
      return {
        id,
        contextEvidence,
        tooltipVisibleAfterBarTap: tooltipVisibleAfterTap,
        linkVisibleAfterTap,
        tooltipBox,
        linkBox,
        outsidePoint,
        pointHitByLink,
        pointOutsideTooltip,
        touchPerformed: false,
        hashAfterTap: new URL(page.url()).hash,
        tooltipVisibleAfterNavigation: tooltipVisibleAfterTap,
      };
    }
    await stage(id, "real touchscreen tap on actual link outside tooltip", 10_000, () =>
      page.touchscreen.tap(outsidePoint.x, outsidePoint.y),
    );
    const touchPerformed = true;
    await stage(id, "wait for nominal section hash navigation", 7_000, () =>
      page.waitForURL(/#section-consumption-nominal$/, { timeout: 5_000 }),
    );
    const hashAfterTap = new URL(page.url()).hash;
    await stage(id, "wait for tooltip hidden after link navigation", 7_000, () =>
      tooltip.waitFor({ state: "hidden", timeout: 5_000 }),
    );
    const tooltipVisibleAfterNavigation = await stage(
      id,
      "read tooltip visibility after link navigation",
      5_000,
      () => tooltip.isVisible(),
    );
    return {
      id,
      contextEvidence,
      tooltipVisibleAfterBarTap: tooltipVisibleAfterTap,
      linkVisibleAfterTap,
      tooltipBox,
      linkBox,
      outsidePoint,
      pointHitByLink,
      pointOutsideTooltip,
      touchPerformed,
      hashAfterTap,
      tooltipVisibleAfterNavigation,
    };
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B12: (id: Phase6B12Id) => Promise<unknown>;
  }
}
