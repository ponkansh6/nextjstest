import { act, waitFor } from "@testing-library/react";
import type { CpiView } from "../../src/types/chart";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  return renderBrowserComponent(
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

async function pressStackedSelection() {
  const chart = page.getByRole("img", {
    name: "物価指数 費目別寄与度の積み上げグラフ",
  });
  await expect.element(chart).toBeVisible();
  const wrapper = await chart.element();
  wrapper.focus();
  await userEvent.keyboard("{Enter}");
}

describe("CpiChart range selection and tooltip invalidation in Chromium", () => {
  afterEach(() => {
    window.__MOUNT_ALL__ = false;
  });

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

  it("invalidates an open point snapshot after data changes", async () => {
    window.__MOUNT_ALL__ = true;
    const rendered = renderCpiChart();

    await pressStackedSelection();
    const initialDialog = page.getByRole("dialog");
    await expect.element(initialDialog).toBeVisible();
    const drawer = document.querySelector<HTMLElement>('[data-slot="drawer-popup"]');
    if (!drawer) throw new Error("CpiChart point selection did not render its Drawer");
    const initialTooltip = drawer.querySelector<HTMLElement>("[data-custom-tooltip]");
    expect(initialTooltip?.textContent).toContain("2021年7月");

    // A changed data prop is a valid external update path while the modal
    // Drawer is open (the range controls are inert behind that modal).
    const updatedKey = stackedKeys[0];
    if (!updatedKey) throw new Error("CpiChart stacked series fixture is empty");
    // Keyboard selection defaults to the center datum: index 18 is 2021年7月.
    const centerSelectionIndex = Math.round((chartData.length - 1) / 2);
    const updatedData = chartData.map((row, index) =>
      index === centerSelectionIndex ? { ...row, [updatedKey]: 9999 } : row,
    );
    rendered.rerender(
      <CpiChart
        data={updatedData}
        quarterlyNominalData={[]}
        quarterlyRealData={[]}
        totalEarningData={[]}
        maxCpiDate={{ year: 2022, month: 12 }}
      />,
    );
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

    await pressStackedSelection();
    const updatedDialog = page.getByRole("dialog");
    await expect.element(updatedDialog).toBeVisible();
    const updatedDrawer = document.querySelector<HTMLElement>('[data-slot="drawer-popup"]');
    if (!updatedDrawer) throw new Error("Updated CpiChart selection did not render its Drawer");
    const updatedTooltip = updatedDrawer.querySelector<HTMLElement>("[data-custom-tooltip]");
    expect(updatedTooltip?.textContent).toContain("9999.00");
  });

  it("removes the production Drawer when CpiChart unmounts", async () => {
    window.__MOUNT_ALL__ = true;
    const rendered = renderCpiChart();

    await pressStackedSelection();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(document.querySelector('[data-slot="drawer-popup"]')).not.toBeNull();

    rendered.unmount();

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
  });

  it("synthetically invalidates the Drawer after a programmatic range change", async () => {
    window.__MOUNT_ALL__ = true;
    renderCpiChart();
    await openRangeSheet();
    await pressStackedSelection();

    const drawer = document.querySelector('[data-slot="drawer-popup"]');
    expect(drawer).not.toBeNull();
    const startYear = document.querySelector<HTMLSelectElement>("#startYear");
    if (!startYear) throw new Error("Range sheet start-year select is missing");
    const nextValue = [...startYear.options]
      .map((option) => option.value)
      .find((value) => value !== startYear.value);
    if (!nextValue) throw new Error("Range sheet has no alternate start year");
    const setNativeValue = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    if (!setNativeValue) throw new Error("Native select value setter is unavailable");

    // This bypasses modal hit-testing intentionally; it is not a user-accessibility test.
    act(() => {
      setNativeValue.call(startYear, nextValue);
      startYear.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitFor(() => expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull());
  });
});
