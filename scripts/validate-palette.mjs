/**
 * Validate 12-color palettes for light and dark modes according to specific quantitative gates:
 * 1. Brightness Band (OKLCH L target values & tolerances)
 * 2. Chroma Floor & Ceiling (OKLCH C bounds)
 * 3. CVD Separation (Machado-Oliveira-Fernandes 2009 protan/deutan simulation,
 *    OKLab ΔE×100 >= 8, worst of protan/deutan, adjacent pairs only)
 * 4. Normal Vision Floor (OKLab ΔE×100 >= 15, unsimulated, adjacent pairs only)
 *
 * "Adjacent" means (i, i+1) only, no wraparound — the stacked-area chart never
 * renders slot 12 next to slot 1. Thresholds and simulation model match the
 * dataviz skill's reference validator, so results here mean the same thing as
 * the numbers documented in shared_plan/04-stacked-chart-palette-plan.md.
 */

export const SLOT_CATEGORIES = [
  "1:住居",
  "2:家具・家事用品",
  "3:被服及び履物",
  "4:保健医療",
  "5:教育",
  "6:交通・自動車等関係費",
  "7:通信",
  "8:光熱・水道",
  "9:教養娯楽",
  "10:外食以外食料",
  "11:外食",
  "12:諸雑費",
];

export const TIER_MAP = {
  bright: [2, 4, 6, 8, 10, 12],
  darker: [1, 3, 5, 7, 9, 11],
};

export const PALETTES = {
  light:
    "#0c5a9a,#9fbb21,#6c2cb4,#26cd65,#90108b,#26c6af,#3f40c4,#26c2d1,#a0104b,#fc875e,#a51112,#d0a720",
  dark: "#0f66ac,#89a01b,#773ac1,#1fb056,#9d2398,#1faa96,#484dd2,#1fa6b3,#b31355,#f35c19,#b81415,#b28f1a",
  oldLight:
    "#2a2080,#4647ea,#3481fe,#18b3ec,#00d0a5,#22c55e,#85e022,#fbe020,#fb923c,#c21a00,#b01500,#550500",
  oldDark:
    "#2a2080,#4647ea,#3481fe,#18b3ec,#00d0a5,#22c55e,#85e022,#fbe020,#fb923c,#c21a00,#b01500,#550500",
};

export function hexToRgb(hex) {
  let cleanHex = hex.replace(/^#/, "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(cleanHex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToLinear(rgb) {
  return rgb.map((v) => {
    const val = v / 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
}

export function linearRgbToXyz(rgb) {
  const [r, g, b] = rgb;
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  return [x, y, z];
}

export function xyzToOklab(xyz) {
  const [x, y, z] = xyz;
  const l_ = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const m_ = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const s_ = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  return [L, a, b];
}

export function oklabToOklch(lab) {
  const [L, a, b] = lab;
  const C = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return [L, C, h];
}

export function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  const lin = rgbToLinear(rgb);
  const xyz = linearRgbToXyz(lin);
  const lab = xyzToOklab(xyz);
  return oklabToOklch(lab);
}

// Machado, Oliveira & Fernandes (2009) CVD transforms at severity 1.0 (linear RGB).
// This is the model the dataviz skill's validator (and the CVD ΔE thresholds
// below) are calibrated against — swapping in a different simulation matrix
// (e.g. the older Brettel/Vienot-style linear approximation) shifts borderline
// pairs and silently invalidates the ΔE >= 8 / >= 15 thresholds.
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

export function simulateCvdHex(hex, kind) {
  const [r, g, b] = rgbToLinear(hexToRgb(hex));
  const M = MACHADO[kind];
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const lin = [
    clamp(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ];
  const s2gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  return lin.map((c) => Math.round(clamp(s2gamma(c)) * 255));
}

// OKLab Euclidean distance ×100 — matches the dataviz skill's validator so the
// ΔE >= 8 (CVD) / >= 15 (normal-vision) thresholds mean the same thing here as
// in shared_plan/04-stacked-chart-palette-plan.md.
export function oklabDeltaE(hex1, hex2) {
  const toOklab = (hex) => {
    const [r, g, b] = rgbToLinear(hexToRgb(hex));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const a = toOklab(hex1);
  const b = toOklab(hex2);
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function validatePalette(colorString, mode) {
  const colors = colorString.split(",").map((c) => c.trim());
  const targetLBright = mode === "light" ? 0.745 : 0.665;
  const targetLDarker = mode === "light" ? 0.46 : 0.5;
  const toleranceL = 0.03;

  const brightnessDetails = [];
  let brightnessPassed = true;
  colors.forEach((hex, idx) => {
    const slot = idx + 1;
    const [L] = hexToOklch(hex);
    const isBrightTier = TIER_MAP.bright.includes(slot);
    const expectedL = isBrightTier ? targetLBright : targetLDarker;
    const diff = Math.abs(L - expectedL);
    const passed = diff <= toleranceL;
    if (!passed) brightnessPassed = false;
    brightnessDetails.push({ slot, hex, L, expectedL, diff, passed });
  });

  const chromaDetails = [];
  let chromaPassed = true;
  colors.forEach((hex, idx) => {
    const slot = idx + 1;
    const [, C] = hexToOklch(hex);
    const passed = C >= 0.1 && C <= 0.2006;
    if (!passed) chromaPassed = false;
    chromaDetails.push({ slot, hex, C, passed });
  });

  // Adjacent pairs only (i, i+1) — no wraparound. The stacked-area chart never
  // renders slot N next to slot 1 (they are top and bottom of the stack, not
  // neighbors), and the dataviz skill's reference validator uses the same
  // non-circular pairlist for stacks/bars/lines.
  let minCvdDeltaE = Infinity;
  for (let i = 0; i < colors.length - 1; i++) {
    for (const kind of ["protan", "deutan"]) {
      const [r1, g1, b1] = simulateCvdHex(colors[i], kind);
      const [r2, g2, b2] = simulateCvdHex(colors[i + 1], kind);
      const hex1 = `#${[r1, g1, b1].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      const hex2 = `#${[r2, g2, b2].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      const d = oklabDeltaE(hex1, hex2);
      if (d < minCvdDeltaE) minCvdDeltaE = d;
    }
  }
  const cvdPassed = minCvdDeltaE >= 8;

  let minNormalDeltaE = Infinity;
  for (let i = 0; i < colors.length - 1; i++) {
    const d = oklabDeltaE(colors[i], colors[i + 1]);
    if (d < minNormalDeltaE) minNormalDeltaE = d;
  }
  const normalPassed = minNormalDeltaE >= 15;

  const passed = brightnessPassed && chromaPassed && cvdPassed && normalPassed;

  return {
    mode,
    passed,
    gates: {
      brightnessBand: { passed: brightnessPassed, details: brightnessDetails },
      chromaFloor: { passed: chromaPassed, details: chromaDetails },
      cvdSeparation: { passed: cvdPassed, minDeltaE: minCvdDeltaE, threshold: 8 },
      normalVisionFloor: { passed: normalPassed, minDeltaE: minNormalDeltaE, threshold: 15 },
    },
  };
}

export function runValidation() {
  console.log("=== Palette Validation CLI ===");
  const lightRes = validatePalette(PALETTES.light, "light");
  const darkRes = validatePalette(PALETTES.dark, "dark");
  const oldLightRes = validatePalette(PALETTES.oldLight, "light");

  console.log("\n[Light Palette Validation]");
  console.log(JSON.stringify(lightRes, null, 2));

  console.log("\n[Dark Palette Validation]");
  console.log(JSON.stringify(darkRes, null, 2));

  console.log("\n[Old Light Palette Validation (Expected to Fail)]");
  console.log(JSON.stringify(oldLightRes, null, 2));

  if (!lightRes.passed || !darkRes.passed || oldLightRes.passed) {
    console.error(
      "\n❌ Validation failed: New palettes must pass all gates, old palette must fail.",
    );
    process.exit(1);
  } else {
    console.log("\n✅ All validation gates passed successfully!");
    process.exit(0);
  }
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  runValidation();
}
