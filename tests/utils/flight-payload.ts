/**
 * React Flight (RSC) ペイロードから CpiChart に渡された四半期配列を取り出すユーティリティ。
 *
 * `src/app/page.tsx:13` の `export const revalidate = false` により、ページはビルド時に
 * 完全プリレンダされる。したがって商用の描画データは静的な RSC ペイロードとして確定しており、
 * ローカルのビルド出力（`.next/server/app/index.rsc`）からも、商用URLからも、
 * 同じ形式で取り出して比較できる。
 *
 * `page.tsx:88-94` が `<CpiChart quarterlyNominalData={...} quarterlyRealData={...} />` を
 * 描画するため、ペイロード中にはプロパティ名がそのまま現れる。
 */

export type QuarterlyRow = Record<string, string | number>;

/** RSC ペイロード中で四半期配列を指し示すプロパティ名。`page.tsx:90-91` に対応。 */
export const NOMINAL_PROP = "quarterlyNominalData";
export const REAL_PROP = "quarterlyRealData";

/**
 * `"<propName>":[ ... ]` の配列本体を、括弧の対応を数えながら切り出して JSON.parse する。
 *
 * 単純な正規表現ではネストした配列/オブジェクトで破綻するため、文字列リテラル・
 * エスケープを考慮した走査を行う。
 */
export function extractArrayProp(payload: string, propName: string): QuarterlyRow[] {
  const marker = `"${propName}":[`;
  const markerStart = payload.indexOf(marker);
  if (markerStart === -1) {
    throw new Error(
      `RSC payload に "${propName}" が見つかりません（ペイロード長: ${payload.length}）。` +
        `ページ構造が変わったか、取得したレスポンスが Flight ペイロードではありません。`,
    );
  }

  const arrayStart = markerStart + marker.length - 1; // '[' の位置
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart; i < payload.length; i++) {
    const ch = payload[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(payload.slice(arrayStart, i + 1)) as QuarterlyRow[];
      }
    }
  }

  throw new Error(`"${propName}" の配列が閉じていません（ペイロードが途中で切れている可能性）。`);
}

/**
 * HTML レスポンスから Flight ペイロードを復元する。
 *
 * Next.js は `self.__next_f.push([1,"<chunk>"])` の連続としてペイロードを埋め込むため、
 * 全チャンクを順に連結する。`RSC: 1` ヘッダ付きリクエストが使えない場合のフォールバック。
 */
export function extractFlightFromHtml(html: string): string {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    chunks.push(JSON.parse(m[1]) as string);
  }
  if (chunks.length === 0) {
    throw new Error(
      "HTML から self.__next_f.push(...) のチャンクを抽出できませんでした。" +
        "Next.js のページではないか、レスポンスがエラーページの可能性があります。",
    );
  }
  return chunks.join("");
}

/** 2005–2016 年の行だけを抜き出す（この範囲外は supportSeries.ts:34-38 により設計上ゼロ）。 */
export function filter2005to2016(rows: QuarterlyRow[]): QuarterlyRow[] {
  return rows.filter((r) => {
    const y = Number(r["年"]);
    return y >= 2005 && y <= 2016;
  });
}

/** 年×四半期の値を表形式に整形する。失敗時の引き継ぎ材料として必ず出力する。 */
export function formatDistribution(rows: QuarterlyRow[], key: string): string {
  const table: Record<number, Record<number, number>> = {};
  for (const r of rows) {
    const y = Number(r["年"]);
    const q = Number(r["quarter"]);
    (table[y] ??= {})[q] = Number(r[key]);
  }
  const lines: string[] = [];
  lines.push(`=== ${key} 分布 (2005-2016) ===`);
  lines.push("Year | Q1      | Q2      | Q3      | Q4      | zeros");
  lines.push("-----|---------|---------|---------|---------|------");
  let zeros = 0;
  for (let y = 2005; y <= 2016; y++) {
    const cells = [1, 2, 3, 4].map((q) => table[y]?.[q]);
    zeros += cells.filter((v) => v === 0).length;
    lines.push(
      `${y} | ${cells.map((v) => String(v ?? "-").padEnd(7)).join(" | ")} | ` +
        `${cells.filter((v) => v === 0).length}`,
    );
  }
  lines.push(`合計ゼロ件数: ${zeros} / ${rows.length}`);
  return lines.join("\n");
}
