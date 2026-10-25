import { useState } from "react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { renderBrowserComponent } from "./renderBrowserComponent";

const FIXTURE_GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
`;

function NominalCategoryFilterFixture({ collapsible = false }: { collapsible?: boolean }) {
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
      legendMode={collapsible ? "collapsible" : "expanded"}
      defaultLegendOpen={collapsible ? false : undefined}
      isMobile={false}
    />
  );
}

function NominalCategoryFilterFixtureWithGlobalSizing() {
  return (
    <>
      <style>{FIXTURE_GLOBAL_CSS}</style>
      <NominalCategoryFilterFixture collapsible />
    </>
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

describe("SpendingBarChart narrow summary layout in Chromium", () => {
  it("keeps the disclosure target and chevron inside the 320px viewport", async () => {
    await page.viewport(320, 720);
    renderBrowserComponent(<NominalCategoryFilterFixtureWithGlobalSizing />);

    const title = await page.getByText("費目・四半期を変更", { exact: true }).element();
    const summaryElement = title.closest("summary");
    expect(summaryElement).not.toBeNull();
    if (!summaryElement) throw new Error("The native summary is unavailable");

    await userEvent.click(summaryElement);
    await userEvent.click(await page.getByRole("button", { name: "食料", exact: true }).element());
    await expect.element(page.getByText("絞り込み中", { exact: true })).toBeVisible();

    const detailsElement = summaryElement.parentElement;
    expect(detailsElement?.tagName).toBe("DETAILS");
    if (!detailsElement) throw new Error("The native details element is unavailable");
    const summaryRect = summaryElement.getBoundingClientRect();
    const detailsRect = detailsElement.getBoundingClientRect();
    const status = await page.getByText("絞り込み中", { exact: true }).element();
    const meta = status.parentElement;
    const chevron = summaryElement.querySelector<SVGElement>("svg[aria-hidden='true']");

    expect(summaryElement.tagName).toBe("SUMMARY");
    expect(summaryRect.height).toBeGreaterThanOrEqual(44);
    expect(summaryRect.width).toBeGreaterThanOrEqual(44);
    expect(summaryRect.left).toBeGreaterThanOrEqual(0);
    expect(summaryRect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(detailsElement.scrollWidth).toBeLessThanOrEqual(detailsElement.clientWidth);
    expect(detailsRect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(meta).not.toBeNull();
    expect(chevron).not.toBeNull();
    if (!meta) throw new Error("The summary metadata is unavailable");
    if (!chevron) throw new Error("The disclosure chevron is unavailable");

    const metaRect = meta.getBoundingClientRect();
    const chevronRect = chevron.getBoundingClientRect();
    expect(chevronRect.left).toBeGreaterThanOrEqual(summaryRect.left);
    expect(chevronRect.right).toBeLessThanOrEqual(summaryRect.right);
    expect(metaRect.right).toBeLessThanOrEqual(chevronRect.left);
  });
});
