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

const chartData: CpiView[] = [2020, 2021, 2022].flatMap((year) =>
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
      row[key] = 90 + keyIndex + year - 2020 + month / 10;
    }
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
        row[key] = 100 + index + quarter;
      });
      return row;
    }),
  );
}

const nominalData = quarterlyRows(CONSUMPTION_NOMINAL_KEYS);
const realData = quarterlyRows(CONSUMPTION_REAL_KEYS);

function renderCpiChart() {
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
}

afterEach(() => {
  window.__MOUNT_ALL__ = false;
});

async function selectRangeYear(label: "開始年:" | "終了年:", year: number) {
  await page.getByRole("button", { name: "表示期間を変更" }).click();
  await userEvent.selectOptions(await page.getByLabelText(label).element(), String(year));
}

async function expectRenderedBars(
  testId: "spending-chart-nominal" | "spending-chart-real",
  expectedPeriods: string,
) {
  const chart = await page.getByTestId(testId).element();
  expect(chart.getAttribute("data-cti-periods")).toBe(expectedPeriods);
  const bars = chart.querySelectorAll(".recharts-bar-rectangle");
  expect(bars.length).toBeGreaterThan(0);
  expect(Array.from(bars).some((bar) => bar.getBoundingClientRect().height > 0)).toBe(true);
}

describe("CpiChart range changes", () => {
  it("p45-b-range-change-119-e2e", async () => {
    renderCpiChart();
    await selectRangeYear("開始年:", 2021);
    await expectRenderedBars(
      "spending-chart-nominal",
      "2021Q1,2021Q2,2021Q3,2021Q4,2022Q1,2022Q2,2022Q3,2022Q4",
    );
  });

  it("p45-b-range-change-136-e2e", async () => {
    renderCpiChart();
    await selectRangeYear("開始年:", 2021);
    await expectRenderedBars(
      "spending-chart-real",
      "2021Q1,2021Q2,2021Q3,2021Q4,2022Q1,2022Q2,2022Q3,2022Q4",
    );
  });

  it("p45-b-range-change-153-e2e", async () => {
    renderCpiChart();
    await selectRangeYear("終了年:", 2021);
    await expectRenderedBars(
      "spending-chart-nominal",
      "2020Q1,2020Q2,2020Q3,2020Q4,2021Q1,2021Q2,2021Q3,2021Q4",
    );
  });

  it("p45-b-range-change-170-e2e", async () => {
    renderCpiChart();
    await selectRangeYear("終了年:", 2021);
    await expectRenderedBars(
      "spending-chart-real",
      "2020Q1,2020Q2,2020Q3,2020Q4,2021Q1,2021Q2,2021Q3,2021Q4",
    );
  });

  it("p45-b-range-change-242-e2e", async () => {
    renderCpiChart();
    const errors: string[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.message);
    const onUnhandledRejection = (event: PromiseRejectionEvent) =>
      errors.push(String(event.reason));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    try {
      await selectRangeYear("開始年:", 2021);
      await selectRangeYear("終了年:", 2021);
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
  });

  it("p45-b-range-change-273-e2e", async () => {
    renderBrowserComponent(
      <>
        <div aria-hidden="true" style={{ height: 900 }} />
        <CpiChart
          data={chartData}
          quarterlyNominalData={nominalData}
          quarterlyRealData={realData}
          totalEarningData={[]}
          maxCpiDate={{ year: 2022, month: 12 }}
        />
      </>,
    );
    window.scrollTo(0, 650);
    const before = window.scrollY;
    expect(before).toBeGreaterThan(100);

    await selectRangeYear("開始年:", 2021);

    expect(Math.abs(window.scrollY - before)).toBeLessThan(50);
  });
});
