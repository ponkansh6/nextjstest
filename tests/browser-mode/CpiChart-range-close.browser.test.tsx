import type { CpiView } from "../../src/types/chart";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import CpiChart from "../../src/app/components/CpiChart";
import { stackedKeys } from "../../src/lib/chartConstants";
import { renderBrowserComponent } from "./renderBrowserComponent";

// Keep the real useUrlState hook while supplying its initial Next query snapshot.
// The default export accommodates Vitest's browser dependency interop for Next's CJS entry.
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
      row[key] = 90 + keyIndex + (year - 2020) + month / 10;
    }
    return row as CpiView;
  }),
);

function renderCpiChart() {
  renderBrowserComponent(
    <CpiChart
      data={chartData}
      quarterlyNominalData={[]}
      quarterlyRealData={[]}
      totalEarningData={[]}
      maxCpiDate={{ year: 2022, month: 12 }}
    />,
  );
}

async function openRangeSheet() {
  await page.getByRole("button", { name: "表示期間を変更" }).click();
  const sheet = page.getByRole("dialog", { name: "表示期間の選択" });
  await expect.element(sheet).toBeVisible();
  return sheet;
}

describe("CpiChart range selection closes the actual sheet in Chromium", () => {
  beforeEach(() => {
    // Start each case from the same independent URL-backed range snapshot.
    window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2022`);
  });

  it("closes the actual sheet after selecting a start year", async () => {
    // P42-471: exercise the CpiChart start-year handler through its visible control.
    renderCpiChart();

    const sheet = await openRangeSheet();
    const startYear = page.getByLabelText("開始年:");
    await expect.element(startYear).toBeVisible();
    await userEvent.selectOptions(await startYear.element(), "2021");

    await expect.element(sheet).not.toBeInTheDocument();
  });

  it("closes the actual sheet after selecting an end year", async () => {
    // P42-473: exercise the CpiChart end-year handler through its visible control.
    renderCpiChart();

    const sheet = await openRangeSheet();
    const endYear = page.getByLabelText("終了年:");
    await expect.element(endYear).toBeVisible();
    await userEvent.selectOptions(await endYear.element(), "2021");

    await expect.element(sheet).not.toBeInTheDocument();
  });
});

describe("CpiChart legend scroll preservation in Chromium", () => {
  it("p45-a-cpi-legend-scroll — P42-263/-264: preserves fixture scroll after a real legend toggle", async () => {
    renderBrowserComponent(
      <>
        <div style={{ height: 500 }} aria-hidden="true" />
        <CpiChart
          data={chartData}
          quarterlyNominalData={[]}
          quarterlyRealData={[]}
          totalEarningData={[]}
          maxCpiDate={{ year: 2022, month: 12 }}
        />
      </>,
    );

    const housing = page.getByRole("button", { name: "住居", exact: true });
    await expect.element(housing).toBeVisible();
    (await housing.element()).scrollIntoView({ block: "center" });

    const before = window.scrollY;
    expect(before).toBeGreaterThan(100);
    await userEvent.click(await housing.element());

    await expect.element(housing).toHaveAttribute("aria-pressed", "false");
    expect(Math.abs(window.scrollY - before)).toBeLessThan(50);
  });
});
