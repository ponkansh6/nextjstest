import { describe, it, expect } from "vitest";
import { stackedKeys, nominalColorMap } from "../../src/lib/chartConstants";

describe("Chart Constants Integrity", () => {
  it("should ensure all values in nominalColorMap exist in stackedKeys", () => {
    Object.values(nominalColorMap).forEach((category) => {
      expect(stackedKeys, `Category "${category}" in nominalColorMap must exist in stackedKeys`).toContain(category);
    });
  });
});
