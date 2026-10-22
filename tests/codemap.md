# nextjstest/tests/

## Responsibility

Vitest、Testing Library、Playwright Browser Modeで、データ品質・計算契約・UI・本番payloadを検証する回帰スイート。参照される`fixtures/`のCSV/JSONと`test-data.ts`を固定入力として、サーバーloaderからブラウザ表示までの公開契約を監査する。

## Design

- `unit/`はlib/hooks/loaderの純粋計算と境界、`components/`はチャートUI、`computation-contract/`は計算結果とclient出力、`data-quality/`は実データの期間・系列・出典、`data-mapping/`はキー対応を検証する。
- `server/`はsupport系列のjoin/filtering、`production/`は本番payload、`browser-mode/`は実ブラウザのアクセシビリティ・モバイル・URL・チャート回帰、`perf-checkpoint.test.ts`は性能基準を担う。実ブラウザ検証はVitest Browser Mode経由で実行する。
- `factories/`の`cpiDataFactory.ts`と`utils/`はテスト入力・環境・mockを共有する。テストは公開型、既存loader、`src/app`の表示境界を利用する。

## Flow

fixture/factory → loader・計算・component → 期待値/DOM/payloadを検証。Browser Modeのroute commandとcomponent suitesがアプリのServer Component経路からブラウザ結果まで確認する。

## Integration

Phase 1の回帰契約は`unit/useCpiChartData.test.ts`（表示用派生の境界）と`unit/useUrlState.test.ts`（`from`/`to`/`hidden`のURL同期と旧`adv`削除）を中心に、既存の7チャート、公開props、データモデル、APIを検証する。Plan40四半期CTIとPlan37月次CTIの契約をdata-quality/server/unitで検証する。旧Plan38/Plan21 GDP専用契約のテストは退役済み。
