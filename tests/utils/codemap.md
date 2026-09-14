# nextjstest/tests/utils/

## Responsibility

Vitest/Testing Libraryの実行環境、ブラウザ・Recharts・filesystem・APIのmock、Flight payloadの検査補助を共通化する。

## Design

`setup.ts`、`logic-setup.tsx`、`logic-setup-minimal.ts`、`happy-dom-setup.ts`が環境を初期化し、`ui-mocks.ts`と`recharts-mock.tsx`がUI依存を制御する。`mock-fs.ts`はCSV有無を、`api-setup.ts`はAPI境界を模擬する。`flight-payload.ts`はRSC HTML中の四半期propsを抽出する。

## Flow

テスト → setup/mock適用 → loader・hook・component実行 → DOM、CSV、Flight payload、例外を検証。`cti-2020-rollback-fixture.ts`は既存`server/lib/dataLoader`の2020 rollback入力を提供し、console抑制系はノイズを隔離する。

## Integration

Phase 1の`useUrlState`、`useCpiChartDisplayData`等をSSR/Client境界を越えず検証し、`window`/`localStorage`をrender/module scopeで読まない契約を支える。mockは実装の代替APIを追加せず、既存loader・公開props・Flight payloadを対象にする。
