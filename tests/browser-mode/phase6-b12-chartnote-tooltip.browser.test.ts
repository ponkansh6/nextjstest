import { beforeEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import type { Phase6B12Id } from "./phase6-b12.route.command";

vi.setConfig({ testTimeout: 90_000 });

beforeEach(async () => {
  await page.viewport(1280, 720);
});

const ENGINEERED_OVERLAP: Phase6B12Id =
  "p45-b-tooltip-dismiss-307-viewport-chartnote-tooltip-tooltip-chartnote-tooltip";
const NORMAL_LINK_TAP: Phase6B12Id = "p45-b-tooltip-dismiss-430-tooltip-chartnote-tooltip";

type Pixel7Evidence = {
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  deviceScaleFactor: number;
  touchPoints: number;
  userAgent: string;
};

function expectPixel7FixedViewport(evidence: Pixel7Evidence) {
  expect(evidence.viewport).toEqual({ width: 412, height: 915 });
  expect(evidence.screen).toEqual({ width: 412, height: 915 });
  expect(evidence.deviceScaleFactor).toBe(2.625);
  expect(evidence.touchPoints).toBeGreaterThan(0);
  expect(evidence.userAgent).toContain("Pixel 7");
}

it("B12 #307: deliberately engineered actual link overlap is hit-tested by tooltip and blocks navigation", async () => {
  const result = (await commands.inspectPhase6B12(ENGINEERED_OVERLAP)) as {
    contextEvidence: Pixel7Evidence;
    chartInViewport: boolean;
    linkAttached: boolean;
    tooltipBox: { x: number; y: number; width: number; height: number };
    linkBox: { x: number; y: number; width: number; height: number };
    movedLinkBox: { x: number; y: number; width: number; height: number };
    intersection: { x: number; y: number };
    elementFromPointHitTooltip: boolean;
    touchPerformed: boolean;
    urlBeforeTouch: string;
    urlAfterTouch: string;
    hashBeforeTouch: string;
    hashAfterTouch: string;
    tooltipVisibleAfterTouch: boolean;
  };
  expectPixel7FixedViewport(result.contextEvidence);
  expect(result.chartInViewport).toBe(true);
  expect(result.linkAttached).toBe(true);
  expect(result.movedLinkBox.width).toBeGreaterThan(0);
  expect(result.movedLinkBox.height).toBeGreaterThan(0);
  expect(result.intersection).not.toBeNull();
  expect(result.elementFromPointHitTooltip).toBe(true);
  expect(result.touchPerformed).toBe(true);
  expect(result.urlAfterTouch).toBe(result.urlBeforeTouch);
  expect(result.hashAfterTouch).toBe(result.hashBeforeTouch);
  expect(result.tooltipVisibleAfterTouch).toBe(true);
});

it("B12 #430: close the touch Drawer, then tap the actual chartNote link to navigate", async () => {
  const result = (await commands.inspectPhase6B12(NORMAL_LINK_TAP)) as {
    contextEvidence: Pixel7Evidence;
    drawerVisibleAfterBarTap: boolean;
    tooltipVisibleAfterBarTap: boolean;
    linkVisibleAfterTap: boolean;
    drawerHiddenAfterCloseTap: boolean;
    tooltipHiddenAfterCloseTap: boolean;
    linkBox: { x: number; y: number; width: number; height: number };
    linkTapPoint: { x: number; y: number };
    pointHitByLink: boolean;
    touchPerformed: boolean;
    hashAfterTap: string;
    drawerHiddenAfterNavigation: boolean;
    tooltipHiddenAfterNavigation: boolean;
  };
  expectPixel7FixedViewport(result.contextEvidence);
  expect(result.drawerVisibleAfterBarTap).toBe(true);
  expect(result.tooltipVisibleAfterBarTap).toBe(true);
  expect(result.linkVisibleAfterTap).toBe(true);
  expect(result.drawerHiddenAfterCloseTap).toBe(true);
  expect(result.tooltipHiddenAfterCloseTap).toBe(true);
  expect(result.linkBox.width).toBeGreaterThan(0);
  expect(result.linkBox.height).toBeGreaterThan(0);
  expect(result.pointHitByLink).toBe(true);
  expect(result.touchPerformed).toBe(true);
  expect(result.hashAfterTap).toBe("#section-consumption-nominal");
  expect(result.drawerHiddenAfterNavigation).toBe(true);
  expect(result.tooltipHiddenAfterNavigation).toBe(true);
});
