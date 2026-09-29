import { useState } from "react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { renderBrowserComponent } from "./renderBrowserComponent";

function NominalCategoryFilterFixture() {
  const keys = ["食料（名目）", "住居（名目）"];
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const data = [1, 2].flatMap((quarter) =>
    [2022, 2023].map((year) => ({
      label: `${year}Q${quarter}`,
      年: year,
      quarter,
      年月: `${year}Q${quarter}`,
      "食料（名目）": 100 + year + quarter,
      "住居（名目）": 50 + year + quarter,
    })),
  );

  return (
    <SpendingBarChart
      title="消費支出（名目）"
      testId="nominal-category-filter-fixture"
      data={data}
      keys={keys}
      colors={["#be123c", "#1d4ed8"]}
      hiddenKeys={hiddenKeys}
      onToggle={(key) =>
        setHiddenKeys((current) =>
          current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
        )
      }
      chartColors={{ barFill: "#94a3b8", gridStroke: "#e2e8f0", axisText: "#64748b" }}
      tooltipProps={{
        cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
        trigger: "hover",
        content: <div />,
      }}
      hiddenQuarters={[]}
      onToggleQuarter={() => {}}
      onReset={() => {}}
      isMobile={false}
    />
  );
}

function NominalAllSeriesFilterFixture() {
  const keys = ["食料（名目）", "住居（名目）"];
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const data = [2024, 2025].map((year) => ({
    label: `${year}Q1`,
    年: year,
    quarter: 1,
    年月: `${year}Q1`,
    "食料（名目）": 100 + year,
    "住居（名目）": 50 + year,
  }));

  return (
    <SpendingBarChart
      title="消費支出（名目）"
      testId="nominal-all-series-filter-fixture"
      data={data}
      keys={keys}
      colors={["#be123c", "#1d4ed8"]}
      hiddenKeys={hiddenKeys}
      onToggle={(key) =>
        setHiddenKeys((current) =>
          current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
        )
      }
      chartColors={{ barFill: "#94a3b8", gridStroke: "#e2e8f0", axisText: "#64748b" }}
      tooltipProps={{
        cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
        trigger: "hover",
        content: <div />,
      }}
      hiddenQuarters={[]}
      onToggleQuarter={() => {}}
      onReset={() => setHiddenKeys(keys)}
      isMobile={false}
    />
  );
}

describe("SpendingBarChart nominal category filter in Chromium", () => {
  it("P45 nominal category bar reduction", async () => {
    renderBrowserComponent(<NominalCategoryFilterFixture />);

    const chart = page.getByTestId("nominal-category-filter-fixture");
    const initialCount = (await chart.element()).querySelectorAll(".recharts-bar-rectangle").length;
    const category = chart.getByRole("button", { name: "食料", exact: true });
    await userEvent.click(await category.element());
    await expect.element(category).toHaveAttribute("aria-pressed", "false");

    const remainingCount = (await chart.element()).querySelectorAll(
      ".recharts-bar-rectangle",
    ).length;
    expect(remainingCount).toBeLessThan(initialCount);
    await expect.element(chart).toBeVisible();
  });
});

describe("SpendingBarChart all-series visibility in Chromium", () => {
  it("p45-b-consumption-mobile-acceptance-139-mobile-pixel-acceptance-plan25-openspec-1 — P42-180/-183: removes and restores rendered bars", async () => {
    renderBrowserComponent(<NominalAllSeriesFilterFixture />);

    const chart = page.getByTestId("nominal-all-series-filter-fixture");
    const initialCount = (await chart.element()).querySelectorAll(".recharts-bar-rectangle").length;
    expect(initialCount).toBeGreaterThan(0);

    await userEvent.click(await chart.getByRole("button", { name: "全選択解除" }).element());
    expect((await chart.element()).querySelectorAll(".recharts-bar-rectangle").length).toBe(0);

    await userEvent.click(await chart.getByRole("button", { name: "食料", exact: true }).element());
    expect(
      (await chart.element()).querySelectorAll(".recharts-bar-rectangle").length,
    ).toBeGreaterThan(0);
  });
});
