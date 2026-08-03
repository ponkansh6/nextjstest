import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import Papa from "papaparse";
import { buildCtiFilePaths } from "../../server/lib/dataIo";
import { loadCtiData } from "../../server/lib/dataLoader";
import { calculateQuarterLabel } from "@/lib/math/quarter";
import { SUPPORT_SERIES_KEY_REAL, SUPPORT_SERIES_KEY_NOMINAL } from "@/lib/chartConstants";
import type { CpiData } from "@/types";

/**
 * サポート系列（民間最終消費支出）の結合キー契約テスト。
 *
 * 背景:
 * `server/lib/data-loader/cpi.ts:59-78` の `loadSupportMap` は、支持系列CSVから
 * 「時間軸（四半期）」→「民間最終消費支出」の Map を組み立てる。ここには
 * **何もログを出さずに Map を空にする分岐が3つ**ある:
 *
 *   - cpi.ts:65  `/民間最終消費支出/` 一致行がない → early return
 *   - cpi.ts:67  `header.indexOf("時間軸（四半期）")` が -1 → 全行 ym=undefined でスキップ
 *   - cpi.ts:68  `findIndex(h => h === "民間最終消費支出")` が -1 → parseFloat(NaN) で全行スキップ
 *
 * Map が空になると `cpi.ts:115-116` / `cpi.ts:172-173` の `?? 0` により全期間が 0 になる。
 * さらに `server/lib/math/supportSeries.ts:34-38` が 2017年以降を強制的に 0 にするため、
 * **結合が全面的に失敗したときの唯一の可視症状は「2005-2016 が全部 0」**という、
 * 商用で報告されている症状とまったく同じ形になる。
 *
 * 本テストはその3つの分岐と、文字列完全一致で行われる結合キーの契約をピン留めする。
 */
describe("Support series join contract (loadSupportMap / cpi.ts:59-78)", () => {
  const paths = buildCtiFilePaths();

  /** cpi.ts:60-68 と同じ手順でヘッダ行と列位置を求める（実装が依存する前提条件の検証）。 */
  const readHeader = (filePath: string) => {
    const content = fs.readFileSync(filePath, "utf8");
    const rows = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false }).data;
    const headerIndex = rows.findIndex(
      (row) =>
        Array.isArray(row) && row.some((c) => typeof c === "string" && /民間最終消費支出/.test(c)),
    );
    const header =
      headerIndex === -1
        ? []
        : rows[headerIndex].map((c) => (typeof c === "string" ? c.trim() : c));
    return { rows, headerIndex, header };
  };

  /** cpi.ts:69-77 と同じ手順で Map を組み立てる。 */
  const buildMap = (filePath: string) => {
    const { rows, headerIndex, header } = readHeader(filePath);
    const map = new Map<string, number>();
    if (headerIndex === -1) return map;
    const ymIndex = header.indexOf("時間軸（四半期）");
    const valueIndex = header.findIndex((h) => h === "民間最終消費支出");
    rows.slice(headerIndex + 1).forEach((row) => {
      const ym = row[ymIndex];
      const valStr =
        typeof row[valueIndex] === "string"
          ? row[valueIndex].trim().replace(/,/g, "")
          : String(row[valueIndex]);
      const num = parseFloat(valStr);
      if (ym && !isNaN(num)) map.set(ym, num);
    });
    return map;
  };

  const targets = [
    { label: "real", path: paths.supportReal },
    { label: "nominal", path: paths.supportNominal },
  ];

  describe.each(targets)("$label support CSV", ({ label, path: filePath }) => {
    it("ファイルが存在する（欠損時 cpi.ts:52-54 は ENOENT で throw する）", () => {
      expect(fs.existsSync(filePath), `${filePath} が存在しません`).toBe(true);
    });

    it("cpi.ts:65 — /民間最終消費支出/ に一致するヘッダ行が見つかる", () => {
      const { headerIndex } = readHeader(filePath);
      expect(
        headerIndex,
        `${label}: ヘッダ行が見つからないと loadSupportMap は early return し、全期間が 0 になります`,
      ).toBeGreaterThanOrEqual(0);
    });

    it("cpi.ts:67 — 「時間軸（四半期）」列が存在する", () => {
      const { header } = readHeader(filePath);
      const ymIndex = header.indexOf("時間軸（四半期）");
      expect(
        ymIndex,
        `${label}: 「時間軸（四半期）」列が無いと全行スキップされ、全期間が 0 になります。` +
          `検出ヘッダ: ${JSON.stringify(header.slice(0, 12))}`,
      ).not.toBe(-1);
    });

    it("cpi.ts:68 — 「民間最終消費支出」列が完全一致で存在し、家計最終消費支出と混同しない", () => {
      const { header } = readHeader(filePath);
      const valueIndex = header.findIndex((h) => h === "民間最終消費支出");
      expect(
        valueIndex,
        `${label}: 完全一致の「民間最終消費支出」列が無いと parseFloat(NaN) で全行スキップされます。` +
          `検出ヘッダ: ${JSON.stringify(header.slice(0, 12))}`,
      ).not.toBe(-1);
      expect(
        header[valueIndex],
        `${label}: 「民間最終消費支出_家計最終消費支出」を誤って選んでいます`,
      ).toBe("民間最終消費支出");
    });

    it("Map が空にならず、2005-2016 の全48四半期のキーを保持している", () => {
      const map = buildMap(filePath);
      expect(
        map.size,
        `${label}: supportMap が空です（3つの分岐のいずれかが発火しています）`,
      ).toBeGreaterThan(0);

      const missing: string[] = [];
      const zeroValued: string[] = [];
      for (let year = 2005; year <= 2016; year++) {
        for (let q = 1; q <= 4; q++) {
          const key = calculateQuarterLabel(year, q);
          if (!map.has(key)) missing.push(key);
          else if (!(map.get(key)! > 0)) zeroValued.push(`${key}=${map.get(key)}`);
        }
      }

      expect(
        missing,
        `${label}: 結合キーが CSV 側に存在しません（?? 0 が発火し 0 になります）。` +
          `CSV 側キー例: ${JSON.stringify([...map.keys()].slice(0, 3))}`,
      ).toEqual([]);
      expect(zeroValued, `${label}: 値が非正の四半期があります`).toEqual([]);
    });
  });

  it("結合キーの「～」は U+FF5E（全角チルダ）である（U+301C 波ダッシュとの揺れを検出）", () => {
    const label = calculateQuarterLabel(2005, 1);
    expect(label).toBe("2005年1～3月期");

    const tilde = label.match(/[～〜]/)?.[0];
    expect(tilde, "生成ラベルにチルダ文字が含まれていません").toBeDefined();
    expect(
      tilde!.codePointAt(0)!.toString(16),
      `calculateQuarterLabel (src/lib/math/quarter.ts:26) のチルダが U+FF5E ではありません`,
    ).toBe("ff5e");

    // CSV 側のキーも同じコードポイントであること
    const csvKeys = [...buildMap(paths.supportReal).keys()];
    const sample = csvKeys.find((k) => k.startsWith("2005年1"));
    expect(sample, "CSV に 2005年Q1 のキーがありません").toBeDefined();
    const csvTilde = sample!.match(/[～〜]/)?.[0];
    expect(
      csvTilde!.codePointAt(0)!.toString(16),
      `cti_support_real.csv 側のチルダが U+FF5E ではありません（結合が全滅します）`,
    ).toBe("ff5e");
  });

  describe("end-to-end: loadCtiData() の実出力（private な loadSupportMap を実際に通す）", () => {
    let ctiData: CpiData[];

    beforeAll(async () => {
      ctiData = await loadCtiData();
    });

    it.each([SUPPORT_SERIES_KEY_REAL, SUPPORT_SERIES_KEY_NOMINAL])(
      "'%s' が 2005-2016 の月次行で非ゼロ",
      (key) => {
        const rows = ctiData.filter((d) => {
          const m = String(d.年月).match(/^(\d{4})年/);
          if (!m) return false;
          const y = parseInt(m[1], 10);
          return y >= 2005 && y <= 2016;
        });
        expect(rows.length, "2005-2016 の月次行が存在しません").toBe(12 * 12);

        const zeroRows = rows.filter((d) => !((d[key] as number) > 0));
        expect(
          zeroRows.length,
          `${key} が 0 の月次行が ${zeroRows.length}/${rows.length} 件あります。` +
            `例: ${zeroRows
              .slice(0, 5)
              .map((d) => `${d.年月}=${d[key]}`)
              .join(", ")}`,
        ).toBe(0);
      },
    );
  });
});
