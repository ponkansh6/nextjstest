import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";
import {
  buildContextOptions,
  desktop1280x800ContextOptions,
  withIsolatedContext,
} from "./isolated-route-context";
import { CONSUMPTION_TOTAL_12MA_KEY } from "../../src/lib/chartConstants";

export type Phase5RenderingId =
  | "p45-a-a11y-cagr-trigger-default"
  | "p45-a-a11y-cagr-trigger-dark"
  | "p45-a-a11y-real-legend-header-default"
  | "p45-a-a11y-real-legend-header-dark"
  | "p45-a-advanced-series-adv-query"
  | "p45-a-parity-advanced-anchors"
  | "p45-a-parity-hidden-series"
  | "p45-a-parity-section-cpi-major"
  | "p45-a-parity-section-earnings"
  | "p45-a-parity-section-new-graph"
  | "p45-a-parity-section-residual"
  | "p45-a-parity-section-stacked"
  | "p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real"
  | "p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi"
  | "p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-";

type ProbeOutcome = "observed" | "product-or-contract-mismatch" | "probe-error-unclassified";
export interface Phase5RenderingObservation {
  id: Phase5RenderingId;
  outcome: ProbeOutcome;
  expected: Record<string, unknown>;
  observations?: Record<string, unknown>;
  error?: string;
}

type SectionContract = {
  section: string;
  table: string;
  keys: readonly string[];
  source: string;
};

const PARITY_SECTIONS: Readonly<Record<string, SectionContract>> = {
  "p45-a-parity-section-cpi-major": {
    section: "section-cpi-major",
    table: "data-table-section-cpi-major",
    source: "chart-table-csv-parity.e2e.spec.ts:294",
    keys: [
      "総合",
      "生鮮食品を除く総合",
      "生鮮食品及びエネルギーを除く総合",
      "食料（酒類を除く）及びエネルギーを除く総合",
    ],
  },
  "p45-a-parity-section-earnings": {
    section: "section-earnings",
    table: "data-table-section-earnings",
    source: "chart-table-csv-parity.e2e.spec.ts:294",
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
    section: "section-new-graph",
    table: "data-table-section-new-graph",
    source: "chart-table-csv-parity.e2e.spec.ts:294",
    keys: ["CPI総合(12MA)", "総合(12MA)", CONSUMPTION_TOTAL_12MA_KEY],
  },
  "p45-a-parity-section-residual": {
    section: "section-residual",
    table: "data-table-section-residual",
    source: "chart-table-csv-parity.e2e.spec.ts:294",
    keys: ["残差"],
  },
  "p45-a-parity-section-stacked": {
    section: "section-stacked",
    table: "data-table-section-stacked",
    source: "chart-table-csv-parity.e2e.spec.ts:294",
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

const COMPARISON_SERIES = ["CPI総合(12MA)", "総合(12MA)", CONSUMPTION_TOTAL_12MA_KEY];
const MONTH_2025_01 = /2025[-年/]0?1/;

async function route(page: import("@playwright/test").Page, pathname: string) {
  const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}${pathname}`);
  const heading = page.getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" });
  const headingFound = await heading
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForLoadState("networkidle");
  const networkIdle = true;
  return { status: response?.status() ?? null, url: page.url(), headingFound, networkIdle };
}

async function chartSnapshot(page: import("@playwright/test").Page, sectionId: string) {
  const section = page.locator(`#${sectionId}`);
  await section.scrollIntoViewIfNeeded().catch(() => undefined);
  const contract = section.getByTestId("chart-data-contract");
  await contract.waitFor({ state: "attached", timeout: 10_000 }).catch(() => undefined);
  const seriesAttribute = await contract.getAttribute("data-series").catch(() => null);
  let declaredSeriesKeys: string[] = [];
  try {
    const parsed: unknown = JSON.parse(seriesAttribute ?? "[]");
    if (Array.isArray(parsed))
      declaredSeriesKeys = parsed.filter((value): value is string => typeof value === "string");
  } catch {
    declaredSeriesKeys =
      seriesAttribute
        ?.split(",")
        .map((key) => key.trim())
        .filter(Boolean) ?? [];
  }
  return {
    sectionFound: (await section.count()) > 0,
    chartFound: (await section.locator(".recharts-wrapper").count()) > 0,
    chartVisible: await section
      .locator(".recharts-wrapper")
      .first()
      .isVisible()
      .catch(() => false),
    contractFound: (await contract.count()) > 0,
    series: seriesAttribute,
    declaredSeriesKeys,
    declaredSeriesCount: declaredSeriesKeys.length,
    rows: await contract
      .locator("[data-chart-data-row]")
      .evaluateAll((rows) =>
        rows.map((row) => ({
          period: row.getAttribute("data-period"),
          values: [...row.querySelectorAll<HTMLElement>("[data-series-key]")].map((cell) => ({
            key: cell.getAttribute("data-series-key"),
            value: cell.getAttribute("data-value"),
            type: cell.getAttribute("data-value-type"),
            status: cell.getAttribute("data-status"),
            reason: cell.getAttribute("data-reason"),
          })),
        })),
      )
      .catch(() => []),
    visibleSeriesGeometry: await section
      .locator("svg [class*='recharts-line'], svg [class*='recharts-area']")
      .evaluateAll((items) =>
        items.map((item) => ({
          className: item.getAttribute("class"),
          display: getComputedStyle(item).display,
          visibility: getComputedStyle(item).visibility,
          d: item.getAttribute("d"),
        })),
      )
      .catch(() => []),
  };
}

async function tableSnapshot(page: import("@playwright/test").Page, tableId: string) {
  const tableSection = page.getByTestId(tableId);
  const summary = tableSection.locator("summary");
  if (await summary.count()) {
    const expanded = await summary
      .evaluate((el) => el.parentElement?.hasAttribute("open") ?? false)
      .catch(() => false);
    if (!expanded) await summary.click().catch(() => undefined);
  }
  const headers: string[] = await tableSection
    .locator("thead th")
    .allTextContents()
    .catch((): string[] => []);
  return {
    found: (await tableSection.count()) > 0,
    summaryText: await summary.textContent().catch(() => null),
    headers,
    rows: await tableSection
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((row) =>
          [...row.querySelectorAll("td")].map((cell) => {
            const valueCell = cell.cloneNode(true) as HTMLElement;
            valueCell.querySelector("[data-measurement-metadata]")?.remove();
            return valueCell.textContent?.replace(/\s+/g, " ").trim() ?? "";
          }),
        ),
      )
      .catch(() => []),
  };
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function installCsvCapture(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const host = window as Window & {
      __phase5Csv?: Promise<{ text: string; bytes: number[] }> | null;
    };
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value: Blob | MediaSource) => {
      if (value instanceof Blob)
        host.__phase5Csv = value.arrayBuffer().then((buffer) => ({
          text: new TextDecoder().decode(buffer),
          bytes: [...new Uint8Array(buffer)],
        }));
      return original(value);
    };
  });
}

async function captureCsv(page: import("@playwright/test").Page, tableId: string) {
  await page.evaluate(() => {
    (window as Window & { __phase5Csv?: unknown }).__phase5Csv = null;
  });
  const button = page.getByTestId(tableId).getByRole("button", { name: /CSVでダウンロード/ });
  const buttonFound = (await button.count()) > 0;
  if (!buttonFound) return { buttonFound, captured: false, csv: null, rows: [] as string[][] };
  await button.click();
  await page
    .waitForFunction(
      () => Boolean((window as Window & { __phase5Csv?: unknown }).__phase5Csv),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  const csv = await page.evaluate(async () => {
    const promise = (
      window as Window & { __phase5Csv?: Promise<{ text: string; bytes: number[] }> | null }
    ).__phase5Csv;
    return promise ? await promise : null;
  });
  return { buttonFound, captured: csv !== null, csv, rows: csv ? parseCsvText(csv.text) : [] };
}

async function contrast(page: import("@playwright/test").Page, target: "cagr" | "real-header") {
  const section =
    target === "cagr"
      ? page.locator("#section-stacked")
      : page.locator("#section-consumption-real");
  await section.scrollIntoViewIfNeeded();
  const locator =
    target === "cagr"
      ? section.getByRole("button", { name: /年率上昇率（CAGR）を計算/ })
      : section.locator("summary").first();
  if (target === "cagr") await locator.waitFor({ state: "visible", timeout: 5_000 });
  const selector =
    target === "cagr"
      ? {
          section: "#section-stacked",
          role: "button",
          accessibleName: "/年率上昇率（CAGR）を計算/",
        }
      : { section: "#section-consumption-real", element: "summary", occurrence: 1 };
  const found = (await locator.count()) > 0;
  const visible = found && (await locator.isVisible());
  const observation = found
    ? await locator
        .evaluate((el) => {
          const style = getComputedStyle(el);
          const parse = (value: string) => value.match(/[\d.]+/g)?.map(Number) ?? [];
          const luminance = (r: number, g: number, b: number) =>
            [r, g, b]
              .map((component) => {
                const srgb = component / 255;
                return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
          const foreground = parse(style.color);
          const background = parse(style.backgroundColor);
          let [br, bg, bb, alpha = 1] = background;
          if (alpha < 1) {
            let parent = el.parentElement;
            while (parent) {
              const parentBg = parse(getComputedStyle(parent).backgroundColor);
              if ((parentBg[3] ?? 1) >= 1) {
                br = Math.round(br! * alpha + parentBg[0]! * (1 - alpha));
                bg = Math.round(bg! * alpha + parentBg[1]! * (1 - alpha));
                bb = Math.round(bb! * alpha + parentBg[2]! * (1 - alpha));
                break;
              }
              parent = parent.parentElement;
            }
          }
          const first = luminance(foreground[0]!, foreground[1]!, foreground[2]!);
          const second = luminance(br!, bg!, bb!);
          const computedContrastRatio =
            (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
          const box = el.getBoundingClientRect();
          return {
            found: true,
            visible:
              el.getBoundingClientRect().width > 0 &&
              el.getBoundingClientRect().height > 0 &&
              style.visibility !== "hidden" &&
              style.display !== "none",
            tag: el.tagName,
            text: el.textContent?.trim() ?? "",
            foreground: style.color,
            background: style.backgroundColor,
            computedContrastRatio,
            colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
            boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
          };
        })
        .catch((error: unknown) => ({ found: false, error: String(error) }))
    : { found: false };
  return { target: { ...selector, found, visible }, observation };
}

function result(
  id: Phase5RenderingId,
  expected: Record<string, unknown>,
  observations: Record<string, unknown>,
  mismatch: boolean,
  unclassified = false,
): Phase5RenderingObservation {
  return {
    id,
    expected,
    observations: {
      probeSetup: {
        lazyMountOverride: true,
        mechanism: "window.__MOUNT_ALL__ = true via addInitScript before navigation",
        sourcePrecedent: [
          "src/app/components/LazyMount.tsx:6-16",
          "tests/e2e/fixtures.ts:5-17",
          "tests/e2e/accessibility.e2e.spec.ts:19-24",
        ],
        sectionMountAction: "scrollIntoViewIfNeeded before chart contract read",
      },
      ...observations,
    },
    outcome: unclassified
      ? "probe-error-unclassified"
      : mismatch
        ? "product-or-contract-mismatch"
        : "observed",
  };
}

async function execute(
  id: Phase5RenderingId,
  page: import("@playwright/test").Page,
): Promise<Phase5RenderingObservation> {
  if (id.startsWith("p45-a-a11y-")) {
    const dark = id.endsWith("-dark");
    const isCagr = id.includes("cagr-trigger");
    await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
    const routeResult = await route(page, "/");
    const observation = await contrast(page, isCagr ? "cagr" : "real-header");
    const style = observation.observation as {
      found?: boolean;
      colorScheme?: string;
      computedContrastRatio?: number;
    };
    const expected = {
      source: isCagr ? "accessibility.e2e.spec.ts:81" : "accessibility.e2e.spec.ts:103",
      targetSelector: isCagr
        ? "#section-stacked button[name~='年率上昇率（CAGR）を計算']"
        : "#section-consumption-real summary:first",
      colorScheme: dark ? "dark" : "light/default",
      minimumContrastRatio: 4.5,
    };
    const target = observation.target as { found?: boolean; visible?: boolean };
    return result(
      id,
      expected,
      { route: routeResult, ...observation },
      routeResult.status !== 200 ||
        !routeResult.headingFound ||
        !target.found ||
        !target.visible ||
        !style.found ||
        style.colorScheme !== (dark ? "dark" : "light") ||
        (style.computedContrastRatio ?? 0) < 4.5,
    );
  }

  if (id === "p45-a-advanced-series-adv-query" || id === "p45-a-parity-advanced-anchors") {
    const routeResult = await route(page, "/?adv=1");
    const chart = await chartSnapshot(page, "section-new-graph");
    const table = await tableSnapshot(page, "data-table-section-new-graph");
    const csv = await captureCsv(page, "data-table-section-new-graph");
    const response = await page.reload({ waitUntil: "domcontentloaded" });
    const reloadIdle = await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const reloadedChart = await chartSnapshot(page, "section-new-graph");
    const requiredAnchors = ["物価指数(総合)", "給与(総合)", CONSUMPTION_TOTAL_12MA_KEY];
    const expected = {
      source:
        id === "p45-a-advanced-series-adv-query"
          ? "advanced-series.e2e.spec.ts:29"
          : "chart-table-csv-parity.e2e.spec.ts:324",
      route: "/?adv=1",
      requiredSeries: COMPARISON_SERIES,
      expectedAdvancedSeriesCount: 3,
      requiredTableAnchors: requiredAnchors,
      requiredDownload: true,
    };
    const keySet = (candidate: typeof chart) =>
      COMPARISON_SERIES.every((key) => candidate.declaredSeriesKeys.includes(key)) &&
      candidate.declaredSeriesCount === 3;
    const mismatch =
      routeResult.status !== 200 ||
      !chart.contractFound ||
      !keySet(chart) ||
      !keySet(reloadedChart) ||
      !requiredAnchors.every((anchor) => table.headers.some((header) => header.includes(anchor))) ||
      new URL(page.url()).search !== "?adv=1";
    return result(
      id,
      expected,
      {
        route: routeResult,
        queryPreservedOnReload: new URL(page.url()).search === "?adv=1",
        reloadStatus: response?.status() ?? null,
        reloadNetworkIdle: reloadIdle,
        chart,
        reloadedChart,
        table,
        csv,
      },
      mismatch,
      !csv.captured,
    );
  }

  if (id in PARITY_SECTIONS) {
    const contract = PARITY_SECTIONS[id]!;
    const routeResult = await route(page, "/");
    const chart = await chartSnapshot(page, contract.section);
    const table = await tableSnapshot(page, contract.table);
    const csv = await captureCsv(page, contract.table);
    const chartMonthRow = chart.rows.find((row) => MONTH_2025_01.test(String(row.period))) ?? null;
    const tableMonthRow =
      table.rows.find((row) => row.some((value) => MONTH_2025_01.test(value))) ?? null;
    const csvMonthRow =
      csv.rows.slice(1).find((row) => row.some((value) => MONTH_2025_01.test(value))) ?? null;
    const normaliseValue = (value: string) => value.replace(/\s+/g, " ").trim() || "-";
    const chartValues = chartMonthRow
      ? contract.keys.map((key) => {
          const cell = chartMonthRow.values.find((value) => value.key === key);
          return cell?.type === "number" && cell.value !== null
            ? Number(cell.value).toFixed(2)
            : "-";
        })
      : [];
    const tableValues = tableMonthRow?.slice(1).map(normaliseValue) ?? [];
    const csvValues = csvMonthRow?.slice(1, table.headers.length).map(normaliseValue) ?? [];
    const parityChecks = {
      chartValues,
      tableValues,
      csvValues,
      chartTableMatch: JSON.stringify(chartValues) === JSON.stringify(tableValues),
      tableCsvMatch: JSON.stringify(tableValues) === JSON.stringify(csvValues),
    };
    const expected = {
      source: contract.source,
      route: "/",
      chartSelector: `#${contract.section} .recharts-wrapper`,
      tableSelector: `[data-testid='${contract.table}']`,
      requiredSeries: contract.keys,
      requiredSeriesCount: contract.keys.length,
      expectedDataMonth: "2025-01 / 2025年1月",
      csvBytes: true,
    };
    const mismatch =
      routeResult.status !== 200 ||
      !chart.chartFound ||
      !chart.contractFound ||
      contract.keys.length !== chart.declaredSeriesCount ||
      !contract.keys.every((key) => chart.declaredSeriesKeys.includes(key)) ||
      !table.found ||
      table.headers.length !== contract.keys.length + 1 ||
      !chartMonthRow ||
      !tableMonthRow ||
      !csvMonthRow ||
      !parityChecks.chartTableMatch ||
      !parityChecks.tableCsvMatch;
    return result(
      id,
      expected,
      {
        route: routeResult,
        chart,
        table,
        csv,
        parityObservation: { chartMonthRow, tableMonthRow, csvMonthRow },
        parityChecks,
      },
      mismatch,
      !csv.captured,
    );
  }

  if (id === "p45-a-parity-hidden-series") {
    const routeResult = await route(page, "/");
    const beforeChart = await chartSnapshot(page, "section-stacked");
    const beforeTable = await tableSnapshot(page, "data-table-section-stacked");
    const beforeCsv = await captureCsv(page, "data-table-section-stacked");
    const legend = page.getByTestId("legend-住居");
    const action: { found: boolean; pressedBefore: string | null; pressedAfter?: string | null } = {
      found: (await legend.count()) > 0,
      pressedBefore: await legend.getAttribute("aria-pressed").catch(() => null),
    };
    if (action.found) await legend.click();
    action.pressedAfter = await legend.getAttribute("aria-pressed").catch(() => null);
    const afterChart = await chartSnapshot(page, "section-stacked");
    const afterTable = await tableSnapshot(page, "data-table-section-stacked");
    const afterCsv = await captureCsv(page, "data-table-section-stacked");
    const geometryChanged =
      JSON.stringify(beforeChart.visibleSeriesGeometry) !==
      JSON.stringify(afterChart.visibleSeriesGeometry);
    const expected = {
      source: "chart-table-csv-parity.e2e.spec.ts:374",
      route: "/",
      actionSelector: "[data-testid='legend-住居']",
      action: "aria-pressed true -> false",
      invariant: "chart data/table/CSV unchanged; SVG geometry changes",
    };
    const mismatch =
      routeResult.status !== 200 ||
      !action.found ||
      action.pressedBefore !== "true" ||
      action.pressedAfter !== "false" ||
      JSON.stringify(beforeChart.rows) !== JSON.stringify(afterChart.rows) ||
      JSON.stringify(beforeTable.rows) !== JSON.stringify(afterTable.rows) ||
      JSON.stringify(beforeCsv.csv?.bytes) !== JSON.stringify(afterCsv.csv?.bytes) ||
      !geometryChanged;
    return result(
      id,
      expected,
      {
        route: routeResult,
        action,
        geometryChanged,
        beforeChart,
        afterChart,
        beforeTable,
        afterTable,
        beforeCsv,
        afterCsv,
      },
      mismatch,
      !beforeCsv.captured || !afterCsv.captured,
    );
  }

  if (
    id ===
      "p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real" ||
    id ===
      "p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi"
  ) {
    const routeResult = await route(page, "/");
    const nominalChart = await chartSnapshot(page, "section-consumption-nominal");
    const nominalBarLocator = page
      .getByTestId("spending-chart-nominal")
      .locator(".recharts-bar")
      .first()
      .locator(".recharts-bar-rectangle");
    const nominalBarGeometry = await nominalBarLocator
      .evaluateAll((rectangles) =>
        rectangles.map((rectangle) => {
          const box = rectangle.getBoundingClientRect();
          const style = getComputedStyle(rectangle);
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            fill: style.fill,
            positiveBox: box.width > 0 && box.height > 0,
          };
        }),
      )
      .catch(() => []);
    const nominalBars = nominalBarGeometry.length;
    const positiveNominalBars = nominalBarGeometry.filter((bar) => bar.positiveBox).length;
    const realChart = await chartSnapshot(page, "section-consumption-real");
    const nominalTable = await tableSnapshot(page, "data-table-section-consumption-nominal");
    const realTable = await tableSnapshot(page, "data-table-section-consumption-real");
    const context = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      screen: { width: screen.width, height: screen.height },
      deviceScaleFactor: devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
      isMobile: matchMedia("(pointer: coarse)").matches,
    }));
    const full = id.includes("-9-plan27-");
    let postBoundaryEvidence: Array<{
      period: string | null;
      nominalValue: string | null;
      status: string | null;
      reason: string | null;
      hasStackedValue: boolean;
    }> = [];
    let nominalCsv: Awaited<ReturnType<typeof captureCsv>> | null = null;
    let periods: string[] = [];
    let realTableHeaders: string[] = [];
    let csvExpectedPayload = false;
    let latestAvailableRealPeriod: string | null = null;
    let rowsAfterLatestCpi: typeof postBoundaryEvidence = [];
    if (full) {
      const contractRows = page
        .getByTestId("spending-chart-real")
        .locator('[data-testid="chart-data-contract"] [data-chart-data-row]');
      postBoundaryEvidence = await contractRows.evaluateAll(
        (rows, seriesKey) =>
          rows
            .filter((row) => (row.getAttribute("data-period") ?? "") >= "2018Q1")
            .map((row) => {
              const realTotal = row.querySelector(`[data-series-key="${seriesKey}"]`);
              const stackedValues = [...row.querySelectorAll<HTMLElement>("[data-series-key]")]
                .filter((cell) => cell.getAttribute("data-series-key") !== seriesKey)
                .map((cell) => cell.getAttribute("data-value") ?? "null");
              return {
                period: row.getAttribute("data-period"),
                nominalValue: realTotal?.getAttribute("data-value") ?? null,
                status: realTotal?.getAttribute("data-status") ?? null,
                reason: realTotal?.getAttribute("data-reason") ?? null,
                hasStackedValue: stackedValues.some((value) => value !== "null"),
              };
            }),
        "CTIミクロ調整系列（総合・実質）",
      );
      periods = nominalTable.rows
        .map((row) => row[0] ?? "")
        .filter((period) => /^200[5-9]Q[1-4]$|^201[0-7]Q[1-4]$/.test(period));
      realTableHeaders = realTable.headers;
      nominalCsv = await captureCsv(page, "data-table-section-consumption-nominal");
      const csvText = nominalCsv.csv?.text ?? "";
      csvExpectedPayload =
        csvText.includes("CTIミクロ調整系列（食料）") &&
        !csvText.includes("CTIミクロ（名目・四半期平均）") &&
        !/CTIミクロ基本系列（名目・(?:原数値|参考|参考・延長)）/.test(csvText) &&
        !/GDP/.test(csvText);
      const availableRealRows = postBoundaryEvidence.filter(
        (row) => row.status === "available" && row.nominalValue !== "null",
      );
      latestAvailableRealPeriod = availableRealRows.at(-1)?.period ?? null;
      rowsAfterLatestCpi = latestAvailableRealPeriod
        ? postBoundaryEvidence.filter(
            (row) => row.period !== null && row.period > latestAvailableRealPeriod!,
          )
        : [];
    }
    const expected = {
      source: full
        ? "plan27-private-consumption.e2e.spec.ts:9"
        : "plan27-private-consumption.e2e.spec.ts:79",
      route: "/",
      deviceProject: "mobile-pixel",
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      touchPointsRequired: true,
      nominalSelector: "[data-testid='spending-chart-nominal']",
      realSelector: "[data-testid='spending-chart-real']",
      nominalSeries: "CTIミクロ調整系列（食料）",
      nominalLabel: "CTIミクロ調整系列（食料）",
      expectedPeriodRange: "2005Q1-2017Q4",
      expectedQuarterCount: full ? 52 : undefined,
      fullOnly: full
        ? {
            post2018: "2018Q1 newly available; rows after latest covered CPI quarter unavailable",
            barSelector:
              "[data-testid='spending-chart-nominal'] .recharts-bar:first .recharts-bar-rectangle",
            barCount: "1..52",
            positiveBoundingBoxCount: ">0",
            tableRows: 52,
            rejectHeaders: ["wage CTI", "GDP"],
            csvIncludes: "canonical nominal expense key",
            csvExcludes: ["wage CTI", "GDP"],
          }
        : undefined,
      keyOnly: full
        ? undefined
        : {
            realChartVisible: true,
            realTableMustInclude: "CTIミクロ総合（実質・CPI調整）",
            realTableMustExclude: "民間最終消費支出（実質）",
          },
    };
    const commonMismatch =
      routeResult.status !== 200 ||
      !nominalChart.chartFound ||
      !realChart.chartFound ||
      !realChart.chartVisible;
    const fullMismatch =
      full &&
      (!nominalChart.declaredSeriesKeys.includes("CTIミクロ調整系列（食料）") ||
        nominalTable.headers.filter((header) => header.startsWith("CTIミクロ調整系列（")).length !==
          10 ||
        nominalTable.headers.includes("CTIミクロ調整系列（総合・名目）") ||
        /CTIミクロ基本系列（名目・(?:原数値|参考|参考・延長)）|GDP/.test(
          nominalTable.headers.join(" "),
        ) ||
        periods.length !== 52 ||
        nominalBars <= 0 ||
        nominalBars > 52 ||
        positiveNominalBars <= 0 ||
        !realChart.declaredSeriesKeys.includes("CTIミクロ調整系列（総合・実質）") ||
        realChart.declaredSeriesKeys.includes("民間最終消費支出（実質）") ||
        !realTable.headers.includes("CTIミクロ総合（実質・CPI調整）") ||
        realTable.headers.includes("民間最終消費支出（実質）") ||
        postBoundaryEvidence.length === 0 ||
        latestAvailableRealPeriod === null ||
        !postBoundaryEvidence.some(
          (row) =>
            row.period === "2018Q1" &&
            row.nominalValue !== "null" &&
            row.status === "available" &&
            row.hasStackedValue,
        ) ||
        !postBoundaryEvidence.some((row) => row.status === "available") ||
        !rowsAfterLatestCpi.every(
          (row) =>
            row.nominalValue === "null" && row.status === "unavailable" && Boolean(row.reason),
        ) ||
        !csvExpectedPayload);
    const keyMismatch =
      !full &&
      (!realTable.headers.join(" ").includes("CTIミクロ総合（実質・CPI調整）") ||
        realTable.headers.join(" ").includes("民間最終消費支出（実質）"));
    return result(
      id,
      expected,
      {
        route: routeResult,
        context,
        nominalChart,
        realChart,
        nominalTable,
        realTable,
        ...(full
          ? {
              nominalBars,
              positiveNominalBars,
              nominalBarGeometry,
              postBoundaryEvidence,
              periods2005to2017: periods,
              csvPayloadChecks: {
                expectedLabelPresent: (nominalCsv?.csv?.text ?? "").includes(
                  "CTIミクロ調整系列（食料）",
                ),
                retiredNominalSupportAbsent: !(nominalCsv?.csv?.text ?? "").includes(
                  "CTIミクロ（名目・四半期平均）",
                ),
                retiredWageSeriesAbsent:
                  !/CTIミクロ基本系列（名目・(?:原数値|参考|参考・延長)）/.test(
                    nominalCsv?.csv?.text ?? "",
                  ),
                gdpAbsent: !/GDP/.test(nominalCsv?.csv?.text ?? ""),
                csv: nominalCsv,
              },
            }
          : { realTableHeaders }),
      },
      commonMismatch || fullMismatch || keyMismatch,
      context.touchPoints < 1 || (full && !nominalCsv?.captured),
    );
  }

  const routeResult = await route(page, "/");
  const shell = await page.evaluate(() => ({
    readyState: document.readyState,
    heading: document.querySelector("h1")?.textContent?.trim() ?? null,
    loadingText: [...document.querySelectorAll("body *")].some(
      (node) => /読み込み中|Loading/i.test(node.textContent ?? "") && node.children.length === 0,
    ),
    nextFlightScriptCount: [...document.scripts].filter((script) =>
      script.textContent?.includes("quarterlyRealData"),
    ).length,
    nextFlightPushScripts: [...document.scripts]
      .filter((script) => script.textContent?.includes("__next_f.push"))
      .map((script) => ({
        chars: script.textContent?.length ?? 0,
        hasQuarterlyData: script.textContent?.includes("quarterlyRealData") ?? false,
      })),
    resourceUrls: performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("_rsc") || name.includes("flight")),
  }));
  const nominal = await chartSnapshot(page, "section-consumption-nominal");
  const real = await chartSnapshot(page, "section-consumption-real");
  const publicSeriesCount = [nominal, real].reduce(
    (count, chart) =>
      count +
      chart.declaredSeriesKeys.filter(
        (key) => key === "CTIミクロ調整系列（食料）" || key === "CTIミクロ調整系列（総合・実質）",
      ).length,
    0,
  );
  const expected = {
    source: "quarterly-gdp.e2e.spec.ts:26",
    route: "/",
    shellSelector: "production dashboard h1",
    requiredNominalSeries: "CTIミクロ調整系列（食料）",
    requiredNominalSeriesCount: 10,
    requiredRealSeries: "CTIミクロ調整系列（総合・実質）",
    expectedPublicSeriesCount: 2,
    forbiddenSeries:
      "GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数|四半期raw|原値|比較指数",
  };
  const mismatch =
    routeResult.status !== 200 ||
    !routeResult.headingFound ||
    shell.readyState !== "complete" ||
    shell.loadingText ||
    !nominal.chartFound ||
    !real.chartFound ||
    !nominal.declaredSeriesKeys.includes("CTIミクロ調整系列（食料）") ||
    nominal.declaredSeriesKeys.filter((key) => key.startsWith("CTIミクロ調整系列（")).length !==
      10 ||
    nominal.declaredSeriesKeys.includes("CTIミクロ調整系列（総合・名目）") ||
    !real.declaredSeriesKeys.includes("CTIミクロ調整系列（総合・実質）") ||
    real.declaredSeriesKeys.includes("民間最終消費支出（実質）") ||
    publicSeriesCount !== 2 ||
    /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数|四半期raw|原値|比較指数/.test(
      `${nominal.series} ${real.series}`,
    );
  return result(
    id,
    expected,
    { route: routeResult, shell, nominal, real, publicSeriesCount },
    mismatch,
  );
}

export const inspectPhase5Rendering: BrowserCommand<
  [id: Phase5RenderingId],
  Phase5RenderingObservation
> = async ({ context, provider }, id) => {
  if (provider.name !== "playwright")
    return {
      id,
      outcome: "probe-error-unclassified",
      expected: {},
      error: `Requires Playwright provider; received ${provider.name}`,
    };
  const browser = context.browser();
  if (!browser)
    return {
      id,
      outcome: "probe-error-unclassified",
      expected: {},
      error: "Playwright Browser is unavailable",
    };
  const dark = id.endsWith("-dark");
  const mobileViewport = id.includes("plan27-private-consumption");
  const options = buildContextOptions(
    mobileViewport
      ? {
          viewport: { width: 412, height: 915 },
          screen: { width: 412, height: 915 },
          deviceScaleFactor: 2.625,
          isMobile: true,
          hasTouch: true,
          userAgent:
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        }
      : desktop1280x800ContextOptions(),
    dark ? { colorScheme: "dark" } : {},
  );
  return withIsolatedContext(browser, options, async (isolated) => {
    const page = await isolated.newPage();
    try {
      if (!id.startsWith("p45-a-a11y-cagr-trigger-")) {
        await page.addInitScript(() => {
          (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
        });
      }
      await installCsvCapture(page);
      return await execute(id, page);
    } catch (error) {
      return {
        id,
        outcome: "probe-error-unclassified",
        expected: {},
        observations: {
          probeSetup: { lazyMountOverride: true, sourcePrecedent: "tests/e2e/fixtures.ts" },
        },
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
  });
};

declare module "vitest/browser" {
  interface BrowserCommands {
    inspectPhase5Rendering: (id: Phase5RenderingId) => Promise<Phase5RenderingObservation>;
  }
}
