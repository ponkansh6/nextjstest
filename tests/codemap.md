# nextjstest/tests/

## Responsibility

Vitest、Testing Library、Playwrightで、データ品質・計算契約・UI・E2E・本番payloadを検証する回帰スイート。`fixtures/`のCSV/JSONと`test-data.ts`を固定入力として、サーバーloaderからブラウザ表示までの公開契約を監査する。

## Design

- `unit/`はlib/hooks/loaderの純粋計算と境界、`components/`はチャートUI、`computation-contract/`は計算結果とclient出力、`data-quality/`は実データの期間・系列・出典、`data-mapping/`はキー対応を検証する。
- `server/`はsupport系列のjoin/filtering、`production/`は本番payload、`e2e/`は実ブラウザのアクセシビリティ・モバイル・URL・チャート回帰、`perf-checkpoint.test.ts`は性能基準を担う。
- `factories/`、`constants/`、`utils/`はテスト入力・環境・mockを共有する。テストは公開型、既存loader、`src/app`の表示境界を利用する。

## Flow

fixture/factory → loader・計算・component → 期待値/DOM/payloadを検証。E2Eは`e2e/global-setup.ts`と`fixtures.ts`で環境を整え、アプリのServer Component経路からブラウザ結果まで確認する。

## Integration

Phase 1の回帰契約は`unit/useCpiChartData.test.ts`（表示用派生の境界）と`unit/useUrlState.test.ts`（`from`/`to`/`hidden`/`adv`のURL同期）を中心に、既存の7チャート、公開props、データモデル、API、storageキーを不変として検証する。四半期GDP、消費支出、loader検証はdata-quality/server/unitにも分散して保持する。
