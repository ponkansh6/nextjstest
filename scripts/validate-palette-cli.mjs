/**
 * CLI entry point for palette validation and H-value preview.
 * Separated from validate-palette.mjs to avoid ESM import issues in test files.
 */

import { previewHueChange, runValidation } from "./validate-palette.mjs";

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const [, , cmd, categoryArg, hArg] = process.argv;
  if (cmd === "preview" && categoryArg && hArg !== undefined) {
    const result = previewHueChange(categoryArg, Number(hArg));
    console.log(`=== ${result.category} → H=${hArg}° プレビュー ===`);
    console.log(`Light: ${result.newLightHex} | Dark: ${result.newDarkHex}`);
    console.log(
      `Light: passed=${result.lightPassed} CVD=${result.lightGates.cvdSeparation.minDeltaE.toFixed(2)} Normal=${result.lightGates.normalVisionFloor.minDeltaE.toFixed(2)}`,
    );
    console.log(
      `Dark:  passed=${result.darkPassed} CVD=${result.darkGates.cvdSeparation.minDeltaE.toFixed(2)} Normal=${result.darkGates.normalVisionFloor.minDeltaE.toFixed(2)}`,
    );
    if (result.sameTierWarnings.length > 0) {
      console.warn(
        "\n⚠️  同tier内で色相が近い(<20°)カテゴリがあります(必須ゲートでは検知されません):",
      );
      for (const w of result.sameTierWarnings) {
        console.warn(`  - ${w.category}: H=${w.hue.toFixed(1)}° (差 ${w.dist.toFixed(1)}°)`);
      }
    }
    process.exit(result.lightPassed && result.darkPassed ? 0 : 1);
  } else {
    runValidation();
  }
}
