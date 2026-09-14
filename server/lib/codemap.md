# nextjstest/server/lib/

## Responsibility

サーバー側のデータ入出力、loader、検証・計算、cache、view-model、e-Stat clientを提供する主要境界。

## Design

shared pureのscaleSupportSeriesは欠損/NaN/±Infinity/対象外を有限0へ捏造せず入力行を非破壊に扱う。serverのvoid applySupportSeriesScalingは旧公開挙動の0埋め/value||0を保持し、年次normalizerはpositive finite single value以外をfail-closedとする。

- `dataLoader.ts`: CPI/CTI/GDP、給与、人口およびstatusの唯一の公開facade。公開signature・return shape・error behavior・SSR境界を維持し、内部loaderへ委譲する。
- `data-loader/cpi.ts`: CPI/CTI/GDPの内部adapterと既存loader経路を提供する。公開entry pointではなく、CPIのsource/validation/transform、CTI入力境界、GDP support検証は分離moduleへ委譲する。
- `math/supportSeries.ts`: `src/lib/math/supportSeries.ts`のshared pure domain計算を再exportする、既存server側import向けのvoid互換server adapter。`gdpSupport.ts`はこのadapterを経由せずshared pure moduleを直接利用し、正規化・スケールの数式自体はserver専用ではない。2020/2025基準、丸め、0/NaN/非有限値、欠損値の扱いはshared moduleの契約を維持する。
- `data-loader/ctiValidation.ts`、`gdpSupport.ts`: CTIのmain/support入力検証と、年次・四半期GDPのmetadata/hash/公式・e-Stat比較を担当する。`isQuarterlyComparisonReady`はmetadata-only predicateであり、raw rowsの検証・変換は行わない。
- `data-loader/earnings.ts`、`population.ts`: ドメイン別CSV loader。`cache.ts`は再利用可能なcache境界。
- `server/lib/view-models/quarterlyGdpTransform.ts`: 四半期期間の連続性、比較係数、raw→comparison変換、YYYY-Qn exact joinを担う副作用のないpure module。共有`QuarterlyRow`は`src/types/chart.ts`にあり、`quarterlyAggregation.ts`は`mergeQuarterlyGdpRows`の既存API互換adapterと共有型の再exportを提供する。公開projectionはclient-safeな`src/lib/quarterlyPublicProjection.ts`が担い、公開JSONのキー・丸め・欠損・SSR境界を不変にする。
- `server/lib/view-models/dashboard.ts`と`server/lib/view-models/quarterlyProjection.ts`: 列選択・2桁丸め・公開四半期投影。
- `estat.ts`: e-Stat APIへの共通server client。`fetchEStat`がtyped operationの取得・検証・エラー分類を担い、`getStatsData`だけがVALUE配列正規化を行う。`dataIo.ts`はsource path解決を担当する。

## Flow

CSV/e-Stat → dataIo/domain loader → 検証・cache → `dataLoader.ts`唯一の公開facade → server計算/view-model → `page.tsx` → `CpiChart`。support-seriesのpure計算は`src/lib/math/supportSeries.ts`をdomainとして共有し、`gdpSupport.ts`はshared pure moduleを直接利用する。既存server側importでlegacy void形状が必要な場合だけ`server/lib/math/supportSeries.ts`の互換adapter/re-exportを通る。client計算も同じshared pure moduleを直接利用し、CPIの表示は内部`data-loader/cpi.ts`の選択済みデータをfacade経由でview-model化し、clientで再fetchしない。`quarterlyProjection.ts`も同じfacadeからloaderをimportする。

## Integration

API routeは`estat.ts`の独立したHTTP境界として利用し、dashboardの`dataLoader.ts` facade/SSR/cache/data-model flowとは分離する。Phase 3-1実装後も、loaderの公開関数、API response、公開データモデル、SSR境界は変更せず、`gdpSupport.ts`とclient計算はshared pure moduleを直接利用し、clientからserver配下への依存を持たない。`server/lib/math/supportSeries.ts`は既存server import向けのvoid互換adapter/re-exportに限定する。`quarterlyPublicProjection.ts`もserverをimportしない。
