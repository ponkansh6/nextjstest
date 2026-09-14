# nextjstest/server/lib/data-loader/

## Responsibility

data/sourceのCSV・メタデータをドメイン別に読み込み、検証し、公開用のCPI/CTI/GDP、給与、人口データへ変換するServer専用loader群。

## Design

support-seriesのshared pure計算は欠損/NaN/±Infinity/対象外を有限0へ捏造せず入力行を非破壊に扱い、年次normalizerはpositive finite single value以外をfail-closedとする。既存server側import向けvoid legacy adapterのapplySupportSeriesScalingは旧0埋め/value||0挙動を保持する。

`cpiSource.ts`はCPI候補path、metadata解決/検証、同一baseのpair選択を担う。`cpiValidation.ts`はCPI index/contribution CSVのparseとheader/content validationを担う。`cpiLoader.ts`は2004年以降filter、weight分母、欠損伝播、派生系列、不要系列除去を行う純粋CPI変換を担う。`cpi.ts`はCPI/CTI/GDPの内部adapterと既存loader経路を担い、公開loader/status entry pointとしては公開されない。公開境界は唯一の`server/lib/dataLoader.ts` facadeであり、CTI入力境界とGDP support検証は`ctiValidation.ts`/`gdpSupport.ts`へ委譲する。`gdpSupport.ts`は四半期CSV（2025 Q1–Q4）から比較係数を計算し、shared pureな`src/lib/math/supportSeries.ts`を直接利用する。`server/lib/math/supportSeries.ts`は既存server側importのvoid互換adapterに限る。`gdpSupport.ts`はmetadata/CSV/official/e-Stat artifactとSHA-256整合性を検証する。`earnings.ts`は給与CSV、人口、CTI supportを結合し、移動平均と消費/給与viewを作る。`population.ts`は人口CSVを`dataIo`/`dataProcessor`経由で処理し、`cache.ts`はテストcacheのclearと既存cache helperを提供する。

## Flow

`server/lib/dataIo.ts`のpath/CSV parser → `cpiSource.ts`の候補解決・pair選択 → `cpiValidation.ts`のCPI CSV検証 → `cpiLoader.ts`の純粋変換 → `cpi.ts`の内部adapter、または`ctiValidation.ts`/`gdpSupport.ts`の入力検証・loader → `src/lib/math/supportSeries.ts`のshared pure domain計算 → `server/lib/dataLoader.ts`唯一の公開facade → `quarterlyProjection.ts` → `quarterlyAggregation.ts`/`quarterlyGdpTransform.ts` → `src/types/chart.ts`の共有`QuarterlyRow` → `src/lib/quarterlyPublicProjection.ts` → `src/app/page.tsx` → `CpiChart`。`quarterlyPublicProjection.ts`はserver配下をimportせず、`quarterlyAggregation.ts`は既存adapterと共有型re-exportを維持する。`server/lib/math/supportSeries.ts`は既存server側import向けのvoid互換adapter/re-exportであり、`gdpSupport.ts`の経路ではない。四半期係数はCSVの2025 Q1–Q4から計算し、`gdpSupport.ts`はmetadata/CSV/official/e-Stat artifactのSHA-256整合性を検証する。`isQuarterlyComparisonReady`はmetadata-only predicateで、raw rowsの検証・変換は行わない。失敗したsupportはstatusで表し、公開投影では内部GDP列を漏らさない。

## Integration

Phase 2-1〜2-5およびPhase 3-1はCPI loader内部の責務分割、公開facade整理、support-series domain移設であり、このloaderの公開戻り値、API、Server→Client境界は変更しない。`cpiLoader.ts`は純粋変換、`cpiValidation.ts`と`cpiSource.ts`はServer専用の入力境界、`cpi.ts`は内部adapterおよびCTI/GDP/quarterly経路として分離する。公開load/status関数は`server/lib/dataLoader.ts`からのみ提供する。`src/lib/yearMonth.ts`、`math/quarter.ts`、`src/lib/math/supportSeries.ts`、`server/lib/math/supportSeries.ts`、`src/types`を依存し、support-seriesの数式はshared pure moduleが担う。`gdpSupport.ts`とclient計算はshared pure moduleを直接利用し、server adapterは既存server側import向けのvoid互換性を担う。shared pureとlegacy adapterの二層契約、入力行の非破壊性、公開JSON/SSR契約を維持する。実ファイルとe-Stat snapshotを入力境界としてServer内で完結し、clientはserver配下を依存しない。`server/lib/view-models/quarterlyProjection.ts`は同facadeからloaderを利用する。
