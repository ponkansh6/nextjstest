# nextjstest/src/

## Responsibility

ブラウザ表示側の型、純粋な表示計算、状態hook、Next.js画面・チャートを含む。サーバーから渡されたview-modelを再fetchせず、表示用に派生させる。

## Design

shared pureのscaleSupportSeriesは入力行を非破壊に扱い、欠損/NaN/±Infinity/対象外を有限0へ捏造せず保持する。serverのvoid applySupportSeriesScalingとclient compatibility adapterは旧公開挙動の0埋め/value||0を保持し、年次normalizerはpositive finite single value以外をfail-closedとする。共有QuarterlyRowはsrc/types/chart.tsに定義する。

`app/page.tsx`がRSCの入口、`app/components/CpiChart.tsx`がClient側composition root。libはadapter・定数・URL変換・計算、hooksはReact stateとブラウザ副作用の境界を担当する。`lib/math/supportSeries.ts`はserver/client共通のpure domain moduleとして正規化・スケール計算と環境非依存型を提供し、server配下へ依存しない。共有の`QuarterlyRow`は`src/types/chart.ts`に定義し、`quarterlyPublicProjection.ts`はこの型を使うclient-safeな公開projectionとしてserver配下を参照しない。`clientCalculations.ts`と`server/lib/data-loader/gdpSupport.ts`はいずれもshared pure moduleを直接利用し、`server/lib/math/supportSeries.ts`は既存server側import向けのvoid adapter/re-exportに限定する。公開JSONのキー、丸め、期間ラベル、欠損値、SSR時の不変条件はprojection境界で維持する。主要な分割点は`cpiChartConfig.ts`、`useCpiChartDisplayData.ts`、`useCagrState.ts`、`useAdvancedPreference.ts`、`useSectionNavigation.ts`、`urlState.ts`、`math/supportSeries.ts`。

## Flow

Server view-model → page props → CpiChart → 年範囲/四半期/系列の表示用派生 → chart adapters → charts・tables・tooltip・CSV。四半期行は共有`src/types/chart.ts`の`QuarterlyRow`境界を通り、`src/lib/quarterlyPublicProjection.ts`が公開projectionを生成する。共有support-series計算は`src/lib/math/supportSeries.ts`をclient計算から直接利用する。

## Integration

URL keysは`from`/`to`/`hidden`/`adv`、storage keysは`newGraphShowAdvanced`/`theme`。`useUrlState`はURLを初期共有状態の読み取り元および`history.replaceState`による同期先として所有し、CpiChartのReact stateが期間・advanced・積み上げhiddenのライブ所有者となる。同期はURL → 初期React state、React state → URLのみで、`popstate`再同期はない。`useAdvancedPreference`はReact state → `newGraphShowAdvanced`の保存だけを担当し、期間・hidden-key依存でもeffectを再実行し、`setItem`例外を無視する。storageからの初期復元やURLへの書き戻しはしない。四半期・CAGR・section navigation・その他の凡例stateはReactのみ、themeは`theme`への`light`/`dark`保存、systemでのkey削除、`data-theme`更新、layout inline scriptによるpaint前適用、useChartThemeのmatchMedia/useSyncExternalStore（SSR snapshot false）で構成する。ThemeToggleはstorageの`setItem`/`removeItem`だけを切替時の個別`try/catch`で保護し、write failureでもDOMとReact stateの更新を継続する。theme用URL keyは使わない。advanced固有の追加テストでは保存値によるReact state上書き・URL書換えがなく、remountでも保存値を復元しないことを確認対象とするが、一般的なURLとlocalStorageの優先順位、実リロード、`popstate`契約は未確認のため断定しない。Phase 3-1実装後も、`clientCalculations.ts`と`quarterlyPublicProjection.ts`はserver配下へ依存しない。既存のAPI、公開props、公開projection/JSON、データモデル、7チャートの順序は変更しない。
