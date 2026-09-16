import { describe, expect, it } from "vitest";
import {
  COMPARISON_SERIES_REGISTRY,
  EARNINGS_SERIES_REGISTRY,
  EARNINGS_TABLE_CONFIGS,
  LINE_CONFIGS,
  QUARTERLY_GDP_COMPARISON_NOMINAL_KEY,
  QUARTERLY_GDP_COMPARISON_REAL_KEY,
  QUARTERLY_GDP_RAW_NOMINAL_KEY,
  QUARTERLY_GDP_RAW_REAL_KEY,
  SUPPORT_SERIES_KEY_NOMINAL,
  SUPPORT_SERIES_KEY_REAL,
  CPI_CATEGORIES,
  getDisplayLabel,
  stackedColors,
  type SeriesMetadata,
  buildCpiTooltipMetadata,
  projectTooltipMetadata,
} from "../../src/lib/chartConstants";

const projectMetadata = (series: readonly SeriesMetadata[]) =>
  series.map(({ key, label, displayName, color, type, kind, pairKey, advanced, strokeDasharray }) =>
    Object.fromEntries(
      Object.entries({
        key,
        label,
        displayName,
        color,
        type,
        kind,
        pairKey,
        advanced,
        strokeDasharray,
      }).filter(([, value]) => value !== undefined),
    ),
  );

describe("series registry contracts", () => {
  it("keeps compatibility aliases as the same array identity", () => {
    expect(EARNINGS_TABLE_CONFIGS).toBe(EARNINGS_SERIES_REGISTRY);
    expect(LINE_CONFIGS).toBe(COMPARISON_SERIES_REGISTRY);
  });

  it("preserves the earnings registry metadata and order", () => {
    expect(projectMetadata(EARNINGS_SERIES_REGISTRY)).toEqual([
      {
        key: "所定内給与",
        label: "所定内給与",
        displayName: "所定内給与",
        color: "#1e40af",
        type: "area",
        kind: "area",
      },
      {
        key: "所定外給与",
        label: "所定外給与",
        displayName: "所定外給与",
        color: "#3b82f6",
        type: "area",
        kind: "area",
      },
      {
        key: "特別給与",
        label: "特別給与",
        displayName: "特別給与",
        color: "#60a5fa",
        type: "area",
        kind: "area",
      },
      {
        key: "時間当たり給与",
        label: "時間当たり給与",
        displayName: "時間当たり給与",
        color: "#16a34a",
        type: "line",
        kind: "line",
      },
      {
        key: "15歳以上国民当たり給与",
        label: "15歳以上国民当たり給与",
        displayName: "15歳以上国民当たり給与",
        color: "#a3e635",
        type: "line",
        kind: "line",
      },
      {
        key: "CPI総合(参考)",
        label: "物価指数総合(参考)",
        displayName: "物価指数総合(参考)",
        color: "#eab308",
        type: "line",
        kind: "line",
      },
    ]);
  });

  it("preserves the comparison registry metadata and order", () => {
    expect(projectMetadata(COMPARISON_SERIES_REGISTRY)).toEqual([
      {
        key: "CPI総合(12MA)",
        label: "物価指数(総合)",
        displayName: "物価指数(総合)",
        color: "#65a30d",
      },
      { key: "総合(12MA)", label: "給与(総合)", displayName: "給与(総合)", color: "#e11d48" },
      {
        key: "CTI消費支出（参考）",
        label: "CTI消費(総合)",
        displayName: "CTI消費(総合)",
        color: "#2563eb",
      },
      {
        key: SUPPORT_SERIES_KEY_NOMINAL.replace("（名目）", "（参考）"),
        label: "民間最終消費(総合)",
        displayName: "民間最終消費(総合)",
        color: "#38bdf8",
      },
      {
        key: SUPPORT_SERIES_KEY_NOMINAL.replace("（名目）", "（参考・延長）"),
        label: "民間最終消費(延長・参考)",
        displayName: "民間最終消費(延長・参考)",
        color: "#7dd3fc",
        advanced: true,
        strokeDasharray: "6 3",
      },
    ]);
  });

  it("does not mix GDP internal series or SpendingBarChart-only series into these registries", () => {
    const keys = [...EARNINGS_SERIES_REGISTRY, ...COMPARISON_SERIES_REGISTRY].map(({ key }) => key);
    const forbiddenKeys = [
      QUARTERLY_GDP_RAW_NOMINAL_KEY,
      QUARTERLY_GDP_RAW_REAL_KEY,
      QUARTERLY_GDP_COMPARISON_NOMINAL_KEY,
      QUARTERLY_GDP_COMPARISON_REAL_KEY,
      SUPPORT_SERIES_KEY_NOMINAL,
      SUPPORT_SERIES_KEY_REAL,
    ];
    for (const forbiddenKey of forbiddenKeys) {
      expect(keys).not.toContain(forbiddenKey);
    }
  });

  it("keeps advanced comparison series opt-in", () => {
    const normalSeries = COMPARISON_SERIES_REGISTRY.filter(({ advanced }) => !advanced);
    expect(normalSeries.some(({ key }) => key === "民間最終消費支出（参考・延長）")).toBe(false);
    expect(
      COMPARISON_SERIES_REGISTRY.find(({ key }) => key === "民間最終消費支出（参考・延長）")
        ?.advanced,
    ).toBe(true);
  });

  it("exposes stable tooltip/legend labels and unique numeric order", () => {
    expect(
      EARNINGS_SERIES_REGISTRY.every((series) => series.tooltipLabel && series.order !== undefined),
    ).toBe(true);
    expect(
      COMPARISON_SERIES_REGISTRY.every((series) => series.tooltipLabel === series.legendLabel),
    ).toBe(true);
    expect(new Set(COMPARISON_SERIES_REGISTRY.map((series) => series.order)).size).toBe(
      COMPARISON_SERIES_REGISTRY.length,
    );
    expect(COMPARISON_SERIES_REGISTRY.map(({ order }) => order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps comparison tooltip labels, colors, order, and advanced visibility synchronized", () => {
    expect(
      COMPARISON_SERIES_REGISTRY.map(
        ({ key, tooltipLabel, legendLabel, color, order, advanced }) => ({
          key,
          tooltipLabel,
          legendLabel,
          color,
          order,
          advanced: advanced ?? false,
        }),
      ),
    ).toEqual([
      {
        key: "CPI総合(12MA)",
        tooltipLabel: "物価指数(総合)",
        legendLabel: "物価指数(総合)",
        color: "#65a30d",
        order: 0,
        advanced: false,
      },
      {
        key: "総合(12MA)",
        tooltipLabel: "給与(総合)",
        legendLabel: "給与(総合)",
        color: "#e11d48",
        order: 1,
        advanced: false,
      },
      {
        key: "CTI消費支出（参考）",
        tooltipLabel: "CTI消費(総合)",
        legendLabel: "CTI消費(総合)",
        color: "#2563eb",
        order: 2,
        advanced: false,
      },
      {
        key: "民間最終消費支出（参考）",
        tooltipLabel: "民間最終消費(総合)",
        legendLabel: "民間最終消費(総合)",
        color: "#38bdf8",
        order: 3,
        advanced: false,
      },
      {
        key: "民間最終消費支出（参考・延長）",
        tooltipLabel: "民間最終消費(延長・参考)",
        legendLabel: "民間最終消費(延長・参考)",
        color: "#7dd3fc",
        order: 4,
        advanced: true,
      },
    ]);
  });

  it("projects tooltip labels by key and preserves registry order/color", () => {
    expect(projectTooltipMetadata(COMPARISON_SERIES_REGISTRY)).toEqual(
      COMPARISON_SERIES_REGISTRY.map(({ key, tooltipLabel, color, order, advanced }) => ({
        key,
        label: tooltipLabel,
        color,
        order,
        ...(advanced === undefined ? {} : { advanced }),
      })),
    );
    expect(projectTooltipMetadata(EARNINGS_SERIES_REGISTRY, ["CPI総合(参考)"])[0]).toMatchObject({
      key: "CPI総合(参考)",
      label: "物価指数総合(参考)",
      order: 5,
    });
  });

  it("builds all CPI tooltip metadata from the category/palette pairing", () => {
    expect(buildCpiTooltipMetadata()).toEqual(
      CPI_CATEGORIES.map((key, order) => ({
        key,
        label: getDisplayLabel(key),
        color: stackedColors[order],
        order,
      })),
    );
    expect(buildCpiTooltipMetadata([CPI_CATEGORIES[0]])).toHaveLength(1);
  });
});
