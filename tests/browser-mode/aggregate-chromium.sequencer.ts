import { BaseSequencer, type TestSpecification } from "vitest/node";

const ORDERED_TEST_FILES = [
  "next-route-poc.browser.test.ts",
  "batch5-standard-chromium-production-route.browser.test.ts",
  "phase6-b09-real-consumption.browser.test.ts",
  "phase6-b01-cagr-contrast.browser.test.ts",
  "phase6-b07-real-consumption.browser.test.ts",
  "batch5-lazy-tabs-chromium-production-route.browser.test.ts",
  "phase6-b12-chartnote-tooltip.browser.test.ts",
  "phase6-b08-real-consumption.browser.test.ts",
  "phase6-b13-tooltip-dismiss.browser.test.ts",
  "phase6-b02-real-legend-contrast.browser.test.ts",
  "phase6-b10-tooltip-dismiss.browser.test.ts",
  "phase6-b14-residual-accessibility.browser.test.ts",
  "batch4-a-production-route.browser.test.ts",
  "phase6-b11-tooltip-dismiss.browser.test.ts",
  "phase6-b05-parity.browser.test.ts",
  "phase6-b04-parity.browser.test.ts",
  "phase6-b06-quarterly.browser.test.ts",
  "batch4-b-production-route.browser.test.ts",
  "phase6-b03-advanced-series.browser.test.ts",
  "batch3-b-production-route.browser.test.ts",
  "batch3-a-production-route.browser.test.ts",
  "batch1-production-route.browser.test.ts",
];

export class AggregateChromiumSequencer extends BaseSequencer {
  sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const order = new Map(ORDERED_TEST_FILES.map((file, index) => [file, index]));
    return Promise.resolve(
      files.sort((left, right) => {
        const leftName = left.moduleId.split(/[\\/]/).at(-1) ?? left.moduleId;
        const rightName = right.moduleId.split(/[\\/]/).at(-1) ?? right.moduleId;
        return (
          (order.get(leftName) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(rightName) ?? Number.MAX_SAFE_INTEGER)
        );
      }),
    );
  }
}
