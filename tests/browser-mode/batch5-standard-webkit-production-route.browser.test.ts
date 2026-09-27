import { expect, it } from "vitest";
import { commands } from "vitest/browser";

it("p45-b-section-tabs-scroll-47-case02-webkit — production iPhone 13 route scrolls the earnings target into view", async () => {
  const result = await commands.inspectBatch5StandardProductionCase("earnings-tab-iphone13");
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  expect(result.values.viewport).toEqual({ width: 390, height: 664 });
  expect(result.values.screen).toEqual({ width: 390, height: 844 });
  expect(result.values.deviceScaleFactor).toBe(3);
  expect(result.values.userAgent).toContain("iPhone");
  expect(result.values.isMobile).toBe(true);
  expect(result.values.hasTouch).toBe(true);
  expect(result.values.scrollYAfter).toBeGreaterThan(result.values.scrollYBefore);
  expect(result.values.targetVisible).toBe(true);
});
