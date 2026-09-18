import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";

type Section = {
  id: string;
  tableId: string;
  chartName: string;
  keys: readonly string[];
  period: string;
};

// Independent public-contract fixture: fixed values come from the checked-in
// official snapshots and regression fixtures, never from app constants or DOM.
const CONTRACT: readonly Section[] = [
  {
    id: "section-cpi-major",
    tableId: "data-table-section-cpi-major",
    chartName: "消費者物価指数 主要指数の推移グラフ",
    period: "2025年1月",
    keys: [
      "総合",
      "生鮮食品を除く総合",
      "生鮮食品及びエネルギーを除く総合",
      "食料（酒類を除く）及びエネルギーを除く総合",
    ],
  },
  {
    id: "section-stacked",
    tableId: "data-table-section-stacked",
    chartName: "物価指数 費目別寄与度の積み上げグラフ",
    period: "2025年1月",
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
  {
    id: "section-earnings",
    tableId: "data-table-section-earnings",
    chartName: "給与指標と関連指標の推移グラフ",
    period: "2025年1月",
    keys: [
      "所定内給与",
      "所定外給与",
      "特別給与",
      "時間当たり給与",
      "15歳以上国民当たり給与",
      "CPI総合(参考)",
      "CTIミクロ基本系列（名目・原数値）",
    ],
  },
  {
    id: "section-residual",
    tableId: "data-table-section-residual",
    chartName: "給与と物価の差（実質賃金相当）の推移グラフ",
    period: "2025年1月",
    keys: ["残差"],
  },
  {
    id: "section-new-graph",
    tableId: "data-table-section-new-graph",
    chartName: "給与・消費・物価の推移比較（12MA）グラフ",
    period: "2025年1月",
    keys: ["CPI総合(12MA)", "総合(12MA)", "CTIミクロ基本系列（名目・参考）"],
  },
];
const INTERNAL = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数|四半期raw|原値|比較指数/;
const ADVANCED = {
  key: "CTIミクロ基本系列（名目・参考・延長）",
  header: "CTIミクロ基本系列(名目・延長)",
} as const;
const CTI_RAW_KEY = "CTIミクロ基本系列（名目・原数値）";

async function fixedAdvancedAnchors() {
  const source = await readFile(
    "data/source/official-cti-2025-long-term/000040499070.normalized.csv",
    "utf8",
  );
  const rows = source
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","));
  const values = new Map(
    rows
      .filter((row) => row[0] === "nominal" && row[1] === "1")
      .map((row) => [row[4], +row[5]] as const),
  );
  const ma = (month: string) => {
    const [year, monthNumber] = month.split("-").map(Number);
    return (
      Array.from({ length: 12 }, (_, offset) => {
        const date = new Date(Date.UTC(year, monthNumber - 1 - offset, 1));
        return values.get(
          `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
        )!;
      }).reduce((sum, value) => sum + value, 0) / 12
    );
  };
  const baseline =
    Array.from({ length: 12 }, (_, index) =>
      ma(`2025-${String(index + 1).padStart(2, "0")}`),
    ).reduce((sum, value) => sum + value, 0) / 12;
  const anchors = ["2018-01", "2025-12"].map((month) => ({
    month: (() => {
      const [year, monthNumber] = month.split("-");
      return `${year}年${Number(monthNumber)}月`;
    })(),
    knownNormalized: (ma(month) / baseline) * 100,
  }));
  expect(anchors.map(({ month }) => month)).toEqual(["2018年1月", "2025年12月"]);
  expect(anchors[0].knownNormalized).toBeCloseTo(93.97529477821448, 10);
  expect(anchors[1].knownNormalized).toBeCloseTo(101.07523862998316, 10);
  return anchors;
}

function parseCsv(input: string): string[][] {
  const source = input.replace(/^\uFEFF/, "");
  if (!source.endsWith("\r\n")) throw new Error("CSV must end with CRLF");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    afterQuote = false;
  const pushRow = () => {
    if (row.length === 0 && cell === "") throw new Error("CSV contains an empty row");
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
    afterQuote = false;
  };
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else if (c === "\r") {
        if (source[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        cell += "\r\n";
        i += 1;
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else cell += c;
    } else if (afterQuote) {
      if (c === ",") {
        row.push(cell);
        cell = "";
        afterQuote = false;
      } else if (c === "\r") {
        if (source[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        i += 1;
        pushRow();
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else throw new Error(`invalid CSV character after closing quote: ${c}`);
    } else if (c === '"') {
      if (cell !== "") throw new Error("quote in an unquoted CSV field");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r") {
      if (source[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
      i += 1;
      pushRow();
    } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
    else cell += c;
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (rows.some((r) => r.length === 0 || r.every((v) => v === "")))
    throw new Error("extra empty row");
  const columns = rows[0]?.length ?? 0;
  if (columns === 0 || rows.some((r) => r.length !== columns))
    throw new Error("CSV column count mismatch");
  return rows;
}

const normaliseCell = (value: string, dataCell: boolean) => {
  const clean = value.replace(/\s+/g, " ").trim();
  return dataCell && clean === "" ? "-" : clean;
};
const normalise = (rows: string[][], dataRows = false) =>
  rows.map((r, ri) => r.map((v) => normaliseCell(v, dataRows && ri > 0)));

async function tableSnapshot(table: import("@playwright/test").Locator) {
  const htmlTable = table.getByRole("table");
  const raw = await htmlTable.evaluate((node) => ({
    headers: [...node.querySelectorAll("thead th")].map((cell) => cell.textContent ?? ""),
    values: [...node.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? ""),
    ),
  }));
  const headers = normalise([raw.headers])[0];
  const values = raw.values;
  // The same display normalizer is applied to table and CSV. A blank data
  // cell is therefore the explicit missing-value marker "-", never an
  // accepted empty cell in either surface.
  const normalisedValues = normalise(values, true);
  if (headers.some((h) => h === "") || normalisedValues.some((r) => r.some((v) => v === ""))) {
    throw new Error("table contains an empty header or cell");
  }
  if (normalisedValues.some((r) => r.length !== headers.length))
    throw new Error("table column count mismatch");
  return {
    headers,
    values: normalisedValues,
    nonEmptyCounts: headers
      .slice(1)
      .map((_, i) => normalisedValues.filter((r) => r[i + 1] !== "-").length),
  };
}

async function openTable(page: import("@playwright/test").Page, tableId: string) {
  const table = page.getByTestId(tableId);
  await expect(table).toHaveCount(1);
  await table.getByTestId(`data-table-toggle-${tableId.replace("data-table-", "")}`).click();
  await expect(table.getByRole("table")).toBeVisible();
  return table;
}

async function csvSnapshot(table: import("@playwright/test").Locator) {
  const downloadPromise = table.page().waitForEvent("download");
  await table.getByRole("button", { name: /CSVでダウンロード/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const source = await readFile(path!, "utf8");
  const endings = [...source.matchAll(/\r\n|\r|\n/g)].map(([ending]) => ending);
  expect(endings.length).toBeGreaterThan(0);
  expect(new Set(endings)).toEqual(new Set(["\r\n"]));
  return normalise(parseCsv(source), true);
}

async function assertTableCsv(table: import("@playwright/test").Locator) {
  const snapshot = await tableSnapshot(table);
  const csv = await csvSnapshot(table);
  expect(snapshot.headers.length).toBeGreaterThan(1);
  expect(snapshot.values.length).toBeGreaterThan(2);
  expect(
    snapshot.values.every((r) => r.length === snapshot.headers.length && r.every((v) => v !== "")),
  ).toBe(true);
  expect(
    csv.some((r) => r.length === 0 || r.every((v) => v === "") || r.some((v) => v === "")),
  ).toBe(false);
  expect(csv.length).toBe(snapshot.values.length + 1);
  expect(csv.every((r) => r.length >= snapshot.headers.length)).toBe(true);
  expect(csv[0].slice(0, snapshot.headers.length)).toEqual(snapshot.headers);
  expect(csv.slice(1).map((row) => row.slice(0, snapshot.headers.length))).toEqual(snapshot.values);
  return { ...snapshot, csv };
}

function chartMatrix(contract: Awaited<ReturnType<typeof chartContractSnapshot>>) {
  return contract.rows.map((row) => [
    row.period,
    ...row.values.map((cell) => (cell.type === "number" ? Number(cell.value).toFixed(2) : "-")),
  ]);
}

async function assertPublicContract(
  root: import("@playwright/test").Locator,
  table: import("@playwright/test").Locator,
  snapshot: Awaited<ReturnType<typeof tableSnapshot>>,
  csv: string[][],
) {
  const contract = await chartContractSnapshot(root);
  expect(chartMatrix(contract)).toEqual(snapshot.values.map((row) => [row[0], ...row.slice(1)]));
  expect(JSON.stringify(contract)).not.toMatch(INTERNAL);
  expect(await table.innerText()).not.toMatch(INTERNAL);
  expect(csv.flat().join(" ")).not.toMatch(INTERNAL);
  return contract;
}

async function chartContractSnapshot(root: import("@playwright/test").Locator) {
  const contract = root.locator('[data-testid="chart-data-contract"]');
  await expect(contract).toHaveCount(1);
  return contract.evaluate((node) => ({
    keys: JSON.parse(node.getAttribute("data-series") ?? "[]") as string[],
    descriptors: JSON.parse(node.getAttribute("data-descriptors") ?? "[]") as Array<{
      key: string;
      unit?: string;
      source?: string;
      valueType?: string;
      status?: string;
      reason?: string | null;
    }>,
    points: Number(node.getAttribute("data-points")),
    rows: [...node.querySelectorAll("[data-chart-data-row]")].map((row) => ({
      period: row.getAttribute("data-period") ?? "",
      values: [...row.querySelectorAll("[data-series-key]")].map((cell) => ({
        key: cell.getAttribute("data-series-key") ?? "",
        value: cell.getAttribute("data-value") ?? "null",
        type: cell.getAttribute("data-value-type") ?? "null",
      })),
    })),
  }));
}

function assertTypedCsvMetadata(
  csv: string[][],
  snapshot: Awaited<ReturnType<typeof tableSnapshot>>,
  contract: Awaited<ReturnType<typeof chartContractSnapshot>>,
) {
  const metadataKeys = csv[0]
    .filter((header) => header.endsWith("__valueType"))
    .map((header) => header.slice(0, -"__valueType".length));
  if (metadataKeys.length === 0) return;

  const expectedMetadataHeaders = metadataKeys.flatMap((key) => [
    `${key}__valueType`,
    `${key}__value`,
    `${key}__unit`,
    `${key}__source`,
    `${key}__status`,
    `${key}__reason`,
  ]);
  expect(csv[0].slice(snapshot.headers.length)).toEqual(expectedMetadataHeaders);
  expect(
    csv.every((row) => row.length === snapshot.headers.length + expectedMetadataHeaders.length),
  ).toBe(true);

  const typed = contract.descriptors.find(({ key }) => key === CTI_RAW_KEY);
  expect(typed).toEqual(
    expect.objectContaining({
      key: CTI_RAW_KEY,
      valueType: "raw",
      unit: "指数",
      status: "valid",
      reason: null,
    }),
  );
  const typedKeyOffset = expectedMetadataHeaders.indexOf(`${CTI_RAW_KEY}__valueType`);
  expect(typedKeyOffset).toBeGreaterThanOrEqual(0);
  const visibleValueIndex = snapshot.headers.indexOf(CTI_RAW_KEY);

  for (let rowIndex = 1; rowIndex < csv.length; rowIndex += 1) {
    const row = csv[rowIndex];
    for (let metadataIndex = 0; metadataIndex < metadataKeys.length; metadataIndex += 1) {
      const offset = snapshot.headers.length + metadataIndex * 6;
      expect(row[offset]).toMatch(/^(raw|comparison|-|valid)$/);
      expect(row[offset + 4]).toMatch(/^(valid|invalid)$/);
      if (row[offset + 4] === "invalid") expect(row[offset + 5]).not.toBe("-");
    }

    const offset = snapshot.headers.length + typedKeyOffset;
    const typedValue = row[offset + 1];
    const visibleValue = visibleValueIndex >= 0 ? row[visibleValueIndex] : undefined;
    const contractValue = contract.rows[rowIndex - 1].values.find(({ key }) => key === CTI_RAW_KEY);
    if (visibleValueIndex >= 0) expect(contractValue).toBeDefined();
    expect(row[offset]).toBe("raw");
    expect(row[offset + 2]).toBe("指数");
    expect(row[offset + 3]).toBe(typed?.source);
    expect(row[offset + 4]).toBe("valid");
    expect(row[offset + 5]).toBe("-");
    if (visibleValueIndex >= 0) {
      if (visibleValue === "-") {
        expect(typedValue).toBe("-");
        expect(contractValue?.type).toBe("null");
      } else {
        expect(Number(typedValue)).toBe(Number(contractValue?.value));
        expect(contractValue?.type).toBe("number");
      }
    }
  }
}

async function waitForChartRender(section: import("@playwright/test").Locator) {
  await expect(section).toBeVisible();
  const wrapper = section.locator(".recharts-wrapper").first();
  await expect(wrapper).toHaveCount(1);
  await expect(wrapper).toBeVisible();
  const surface = wrapper.locator("svg.recharts-surface");
  await expect(surface).toHaveCount(1);
  await expect(surface).toBeVisible();
  const contract = section.locator('[data-testid="chart-data-contract"]');
  await expect(contract).toHaveCount(1);
  await expect(contract.locator("[data-chart-data-row]")).not.toHaveCount(0);
  const allGeometry = surface.locator("path, line");
  await expect(allGeometry).not.toHaveCount(0);
}

test.describe("Phase 4-4 production chart/table/CSV parity", () => {
  test("monthly CTI/CPI/earnings sections expose complete real Recharts output", async ({
    page,
  }) => {
    await page.goto("/");
    for (const section of CONTRACT) {
      const sectionRoot = page.locator(`#${section.id}`);
      const root = sectionRoot.getByRole("img", { name: section.chartName, exact: true });
      await expect(root).toHaveCount(1);
      await expect(sectionRoot).toHaveCount(1);
      await waitForChartRender(sectionRoot);
      const table = await openTable(page, section.tableId);
      const snapshot = await assertTableCsv(table);
      const contract = await assertPublicContract(sectionRoot, table, snapshot, [
        snapshot.headers,
        ...snapshot.values,
      ]);
      assertTypedCsvMetadata(snapshot.csv, snapshot, contract);
      expect(contract.keys).toEqual(section.keys);
      expect(contract.points).toBe(contract.rows.length);
      expect(
        contract.rows.map((row) =>
          row.values.map((cell) => (cell.type === "number" ? Number(cell.value).toFixed(2) : "-")),
        ),
      ).toEqual(snapshot.values.map((row) => row.slice(1)));
      expect(snapshot.values.map((r) => r[0])).toContain(section.period);
      expect(snapshot.headers.slice(1)).toHaveLength(section.keys.length);
      await expect(root.locator("svg").first()).toBeVisible();
    }
  });

  test("adv=1 preserves full parity and exposes the independent advanced anchors", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForChartRender(page.locator("#section-new-graph"));
    const regularTable = await openTable(page, "data-table-section-new-graph");
    const regular = await tableSnapshot(regularTable);
    const regularCsv = await csvSnapshot(regularTable);
    await assertPublicContract(
      page.locator("#section-new-graph"),
      regularTable,
      regular,
      regularCsv,
    );
    const expectedAdvanced = await fixedAdvancedAnchors();
    await page.goto("/?adv=1");
    await waitForChartRender(page.locator("#section-new-graph"));
    const root = page.getByRole("img", {
      name: "給与・消費・物価の推移比較（12MA）グラフ",
      exact: true,
    });
    const sectionRoot = page.locator("#section-new-graph");
    const table = await openTable(page, "data-table-section-new-graph");
    const advanced = await assertTableCsv(table);
    const advancedCsv = await csvSnapshot(table);
    const advancedContract = await assertPublicContract(sectionRoot, table, advanced, advancedCsv);
    expect(advanced.headers).toContain(ADVANCED.header);
    expect(advanced.values.length).toBe(regular.values.length);
    expect(advanced.values.map((r) => r[0])).toEqual(regular.values.map((r) => r[0]));
    expect(advanced.headers.filter((h) => h !== ADVANCED.header)).toEqual(regular.headers);
    expect(
      advancedCsv.map((r) => r.filter((_, i) => i !== advanced.headers.indexOf(ADVANCED.header))),
    ).toEqual(regularCsv);
    const col = advanced.headers.indexOf(ADVANCED.header);
    // Full monthly row/column parity above is the contract; only the two
    // independent fixture anchors are value expectations here. Coverage and
    // branching for every period belong to advanced-series.e2e.spec.ts.
    const actualAdvanced = new Map(advanced.values.map((r) => [r[0], r[col]]));
    for (const { month, knownNormalized } of expectedAdvanced) {
      expect(actualAdvanced.get(month)).toBe(knownNormalized.toFixed(2));
    }
    expect(advancedContract.keys).toContain(ADVANCED.key);
  });

  test("CSV parser enforces CRLF-terminated RFC4180 records and rejects malformed CSV", () => {
    expect(() => parseCsv("a,b\na,b\n")).toThrow();
    expect(() => parseCsv("a,b\r\na,b")).toThrow();
    expect(() => parseCsv('a,b\r\n"unterminated,b\r\n')).toThrow();
    expect(() => parseCsv('a,b\r\n"bad"x,c\r\n')).toThrow();
    expect(() => parseCsv("a,b\r\na\r\n")).toThrow();
    expect(() => parseCsv("a,b\r\na,b\r\n\r\n")).toThrow();
  });

  test("hidden series changes only its SVG geometry; table and CSV remain identical", async ({
    page,
  }) => {
    await page.goto("/");
    const sectionRoot = page.locator("#section-stacked");
    const root = sectionRoot.getByRole("img", {
      name: "物価指数 費目別寄与度の積み上げグラフ",
      exact: true,
    });
    const table = await openTable(page, "data-table-section-stacked");
    const before = await assertTableCsv(table);
    const beforeContract = await chartContractSnapshot(sectionRoot);
    await assertPublicContract(sectionRoot, table, before, [before.headers, ...before.values]);
    await sectionRoot.getByTestId("legend-住居").click();
    const afterContract = await chartContractSnapshot(sectionRoot);
    expect(afterContract.keys).toEqual(beforeContract.keys);
    const after = await tableSnapshot(table);
    const afterCsv = await csvSnapshot(table);
    await assertPublicContract(sectionRoot, table, after, afterCsv);
    expect(after.headers).toEqual(before.headers);
    expect(after.values).toEqual(before.values);
    expect(afterContract.rows).toEqual(beforeContract.rows);
    await expect(root.locator("svg").first()).toBeVisible();
    expect(afterCsv).toEqual([before.headers, ...before.values]);
  });
});
