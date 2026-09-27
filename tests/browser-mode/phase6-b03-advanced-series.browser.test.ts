import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Phase6B03Id } from "./phase6-b03.route.command";

const INTERNAL = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数|四半期raw|原値|比較指数/;
const LEGACY_CTI_RAW = /CTIミクロ基本系列（名目・原数値）/;
const ADVANCED_KEYS = [
  "CPI総合(12MA)",
  "総合(12MA)",
  "CTI消費支出（参考）",
  "CTIミクロ基本系列（名目・参考）",
  "CTIミクロ基本系列（名目・参考・延長）",
];

function assertCompleteSurface(surface: {
  headers: string[];
  values: string[][];
  csv: { text: string; rows: string[][] };
}) {
  expect(surface.headers.length).toBeGreaterThan(1);
  expect(surface.values.length).toBeGreaterThan(2);
  expect(surface.headers.every((value) => value !== "")).toBe(true);
  expect(
    surface.values.every(
      (row) => row.length === surface.headers.length && row.every((value) => value !== ""),
    ),
  ).toBe(true);
  expect(
    surface.csv.rows.some(
      (row) => row.every((value) => value === "") || row.some((value) => value === ""),
    ),
  ).toBe(false);
  expect(surface.csv.rows).toHaveLength(surface.values.length + 1);
  expect(surface.csv.rows.every((row) => row.length >= surface.headers.length)).toBe(true);
  expect(surface.csv.rows[0]?.slice(0, surface.headers.length)).toEqual(surface.headers);
  expect(surface.csv.rows.slice(1).map((row) => row.slice(0, surface.headers.length))).toEqual(
    surface.values,
  );
  assertCsvDownloadCRLF(surface.csv.text);
}

function assertCsvDownloadCRLF(text: string) {
  const endings = [...text.matchAll(/\r\n|\r|\n/g)].map(([ending]) => ending);
  expect(endings.length).toBeGreaterThan(0);
  expect(new Set(endings)).toEqual(new Set(["\r\n"]));
}

function chartMatrix(chart: {
  rows: Array<{ period: string; values: Array<{ value: string; type: string }> }>;
}) {
  return chart.rows.map((row) => [
    row.period,
    ...row.values.map((cell) => (cell.type === "number" ? Number(cell.value).toFixed(2) : "-")),
  ]);
}

function assertPublicContract(
  chart: Parameters<typeof chartMatrix>[0],
  surface: { headers: string[]; values: string[][]; csv: { rows: string[][] } },
) {
  expect(chartMatrix(chart)).toEqual(surface.values.map((row) => [row[0], ...row.slice(1)]));
  expect(JSON.stringify(chart)).not.toMatch(INTERNAL);
  expect(surface.headers.join(" ")).not.toMatch(INTERNAL);
  expect(surface.values.flat().join(" ")).not.toMatch(INTERNAL);
  expect(surface.csv.rows.flat().join(" ")).not.toMatch(INTERNAL);
}

it("p45-a-advanced-series-adv-query preserves the original advanced-query assertions", async () => {
  const result = (await commands.inspectPhase6B03("p45-a-advanced-series-adv-query")) as {
    sectionCount: number;
    descriptorAttribute: string | null;
    dataAttribute: string | null;
    buttonVisible: boolean;
    tableText: string;
    tableCount: number;
  };
  expect(result.sectionCount).toBe(1);
  expect(result.descriptorAttribute ?? "").toContain("CTIミクロ基本系列（名目・参考）");
  expect(result.dataAttribute ?? "").toContain("CTI消費支出（参考）");
  expect(result.dataAttribute ?? "").toContain("CTIミクロ基本系列（名目・参考・延長）");
  expect(result.buttonVisible).toBe(true);
  expect(result.tableText).toContain("CTIミクロ基本系列(名目・延長)");
  expect(result.tableText).toContain("CTI消費支出(参考)");
  expect(result.tableCount).toBe(1);
});

it("p45-a-parity-advanced-anchors preserves complete regular and advanced chart/table/CSV parity", async () => {
  const result = (await commands.inspectPhase6B03("p45-a-parity-advanced-anchors")) as {
    normalStatus: number | null;
    advancedStatus: number | null;
    normalChart: {
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
    advancedChart: {
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
    normal: {
      count: number;
      headers: string[];
      values: string[][];
      csv: { text: string; rows: string[][] };
    };
    advanced: {
      count: number;
      headers: string[];
      values: string[][];
      csv: { text: string; rows: string[][] };
    };
  };
  for (const contract of [result.normalChart, result.advancedChart]) {
    expect(contract.sectionCount).toBe(1);
    expect(contract.rootCount).toBe(1);
    expect(contract.wrapperCount).toBe(1);
    expect(contract.wrapperVisible).toBe(true);
    expect(contract.svgVisible).toBe(true);
    expect(contract.contractCount).toBe(1);
    expect(contract.geometryCount).toBeGreaterThan(0);
    expect(contract.rows.length).toBeGreaterThan(0);
  }
  expect(result.normal.count).toBe(1);
  assertCsvDownloadCRLF(result.normal.csv.text);
  assertCompleteSurface(result.advanced);
  expect(result.advanced.count).toBe(1);
  assertPublicContract(result.normalChart, result.normal);
  assertPublicContract(result.advancedChart, result.advanced);
  expect(result.advanced.headers.slice(0, result.normal.headers.length)).toEqual(
    result.normal.headers,
  );
  expect(result.advanced.headers).toContain("CTIミクロ基本系列(名目・延長)");
  expect(result.advanced.values).toHaveLength(result.normal.values.length);
  expect(result.advanced.values.map((row) => row[0])).toEqual(
    result.normal.values.map((row) => row[0]),
  );
  const commonCsvIndexes = result.normal.csv.rows[0]!.map((header) =>
    result.advanced.csv.rows[0]!.indexOf(header),
  );
  expect(commonCsvIndexes.every((index) => index >= 0)).toBe(true);
  expect(
    result.advanced.csv.rows.map((row) => commonCsvIndexes.map((index) => row[index])),
  ).toEqual(result.normal.csv.rows);
  const extensionIndex = result.advanced.csv.rows[0]!.indexOf("CTIミクロ基本系列(名目・延長)");
  expect(extensionIndex).toBeGreaterThanOrEqual(0);
  expect(result.advanced.csv.rows.slice(1).every((row) => row[extensionIndex] !== undefined)).toBe(
    true,
  );
  expect(result.advancedChart.keys).toEqual(ADVANCED_KEYS);
  expect(result.advanced.headers.join(" ")).not.toMatch(LEGACY_CTI_RAW);
});

it("p45-a-parity-hidden-series preserves chart, table, and CSV data when a legend series is hidden", async () => {
  const result = (await commands.inspectPhase6B03("p45-a-parity-hidden-series")) as {
    sectionCount: number;
    rootCount: number;
    rootVisible: boolean;
    svgVisible: boolean;
    beforeChart: {
      keys: string[];
      rows: Array<{ period: string; values: Array<{ key: string; value: string; type: string }> }>;
    };
    afterChart: {
      keys: string[];
      rows: Array<{ period: string; values: Array<{ key: string; value: string; type: string }> }>;
    };
    before: {
      count: number;
      headers: string[];
      values: string[][];
      csv: { text: string; rows: string[][] };
    };
    after: {
      count: number;
      headers: string[];
      values: string[][];
      csv: { text: string; rows: string[][] };
    };
  };
  expect(result.sectionCount).toBe(1);
  expect(result.rootCount).toBe(1);
  expect(result.rootVisible).toBe(true);
  expect(result.svgVisible).toBe(true);
  assertCompleteSurface(result.before);
  expect(result.before.count).toBe(1);
  assertCsvDownloadCRLF(result.after.csv.text);
  assertCompleteSurface(result.after);
  assertPublicContract(result.beforeChart, result.before);
  assertPublicContract(result.afterChart, result.after);
  expect(result.afterChart.keys).toEqual(result.beforeChart.keys);
  expect(result.afterChart.rows).toEqual(result.beforeChart.rows);
  expect(result.after.headers).toEqual(result.before.headers);
  expect(result.after.values).toEqual(result.before.values);
  expect(result.after.csv.rows).toEqual([result.before.headers, ...result.before.values]);
});
