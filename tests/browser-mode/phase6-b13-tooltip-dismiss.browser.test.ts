import { beforeEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import type { Phase6B13Id } from "./phase6-b13.route.command";

vi.setConfig({ testTimeout: 90_000 });

beforeEach(async () => {
  await page.viewport(1280, 720);
});

const STACKED_OUTSIDE_TAP: Phase6B13Id = "p45-b-tooltip-dismiss-473-case01";
const STACKED_CLOSE: Phase6B13Id = "p45-b-tooltip-dismiss-508-case01";
const TAB_SCROLL_SETTLE: Phase6B13Id = "p45-b-tooltip-dismiss-535-case01";

type ContextEvidence = {
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  deviceScaleFactor: number;
  touchPoints: number;
  userAgent: string;
};

function expectPixel7TouchContext(evidence: ContextEvidence) {
  expect(evidence.viewport).toEqual({ width: 412, height: 839 });
  expect(evidence.screen).toEqual({ width: 412, height: 915 });
  expect(evidence.deviceScaleFactor).toBe(2.625);
  expect(evidence.touchPoints).toBeGreaterThan(0);
  expect(evidence.userAgent).toContain("Pixel 7");
}

it("B13 #473: outside-heading touch clears stacked chart cursor and active dots", async () => {
  const result = (await commands.inspectPhase6B13(STACKED_OUTSIDE_TAP)) as {
    contextEvidence: ContextEvidence;
    boxAvailable: boolean;
    closeVisibleAfterTap: boolean;
    cursorCountAfterTap: number;
    activeDotCountAfterTap: number;
    closeHiddenAfterHeadingTouch: boolean;
    cursorCountAfterDismiss: number;
    activeDotCountAfterDismiss: number;
  };
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.boxAvailable).toBe(true);
  expect(result.closeVisibleAfterTap).toBe(true);
  expect(result.cursorCountAfterTap).toBe(1);
  expect(result.activeDotCountAfterTap).toBeGreaterThan(0);
  expect(result.closeHiddenAfterHeadingTouch).toBe(true);
  expect(result.cursorCountAfterDismiss).toBe(0);
  expect(result.activeDotCountAfterDismiss).toBe(0);
});

it("B13 #508: close touch clears stacked chart active dots", async () => {
  const result = (await commands.inspectPhase6B13(STACKED_CLOSE)) as {
    contextEvidence: ContextEvidence;
    boxAvailable: boolean;
    closeVisibleAfterTap: boolean;
    activeDotCountAfterTap: number;
    closeHiddenAfterCloseTouch: boolean;
    activeDotCountAfterClose: number;
  };
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.boxAvailable).toBe(true);
  expect(result.closeVisibleAfterTap).toBe(true);
  expect(result.activeDotCountAfterTap).toBeGreaterThan(0);
  expect(result.closeHiddenAfterCloseTouch).toBe(true);
  expect(result.activeDotCountAfterClose).toBe(0);
});

it("B13 #535: close button is hidden after salary-tab touch and scroll settle", async () => {
  const result = (await commands.inspectPhase6B13(TAB_SCROLL_SETTLE)) as {
    contextEvidence: ContextEvidence;
    stableSamples: number;
    closeHiddenAfterGesture: boolean;
    closeHiddenAfterSettle: boolean;
  };
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.stableSamples).toBeGreaterThanOrEqual(2);
  expect(result.closeHiddenAfterGesture).toBe(true);
  expect(result.closeHiddenAfterSettle).toBe(true);
});
