import { beforeEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import type { Phase6B09Id } from "./phase6-b09.route.command";

vi.setConfig({ testTimeout: 60_000 });

beforeEach(async () => {
  await page.viewport(1280, 720);
});

const SUMMARY_VISIBLE: Phase6B09Id =
  "p45-b-real-consumption-174-page-tsx-e2e-real-consumption-chart-with-actual-browser";

it("B09 #174: real-consumption section and summary are visible after scrolling", async () => {
  const result = (await commands.inspectPhase6B09(SUMMARY_VISIBLE)) as {
    sectionVisible: boolean;
    summaryVisible: boolean;
  };
  expect(result.sectionVisible).toBe(true);
  expect(result.summaryVisible).toBe(true);
});
