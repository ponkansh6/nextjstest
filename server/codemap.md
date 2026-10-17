# nextjstest/server/

## Responsibility

サーバー専用のデータ取得、検証、キャッシュ、変換、view-model化、e-Stat proxyを提供する。

## Design

`lib/data-loader`はCPI/CTI、給与、人口等の現行domain loaderを担い、`lib/dataLoader.ts`は公開するCPI/CTI status、CPI、給与loaderのfacadeを担う。`lib/view-models`はclientへ渡す列選択・丸め・四半期公開投影を担当する。Plan40の10費目四半期CTI出力とPlan37月次CTI入力を保持し、退役したPlan38四半期APIとGDP loader/joinは現行経路に含めない。サーバーで完結する検証・ファイル選択・計算をclientへ漏らさない。

shared pure support-series計算は入力値を非破壊に扱う。client-safeな`quarterlyPublicProjection`はPlan40の公開キーを明示的に投影し、server配下をimportしない。

## Flow

CPI/CTI/給与/人口 source → domain loader/validation → `dataLoader.ts` facade または四半期view-model → `src/app/page.tsx` RSC → CpiChart props。Plan40の四半期CTI経路は`quarterlyProjection.ts`を通る。e-Statのstats-list/meta/data routeは、このdashboard loader/SSR/cache/data-model flowから分離された`lib/estat.ts` proxyを呼ぶ。

## Integration

公開loader/APIの現行戻り値と型を維持する。clientの初期データ取得をAPI routeやClient fetchへ置き換えず、pageからview-modelを直接渡す。
