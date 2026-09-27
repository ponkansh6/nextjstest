import type { CpiView, QuarterlyView } from "../../src/types/chart";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
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

const cpiData: CpiView[] = [2020, 2021, 2022].flatMap((year) =>
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
    stackedKeys.forEach((key, keyIndex) => {
      row[key] = 90 + keyIndex + year - 2020 + month / 10;
    });
    return row as CpiView;
  }),
);

function quarterlyRows(keys: readonly string[]): QuarterlyView[] {
  return [2020, 2021, 2022].flatMap((year) =>
    [1, 2, 3, 4].map((quarter) => {
      const row: QuarterlyView = {
        年: year,
        quarter,
        label: `${year}Q${quarter}`,
        年月: `${year}Q${quarter}`,
      };
      keys.forEach((key, index) => {
        // Null cells exercise the same finite-value contract as sparse public projections.
        row[key] = year === 2021 && quarter === 2 && index === 0 ? null : 100 + index + quarter;
      });
      return row;
    }),
  );
}

const nominalData = quarterlyRows(CONSUMPTION_NOMINAL_KEYS);
const realData = quarterlyRows(CONSUMPTION_REAL_KEYS);

function contractRenderableCount(chart: HTMLElement) {
  const rows = chart.querySelectorAll('[data-testid="chart-data-contract"] [data-chart-data-row]');
  return Array.from(rows).reduce(
    (count, row) =>
      count +
      Array.from(row.querySelectorAll<HTMLElement>("[data-series-key]")).filter((cell) => {
        const value = cell.getAttribute("data-value");
        return value !== null && Number.isFinite(Number(value));
      }).length,
    0,
  );
}

describe("CpiChart bars", () => {
  afterEach(() => {
    window.__MOUNT_ALL__ = false;
  });

  it("P42-457/-458 finite bar contract", async () => {
    window.__MOUNT_ALL__ = true;
    window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2022`);
    renderBrowserComponent(
      <CpiChart
        data={cpiData}
        quarterlyNominalData={nominalData}
        quarterlyRealData={realData}
        totalEarningData={[]}
        maxCpiDate={{ year: 2022, month: 12 }}
      />,
    );

    for (const [sectionId, title] of [
      ["section-consumption-nominal", "消費支出（名目）"],
      ["section-consumption-real", "消費支出（実質）"],
    ]) {
      const plot = page.getByRole("img", { name: `${title}の推移グラフ` });
      await expect.element(plot).toBeVisible();

      const chart = document.querySelector<HTMLElement>(`#${sectionId}`);
      expect(chart).not.toBeNull();
      if (!chart) throw new Error(`Rendered CpiChart section is unavailable: ${sectionId}`);
      const renderedBars = chart.querySelectorAll(".recharts-bar-rectangle").length;
      expect(renderedBars).toBe(contractRenderableCount(chart));
    }
  });
});
