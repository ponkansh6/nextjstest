# nextjstest/server/lib/data-loader/

## Responsibility

data/sourceのCSV・メタデータをドメイン別に読み込み、検証し、公開用のCPI/CTI、給与、人口データへ変換するServer専用loader群。

## Design

`cpiSource.ts`はCPI候補path、metadata解決/検証、pair選択を担う。`cpiValidation.ts`はCPI index/contribution CSVのparseとheader/content validationを担う。`cpiLoader.ts`はCPIの純粋変換を担う。`ctiValidation.ts`は現行CTI入力境界を検証し、Plan40の10費目四半期公開系列とPlan37の月次系列を支える。Plan38専用四半期経路とGDP support loader/status/joinは退役済みで、現行loaderではない。`earnings.ts`は給与・人口入力を読み込み、給与と比較viewに必要な系列を作る。`population.ts`は人口CSVを処理し、`cache.ts`は既存cache helperを提供する。

## Flow

CPI: `dataIo.ts` → `cpiSource.ts` → `cpiValidation.ts` → `cpiLoader.ts` → `dataLoader.ts`公開facade。
CTI: 現行2025入力検証 → CPI/CTI内部adapterと四半期projection → Plan40の四半期公開投影、またはPlan37月次consumer。
給与・人口: 入力loader → dashboard view-model → `page.tsx`。
`quarterlyPublicProjection.ts`はserver配下をimportせず、Plan40の公開キーと値を明示的に投影する。GDP入力やPlan38 builderは現行flowに含めない。

## Integration

Server内の入力検証と計算をclientへ公開しない。公開status/load境界は`server/lib/dataLoader.ts`の現行facadeを通す。shared pure moduleとclient-safe projectionはserver loaderへ依存しない。
