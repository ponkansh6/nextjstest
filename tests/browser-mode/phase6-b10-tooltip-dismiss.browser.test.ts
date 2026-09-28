import { beforeEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import type { Phase6B10Id } from "./phase6-b10.route.command";

vi.setConfig({ testTimeout: 90_000 });

beforeEach(async () => {
  await page.viewport(1280, 720);
});

const TAP_CLOSE: Phase6B10Id = "p45-b-tooltip-dismiss-138-case01";
const ESCAPE_RETAP: Phase6B10Id = "p45-b-tooltip-dismiss-159-mobile-pixel-tooltip-escape-tooltip";
const OUTSIDE_TAP: Phase6B10Id = "p45-b-tooltip-dismiss-188-case01";

type Result = {
  contextEvidence: {
    viewport: { width: number; height: number };
    screen: { width: number; height: number };
    deviceScaleFactor: number;
    touchPoints: number;
    userAgent: string;
  };
  cursorBefore?: number;
  cursorAfter?: number;
  tooltipVisibleAfterTap?: boolean;
  tooltipVisibleAfterEscape?: boolean;
  closeHiddenAfterEscape?: boolean;
  tooltipVisibleAfterRetap?: boolean;
  closeVisibleBeforeClose?: boolean;
  closeHiddenAfterClose?: boolean;
  closeHiddenAfterOutsideTap?: boolean;
  tooltipVisibleAfterClose?: boolean;
  tooltipVisibleAfterOutsideTap?: boolean;
  closeVisibleAfterRetap?: boolean;
};

function expectPixel7TouchContext(evidence: Result["contextEvidence"]) {
  expect(evidence.viewport).toEqual({ width: 412, height: 839 });
  expect(evidence.screen).toEqual({ width: 412, height: 915 });
  expect(evidence.deviceScaleFactor).toBe(2.625);
  expect(evidence.touchPoints).toBeGreaterThan(0);
  expect(evidence.userAgent).toContain("Pixel 7");
}

it("B10 #138: touchscreen bar tap opens the cursor and close tap clears both", async () => {
  const result = (await commands.inspectPhase6B10(TAP_CLOSE)) as Result;
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.cursorBefore).toBeGreaterThan(0);
  expect(result.closeHiddenAfterClose).toBe(true);
  expect(result.tooltipVisibleAfterClose).toBe(false);
  expect(result.cursorAfter).toBe(0);
});

it("B10 #159: Escape hides the tapped tooltip and same-coordinate retap reopens it", async () => {
  const result = (await commands.inspectPhase6B10(ESCAPE_RETAP)) as Result;
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.tooltipVisibleAfterTap).toBe(true);
  expect(result.tooltipVisibleAfterEscape).toBe(false);
  expect(result.closeHiddenAfterEscape).toBe(true);
  expect(result.tooltipVisibleAfterRetap).toBe(true);
  expect(result.closeVisibleAfterRetap).toBe(true);
});

it("B10 #188: touching the nominal chart heading outside the chart clears close button and cursor", async () => {
  const result = (await commands.inspectPhase6B10(OUTSIDE_TAP)) as Result;
  expectPixel7TouchContext(result.contextEvidence);
  expect(result.closeVisibleBeforeClose).toBe(true);
  expect(result.cursorBefore).toBeGreaterThan(0);
  expect(result.closeHiddenAfterOutsideTap).toBe(true);
  expect(result.tooltipVisibleAfterOutsideTap).toBe(false);
  expect(result.cursorAfter).toBe(0);
});
