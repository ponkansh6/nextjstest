# nextjstest/tests/factories/

## Responsibility

テスト用の型付き経済データを最小の既定値から生成し、個別テストが必要な列だけ上書きできるようにする。

## Design

`cpiDataFactory.ts`は`CpiData`単体/配列、`ctiDataFactory.ts`はCTI、`earningsDataFactory.ts`は給与、`populationDataFactory.ts`は人口データを生成する。各factoryは`src/types`の型を参照し、`Partial<...>`のoverrideでfixtureの意図を局所化する。

## Flow

factoryの既定レコード + override → loader/計算/componentテストの入力。`createCpiDataList`は複数期間の入力を作り、年/月、系列キー、欠損や境界値のテストへ渡す。

## Integration

Phase 1のhook/lib分割に対しても公開`CpiData`や表示用計算の入力契約を維持するテスト基盤であり、分割後の内部hook型や実装詳細を新たな公開モデルとして扱わない。
