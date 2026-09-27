import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Batch5LazyTabCase } from "./batch5-lazy-tabs-route.command";

async function inspect(scenario: Batch5LazyTabCase) {
  const result = await commands.inspectBatch5LazyTab(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  const { values } = result;
  expect(values.initiallyAbsent).toBe(true);
  expect(values.mountedAfterClick).toBe(true);
  expect(values.visibleAfterClick).toBe(true);
  expect(values.inViewportAfterClick).toBe(true);
  return values;
}

it("p45-b-section-tabs-scroll-82-3-chromium", async () => {
  const values = await inspect("new-graph-chromium");
  expect(values.targetId).toBe("section-new-graph");
  expect(values.tabLabel).toBe("3種比較");
});

it("p45-b-section-tabs-scroll-82-case01-chromium", async () => {
  const values = await inspect("consumption-nominal-chromium");
  expect(values.targetId).toBe("section-consumption-nominal");
  expect(values.tabLabel).toBe("消費(名目)");
});

it("p45-b-section-tabs-scroll-82-case02-chromium", async () => {
  const values = await inspect("earnings-chromium");
  expect(values.targetId).toBe("section-earnings");
  expect(values.tabLabel).toBe("給与");
});
