import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import {
  extractArrayProp,
  extractFlightFromHtml,
  filter2005to2016,
  REAL_PROP,
} from "../utils/flight-payload";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export const PHASE5_INTERACTION_IDS = {
  "real-flight":
    "p45-b-real-consumption-21-page-tsx-e2e-real-consumption-chart-with-actual-browser",
  "real-hydration":
    "p45-b-real-consumption-60-page-tsx-e2e-real-consumption-chart-with-actual-browser",
  "real-components":
    "p45-b-real-consumption-82-page-tsx-e2e-real-consumption-chart-with-actual-browser",
  "real-legend-toggle":
    "p45-b-real-consumption-99-page-tsx-e2e-real-consumption-chart-with-actual-browser",
  "real-accordion-closed":
    "p45-b-real-consumption-128-page-tsx-e2e-real-consumption-chart-with-actual-browser",
  "real-accordion-open":
    "p45-b-real-consumption-156-page-tsx-e2e-real-consumption-chart-with-actual-browser",
  "real-accordion-style":
    "p45-b-real-consumption-174-page-tsx-e2e-real-consumption-chart-with-actual-browser",
  "touch-open-close": "p45-b-tooltip-dismiss-138-case01",
  "touch-escape": "p45-b-tooltip-dismiss-159-mobile-pixel-tooltip-escape-tooltip",
  "touch-outside": "p45-b-tooltip-dismiss-188-case01",
  "touch-switch-chart": "p45-b-tooltip-dismiss-207-1",
  "touch-swipe-negative": "p45-b-tooltip-dismiss-249-case01",
  "touch-retap": "p45-b-tooltip-dismiss-284-case01",
  "touch-overlap": "p45-b-tooltip-dismiss-307-viewport-chartnote-tooltip-tooltip-chartnote-tooltip",
  "touch-chart-note-navigation": "p45-b-tooltip-dismiss-430-tooltip-chartnote-tooltip",
  "touch-area-outside": "p45-b-tooltip-dismiss-473-case01",
  "touch-area-close": "p45-b-tooltip-dismiss-508-case01",
  "touch-during-tab-scroll": "p45-b-tooltip-dismiss-535-case01",
} as const;

export type Phase5InteractionScenario = keyof typeof PHASE5_INTERACTION_IDS;
export interface Phase5InteractionObservation {
  id: string;
  scenario: Phase5InteractionScenario;
  url: string;
  responseStatus: number | null;
  provider: string;
  browserContext: Record<string, unknown>;
  selectors: string[];
  actions: Array<{ action: string; result: Record<string, unknown> }>;
  pageErrors: string[];
  probeError?: string;
  contractMatch: boolean | null;
  interpretation: "observed" | "product-or-contract-mismatch" | "probe-error-unclassified";
}

const mobileScenarios = new Set<Phase5InteractionScenario>([
  "touch-open-close",
  "touch-escape",
  "touch-outside",
  "touch-switch-chart",
  "touch-swipe-negative",
  "touch-retap",
  "touch-overlap",
  "touch-chart-note-navigation",
  "touch-area-outside",
  "touch-area-close",
  "touch-during-tab-scroll",
]);
const pixel7 = {
  deviceScaleFactor: 2.625,
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};
const NOMINAL = "spending-chart-nominal";
const REAL = "spending-chart-real";

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

async function findBar(
  page: import("@playwright/test").Page,
  testId: string,
  ratio = 0.5,
): Promise<Point> {
  const chart = page.getByTestId(testId);
  await chart.scrollIntoViewIfNeeded();
  await chart
    .locator(".recharts-bar-rectangle")
    .first()
    .waitFor({ state: "attached", timeout: 4_000 });
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("No viewport available");
  const bars = chart.locator(".recharts-bar-rectangle");
  for (let i = 0; i < (await bars.count()); i += 1) {
    const box = await bars.nth(i).boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const point = { x: box.x + box.width * ratio, y: box.y + box.height / 2 };
    if (
      point.x >= 0 &&
      point.x <= viewport.width &&
      point.y >= 0 &&
      point.y <= viewport.height &&
      (await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
        point,
      ))
    )
      return point;
  }
  throw new Error(`No visible actionable bar in ${testId} at ${viewport.width}x${viewport.height}`);
}

async function activateSectionTab(
  page: import("@playwright/test").Page,
  label: string,
  targetSelector: string,
  actions: Phase5InteractionObservation["actions"],
  mobile: boolean,
): Promise<void> {
  const tab = page.getByRole("button", { name: label, exact: true });
  if (mobile) await tab.tap();
  else await tab.click();
  const target = page.locator(targetSelector);
  await target.waitFor({ state: "visible", timeout: 5_000 });
  actions.push({
    action: `${mobile ? "touch" : "click"} section tab ${label}; wait for lazy-mounted ${targetSelector}`,
    result: {
      tabLabel: label,
      tabSelector: `button.sectionTab[name="${label}"]`,
      targetSelector,
      targetVisible: await target.isVisible().catch(() => false),
    },
  });
}

async function touchBar(
  page: import("@playwright/test").Page,
  actions: Phase5InteractionObservation["actions"],
  testId = NOMINAL,
) {
  const point = await findBar(page, testId);
  const hitTestBeforeTouch = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return {
      hitSelector: hit?.closest(".recharts-bar-rectangle")?.getAttribute("class") ?? null,
      insideChartWrapper: hit?.closest(".recharts-wrapper") != null,
    };
  }, point);
  const eventOffset = await page.evaluate(
    () =>
      (window as typeof window & { __phase5InputEvents?: unknown[] }).__phase5InputEvents?.length ??
      0,
  );
  await page.touchscreen.tap(point.x, point.y);
  const tooltip = page.locator("[data-custom-tooltip]");
  const tooltipVisible =
    (await tooltip.isVisible().catch(() => false)) ||
    (await tooltip
      .waitFor({ state: "visible", timeout: 1_500 })
      .then(() => true)
      .catch(() => false));
  const cursorCount = await page.locator(".recharts-tooltip-cursor").count();
  const inputEvents = await page.evaluate(
    (offset) =>
      (
        window as typeof window & { __phase5InputEvents?: Array<Record<string, unknown>> }
      ).__phase5InputEvents?.slice(offset) ?? [],
    eventOffset,
  );
  actions.push({
    action: `touchscreen.tap(${testId} live bar @ ${point.x.toFixed(1)},${point.y.toFixed(1)})`,
    result: {
      point,
      hitTestBeforeTouch,
      trustedInputEvents: inputEvents,
      tooltipVisible,
      closeButtonVisible: await page
        .getByRole("button", { name: "閉じる" })
        .isVisible()
        .catch(() => false),
      guideLineCount: cursorCount,
    },
  });
  return { point, tooltip };
}

export const inspectPhase5Interaction: BrowserCommand<
  [scenario: Phase5InteractionScenario],
  Phase5InteractionObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright")
    throw new Error(`Expected Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser unavailable");
  const mobile = mobileScenarios.has(scenario);
  const isolated = await browser.newContext(
    mobile
      ? {
          viewport: { width: 412, height: 915 },
          screen: { width: 412, height: 915 },
          deviceScaleFactor: pixel7.deviceScaleFactor,
          isMobile: true,
          hasTouch: true,
          userAgent: pixel7.userAgent,
        }
      : { viewport: { width: 1280, height: 720 } },
  );
  const page = await isolated.newPage();
  const observation: Phase5InteractionObservation = {
    id: PHASE5_INTERACTION_IDS[scenario],
    scenario,
    url: "",
    responseStatus: null,
    provider: provider.name,
    browserContext: {},
    selectors: [],
    actions: [],
    pageErrors: [],
    contractMatch: null,
    interpretation: "observed",
  };
  page.on("pageerror", (error) => observation.pageErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") observation.pageErrors.push(`console: ${message.text()}`);
  });
  try {
    observation.browserContext = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      screen: { width: screen.width, height: screen.height },
      devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
      isMobile: matchMedia("(pointer: coarse)").matches,
    }));
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(10_000);
    if (scenario === "touch-overlap" || scenario === "touch-chart-note-navigation") {
      // Source specs configure this viewport before page.goto().
      await page.setViewportSize({ width: 412, height: 915 });
    }
    await page.addInitScript(() => {
      (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
    });
    await page.addInitScript(() => {
      (
        window as typeof window & { __phase5InputEvents?: Array<Record<string, unknown>> }
      ).__phase5InputEvents = [];
      const capture = (event: Event) => {
        const target = event.target instanceof Element ? event.target : null;
        const chart = target?.closest(
          "[data-testid^='spending-chart-'], #section-stacked .recharts-wrapper",
        );
        if (!chart) return;
        const pointer = event as PointerEvent;
        (
          window as typeof window & { __phase5InputEvents?: Array<Record<string, unknown>> }
        ).__phase5InputEvents?.push({
          type: event.type,
          isTrusted: event.isTrusted,
          targetTag: target?.tagName ?? null,
          targetClass: typeof target?.className === "string" ? target.className : null,
          chartTestId: chart.getAttribute("data-testid"),
          chartSelector: chart.id ? `#${chart.id}` : null,
          pointerType: typeof pointer.pointerType === "string" ? pointer.pointerType : null,
        });
      };
      for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "click"]) {
        document.addEventListener(type, capture, true);
      }
    });
    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
      waitUntil: "domcontentloaded",
      timeout: 10_000,
    });
    observation.responseStatus = response?.status() ?? null;
    observation.url = page.url();
    await page
      .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
      .waitFor({ state: "visible", timeout: 5_000 });
    const networkIdleState = await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .then(() => "networkidle")
      .catch(() => "networkidle-timeout");
    const appReady = await page.evaluate(() => ({
      readyState: document.readyState,
      nextRootPresent: document.querySelector("#__next") != null,
      realChartPresent:
        document.querySelector('[data-testid="spending-chart-real"] .recharts-wrapper') != null,
      nominalChartPresent:
        document.querySelector('[data-testid="spending-chart-nominal"] .recharts-wrapper') != null,
    }));
    observation.actions.push({
      action: "bounded source-matched hydration/network-idle readiness",
      result: { networkIdleState, ...appReady },
    });

    // The real-chart structural scenarios require the app's section-tab mount.
    // Source-faithful chartNote cases (#307/#430) are touch-* scenarios and must
    // use their original direct chart.scrollIntoViewIfNeeded() flow below.
    const sourceDirectChartNoteFlow =
      scenario === "touch-overlap" || scenario === "touch-chart-note-navigation";
    if (scenario.startsWith("real-") && !sourceDirectChartNoteFlow) {
      const section = page.locator("#section-consumption-real");
      observation.selectors.push("#section-consumption-real", "[data-testid=spending-chart-real]");
      await activateSectionTab(
        page,
        "消費(実質)",
        "#section-consumption-real",
        observation.actions,
        false,
      );
      if (scenario === "real-flight") {
        const html = await page.content();
        const flight = extractFlightFromHtml(html);
        const propertyFound = flight.includes(`"${REAL_PROP}":[`);
        const rows = filter2005to2016(extractArrayProp(flight, REAL_PROP));
        const supportKey = "民間最終消費支出（実質）";
        const first = rows[0];
        const last = rows.at(-1);
        observation.actions.push({
          action:
            "extract quarterlyRealData from built HTML Flight chunks; inspect 2005–2016 endpoints",
          result: {
            htmlLength: html.length,
            flightPayloadLength: flight.length,
            propertyFound,
            filteredQuarterRows: rows.length,
            firstYearQuarter: first ? `${first["年"]}Q${first.quarter}` : null,
            lastYearQuarter: last ? `${last["年"]}Q${last.quarter}` : null,
            supportSeriesNamePresent: rows.some((row) => supportKey in row),
            supportFieldPresentOnBothEndpoints:
              first != null && last != null && supportKey in first && supportKey in last,
            endpointSupportValues: [first?.[supportKey] ?? null, last?.[supportKey] ?? null],
          },
        });
      } else if (scenario === "real-hydration") {
        await page.waitForTimeout(1_000);
        observation.actions.push({
          action: "observe same-load page errors after hydration settles",
          result: {
            errors: [...observation.pageErrors],
            errorCount: observation.pageErrors.length,
            nextDataPresent: (await page.locator("script#__NEXT_DATA__").count()) > 0,
            chartSectionPresent: (await section.count()) > 0,
          },
        });
      } else {
        await section.scrollIntoViewIfNeeded();
        await section.waitFor({ state: "visible", timeout: 5_000 });
        if (scenario === "real-components") {
          observation.actions.push({
            action: "observe production real-consumption section and rendered Recharts landmarks",
            result: {
              sectionVisible: await section.isVisible(),
              sectionId: await section.getAttribute("id"),
              chartTestIdCount: await page.getByTestId(REAL).count(),
              wrapperCount: await section.locator(".recharts-wrapper").count(),
              svgCount: await section.locator("svg.recharts-surface").count(),
              summaryCount: await section.locator("summary").count(),
            },
          });
        } else {
          const summary = section.locator("summary").first();
          const details = section.locator("details").first();
          const legend = section.locator("[aria-pressed]");
          observation.selectors.push(
            "#section-consumption-real summary",
            "#section-consumption-real [aria-pressed]",
          );
          if (scenario === "real-accordion-closed") {
            observation.actions.push({
              action: "observe initial details state and expenditure legend visibility",
              result: {
                detailsCount: await details.count(),
                open: await details
                  .evaluate((el) => (el as HTMLDetailsElement).open)
                  .catch(() => null),
                summaryVisible: await summary.isVisible().catch(() => false),
                legendButtonCount: await legend.count(),
                legendVisibility: await Promise.all(
                  Array.from({ length: await legend.count() }, (_, index) =>
                    legend.nth(index).isVisible(),
                  ),
                ),
              },
            });
          } else if (scenario === "real-accordion-open") {
            await summary.click();
            observation.actions.push({
              action: "click real-consumption legend summary",
              result: {
                detailsOpen: await details
                  .evaluate((el) => (el as HTMLDetailsElement).open)
                  .catch(() => false),
                legendButtonCount: await legend.count(),
                visibleLegendButtonCount: await legend.evaluateAll(
                  (els) => els.filter((el) => !!(el as HTMLElement).offsetWidth).length,
                ),
                buttonLabels: await legend.evaluateAll((els) =>
                  els.map((el) => el.textContent?.trim() ?? ""),
                ),
              },
            });
          } else if (scenario === "real-accordion-style") {
            const style = await summary
              .evaluate((el) => ({
                className: el.className,
                color: getComputedStyle(el).color,
                backgroundColor: getComputedStyle(el).backgroundColor,
                borderRadius: getComputedStyle(el).borderRadius,
                padding: getComputedStyle(el).padding,
                fontWeight: getComputedStyle(el).fontWeight,
                svgCount: el.querySelectorAll("svg").length,
                svgMarkup: el.querySelector("svg")?.outerHTML ?? null,
              }))
              .catch(() => null);
            observation.actions.push({
              action: "inspect source summary selector computed style and arrow SVG",
              result: { summaryVisible: await summary.isVisible().catch(() => false), style },
            });
          } else if (scenario === "real-legend-toggle") {
            if (
              (await details.count()) &&
              !(await details.evaluate((el) => (el as HTMLDetailsElement).open))
            )
              await summary.click();
            const button = section.locator("[aria-pressed]").first();
            const before = await button.getAttribute("aria-pressed").catch(() => null);
            const svgBefore = await section
              .locator("svg.recharts-surface")
              .evaluate((svg) => svg.innerHTML)
              .catch(() => "");
            await button.click();
            observation.actions.push({
              action: "click first real-consumption aria-pressed legend button",
              result: {
                label: (await button.textContent().catch(() => ""))?.trim(),
                pressedBefore: before,
                pressedAfter: await button.getAttribute("aria-pressed").catch(() => null),
                svgInnerHtmlChanged:
                  svgBefore !==
                  (await section
                    .locator("svg.recharts-surface")
                    .evaluate((svg) => svg.innerHTML)
                    .catch(() => "")),
                seriesCountAfter: await section
                  .locator(".recharts-bar-rectangle, .recharts-line, .recharts-area")
                  .count(),
              },
            });
          }
        }
      }
    } else {
      const tooltip = page.locator("[data-custom-tooltip]");
      observation.selectors.push(
        "[data-custom-tooltip]",
        ".recharts-tooltip-cursor",
        'button[aria-label="閉じる"]',
      );
      const tap = async (testId = NOMINAL) => touchBar(page, observation.actions, testId);
      if (scenario === "touch-switch-chart") {
        await page.getByTestId(REAL).scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }
      if (
        scenario === "touch-open-close" ||
        scenario === "touch-escape" ||
        scenario === "touch-outside" ||
        scenario === "touch-retap"
      ) {
        const { point } = await tap();
        const close = page.getByRole("button", { name: "閉じる" });
        if (scenario === "touch-open-close") {
          await close.tap();
          observation.actions.push({
            action: "touch close button",
            result: {
              tooltipVisible: await tooltip.isVisible().catch(() => false),
              closeButtonVisible: await close.isVisible().catch(() => false),
              guideLineCount: await page.locator(".recharts-tooltip-cursor").count(),
            },
          });
        } else if (scenario === "touch-escape") {
          await page.evaluate(() => {
            (window as typeof window & { __phase5EscapeEvents?: unknown[] }).__phase5EscapeEvents =
              [];
            window.addEventListener(
              "keydown",
              (event) => {
                if (event.key === "Escape")
                  (
                    window as typeof window & { __phase5EscapeEvents?: unknown[] }
                  ).__phase5EscapeEvents?.push({
                    key: event.key,
                    code: event.code,
                    isTrusted: event.isTrusted,
                    type: event.type,
                  });
              },
              { once: true },
            );
          });
          await page.keyboard.press("Escape");
          observation.actions.push({
            action:
              "Playwright keyboard.press(Escape): native keydown/keyup input on the touch-enabled Pixel 7 context",
            result: {
              escapeKeydownEvents: await page.evaluate(
                () =>
                  (window as typeof window & { __phase5EscapeEvents?: unknown[] })
                    .__phase5EscapeEvents ?? [],
              ),
              tooltipVisible: await tooltip.isVisible().catch(() => false),
              closeButtonVisible: await close.isVisible().catch(() => false),
            },
          });
          const escapedClosed =
            !(await tooltip.isVisible().catch(() => false)) &&
            !(await close.isVisible().catch(() => false));
          if (escapedClosed) {
            await page.touchscreen.tap(point.x, point.y);
            observation.actions.push({
              action: "retouch the same nominal bar coordinate after Escape",
              result: {
                point,
                tooltipVisibleAfterRetap: await tooltip.isVisible().catch(() => false),
                closeButtonVisibleAfterRetap: await close.isVisible().catch(() => false),
                guideLineCountAfterRetap: await page.locator(".recharts-tooltip-cursor").count(),
              },
            });
          }
        } else if (scenario === "touch-outside") {
          const heading = page.getByRole("heading", { name: /消費支出（名目）/ }).first();
          await heading.tap();
          observation.actions.push({
            action: "touch chart heading outside recharts-wrapper",
            result: {
              selector: "heading /消費支出（名目）/",
              tooltipVisible: await tooltip.isVisible().catch(() => false),
              closeButtonVisible: await close.isVisible().catch(() => false),
              guideLineCount: await page.locator(".recharts-tooltip-cursor").count(),
            },
          });
        } else {
          await close.tap();
          const afterClose = await close.isVisible().catch(() => false);
          const repeat = await findBar(page, NOMINAL);
          await page.touchscreen.tap(repeat.x, repeat.y);
          observation.actions.push({
            action: "touch close then retap same live nominal bar",
            result: {
              point,
              repeat,
              closedBeforeRetap: !afterClose,
              tooltipVisibleAfterRetap: await tooltip.isVisible().catch(() => false),
              closeButtonVisibleAfterRetap: await close.isVisible().catch(() => false),
            },
          });
        }
      } else if (scenario === "touch-switch-chart") {
        await tap(NOMINAL);
        const firstCursors = await page.locator(".recharts-tooltip-cursor").count();
        await tap(REAL);
        observation.actions.push({
          action: "touch nominal then real chart bars",
          result: {
            cursorCountAfterNominal: firstCursors,
            cursorCountAfterReal: await page.locator(".recharts-tooltip-cursor").count(),
            tooltipVisible: await tooltip.isVisible().catch(() => false),
          },
        });
      } else if (scenario === "touch-swipe-negative") {
        const wrapper = page.getByTestId(NOMINAL).locator(".recharts-wrapper");
        await wrapper.scrollIntoViewIfNeeded();
        const box = await wrapper.boundingBox();
        if (!box)
          throw new Error("Nominal chart wrapper has no bounding box for actual touch swipe");
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const gestureOriginHit = await page.evaluate(
          ({ x: px, y: py }) => {
            const hit = document.elementFromPoint(px, py);
            return {
              tagName: hit?.tagName ?? null,
              className: typeof hit?.className === "string" ? hit.className : null,
              insideNominalWrapper: hit?.closest(".recharts-wrapper") != null,
            };
          },
          { x, y },
        );
        const client = await page.context().newCDPSession(page);
        const duringGesture: Array<{
          move: number;
          tooltipVisible: boolean;
          closeButtonVisible: boolean;
        }> = [];
        await client.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let i = 1; i <= 5; i += 1) {
          await client.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y + i * 15 }],
          });
          duringGesture.push({
            move: i,
            tooltipVisible: await tooltip.isVisible().catch(() => false),
            closeButtonVisible: await page
              .getByRole("button", { name: "閉じる" })
              .isVisible()
              .catch(() => false),
          });
        }
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        observation.actions.push({
          action: "CDP real touchStart + five touchMove events + touchEnd over nominal chart",
          result: {
            start: { x, y },
            gestureOriginHit,
            end: { x, y: y + 75 },
            duringGesture,
            tooltipVisibleAfterGesture: await tooltip.isVisible().catch(() => false),
            closeButtonVisibleAfterGesture: await page
              .getByRole("button", { name: "閉じる" })
              .isVisible()
              .catch(() => false),
          },
        });
        if (gestureOriginHit.insideNominalWrapper !== true)
          observation.probeError =
            "Touch swipe origin did not hit the nominal chart wrapper; source predicate is not classifiable from this attempt.";
      } else if (scenario === "touch-overlap" || scenario === "touch-chart-note-navigation") {
        const chart = page.getByTestId(REAL);
        await chart.scrollIntoViewIfNeeded();
        await chart.waitFor({ state: "visible", timeout: 5_000 });
        const chartViewportState = await chart.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            inViewport:
              rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        });
        if (!chartViewportState.inViewport)
          throw new Error(
            `Real consumption chart is not in the 412x915 viewport: ${JSON.stringify(chartViewportState)}`,
          );
        const link = chart.locator('a[data-chart-note-link][href="#section-consumption-nominal"]');
        await link.waitFor({ state: "attached", timeout: 5_000 });
        let point: Point | undefined;
        let tooltipShown = false;
        let lastTapError: string | null = null;
        const attempts = scenario === "touch-overlap" ? 8 : 1;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          try {
            // Re-read live SVG geometry before each trusted touch, matching the source
            // test's bounded retry while the tab's smooth scroll may still settle.
            point = await findBar(page, REAL);
            const hitTestBefore = await page.evaluate(
              ({ x, y }) => ({
                insideChartWrapper:
                  document.elementFromPoint(x, y)?.closest(".recharts-wrapper") != null,
                insideBar:
                  document.elementFromPoint(x, y)?.closest(".recharts-bar-rectangle") != null,
                hitSelector:
                  document
                    .elementFromPoint(x, y)
                    ?.closest(".recharts-bar-rectangle")
                    ?.getAttribute("class") ?? null,
              }),
              point,
            );
            if (!hitTestBefore.insideBar || !hitTestBefore.insideChartWrapper) {
              throw new Error("candidate point did not hit a live chart bar");
            }
            const eventOffset = await page.evaluate(
              () =>
                (window as typeof window & { __phase5InputEvents?: unknown[] }).__phase5InputEvents
                  ?.length ?? 0,
            );
            await page.touchscreen.tap(point.x, point.y);
            tooltipShown =
              (await tooltip.isVisible().catch(() => false)) ||
              (await tooltip
                .waitFor({ state: "visible", timeout: 1_500 })
                .then(() => true)
                .catch(() => false));
            const trustedInputEvents = await page.evaluate(
              (offset) =>
                (
                  window as typeof window & { __phase5InputEvents?: Array<Record<string, unknown>> }
                ).__phase5InputEvents?.slice(offset) ?? [],
              eventOffset,
            );
            observation.actions.push({
              action: `touchscreen.tap(${REAL} live bar); source retry ${attempt}/${attempts} and wait for live tooltip`,
              result: {
                point,
                hitTestBeforeTouch: hitTestBefore,
                trustedInputEvents,
                tooltipVisible: tooltipShown,
                chartViewportState,
              },
            });
            if (tooltipShown) break;
            lastTapError = "tooltip did not become visible within 1500ms";
          } catch (error) {
            lastTapError = error instanceof Error ? error.message : String(error);
          }
        }
        if (!tooltipShown || !point)
          throw new Error(
            `Source bar retry exhausted (${attempts} attempts): ${lastTapError ?? "tooltip not visible"}`,
          );
        const tooltipBox = await tooltip.boundingBox();
        const linkBox = await link.boundingBox();
        if (!tooltipBox || !linkBox)
          throw new Error(
            `Missing real tooltip/link geometry (tooltip=${JSON.stringify(tooltipBox)}, link=${JSON.stringify(linkBox)})`,
          );
        const href = await link.getAttribute("href");
        const beforeUrl = page.url();
        let target: Point | undefined;
        let overlapOriginalStyle: string | null = null;
        if (scenario === "touch-overlap") {
          overlapOriginalStyle = await link.getAttribute("style");
          await link.evaluate((el, rect) => {
            const node = el as HTMLElement;
            node.style.position = "fixed";
            node.style.left = `${rect.x}px`;
            node.style.top = `${rect.y}px`;
            node.style.width = `${Math.max(rect.width, 1)}px`;
            node.style.height = `${Math.max(rect.height, 1)}px`;
            node.style.zIndex = "0";
          }, tooltipBox);
          const moved = await link.boundingBox();
          const tip = await tooltip.boundingBox();
          if (moved && tip) {
            const left = Math.max(moved.x, tip.x);
            const right = Math.min(moved.x + moved.width, tip.x + tip.width);
            const top = Math.max(moved.y, tip.y);
            const bottom = Math.min(moved.y + moved.height, tip.y + tip.height);
            if (left < right && top < bottom)
              target = { x: (left + right) / 2, y: (top + bottom) / 2 };
          }
        } else {
          if (!(await link.isVisible()))
            throw new Error("Source chartNote link is not visible before its outside-tooltip tap");
          const candidates = [
            { x: linkBox.x + linkBox.width / 2, y: linkBox.y + linkBox.height / 2 },
            {
              x: linkBox.x + Math.min(2, linkBox.width / 4),
              y: linkBox.y + Math.min(2, linkBox.height / 4),
            },
            {
              x: linkBox.x + linkBox.width - Math.min(2, linkBox.width / 4),
              y: linkBox.y + Math.min(2, linkBox.height / 4),
            },
            {
              x: linkBox.x + Math.min(2, linkBox.width / 4),
              y: linkBox.y + linkBox.height - Math.min(2, linkBox.height / 4),
            },
            {
              x: linkBox.x + linkBox.width - Math.min(2, linkBox.width / 4),
              y: linkBox.y + linkBox.height - Math.min(2, linkBox.height / 4),
            },
          ];
          // Select the first point that the browser actually resolves to the real link
          // and that lies outside the tooltip, as required by the source predicate.
          for (const candidate of candidates) {
            if (candidate.x < 0 || candidate.y < 0 || candidate.x > 412 || candidate.y > 915)
              continue;
            const candidateHit = await page.evaluate(({ x, y }) => {
              const hit = document.elementFromPoint(x, y);
              return {
                link:
                  hit?.closest('a[data-chart-note-link][href="#section-consumption-nominal"]') !=
                  null,
                inTooltip: hit?.closest("[data-custom-tooltip]") != null,
              };
            }, candidate);
            if (candidateHit.link && !candidateHit.inTooltip) {
              target = candidate;
              break;
            }
          }
        }
        if (!target)
          throw new Error("Could not construct requested tooltip/link hit-test coordinate");
        const hit = await page.evaluate(
          ({ x, y }) => ({
            element: document.elementFromPoint(x, y)?.tagName ?? null,
            inTooltip: document.elementFromPoint(x, y)?.closest("[data-custom-tooltip]") != null,
            linkHref: document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href") ?? null,
          }),
          target,
        );
        await page.touchscreen.tap(target.x, target.y);
        await page.waitForTimeout(300);
        observation.actions.push({
          action:
            scenario === "touch-overlap"
              ? "touch real chartNote link moved behind open tooltip at overlapping viewport coordinate"
              : "touch actual visible chartNote link at viewport point outside open tooltip",
          result: {
            barPoint: point,
            tooltipBox,
            linkBox,
            target,
            expectedHref: href,
            hitTestBeforeTouch: hit,
            urlBefore: beforeUrl,
            urlAfter: page.url(),
            tooltipVisibleAfterTouch: await tooltip.isVisible().catch(() => false),
            tapAttempts: attempts,
            tooltipShownBeforeLinkTouch: tooltipShown,
            ...(scenario === "touch-overlap"
              ? {
                  overlapMethod:
                    "engineered overlap: temporarily position the actual link beneath the live tooltip at its viewport coordinates",
                  sourceLayoutDistinction:
                    "The touch hit-test is under a constructed overlap; it does not establish that the unmodified production layout naturally overlaps.",
                }
              : {}),
          },
        });
        if (scenario === "touch-overlap")
          await link.evaluate((el, style) => {
            if (style == null) el.removeAttribute("style");
            else el.setAttribute("style", style);
          }, overlapOriginalStyle);
      } else if (scenario === "touch-area-outside" || scenario === "touch-area-close") {
        const section = page.locator("#section-stacked");
        await section.scrollIntoViewIfNeeded();
        const wrapper = section.locator(".recharts-wrapper").first();
        const box = await wrapper.boundingBox();
        if (!box) throw new Error("Stacked area wrapper has no bounding box");
        const close = page.getByRole("button", { name: "閉じる" });
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const hitTestBeforeTouch = await page.evaluate(({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          return {
            tagName: hit?.tagName ?? null,
            className: typeof hit?.className === "string" ? hit.className : null,
            insideTargetWrapper: hit?.closest(".recharts-wrapper") != null,
          };
        }, point);
        await page.touchscreen.tap(point.x, point.y);
        const tooltipOpened =
          (await tooltip.isVisible().catch(() => false)) ||
          (await tooltip
            .waitFor({ state: "visible", timeout: 2_000 })
            .then(() => true)
            .catch(() => false));
        const closeVisibleBeforeDismiss = await close.isVisible().catch(() => false);
        const guideLineCountBeforeDismiss = await page.locator(".recharts-tooltip-cursor").count();
        const dotsBefore = await page.locator(".recharts-active-dot").count();
        let dismissalAttempted = false;
        const initialStateMatches =
          tooltipOpened &&
          closeVisibleBeforeDismiss &&
          guideLineCountBeforeDismiss === 1 &&
          dotsBefore > 0;
        if (initialStateMatches) {
          dismissalAttempted = true;
          if (scenario === "touch-area-close") await close.tap();
          else
            await page
              .getByRole("heading", { name: /費目別寄与度/ })
              .first()
              .tap();
        }
        observation.actions.push({
          action:
            scenario === "touch-area-close"
              ? "real touchscreen tap on hit-tested stacked-area chart, then touch tooltip close button if opened"
              : "real touchscreen tap on hit-tested stacked-area chart, then touch outside heading if tooltip opened",
          result: {
            wrapper: box,
            touchPoint: point,
            hitTestBeforeTouch,
            tooltipOpened,
            closeVisibleBeforeDismiss,
            guideLineCountBeforeDismiss,
            dotsBefore,
            initialStateMatches,
            dismissalAttempted,
            tooltipVisible: await tooltip.isVisible().catch(() => false),
            closeButtonVisible: await close.isVisible().catch(() => false),
            dotsAfter: await page.locator(".recharts-active-dot").count(),
            guideLineCount: await page.locator(".recharts-tooltip-cursor").count(),
          },
        });
      } else if (scenario === "touch-during-tab-scroll") {
        const wrapper = page.locator("#section-cpi-major .recharts-wrapper").first();
        await wrapper.scrollIntoViewIfNeeded();
        await wrapper.waitFor({ state: "visible", timeout: 10_000 });
        const tab = page.getByRole("button", { name: "給与", exact: true });
        await tab.tap();
        const box = await wrapper.boundingBox();
        const scrollYBeforeTouch = await page.evaluate(() => window.scrollY);
        const close = page.getByRole("button", { name: "閉じる" });
        const closeVisibleBeforeTouch = await close.isVisible().catch(() => false);
        let touchPoint: Point | null = null;
        let touchDeliveryContext: Record<string, unknown> | null = null;
        const client = await page.context().newCDPSession(page);
        if (box) {
          touchPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          touchDeliveryContext = await page.evaluate(({ x, y }) => {
            const hit = document.elementFromPoint(x, y);
            return {
              viewport: { width: innerWidth, height: innerHeight },
              inViewport: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight,
              hitTagName: hit?.tagName ?? null,
              hitClassName: typeof hit?.className === "string" ? hit.className : null,
              insideCpiMajorWrapper: hit?.closest("#section-cpi-major .recharts-wrapper") != null,
            };
          }, touchPoint);
          await client.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [touchPoint],
          });
          await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
        const scrollYImmediatelyAfterTouch = await page.evaluate(() => window.scrollY);
        const closeVisibleImmediatelyAfterTouch = await close.isVisible().catch(() => false);
        const scrollSamples: Array<{ elapsedMs: number; scrollY: number }> = [];
        const settleStart = Date.now();
        let previous = scrollYImmediatelyAfterTouch;
        let stableSamples = 0;
        let settleInterval = 100;
        while (Date.now() - settleStart < 5_000 && stableSamples < 2) {
          await page.waitForTimeout(settleInterval);
          const current = await page.evaluate(() => window.scrollY);
          scrollSamples.push({ elapsedMs: Date.now() - settleStart, scrollY: current });
          stableSamples = current === previous ? stableSamples + 1 : 0;
          previous = current;
          settleInterval = Math.min(settleInterval + 100, 300);
        }
        const scrollMovementObserved =
          scrollYBeforeTouch !== scrollYImmediatelyAfterTouch ||
          scrollSamples.some((sample) => sample.scrollY !== scrollYBeforeTouch);
        observation.actions.push({
          action:
            "tap 給与 section-tab then dispatch actual touchStart/touchEnd on CPI chart during programmatic scroll",
          result: {
            tabSelector: 'button[role="button"][name="給与"]',
            wrapperSelector: "#section-cpi-major .recharts-wrapper:first",
            wrapperBoxAtTouch: box,
            touchPoint,
            touchDeliveryContext,
            scrollYBeforeTouch,
            scrollYImmediatelyAfterTouch,
            scrollSamples,
            scrollMovementObserved,
            closeVisibleBeforeTouch,
            closeVisibleImmediatelyAfterTouch,
            closeVisibleAfterSettle: await close.isVisible().catch(() => false),
            tooltipVisible: await tooltip.isVisible().catch(() => false),
          },
        });
      }
    }
  } catch (error) {
    observation.probeError =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    observation.interpretation = "probe-error-unclassified";
  } finally {
    observation.url = page.url();
    await isolated.close();
  }
  const touchChartExpectations: Partial<Record<Phase5InteractionScenario, string[]>> = {
    "touch-open-close": [NOMINAL],
    "touch-escape": [NOMINAL],
    "touch-outside": [NOMINAL],
    "touch-retap": [NOMINAL],
    "touch-switch-chart": [NOMINAL, REAL],
    "touch-overlap": [REAL],
    "touch-chart-note-navigation": [REAL],
  };
  if (!observation.probeError && touchChartExpectations[scenario]) {
    const barActions = observation.actions.filter((entry) =>
      entry.action.startsWith("touchscreen.tap("),
    );
    const expectedCharts = touchChartExpectations[scenario] ?? [];
    const actionDelivered = expectedCharts.every((chartId, index) => {
      const result = barActions[index]?.result;
      const hit = result?.hitTestBeforeTouch as Record<string, unknown> | undefined;
      const events = result?.trustedInputEvents as Array<Record<string, unknown>> | undefined;
      return (
        hit?.hitSelector != null &&
        hit?.insideChartWrapper === true &&
        Array.isArray(events) &&
        events.some(
          (event) =>
            event.isTrusted === true &&
            ["touchstart", "pointerdown", "click"].includes(String(event.type)) &&
            event.chartTestId === chartId,
        )
      );
    });
    if (!actionDelivered)
      observation.probeError =
        "The intended touchscreen action was not evidenced as trusted input delivered to its hit-tested chart; source predicate remains unclassified.";
  }
  if (observation.probeError) {
    observation.interpretation = "probe-error-unclassified";
  } else {
    observation.contractMatch = matchesSourceContract(scenario, observation.actions);
    if (observation.contractMatch === false)
      observation.interpretation = "product-or-contract-mismatch";
  }
  return observation;
};

function matchesSourceContract(
  scenario: Phase5InteractionScenario,
  actions: Phase5InteractionObservation["actions"],
): boolean {
  const results = actions.map((entry) => entry.result);
  const actionResult = (text: string) =>
    actions.find((entry) => entry.action.includes(text))?.result ?? {};
  const touchResults = actions
    .filter((entry) => entry.action.startsWith("touchscreen.tap("))
    .map((entry) => entry.result);
  const last = results.at(-1) ?? {};
  switch (scenario) {
    case "real-flight": {
      const result = actionResult("extract quarterlyRealData");
      return (
        result.propertyFound === true &&
        result.filteredQuarterRows === 48 &&
        result.supportFieldPresentOnBothEndpoints === true &&
        Array.isArray(result.endpointSupportValues) &&
        result.endpointSupportValues.length === 2 &&
        result.endpointSupportValues.every((value) => Number(value) > 0)
      );
    }
    case "real-hydration":
      return actionResult("same-load page errors").errorCount === 0;
    case "real-components":
      return actionResult("observe production real-consumption section").sectionVisible === true;
    case "real-legend-toggle":
      return last.pressedBefore !== last.pressedAfter || last.svgInnerHtmlChanged === true;
    case "real-accordion-closed":
      return (
        last.open === false &&
        Array.isArray(last.legendVisibility) &&
        last.legendVisibility.every((visible) => visible === false)
      );
    case "real-accordion-open":
      return last.detailsOpen === true && Number(last.visibleLegendButtonCount) > 0;
    case "real-accordion-style":
      return last.summaryVisible === true;
    case "touch-open-close":
      return (
        touchResults.length > 0 &&
        Number(touchResults[0].guideLineCount) > 0 &&
        last.tooltipVisible === false &&
        last.closeButtonVisible === false &&
        last.guideLineCount === 0
      );
    case "touch-escape": {
      const escapeClosed = actionResult("keyboard.press(Escape)");
      return (
        touchResults.length > 0 &&
        Number(touchResults[0].guideLineCount) > 0 &&
        escapeClosed.tooltipVisible === false &&
        escapeClosed.closeButtonVisible === false &&
        last.tooltipVisibleAfterRetap === true &&
        last.closeButtonVisibleAfterRetap === true
      );
    }
    case "touch-outside":
      return (
        touchResults.length > 0 &&
        Number(touchResults[0].guideLineCount) > 0 &&
        last.tooltipVisible === false &&
        last.closeButtonVisible === false &&
        last.guideLineCount === 0
      );
    case "touch-switch-chart":
      return (
        touchResults.length === 2 &&
        touchResults.every(
          (result) =>
            (result.hitTestBeforeTouch as Record<string, unknown>).insideChartWrapper === true &&
            result.guideLineCount === 1,
        )
      );
    case "touch-swipe-negative":
      return (
        last.gestureOriginHit != null &&
        (last.gestureOriginHit as Record<string, unknown>).insideNominalWrapper === true &&
        last.tooltipVisibleAfterGesture === false &&
        last.closeButtonVisibleAfterGesture === false
      );
    case "touch-retap":
      return (
        last.closedBeforeRetap === true &&
        last.tooltipVisibleAfterRetap === true &&
        last.closeButtonVisibleAfterRetap === true
      );
    case "touch-overlap":
      return (
        (last.hitTestBeforeTouch as Record<string, unknown> | undefined)?.inTooltip === true &&
        last.urlBefore === last.urlAfter &&
        last.tooltipVisibleAfterTouch === true
      );
    case "touch-chart-note-navigation":
      return (
        (last.hitTestBeforeTouch as Record<string, unknown> | undefined)?.linkHref ===
          "#section-consumption-nominal" &&
        (last.hitTestBeforeTouch as Record<string, unknown> | undefined)?.inTooltip === false &&
        String(last.urlAfter).endsWith("#section-consumption-nominal") &&
        last.tooltipVisibleAfterTouch === false
      );
    case "touch-area-outside":
      return (
        last.hitTestBeforeTouch != null &&
        (last.hitTestBeforeTouch as Record<string, unknown>).insideTargetWrapper === true &&
        last.initialStateMatches === true &&
        last.dismissalAttempted === true &&
        Number(last.dotsAfter) === 0 &&
        last.closeButtonVisible === false &&
        last.guideLineCount === 0
      );
    case "touch-area-close":
      return (
        last.hitTestBeforeTouch != null &&
        (last.hitTestBeforeTouch as Record<string, unknown>).insideTargetWrapper === true &&
        last.initialStateMatches === true &&
        last.dismissalAttempted === true &&
        Number(last.dotsAfter) === 0 &&
        last.closeButtonVisible === false
      );
    case "touch-during-tab-scroll":
      return (
        last.closeVisibleImmediatelyAfterTouch === false && last.closeVisibleAfterSettle === false
      );
  }
}

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase5Interaction: (
      scenario: Phase5InteractionScenario,
    ) => Promise<Phase5InteractionObservation>;
  }
}
