import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { StackedAreaChart } from "../../src/app/components/StackedAreaChart";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
// @ts-expect-error Vitest's Vite transform resolves this raw CSS import at runtime.
import globalsCss from "../../src/app/globals.css?raw";
import {
  CPI_CATEGORIES,
  getColorForNominalKey,
  getLegendLabel,
  stackedColors,
} from "../../src/lib/chartConstants";
import type { CpiData } from "../../src/types";
import { renderBrowserComponent } from "./renderBrowserComponent";

const chartColors = { gridStroke: "#e2e8f0", axisText: "#64748b" };
const tooltipProps = {
  cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
  trigger: "hover" as const,
  content: <div />,
};

function cpiFixture(overrides: Partial<CpiData> = {}): CpiData {
  return {
    年月: "2022年1月",
    総合: 0,
    生鮮食品を除く総合: 0,
    持家の帰属家賃を除く総合: 0,
    "消費支出（参考）": null,
    "CPI総合(参考)": null,
    ...overrides,
  };
}

function sourceCssToken(name: string): string {
  const match = globalsCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`globals.css に --${name} が見つからない`);
  return match[1];
}

function expectedRgb(hex: string): string {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hex}`);
  return `rgb(${channels.join(", ")})`;
}

function installSourceToken(name: string) {
  const value = sourceCssToken(name);
  document.documentElement.style.setProperty(`--${name}`, value);
  return value;
}

describe("chart legend source CSS tokens in Chromium", () => {
  it("p45-a-legend-dark-all12 — P42-321: renders all 12 CPI legend buttons under a dark root", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const data = cpiFixture(Object.fromEntries(CPI_CATEGORIES.map((category) => [category, 1])));

    renderBrowserComponent(
      <StackedAreaChart
        title="費目別寄与度"
        data={[data]}
        keys={CPI_CATEGORIES}
        colors={stackedColors}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={chartColors}
        tooltipProps={tooltipProps}
        onReset={() => {}}
      />,
    );

    for (const category of CPI_CATEGORIES) {
      await expect
        .element(page.getByRole("button", { name: getLegendLabel(category), exact: true }))
        .toBeVisible();
    }
  });

  it("p45-a-legend-entertainment-series9 — P42-316/-317: renders the CPI series-9 source token on the real legend swatch", async () => {
    const tokenValue = installSourceToken("series-9");
    const key = "教養娯楽";
    const color = stackedColors[CPI_CATEGORIES.indexOf(key)];

    renderBrowserComponent(
      <StackedAreaChart
        title="費目別寄与度"
        data={[cpiFixture({ [key]: 1 })]}
        keys={[key]}
        colors={[color]}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={chartColors}
        tooltipProps={tooltipProps}
        onReset={() => {}}
      />,
    );

    const legendButton = page.getByRole("button", { name: getLegendLabel(key), exact: true });
    await expect.element(legendButton).toBeVisible();
    const swatch = (await legendButton.element()).querySelector("span");
    if (!swatch) throw new Error("Legend swatch is missing");
    expect(getComputedStyle(swatch).backgroundColor).toBe(expectedRgb(tokenValue));
  });

  it("p45-a-legend-food-nominal — P42-318/-319: renders the nominal-food source token on the real spending legend swatch", async () => {
    const tokenValue = installSourceToken("nominal-food");
    const key = "食料（名目）";

    renderBrowserComponent(
      <SpendingBarChart
        title="消費支出（名目）"
        data={[{ label: "2025Q1", 年: 2025, quarter: 1, 年月: "2025Q1", [key]: 100 }]}
        keys={[key]}
        colors={[getColorForNominalKey(key)]}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={{ ...chartColors, barFill: "#94a3b8" }}
        tooltipProps={tooltipProps}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
      />,
    );

    const legendButton = page.getByRole("button", { name: getLegendLabel(key), exact: true });
    await expect.element(legendButton).toBeVisible();
    const swatch = (await legendButton.element()).querySelector("span");
    if (!swatch) throw new Error("Legend swatch is missing");
    expect(getComputedStyle(swatch).backgroundColor).toBe(expectedRgb(tokenValue));
  });
});
