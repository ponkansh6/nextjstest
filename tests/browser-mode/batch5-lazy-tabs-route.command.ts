import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { devices } from "@playwright/test";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Batch5LazyTabCase =
  | "new-graph-chromium"
  | "new-graph-webkit"
  | "consumption-nominal-chromium"
  | "earnings-chromium"
  | "consumption-nominal-webkit"
  | "earnings-webkit";

const TARGETS: Record<Batch5LazyTabCase, { label: string; sectionId: string; webkit: boolean }> = {
  "new-graph-chromium": { label: "3種比較", sectionId: "section-new-graph", webkit: false },
  "new-graph-webkit": { label: "3種比較", sectionId: "section-new-graph", webkit: true },
  "consumption-nominal-chromium": {
    label: "消費(名目)",
    sectionId: "section-consumption-nominal",
    webkit: false,
  },
  "earnings-chromium": { label: "給与", sectionId: "section-earnings", webkit: false },
  "consumption-nominal-webkit": {
    label: "消費(名目)",
    sectionId: "section-consumption-nominal",
    webkit: true,
  },
  "earnings-webkit": { label: "給与", sectionId: "section-earnings", webkit: true },
};

export interface Batch5LazyTabObservation {
  url: string;
  responseStatus: number;
  values: {
    targetId: string;
    tabLabel: string;
    initiallyAbsent: boolean;
    mountedAfterClick: boolean;
    visibleAfterClick: boolean;
    inViewportAfterClick: boolean;
    deviceContext?: {
      viewport: { width: number; height: number };
      screen: { width: number; height: number };
      deviceScaleFactor: number;
      userAgent: string;
      configuredIsMobile: boolean;
      configuredHasTouch: boolean;
    };
  };
}

export const inspectBatch5LazyTab: BrowserCommand<
  [scenario: Batch5LazyTabCase],
  Batch5LazyTabObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright")
    throw new Error("Batch 5 LazyMount checks require Playwright.");
  const browser = context.browser();
  if (!browser) throw new Error("The Playwright Browser is unavailable to the Batch 5 command.");

  const target = TARGETS[scenario];
  const webkit = browser.browserType().name() === "webkit";
  if (target.webkit !== webkit) {
    throw new Error(
      `${scenario} requires ${target.webkit ? "WebKit" : "Chromium"}, received ${browser.browserType().name()}.`,
    );
  }

  const iphone13 = devices["iPhone 13"];
  const isolated = await browser.newContext({
    viewport: webkit ? iphone13.viewport : { width: 1280, height: 720 },
    ...(webkit
      ? {
          screen: { width: 390, height: 844 },
          userAgent: iphone13.userAgent,
          deviceScaleFactor: iphone13.deviceScaleFactor,
          isMobile: iphone13.isMobile,
          hasTouch: iphone13.hasTouch,
        }
      : {}),
  });
  const page = await isolated.newPage();
  try {
    // Deliberately preserve the production LazyMount default; do not set __MOUNT_ALL__.
    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
      waitUntil: "domcontentloaded",
    });
    if (!response) throw new Error("Production route navigation returned no response.");
    await page
      .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const section = page.locator(`#${target.sectionId}`);
    const initiallyAbsent = (await section.count()) === 0;
    const tab = page
      .locator('[class*="sectionTabs"]')
      .getByRole("button", { name: target.label, exact: true });
    await tab.click();
    await section.waitFor({ state: "visible", timeout: 15_000 });
    const mountedAfterClick = (await section.count()) === 1;
    const visibleAfterClick = await section.isVisible();
    await page.waitForFunction(
      (sectionId) => {
        const element = document.getElementById(sectionId);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      },
      target.sectionId,
      { timeout: 15_000 },
    );
    const inViewportAfterClick = await section.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });

    const values: Batch5LazyTabObservation["values"] = {
      targetId: target.sectionId,
      tabLabel: target.label,
      initiallyAbsent,
      mountedAfterClick,
      visibleAfterClick,
      inViewportAfterClick,
    };
    if (webkit) {
      values.deviceContext = await page.evaluate(
        ({ configuredIsMobile, configuredHasTouch }) => ({
          viewport: { width: innerWidth, height: innerHeight },
          screen: { width: screen.width, height: screen.height },
          deviceScaleFactor: devicePixelRatio,
          userAgent: navigator.userAgent,
          configuredIsMobile,
          configuredHasTouch,
        }),
        { configuredIsMobile: iphone13.isMobile, configuredHasTouch: iphone13.hasTouch },
      );
    }
    return { url: page.url(), responseStatus: response.status(), values };
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch5LazyTab: (scenario: Batch5LazyTabCase) => Promise<Batch5LazyTabObservation>;
  }
}
