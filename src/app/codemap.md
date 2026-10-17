# nextjstest/src/app/

## Responsibility

Server Componentのページ入口、Clientのダッシュボードcomposition root、チャート、表、操作UI、e-Stat API routesをまとめる。

## Design

`page.tsx`は`server/lib/dataLoader.ts`公開facadeを呼び出し、その先の`server/lib/view-models/`実装経路を通じてserializableなview-modelを`CpiChart`へ渡す。`CpiChart`は`CPI_CHART_SECTIONS`、表示用hook、CAGR、URLのrange stateやlegend hidden state等を組み立て、7チャートを描画する。URL同期は`useUrlState`の`replaceState`が担当し、旧`adv`を削除する。遅延対象は`LazyMount`で境界化する。

## Flow

`page.tsx`（Server Component）→ `server/lib/dataLoader.ts`公開facade → `server/lib/view-models/`実装経路 → `CpiChart`（Client）→既存adapter/表示用hook→ `MajorIndicesChart`、`StackedAreaChart`、消費名目/実質、`EarningsBreakdownChart`、`ResidualAreaChart`、`NewGraph` → tooltip/details table/CSV。

`api/estat/{stats-list,meta,data}`はそれぞれ独立したGETのHTTP境界で、ダッシュボード初期表示のclient fetch経路ではない。各routeはquery変換、typed operation、error responseをつなぐ。

## Integration

`cpiChartConfig.ts`が7セクションのid・label・順序を所有し、`useSectionNavigation`と`SectionTabs`が同じ定義を使う。`ThemeToggle`は`theme`へ`light`/`dark`を保存し、systemで削除して`data-theme`を更新する。切替時のstorage write failureは保存操作だけで吸収し、DOMとReact stateの更新を継続する。layoutのinline scriptはpaint前に保存済みthemeを適用し、theme用URL keyは使わない。公開props/API/データモデルと既存のURL/storage挙動を維持する。
