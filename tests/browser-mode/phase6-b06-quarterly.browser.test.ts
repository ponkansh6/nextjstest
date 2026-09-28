import { beforeEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import expected from "../fixtures/plan27-private-consumption.json";
import type { Phase6B06Id } from "./phase6-b06.route.command";

vi.setConfig({ testTimeout: 60_000 });

beforeEach(async () => {
  await page.viewport(1280, 720);
});

const KEY_ONLY: Phase6B06Id =
  "p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real";
const PLAN27_FULL: Phase6B06Id =
  "p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi";
const QUARTERLY_GDP: Phase6B06Id =
  "p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-";
const RETIRED_WAGE_CTI = /CTIミクロ基本系列（名目・(?:原数値|参考|参考・延長)）/;
const INTERNAL_SERIES = /GDP名目原値|GDP名目比較指数|GDP実質原値|GDP実質比較指数/;

// Stable source ID: p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real
it("B06 Plan27 ID 79: real CTI key boundary", async () => {
  const result = (await commands.inspectPhase6B06(KEY_ONLY)) as {
    contextEvidence: {
      effectiveViewport: { width: number; height: number } | null;
      innerViewport: { width: number; height: number };
      screen: { width: number; height: number };
      deviceScaleFactor: number;
      touchPoints: number;
      userAgent: string;
    };
    realHeaders: string[];
  };
  expect(result.contextEvidence.effectiveViewport).toEqual({ width: 412, height: 839 });
  expect(result.contextEvidence.screen).toEqual({ width: 412, height: 915 });
  expect(result.contextEvidence.deviceScaleFactor).toBe(2.625);
  expect(result.contextEvidence.touchPoints).toBeGreaterThan(0);
  expect(result.contextEvidence.userAgent).toContain("Pixel 7");
  expect(result.realHeaders.join(" ")).not.toContain(expected.label);
});

// Stable source ID: p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi
it("B06 Plan27 ID 9: 52-quarter table and CSV", async () => {
  const result = (await commands.inspectPhase6B06(PLAN27_FULL)) as {
    contextEvidence: {
      effectiveViewport: { width: number; height: number } | null;
      innerViewport: { width: number; height: number };
      screen: { width: number; height: number };
      deviceScaleFactor: number;
      touchPoints: number;
      userAgent: string;
    };
    postBoundary: Array<{
      period: string;
      value: string;
      status: string;
      reason: string;
      hasStackedValue: boolean;
    }>;
    realHeaders: string[];
    barCount: number;
    positiveBarCount: number;
    snapshot: { headers: string[]; rows: string[][] };
    periods: string[];
    csv: { text: string; rows: string[][]; artifactPath: string };
  };
  expect(result.contextEvidence.effectiveViewport).toEqual({ width: 412, height: 839 });
  expect(result.contextEvidence.screen).toEqual({ width: 412, height: 915 });
  expect(result.contextEvidence.deviceScaleFactor).toBe(2.625);
  expect(result.contextEvidence.touchPoints).toBeGreaterThan(0);
  expect(result.contextEvidence.userAgent).toContain("Pixel 7");
  expect(result.postBoundary.length).toBeGreaterThan(0);
  expect(result.postBoundary.every((row) => row.value === "null")).toBe(true);
  expect(result.postBoundary.every((row) => row.status === "invalid")).toBe(true);
  expect(result.postBoundary.every((row) => row.reason === "unavailable")).toBe(true);
  expect(result.postBoundary.every((row) => row.hasStackedValue)).toBe(true);
  expect(result.barCount).toBeGreaterThan(0);
  expect(result.positiveBarCount).toBeGreaterThan(0);
  expect(result.barCount).toBeLessThanOrEqual(expected.quarterCount);
  expect(result.periods).toHaveLength(expected.quarterCount);
  expect(result.snapshot.headers.join(" ")).toContain(expected.label);
  expect(result.snapshot.headers.join(" ")).not.toMatch(RETIRED_WAGE_CTI);
  expect(result.snapshot.headers.join(" ")).not.toMatch(/GDP/);
  expect(result.csv.text).toContain(expected.label);
  expect(result.csv.text).not.toMatch(RETIRED_WAGE_CTI);
  expect(result.csv.text).not.toMatch(/GDP/);
  expect(result.csv.artifactPath).toContain("test-results");
});

// Stable source ID: p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-
it("B06 Plan23 ID 26: quarterly public data", async () => {
  const result = (await commands.inspectPhase6B06(QUARTERLY_GDP)) as {
    nominalText: string;
    realText: string;
    realLegendBefore: string;
    charts: Array<{ keys: string[]; rowKeys: string[]; publicKey: string }>;
    tables: Array<{
      selector: string;
      ctiLabel: string;
      snapshot: { headers: string[]; rows: string[][] };
      periodLabels: string[];
      supportIndex: number;
      quarterValues: Array<{
        period: string;
        tableValue: string;
        csvValue: string;
        metadata: string;
      }>;
      csv: { text: string; rows: string[][]; artifactPath: string };
      publicColumnIndex: number;
      foodColumnIndex: number;
      foodQuarterRows: Array<{ period: string; value: string | undefined }>;
      tooltips: Array<{
        period: string;
        text: string;
        firstParagraph: string;
        visible: boolean;
        totalVisible: boolean;
        tableValue: string;
      }>;
    }>;
  };
  expect(result.nominalText).toMatch(/消費支出（名目）/);
  expect(result.realText).toMatch(/消費支出（実質）/);
  expect(result.realLegendBefore).toContain("費目・四半期を変更");
  expect(result.realLegendBefore).toMatch(/費目 \d+\/\d+・四半期 \d+\/\d+/);
  expect(result.realLegendBefore).toContain("全選択");
  expect(result.nominalText).not.toMatch(INTERNAL_SERIES);
  expect(result.realText).not.toMatch(INTERNAL_SERIES);
  expect(result.charts).toHaveLength(2);
  expect(result.charts[0]?.keys).toContain("CTIミクロ四半期系列（名目）");
  expect(result.charts[0]?.rowKeys).toContain("CTIミクロ四半期系列（名目）");
  expect(result.charts[1]?.keys).toContain("民間最終消費支出（実質）");
  expect(result.charts[1]?.rowKeys).toContain("民間最終消費支出（実質）");
  for (const chart of result.charts) {
    expect(chart.keys).not.toContain(expect.stringMatching(INTERNAL_SERIES));
    expect(chart.rowKeys).not.toContain(expect.stringMatching(INTERNAL_SERIES));
    expect(chart.keys).not.toContain(expect.stringMatching(/GDP/));
    expect(chart.rowKeys).not.toContain(expect.stringMatching(/GDP/));
  }

  expect(result.tables).toHaveLength(2);
  for (const table of result.tables) {
    expect(table.snapshot.rows).toHaveLength(table.periodLabels.length);
    expect(table.periodLabels.length).toBeGreaterThan(0);
    expect(table.snapshot.headers.filter((header) => header.includes(table.ctiLabel))).toHaveLength(
      1,
    );
    expect(table.snapshot.headers.some((header) => header.includes("GDP"))).toBe(false);
    expect(table.snapshot.headers.some((header) => INTERNAL_SERIES.test(header))).toBe(false);
    expect(table.snapshot.rows.flat().join(" ")).toContain("2025Q4");
    expect(table.supportIndex).toBeGreaterThanOrEqual(0);
    for (const sample of table.quarterValues) {
      expect(table.snapshot.rows.some((row) => row[0]?.trim() === sample.period)).toBe(true);
      if (/^[—-]$/.test(sample.tableValue)) {
        expect(sample.csvValue).toBe("");
        if (table.ctiLabel === "CTIミクロ（名目・四半期平均）") {
          expect(sample.metadata).toContain("単位: -");
          expect(sample.metadata).toContain("出典: -");
          expect(sample.metadata).toContain("頻度: quarterly");
          expect(sample.metadata).toContain("状態: invalid");
          expect(sample.metadata).toContain("理由: unavailable");
        }
      } else {
        expect(sample.csvValue).toBe(sample.tableValue);
      }
    }
    expect(table.snapshot.headers.some((header) => header.includes("GDP"))).toBe(false);
    expect(table.snapshot.rows.flat().join(" ")).toContain("2025Q4");
    expect(table.csv.text).not.toMatch(INTERNAL_SERIES);
    expect(table.csv.text).toContain("食料");
    expect(table.csv.rows[0]?.some((header) => header.includes(table.ctiLabel))).toBe(true);
    expect(table.publicColumnIndex).toBeGreaterThanOrEqual(0);
    expect(table.csv.rows[0]?.[table.publicColumnIndex]).toContain(table.ctiLabel);
    expect(table.csv.rows[0]?.some((header) => header.includes("GDP"))).toBe(false);
    expect(table.foodColumnIndex).toBeGreaterThanOrEqual(0);
    for (const row of table.foodQuarterRows) {
      expect(Number.isFinite(Number(row.value))).toBe(true);
      expect(Number(row.value)).not.toBe(0);
    }
    for (const tooltip of table.tooltips) {
      expect(tooltip.visible).toBe(true);
      expect(tooltip.totalVisible).toBe(true);
      expect(tooltip.text).toContain("食料");
      expect(tooltip.text).toContain("合計");
      expect(tooltip.firstParagraph).toBe(tooltip.period);
      expect(tooltip.text).toContain(tooltip.tableValue);
      expect(tooltip.text).not.toMatch(INTERNAL_SERIES);
      expect(tooltip.text).not.toContain("GDP");
    }
  }
});
