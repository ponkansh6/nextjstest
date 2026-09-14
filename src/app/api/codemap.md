# nextjstest/src/app/api/

## Responsibility

e-Statデータ参照のHTTP境界を提供する。`/api/estat/stats-list`、`/api/estat/meta`、`/api/estat/data`のGET routeを実装する。

## Design

`stats-list`、`meta`、`data`の各`route.ts`は独立したHTTP境界で、`@server/lib/estat`のtyped operation（`getStatsList`、`getMetaInfo`、`getStatsData`）へ委譲する。`_shared.ts`がRequest queryを`EStatQuery`へ変換し、必須値・正整数を検証し、`EStatError`等をHTTP error responseへ写像する。`getStatsData`固有のVALUE配列正規化は`server/lib/estat.ts`に残る。

## Flow

HTTP GET → `queryFromRequest` → `server/lib/estat` → JSON `NextResponse`、または共通`errorResponse`。ダッシュボード初期データはこのrouteをClient fetchせず、`page.tsx`のServer Component経路を使う。

## Integration

Phase 1のClient hook/state分割とは独立したServer境界で、API route、query形式、loader/APIレスポンスを変更しない。e-Statの外部取得・認証/endpoint責務は`server/lib/estat`側に残し、このディレクトリは入力検証とHTTP表現だけを担う。既存の共通処理で足りるため、route runnerや追加API共通関数は設けない。
