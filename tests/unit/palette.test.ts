import { describe, it, expect } from "vitest";
import { validatePalette, PALETTES } from "../../scripts/validate-palette.mjs";

describe("Palette Quantitative Validation (V-2)", () => {
  it("should pass all validation gates for the new light palette", () => {
    const result = validatePalette(PALETTES.light, "light");
    console.log("Light palette validation result:", JSON.stringify(result, null, 2));
    expect(result.passed).toBe(true);
    expect(result.gates.brightnessBand.passed).toBe(true);
    expect(result.gates.chromaFloor.passed).toBe(true);
    expect(result.gates.cvdSeparation.passed).toBe(true);
    expect(result.gates.cvdSeparation.minDeltaE).toBeGreaterThanOrEqual(8);
    expect(result.gates.normalVisionFloor.passed).toBe(true);
    expect(result.gates.normalVisionFloor.minDeltaE).toBeGreaterThanOrEqual(15);
  });

  it("should pass all validation gates for the new dark palette", () => {
    const result = validatePalette(PALETTES.dark, "dark");
    console.log("Dark palette validation result:", JSON.stringify(result, null, 2));
    expect(result.passed).toBe(true);
    expect(result.gates.brightnessBand.passed).toBe(true);
    expect(result.gates.chromaFloor.passed).toBe(true);
    expect(result.gates.cvdSeparation.passed).toBe(true);
    expect(result.gates.cvdSeparation.minDeltaE).toBeGreaterThanOrEqual(8);
    expect(result.gates.normalVisionFloor.passed).toBe(true);
    expect(result.gates.normalVisionFloor.minDeltaE).toBeGreaterThanOrEqual(15);
  });

  it("should fail validation gates for the old palette", () => {
    const result = validatePalette(PALETTES.oldLight, "light");
    console.log("Old palette validation result:", JSON.stringify(result, null, 2));
    expect(result.passed).toBe(false);
    const failedAny =
      !result.gates.cvdSeparation.passed ||
      !result.gates.normalVisionFloor.passed ||
      !result.gates.brightnessBand.passed;
    expect(failedAny).toBe(true);
  });
});
