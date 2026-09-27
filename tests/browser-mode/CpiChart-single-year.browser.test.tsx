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

  it("p45-b-range-change-187-e2e-1 — single year and extension update contract periods and bars", async () => {
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
    const nominalContractPeriodCount = async () => {
      const chart = await page.getByTestId("spending-chart-nominal").element();
      return chart.querySelectorAll('[data-testid="chart-data-contract"] [data-chart-data-row]')
        .length;
    };

    // Use the actual ChartFilters controls and CpiChart handlers to reach 2017 only.
    await selectYear("開始年:", 2017);
    await selectYear("終了年:", 2017);
    const periods2017Only = await nominalContractPeriodCount();
    expect(periods2017Only).toBe(4);
    const nominal2017 = await page.getByTestId("spending-chart-nominal").element();
    const nominalRows2017 = nominal2017.querySelectorAll<HTMLElement>(
      '[data-testid="chart-data-contract"] [data-chart-data-row]',
    );
    const expected2017Bars = Array.from(nominalRows2017).reduce(
      (count, row) =>
        count + row.querySelectorAll("[data-series-key][data-value-type='number']").length,
      0,
    );
    expect(nominal2017.querySelectorAll(".recharts-bar-rectangle").length).toBe(expected2017Bars);

    // Extend the same visible range by one year and inspect the real chart contract again.
    await selectYear("終了年:", 2018);
    const periods2017to2018 = await nominalContractPeriodCount();
    expect(periods2017to2018).toBe(8);
    expect(periods2017to2018).toBeGreaterThan(periods2017Only);
  });

  it("P45 CPI tooltip rows", async () => {
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

    const chart = page.getByRole("img", {
      name: "物価指数 費目別寄与度の積み上げグラフ",
    });
    const chartElement = await chart.element();
    const areaElement = chartElement.querySelector<SVGPathElement>("path.recharts-area-area");
    if (!areaElement) throw new Error("CPI chart area path is missing");
    const area = page.elementLocator(areaElement);
    await expect.element(area).toBeVisible();
    await area.hover();

    const tooltipElement = chartElement.querySelector<HTMLElement>('[data-tooltip-root="true"]');
    if (!tooltipElement) throw new Error("CPI chart tooltip is missing");
    const tooltip = page.elementLocator(tooltipElement);
    await expect.element(tooltip).toBeVisible();
    const totalElement = tooltipElement.querySelector<HTMLElement>('[data-tooltip-total="true"]');
    if (!totalElement) throw new Error("CPI chart total is missing");
    const total = page.elementLocator(totalElement);
    await expect.element(total).toBeVisible();
    const rowElements = (await tooltip.element()).querySelectorAll('[data-tooltip-row="true"]');
    expect(rowElements.length).toBe(12);
    expect((await tooltip.element()).hasAttribute("data-tooltip-root")).toBe(true);
    expect((await tooltip.element()).querySelector('[data-tooltip-total="true"]')).not.toBeNull();
  });
});
