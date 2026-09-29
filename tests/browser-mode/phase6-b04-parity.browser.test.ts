import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import type { Phase6B04Id } from "./phase6-b04.route.command";

vi.setConfig({ testTimeout: 45_000 });

const INTERNAL = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数|四半期raw|原値|比較指数/;
const CONTRACTS: Array<{ id: Phase6B04Id; keys: string[] }> = [
  {
    id: "p45-a-parity-section-cpi-major",
    keys: [
      "総合",
      "生鮮食品を除く総合",
      "生鮮食品及びエネルギーを除く総合",
      "食料（酒類を除く）及びエネルギーを除く総合",
    ],
  },
  {
    id: "p45-a-parity-section-earnings",
    keys: [
      "所定内給与",
      "所定外給与",
      "特別給与",
      "時間当たり給与",
      "15歳以上国民当たり給与",
      "CPI総合(参考)",
    ],
  },
  {
    id: "p45-a-parity-section-new-graph",
    keys: ["CPI総合(12MA)", "総合(12MA)", "CTI消費支出（参考）", "CTIミクロ基本系列（名目・参考）"],
  },
];

type Result = {
  id: Phase6B04Id;
  route: string;
  chart: {
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
  surface: {
    count: number;
    tableText: string;
    headers: string[];
    values: string[][];
    csv: { text: string; rows: string[][] };
  };
};

function assertCompleteSurface(surface: Result["surface"]) {
  expect(surface.count).toBe(1);
  expect(surface.headers.length).toBeGreaterThan(1);
  expect(surface.values.length).toBeGreaterThan(2);
  expect(surface.headers.every((cell) => cell !== "")).toBe(true);
  expect(
    surface.values.every(
      (row) => row.length === surface.headers.length && row.every((cell) => cell !== ""),
    ),
  ).toBe(true);
  expect(surface.csv.rows.some((row) => row.length === 0 || row.some((cell) => cell === ""))).toBe(
    false,
  );
  expect(surface.csv.rows).toHaveLength(surface.values.length + 1);
  expect(surface.csv.rows.every((row) => row.length >= surface.headers.length)).toBe(true);
  expect(surface.csv.rows[0]?.slice(0, surface.headers.length)).toEqual(surface.headers);
  expect(surface.csv.rows.slice(1).map((row) => row.slice(0, surface.headers.length))).toEqual(
    surface.values,
  );
  const endings = [...surface.csv.text.matchAll(/\r\n|\r|\n/g)].map(([ending]) => ending);
  expect(endings.length).toBeGreaterThan(0);
  expect(new Set(endings)).toEqual(new Set(["\r\n"]));
}

function assertGenericTypedMetadata(csv: string[][], displayWidth: number) {
  const headers = csv[0] ?? [];
  const keys = headers
    .filter((header) => header.endsWith("__valueType"))
    .map((header) => header.slice(0, -"__valueType".length));
  if (keys.length === 0) return;
  const expected = keys.flatMap((key) => [
    `${key}__label`,
    `${key}__valueType`,
    `${key}__value`,
    `${key}__unit`,
    `${key}__source`,
    `${key}__frequency`,
    `${key}__aggregation`,
    `${key}__status`,
    `${key}__reason`,
  ]);
  expect(headers.slice(displayWidth)).toEqual(expected);
  expect(csv.every((row) => row.length === displayWidth + expected.length)).toBe(true);
  for (const row of csv.slice(1)) {
    for (let index = 0; index < keys.length; index += 1) {
      const offset = displayWidth + index * 9;
      expect(row[offset + 1]).toMatch(/^(raw|comparison|-|valid)$/);
      expect(row[offset + 7]).toMatch(/^(valid|invalid)$/);
      if (row[offset + 7] === "invalid") expect(row[offset + 8]).not.toBe("-");
    }
  }
}

function chartMatrix(chart: Result["chart"]) {
  return chart.rows.map((row) => [
    row.period,
    ...row.values.map((cell) => (cell.type === "number" ? Number(cell.value).toFixed(2) : "-")),
  ]);
}

for (const spec of CONTRACTS) {
  it(`${spec.id} preserves full monthly chart, table, and CSV parity`, async () => {
    const result = (await commands.inspectPhase6B04(spec.id)) as Result;
    expect(result.route).toBe("/");
    const { chart, surface } = result;
    expect(chart.sectionCount).toBe(1);
    expect(chart.rootCount).toBe(1);
    expect(chart.wrapperCount).toBe(1);
    expect(chart.wrapperVisible).toBe(true);
    expect(chart.svgCount).toBe(1);
    expect(chart.svgVisible).toBe(true);
    expect(chart.contractCount).toBe(1);
    expect(chart.rows.length).toBeGreaterThan(0);
    expect(chart.geometryCount).toBeGreaterThan(0);
    expect(chart.keys).toEqual(spec.keys);
    expect(chart.points).toBe(chart.rows.length);

    assertCompleteSurface(surface);
    assertGenericTypedMetadata(surface.csv.rows, surface.headers.length);
    expect(chartMatrix(chart)).toEqual(surface.values.map((row) => [row[0], ...row.slice(1)]));
    expect(surface.values.map((row) => row[0])).toContain("2025年1月");
    expect(surface.headers.slice(1)).toHaveLength(spec.keys.length);
    expect(JSON.stringify(chart)).not.toMatch(INTERNAL);
    expect(surface.tableText).not.toMatch(INTERNAL);
    expect(surface.csv.rows.flat().join(" ")).not.toMatch(INTERNAL);
  });
}
