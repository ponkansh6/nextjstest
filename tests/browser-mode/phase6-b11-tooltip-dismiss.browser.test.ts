import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Phase6B11Id } from "./phase6-b11.route.command";

const SWITCH_CHART: Phase6B11Id = "p45-b-tooltip-dismiss-207-1";
const SWIPE_DISMISS: Phase6B11Id = "p45-b-tooltip-dismiss-249-case01";
const CLOSE_RETAP: Phase6B11Id = "p45-b-tooltip-dismiss-284-case01";

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

it("B11 #207: tapping a real chart replaces the single active guide line", async () => {
  const result = (await commands.inspectPhase6B11(SWITCH_CHART)) as {
    contextEvidence: ContextEvidence;
    cursorAfterNominal: number;
    closeVisibleAfterNominal: boolean;
    cursorAfterReal: number;
    closeVisibleAfterReal: boolean;
  };
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.cursorAfterNominal).toBe(1);
  expect(result.closeVisibleAfterNominal).toBe(true);
  expect(result.cursorAfterReal).toBe(1);
  expect(result.closeVisibleAfterReal).toBe(true);
});

it("B11 #249: a vertical touch gesture ends with the close button hidden", async () => {
  const result = (await commands.inspectPhase6B11(SWIPE_DISMISS)) as {
    contextEvidence: ContextEvidence;
    gestureDispatched: boolean;
    closeHiddenAtGestureEnd?: boolean;
  };
  expectPixel7TouchContext(result.contextEvidence);
  // The source test returns early when its wrapper bounding box is unavailable.
  if (!result.gestureDispatched) return;
  expect(result.closeHiddenAtGestureEnd).toBe(true);
});

it("B11 #284: closing and retapping a fresh nominal bar point shows the close button again", async () => {
  const result = (await commands.inspectPhase6B11(CLOSE_RETAP)) as {
    contextEvidence: ContextEvidence;
    closeVisibleAfterFirstTap: boolean;
    closeHiddenAfterCloseTap: boolean;
    closeVisibleAfterRetap: boolean;
  };
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.closeVisibleAfterFirstTap).toBe(true);
  expect(result.closeHiddenAfterCloseTap).toBe(true);
  expect(result.closeVisibleAfterRetap).toBe(true);
});
