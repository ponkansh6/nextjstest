import { readFile } from "node:fs/promises";
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B05Id = "p45-a-parity-section-residual" | "p45-a-parity-section-stacked";

type Contract = {
  sectionId: string;
  tableId: string;
  chartName: string;
  keys: string[];
};

const CONTRACTS: Record<Phase6B05Id, Contract> = {
  "p45-a-parity-section-residual": {
    sectionId: "section-residual",
    tableId: "data-table-section-residual",
    chartName: "給与と物価の差（実質賃金相当）の推移グラフ",
    keys: ["残差"],
  },
  "p45-a-parity-section-stacked": {
    sectionId: "section-stacked",
    tableId: "data-table-section-stacked",
    chartName: "物価指数 費目別寄与度の積み上げグラフ",
    keys: [
      "住居",
      "家具・家事用品",
      "被服及び履物",
      "保健医療",
      "教育",
      "光熱・水道",
      "教養娯楽",
      "交通・自動車等関係費",
      "通信",
      "外食以外食料",
      "外食",
      "諸雑費",
    ],
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

async function captureCsv(page: import("@playwright/test").Page, tableId: string): Promise<Csv> {
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByTestId(tableId)
    .getByRole("button", { name: /CSVでダウンロード/ })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("CSV download did not produce a persisted file.");
  const text = await readFile(path, "utf8");
  return { text, rows: parseCsv(text) };
}

export const inspectPhase6B05: BrowserCommand<[id: Phase6B05Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  const isolated = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await isolated.newPage();
  try {
    await page.addInitScript(() => {
      (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
    });
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
  } finally {
    await isolated.close();
  }
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B05: (id: Phase6B05Id) => Promise<unknown>;
  }
}
