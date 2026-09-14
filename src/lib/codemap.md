# nextjstest/src/lib/

## Responsibility

チャート表示に共有される純粋な定数、型変換、年月/四半期処理、表示計算、URL変換、CSV出力を提供する。ブラウザ側の表示ロジックとサーバー側loaderが共有する境界でもある。

## Design

`chartConstants.ts`が系列・色・7チャート関連設定、`chartUtils.ts`/`clientCalculations.ts`がfilter・merge・scale・CAGR・表示派生、`chartAdapters.ts`がview-modelから`CpiData`へ変換する。`yearMonth.ts`と`math/quarter.ts`は年月/四半期の純粋処理、`quarterlyPublicProjection.ts`はGDP内部列を公開四半期viewから除外する。`urlState.ts`は副作用のないquery変換、`csvExport.ts`はCSV生成を担う。

## Flow

server view-model/loader出力 → adapters・`computeChartData` → chart/table props。入力は`CpiData`/view型、系列定数、年月境界で、URL値は`serializeUrlState`等でqueryへ変換される。

## Integration

Phase 1では`urlState.ts`が`useUrlState`から分離された純粋境界となり、`useCpiChartDisplayData`が既存のfilter/merge計算を利用する。`useCagrState`もここで計算関数を呼ぶ。window/localStorageには触れず、server loaderやe-Stat API proxyを経由せず、公開props、API、データモデル、URLキーの意味を変えない。client→server不正importはない。
