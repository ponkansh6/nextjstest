import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { devices } from "@playwright/test";
import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import {
  buildContextOptions,
  desktop1280x720ContextOptions,
  withIsolatedContext,
} from "./isolated-route-context";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B06Id =
  | "p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real"
  | "p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi"
  | "p45-b-plan40-nominal-stacked-total-range-dom-contract"
  | "p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-";

type CsvArtifact = { text: string; rows: string[][]; artifactPath: string };
type TableSnapshot = { headers: string[]; rows: string[][] };

async function diagnosticStage<T>(
  id: Phase6B06Id,
  name: string,
  action: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  console.info(`[phase6-b06-stage] ${id} ${name} started`);
  try {
    const result = await action();
    console.info(`[phase6-b06-stage] ${id} ${name} completed in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `[phase6-b06-stage] ${id} ${name} failed after ${Date.now() - started}ms (${detail})`,
    );
  }
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
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
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((cell) => cell.replace(/\s+/g, " ").trim()));
}

async function downloadCsv(
  page: import("@playwright/test").Page,
  table: import("@playwright/test").Locator,
  saveArtifact: boolean,
): Promise<CsvArtifact> {
  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
  await table.getByRole("button", { name: /CSVでダウンロード/ }).click();
  const download = await downloadPromise;
  const artifactPath = await download.path();
  if (artifactPath === null) throw new Error("CSV download did not produce a persisted file.");
  if (saveArtifact) {
    const outputPath = path.resolve("test-results", download.suggestedFilename());
    await mkdir(path.dirname(outputPath), { recursive: true });
    await download.saveAs(outputPath);
    const text = await readFile(outputPath, "utf8");
    return { text, rows: parseCsv(text), artifactPath: outputPath };
  }
  const text = await readFile(artifactPath, "utf8");
  return { text, rows: parseCsv(text), artifactPath };
}

async function openTable(table: import("@playwright/test").Locator, viaSummary = false) {
  if (viaSummary) await table.locator("summary").click();
  else await table.getByText(/データテーブルを表示/).click();
  await table.getByRole("table").waitFor({ state: "visible", timeout: 15_000 });
}

async function tableSnapshot(table: import("@playwright/test").Locator): Promise<TableSnapshot> {
  return table.evaluate((element) => ({
    headers: [...element.querySelectorAll("thead th")].map((cell) => cell.textContent ?? ""),
    rows: [...element.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? ""),
    ),
  }));
}

async function nominalPlan27(page: import("@playwright/test").Page, full: boolean) {
  await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`);
  const section = page.locator("#section-consumption-nominal");
  await section.waitFor({ state: "visible", timeout: 15_000 });
  await section.scrollIntoViewIfNeeded();
  const chart = page.getByTestId("spending-chart-nominal");
  await chart.waitFor({ state: "visible" });
  const realChart = page.getByTestId("spending-chart-real");
  await realChart.waitFor({ state: "visible", timeout: 15_000 });
  const contractRows = realChart.locator(
    '[data-testid="chart-data-contract"] [data-chart-data-row]',
  );
  const postBoundary = full
    ? await contractRows.evaluateAll((rows) =>
        rows
          .filter((row) => (row.getAttribute("data-period") ?? "") >= "2018Q1")
          .map((row) => {
            const realTotal = row.querySelector(
              '[data-series-key="CTIミクロ調整系列（総合・実質）"]',
            );
            const otherValues = [...row.querySelectorAll<HTMLElement>("[data-series-key]")]
              .filter(
                (cell) =>
                  cell.getAttribute("data-series-key") !== "CTIミクロ調整系列（総合・実質）",
              )
              .map((cell) => cell.getAttribute("data-value") ?? "null");
            return {
              period: row.getAttribute("data-period") ?? "",
              value: realTotal?.getAttribute("data-value") ?? "",
              status: realTotal?.getAttribute("data-status") ?? "",
              reason: realTotal?.getAttribute("data-reason") ?? "",
              hasStackedValue: otherValues.some((value) => value !== "null"),
            };
          }),
      )
    : [];
  const realTable = page.locator("#data-table-section-consumption-real");
  await openTable(realTable, true);
  const realHeaders = (await tableSnapshot(realTable)).headers;
  if (!full) return { postBoundary, realHeaders };

  const openRange = async () => {
    if (
      !(await page
        .locator("#startYear")
        .isVisible()
        .catch(() => false))
    ) {
      await page.getByRole("button", { name: "表示期間を変更" }).click();
      await page.locator("#startYear").waitFor({ state: "visible", timeout: 10_000 });
    }
  };
  await openRange();
  await page.locator("#startYear").selectOption("2005");
  await openRange();
  await page.locator("#endYear").selectOption("2017");
  await page.waitForFunction(
    () => {
      const chart = document.querySelector('[data-testid="spending-chart-nominal"]');
      return (
        chart?.querySelector(".recharts-bar")?.querySelectorAll(".recharts-bar-rectangle")
          .length === 52
      );
    },
    undefined,
    { timeout: 15_000 },
  );

  const barCount = await chart
    .locator(".recharts-bar")
    .first()
    .locator(".recharts-bar-rectangle")
    .count();
  const positiveBarCount = await chart.locator(".recharts-bar-rectangle").evaluateAll(
    (nodes) =>
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
  );
  const nominalTable = page.locator("#data-table-section-consumption-nominal");
  await openTable(nominalTable, true);
  const snapshot = await tableSnapshot(nominalTable);
  const periods = snapshot.rows
    .map((row) => row[0] ?? "")
    .filter((period) => /^200[5-9]Q[1-4]$|^201[0-7]Q[1-4]$/.test(period));
  const csv = await downloadCsv(page, nominalTable, true);
  return { postBoundary, realHeaders, barCount, positiveBarCount, snapshot, periods, csv };
}

async function nominalStackedTotalRange(page: import("@playwright/test").Page) {
  const id: Phase6B06Id = "p45-b-plan40-nominal-stacked-total-range-dom-contract";
  await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, { timeout: 20_000 });
  const section = page.locator("#section-consumption-nominal");
  await section.waitFor({ state: "visible", timeout: 15_000 });
  const chart = page.getByTestId("spending-chart-nominal");
  await chart.waitFor({ state: "visible", timeout: 15_000 });
  const categories = [
    "CTIミクロ調整系列（食料）",
    "CTIミクロ調整系列（住居）",
    "CTIミクロ調整系列（光熱・水道）",
    "CTIミクロ調整系列（家具・家事用品）",
    "CTIミクロ調整系列（被服及び履物）",
    "CTIミクロ調整系列（保健医療）",
    "CTIミクロ調整系列（交通・通信）",
    "CTIミクロ調整系列（教育）",
    "CTIミクロ調整系列（教養娯楽）",
    "CTIミクロ調整系列（その他の消費支出）",
  ];
  const rows = await chart
    .locator('[data-testid="chart-data-contract"] [data-chart-data-row]')
    .evaluateAll((elements, keys) => {
      const measurementAttributes = [
        "data-status",
        "data-series-type",
        "data-measurement-value-type",
        "data-source",
        "data-unit",
        "data-frequency",
        "data-aggregation",
      ];
      return elements.map((row) => {
        const values = keys.map((key) => {
          const cell = row.querySelector<HTMLElement>(`[data-series-key="${key}"]`);
          return {
            key,
            value: cell?.getAttribute("data-value") ?? null,
            valueType: cell?.getAttribute("data-value-type") ?? null,
            status: cell?.getAttribute("data-status") ?? null,
            seriesType: cell?.getAttribute("data-series-type") ?? null,
            hasMeasurementMetadata: measurementAttributes.some((attribute) =>
              cell?.hasAttribute(attribute),
            ),
          };
        });
        return {
          period: row.getAttribute("data-period"),
          values,
          total: values.reduce((sum, item) => sum + Number(item.value), 0),
        };
      });
    }, categories);
  const renderedSeries = await Promise.all(
    categories.map(async (key) => {
      return chart
        .locator(`[data-testid="spending-series-${key}"]`)
        .evaluateAll((anchors, testId) => {
          const barGroups = new Set<Element>();
          const rectangles = new Set<Element>();
          for (const anchor of anchors) {
            const group = anchor.matches("g.recharts-bar")
              ? anchor
              : anchor.closest("g.recharts-bar");
            if (group) {
              barGroups.add(group);
              for (const rectangle of group.querySelectorAll(".recharts-bar-rectangle")) {
                rectangles.add(rectangle);
              }
            }
            if (anchor.matches(".recharts-bar-rectangle")) rectangles.add(anchor);
            const parentRectangle = anchor.closest(".recharts-bar-rectangle");
            if (parentRectangle) rectangles.add(parentRectangle);
            for (const rectangle of anchor.querySelectorAll(".recharts-bar-rectangle")) {
              rectangles.add(rectangle);
            }
          }
          return {
            key: testId.replace("spending-series-", ""),
            seriesGroupCount: barGroups.size,
            rectangleCount: rectangles.size,
            visibleRectangleCount: [...rectangles].filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            }).length,
          };
        }, `spending-series-${key}`);
    }),
  );
  const renderedStackRows = await chart.evaluate((chartElement, keys) => {
    const dataRows = [
      ...chartElement.querySelectorAll<HTMLElement>(
        '[data-testid="chart-data-contract"] [data-chart-data-row]',
      ),
    ];
    const yTickElements = [
      ...chartElement.querySelectorAll<SVGTextElement>(".recharts-yAxis-tick-labels text"),
    ];
    const yTicks = yTickElements
      .map((tick) => {
        const value = Number((tick.textContent ?? "").replaceAll(",", "").trim());
        const bounds = tick.getBoundingClientRect();
        return { value, y: bounds.top + bounds.height / 2 };
      })
      .filter((tick) => Number.isFinite(tick.value) && Number.isFinite(tick.y));
    const zeroTick = yTicks.find((tick) => tick.value === 0);
    const positiveTicks = yTicks.filter((tick) => tick.value > 0);
    const yPairs = yTicks.filter((tick) => tick.value !== 0);
    const yMeanValue =
      yPairs.reduce((sum, tick) => sum + tick.value, 0) / Math.max(yPairs.length, 1);
    const yMeanPosition =
      yPairs.reduce((sum, tick) => sum + tick.y, 0) / Math.max(yPairs.length, 1);
    const ySlope =
      yPairs.length > 1
        ? yPairs.reduce(
            (sum, tick) => sum + (tick.value - yMeanValue) * (tick.y - yMeanPosition),
            0,
          ) / yPairs.reduce((sum, tick) => sum + (tick.value - yMeanValue) ** 2, 0)
        : Number.NaN;
    const yIntercept = yMeanPosition - ySlope * yMeanValue;
    const yScaleValid = Boolean(
      zeroTick && positiveTicks.length > 0 && Number.isFinite(ySlope) && ySlope < 0,
    );

    const rectanglesBySeries = keys.map((key) => {
      const anchor = chartElement.querySelector<SVGGElement>(
        `[data-testid="spending-series-${key}"]`,
      );
      const group = anchor?.matches("g.recharts-bar")
        ? anchor
        : anchor?.closest<SVGGElement>("g.recharts-bar");
      return group
        ? {
            key,
            groupFound: true,
            rectangleCount: group.querySelectorAll(".recharts-bar-rectangle").length,
            shapes: [...group.querySelectorAll<SVGGElement>(".recharts-bar-rectangle")]
              .map((segment) => {
                const shape = segment.querySelector<SVGGraphicsElement>("rect, path");
                const bounds = shape?.getBoundingClientRect();
                return bounds && bounds.width > 0 && bounds.height > 0
                  ? {
                      x: bounds.left + bounds.width / 2,
                      top: bounds.top,
                      bottom: bounds.bottom,
                    }
                  : null;
              })
              .filter((shape): shape is NonNullable<typeof shape> => shape !== null),
          }
        : { key, groupFound: false, rectangleCount: 0, shapes: [] };
    });

    const xTickElements = [
      ...chartElement.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
    ];
    const rowIndices = new Map(
      dataRows.map((row, index) => [row.getAttribute("data-period"), index]),
    );
    const xTickPairs = xTickElements.flatMap((tick) => {
      const index = rowIndices.get((tick.textContent ?? "").trim());
      if (index === undefined) return [];
      const bounds = tick.getBoundingClientRect();
      return [{ index, x: bounds.left + bounds.width / 2 }];
    });
    const xMeanIndex =
      xTickPairs.reduce((sum, tick) => sum + tick.index, 0) / Math.max(xTickPairs.length, 1);
    const xMeanPosition =
      xTickPairs.reduce((sum, tick) => sum + tick.x, 0) / Math.max(xTickPairs.length, 1);
    const xSlope =
      xTickPairs.length > 1
        ? xTickPairs.reduce(
            (sum, tick) => sum + (tick.index - xMeanIndex) * (tick.x - xMeanPosition),
            0,
          ) / xTickPairs.reduce((sum, tick) => sum + (tick.index - xMeanIndex) ** 2, 0)
        : Number.NaN;
    const xIntercept = xMeanPosition - xSlope * xMeanIndex;
    const xScaleValid = Number.isFinite(xSlope) && xSlope > 0 && xTickPairs.length > 1;
    const rowSegments = dataRows.map(() => [] as Array<{ top: number; bottom: number }>);
    let unmappedShapeCount = 0;
    if (xScaleValid) {
      for (const series of rectanglesBySeries) {
        for (const shape of series.shapes) {
          const index = Math.round((shape.x - xIntercept) / xSlope);
          const expectedX = xIntercept + xSlope * index;
          if (
            index < 0 ||
            index >= dataRows.length ||
            Math.abs(shape.x - expectedX) > Math.abs(xSlope) * 0.55
          ) {
            unmappedShapeCount += 1;
            continue;
          }
          rowSegments[index]?.push({ top: shape.top, bottom: shape.bottom });
        }
      }
    } else {
      unmappedShapeCount = rectanglesBySeries.reduce(
        (sum, series) => sum + series.shapes.length,
        0,
      );
    }

    const rows = dataRows.map((row, index) => {
      const segments = rowSegments[index] ?? [];
      const top = segments.length > 0 ? Math.min(...segments.map((segment) => segment.top)) : null;
      const bottom =
        segments.length > 0 ? Math.max(...segments.map((segment) => segment.bottom)) : null;
      const total =
        top === null || bottom === null || !yScaleValid ? null : (top - yIntercept) / ySlope;
      return {
        period: row.getAttribute("data-period"),
        visibleSegmentCount: segments.length,
        total,
      };
    });
    return {
      rows,
      diagnostics: {
        dataRowCount: dataRows.length,
        yTickCount: yTicks.length,
        yTicks,
        yScaleValid,
        yAxisUnitsPerCssPixel:
          Number.isFinite(ySlope) && ySlope !== 0 ? Math.abs(1 / ySlope) : Number.NaN,
        xTickCount: xTickPairs.length,
        xTicks: xTickPairs,
        xScaleValid,
        series: rectanglesBySeries.map(({ key, groupFound, rectangleCount, shapes }) => ({
          key,
          groupFound,
          rectangleCount,
          visibleShapeCount: shapes.length,
        })),
        unmappedShapeCount,
        emptyRenderedRowCount: rows.filter((row) => row.visibleSegmentCount === 0).length,
      },
    };
  }, categories);
  return {
    id,
    categories,
    rows,
    renderedSeries,
    renderedStackRows: renderedStackRows.rows,
    renderedStackDiagnostics: renderedStackRows.diagnostics,
  };
}

async function quarterlyGdp(page: import("@playwright/test").Page) {
  const id: Phase6B06Id =
    "p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-";
  await diagnosticStage(id, "navigate and wait for charts", async () => {
    await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, { timeout: 20_000 });
    await Promise.all([
      page.getByTestId("spending-chart-nominal").waitFor({ state: "visible", timeout: 15_000 }),
      page.getByTestId("spending-chart-real").waitFor({ state: "visible", timeout: 15_000 }),
    ]);
  });
  const nominal = page.getByTestId("spending-chart-nominal");
  const real = page.getByTestId("spending-chart-real");
  const chartLabels = await diagnosticStage(
    id,
    "read chart labels and open real legend",
    async () => {
      const nominalText = await nominal.innerText({ timeout: 5_000 });
      const realText = await real.innerText({ timeout: 5_000 });
      const realLegend = real.locator("summary");
      const realLegendBefore = await realLegend.innerText({ timeout: 5_000 });
      await realLegend.click({ timeout: 5_000 });
      return { nominalText, realText, realLegendBefore };
    },
  );
  const { nominalText, realText, realLegendBefore } = chartLabels;

  const chartSpecs = [
    [nominal, "CTIミクロ調整系列（食料）"],
    [real, "CTIミクロ調整系列（総合・実質）"],
  ] as const;
  const charts = await diagnosticStage(id, "extract chart contracts", () =>
    Promise.all(
      chartSpecs.map(async ([section, publicKey]) => {
        const contract = section.getByTestId("chart-data-contract");
        const keys = JSON.parse(
          (await contract.getAttribute("data-series", { timeout: 5_000 })) ?? "[]",
        ) as string[];
        const rowKeys = await contract.evaluate(
          (element) => [
            ...new Set(
              [...element.querySelectorAll("[data-series-key]")].map(
                (cell) => cell.getAttribute("data-series-key") ?? "",
              ),
            ),
          ],
          undefined,
          { timeout: 5_000 },
        );
        return { keys, rowKeys, publicKey };
      }),
    ),
  );

  await diagnosticStage(id, "select 2025 start year", async () => {
    await page.getByRole("button", { name: "表示期間を変更" }).click();
    await page.locator("#startYear").selectOption("2025");
  });
  const tables = [] as Array<{
    selector: string;
    ctiLabel: string;
    snapshot: TableSnapshot;
    periodLabels: string[];
    supportIndex: number;
    quarterValues: Array<{
      period: string;
      tableValue: string;
      csvValue: string;
      metadata: string;
    }>;
    csv: CsvArtifact;
    publicColumnIndex: number;
    foodColumnIndex: number;
    foodQuarterRows: Array<{
      period: string;
      tableRowCount: number;
      csvRowCount: number;
      tableRows: Array<{
        cells: Array<{
          tableKey: string;
          tableHeader: string;
          tableValue: string;
          metadataText: string;
          metadataAttributes: Record<string, string>;
        }>;
      }>;
      csvRows: Array<{ csvHeader: string; csvValue: string | undefined }>;
    }>;
    tooltips: Array<{
      period: string;
      text: string;
      firstParagraph: string;
      visible: boolean;
      calculatedTotalVisible: boolean;
      tableValue: string;
    }>;
  }>;

  for (const [selector, publicHeader, publicKey] of [
    [
      "#data-table-section-consumption-nominal",
      "CTIミクロ調整系列（食料）",
      "CTIミクロ調整系列（食料）",
    ],
    [
      "#data-table-section-consumption-real",
      "CTIミクロ総合（実質・CPI調整）",
      "CTIミクロ調整系列（総合・実質）",
    ],
  ] as const) {
    const table = page.locator(selector);
    const tableName = selector.includes("nominal") ? "nominal" : "real";
    const snapshot = await diagnosticStage(id, `open ${tableName} table`, async () => {
      await openTable(table);
      return tableSnapshot(table);
    });
    const periodLabels = snapshot.rows
      .map((row) => row[0] ?? "")
      .filter((label) => /^\d{4}Q[1-4]$/.test(label));
    const supportIndex = snapshot.headers.findIndex((header) => header.includes(publicHeader));
    const csv = await diagnosticStage(id, `download ${tableName} CSV`, () =>
      downloadCsv(page, table, false),
    );
    const csvProjection = await diagnosticStage(
      id,
      `inspect ${tableName} table and CSV values`,
      async () => {
        const publicColumnIndex =
          csv.rows[0]?.findIndex((header) => header.includes(publicHeader)) ?? -1;
        const quarterValues = [] as Array<{
          period: string;
          tableValue: string;
          csvValue: string;
          metadata: string;
        }>;
        for (const period of ["2025Q1", "2025Q2", "2025Q3", "2025Q4"]) {
          const rowIndex = snapshot.rows.findIndex((row) => (row[0] ?? "").trim() === period);
          if (rowIndex < 0) throw new Error(`Table row ${period} was not found.`);
          if (supportIndex < 0) throw new Error(`Table column ${publicHeader} was not found.`);
          const supportCell = table
            .locator("tbody tr")
            .nth(rowIndex)
            .locator("td")
            .nth(supportIndex);
          const cellEvidence = await supportCell.evaluate(
            (cell, metadataSelector) => {
              const textNode = [...cell.childNodes].find(
                (node) => node.nodeType === Node.TEXT_NODE,
              );
              const metadata = cell.querySelector<HTMLElement>(metadataSelector);
              return {
                tableValue: textNode?.textContent?.trim() ?? "",
                metadata: metadata?.innerText ?? "",
              };
            },
            `[data-measurement-metadata="${publicKey}"]`,
            { timeout: 5_000 },
          );
          const csvRow = csv.rows.find((row) => row[0] === period);
          quarterValues.push({ period, ...cellEvidence, csvValue: csvRow?.[supportIndex] ?? "" });
        }

        const foodHeader = tableName === "nominal" ? "CTIミクロ調整系列（食料）" : "食料";
        const foodHeaderIndexes = (csv.rows[0] ?? []).flatMap((header, index) =>
          header === foodHeader ? [index] : [],
        );
        if (foodHeaderIndexes.length !== 1) {
          throw new Error(
            `Expected one exact ${tableName} CSV header ${foodHeader}; found ${foodHeaderIndexes.length}.`,
          );
        }
        const foodColumnIndex = foodHeaderIndexes[0] ?? -1;
        const tableFoodHeaderIndexes = snapshot.headers.flatMap((header, index) =>
          header === foodHeader ? [index] : [],
        );
        if (tableFoodHeaderIndexes.length !== 1) {
          throw new Error(
            `Expected one exact ${tableName} table header ${foodHeader}; found ${tableFoodHeaderIndexes.length}.`,
          );
        }
        if (foodColumnIndex !== (tableFoodHeaderIndexes[0] ?? -1)) {
          throw new Error(
            `CSV/table column mismatch for ${foodHeader}: CSV ${foodColumnIndex}, table ${tableFoodHeaderIndexes[0]}.`,
          );
        }
        const foodQuarterRows =
          tableName === "nominal"
            ? await Promise.all(
                (["2025Q1", "2025Q2", "2025Q3", "2025Q4"] as const).map(async (period) => {
                  const tableRows = await table.evaluate(
                    (element, { period, key }) => {
                      const matchingRows = [...element.querySelectorAll("tbody tr")].filter(
                        (row) => row.querySelector("td")?.textContent?.trim() === period,
                      );
                      return matchingRows.map((row) => ({
                        cells: [...row.querySelectorAll("td")]
                          .filter((cell) => cell.getAttribute("data-series-key") === key)
                          .map((cell) => {
                            const metadata = cell.querySelector<HTMLElement>(
                              `[data-measurement-metadata="${key}"]`,
                            );
                            return {
                              tableKey: cell.getAttribute("data-series-key") ?? "",
                              tableValue:
                                [...cell.childNodes]
                                  .find((node) => node.nodeType === Node.TEXT_NODE)
                                  ?.textContent?.trim() ?? "",
                              metadataText: metadata?.innerText ?? "",
                              metadataAttributes: Object.fromEntries(
                                [...(metadata?.attributes ?? [])]
                                  .filter((attribute) =>
                                    attribute.name.startsWith("data-measurement-"),
                                  )
                                  .map((attribute) => [attribute.name, attribute.value]),
                              ),
                            };
                          }),
                      }));
                    },
                    { period, key: foodHeader },
                  );
                  const matchingCsvRows = csv.rows.filter((candidate) => candidate[0] === period);
                  return {
                    period,
                    tableRowCount: tableRows.length,
                    csvRowCount: matchingCsvRows.length,
                    tableRows: tableRows.map((row) => ({
                      cells: row.cells.map((cell) => ({
                        ...cell,
                        tableHeader: snapshot.headers[tableFoodHeaderIndexes[0] ?? -1] ?? "",
                      })),
                    })),
                    csvRows: matchingCsvRows.map((row) => ({
                      csvHeader: csv.rows[0]?.[foodColumnIndex] ?? "",
                      csvValue: row[foodColumnIndex],
                    })),
                  };
                }),
              )
            : [];
        return { publicColumnIndex, quarterValues, foodColumnIndex, foodQuarterRows };
      },
    );
    const { publicColumnIndex, quarterValues, foodColumnIndex, foodQuarterRows } = csvProjection;

    const tooltips = [] as Array<{
      period: string;
      text: string;
      firstParagraph: string;
      visible: boolean;
      calculatedTotalVisible: boolean;
      tableValue: string;
      realTotalVisible: boolean;
      realTotalValue: string;
      realTotalTableValue: string;
      realTotalCpiSeries: string | null;
      realTotalBaseYear: string | null;
      realTotalCpiPeriod: string | null;
      realTotalCpiAggregation: string | null;
      realTotalNominalSource: string | null;
      measurementNoteCount: number;
      cpiProvenanceCount: number;
    }>;
    const testId = selector.includes("nominal") ? "spending-chart-nominal" : "spending-chart-real";
    const chart = page.getByTestId(testId);
    for (const [period, index] of [
      ["2025Q1", 0],
      ["2025Q4", 3],
    ] as const) {
      const observation = await diagnosticStage(id, `hover ${tableName} ${period}`, async () => {
        await chart.scrollIntoViewIfNeeded({ timeout: 5_000 });
        await chart
          .locator(".recharts-xAxis-tick-labels text")
          .filter({ hasText: "2025Q1" })
          .first()
          .waitFor({ state: "visible", timeout: 5_000 });
        await chart.locator(".recharts-bar-rectangle").nth(index).hover({ timeout: 5_000 });
        const tooltip = chart
          .locator('.recharts-tooltip-wrapper:visible [data-custom-tooltip="true"]:visible')
          .last();
        await tooltip.waitFor({ state: "visible", timeout: 5_000 });
        const text = await tooltip.innerText({ timeout: 5_000 });
        const firstParagraph = await tooltip.locator("p").first().innerText({ timeout: 5_000 });
        const calculatedTotalVisible = await tooltip
          .locator('[data-tooltip-total="true"]:visible')
          .evaluateAll((rows) =>
            rows.some((row) => row.firstElementChild?.textContent?.trim() === "合計"),
          );
        const measurementNoteCount = await tooltip
          .locator('[data-tooltip-measurement-note="true"]')
          .count();
        const cpiProvenanceCount = await tooltip
          .locator('[data-tooltip-cpi-provenance="true"]')
          .count();
        const realTotalRow = tooltip.locator(
          '[data-tooltip-row="true"][data-tooltip-key="CTIミクロ調整系列（総合・実質）"]',
        );
        const realTotalVisible =
          (await realTotalRow.count()) > 0 && (await realTotalRow.isVisible());
        const realTotalValue = realTotalVisible
          ? await realTotalRow.evaluate(
              (row) =>
                Array.from(row.querySelectorAll(":scope > span")).at(-1)?.textContent?.trim() ?? "",
            )
          : "";
        const realTotalCpiSeries = realTotalVisible
          ? await realTotalRow.getAttribute("data-tooltip-cpi-series")
          : null;
        const realTotalBaseYear = realTotalVisible
          ? await realTotalRow.getAttribute("data-tooltip-base-year")
          : null;
        const realTotalCpiPeriod = realTotalVisible
          ? await realTotalRow.getAttribute("data-tooltip-cpi-period")
          : null;
        const realTotalCpiAggregation = realTotalVisible
          ? await realTotalRow.getAttribute("data-tooltip-cpi-aggregation")
          : null;
        const realTotalNominalSource = realTotalVisible
          ? await realTotalRow.getAttribute("data-tooltip-nominal-source")
          : null;
        const tableValue = await table
          .locator("tbody tr")
          .filter({ hasText: period })
          .locator("td")
          .nth(foodColumnIndex)
          .evaluate(
            (cell) =>
              [...cell.childNodes]
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.textContent?.trim() ?? "")
                .join(""),
            undefined,
            { timeout: 5_000 },
          );
        const realTotalColumnIndex = snapshot.headers.indexOf("CTIミクロ総合（実質・CPI調整）");
        const realTotalTableValue =
          realTotalColumnIndex >= 0
            ? await table
                .locator("tbody tr")
                .filter({ hasText: period })
                .locator("td")
                .nth(realTotalColumnIndex)
                .evaluate(
                  (cell) =>
                    [...cell.childNodes]
                      .filter((node) => node.nodeType === Node.TEXT_NODE)
                      .map((node) => node.textContent?.trim() ?? "")
                      .join(""),
                  undefined,
                  { timeout: 5_000 },
                )
            : "";
        return {
          period,
          text,
          firstParagraph,
          visible: await tooltip.isVisible(),
          calculatedTotalVisible,
          tableValue,
          realTotalVisible,
          realTotalValue,
          realTotalTableValue,
          realTotalCpiSeries,
          realTotalBaseYear,
          realTotalCpiPeriod,
          realTotalCpiAggregation,
          realTotalNominalSource,
          measurementNoteCount,
          cpiProvenanceCount,
        };
      });
      tooltips.push(observation);
    }
    tables.push({
      selector,
      ctiLabel: publicHeader,
      snapshot,
      periodLabels,
      supportIndex,
      quarterValues,
      csv,
      publicColumnIndex,
      foodColumnIndex,
      foodQuarterRows,
      tooltips,
    });
  }
  return { nominalText, realText, realLegendBefore, charts, tables };
}

export const inspectPhase6B06: BrowserCommand<[id: Phase6B06Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  const mobile = id.includes("plan27-private-consumption");
  const options = mobile
    ? buildContextOptions(devices["Pixel 7"])
    : desktop1280x720ContextOptions();
  return withIsolatedContext(browser, options, async (isolated) => {
    const page = await isolated.newPage();
    await page.addInitScript(() => {
      (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
    });
    if (id.startsWith("p45-b-plan27-private-consumption-")) {
      const contextEvidence = mobile
        ? await (async () => {
            const runtimeEvidence = await page.evaluate(() => ({
              innerViewport: { width: innerWidth, height: innerHeight },
              screen: { width: screen.width, height: screen.height },
              deviceScaleFactor: devicePixelRatio,
              touchPoints: navigator.maxTouchPoints,
              userAgent: navigator.userAgent,
            }));
            return { effectiveViewport: page.viewportSize(), ...runtimeEvidence };
          })()
        : null;
      return { contextEvidence, ...(await nominalPlan27(page, id.includes("-9-plan27-"))) };
    }
    if (id === "p45-b-plan40-nominal-stacked-total-range-dom-contract")
      return nominalStackedTotalRange(page);
    return await quarterlyGdp(page);
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase6B06: (id: Phase6B06Id) => Promise<unknown>;
  }
}
