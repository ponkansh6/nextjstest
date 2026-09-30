import { expect, test, vi } from "vitest";
import { commands } from "vitest/browser";

vi.setConfig({ testTimeout: 45_000 });

test("Playwright Browser Mode custom command observes a production Next chart interaction", async () => {
  const observation = await commands.inspectProductionDashboard();
  const routeUrl = new URL(observation.url);

  expect(observation.responseStatus).toBe(200);
  expect(routeUrl.protocol).toBe("http:");
  expect(routeUrl.hostname).toBe("127.0.0.1");
  expect(routeUrl.port).toBe(String(observation.serverPort));
  expect(routeUrl.pathname).toBe("/");
  expect(observation.pageHeading).toContain("物価・賃金・消費の推移");
  expect(observation.firstDataPeriod).toBeTruthy();
  expect(observation.firstDataValueType).toBe("number");
  expect(Number.isFinite(Number(observation.firstDataValue))).toBe(true);
  expect(observation.chartAreaCountBefore).toBeGreaterThan(0);
  expect(observation.legendPressedBefore).toBe("true");
  expect(observation.legendPressedAfter).toBe("false");
  expect(observation.chartAreaCountAfter).toBe(observation.chartAreaCountBefore - 1);
});

test("nominal stacked totals stay within 50–150 from Plan39 estimates through official data", async () => {
  const result = (await commands.inspectPhase6B06(
    "p45-b-plan40-nominal-stacked-total-range-dom-contract",
  )) as {
    categories: string[];
    rows: Array<{
      period: string | null;
      total: number;
      values: Array<{
        key: string;
        value: string | null;
        valueType: string | null;
        status: string | null;
        seriesType: string | null;
        hasMeasurementMetadata: boolean;
      }>;
    }>;
    renderedSeries: Array<{
      key: string;
      seriesGroupCount: number;
      rectangleCount: number;
      visibleRectangleCount: number;
    }>;
  };
  expect(result.categories).toEqual([
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
  ]);
  expect(result.rows.length).toBeGreaterThan(0);
  for (const row of result.rows) {
    const diagnostic = `invalid DOM data-period=${row.period}, row=${JSON.stringify(row)}`;
    expect(row.period, diagnostic).toMatch(/^\d{4}Q[1-4]$/);
  }
  const targetRows = result.rows.filter((row) => row.period! >= "2005Q1");
  expect(targetRows.length).toBeGreaterThan(0);
  expect(targetRows[0]?.period).toBe("2005Q1");
  const quarterIndices = targetRows.map((row) => {
    expect(row.period).toMatch(/^\d{4}Q[1-4]$/);
    const match = /^(\d{4})Q([1-4])$/.exec(row.period ?? "");
    expect(match).not.toBeNull();
    return Number(match?.[1]) * 4 + Number(match?.[2]);
  });
  expect(new Set(quarterIndices).size).toBe(quarterIndices.length);
  for (let index = 1; index < quarterIndices.length; index += 1) {
    expect(quarterIndices[index]).toBe(quarterIndices[index - 1]! + 1);
  }
  for (const row of targetRows) {
    const rowDiagnostic = `period=${row.period}, key=all-ten-expenses, rowTotal=${row.total}, values=${JSON.stringify(row.values)}`;
    expect(row.period).toBeTruthy();
    expect(row.values).toHaveLength(result.categories.length);
    for (const value of row.values) {
      const diagnostic = `period=${row.period}, key=${value.key}, status=${value.status}, seriesType=${value.seriesType}, value=${value.value}, rowTotal=${row.total}, row=${JSON.stringify(row.values)}`;
      expect(value.hasMeasurementMetadata, diagnostic).toBe(true);
      expect(value.valueType, diagnostic).toBe("number");
      expect(value.value, diagnostic).not.toBeNull();
      expect(Number.isFinite(Number(value.value)), diagnostic).toBe(true);
      expect(value.status, diagnostic).toBe("available");
      expect(["official_adjusted", "estimated_adjusted"], diagnostic).toContain(value.seriesType);
    }
    expect(Number.isFinite(row.total), rowDiagnostic).toBe(true);
    expect(row.total, rowDiagnostic).toBeGreaterThanOrEqual(50);
    expect(row.total, rowDiagnostic).toBeLessThanOrEqual(150);
  }
  expect(result.renderedSeries).toHaveLength(result.categories.length);
  for (const series of result.renderedSeries) {
    const diagnostic = `series=${series.key}, groupCount=${series.seriesGroupCount}, rectangles=${series.rectangleCount}, visibleRectangles=${series.visibleRectangleCount}`;
    expect(series.seriesGroupCount, diagnostic).toBe(1);
    expect(series.rectangleCount, diagnostic).toBeGreaterThan(0);
    expect(series.visibleRectangleCount, diagnostic).toBeGreaterThan(0);
  }
});
