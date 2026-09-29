import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { desktop1280x800ContextOptions, withIsolatedContext } from "./isolated-route-context";
import { NEXT_ROUTE_POC_BASE_URL, NEXT_ROUTE_POC_PORT } from "./next-route-poc.constants";

export interface NextRouteObservation {
  url: string;
  serverPort: number;
  responseStatus: number;
  pageHeading: string | null;
  firstDataPeriod: string | null;
  firstDataValue: string | null;
  firstDataValueType: string | null;
  chartAreaCountBefore: number;
  chartAreaCountAfter: number;
  legendPressedBefore: string | null;
  legendPressedAfter: string | null;
}

/**
 * PoC only: drive the built Next production route from a separate Playwright
 * context and return browser observations to the Vitest Browser Mode test.
 */
export const inspectProductionDashboard: BrowserCommand<[], NextRouteObservation> = async ({
  context,
  provider,
}) => {
  if (provider.name !== "playwright") {
    throw new Error(
      `The Next route PoC requires the Playwright provider; received ${provider.name}.`,
    );
  }

  const browser = context.browser();
  if (!browser) {
    throw new Error(
      "The Playwright provider did not expose its Browser for an isolated PoC context.",
    );
  }

  return withIsolatedContext(browser, desktop1280x800ContextOptions(), async (isolatedContext) => {
    const page = await isolatedContext.newPage();
    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
      waitUntil: "domcontentloaded",
    });
    if (!response) {
      throw new Error("The production dashboard navigation did not return a document response.");
    }

    const heading = page.getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" });
    await heading.waitFor({ state: "visible", timeout: 30_000 });

    const chart = page.locator("#section-cpi-major");
    const dataContract = chart.locator('[data-testid="chart-data-contract"]');
    await dataContract.waitFor({ state: "attached", timeout: 30_000 });
    const firstDataRow = dataContract.locator("[data-chart-data-row]").first();
    const firstDataPeriod = await firstDataRow.getAttribute("data-period");
    const firstDataValue = firstDataRow.locator('[data-series-key="総合"]');
    const firstValue = await firstDataValue.getAttribute("data-value");
    const firstValueType = await firstDataValue.getAttribute("data-value-type");

    const legend = chart.getByTestId("legend-総合");
    const legendPressedBefore = await legend.getAttribute("aria-pressed");
    const chartAreaCountBefore = await chart.locator(".recharts-area").count();
    await legend.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('#section-cpi-major [data-testid="legend-総合"]')
          ?.getAttribute("aria-pressed") === "false",
      undefined,
      { timeout: 10_000 },
    );
    const legendPressedAfter = await legend.getAttribute("aria-pressed");
    const chartAreaCountAfter = await chart.locator(".recharts-area").count();

    return {
      url: page.url(),
      serverPort: NEXT_ROUTE_POC_PORT,
      responseStatus: response.status(),
      pageHeading: await heading.textContent(),
      firstDataPeriod,
      firstDataValue: firstValue,
      firstDataValueType: firstValueType,
      chartAreaCountBefore,
      chartAreaCountAfter,
      legendPressedBefore,
      legendPressedAfter,
    };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectProductionDashboard: () => Promise<NextRouteObservation>;
  }
}
