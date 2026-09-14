# nextjstest/server/

## Responsibility

サーバー専用のデータ取得、検証、キャッシュ、変換、view-model化、e-Stat proxyを提供する。

## Design

`lib/data-loader`はCPI/CTI/GDP/給与等のドメイン別loader、`lib/dataLoader.ts`は既存の公開loaderから`server/lib/data-loader/*`の内部loaderへ委譲する薄い互換adapter、`lib/view-models`はclientへ渡す列選択・丸め・四半期公開投影を担当する。サーバーで完結する検証・ファイル選択・計算をclientへ漏らさない。

support-seriesのdomain計算はshared pure moduleを利用する。shared pure scaleは欠損/NaN/±Infinity/対象外を有限0へ捏造せず入力を非破壊に扱う一方、serverのvoid applySupportSeriesScaling legacy adapterは旧0埋め/value||0挙動を保持する。共有QuarterlyRowはsrc/types/chart.tsに定義し、client-safeなquarterlyPublicProjectionはserver配下をimportしない。

## Flow

source CSV/e-Stat → `dataIo`/domain loader → validation・cache → `dataLoader.ts` facade → view-model → `src/app/page.tsx` RSC → CpiChart props。e-Statのstats-list/meta/data routeは、このdashboard loader/SSR/cache/data-model flowから分離された`lib/estat.ts` proxyを呼ぶ。

## Integration

公開loader/APIの戻り値と型は既存契約のまま。clientの初期データ取得をAPI routeやClient fetchへ置き換えず、pageからview-modelを直接渡す。
