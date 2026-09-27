import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { devices } from "@playwright/test";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Batch5StandardRouteCase = "earnings-tab-desktop" | "earnings-tab-iphone13";

export interface Batch5StandardRouteObservation {
  responseStatus: number;
  url: string;
  values: {
    scrollYBefore: number;
    scrollYAfter: number;
    targetVisible: boolean;
    targetTop: number;
    targetBottom: number;
    viewport: { width: number; height: number } | null;
    screen: { width: number; height: number };
    deviceScaleFactor: number;
    userAgent: string;
    isMobile: boolean;
    hasTouch: boolean;
  };
}

export const inspectBatch5StandardProductionCase: BrowserCommand<
  [scenario: Batch5StandardRouteCase],
  Batch5StandardRouteObservation
> = async ({ context, provider }, scenario) => {
  if (provider.name !== "playwright")
    throw new Error("Batch 5 standard route checks require Playwright.");
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable.");
  const engine = browser.browserType().name();
  const mobile = scenario === "earnings-tab-iphone13";
  if ((mobile && engine !== "webkit") || (!mobile && engine !== "chromium")) {
    throw new Error(`${scenario} requires ${mobile ? "WebKit" : "Chromium"}; received ${engine}.`);
  }

  const isolated = await browser.newContext(
    mobile ? { ...devices["iPhone 13"] } : { viewport: { width: 1280, height: 720 } },
  );
  const page = await isolated.newPage();
  try {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
      waitUntil: "domcontentloaded",
    });
    if (!response) throw new Error("Production route navigation returned no response.");
    await page
      .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const target = page.locator("#section-earnings");
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await page
      .locator('[class*="sectionTabs"]')
      .getByRole("button", { name: "給与", exact: true })
      .click();
    await page.waitForFunction(
      () => {
        const section = document.querySelector("#section-earnings");
        if (!section) return false;
        const rect = section.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      },
      undefined,
      { timeout: 10_000 },
    );

    const targetGeometry = await target.evaluate((section) => {
      const rect = section.getBoundingClientRect();
      return {
        scrollYAfter: window.scrollY,
        targetVisible: rect.bottom > 0 && rect.top < innerHeight,
        targetTop: rect.top,
        targetBottom: rect.bottom,
      };
    });
    const device = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      screen: { width: screen.width, height: screen.height },
      deviceScaleFactor: window.devicePixelRatio,
      userAgent: navigator.userAgent,
    }));
    return {
      responseStatus: response.status(),
      url: page.url(),
      values: {
        scrollYBefore,
        ...targetGeometry,
        ...device,
        isMobile: mobile,
        hasTouch: mobile,
      },
    };
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectBatch5StandardProductionCase: (
      scenario: Batch5StandardRouteCase,
    ) => Promise<Batch5StandardRouteObservation>;
  }
}
