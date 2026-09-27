import { expect, it } from "vitest";
import { commands } from "vitest/browser";

async function inspectSectionCase(
  scenario:
    | "section-tab-target"
    | "section-scrollbar"
    | "section-horizontal-scroll"
    | "section-mask",
) {
  const result = await commands.inspectBatch2ProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

it("p45-b-section-tabs-scroll-47-case04-webkit — production iPhone route scrolls the selected target into view", async () => {
  const values = await inspectSectionCase("section-tab-target");
  expect(values.inViewport).toBe(true);
  expect(values.scrollYAfter).toBeGreaterThan(values.scrollYBefore as number);
});

it("p45-b-section-tabs-scroll-120-case01-webkit — production WebKit hides the native scrollbar", async () => {
  expect((await inspectSectionCase("section-scrollbar")).scrollbarWidth).toBe("none");
});

it("p45-b-section-tabs-scroll-127-case01-webkit — production WebKit tabs overflow and advance horizontally", async () => {
  const geometry = (await inspectSectionCase("section-horizontal-scroll")).geometry as Record<
    string,
    number
  >;
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.after).toBeGreaterThan(geometry.before);
});

it("p45-b-section-tabs-scroll-142-mask-image-webkit — production WebKit applies the right-edge mask", async () => {
  const geometry = (await inspectSectionCase("section-mask")).geometry as Record<string, string>;
  expect(geometry.maskImage).not.toBe("none");
  expect(geometry.webkitMaskImage).not.toBe("none");
});
