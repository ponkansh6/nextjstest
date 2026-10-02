import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { desktop1280x800ContextOptions, withIsolatedContext } from "./isolated-route-context";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B04Id =
  | "p45-a-parity-section-cpi-major"
  | "p45-a-parity-section-earnings"
  | "p45-a-parity-section-new-graph";

type Contract = {
  sectionId: string;
  tableId: string;
  chartName: string;
  keys: string[];
};

const CONTRACTS: Record<Phase6B04Id, Contract> = {
  "p45-a-parity-section-cpi-major": {
    sectionId: "section-cpi-major",
    tableId: "data-table-section-cpi-major",
    chartName: "消費者物価指数 主要指数の推移グラフ",
    keys: [
      "総合",
      "生鮮食品を除く総合",
      "生鮮食品及びエネルギーを除く総合",
      "食料（酒類を除く）及びエネルギーを除く総合",
    ],
  },
  "p45-a-parity-section-earnings": {
    sectionId: "section-earnings",
    tableId: "data-table-section-earnings",
    chartName: "給与指標と関連指標の推移グラフ",
    keys: [
      "所定内給与",
      "所定外給与",
      "特別給与",
      "時間当たり給与",
      "15歳以上国民当たり給与",
      "CPI総合(参考)",
    ],
  },
  "p45-a-parity-section-new-graph": {
    sectionId: "section-new-graph",
    tableId: "data-table-section-new-graph",
    chartName: "給与・消費・物価の推移比較（12MA）グラフ",
    keys: ["CPI総合(12MA)", "総合(12MA)", "消費(総合)"],
  },
};

type Csv = { text: string; rows: string[][] };
type Chart = {
  sectionCount: number;
  rootCount: number;
  wrapperCount: number;
  wrapperVisible: boolean;
  svgCount: number;
  svgVisible: boolean;
  contractCount: number;
  geometryCount: number;
  keys: string[];
  points: number;
  rows: Array<{ period: string; values: Array<{ key: string; value: string; type: string }> }>;
};
type Surface = {
  count: number;
  tableText: string;
  headers: string[];
  values: string[][];
  csv: Csv;
};

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const result: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) result.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    result.push(row);
  }
  return result.map((cells, index) =>
    cells.map((cell, column) => {
      const clean = cell.replace(/\s+/g, " ").trim();
      return index > 0 && column > 0 && clean === "" ? "-" : clean;
    }),
  );
}

async function installCsvCapture(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const host = window as Window & { __phase6B04Csv?: Promise<string> | null };
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      if (blob instanceof Blob) host.__phase6B04Csv = blob.text();
      return original(blob);
    };
  });
}

async function captureCsv(page: import("@playwright/test").Page, tableId: string): Promise<Csv> {
  await page.evaluate(() => {
    (window as Window & { __phase6B04Csv?: unknown }).__phase6B04Csv = null;
  });
  await page
    .getByTestId(tableId)
    .getByRole("button", { name: /CSVでダウンロード/ })
    .click();
  await page.waitForFunction(
    () => Boolean((window as Window & { __phase6B04Csv?: unknown }).__phase6B04Csv),
    undefined,
    { timeout: 10_000 },
  );
  const text = await page.evaluate(async () => {
    const csv = (window as Window & { __phase6B04Csv?: Promise<string> | null }).__phase6B04Csv;
    return csv ? csv : "";
  });
  return { text, rows: parseCsv(await text) };
}

export const inspectPhase6B04: BrowserCommand<[id: Phase6B04Id], unknown> = async (
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
    const spec = CONTRACTS[id];
    await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`);
    const section = page.locator(`#${spec.sectionId}`);
    const chartRoot = section.getByRole("img", { name: spec.chartName, exact: true });
    await chartRoot.waitFor({ state: "visible", timeout: 30_000 });
    const contractNode = section.getByTestId("chart-data-contract");
    await contractNode.waitFor({ state: "attached", timeout: 15_000 });
    const rawChart = await contractNode.evaluate((node) => ({
      keys: JSON.parse(node.getAttribute("data-series") ?? "[]") as string[],
      points: Number(node.getAttribute("data-points")),
      rows: [...node.querySelectorAll<HTMLElement>("[data-chart-data-row]")].map((row) => ({
        period: row.getAttribute("data-period") ?? "",
        values: [...row.querySelectorAll<HTMLElement>("[data-series-key]")].map((cell) => ({
          key: cell.getAttribute("data-series-key") ?? "",
          value: cell.getAttribute("data-value") ?? "null",
          type: cell.getAttribute("data-value-type") ?? "null",
        })),
      })),
    }));
    const wrapper = section.locator(".recharts-wrapper");
    const svg = section.locator("svg.recharts-surface");
    const chart: Chart = {
      ...rawChart,
      sectionCount: await section.count(),
      rootCount: await chartRoot.count(),
      wrapperCount: await wrapper.count(),
      wrapperVisible: await wrapper
        .first()
        .isVisible()
        .catch(() => false),
      svgCount: await svg.count(),
      svgVisible: await svg
        .first()
        .isVisible()
        .catch(() => false),
      contractCount: await contractNode.count(),
      geometryCount: await section
        .locator("svg.recharts-surface path, svg.recharts-surface line")
        .count(),
    };

    const table = page.getByTestId(spec.tableId);
    await table.getByTestId(`data-table-toggle-${spec.tableId.replace("data-table-", "")}`).click();
    await table.getByRole("table").waitFor({ state: "visible" });
    const rawTable = await table.evaluate((element) => ({
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
    const surface: Surface = {
      ...rawTable,
      count: await table.count(),
      tableText: await table.innerText(),
      csv: await captureCsv(page, spec.tableId),
    };
    return { id, route: new URL(page.url()).pathname + new URL(page.url()).search, chart, surface };
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B04: (id: Phase6B04Id) => Promise<unknown>;
  }
}
