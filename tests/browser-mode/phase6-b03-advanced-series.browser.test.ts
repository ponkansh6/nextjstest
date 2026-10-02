import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";

vi.setConfig({ testTimeout: 45_000 });

const INTERNAL = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数|四半期raw|原値|比較指数/;
const LEGACY_CTI_RAW = /CTIミクロ基本系列（名目・原数値）/;
const ADVANCED_KEYS = ["CPI総合(12MA)", "総合(12MA)", "消費(総合)"];

function assertConsumptionDescriptor(attribute: string | null) {
  const descriptors = JSON.parse(attribute ?? "[]") as Array<{
    key: string;
    label?: string;
    frequency?: string;
    aggregation?: string;
    baseYear?: number;
  }>;
  expect(descriptors.find(({ key }) => key === "消費(総合)")).toMatchObject({
    key: "消費(総合)",
    label: "消費(総合)",
    frequency: "monthly",
    aggregation: "strict_12_month_moving_average_rebased_to_2025_monthly_average",
    baseYear: 2025,
  });
}

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

it("p45-a-advanced-series-adv-query keeps removed CTI comparisons out of the advanced route", async () => {
  const result = (await commands.inspectPhase6B03("p45-a-advanced-series-adv-query")) as {
    status: number | null;
    urlAfterReload: string;
    sectionCount: number;
    descriptorAttribute: string | null;
    dataAttribute: string | null;
    buttonVisible: boolean;
    tableText: string;
    tableCount: number;
    reloadedChart: { keys: string[] };
    reloadedDescriptorAttribute: string | null;
    reloadedDataAttribute: string | null;
  };
  expect(new URL(result.urlAfterReload).search).toBe("?adv=1");
  expect(result.sectionCount).toBe(1);
  expect(result.status).toBe(200);
  assertConsumptionDescriptor(result.descriptorAttribute);
  expect(JSON.parse(result.dataAttribute ?? "[]")).toEqual(ADVANCED_KEYS);
  expect(result.buttonVisible).toBe(false);
  expect(result.tableText).toContain("消費(総合)");
  expect(result.tableText).not.toMatch(/CTI消費支出|CTIミクロ基本系列/);
  expect(result.tableCount).toBe(1);
  expect(result.reloadedChart.keys).toEqual(ADVANCED_KEYS);
  assertConsumptionDescriptor(result.reloadedDescriptorAttribute);
  expect(JSON.parse(result.reloadedDataAttribute ?? "[]")).toEqual(ADVANCED_KEYS);
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
    urlAfterAdvancedReload: string;
    reloadedAdvancedChart: { keys: string[] };
    reloadedAdvanced: { headers: string[]; values: string[][] };
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
  expect(new URL(result.urlAfterAdvancedReload).search).toBe("?adv=1");
  expect(result.reloadedAdvancedChart.keys).toEqual(ADVANCED_KEYS);
  expect(result.reloadedAdvanced.headers).toEqual(result.normal.headers);
  expect(result.reloadedAdvanced.values).toEqual(result.normal.values);
  expect(result.advanced.count).toBe(1);
  assertPublicContract(result.normalChart, result.normal);
  assertPublicContract(result.advancedChart, result.advanced);
  expect(result.advanced.headers.slice(0, result.normal.headers.length)).toEqual(
    result.normal.headers,
  );
  expect(result.advanced.headers).toEqual(result.normal.headers);
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
  expect(result.advancedChart.keys).toEqual(ADVANCED_KEYS);
  expect(result.advanced.headers.join(" ")).not.toMatch(/CTI消費支出|CTIミクロ基本系列/);
  expect(result.advanced.csv.rows.flat().join(" ")).not.toMatch(LEGACY_CTI_RAW);
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
    ariaPressedBefore: string | null;
    ariaPressedAfter: string | null;
    geometryChanged: boolean;
  };
  expect(result.sectionCount).toBe(1);
  expect(result.rootCount).toBe(1);
  expect(result.rootVisible).toBe(true);
  expect(result.svgVisible).toBe(true);
  expect(result.ariaPressedBefore).toBe("true");
  expect(result.ariaPressedAfter).toBe("false");
  expect(result.geometryChanged).toBe(true);
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
