import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Batch4BRouteCase } from "./batch4-b-route.command";

async function inspect(scenario: Batch4BRouteCase) {
  const result = await commands.inspectBatch4BProductionCase(scenario);
  expect(result.responseStatus).toBe(200);
  expect(new URL(result.url).pathname).toBe("/");
  return result.values;
}

it("p45-b-section-tabs-scroll-120-case02-webkit — production route initially hides the native scrollbar", async () => {
  expect((await inspect("section-scrollbar-webkit")).scrollbarWidth).toBe("none");
});

it("p45-b-section-tabs-scroll-127-case02-webkit — production WebKit tabs overflow and scroll horizontally", async () => {
  const geometry = (await inspect("section-horizontal-webkit")).geometry as {
    before: number;
    after: number;
    scrollWidth: number;
    clientWidth: number;
  };
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
  expect(geometry.after).toBeGreaterThan(geometry.before);
});

it("p45-b-section-tabs-scroll-142-mask-image-webkit — production WebKit applies the right-edge mask", async () => {
  const mask = (await inspect("section-mask-webkit")).mask as {
    maskImage: string;
    webkitMaskImage: string;
  };
  expect(mask.maskImage).not.toBe("none");
  expect(mask.webkitMaskImage).not.toBe("none");
});

it("p45-b-section-tabs-scroll-47-3-webkit — production iPhone WebKit brings the 3種比較 section into view", async () => {
  const values = await inspect("section-tab-target-webkit");
  const target = values.target as {
    top: number;
    bottom: number;
    before: number;
    scrollY: number;
    inViewport: boolean;
  };
  const device = values.deviceContext as {
    viewport: { width: number; height: number };
    screen: { width: number; height: number };
    deviceScaleFactor: number;
    userAgent: string;
  };
  expect(device.viewport).toEqual({ width: 390, height: 664 });
  expect(device.screen).toEqual({ width: 390, height: 844 });
  expect(device.deviceScaleFactor).toBe(3);
  expect(device.userAgent).toMatch(/iPhone; CPU iPhone OS/);
  expect(target.scrollY).toBeGreaterThan(target.before);
  expect(target.inViewport).toBe(true);
  expect(target.bottom).toBeGreaterThan(0);
  expect(target.top).toBeLessThan(664);
});
