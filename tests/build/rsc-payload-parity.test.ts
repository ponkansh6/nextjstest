import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import path from "node:path";
import { loadQuarterlyPublicData } from "../../server/lib/view-models/quarterlyProjection";
import { CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY } from "@/lib/chartConstants";
import {
  extractArrayProp,
  filter2005to2016,
  formatDistribution,
  REAL_PROP,
  type QuarterlyRow,
} from "../utils/flight-payload";

/**
 * ビルド出力パリティテスト。
 *
 * `pnpm build`（= 商用 Vercel が実行するのと同じ `next build`）が生成する
 * プリレンダ済み RSC ペイロードと、vitest から直接データ経路を叩いた結果が
 * 一致することを固定する。
 *
 * 商用は本リポジトリを push した自動デプロイであり、コードも CSV も同一。
 * したがって「ローカルの vitest は通るのに商用は 0」という状態が本当なら、
 * 差分はビルド経路に現れるはずである。本テストはその乖離を検出する。
 *
 * 現状（ローカル）は両者一致するため成功する。成功し続けること自体が
 * 「ローカルでは再現しない」ことの根拠として記録される。
 */
describe("RSC payload parity (next build 出力 vs vitest 経路)", () => {
  const rscPath = path.join(process.cwd(), ".next/server/app/index.rsc");

  let buildRows: QuarterlyRow[];
  let pipelineRows: QuarterlyRow[];

  beforeAll(async () => {
    // --- ビルド出力側 ---
    if (!fs.existsSync(rscPath)) {
      throw new Error(
        `${rscPath} がありません。先に \`pnpm build\` を実行してください。` +
          `（このテストはビルド成果物を検証するため、サイレントにスキップしません）`,
      );
    }
    const payload = fs.readFileSync(rscPath, "utf8");
    buildRows = filter2005to2016(extractArrayProp(payload, REAL_PROP));

    // --- vitest 経路側（page.tsx:16-74 と同一手順） ---
    const { real } = await loadQuarterlyPublicData();
    pipelineRows = filter2005to2016(real as unknown as QuarterlyRow[]);
  });

  it("ビルド出力から実質四半期配列を抽出できる（2005-2016 で48四半期）", () => {
    expect(buildRows.length, "2005-2016 は 12年×4Q = 48 行のはず").toBe(48);
  });

  it(`ビルド出力の ${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY} が 2005-2016 で非ゼロ`, () => {
    const report = formatDistribution(buildRows, CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY);
    console.log(`\n[next build 出力]\n${report}`);

    const zeros = buildRows.filter((r) => !(Number(r[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]) > 0));
    expect(
      zeros.length,
      `next build が生成したプリレンダ結果に 0 の四半期が ${zeros.length} 件あります。\n${report}`,
    ).toBe(0);
  });

  it("ビルド経路と vitest 経路の値が一致する（乖離すれば「ビルド時のみ壊れる」の証拠）", () => {
    expect(pipelineRows.length, "vitest 経路も48行のはず").toBe(buildRows.length);

    const diffs: string[] = [];
    for (const built of buildRows) {
      const pipe = pipelineRows.find((r) => r["label"] === built["label"]);
      if (!pipe) {
        diffs.push(`${built["label"]}: vitest 経路に対応行なし`);
        continue;
      }
      const b = Number(built[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]);
      const p = Number(pipe[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]);
      if (b !== p) diffs.push(`${built["label"]}: build=${b} vitest=${p}`);
    }

    expect(
      diffs,
      `ビルド経路と vitest 経路で値が乖離しています。これは「vitest では再現しないがビルドでは壊れる」` +
        `ことを意味し、原因分析の起点になります。\n${diffs.join("\n")}`,
    ).toEqual([]);
  });
});
