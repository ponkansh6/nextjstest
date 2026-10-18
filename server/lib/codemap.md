# nextjstest/server/lib/

## Responsibility

サーバー側のデータ入出力、loader、検証・計算、cache、view-model、e-Stat clientを提供する主要境界。

## Design

shared pureのscaleSupportSeriesは欠損/NaN/±Infinity/対象外を有限0へ捏造せず入力行を非破壊に扱う。serverのvoid applySupportSeriesScalingは旧公開挙動の0埋め/value||0を保持し、年次normalizerはpositive finite single value以外をfail-closedとする。

- `dataLoader.ts`: CPI/CTI、給与、人口およびstatusの唯一の公開facade。GDP loader/status APIは退役済み。公開signature・return shape・error behavior・SSR境界を維持し、内部loaderへ委譲する。
- `data-loader/cpi.ts`: CPI/CTIの内部adapterと既存loader経路を提供する。公開entry pointではなく、CPIのsource/validation/transformとCTI入力境界を扱う。GDP support検証・loaderは退役済み。
- `math/supportSeries.ts`: `src/lib/math/supportSeries.ts`のshared pure domain計算を再exportするserver adapter。GDP専用の正規化とsupport loaderは退役済みで、共通support-series計算はserver/client双方から直接利用できる。
- `ctiDomainContract.ts`: composition-adjusted計算descriptor、annual/quarterly schema reader、旧input contractのcanonical解決を担当する。schemaのcanonical/legacy literalはshared `cti-contract-schemas.mjs`に集約し、readerは許可familyだけを解決してmanifest・metadata間のraw SHA/revision整合性検証を維持する。
- `ctiAdjustedConnectionEstimateV2.ts`: composition-adjusted-v2計算とannual-anchor validationを提供する。`inputContract`と独立した`requireAnnualAnchorValidation`を保持し、旧option/type名は移行用aliasとして公開する。
- `data-loader/ctiValidation.ts`: 現行CTI source artifactの検証を担当する。四半期nominal schemaは許可した旧値/新値だけを受け付ける。旧GDP support metadata/hash比較と`isQuarterlyComparisonReady`は退役済み。
- `data-loader/earnings.ts`、`population.ts`: ドメイン別CSV loader。`cache.ts`は再利用可能なcache境界。
- `server/lib/view-models/quarterlyProjection.ts`: composition-adjusted CTIの四半期projectionを生成する。共有`QuarterlyRow`は`src/types/chart.ts`にあり、client-safeな`src/lib/quarterlyPublicProjection.ts`が公開JSONのキー・丸め・欠損・SSR境界を扱う。旧専用四半期projectionとGDP join/transform APIは退役済み。
- `server/lib/view-models/quarterlyProjection.ts`: 列選択・2桁丸めを含む四半期CTI公開投影。
- `estat.ts`: e-Stat APIへの共通server client。`fetchEStat`がtyped operationの取得・検証・エラー分類を担い、`getStatsData`だけがVALUE配列正規化を行う。`dataIo.ts`はsource path解決を担当する。

## Flow

CSV/e-Stat → dataIo/domain loader → schema-family、manifest、metadata、hash/revision検証 → `dataLoader.ts`唯一の公開facade → server計算/view-model → `page.tsx` → `CpiChart`。年次入力contractとannual-anchor validationは別条件で解決する。schema aliasのcanonicalization後もartifact SHA、revision、manifest整合性を照合する。support-seriesのpure計算は`src/lib/math/supportSeries.ts`をdomainとして共有し、client/server計算から利用する。GDP support loaderやGDP依存の互換経路は現行flowに含まれない。CPIの表示は内部`data-loader/cpi.ts`の選択済みデータをfacade経由でview-model化し、clientで再fetchしない。`quarterlyProjection.ts`はfacadeからCTI loaderを利用して四半期公開projectionを生成する。

## Integration

API routeは`estat.ts`の独立したHTTP境界として利用し、dashboardの`dataLoader.ts` facade/SSR/cache/data-model flowとは分離する。現行のloader公開関数、API response、公開データモデル、SSR境界を維持する。GDP loader/support APIと専用旧四半期projectionは退役済み。`server/lib/math/supportSeries.ts`はshared pure support-series計算を公開するserver adapterであり、clientからserver配下への依存はない。`quarterlyPublicProjection.ts`もserverをimportしない。
