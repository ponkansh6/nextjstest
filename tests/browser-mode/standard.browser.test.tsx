// Standard 1280x800 desktop Browser Mode cases.
// Case bodies remain grouped in blocks to keep fixture names and imports scoped.
import { CagrPanel } from "../../src/app/components/CagrPanel";
import CpiChart from "../../src/app/components/CpiChart";
import {
  formatCpiTooltipTotal,
  formatCpiTooltipValue,
} from "../../src/app/components/CustomTooltip";
import { EarningsBreakdownChart } from "../../src/app/components/EarningsBreakdownChart";
import { NewGraph } from "../../src/app/components/NewGraph";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { StackedAreaChart } from "../../src/app/components/StackedAreaChart";
import { ThemeToggle } from "../../src/app/components/ThemeToggle";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import { useCagrState } from "../../src/hooks/useCagrState";
import {
  createComparisonSeriesRegistry,
  CPI_CATEGORIES,
  CTI_BASIC_EXTENSION_KEY,
  CONSUMPTION_TOTAL_12MA_KEY,
  buildCpiTooltipMetadata,
  stackedColors,
  stackedKeys,
  CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
} from "../../src/lib/chartConstants";
import {
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import type { CpiData } from "../../src/types";
import type { CpiView, QuarterlyView, CustomTooltipProps } from "../../src/types/chart";
import { setBrowserTestSearchParams } from "./browser-search-params";
import { renderBrowserComponent } from "./renderBrowserComponent";
import { screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

{
  const TEST_SUPPORT_NOMINAL_KEY = "民間最終消費支出（名目）";

  const CHART_COLORS = {
    barFill: "#94a3b8",
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
    axisTextEmphasis: "#0f172a",
    tooltipBg: "#ffffff",
    tooltipText: "#1f2937",
  };

  const MONTHLY_DATA: CpiData[] = ["2020年1月", "2021年1月"].map((年月, index) => ({
    年月,
    総合: 100 + index,
    生鮮食品を除く総合: 99 + index,
    持家の帰属家賃を除く総合: 98 + index,
    "消費支出（参考）": null,
    "CPI総合(参考)": 100 + index,
    所定内給与: 250 + index,
    所定外給与: 45 + index,
    特別給与: 80 + index,
    時間当たり給与: 280 + index,
    "15歳以上国民当たり給与": 210 + index,
    ...Object.fromEntries(stackedKeys.map((key, keyIndex) => [key, 90 + keyIndex + index])),
  }));

  const CPI_VIEW_DATA = MONTHLY_DATA.map((row) => row as CpiView);

  function ComparisonSeriesFixture() {
    const registry = createComparisonSeriesRegistry({ status: "valid", reason: null });
    const data = MONTHLY_DATA.map((row, index) => ({
      ...row,
      ...Object.fromEntries(registry.map(({ key }) => [key, 100 + index])),
    }));
    const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
    const tooltip = bind("b3m-advanced-series-normal", { dataLength: data.length });

    return (
      <div style={{ width: 1000 }}>
        <NewGraph
          sectionId="b3m-new-graph"
          data={data}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          isMobile={false}
          tooltipProps={tooltip.tooltipProps}
          comparisonSeriesRegistry={registry}
        />
      </div>
    );
  }

  function CpiSectionsFixture() {
    return (
      <CpiChart
        data={CPI_VIEW_DATA}
        quarterlyNominalData={[]}
        quarterlyRealData={[]}
        totalEarningData={[]}
        maxCpiDate={{ year: 2021, month: 1 }}
      />
    );
  }

  function createQuarterlyData(periods: { year: number; quarter: number }[]): QuarterlyView[] {
    const keys = [...QUARTERLY_PUBLIC_NOMINAL_KEYS, ...QUARTERLY_PUBLIC_REAL_KEYS];
    const supportKey = TEST_SUPPORT_NOMINAL_KEY;
    return periods.map(({ year, quarter }, rowIndex) => {
      const label = `${year}Q${quarter}`;
      const row = { label, 年: year, quarter, 年月: label };
      const values = Object.fromEntries(
        keys.map((key, keyIndex) => [
          key,
          key === supportKey && rowIndex === 1 ? null : 100 + keyIndex,
        ]),
      );
      return { ...row, ...values } as QuarterlyView;
    });
  }

  function Plan24RenderingFixture({ data }: { data: QuarterlyView[] }) {
    const keys = [...QUARTERLY_PUBLIC_NOMINAL_KEYS];
    const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
    const tooltip = bind("b3m-plan24-rendering", {
      dataLength: data.length,
      showAllPayload: true,
      includeUnmappedPayload: true,
    });
    return (
      <div style={{ width: 1000 }}>
        <SpendingBarChart
          title="消費支出（名目）"
          testId="b3m-plan24-rendering"
          data={data}
          keys={keys}
          colors={keys.map(() => "#2563eb")}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onPointerDown={tooltip.onPointerDown}
          onPointerMove={tooltip.onPointerMove}
          onMouseMove={tooltip.onMouseMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseLeave={tooltip.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
        />
      </div>
    );
  }

  function StackedTooltipFixture() {
    const keys = [...stackedKeys];
    const data: CpiData[] = [0, 1].map((index) => ({
      ...MONTHLY_DATA[index],
      ...Object.fromEntries(keys.map((key, keyIndex) => [key, 10 + index + keyIndex])),
    }));
    const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
    const tooltip = bind("b3m-stacked-tooltip", {
      dataLength: data.length,
      showTotal: true,
      totalIncludedKeys: keys,
      showAllPayload: true,
      seriesMeta: buildCpiTooltipMetadata(keys),
      includeUnmappedPayload: true,
      valueFormatter: formatCpiTooltipValue,
      totalFormatter: formatCpiTooltipTotal,
    });
    return (
      <div style={{ width: 1000 }}>
        <StackedAreaChart
          title="費目別寄与度"
          sectionId="b3m-stacked-tooltip-chart"
          data={data}
          keys={keys}
          colors={stackedColors}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onReset={() => {}}
        />
      </div>
    );
  }

  describe("B3m Chromium slices", () => {
    beforeEach(() => setBrowserTestSearchParams("from=2020&to=2021"));
    it("p45-a-advanced-series-normal", async () => {
      renderBrowserComponent(<ComparisonSeriesFixture />);
      const chart = document.querySelector<HTMLElement>("#b3m-new-graph");
      expect(chart).not.toBeNull();
      const normalKeys = ["CPI総合(12MA)", "総合(12MA)", CONSUMPTION_TOTAL_12MA_KEY];
      for (const key of normalKeys) {
        const legend = chart!.querySelector<HTMLElement>(`[data-key="${key}"]`);
        expect(legend).not.toBeNull();
        await expect.element(legend!).toBeVisible();
      }
      expect(chart!.querySelector(`[data-key="${CTI_BASIC_EXTENSION_KEY}"]`)).toBeNull();
      const renderedLines = chart!.querySelectorAll(".recharts-line-curve");
      expect(renderedLines).toHaveLength(3);
    });

    it("p45-a-cpi-sections", async () => {
      window.__MOUNT_ALL__ = true;
      window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2021`);
      renderBrowserComponent(<CpiSectionsFixture />);
      await expect.element(page.getByText("CPI費目別", { exact: true })).toBeInTheDocument();
      const sectionNavigation = page.getByRole("navigation", { name: "グラフセクション" });
      await expect
        .element(sectionNavigation.getByRole("button", { name: "給与", exact: true }))
        .toBeInTheDocument();
      const defaultSectionButton = sectionNavigation.getByRole("button", {
        name: "CPI主要",
        exact: true,
      });
      expect((await defaultSectionButton.element()).hasAttribute("aria-current")).toBe(true);
      const chart = page.getByRole("img", { name: "物価指数 費目別寄与度の積み上げグラフ" });
      await expect.element(chart).toBeVisible();
      const chartElement = await chart.element();
      expect(chartElement.querySelectorAll("path.recharts-area-area").length).toBeGreaterThan(0);
    });

    it("p45-b-plan24-rendering-71", async () => {
      renderBrowserComponent(
        <Plan24RenderingFixture
          data={createQuarterlyData([
            { year: 2005, quarter: 1 },
            { year: 2018, quarter: 1 },
          ])}
        />,
      );
      const chart = page.getByTestId("b3m-plan24-rendering");
      const chartElement = await chart.element();
      const firstBarShape = Array.from(
        chartElement.querySelectorAll<SVGElement>(".recharts-bar-rectangle"),
      )
        .map((group) => group.querySelector<SVGElement>("path, rect"))
        .find((shape): shape is SVGElement => shape !== null);
      expect(firstBarShape).not.toBeNull();
      expect(firstBarShape).toBeVisible();
      expect(chartElement.querySelectorAll(".recharts-line-curve")).toHaveLength(0);
    });

    it("p45-b-plan24-rendering-88", async () => {
      renderBrowserComponent(
        <Plan24RenderingFixture
          data={createQuarterlyData([
            { year: 2025, quarter: 1 },
            { year: 2025, quarter: 4 },
          ])}
        />,
      );
      const chart = page.getByTestId("b3m-plan24-rendering");
      const chartElement = await chart.element();
      const firstBarShape = Array.from(
        chartElement.querySelectorAll<SVGElement>(".recharts-bar-rectangle"),
      )
        .map((group) => group.querySelector<SVGElement>("path, rect"))
        .find((shape): shape is SVGElement => shape !== null);
      expect(firstBarShape).not.toBeNull();
      expect(firstBarShape).toBeVisible();
      await userEvent.hover(firstBarShape!);
      const tooltip = chartElement.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
      expect(tooltip).not.toBeNull();
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent("2025Q1");
      const expectedFirstKey = QUARTERLY_PUBLIC_NOMINAL_KEYS[0];
      const expectedRow = tooltip!.querySelector(
        `[data-tooltip-row="true"][data-tooltip-key="${expectedFirstKey}"]`,
      );
      expect(expectedRow).toHaveTextContent("100.00");
    });

    it("p45-b-tooltip-stack-total-108", async () => {
      renderBrowserComponent(<StackedTooltipFixture />);
      const chart = page.getByRole("img", { name: "物価指数 費目別寄与度の積み上げグラフ" });
      const chartElement = await chart.element();
      const area = chartElement.querySelector<HTMLElement>("path.recharts-area-area");
      expect(area).not.toBeNull();
      expect(area).toBeVisible();
      await userEvent.hover(area!);
      const tooltip = document.querySelector<HTMLElement>('[data-tooltip-root="true"]');
      expect(tooltip).not.toBeNull();
      await expect.element(tooltip!).toBeVisible();
      expect(tooltip!.querySelectorAll('[data-tooltip-row="true"]')).toHaveLength(
        CPI_CATEGORIES.length,
      );
      const total = tooltip!.querySelector<HTMLElement>('[data-tooltip-total="true"]');
      expect(total).not.toBeNull();
      await expect.element(total!).toBeVisible();
    });
  });

  afterEach(() => {
    window.__MOUNT_ALL__ = false;
  });
}

{
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

  const nominalData = quarterlyRows(QUARTERLY_PUBLIC_NOMINAL_KEYS);

  const realData = quarterlyRows(QUARTERLY_PUBLIC_REAL_KEYS);

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
    const sheet = page.getByRole("dialog", { name: "表示期間の選択" });
    await expect.element(sheet).toBeVisible();
    await userEvent.selectOptions(await page.getByLabelText(label).element(), String(year));
    await expect.element(sheet).not.toBeInTheDocument();
  }

  async function expectRenderedBars(
    testId: "spending-chart-nominal" | "spending-chart-real",
    isReal: boolean,
  ) {
    const chart = await page.getByTestId(testId).element();
    expect(chart.getAttribute("data-cti-periods")).toBe("2021Q1,2021Q2,2021Q3,2021Q4");
    const contract = chart.querySelector('[data-testid="chart-data-contract"]');
    const rows = contract?.querySelectorAll<HTMLElement>("[data-chart-data-row]");
    expect(rows?.length).toBe(4);

    const finiteContractCount = Array.from(rows ?? []).reduce(
      (count, row) =>
        count +
        [...row.querySelectorAll<HTMLElement>("[data-series-key]")].filter((cell) => {
          const value = cell.getAttribute("data-value");
          return value !== null && Number.isFinite(Number(value));
        }).length,
      0,
    );
    const realTotalValueCount = isReal
      ? Array.from(rows ?? []).reduce(
          (count, row) =>
            count +
            row.querySelectorAll(
              `[data-series-key="${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"][data-value-type="number"]`,
            ).length,
          0,
        )
      : 0;
    expect(chart.querySelectorAll(".recharts-bar-rectangle").length).toBe(
      finiteContractCount - realTotalValueCount,
    );
    if (isReal) {
      expect(
        chart.querySelectorAll(
          `[data-testid="spending-series-marker-${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"]`,
        ).length,
      ).toBe(0);
    }
  }

  describe("CpiChart range changes", () => {
    beforeEach(() => setBrowserTestSearchParams("from=2020&to=2022"));
    it("changes both range years and renders the exact 2021 quarterly bar counts", async () => {
      renderCpiChart();
      await selectRangeYear("開始年:", 2021);
      await selectRangeYear("終了年:", 2021);
      await expectRenderedBars("spending-chart-nominal", false);
      await expectRenderedBars("spending-chart-real", true);
    });
  });
}

{
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

  const nominalData = quarterlyRows(QUARTERLY_PUBLIC_NOMINAL_KEYS);

  const realData = quarterlyRows(QUARTERLY_PUBLIC_REAL_KEYS);

  function contractRenderableCount(chart: HTMLElement) {
    const rows = chart.querySelectorAll(
      '[data-testid="chart-data-contract"] [data-chart-data-row]',
    );
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

  function contractRealTotalCount(chart: HTMLElement) {
    return chart.querySelectorAll(
      `[data-series-key="${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"][data-value-type="number"]`,
    ).length;
  }

  describe("CpiChart bars", () => {
    beforeEach(() => setBrowserTestSearchParams("from=2020&to=2022"));
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
        const indexedPathSelector = ".recharts-bar-rectangle [data-index] path";
        const renderedBars = chart.querySelectorAll(indexedPathSelector).length;
        const realTotalValues =
          sectionId === "section-consumption-real" ? contractRealTotalCount(chart) : 0;
        const totalMarkers = chart.querySelectorAll(
          `[data-testid="spending-series-marker-${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY}"]`,
        ).length;
        const firstBar = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
        const firstIndexedNode = chart.querySelector<SVGElement>(
          ".recharts-bar-rectangle [data-index]",
        );
        const firstPath = chart.querySelector<SVGPathElement>(indexedPathSelector);
        const barDetails = [
          `outerBars=${chart.querySelectorAll(".recharts-bar-rectangle").length}`,
          `indexedNodes=${chart.querySelectorAll(".recharts-bar-rectangle [data-index]").length}`,
          `paths=${chart.querySelectorAll(".recharts-bar-rectangle path").length}`,
          `indexedPaths=${renderedBars}`,
          `firstBar=${firstBar?.outerHTML.slice(0, 500) ?? "<none>"}`,
          `firstIndexed=${firstIndexedNode?.outerHTML.slice(0, 500) ?? "<none>"}`,
          `firstPath=${firstPath?.outerHTML.slice(0, 300) ?? "<none>"}`,
        ].join("; ");
        expect(renderedBars, barDetails).toBe(contractRenderableCount(chart) - realTotalValues);
        expect(totalMarkers).toBe(0);
      }
    });
  });
}

{
  const CHART_COLORS = {
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
    axisTextEmphasis: "#0f172a",
    tooltipBg: "#ffffff",
    tooltipText: "#1f2937",
  };

  const hourlyPay = 280;

  function EarningsHoverTooltip({ active, payload, label }: CustomTooltipProps) {
    const hourlyEntry = payload?.find((entry) => entry.dataKey === "時間当たり給与");
    if (!active || !hourlyEntry) return null;

    return (
      <div data-testid="earnings-hover-tooltip">
        {label}: {hourlyEntry.value}
      </div>
    );
  }

  const tooltipProps = {
    cursor: { stroke: "#000000", strokeWidth: 1, strokeOpacity: 0.6 },
    trigger: "hover" as const,
    content: (
      <EarningsHoverTooltip isMobile={false} isTouch={false} tooltipBg="#fff" tooltipText="#111" />
    ),
  };

  const data: CpiData[] = ["2025年1月", "2025年2月"].map((年月) => ({
    年月,
    総合: 100,
    生鮮食品を除く総合: 99,
    持家の帰属家賃を除く総合: 98,
    "消費支出（参考）": null,
    "CPI総合(参考)": 100,
    所定内給与: 250,
    所定外給与: 45,
    特別給与: 80,
    時間当たり給与: hourlyPay,
    "15歳以上国民当たり給与": 210,
  }));

  describe("EarningsBreakdownChart tooltip in Chromium", () => {
    it("real earnings plot hover activates visible tooltip content", async () => {
      renderBrowserComponent(
        <div style={{ width: 1000 }}>
          <div data-testid="earnings-hover-chart">
            <EarningsBreakdownChart
              data={data}
              hiddenKeys={[]}
              onToggle={() => {}}
              chartColors={CHART_COLORS}
              isMobile={false}
              tooltipProps={tooltipProps}
            />
          </div>
        </div>,
      );

      const chartElement = await page.getByTestId("earnings-hover-chart").element();
      const area = chartElement.querySelector<SVGPathElement>("path.recharts-area-area");
      if (!area) throw new Error("Earnings chart area path is missing");
      await page.elementLocator(area).hover();

      const tooltip = page.getByTestId("earnings-hover-tooltip");
      await expect.element(tooltip).toBeVisible();
      await expect.element(tooltip).toHaveTextContent(String(hourlyPay));
    });
  });
}

{
  const CHART_COLORS = {
    barFill: "#94a3b8",
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
    axisTextEmphasis: "#0f172a",
    tooltipBg: "#ffffff",
    tooltipText: "#1f2937",
  };

  const data = [1, 2, 3].map((quarter) => ({
    label: `2022Q${quarter}`,
    年: 2022,
    quarter,
    年月: `2022Q${quarter}`,
    "食料（名目）": 120 + quarter,
    "住居（名目）": 80 + quarter,
  }));

  function TooltipRehoverFixture() {
    const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
    const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
    const tooltip = bind("browser-spending-tooltip-rehover", {
      dataLength: data.length,
      showTotal: true,
      showAllPayload: true,
      includeUnmappedPayload: true,
    });

    return (
      <div style={{ width: 1000 }}>
        <SpendingBarChart
          title="消費支出（名目）"
          testId="spending-chart-tooltip-rehover"
          data={data}
          keys={["食料（名目）", "住居（名目）"]}
          colors={["#be123c", "#1d4ed8"]}
          hiddenKeys={hiddenKeys}
          onToggle={(key) =>
            setHiddenKeys((current) =>
              current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
            )
          }
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onPointerDown={tooltip.onPointerDown}
          onPointerMove={tooltip.onPointerMove}
          onMouseMove={tooltip.onMouseMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseLeave={tooltip.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => setHiddenKeys([])}
          isMobile={false}
        />
      </div>
    );
  }

  describe("Spending tooltip", () => {
    it("P42-588/-591 rehover visibility", async () => {
      renderBrowserComponent(<TooltipRehoverFixture />);

      const chart = page.getByTestId("spending-chart-tooltip-rehover");
      const chartElement = await chart.element();
      const initialBarElement = chartElement.querySelector<SVGElement>(".recharts-bar-rectangle");
      if (!initialBarElement) throw new Error("Initial tooltip rehover bar is missing");
      const initialBar = page.elementLocator(initialBarElement);
      await expect.element(initialBar).toBeVisible();
      await initialBar.hover();

      const tooltipElement = chartElement.querySelector<HTMLElement>(
        '[data-custom-tooltip="true"]',
      );
      if (!tooltipElement) throw new Error("Tooltip rehover tooltip is missing");
      const tooltip = page.elementLocator(tooltipElement);
      await expect.element(tooltip).toBeVisible();
      const foodRowElement = tooltipElement.querySelector<HTMLElement>(
        '[data-tooltip-row="true"][data-tooltip-key="食料（名目）"]',
      );
      if (!foodRowElement) throw new Error("Food tooltip row is missing before filtering");
      await expect.element(page.elementLocator(foodRowElement)).toBeVisible();

      const foodButton = chart.getByRole("button", { name: "食料", exact: true });
      await expect.element(foodButton).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(await foodButton.element());
      await expect.element(foodButton).toHaveAttribute("aria-pressed", "false");

      // Clear the prior Recharts hover payload before targeting a different rendered bar.
      const heading = chartElement.querySelector<HTMLHeadingElement>("h2");
      if (!heading) throw new Error("Tooltip rehover chart heading is missing");
      await page.elementLocator(heading).hover();
      const freshBarElement = chartElement.querySelector<SVGElement>(".recharts-bar-rectangle");
      if (!freshBarElement) throw new Error("Fresh tooltip rehover bar is missing");
      const freshBar = page.elementLocator(freshBarElement);
      await expect.element(freshBar).toBeVisible();
      await freshBar.hover();
      const tooltipAfterRehoverElement = chartElement.querySelector<HTMLElement>(
        '[data-custom-tooltip="true"]',
      );
      if (!tooltipAfterRehoverElement)
        throw new Error("Tooltip did not reappear after filtering a series");
      await expect.element(page.elementLocator(tooltipAfterRehoverElement)).toBeVisible();
      expect(
        tooltipAfterRehoverElement.querySelector(
          '[data-tooltip-row="true"][data-tooltip-key="食料（名目）"]',
        ),
      ).toBeNull();
    });
  });
}

{
  const CHART_COLORS = {
    barFill: "#94a3b8",
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
    axisTextEmphasis: "#0f172a",
    tooltipBg: "#ffffff",
    tooltipText: "#1f2937",
  };

  function NominalTooltipFixture() {
    const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
    const tooltip = bind("browser-nominal-2022-total", {
      dataLength: 2,
      showTotal: true,
      includeUnmappedPayload: true,
    });

    return (
      <div style={{ width: 1000 }}>
        <SpendingBarChart
          title="消費支出（名目）"
          testId="spending-chart-nominal-2022-total"
          data={[
            {
              label: "2022Q1",
              年: 2022,
              quarter: 1,
              年月: "2022Q1",
              "食料（名目）": 123,
              "住居（名目）": 234,
            },
            {
              label: "2022Q2",
              年: 2022,
              quarter: 2,
              年月: "2022Q2",
              "食料（名目）": 234,
              "住居（名目）": 345,
            },
          ]}
          keys={["食料（名目）", "住居（名目）"]}
          colors={["#be123c", "#1d4ed8"]}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onPointerDown={tooltip.onPointerDown}
          onPointerMove={tooltip.onPointerMove}
          onMouseMove={tooltip.onMouseMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseLeave={tooltip.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
          isMobile={false}
        />
      </div>
    );
  }

  function RealTooltipFixture() {
    const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
    const tooltip = bind("browser-real-simple-tooltip", {
      dataLength: 1,
      showTotal: true,
      showMeasurementNotes: false,
      allowedKeys: ["食料（実質）", "住居（実質）"],
      seriesMeta: [
        { key: "食料（実質）", label: "食料", color: "#be123c", order: 0 },
        { key: "住居（実質）", label: "住居", color: "#1d4ed8", order: 1 },
        {
          key: CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY,
          label: "消費支出（実質）",
          color: "#64748b",
          order: 2,
          cpiSeries: "CPI series",
        },
      ],
    });

    return (
      <div style={{ width: 1000 }}>
        <SpendingBarChart
          title="消費支出（実質）"
          testId="spending-chart-real-simple-tooltip"
          data={[
            {
              label: "2025Q1",
              年: 2025,
              quarter: 1,
              年月: "2025Q1",
              "食料（実質）": 123,
              "住居（実質）": 234,
              [CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]: 999,
            },
          ]}
          keys={["食料（実質）", "住居（実質）", CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]}
          colors={["#be123c", "#1d4ed8", "#64748b"]}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onPointerDown={tooltip.onPointerDown}
          onPointerMove={tooltip.onPointerMove}
          onMouseMove={tooltip.onMouseMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseLeave={tooltip.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
          isMobile={false}
        />
      </div>
    );
  }

  function NominalAndRealTooltipFixture() {
    return (
      <div style={{ display: "grid", gap: 24 }}>
        <NominalTooltipFixture />
        <RealTooltipFixture />
      </div>
    );
  }

  describe("SpendingBarChart nominal tooltip total in Chromium", () => {
    it("shows nominal stacked and calculated real totals without support total or CPI notes", async () => {
      renderBrowserComponent(<NominalAndRealTooltipFixture />);

      const nominalChart = await page.getByTestId("spending-chart-nominal-2022-total").element();
      const nominalBarElement = nominalChart.querySelector<SVGElement>(".recharts-bar-rectangle");
      if (!nominalBarElement) throw new Error("2022 nominal spending bar is missing");
      const nominalBar = page.elementLocator(nominalBarElement);
      await expect.element(nominalBar).toBeVisible();
      await nominalBar.hover();

      const nominalTooltip = nominalChart.querySelector<HTMLElement>(
        '[data-custom-tooltip="true"]',
      );
      if (!nominalTooltip) throw new Error("Nominal spending tooltip is missing");
      await expect.element(page.elementLocator(nominalTooltip)).toBeVisible();
      const nominalTotal = nominalTooltip.querySelector<HTMLElement>('[data-tooltip-total="true"]');
      if (!nominalTotal) throw new Error("Nominal spending tooltip total is missing");
      const nominalTotalLocator = page.elementLocator(nominalTotal);
      await expect.element(nominalTotalLocator).toBeVisible();
      await expect.element(nominalTotalLocator).toHaveTextContent("合計");
      await expect.element(nominalTotalLocator).toHaveTextContent("357.00");

      const realChart = await page.getByTestId("spending-chart-real-simple-tooltip").element();
      const realBarElement = realChart.querySelector<SVGElement>(".recharts-bar-rectangle");
      if (!realBarElement) throw new Error("2025 real spending bar is missing");
      const realBar = page.elementLocator(realBarElement);
      await expect.element(realBar).toBeVisible();
      await realBar.hover();

      const realTooltip = realChart.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
      if (!realTooltip) throw new Error("Real spending tooltip is missing");
      await expect.element(page.elementLocator(realTooltip)).toBeVisible();
      const tooltipRows = [
        ...realTooltip.querySelectorAll<HTMLElement>('[data-tooltip-row="true"]'),
      ];
      expect(tooltipRows.map((row) => row.getAttribute("data-tooltip-key"))).toEqual([
        "食料（実質）",
        "住居（実質）",
      ]);
      const realTotal = realTooltip.querySelector<HTMLElement>('[data-tooltip-total="true"]');
      if (!realTotal) throw new Error("Real spending tooltip calculated total is missing");
      expect(realTotal.textContent).toContain("合計");
      expect(realTotal.textContent).toContain("357.00");
      expect(realTotal.textContent).not.toContain("999.00");
      expect(realTooltip.querySelector('[data-tooltip-measurement-note="true"]')).toBeNull();
      expect(realTooltip.querySelector('[data-tooltip-cpi-provenance="true"]')).toBeNull();
    });
  });
}

{
  describe("ThemeToggle Chromium CSS layout", () => {
    it("loads the component CSS module into Chromium's computed style", () => {
      renderBrowserComponent(<ThemeToggle />);

      const button = screen.getByRole("button");
      const styles = window.getComputedStyle(button);
      const bounds = button.getBoundingClientRect();

      expect(styles.minHeight).toBe("44px");
      expect(styles.minWidth).toBe("44px");
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    });
  });
}

{
  const sharedMock = vi.fn();

  const spyTarget = { record: () => "recorded" };

  const originalRecord = spyTarget.record;

  let sharedSpy: ReturnType<typeof vi.fn> | undefined;

  function InteractionFixture() {
    const [count, setCount] = useState(0);
    return (
      <button
        type="button"
        onClick={() => {
          setCount((current) => current + 1);
          sharedMock();
          spyTarget.record();
        }}
      >
        Count: {count}
      </button>
    );
  }

  describe("Browser Mode file-level state isolation", () => {
    it("mutates page, storage, cookie, and mock state through a browser interaction", async () => {
      sharedSpy = vi.spyOn(spyTarget, "record");
      renderBrowserComponent(<InteractionFixture />);

      document.documentElement.setAttribute("data-theme", "dark");
      window.localStorage.setItem("browser-mode-isolation", "stale");
      document.cookie = "browser-mode-isolation=stale; path=/; SameSite=Lax";

      const button = page.getByRole("button");
      await userEvent.click(button);
      await expect.element(button).toHaveTextContent("Count: 1");

      expect(document.cookie).toContain("browser-mode-isolation=stale");
      expect(sharedMock).toHaveBeenCalledOnce();
      expect(sharedSpy).toHaveBeenCalledOnce();
    });

    it("starts after the prior test's DOM, theme, storage, cookie, and mocks were reset", () => {
      expect(document.body.querySelector("button")).toBeNull();
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      expect(window.localStorage.getItem("browser-mode-isolation")).toBeNull();
      expect(document.cookie).not.toContain("browser-mode-isolation=stale");
      expect(sharedMock).not.toHaveBeenCalled();
      expect(sharedSpy).toBeDefined();
      expect(sharedSpy).not.toHaveBeenCalled();
      expect(spyTarget.record).toBe(originalRecord);
    });
  });
}

it("uses the standard desktop Browser Mode viewport", () => {
  const evidence = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    deviceScaleFactor: window.devicePixelRatio,
    touchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
  };
  expect(evidence.viewport).toEqual({ width: 1280, height: 800 });
  expect(evidence.screen).toEqual({ width: 1280, height: 800 });
  expect(evidence.deviceScaleFactor).toBe(1);
  expect(evidence.touchPoints).toBe(0);
  expect(evidence.userAgent).toContain("Chrome/");
});
