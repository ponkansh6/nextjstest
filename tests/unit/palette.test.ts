import { describe, it, expect } from "vitest";
import {
  validatePalette,
  PALETTES,
  hexToOklch,
  oklchToHex,
  oklchToHexInGamut,
  maxChromaInGamut,
  isRgbInGamut,
  oklchToRgbLinear,
} from "../../scripts/validate-palette.mjs";

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

describe("OKLCH <-> hex round trip (guards against the double-matrix bug)", () => {
  it("recovers every current palette color from its own OKLCH values", () => {
    for (const hex of [...PALETTES.light.split(","), ...PALETTES.dark.split(",")]) {
      const [L, C, H] = hexToOklch(hex);
      expect(oklchToHex(L, C, H)).toBe(hex);
    }
  });

  it("round-trips known in-gamut OKLCH coordinates back to matching L/C/H", () => {
    const samples: [number, number, number][] = [
      [0.745, 0.181, 330],
      [0.46, 0.18, 300],
      [0.664, 0.171, 50],
      [0.501, 0.17, 35],
    ];
    for (const [L, C, H] of samples) {
      const hex = oklchToHex(L, C, H);
      const [L2, C2, H2] = hexToOklch(hex);
      expect(L2).toBeCloseTo(L, 2);
      expect(C2).toBeCloseTo(C, 2);
      expect(H2).toBeCloseTo(H, 0);
    }
  });
});

describe("Gamut-aware chroma search", () => {
  it("finds an in-gamut chroma that is strictly less than an out-of-gamut request", () => {
    // C=0.2006 at L=0.46, H=140 is documented as out-of-gamut in
    // shared_plan history (max achievable chroma there is far lower).
    const requested = 0.2;
    expect(isRgbInGamut(oklchToRgbLinear(0.46, requested, 140))).toBe(false);

    const maxC = maxChromaInGamut(0.46, 140);
    expect(maxC).toBeLessThan(requested);
    expect(isRgbInGamut(oklchToRgbLinear(0.46, maxC, 140))).toBe(true);
  });

  it("keeps L and H fixed while only reducing C for an out-of-gamut target", () => {
    const L = 0.46;
    const H = 140;
    const hex = oklchToHexInGamut(L, 0.2, H);
    const [L2, C2, H2] = hexToOklch(hex);
    expect(L2).toBeCloseTo(L, 2);
    expect(H2).toBeCloseTo(H, 0);
    expect(C2).toBeLessThan(0.2);
  });

  it("leaves an already in-gamut request untouched", () => {
    const L = 0.745;
    const C = 0.181;
    const H = 330;
    expect(oklchToHexInGamut(L, C, H)).toBe(oklchToHex(L, C, H));
  });
});
