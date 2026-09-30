import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import type { Batch4BRouteCase } from "./batch4-b-route.command";

vi.setConfig({ testTimeout: 45_000 });

async function inspect(scenario: Batch4BRouteCase) {
  const result = await commands.inspectBatch4BProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

for (const [scenario, chart, stableId] of [
  ["start-nominal", "spending-chart-nominal", "range-change-119"],
  ["start-real", "spending-chart-real", "range-change-136"],
  ["end-nominal", "spending-chart-nominal", "range-change-153"],
  ["end-real", "spending-chart-real", "range-change-170"],
] as const) {
  it(`p45-b-${stableId}-e2e — production ${chart} data narrows and a visible bar remains after changing the range`, async () => {
    const values = await inspect(scenario);
    expect(values.testId).toBe(chart);
    const before = values.before as { periods: number; visibleBars: number };
    const after = values.after as { periods: number; visibleBars: number };
    expect(before.periods).toBeGreaterThan(after.periods);
    expect(after.periods).toBeGreaterThan(0);
    expect(after.visibleBars).toBeGreaterThan(0);
  });
}

it("p45-b-range-change-242-e2e — production range interactions emit no console or page errors", async () => {
  expect(await inspect("range-errors")).toEqual({ errors: [] });
});

it("p45-b-range-change-273-e2e — production start-year change preserves scroll within 50px", async () => {
  const values = await inspect("range-scroll");
  expect(values.before).toBeGreaterThan(50);
  expect(Math.abs((values.after as number) - (values.before as number))).toBeLessThan(50);
});

it("p45-b-section-tabs-scroll-47-3-chromium — production 3種比較 tab brings its section into the viewport", async () => {
  const target = (await inspect("section-tab-target-chromium")).target as {
    top: number;
    bottom: number;
    before: number;
    scrollY: number;
    inViewport: boolean;
  };
  expect(target.scrollY).toBeGreaterThan(target.before);
  expect(target.inViewport).toBe(true);
  expect(target.bottom).toBeGreaterThan(0);
  expect(target.top).toBeLessThan(720);
});
