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

  const device = values.deviceContext;
  expect(device).toBeDefined();
  expect(device!.viewport).toEqual({ width: 390, height: 664 });
  expect(device!.screen).toEqual({ width: 390, height: 844 });
  expect(device!.deviceScaleFactor).toBe(3);
  expect(device!.userAgent).toMatch(/iPhone; CPU iPhone OS/);
  expect(device!.configuredIsMobile).toBe(true);
  expect(device!.configuredHasTouch).toBe(true);
  return values;
}

it("p45-b-section-tabs-scroll-82-3-webkit", async () => {
  const values = await inspect("new-graph-webkit");
  expect(values.targetId).toBe("section-new-graph");
  expect(values.tabLabel).toBe("3種比較");
});

it("p45-b-section-tabs-scroll-82-case04-webkit", async () => {
  const values = await inspect("consumption-nominal-webkit");
  expect(values.targetId).toBe("section-consumption-nominal");
  expect(values.tabLabel).toBe("消費(名目)");
});

it("p45-b-section-tabs-scroll-82-case05-webkit", async () => {
  const values = await inspect("earnings-webkit");
  expect(values.targetId).toBe("section-earnings");
  expect(values.tabLabel).toBe("給与");
});
