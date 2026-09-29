import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import {
  extractArrayProp,
  extractFlightFromHtml,
  filter2005to2016,
  REAL_PROP,
  type QuarterlyRow,
} from "../utils/flight-payload";
import { desktop1280x720ContextOptions, withIsolatedContext } from "./isolated-route-context";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B07Id =
  | "p45-b-real-consumption-21-page-tsx-e2e-real-consumption-chart-with-actual-browser"
  | "p45-b-real-consumption-60-page-tsx-e2e-real-consumption-chart-with-actual-browser"
  | "p45-b-real-consumption-82-page-tsx-e2e-real-consumption-chart-with-actual-browser";

export const inspectPhase6B07: BrowserCommand<[id: Phase6B07Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  return withIsolatedContext(browser, desktop1280x720ContextOptions(), async (isolated) => {
    const page = await isolated.newPage();
    if (id.startsWith("p45-b-real-consumption-21-")) {
      await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`);
      const html = await page.content();
      const payload = extractFlightFromHtml(html);
      const realRows: QuarterlyRow[] = filter2005to2016(extractArrayProp(payload, REAL_PROP));
      return { realRows };
    }

    if (id.startsWith("p45-b-real-consumption-60-")) {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`Page error: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`Console error: ${msg.text()}`);
      });
      await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`);
      await page.waitForTimeout(1_000);
      return { errors };
    }

    await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`);
    await page
      .getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" })
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const realConsumptionTab = page.locator('[class*="sectionTabsScroll"]').getByRole("button", {
      name: "消費(実質)",
      exact: true,
    });
    await realConsumptionTab.click();
    const realChartSection = page.locator("#section-consumption-real");
    await realChartSection.waitFor({ state: "visible", timeout: 15_000 });
    return { visible: await realChartSection.isVisible() };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B07: (id: Phase6B07Id) => Promise<unknown>;
  }
}
