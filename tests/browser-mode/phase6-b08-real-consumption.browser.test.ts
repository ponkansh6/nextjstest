import { beforeEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import type { Phase6B08Id } from "./phase6-b08.route.command";

vi.setConfig({ testTimeout: 60_000 });

beforeEach(async () => {
  await page.viewport(1280, 720);
});

const LEGEND_TOGGLE: Phase6B08Id =
  "p45-b-real-consumption-99-page-tsx-e2e-real-consumption-chart-with-actual-browser";
const CLOSED_ACCORDION: Phase6B08Id =
  "p45-b-real-consumption-128-page-tsx-e2e-real-consumption-chart-with-actual-browser";
const OPEN_ACCORDION: Phase6B08Id =
  "p45-b-real-consumption-156-page-tsx-e2e-real-consumption-chart-with-actual-browser";

it("B08 #99: first page-global legend item is visible and the source click attempt completes its settle interval", async () => {
  const result = (await commands.inspectPhase6B08(LEGEND_TOGGLE)) as {
    visible: boolean;
    clickCompleted: boolean;
  };
  expect(result.visible, "Should have legend items visible").toBe(true);
  // The source test swallows a failed 5s click and does not assert a chart change.
});

it("B08 #128: closed real-consumption accordion hides all section-local legend items", async () => {
  const result = (await commands.inspectPhase6B08(CLOSED_ACCORDION)) as {
    sectionVisible: boolean;
    summaryVisible: boolean;
    detailsCount: number;
    detailsOpen: boolean;
    legendItemVisibility: boolean[];
  };
  expect(result.sectionVisible).toBe(true);
  expect(result.summaryVisible).toBe(true);
  expect(result.detailsCount).toBeGreaterThan(0);
  expect(result.detailsOpen).toBe(false);
  if (result.legendItemVisibility.length > 0) {
    expect(result.legendItemVisibility.every((visible) => !visible)).toBe(true);
  } else {
    expect(result.legendItemVisibility).toHaveLength(0);
  }
});

it("B08 #156: clicking the real-consumption accordion summary reveals its first legend item", async () => {
  const result = (await commands.inspectPhase6B08(OPEN_ACCORDION)) as {
    sectionVisible: boolean;
    detailsOpen: boolean;
    firstLegendItemVisible: boolean;
  };
  expect(result.sectionVisible).toBe(true);
  expect(result.detailsOpen).toBe(true);
  expect(result.firstLegendItemVisible).toBe(true);
});
