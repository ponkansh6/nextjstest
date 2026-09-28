import { beforeEach, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import type { Phase6B07Id } from "./phase6-b07.route.command";

vi.setConfig({ testTimeout: 60_000 });

beforeEach(async () => {
  await page.viewport(1280, 720);
});

const FLIGHT: Phase6B07Id =
  "p45-b-real-consumption-21-page-tsx-e2e-real-consumption-chart-with-actual-browser";
const RUNTIME_ERRORS: Phase6B07Id =
  "p45-b-real-consumption-60-page-tsx-e2e-real-consumption-chart-with-actual-browser";
const SECTION_VISIBLE: Phase6B07Id =
  "p45-b-real-consumption-82-page-tsx-e2e-real-consumption-chart-with-actual-browser";

it("B07 #21: extracts 48 quarterly real-consumption Flight rows and checks endpoint support values", async () => {
  const { realRows } = (await commands.inspectPhase6B07(FLIGHT)) as {
    realRows: Array<Record<string, string | number>>;
  };
  expect(realRows.length, "2005-2016 should have 48 quarters").toBe(48);

  const supportKey = "民間最終消費支出（実質）";
  for (const row of [realRows[0], realRows[realRows.length - 1]]) {
    expect(row, `${supportKey} should be serialized on the endpoint rows`).toHaveProperty(
      supportKey,
    );
    expect(
      Number(row?.[supportKey]),
      `${supportKey} should be positive on the endpoint rows`,
    ).toBeGreaterThan(0);
  }
});

it("B07 #60: loads without hydration or console errors", async () => {
  const { errors } = (await commands.inspectPhase6B07(RUNTIME_ERRORS)) as { errors: string[] };
  expect(errors, `Page should load without errors.\nErrors:\n${errors.join("\n")}`).toEqual([]);
});

it("B07 #82: renders the real-consumption section after selecting its tab through normal LazyMount behavior", async () => {
  const { visible } = (await commands.inspectPhase6B07(SECTION_VISIBLE)) as { visible: boolean };
  expect(visible, "Real consumption chart section should be visible").toBe(true);
});
