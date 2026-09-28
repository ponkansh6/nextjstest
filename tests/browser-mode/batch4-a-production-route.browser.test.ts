import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import type { Batch4ARouteCase } from "./batch4-a-route.command";

vi.setConfig({ testTimeout: 45_000 });

async function inspect(scenario: Batch4ARouteCase) {
  const result = await commands.inspectBatch4AProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

const earningsLabels = [
  "所定内給与",
  "所定外給与",
  "特別給与",
  "時間当たり給与",
  "15歳以上国民当たり給与",
  "物価指数総合(参考)",
];
const earningsTotalLabel = "給与区分合計（所定内＋所定外＋特別）";

for (const width of [375, 430] as const) {
  it(`p45-b-consumption-mobile-readability-191-${width}px-tooltip — production earnings rows and total remain readable in viewport`, async () => {
    const values = await inspect(`earnings-readability-${width}`);
    const tooltip = values.tooltip as {
      rootBox: { left: number; right: number; top: number; bottom: number };
      rows: {
        label: string | null;
        value: string | null;
        rowBox: { left: number; right: number; top: number; bottom: number };
        labelMeasure: { scrollWidth: number; clientWidth: number } | null;
        separator: boolean;
        borderTop: string;
      }[];
      total: {
        label: string | null;
        value: string | null;
        box: { left: number; right: number; top: number; bottom: number } | null;
      };
      viewport: { width: number; height: number };
    };
    expect(tooltip.viewport.width).toBe(width);
    expect(tooltip.rows.map((row) => row.label)).toEqual(earningsLabels);
    expect(tooltip.rows).toHaveLength(6);
    expect(tooltip.rows.every((row) => /^\d+\.\d{2}$/.test(row.value ?? ""))).toBe(true);
    const separators = tooltip.rows.filter((row) => row.separator);
    expect(separators).toHaveLength(1);
    expect(separators[0].label).toBe("時間当たり給与");
    expect(separators[0].borderTop).not.toBe("0px");
    expect(tooltip.total.label).toBe(earningsTotalLabel);
    expect(tooltip.total.value).toMatch(/^\d+\.\d{2}$/);
    expect(
      tooltip.rows.every(
        (row) =>
          row.labelMeasure !== null && row.labelMeasure.scrollWidth >= row.labelMeasure.clientWidth,
      ),
    ).toBe(true);
    const withinViewport = (box: { left: number; right: number; top: number; bottom: number }) =>
      box.left >= 0 &&
      box.right <= tooltip.viewport.width &&
      box.top >= 0 &&
      box.bottom <= tooltip.viewport.height;
    expect(withinViewport(tooltip.rootBox)).toBe(true);
    expect(tooltip.rows.every((row) => withinViewport(row.rowBox))).toBe(true);
    expect(tooltip.total.box).not.toBeNull();
    if (tooltip.total.box) expect(withinViewport(tooltip.total.box)).toBe(true);
  });
}

it("p45-b-mobile-ux-243-sectiontabs-sticky-android-chrome — production route applies sticky compositing transform in mobile browser context", async () => {
  const values = await inspect("sticky-tabs-transform");
  expect(values.transform).not.toBeNull();
  expect(values.transform).not.toBe("none");
  const browserContext = values.browserContext as {
    engine: string;
    mobileEmulation: boolean;
    touchEnabled: boolean;
    viewport: { width: number; height: number };
    screen: { width: number; height: number };
    deviceScaleFactor: number;
    touchPoints: number;
    userAgent: string;
  };
  expect(browserContext.engine).toBe("chromium");
  expect(browserContext.mobileEmulation).toBe(true);
  expect(browserContext.touchEnabled).toBe(true);
  expect(browserContext.viewport).toEqual({ width: 375, height: 667 });
  expect(browserContext.screen).toEqual({ width: 412, height: 915 });
  expect(browserContext.deviceScaleFactor).toBe(2.625);
  expect(browserContext.touchPoints).toBeGreaterThan(0);
  expect(browserContext.userAgent).toMatch(/Android 14; Pixel 7/);
});

for (const width of [320, 375, 390, 430] as const) {
  it(`p45-b-mobile-ux-65-${width}px-overflow — production document has no horizontal overflow`, async () => {
    const values = await inspect(`document-overflow-${width}`);
    const overflow = values.overflow as {
      document: { scrollWidth: number; clientWidth: number };
      chart: { scrollWidth: number; clientWidth: number };
    };
    expect(overflow.document.scrollWidth).toBeLessThanOrEqual(overflow.document.clientWidth);
    expect(overflow.chart.scrollWidth).toBeLessThanOrEqual(overflow.chart.clientWidth);
  });
}
