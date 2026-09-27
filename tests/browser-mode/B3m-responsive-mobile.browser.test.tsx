import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import CpiChart from "../../src/app/components/CpiChart";
import { EarningsBreakdownChart } from "../../src/app/components/EarningsBreakdownChart";
import { SectionTabs } from "../../src/app/components/SectionTabs";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import pageLayout from "../../src/app/page.module.css";
import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";
import { CPI_CHART_SECTIONS } from "../../src/app/components/cpiChartConfig";
import {
  EARNINGS_AUXILIARY_KEYS,
  EARNINGS_SERIES_REGISTRY,
  EARNINGS_TOTAL_KEYS,
  getColorForNominalKey,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
} from "../../src/lib/chartConstants";
import {
  QUARTERLY_PLAN40_V2_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import { stackedKeys } from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";
import type { CpiView, QuarterlyView } from "../../src/types/chart";
import { renderBrowserComponent } from "./renderBrowserComponent";

vi.mock("next/navigation", () => ({
  default: {},
  useSearchParams: () => new URLSearchParams("from=2020&to=2022"),
}));

const CHART_COLORS = {
  barFill: "#94a3b8",
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  axisTextEmphasis: "#0f172a",
  tooltipBg: "#ffffff",
  tooltipText: "#1f2937",
};

const CPI_DATA: CpiView[] = [2020, 2021, 2022].flatMap((year) =>
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

function CpiChartResponsiveFixture() {
  return (
    <CpiChart
      data={CPI_DATA}
      quarterlyNominalData={[]}
      quarterlyRealData={[]}
      totalEarningData={[]}
      maxCpiDate={{ year: 2022, month: 12 }}
    />
  );
}

function createSpendingData(): ComponentProps<typeof SpendingBarChart>["data"] {
  const keys = [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS, ...QUARTERLY_PUBLIC_REAL_KEYS];
  return Array.from({ length: 12 }, (_, index) => {
    const year = 2020 + Math.floor(index / 4);
    const quarter = (index % 4) + 1;
    const row: Record<string, string | number | null> = {
      label: `${year}Q${quarter}`,
      年: year,
      quarter,
      年月: `${year}Q${quarter}`,
    };
    for (const [keyIndex, key] of keys.entries()) {
      row[key] = 10 + index + keyIndex;
    }
    row[SUPPORT_SERIES_KEY_NOMINAL] = null;
    row[SUPPORT_SERIES_KEY_REAL] = null;
    return row as ComponentProps<typeof SpendingBarChart>["data"][number];
  }) as ComponentProps<typeof SpendingBarChart>["data"];
}

function SpendingBoundaryFixture() {
  const keys = [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS];
  const data = createSpendingData();
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("b3m-boundary", { dataLength: data.length });
  return (
    <main className={`${pageLayout.pageWrapper} container`}>
      <SpendingBarChart
        title="消費支出（名目）"
        testId="b3m-boundary-chart"
        data={data}
        keys={keys}
        colors={keys.map(getColorForNominalKey)}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={CHART_COLORS}
        tooltipProps={tooltip.tooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
      />
    </main>
  );
}

function SpendingMobileTooltipFixture() {
  const keys = [...QUARTERLY_PLAN40_V2_NOMINAL_KEYS];
  const data = createSpendingData().slice(0, 1);
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: true });
  const tooltip = bind("b3m-mobile-acceptance", {
    dataLength: data.length,
    showAllPayload: true,
    includeUnmappedPayload: true,
  });
  return (
    <div style={{ width: 375 }}>
      <SpendingBarChart
        title="消費支出（名目）"
        testId="b3m-mobile-tooltip-chart"
        data={data}
        keys={keys}
        colors={keys.map(getColorForNominalKey)}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={CHART_COLORS}
        tooltipProps={tooltip.tooltipProps}
        onClick={tooltip.onClick}
        onPointerDown={tooltip.onPointerDown}
        onPointerMove={tooltip.onPointerMove}
        onMouseMove={tooltip.onMouseMove}
        onPointerLeave={tooltip.onPointerLeave}
        onMouseLeave={tooltip.onMouseLeave}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
        isMobile
      />
    </div>
  );
}

const EARNINGS_DATA: CpiData[] = ["2025年1月", "2025年2月"].map((年月, index) => ({
  年月,
  総合: 100,
  生鮮食品を除く総合: 99,
  持家の帰属家賃を除く総合: 98,
  "消費支出（参考）": null,
  "CPI総合(参考)": 100,
  所定内給与: 250 + index,
  所定外給与: 45 + index,
  特別給与: 80 + index,
  時間当たり給与: 280 + index,
  "15歳以上国民当たり給与": 210 + index,
}));

function EarningsTooltipFixture() {
  const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
  const tooltip = bind("b3m-earnings-mobile", {
    dataLength: EARNINGS_DATA.length,
    showTotal: true,
    totalIncludedKeys: [...EARNINGS_TOTAL_KEYS],
    separatorBetweenGroups: {
      firstGroupKeys: [...EARNINGS_TOTAL_KEYS],
      secondGroupKeys: [...EARNINGS_AUXILIARY_KEYS],
    },
    showAllPayload: true,
    seriesMeta: EARNINGS_SERIES_REGISTRY,
  });
  return (
    <div style={{ width: "100%" }}>
      <EarningsBreakdownChart
        data={EARNINGS_DATA}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={CHART_COLORS}
        isMobile
        tooltipProps={tooltip.tooltipProps}
      />
    </div>
  );
}

afterEach(() => {
  window.__MOUNT_ALL__ = false;
});

describe("B3m responsive", () => {
  for (const width of [768, 769] as const) {
    it(`p45-b-consumption-boundary-85-${width}`, async () => {
      await page.viewport(width, 667);
      renderBrowserComponent(<SpendingBoundaryFixture />);
      const section = await page.getByTestId("b3m-boundary-chart").element();
      const chart = section.querySelector<HTMLElement>('[role="img"][aria-label$="の推移グラフ"]');
      if (!chart) throw new Error("Actual SpendingBarChart wrapper was not rendered");
      const container = section.closest<HTMLElement>(".container");
      if (!container) throw new Error("Production-equivalent .container ancestor was not rendered");
      expect(getComputedStyle(container).paddingTop).toBe(width === 768 ? "24px" : "64px");
      expect(getComputedStyle(chart).aspectRatio).toBe(width === 768 ? "auto" : "4 / 3");
      if (width === 768) {
        expect(parseFloat(getComputedStyle(section).paddingBottom)).toBeGreaterThanOrEqual(32);
      }
    });
  }

  it("p45-b-consumption-mobile-acceptance-187", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<SpendingMobileTooltipFixture />);
    const chart = page.getByTestId("b3m-mobile-tooltip-chart");
    const chartElement = await chart.element();
    const bar = chartElement.querySelector<HTMLElement>(".recharts-bar-rectangle");
    expect(bar).not.toBeNull();
    expect(bar).toBeVisible();
    await userEvent.click(bar!);
    const tooltip = chartElement.querySelector<HTMLElement>('[data-custom-tooltip="true"]');
    expect(tooltip).not.toBeNull();
    expect(tooltip).toBeVisible();
    const close = page.getByRole("button", { name: "閉じる" });
    await expect.element(close).toBeVisible();
    await close.click();
    expect(tooltip).not.toBeInTheDocument();
  });

  for (const width of [375, 430] as const) {
    it(`p45-b-consumption-mobile-readability-191-${width}`, async () => {
      await page.viewport(width, 667);
      renderBrowserComponent(<EarningsTooltipFixture />);
      const chart = page.getByRole("img", { name: "給与指標と関連指標の推移グラフ" });
      const chartElement = await chart.element();
      const interactionTarget = chartElement.querySelector<HTMLElement>(".recharts-wrapper");
      expect(interactionTarget).not.toBeNull();
      expect(interactionTarget).toBeVisible();
      await userEvent.click(interactionTarget!);
      const tooltip = document.querySelector<HTMLElement>('[data-tooltip-root="true"]');
      expect(tooltip).not.toBeNull();
      expect(tooltip).toBeVisible();
      expect(tooltip?.querySelectorAll('[data-tooltip-row="true"]')).toHaveLength(6);
      expect(tooltip?.querySelector('[data-tooltip-total="true"]')).not.toBeNull();
      for (const label of [
        "所定内給与",
        "所定外給与",
        "特別給与",
        "時間当たり給与",
        "15歳以上国民当たり給与",
        "物価指数総合(参考)",
      ]) {
        const matchingLabel = [...(tooltip?.querySelectorAll<HTMLElement>("*") ?? [])].find(
          (element) => element.textContent?.trim() === label,
        );
        expect(matchingLabel).toBeDefined();
        expect(matchingLabel).toBeVisible();
      }
    });
  }

  it("p45-b-mobile-ux-243", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(
      <SectionTabs
        sections={CPI_CHART_SECTIONS}
        activeId="section-stacked"
        onSelect={() => {}}
        rangeLabel="2020–2022"
        onRangeClick={() => {}}
      />,
    );
    const tabs = document.querySelector<HTMLElement>("[class*='sectionTabs']");
    if (!tabs) throw new Error("Actual SectionTabs element was not rendered");
    expect(getComputedStyle(tabs).position).toBe("sticky");
    expect(getComputedStyle(tabs).transform).not.toBe("none");
  });

  it("p45-b-mobile-ux-47-375", async () => {
    await page.viewport(375, 667);
    window.__MOUNT_ALL__ = true;
    window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2022`);
    renderBrowserComponent(<CpiChartResponsiveFixture />);
    const container = document.querySelector<HTMLElement>("[class*='chartContainer']");
    if (!container) throw new Error("Actual CpiChart container was not rendered");
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
  });

  for (const width of [320, 375, 390, 430] as const) {
    it(`p45-b-mobile-ux-65-${width}`, async () => {
      await page.viewport(width, 667);
      window.__MOUNT_ALL__ = true;
      window.history.replaceState(null, "", `${window.location.pathname}?from=2020&to=2022`);
      renderBrowserComponent(<CpiChartResponsiveFixture />);
      const container = document.querySelector<HTMLElement>("[class*='chartContainer']");
      if (!container) throw new Error("Actual CpiChart container was not rendered");
      expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
    });
  }
});
