# リファクタリング計画（Vercel 商用デプロイ / パフォーマンス改善）

作成日: 2026-08-02
対象コミット: `2df62f6`
前提: Next.js 16.2.9 (App Router / Turbopack) + React 19.2.7 + Recharts 3.9.0、Vercel 本番デプロイ

---

## 0. 現状の実測値

`pnpm build` を実行して取得した実データ（すべて未圧縮バイト、gzip は `gzip -9`）。

| 指標 | 実測値 |
| --- | --- |
| `/` プリレンダー HTML | **1,272,346 B**（gzip 130,699 B） |
| `/` RSC ペイロード（`index.rsc`） | **1,169,282 B**（gzip 127,352 B） |
| クライアント JS 合計 | **1,025 KB** |
| 最大チャンク（Recharts 相当） | **422,972 B** |
| 2 番目のチャンク | 227,537 B |
| Function にトレースされるファイル数 | **143 個**（うち CSV 24 個 ≒ 2.6 MB） |
| ルート構成 | `/` = Static (ISR 1h), `/api/{cpi,cti,earnings}` = Dynamic |

ペイロード内訳（`index.rsc` のキー出現回数）:

- `"年月"` × 925 → CPI 269 行 + CTI 388 行 + 給与 268 行
- CTI 系キー（`食料（名目）` ほか）× 388 ずつ = **30 列 × 388 行**
- CPI 系キー（`魚介類`, `飲料` ほか）× 269 ずつ = **86 列 × 269 行**
- 小数 8 桁以上の浮動小数リテラル: **9,665 箇所**

**クライアントが実際に使う CPI 列は 16 列（`targetKeys` 4 + `stackedKeys` 12 + `年月`）のみ。86 列中 70 列が丸ごと無駄。**

---

## 1. 優先度サマリ

| # | 項目 | 分類 | 想定効果 | 工数 |
| --- | --- | --- | --- | --- |
| P0-1 | `console.log` の本番混入除去 | 品質 | 即時 | XS |
| P0-2 | `useCpiChartData` の `useMemo` が毎レンダー無効化 | 性能 | 操作レイテンシ大 | S |
| P0-3 | `CustomTooltip` インライン化によるコンポーネント再マウント | 性能 | 操作レイテンシ大 | S |
| P0-4 | `useChartTheme` が毎回新オブジェクトを返す | 性能 | 再描画抑制 | XS |
| P0-5 | サーバー側でのデータ射影・丸め・事前集計 | 性能 | **転送量 -70〜80%** | M |
| P0-6 | 生 CSV を `public/` から退避 | 配信/セキュリティ | Function サイズ -2.6 MB | S |
| P1-1 | Recharts チャンク（423 KB）の分割・遅延化 | 性能 | 初期 JS -40% 目標 | M |
| P1-2 | 未使用 API ルート 3 本の削除 | 保守/コスト | Function 3 本削減 | XS |
| P1-3 | ISR 戦略の見直し（`revalidate` 再設計） | 性能/コスト | 再生成コスト排除 | S |
| P1-4 | 依存関係の整理（`dependencies` → `devDependencies` / 削除） | ビルド/供給網 | インストール時間・脆弱面 | S |
| P1-5 | `CpiChart.tsx`（554 行）の分割 | 保守 | — | M |
| P2-1 | 移動平均・ソート・パース処理の重複統合 | 保守 | — | M |
| P2-2 | チャート共通シェル抽出（5 コンポーネントの重複） | 保守 | — | M |
| P2-3 | 型定義の厳密化（`any` の排除） | 品質 | — | M |
| P2-4 | ツールチェーン整理（tsconfig target / Node / React Compiler / テストランナー） | ビルド | ビルド時間 | S |

---

## 2. P0: 本番前に必ず直す

### P0-1. 本番ビルドに `console.log` が混入している

**現状** — `src/app/components/CpiChart.tsx:122`

```ts
console.log("DEBUG allYears:", allYears);
```

レンダーの度に実行される。ビルドログにも出力される（今回のビルド出力に実際に表示された）。Vercel では SSR/ISR 再生成のたびに Function ログへ書き込まれ、ログ課金とノイズの原因になる。

**対策**

1. 該当行を削除。
2. 再発防止として `next.config.ts` に `compiler.removeConsole` を追加する。

```ts
const nextConfig: NextConfig = {
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};
```

3. `.oxlintrc.json` / `eslint.config.mjs` に `no-console`（`allow: ["error", "warn"]`）を追加。

---

### P0-2. `useCpiChartData` のメモ化が毎レンダー無効化されている

**現状** — `src/app/components/CpiChart.tsx:223-232` でオブジェクトリテラルを直接渡している。

```ts
const { quarterlyNominalData, ... } = useCpiChartData({
  data, endYear, maxCpiDate, nominalData, nominalKeys, realKeys, startYear,
});
```

`src/hooks/useCpiChartData.ts:10-13`:

```ts
const { quarterlyNominalData, quarterlyRealData } = useMemo(
  () => computeChartData(props, hiddenQuarters),
  [hiddenQuarters, props],   // ← props は毎レンダー新しい参照
);
```

**影響** — `props` の参照が毎回変わるため `useMemo` は一度もヒットしない。結果として `computeChartData`（`src/lib/clientCalculations.ts:78-256`）が **凡例クリック・年セレクト変更・CAGR 入力のすべてで再実行**される。この関数は 388 行 × 30 列の CTI データを正規化して Map を構築し、`startYear`〜`endYear` の全月（22 年 × 12 = 264 件）を生成し、名目・実質の 2 パスで四半期集計する。1 回の凡例クリックあたり数万回のプロパティアクセスとオブジェクト生成が発生している。

**対策** — フック側でプリミティブに分解して依存を張る。

```ts
export const useCpiChartData = (props: UseCpiChartDataProps) => {
  const [hiddenQuarters, setHiddenQuarters] = useState<number[]>([]);
  const { data, nominalData, startYear, endYear, nominalKeys, realKeys, maxCpiDate } = props;

  const result = useMemo(
    () => computeChartData({ data, nominalData, startYear, endYear, nominalKeys, realKeys, maxCpiDate }, hiddenQuarters),
    [data, nominalData, startYear, endYear, nominalKeys, realKeys, maxCpiDate.year, maxCpiDate.month, hiddenQuarters],
  );
  // ...
};
```

`toggleQuarter` も `useCallback` 化する。なお P0-5 を実施すればこの計算自体がサーバー側へ移り、問題は構造的に消える（そちらが本命）。

---

### P0-3. `CustomTooltip` をインライン関数で渡しコンポーネントが毎回再マウントされる

**現状** — `src/app/components/CpiChart.tsx:343-350, 512-519, 526-533, 543-550` の 4 箇所。

```tsx
CustomTooltip={(props: {...}) => <CustomTooltip {...props} />}
```

渡している関数は**レンダーごとに新しい関数（＝新しいコンポーネント型）**になる。子側では `content={<CustomTooltip ... />}`（例: `MajorIndicesChart.tsx:96`）として React 要素の `type` に使われるため、React は「別種のコンポーネント」と判定し、毎レンダーでツールチップのサブツリーを **アンマウント → 再マウント**する。ホバー中の状態も失われる。

**対策** — `CustomTooltip` を別モジュールに切り出し、参照をそのまま渡す。

```tsx
// src/app/components/CustomTooltip.tsx
export const CustomTooltip = React.memo<CustomTooltipProps>(({ ... }) => { ... });

// CpiChart.tsx
<MajorIndicesChart ... CustomTooltip={CustomTooltip} />
```

`StackedAreaChart` / `SpendingBarChart` はすでに素の参照を渡しているので、4 箇所を揃えるだけで済む。

---

### P0-4. `useChartTheme` が毎レンダー新しい `chartColors` を返す

**現状** — `src/hooks/useChartTheme.ts:14-19`。中身は CSS 変数名の固定文字列なのに、毎回新しいオブジェクトリテラルを生成している。これが全チャートに props として流れるため、`React.memo` を後から入れても無効化される。

**対策** — モジュールスコープの定数に固定する。

```ts
const CHART_COLORS = {
  axisText: "var(--chart-text)",
  gridStroke: "var(--chart-grid)",
  tooltipBg: "var(--tooltip-bg)",
  tooltipText: "var(--tooltip-text)",
} as const;

export const useChartTheme = () => {
  const isMobile = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return { chartColors: CHART_COLORS, isMobile };
};
```

`useSyncExternalStore` に渡している `subscribe` / `getSnapshot` もモジュールスコープへ出す（現状 `getSnapshot` は毎回 `window.matchMedia()` を呼ぶインライン関数）。

**P0-2 〜 P0-4 は 3 点セットで初めて効く。** これらを直したうえで各チャートを `React.memo` でラップすると、凡例クリック時に再描画されるチャートを 1 つに限定できる（現状は 7 チャートすべてが再描画）。

---

### P0-5. サーバーからクライアントへ送るデータを射影・丸め・事前集計する 【最大の効果】

**現状** — `src/app/page.tsx:5-9` で 3 データセットを丸ごとクライアントコンポーネントへ渡している。

```ts
const [cleanData, ctiData, totalEarningData] = await Promise.all([
  loadCpiData(), loadCtiData(), loadTotalEarningData(),
]);
return <CpiChart data={cleanData} ctiData={ctiData} totalEarningData={totalEarningData} />;
```

これが HTML 1.27 MB / RSC 1.17 MB の正体。無駄の内訳は 3 つ。

**(a) 未使用列** — CPI は 86 列送っているが、クライアントが参照するのは `targetKeys`（4）+ `stackedKeys`（12）+ `年月` の **16 列**のみ。`魚介類` `和服` `たばこ` `時間軸コード` などは一切描画されない。**70 列 × 269 行が完全な死荷重。**

**(b) 過剰精度** — 小数 8 桁以上のリテラルが 9,665 箇所（例: `108.31999999999998`）。チャートの表示精度は `toFixed(2)`（`CpiChart.tsx:100`）なので、2 桁に丸めれば同じ絵になる。

**(c) 集計前データ** — `ctiData`（388 行 × 30 列）はクライアントで四半期に畳まれるためだけに送っている（`computeChartData`）。畳んだ後は **88 四半期 × 22 列**。生の月次を送る必然性がない。

**対策** — `page.tsx`（Server Component）に射影レイヤーを挟む。

```ts
// server/lib/view-models/dashboard.ts
const round2 = (v: number) => Math.round(v * 100) / 100;

export function toCpiView(rows: CpiData[]): CpiView[] {
  const keys = [...targetKeys, ...stackedKeys];
  return rows.map((r) => {
    const out: CpiView = { 年月: r.年月 };
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "number") out[k] = round2(v);
    }
    return out;
  });
}
```

さらに `computeChartData`（`src/lib/clientCalculations.ts`）を `server/lib/` へ移し、**四半期集計をサーバーで完了**させてから送る。これにより:

- `ctiData` の送信を廃止（388 行 × 30 列 → 88 行 × 22 列 の集計済みデータ 2 本）
- クライアントの初回 hydration 時の計算がゼロになる
- `useCpiChartData` は `hiddenQuarters` によるフィルタ（行の除外）だけを担当する軽量フックになる

**期待効果（見積り）**

| | 現状 | 対策後（見積り） |
| --- | --- | --- |
| RSC ペイロード | 1,169 KB | **約 250〜300 KB** |
| gzip 後 | 127 KB | **約 30〜40 KB** |
| HTML | 1,272 KB | **約 350 KB** |

LCP / TTI に直接効く。Vercel の帯域課金・Edge キャッシュ効率にも効く。

**注意点** — 年範囲（`startYear`/`endYear`）はクライアント state なので、全期間分は送る必要がある。年ごとに分割して必要分のみ Server Action で取りに行く設計も可能だが、上記の射影だけで十分小さくなるため第一段階では不要。

---

### P0-6. 生の統計 CSV が `public/` に置かれている

**現状** — `server/lib/dataIo.ts:38-70` はすべて `path.join(process.cwd(), "public", ...)` で CSV を読む。結果として:

1. **全 CSV が `https://<domain>/cpi_data.csv` 等で公開ダウンロード可能。** 出典は公開統計なので機密ではないが、意図しない配信であり帯域を消費する。
2. **`public/backup/` が git 管理下に残っている**（`.gitignore` 追加前にコミット済み）。`hon-mks202601.csv` 614 KB、`cpi_data_converted_trial.csv` 302 KB など **約 1.1 MB の作業用バックアップが本番に配信されている**。
3. Next.js のファイルトレースが `public/` 配下 24 CSV（約 2.6 MB）を **4 つの Function すべてに同梱**している（`page.js.nft.json` に 143 ファイル）。Function サイズが増えコールドスタートに響く。

**対策**

```bash
# 1) バックアップを追跡から外す
git rm -r --cached public/backup
git rm --cached public/cti0211_1.csv          # コード内で未参照

# 2) 実データを非公開ディレクトリへ
git mv public/cpi_data.csv               data/source/cpi_data.csv
git mv public/contribution.csv           data/source/contribution.csv
# ... 参照している 11 ファイルすべて
```

`dataIo.ts` のパス構築を `path.join(process.cwd(), "data/source", filename)` に変更する。`data/` 配下は静的配信されないため公開が止まり、`public/` が空（favicon のみ）になることで無関係な CSV のトレースも消える。

**さらに踏み込むなら** — CSV はデプロイ時にしか変わらない。ビルド時に一度だけパースして JSON にする方式（下記 P1-3）にすれば、実行時のファイル読み込み自体が不要になり、Function に CSV を同梱する必要もなくなる。

---

## 3. P1: 商用運用の質を上げる

### P1-1. Recharts チャンク 423 KB の削減

**現状** — 最大チャンクが 422,972 B（クライアント JS 合計 1,025 KB の 41%）。`CpiChart.tsx` が 7 つのチャートコンポーネントを静的 import しており、`AreaChart` / `BarChart` / `LineChart` とその依存（d3-scale, d3-shape, victory-vendor など）がすべて初期バンドルに入る。

**対策（効果順）**

1. **`transpilePackages: ["recharts"]` を外して計測する** — `next.config.ts:5`。Recharts 3.x は ESM を正しく提供しており、`transpilePackages` はツリーシェイキングを阻害しビルド時間も増やす。Next.js 16 は `recharts` を `optimizePackageImports` の既定対象に含むため、`transpilePackages` を外すほうが小さくなる可能性が高い。**外してビルドし、チャンクサイズを比較すること**（回帰したら戻す）。

2. **ファーストビュー外のチャートを `next/dynamic` 化** — ページには 7 つのチャートが縦に並ぶが、初期表示で見えるのは 1〜2 個。3 番目以降を遅延ロードする。

```tsx
const SpendingBarChart = dynamic(() => import("./SpendingBarChart").then((m) => m.SpendingBarChart), {
  loading: () => <ChartSkeleton />,
});
```

`ssr: false` は SEO とレイアウトシフトの観点から**付けない**（SSR させたうえで JS の読み込みだけ遅らせる）。

3. **Bundle Analyzer の常設** — `rollup-plugin-visualizer` が devDependencies に入っているが Next では機能しない。`@next/bundle-analyzer` に置き換え、`ANALYZE=1 pnpm build` で可視化できるようにする。

4. **（中期）チャートライブラリの再検討** — 現在使っているのは Area / Bar / Line + Tooltip + ReferenceLine のみ。将来的な選択肢として、`recharts` の必要部分だけを使う薄いラッパを自作するか、より軽量な代替（visx など）への移行が検討できる。ただし移行コストが大きいため、1〜3 の効果を測ってから判断する。

---

### P1-2. 未使用の API ルート 3 本

**現状** — `src/app/api/{cpi,cti,earnings}/route.ts` は `Response.json(...)` を返すだけで、**アプリのどこからも `fetch` されていない**（`src/` 内に `fetch(` / `/api/` の参照ゼロ）。ページは Server Component から `loadCpiData()` を直接呼んでいる。

ビルド出力では 3 本とも `ƒ (Dynamic)` = リクエストごとに Function が起動して CSV を再パースする。公開エンドポイントとして残っているため、外部から叩かれれば CPU 時間が課金される。

**対策** — 削除する。外部公開 API として意図があるなら、以下を明示する。

```ts
export const revalidate = 3600;          // 静的化してキャッシュ
export const dynamic = "force-static";
```

加えて `Cache-Control` ヘッダーと（必要なら）Vercel BotID / WAF レートリミットを検討する。

---

### P1-3. ISR 戦略の見直し

**現状** — `/` は `Static / Revalidate 1h`。`server/lib/dataLoader.ts` の各ローダーが `unstable_cache(..., { revalidate: 3600 })` を使っている。

**問題** — データソースはリポジトリにコミットされた CSV であり、**デプロイしない限り変わらない**。1 時間ごとの再生成は、まったく同じ結果を得るために CSV 再パース + 全計算をやり直しているだけ。Vercel の Function 実行時間（Active CPU）を無意味に消費する。

**対策 A（推奨・最小変更）** — 再生成を止める。

```ts
// src/app/page.tsx
export const revalidate = false;   // デプロイ時にのみ生成
```

ローダー側の `unstable_cache` も不要になる（`server/lib/data-loader/cache.ts` ごと整理できる）。

**対策 B（さらに速い）** — ビルド時に CSV → JSON へ前処理する。`scripts/build-data.ts` を追加し `prebuild` で実行、`server/lib` は生成済み JSON を `import` するだけにする。Function から `fs` と `papaparse` が消え、コールドスタートとバンドルサイズがさらに縮む。

**将来データ更新を自動化する場合** — CSV を Vercel Blob に置き、`revalidate` + `revalidateTag` による On-Demand ISR に切り替える。その時点で対策 B は使えなくなるため、どちらの運用にするかを先に決める。

**併せて `next/cache` のモダン API へ** — `unstable_cache` は Next.js 16 では Cache Components（`use cache` + `cacheLife` / `cacheTag`）が後継。上記の対策 A/B を採るなら不要だが、動的データを扱う方向に進むなら `use cache` へ移行する。

---

### P1-4. 依存関係の整理

| パッケージ | 現状 | 実際の使用箇所 | 対応 |
| --- | --- | --- | --- |
| `sqlite-vec` | dependencies | **どこからも未使用** | 削除 |
| `react-is` | dependencies | **未使用** | 削除 |
| `@reduxjs/toolkit` | dependencies | `tests/vitest.ui.config.ts` の `inline` 指定のみ（実コードで未使用） | 削除（テスト設定も見直し） |
| `xlsx` (0.18.5) | dependencies | `scripts/ts_converters/**` のみ | **devDependencies へ** |
| `arquero` | dependencies | `scripts/**` のみ | **devDependencies へ** |
| `iconv-lite` | dependencies | `scripts/ts_converters/**` のみ | **devDependencies へ** |
| `rollup-plugin-visualizer` | devDependencies | 未使用（Next では効かない） | `@next/bundle-analyzer` に置換 |

**`xlsx` については補足** — npm 上の `xlsx@0.18.5` は SheetJS が npm 配布を停止する前の版で、プロトタイプ汚染 / ReDoS の既知脆弱性が報告されている。変換スクリプト専用なので `devDependencies` へ移せば本番 Function からは消える。恒久対応としては SheetJS 公式配布版への差し替えを検討する。

`dependencies` を絞ることで `pnpm install` 時間、Vercel のビルドキャッシュ、Function バンドルサイズすべてが改善する。

**その他の未使用コード**

- `src/lib/unstableCache.ts` — どこからも import されていない完全な死にコード。削除（`require()` を含み Turbopack と相性も悪い）。
- `test_perm.txt` — ルートに空ファイルが追跡されている。削除。
- `src/hooks/useLegendState.ts` — 定義されているが `CpiChart` は同等ロジックを 3 回インラインで書いている（`CpiChart.tsx:180-196`）。フックを使う側へ寄せる（P1-5 参照）。
- `src/app/components/ChartLegend.tsx` — どのチャートからも使われていない。各チャートが凡例を自前実装している。P2-2 の共通化で復活させるか削除する。

---

### P1-5. `CpiChart.tsx`（554 行）の分割

**現状の責務** — 年抽出 / 年範囲 state / データフィルタ・マージ / 凡例 state 3 種 / 名目・実質の色計算 / CAGR フォーム state と計算 / ツールチップ定義 / 7 チャートのレイアウト。

**具体的な問題**

- `displayData`（169 行）は宣言だけで未使用（`eslint-disable` でごまかしている）。`earningsData = mergedData`（172 行）も単なる別名。
- 凡例トグルのロジックが `handleLegendClick` / `handleStackedLegendClick` / `handleMaLegendClick` の 3 箇所でコピペされている。`useLegendState` が既に存在するのに使われていない。
- `allYears.filter((y) => y >= 2005)` が 3 箇所（319, 385, 403 行）で重複。`2005` がマジックナンバー。
- CAGR の 100 行弱（278-314, 372-449 行）がチャート本体と同居。
- エラー通知が `alert()`（284, 295, 306 行）。商用 UI としては不適切で、`calculateCategorySum` の `throw` を制御フローに使っている点も設計として弱い。
- `if (loading) return ...` / `if (error) return ...`（234-235 行）が **Hooks 呼び出しの後・別の Hook 呼び出しの前**に置かれている。`useCpiChartData` は常に `loading: false` を返すので現状は動くが、将来非同期化したら Rules of Hooks 違反になる潜在バグ。

**分割案**

```
src/app/components/
  CpiChart.tsx                  # レイアウトのみ（~120 行）
  CustomTooltip.tsx             # P0-3 で切り出し
  CagrPanel.tsx                 # CAGR フォーム + 結果表示
  charts/…                      # 既存 7 コンポーネント
src/hooks/
  useYearRange.ts               # startYear/endYear + allYears 導出
  useLegendState.ts             # 既存を 3 箇所すべてで使用
src/lib/
  chartConstants.ts             # MIN_DISPLAY_YEAR = 2005 を追加
```

CAGR のエラーは `alert()` ではなく `cagrError` state → パネル内インライン表示にする。`calculateCategorySum` は `throw` をやめて `number | null` を返す形に変える。

---

## 4. P2: 中期的な保守性

### P2-1. 重複ロジックの統合

**移動平均の実装が 3 つある。**

| 実装 | 場所 | 特徴 |
| --- | --- | --- |
| `computeTrailingMA12` | `server/lib/data-loader/earnings.ts:30` | `Map` エントリ用、`v > 0` フィルタ、内部ソート |
| `computeMovingAverageToField` | `server/lib/data-loader/earnings.ts:52` | 配列用、別フィールドへ書き出し |
| `applyMovingAverage` | `server/lib/serverCalculations.ts:81` | 配列用、破壊的更新、`any[]` |

さらに `server/lib/dataProcessor.ts:70-77` にも 4 つ目のインライン移動平均がある。`applyMovingAverage` は現在どこからも呼ばれていない。

→ `server/lib/math/movingAverage.ts` に単一の純粋関数として統合する。

```ts
export function trailingMovingAverage(values: readonly number[], window: number, opts?: { skipNonPositive?: boolean }): number[];
```

**年月パース / ソートが 8 箇所以上に散在。**

`/^(\d{4})年(\d{1,2})月/` のマッチとソート比較が `chartUtils.ts:69-79`、`earnings.ts:16-27`、`cpi.ts:199-208`、`dataProcessor.ts:52-60`、`clientCalculations.ts:83-88`、`CpiChart.tsx:114, 137` に重複している。正規表現の揺れ（`0?` の有無、`^\s*` の有無）もありバグの温床。

→ `src/lib/yearMonth.ts` に集約する。

```ts
export function parseYearMonth(ym: string): { year: number; month: number } | null;
export function compareYearMonth(a: string, b: string): number;
export function normalizeYearMonth(ym: string): string;   // "2020年01月" → "2020年1月"
export function extractYear(ym: string): number;
```

**寄与度ウェイトのパースが 2 箇所。** `dataIo.ts:72-87` の `parseContributionWeights` と、`cpi.ts:14-26` のインライン実装が完全に同じ処理。前者は**どこからも呼ばれていない**。`cpi.ts` 側を `parseContributionWeights` の呼び出しに置き換える。

---

### P2-2. チャート共通シェルの抽出

`MajorIndicesChart` / `StackedAreaChart` / `SpendingBarChart` / `EarningsBreakdownChart` / `ResidualAreaChart` / `NewGraph` の 6 コンポーネントが、以下をほぼ逐語的に重複させている。

- 節目年の `ReferenceLine` 生成（`[2010, 2015, 2020, 2025]` がハードコードされた `data.filter(...).map(...)`、**毎レンダー全行スキャン**）
- `CartesianGrid` / `XAxis` / `YAxis` / `Tooltip` の設定一式
- 凡例ボタンの markup（`legendItem` / `legendIcon` / `legendLabel`）
- `CustomTooltip` の props 型定義（**6 ファイルに同一の inline 型がコピーされている**）

**対策**

```tsx
// src/app/components/charts/ChartFrame.tsx
export function ChartFrame({ title, infoKey, legend, children }: ChartFrameProps);

// src/app/components/charts/YearReferenceLines.tsx  — メモ化して節目年だけ計算
// src/types/chart.ts  — CustomTooltipProps を単一定義に
```

`[2010, 2015, 2020, 2025]` は `MILESTONE_YEARS` として `chartConstants.ts` へ。データ範囲から動的に導出してもよい（2030 年になっても線が引かれるように）。

これで各チャートは「どの系列をどう描くか」だけを持つ 40〜60 行に縮む。

---

### P2-3. 型定義の厳密化

`strict: true` が有効なのに、以下で実質無効化されている。

- `server/lib/data-loader/cache.ts` — `fn: any`, `opts?: any`, `Map<string, any>`（ファイル全体が `any`）
- `server/lib/data-loader/cpi.ts:74-118` — `(row: any)`, `(c: any)`, `(h: any, i: any)` が 10 箇所以上
- `src/lib/clientCalculations.ts:11` — `sumCategoryValues(row: any, ...)`
- `src/types/data.ts:8` — `[key: string]: string | number` のインデックスシグネチャが型チェックを事実上無効化している

**対策**

1. CSV パース直後の生データ型 `RawCsvRow = Record<string, string | number | null>` と、処理後のドメイン型 `CpiSeries` / `CtiSeries` / `EarningsSeries` を分離する。ドメイン型ではインデックスシグネチャをやめ、キーを明示する（`stackedKeys` から `type CpiCategory = typeof CPI_CATEGORIES[number]` を導出できる）。
2. `cache.ts` にジェネリクスを入れる。

```ts
export function maybeCache<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string,
  opts?: { revalidate?: number },
): (...args: A) => Promise<R>;
```

3. **テスト用分岐を本番コードから追い出す。** `cache.ts:10` の `process.env.VITEST || process.env.JEST_WORKER_ID || NODE_ENV === "test"` 判定は、テスト専用のコードパスを Function バンドルに含めてしまっている。テスト側で `vi.mock` / DI に置き換える。

---

### P2-4. ツールチェーン整理

| 項目 | 現状 | 対応 |
| --- | --- | --- |
| `tsconfig.target` | `ES2017` | `ES2022` へ。コードは既に `toSorted`（ES2023）や `??` を使っており、`ES2017` 指定は async/await 等を無意味にダウンレベルしてバンドルを膨らませる |
| `.node-version` | `22` | Vercel の既定は Node 24 LTS。`24` へ更新し、`package.json` に `engines.node` も明記 |
| `next.config.ts` の `turbopack.root` | `"./"` | ビルド時に「absolute にせよ」と警告が出る。`path.resolve(import.meta.dirname)` に変更 |
| React Compiler | `babel-plugin-react-compiler` は導入済みだが `next.config.ts` に `reactCompiler: true` が**ない**＝一切効いていない | **有効化を推奨。** P0-2〜P0-4 のメモ化を自動で肩代わりする。ただし Babel 経由になりビルドが遅くなるため、有効化前後でビルド時間とバンドルサイズを計測する。使わないなら依存ごと削除 |
| テストランナー | `bun test`（ロジック）+ `vitest`（UI）の二重構成 | 設定ファイル 3 つ（`vitest.config.ts` / `tests/vitest.ui.config.ts` / `tests/vite.zero.config.ts`）+ `bunfig.toml` の維持コストが高い。Vitest への一本化を検討 |
| CI (`.github/workflows`) | `npm ci` を使っているが、プロジェクトは **pnpm 専用**（`preinstall: only-allow pnpm`）。`cache: "npm"` も不整合。Node は 20 固定 | `pnpm/action-setup` + Node 24 + `pnpm install --frozen-lockfile` に修正。現状 CI は失敗しているはず |
| Vercel 設定 | 設定ファイルなし | `vercel.ts`（`@vercel/config`）を追加し、ビルドコマンド・リージョン（日本向けなら `hnd1`）・キャッシュヘッダーを明示 |

---

## 5. 実施順序

各ステップの後に `pnpm test:all` と `pnpm build` を通し、**バンドル / ペイロードを計測して記録する**。

**Step 1 — 安全な掃除（半日）**
P0-1（console.log）→ P1-2（API ルート削除）→ P1-4（依存整理・死にコード削除）→ P2-4 の設定系
リスク最小。ここで `tsconfig` / Node / CI を直しておくと以降が安定する。

**Step 2 — クライアント性能（1 日）**
P0-4（chartColors）→ P0-3（CustomTooltip）→ P0-2（useMemo）→ 各チャートに `React.memo`
凡例クリックの体感が最も変わる区間。React Compiler 有効化を試すならここ。

**Step 3 — 転送量（1〜2 日）**
P0-5（射影・丸め・サーバー側四半期集計）→ P0-6（CSV を `data/` へ）→ P1-3（`revalidate` 見直し）
**最大の効果。** 数値が変わっていないことを `tests/data-quality/**` と `tests/computation-contract/**` で担保する。

**Step 4 — バンドル（1 日）**
P1-1（`transpilePackages` 除去の計測 → `next/dynamic` 化 → bundle analyzer 常設）

**Step 5 — 構造（2〜3 日）**
P1-5（CpiChart 分割）→ P2-2（共通シェル）→ P2-1（ロジック統合）→ P2-3（型厳密化）

---

## 6. 完了条件（目標値）

| 指標 | 現状 | 目標 |
| --- | --- | --- |
| `/` HTML | 1,272 KB | **< 400 KB** |
| RSC ペイロード (gzip) | 127 KB | **< 40 KB** |
| クライアント JS 合計 | 1,025 KB | **< 600 KB** |
| Function トレースファイル | 143 個 / 2.6 MB の CSV | **CSV 0 個**（ビルド時 JSON 化の場合） |
| 凡例クリック時の再計算 | `computeChartData` 全実行 | **0**（サーバー集計済み） |
| 本番 `console.log` | 1 箇所 | **0** |
| `dependencies` 件数 | 11 | **6**（next, react, react-dom, recharts, papaparse ほか） |

---

## 7. 計測コマンド

```bash
# ビルドと成果物サイズ
pnpm build
ls -la .next/server/app/index.html .next/server/app/index.rsc
find .next/static -name "*.js" -printf "%s %p\n" | sort -rn | head
gzip -9 -c .next/server/app/index.rsc | wc -c

# Function にトレースされるファイル
python3 -c "import json;d=json.load(open('.next/server/app/page.js.nft.json'));print(len(d['files']))"

# バンドル可視化（@next/bundle-analyzer 導入後）
ANALYZE=1 pnpm build
```

---

## 8. 仕様書への反映（AGENTS.md の運用ルール）

本計画のうち以下は `openspec/specs/nextjstest/spec.md` の更新を伴う。実装と同時に反映すること。

- **Data Sources** — CSV の配置が `public/` → `data/source/`（P0-6）
- **Data Flow** — 四半期集計がクライアント → サーバーへ移動（P0-5）。クライアントへ渡すデータが射影済みビューモデルになる
- **Component Tree** — `CustomTooltip` / `CagrPanel` / `ChartFrame` の新設、`ChartLegend` の扱い（P1-5, P2-2）
- **Requirements** — API ルート 3 本の削除（P1-2）、ISR / `revalidate` の挙動変更（P1-3）
