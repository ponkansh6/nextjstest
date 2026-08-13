import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PALETTES } from "../../scripts/validate-palette.mjs";
import { stackedColors } from "@/lib/chartConstants";

const cssPath = path.resolve(__dirname, "../../src/app/globals.css");
const css = readFileSync(cssPath, "utf-8");

// セレクタ start に続く { } ブロックをブレース深度で抽出する
function extractBlock(css: string, start: RegExp): string | null {
  const startIdx = css.search(start);
  if (startIdx === -1) return null;
  const braceStart = css.indexOf("{", startIdx);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(braceStart + 1, i);
    }
  }
  return null;
}

function seriesValues(block: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const m of block.matchAll(/--series-(\d+):\s*(#[0-9a-fA-F]{6});/g)) {
    values[m[1]] = m[2].toLowerCase();
  }
  return values;
}

// stackedColors は「スロット(1..12) → var(--series-N)」の順で並んでいる。
// スロット番号 → 系列番号 の対応を本番コードから導出する(テスト側で写経しない)。
const slotToSeries: Record<number, number> = {};
stackedColors.forEach((v, i) => {
  const m = v.match(/--series-(\d+)/);
  if (m) slotToSeries[i + 1] = Number(m[1]);
});

const scopes = {
  light: { start: /^:root,\s*$/m, palette: PALETTES.light.split(",") },
  mediaDark: { start: /@media \(prefers-color-scheme: dark\)/, palette: PALETTES.dark.split(",") },
  dataThemeDark: { start: /^:root\[data-theme="dark"\]\s*\{/m, palette: PALETTES.dark.split(",") },
};

describe("globals.css series variables match the validated palette", () => {
  for (const [name, { start, palette }] of Object.entries(scopes)) {
    it(`${name} scope applies the validated palette to --series-1..12`, () => {
      const block = extractBlock(css, start);
      expect(block, `${name} scope block not found`).not.toBeNull();
      const values = seriesValues(block!);
      for (const [slot, seriesNum] of Object.entries(slotToSeries)) {
        const expected = palette[Number(slot) - 1].trim().toLowerCase();
        expect(
          values[String(seriesNum)],
          `${name}: --series-${seriesNum} (slot ${slot}) should be ${expected}`,
        ).toBe(expected);
      }
    });
  }
});
