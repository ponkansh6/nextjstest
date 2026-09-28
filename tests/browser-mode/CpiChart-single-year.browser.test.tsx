import type { CpiView, QuarterlyView } from "../../src/types/chart";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import CpiChart from "../../src/app/components/CpiChart";
import {
  CONSUMPTION_NOMINAL_KEYS,
  CONSUMPTION_REAL_KEYS,
  stackedKeys,
} from "../../src/lib/chartConstants";
import { renderBrowserComponent } from "./renderBrowserComponent";

vi.mock("next/navigation", () => ({
  default: {},
  useSearchParams: () => new URLSearchParams("from=2020&to=2022"),
}));

const chartData: CpiView[] = [2017, 2018, 2020, 2021, 2022].flatMap((year) =>
  Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const row: Record<string, string | number | null> = {
      年月: `${year}年${month}月`,
      総合: 100 + year - 2020 + month / 10,
      生鮮食品を除く総合: 99 + year - 2020 + month / 10,
      生鮮食品及びエネルギーを除く総合: 98 + year - 2020 + month / 10,
      "食料（酒類を除く）及びエネルギーを除く総合": 97 + year - 2020 + month / 10,
      持家の帰属家賃を除く総合: 100 + year - 2020 + month / 10,
      "消費支出（参考）": null,
      "CPI総合(参考)": 100 + year - 2020 + month / 10,
    };
    for (const [keyIndex, key] of stackedKeys.entries()) {
      row[key] = 90 + keyIndex + (year - 2020) + month / 10;
    }
    return row as CpiView;
  }),
);

function quarterlyRows(keys: readonly string[]): QuarterlyView[] {
  return [2017, 2018, 2020, 2021, 2022].flatMap((year) =>
    [1, 2, 3, 4].map((quarter) => {
      const row: QuarterlyView = {
        年: year,
        quarter,
        label: `${year}Q${quarter}`,
        年月: `${year}Q${quarter}`,
      };
      keys.forEach((key, index) => {
        row[key] = 100 + year - 2020 + quarter + index;
      });
      return row;
    }),
  );
}

const nominalData = quarterlyRows(CONSUMPTION_NOMINAL_KEYS);
const realData = quarterlyRows(CONSUMPTION_REAL_KEYS);

describe("CpiChart single-year range in Chromium", () => {
  afterEach(() => {
    window.__MOUNT_ALL__ = false;
  });

  it("selecting one year produces the actual four-period chart result", async () => {
    window.__MOUNT_ALL__ = true;
    window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2022`);
    renderBrowserComponent(
      <CpiChart
        data={chartData}
        quarterlyNominalData={nominalData}
        quarterlyRealData={realData}
        totalEarningData={[]}
        maxCpiDate={{ year: 2022, month: 12 }}
      />,
    );

    await page.getByRole("button", { name: "表示期間を変更" }).click();
    await userEvent.selectOptions(await page.getByLabelText("開始年:").element(), "2021");
    await page.getByRole("button", { name: "表示期間を変更" }).click();
    await userEvent.selectOptions(await page.getByLabelText("終了年:").element(), "2021");

    for (const testId of ["spending-chart-nominal", "spending-chart-real"]) {
      const chart = page.getByTestId(testId);
      const chartElement = await chart.element();
      const contractElement = chartElement.querySelector('[data-testid="chart-data-contract"]');
      const rowElements = contractElement?.querySelectorAll<HTMLElement>("[data-chart-data-row]");
      expect(rowElements?.length).toBe(4);
      const expectedBarCount = Array.from(rowElements ?? []).reduce(
        (count, row) =>
          count +
          [...row.querySelectorAll<HTMLElement>("[data-series-key]")].filter((cell) => {
            const value = cell.getAttribute("data-value");
            return value !== null && Number.isFinite(Number(value));
          }).length,
        0,
      );
      expect(chartElement.querySelectorAll(".recharts-bar-rectangle").length).toBe(
        expectedBarCount,
      );
    }
  });

  it("selecting and extending a one-year range updates periods and bars", async () => {
    window.__MOUNT_ALL__ = true;
    window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2022`);
    renderBrowserComponent(
      <CpiChart
        data={chartData}
        quarterlyNominalData={nominalData}
        quarterlyRealData={realData}
        totalEarningData={[]}
        maxCpiDate={{ year: 2022, month: 12 }}
      />,
    );

    const selectYear = async (label: "開始年:" | "終了年:", year: number) => {
      await page.getByRole("button", { name: "表示期間を変更" }).click();
      await userEvent.selectOptions(await page.getByLabelText(label).element(), String(year));
    };
    const expectChartContractAndBars = async (
      testId: "spending-chart-nominal" | "spending-chart-real",
      expectedPeriods: number,
    ) => {
      const chart = await page.getByTestId(testId).element();
      const rows = chart.querySelectorAll<HTMLElement>(
        '[data-testid="chart-data-contract"] [data-chart-data-row]',
      );
      expect(rows.length).toBe(expectedPeriods);
      const contractValues = Array.from(rows).reduce(
        (count, row) =>
          count + row.querySelectorAll('[data-series-key][data-value-type="number"]').length,
        0,
      );
      const bars = chart.querySelectorAll(".recharts-bar-rectangle").length;
      expect(contractValues).toBeGreaterThan(0);
      expect(bars).toBe(contractValues);
    };

    // Use years with available post-boundary expense values in the fixture.
    await selectYear("開始年:", 2021);
    await selectYear("終了年:", 2021);
    await expectChartContractAndBars("spending-chart-nominal", 4);
    await expectChartContractAndBars("spending-chart-real", 4);
    const singleYearUrl = new URL(window.location.href);
    expect(singleYearUrl.searchParams.get("from")).toBe("2021");
    expect(singleYearUrl.searchParams.get("to")).toBe("2021");

    // Extend the same visible range by one year and inspect both chart contracts again.
    await selectYear("終了年:", 2022);
    await expectChartContractAndBars("spending-chart-nominal", 8);
    await expectChartContractAndBars("spending-chart-real", 8);
    const twoYearUrl = new URL(window.location.href);
    expect(twoYearUrl.searchParams.get("from")).toBe("2021");
    // The fixture's latest year is the URL default, so serialization omits `to`.
    expect(twoYearUrl.searchParams.get("to") ?? "2022").toBe("2022");
  });
});
