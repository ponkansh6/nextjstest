import { expect, it } from "vitest";
import { commands } from "vitest/browser";

it("p45-b-section-tabs-scroll-47-case02-chromium — production desktop route scrolls the earnings target into view", async () => {
  const result = await commands.inspectBatch5StandardProductionCase("earnings-tab-desktop");
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  expect(result.values.viewport).toEqual({ width: 1280, height: 720 });
  expect(result.values.scrollYAfter).toBeGreaterThan(result.values.scrollYBefore);
  expect(result.values.targetVisible).toBe(true);
});
