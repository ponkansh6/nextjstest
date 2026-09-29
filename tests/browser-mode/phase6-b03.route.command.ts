import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { desktop1280x800ContextOptions, withIsolatedContext } from "./isolated-route-context";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B03Id =
  | "p45-a-advanced-series-adv-query"
  | "p45-a-parity-advanced-anchors"
  | "p45-a-parity-hidden-series";

type Chart = {
  found: boolean;
  sectionCount: number;
  rootCount: number;
  wrapperCount: number;
  wrapperVisible: boolean;
  svgVisible: boolean;
  contractCount: number;
  geometryCount: number;
  keys: string[];
  rows: Array<{ period: string; values: Array<{ key: string; value: string; type: string }> }>;
};
type Surface = { headers: string[]; values: string[][]; count: number };
type Csv = { text: string; rows: string[][] };

async function chart(page: import("@playwright/test").Page, sectionId: string): Promise<Chart> {
  const section = page.locator(`#${sectionId}`);
  await section.scrollIntoViewIfNeeded();
  const chartName =
    sectionId === "section-new-graph"
      ? "給与・消費・物価の推移比較（12MA）グラフ"
      : "物価指数 費目別寄与度の積み上げグラフ";
  const root = section.getByRole("img", { name: chartName, exact: true });
  await root.waitFor({ state: "visible", timeout: 15_000 });
  const node = section.getByTestId("chart-data-contract");
  await node.waitFor({ state: "attached", timeout: 15_000 });
  const contract = await node.evaluate((element) => ({
    found: true,
    keys: JSON.parse(element.getAttribute("data-series") ?? "[]") as string[],
    rows: [...element.querySelectorAll<HTMLElement>("[data-chart-data-row]")].map((row) => ({
      period: row.getAttribute("data-period") ?? "",
      values: [...row.querySelectorAll<HTMLElement>("[data-series-key]")].map((cell) => ({
        key: cell.getAttribute("data-series-key") ?? "",
        value: cell.getAttribute("data-value") ?? "null",
        type: cell.getAttribute("data-value-type") ?? "null",
      })),
    })),
  }));
  const wrapper = section.locator(".recharts-wrapper").first();
  const svg = section.locator("svg.recharts-surface").first();
  return {
    ...contract,
    sectionCount: await section.count(),
    rootCount: await root.count(),
    wrapperCount: await section.locator(".recharts-wrapper").count(),
    wrapperVisible: await wrapper.isVisible().catch(() => false),
    svgVisible: await svg.isVisible().catch(() => false),
    contractCount: await node.count(),
    geometryCount: await section
      .locator(".recharts-wrapper svg path, .recharts-wrapper svg line")
      .count(),
  };
}

async function table(
  page: import("@playwright/test").Page,
  tableId: string,
  openWithSummary = false,
): Promise<Surface> {
  const root = page.getByTestId(tableId);
  const summary = root.locator("summary");
  if (openWithSummary) await summary.click();
  else if (
    !(await summary.evaluate((element) => element.parentElement?.hasAttribute("open") ?? false))
  ) {
    await root.getByTestId(`data-table-toggle-${tableId.replace("data-table-", "")}`).click();
  }
  await root.getByRole("table").waitFor({ state: "visible" });
  const snapshot = await root.evaluate((element) => ({
    headers: [...element.querySelectorAll("thead th")].map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
    ),
    values: [...element.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td")].map((cell, index) => {
        if (index === 0) return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
        const clone = cell.cloneNode(true) as HTMLElement;
        clone.querySelector("[data-measurement-metadata]")?.remove();
        const value = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
        return value === "" ? "-" : value;
      }),
    ),
  }));
  return { ...snapshot, count: await root.count() };
}

function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\r" || c === "\n") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.map((cells, index) =>
    cells.map((cell, column) => {
      const clean = cell.replace(/\s+/g, " ").trim();
      return index > 0 && column > 0 && clean === "" ? "-" : clean;
    }),
  );
}

async function installCsvCapture(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const host = window as Window & { __phase6B03Csv?: Promise<string> | null };
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      if (blob instanceof Blob) host.__phase6B03Csv = blob.text();
      return original(blob);
    };
  });
}

async function downloadCsv(page: import("@playwright/test").Page, tableId: string): Promise<Csv> {
  await page.evaluate(() => {
    (window as Window & { __phase6B03Csv?: unknown }).__phase6B03Csv = null;
  });
  await page
    .getByTestId(tableId)
    .getByRole("button", { name: /CSVでダウンロード/ })
    .click();
  await page.waitForFunction(
    () => Boolean((window as Window & { __phase6B03Csv?: unknown }).__phase6B03Csv),
    undefined,
    { timeout: 10_000 },
  );
  const text = await page.evaluate(async () => {
    const promise = (window as Window & { __phase6B03Csv?: Promise<string> | null }).__phase6B03Csv;
    return promise ? await promise : "";
  });
  return { text, rows: parseCsv(text) };
}

async function surface(page: import("@playwright/test").Page, tableId: string, summary = false) {
  const values = await table(page, tableId, summary);
  const csv = await downloadCsv(page, tableId);
  return { ...values, csv };
}

export const inspectPhase6B03: BrowserCommand<[id: Phase6B03Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  return withIsolatedContext(browser, desktop1280x800ContextOptions(), async (isolated) => {
    const page = await isolated.newPage();
    await page.addInitScript(() => {
      (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
    });
    await installCsvCapture(page);
    if (id === "p45-a-advanced-series-adv-query") {
      const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/?adv=1`);
      const section = page.locator("#section-new-graph");
      await section.waitFor({ state: "visible", timeout: 30_000 });
      const sectionCount = await section.count();
      const descriptorAttribute = await section
        .getByTestId("chart-data-contract")
        .getAttribute("data-descriptors");
      const dataAttribute = await section
        .getByTestId("chart-data-contract")
        .getAttribute("data-series");
      const button = section.getByRole("button", {
        name: "CTIミクロ基本系列(名目・延長)",
        exact: true,
      });
      const buttonVisible = await button.isVisible();
      const tableSurface = await table(page, "data-table-section-new-graph", true);
      const tableText = await page.getByTestId("data-table-section-new-graph").innerText();
      await page.reload({ waitUntil: "domcontentloaded" });
      const reloadedChart = await chart(page, "section-new-graph");
      const reloadedContract = page
        .locator("#section-new-graph")
        .getByTestId("chart-data-contract");
      const reloadedDescriptorAttribute = await reloadedContract.getAttribute("data-descriptors");
      const reloadedDataAttribute = await reloadedContract.getAttribute("data-series");
      return {
        status: response?.status() ?? null,
        urlAfterReload: page.url(),
        sectionCount,
        descriptorAttribute,
        dataAttribute,
        buttonVisible,
        tableText,
        tableCount: tableSurface.count,
        reloadedChart,
        reloadedDescriptorAttribute,
        reloadedDataAttribute,
      };
    }

    if (id === "p45-a-parity-advanced-anchors") {
      const normalResponse = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`);
      const normalChart = await chart(page, "section-new-graph");
      const normal = await surface(page, "data-table-section-new-graph");
      const advancedResponse = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/?adv=1`);
      const advancedChart = await chart(page, "section-new-graph");
      const advanced = await surface(page, "data-table-section-new-graph");
      await page.reload({ waitUntil: "domcontentloaded" });
      const reloadedAdvancedChart = await chart(page, "section-new-graph");
      const reloadedAdvanced = await table(page, "data-table-section-new-graph");
      return {
        normalStatus: normalResponse?.status() ?? null,
        advancedStatus: advancedResponse?.status() ?? null,
        urlAfterAdvancedReload: page.url(),
        normalChart,
        advancedChart,
        normal,
        advanced,
        reloadedAdvancedChart,
        reloadedAdvanced,
      };
    }

    const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`);
    const section = page.locator("#section-stacked");
    const root = section.getByRole("img", {
      name: "物価指数 費目別寄与度の積み上げグラフ",
      exact: true,
    });
    await root.waitFor({ state: "visible" });
    const beforeChart = await chart(page, "section-stacked");
    const before = await surface(page, "data-table-section-stacked");
    const geometry = async () =>
      page
        .locator(
          "#section-stacked .recharts-wrapper svg path, #section-stacked .recharts-wrapper svg rect",
        )
        .evaluateAll((nodes) =>
          nodes.flatMap((node) => {
            const element = node as SVGGraphicsElement;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (
              rect.width <= 0 ||
              rect.height <= 0 ||
              style.display === "none" ||
              style.visibility === "hidden"
            )
              return [];
            return [
              [
                element.tagName,
                element.getAttribute("d"),
                element.getAttribute("x"),
                element.getAttribute("y"),
                element.getAttribute("width"),
                element.getAttribute("height"),
                rect.x,
                rect.y,
                rect.width,
                rect.height,
              ].join("|"),
            ];
          }),
        );
    const geometryBefore = await geometry();
    const legend = page.getByTestId("legend-住居");
    const ariaPressedBefore = await legend.getAttribute("aria-pressed");
    await legend.click();
    const ariaPressedAfter = await legend.getAttribute("aria-pressed");
    const afterChart = await chart(page, "section-stacked");
    const after = await surface(page, "data-table-section-stacked");
    const geometryAfter = await geometry();
    return {
      status: response?.status() ?? null,
      sectionCount: await section.count(),
      rootCount: await root.count(),
      rootVisible: await root.isVisible(),
      svgVisible: await root.locator("svg").first().isVisible(),
      beforeChart,
      afterChart,
      ariaPressedBefore,
      ariaPressedAfter,
      geometryChanged: JSON.stringify(geometryBefore) !== JSON.stringify(geometryAfter),
      before,
      after,
    };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B03: (id: Phase6B03Id) => Promise<unknown>;
  }
}
