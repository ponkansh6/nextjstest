import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY } from "../../src/lib/chartConstants";
import type { Batch3ARouteCase } from "./batch3-a-route.command";

vi.setConfig({ testTimeout: 45_000 });

async function inspect(scenario: Batch3ARouteCase) {
  const result = await commands.inspectBatch3AProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

function expectPixel7Context(
  values: Record<string, any>,
  viewport: { width: number; height: number },
) {
  const descriptor = values.pixel7Descriptor;
  const observed = values.pixel7Context;
  expect(descriptor.isMobile).toBe(true);
  expect(descriptor.hasTouch).toBe(true);
  expect(descriptor.deviceScaleFactor).toBe(2.625);
  expect(descriptor.screen).toEqual({ width: 412, height: 915 });
  expect(observed.viewport).toEqual(viewport);
  expect(observed.screen).toEqual(descriptor.screen);
  expect(observed.deviceScaleFactor).toBe(2.625);
  expect(observed.maxTouchPoints).toBeGreaterThan(0);
  expect(observed.userAgent).toBe(descriptor.userAgent);
  expect(observed.userAgent).toMatch(/Pixel 7/);
}

it("p45-b-consumption-mobile-readability-52-430px-y-x — production route keeps both charts and axes readable", async () => {
  const values = await inspect("readability-430");
  expectPixel7Context(values, { width: 430, height: 667 });
  const measurements = values.measurements as {
    visible: boolean;
    sectionPaddingBottom: number;
    wrapperWidth: number;
    svgLeft: number;
    svgRight: number;
    svgTop: number;
    svgBottom: number;
    barWidth: number;
    barCenterGaps: number[];
    yTickCount: number;
    yValues: number[];
    xTickCount: number;
    xTexts: string[];
    xTextGeometry: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
      textAnchor: string | null;
    }[];
  }[];
  expect(measurements).toHaveLength(2);
  for (const chart of measurements) {
    expect(chart.visible).toBe(true);
    expect(chart.sectionPaddingBottom).toBeGreaterThanOrEqual(32);
    expect(chart.wrapperWidth).toBeLessThanOrEqual(430 - 16 + 1);
    expect(chart.svgLeft).toBeGreaterThanOrEqual(0);
    expect(chart.svgRight).toBeLessThanOrEqual(430 + 1);
    expect(chart.yTickCount).toBeGreaterThan(1);
    expect(chart.yValues.length).toBeGreaterThan(1);
    expect(chart.yValues.every((value) => value >= 0)).toBe(true);
    expect(chart.barWidth).toBeGreaterThan(0);
    expect(chart.barWidth).toBeLessThanOrEqual(11);
    expect(chart.barCenterGaps).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(Math.min(...chart.barCenterGaps)).toBeGreaterThan(chart.barWidth);
    expect(chart.xTickCount).toBeGreaterThan(1);
    expect(chart.xTexts).toHaveLength(chart.xTickCount);
    expect(chart.xTexts.every((text) => /^\d{4}Q[1-4]$/.test(text))).toBe(true);
    expect(chart.xTextGeometry).toHaveLength(chart.xTickCount);
    expect(
      chart.xTextGeometry.every(
        (box) =>
          [box.left, box.right, box.top, box.bottom, box.width, box.height].every(
            Number.isFinite,
          ) &&
          box.width > 0 &&
          box.height > 0 &&
          box.top >= chart.svgTop &&
          box.bottom <= chart.svgBottom &&
          box.textAnchor === "middle",
      ),
    ).toBe(true);
  }
  expect(values.documentOverflow.scrollWidth).toBeLessThanOrEqual(
    values.documentOverflow.clientWidth,
  );
});

for (const [scenario, label, width, height] of [
  ["tooltip-scroll-375", "375x667", 375, 667],
  ["tooltip-scroll-320", "320x480", 320, 480],
  ["tooltip-scroll-landscape", "667x375 landscape", 667, 375],
] as const) {
  it(`p45-b-consumption-mobile-readability-297-${label}-tooltip — production tooltip data, viewport bounds, scroll close and dismissal`, async () => {
    const values = await inspect(scenario);
    if (scenario === "tooltip-scroll-375") {
      expectPixel7Context(values, { width: 375, height: 667 });
    }
    const charts = values.charts as {
      id: string;
      expectedKeys: string[];
      payloadKeys: (string | null)[];
      box: { left: number; right: number; top: number; bottom: number };
      scrollPosition: { scrollTop: number; scrollHeight: number; clientHeight: number };
      closeBox: { left: number; right: number; top: number; bottom: number };
      dismissed: boolean;
    }[];
    expect(charts).toHaveLength(2);
    for (const chart of charts) {
      if (chart.id === "spending-chart-real") {
        expect(chart.expectedKeys).not.toContain(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY);
        expect(chart.payloadKeys).not.toContain(CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY);
      }
      expect([...chart.payloadKeys].sort()).toEqual([...chart.expectedKeys].sort());
      expect(chart.scrollPosition.scrollTop).toBeGreaterThanOrEqual(
        chart.scrollPosition.scrollHeight - chart.scrollPosition.clientHeight - 1,
      );
      expect(chart.box.left).toBeGreaterThanOrEqual(0);
      expect(chart.box.right).toBeLessThanOrEqual(width);
      expect(chart.box.top).toBeGreaterThanOrEqual(0);
      expect(chart.box.bottom).toBeLessThanOrEqual(height);
      expect(chart.closeBox.left).toBeGreaterThanOrEqual(0);
      expect(chart.closeBox.right).toBeLessThanOrEqual(width);
      expect(chart.closeBox.top).toBeGreaterThanOrEqual(0);
      expect(chart.closeBox.bottom).toBeLessThanOrEqual(height);
      expect(chart.dismissed).toBe(true);
    }
  });
}

it("p45-b-mobile-ux-19-ux — production visible buttons meet their own target thresholds", async () => {
  const values = await inspect("mobile-tap-targets");
  expect(values.buttonCount).toBeGreaterThan(0);
  expect(values.tooSmall).toEqual([]);
});

it("p45-b-mobile-ux-79-ux-375px-select — production sheet and max button geometry", async () => {
  const values = await inspect("mobile-range-layout");
  const start = values.startBox;
  const end = values.endBox;
  const button = values.maxBox;
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  expect(button).not.toBeNull();
  expect(button.x).toBeGreaterThanOrEqual(end.x + end.width - 1);
  expect(Math.abs(end.y - button.y)).toBeLessThan(Math.min(end.height, button.height) * 0.5);
  expect(button.x + button.width).toBeGreaterThan(end.x + end.width);
});

it("p45-b-mobile-ux-112-ux-375px-select — production sheet start and end controls have matching widths", async () => {
  const values = await inspect("mobile-range-layout");
  expect(values.startBox).not.toBeNull();
  expect(values.endBox).not.toBeNull();
  expect(Math.abs(values.startBox.width - values.endBox.width)).toBeLessThanOrEqual(4);
});

it("p45-b-mobile-ux-140-ux-375px-3 — production sheet controls share one row", async () => {
  const values = await inspect("mobile-range-layout");
  const { startBox: start, endBox: end, maxBox: button } = values;
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  expect(button).not.toBeNull();
  expect(Math.abs(start.y - end.y)).toBeLessThan(15);
  expect(Math.abs(end.y - button.y)).toBeLessThan(15);
  expect(start.x).toBeLessThan(end.x);
  expect(end.x + end.width).toBeLessThanOrEqual(button.x + 10);
});

// LazyMount source crosswalk: row 49 owns the initial-absence predicate
// (P42-349); row 50 owns the separate post-scroll reveal predicate (P42-350).
// P42-351 remains the distinct unit-owned contract.
it("p45-b-mobile-ux-192-lazymount-p5-1 — production route initially leaves the lower chart unmounted", async () => {
  const values = await inspect("lazymount-initial");
  expect(values.sectionCount).toBe(0);
});

it("p45-b-mobile-ux-201-lazymount-p5-1 — production route mounts the lower chart after scrolling", async () => {
  const values = await inspect("lazymount-scroll");
  expect(values.beforeScrollCount).toBe(0);
  expect(values.scrollHeight).toBeGreaterThan(667);
  expect(values.afterScrollCount).toBe(1);
  expect(values.scrollY).toBeGreaterThan(0);
});
