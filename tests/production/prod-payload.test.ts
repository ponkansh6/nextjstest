import { describe, it, expect, beforeAll } from "vitest";
import { SUPPORT_SERIES_KEY_REAL, SUPPORT_SERIES_KEY_NOMINAL } from "@/lib/chartConstants";
import {
  extractArrayProp,
  extractFlightFromHtml,
  filter2005to2016,
  formatDistribution,
  NOMINAL_PROP,
  REAL_PROP,
  type QuarterlyRow,
} from "../utils/flight-payload";

/**
 * ⚠️ 商用環境の不具合を再現するテスト。**失敗が期待値。**
 *
 * 商用は本リポジトリを GitHub に push → Vercel 自動デプロイしたもの。
 * `src/app/page.tsx:13` の `export const revalidate = false` により、ページは
 * ビルド時に完全プリレンダされ再検証されない。つまり商用で描画されているデータは
 * **ビルド時に確定した静的ペイロード**であり、URL から直接取得して検証できる。
 *
 * ローカルのシミュレーション（vitest 経路・next build 経路とも）では正しい値が出るため、
 * 「実際に失敗している成果物そのもの」を検証するこのテストが唯一の確実な再現手段。
 *
 * 実行:
 *   PROD_URL=https://<商用URL> pnpm test:prod
 *
 * 失敗の読み方（3段階で切り分けられるよう設計している）:
 *   P1 が失敗 → デプロイされているコードが HEAD と違う（プロパティ構造そのものが別物）
 *   P2 が失敗 → コードは同じだがデータが 0（データ/ビルド環境側の問題）
 *   P3 が失敗 → 名目側も 0（loadSupportMap 全体の失敗）
 */
describe("商用ペイロード再現テスト（失敗が期待値）", () => {
  const PROD_URL = process.env.PROD_URL;

  let payload = "";
  const diagnostics: string[] = [];

  beforeAll(async () => {
    if (!PROD_URL) {
      // it.skip にはしない。黙ってスキップされると「問題なし」と誤読されるため明示的に落とす。
      throw new Error(
        "環境変数 PROD_URL が未設定です。商用URLを指定して実行してください:\n" +
          "  PROD_URL=https://<商用URL> pnpm test:prod",
      );
    }

    // RSC ヘッダ付きで Flight ペイロードを直接取得する。
    const res = await fetch(PROD_URL, { headers: { RSC: "1" } });
    const body = await res.text();
    const contentType = res.headers.get("content-type") ?? "";

    diagnostics.push(`URL: ${PROD_URL}`);
    diagnostics.push(`HTTP status: ${res.status} ${res.statusText}`);
    diagnostics.push(`content-type: ${contentType}`);
    diagnostics.push(`x-vercel-id: ${res.headers.get("x-vercel-id")}`);
    diagnostics.push(`x-vercel-cache: ${res.headers.get("x-vercel-cache")}`);
    diagnostics.push(`x-nextjs-prerender: ${res.headers.get("x-nextjs-prerender")}`);
    diagnostics.push(`age: ${res.headers.get("age")}`);
    diagnostics.push(`body length: ${body.length}`);

    expect(res.ok, `商用URLへのリクエストが失敗しました:\n${diagnostics.join("\n")}`).toBe(true);

    // text/x-component なら Flight そのもの。HTML が返った場合のみチャンクから復元する。
    if (contentType.includes("text/x-component")) {
      payload = body;
    } else {
      diagnostics.push("Flight ではなく HTML が返ったため、__next_f チャンクから復元します");
      payload = extractFlightFromHtml(body);
      diagnostics.push(`復元後のペイロード長: ${payload.length}`);
    }

    console.log(`\n[商用ペイロード診断]\n${diagnostics.join("\n")}`);
  });

  it("P1: デプロイされたコードが HEAD と同じ構造か（CpiChart が四半期配列を受け取っている）", () => {
    /**
     * `src/app/page.tsx:90-91` は `quarterlyNominalData` / `quarterlyRealData` を
     * サーバ側で集計して CpiChart に渡す。これらがペイロードに存在しなければ、
     * デプロイされているのは**クライアント側集計だった旧版**であり、
     * 値の問題ではなく「デプロイが古い」ことが症状の原因である。
     */
    const hasReal = payload.includes(`"${REAL_PROP}":[`);
    const hasNominal = payload.includes(`"${NOMINAL_PROP}":[`);

    const realKeyCount = payload.split(SUPPORT_SERIES_KEY_REAL).length - 1;
    const nominalKeyCount = payload.split(SUPPORT_SERIES_KEY_NOMINAL).length - 1;

    expect(
      { hasReal, hasNominal, realKeyCount, nominalKeyCount },
      `商用ペイロードに ${REAL_PROP} / ${NOMINAL_PROP} が見つかりません。\n` +
        `デプロイされているコードが現在の HEAD と異なります（旧版はクライアント側で集計していた）。\n` +
        `${SUPPORT_SERIES_KEY_REAL} の出現数=${realKeyCount}, ` +
        `${SUPPORT_SERIES_KEY_NOMINAL} の出現数=${nominalKeyCount}\n` +
        `→ \`vercel inspect <URL>\` でデプロイ日時を、\`git log\` で該当コミットを突き合わせてください。\n` +
        `${diagnostics.join("\n")}`,
    ).toEqual({ hasReal: true, hasNominal: true, realKeyCount, nominalKeyCount });
  });

  it(`P2: ⚠️ 失敗が期待値 — 商用の ${SUPPORT_SERIES_KEY_REAL} が 2005-2016 で非ゼロ`, () => {
    const rows = filter2005to2016(extractArrayProp(payload, REAL_PROP));
    expect(rows.length, "2005-2016 は 12年×4Q = 48 行のはず").toBe(48);

    const report = formatDistribution(rows, SUPPORT_SERIES_KEY_REAL);
    console.log(`\n[商用: 実質グラフ]\n${report}`);

    const zeros = rows.filter((r: QuarterlyRow) => !(Number(r[SUPPORT_SERIES_KEY_REAL]) > 0));
    expect(
      zeros.length,
      `BUG REPRO: 商用の実質消費グラフで ${SUPPORT_SERIES_KEY_REAL} が 0 の四半期が ` +
        `${zeros.length}/${rows.length} 件あります。\n${report}\n${diagnostics.join("\n")}`,
    ).toBe(0);
  });

  it(`P3: 診断 — 名目側 ${SUPPORT_SERIES_KEY_NOMINAL} の状況（実質のみか両方かの切り分け）`, () => {
    const rows = filter2005to2016(extractArrayProp(payload, NOMINAL_PROP));
    const report = formatDistribution(rows, SUPPORT_SERIES_KEY_NOMINAL);
    console.log(`\n[商用: 名目グラフ]\n${report}`);

    const zeros = rows.filter((r: QuarterlyRow) => !(Number(r[SUPPORT_SERIES_KEY_NOMINAL]) > 0));
    expect(
      zeros.length,
      `名目側も 0 なら loadSupportMap 全体の失敗、実質のみなら cti_support_real.csv 固有の問題。\n${report}`,
    ).toBe(0);
  });
});
