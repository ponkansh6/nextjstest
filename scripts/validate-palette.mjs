/**
 * Validate 12-color palettes for light and dark modes according to specific quantitative gates:
 * 1. Brightness Band (OKLCH L target values & tolerances)
 * 2. Chroma Floor & Ceiling (OKLCH C bounds)
 * 3. CVD Separation (Deuteranopia simulation, minimum DeltaE >= 8 for adjacent pairs)
 * 4. Normal Vision Floor (Minimum DeltaE >= 15 for adjacent pairs)
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
    "#0c5a9a,#9fbb21,#6c2cb4,#26cd65,#90108b,#26c6af,#3f40c4,#26c2d1,#a0104b,#fc875e,#a21037,#d0a720",
  dark: "#0f66ac,#89a01b,#773ac1,#1fb056,#9d2398,#1faa96,#484dd2,#1fa6b3,#b31355,#f35c19,#b6143f,#b28f1a",
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

export function simulateDeuteranopiaHex(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const dr = 0.625 * r + 0.375 * g;
  const dg = 0.7 * r + 0.3 * g;
  const db = 0.03491 * r + 0.12684 * g + 0.83825 * b;

  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v * 255)));
  const outR = clamp(dr);
  const outG = clamp(dg);
  const outB = clamp(db);

  return `#${[outR, outG, outB].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function xyzToLab(xyz) {
  // XYZ to CIELAB (D65 white point: Xn = 0.95047, Yn = 1.00000, Zn = 1.08883)
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;

  const x = xyz[0] / Xn;
  const y = xyz[1] / Yn;
  const z = xyz[2] / Zn;

  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);

  return [L, a, b];
}

export function deltaE(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const lab1 = xyzToLab(linearRgbToXyz(rgbToLinear(rgb1)));
  const lab2 = xyzToLab(linearRgbToXyz(rgbToLinear(rgb2)));

  const L1 = lab1[0],
    a1 = lab1[1],
    b1 = lab1[2];
  const L2 = lab2[0],
    a2 = lab2[1],
    b2 = lab2[2];

  // CIEDE2000 Implementation
  const rad = (deg) => (deg * Math.PI) / 180;
  const deg = (rad) => (rad * 180) / Math.PI;

  const avgL = (L1 + L2) / 2;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const avgC = (c1 + c2) / 2;

  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1Prime = a1 * (1 + g);
  const a2Prime = a2 * (1 + g);

  const c1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2);
  const avgCPrime = (c1Prime + c2Prime) / 2;

  let h1Prime = deg(Math.atan2(b1, a1Prime));
  if (h1Prime < 0) h1Prime += 360;
  let h2Prime = deg(Math.atan2(b2, a2Prime));
  if (h2Prime < 0) h2Prime += 360;

  let avghPrime =
    Math.abs(h1Prime - h2Prime) > 180 ? (h1Prime + h2Prime + 360) / 2 : (h1Prime + h2Prime) / 2;
  let deltahPrime = h2Prime - h1Prime;
  if (Math.abs(deltahPrime) > 180) {
    if (h2Prime <= h1Prime) deltahPrime += 360;
    else deltahPrime -= 360;
  }

  const deltaLPrime = L2 - L1;
  const deltaCPrime = c2Prime - c1Prime;
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(rad(deltahPrime / 2));

  const t =
    1 -
    0.17 * Math.cos(rad(avghPrime - 30)) +
    0.24 * Math.cos(rad(2 * avghPrime)) +
    0.32 * Math.cos(rad(3 * avghPrime + 6)) -
    0.2 * Math.cos(rad(4 * avghPrime - 63));

  const sl = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const sc = 1 + 0.045 * avgCPrime;
  const sh = 1 + 0.015 * avgCPrime * t;

  const deltaTheta = 30 * Math.exp(-Math.pow((avghPrime - 275) / 25, 2));
  const rc = 2 * Math.sqrt(Math.pow(avgCPrime, 7) / (Math.pow(avgCPrime, 7) + Math.pow(25, 7)));
  const rt = -Math.sin(rad(2 * deltaTheta)) * rc;

  const termL = deltaLPrime / sl;
  const termC = deltaCPrime / sc;
  const termH = deltaHPrime / sh;

  return Math.sqrt(
    Math.pow(termL, 2) + Math.pow(termC, 2) + Math.pow(termH, 2) + rt * termC * termH,
  );
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

  let minCvdDeltaE = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const nextIdx = (i + 1) % colors.length;
    const sim1 = simulateDeuteranopiaHex(colors[i]);
    const sim2 = simulateDeuteranopiaHex(colors[nextIdx]);
    const d = deltaE(sim1, sim2);
    if (d < minCvdDeltaE) minCvdDeltaE = d;
  }
  const cvdPassed = minCvdDeltaE >= 8;

  let minNormalDeltaE = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const nextIdx = (i + 1) % colors.length;
    const d = deltaE(colors[i], colors[nextIdx]);
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
