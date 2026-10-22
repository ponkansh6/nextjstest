# nextjstest/tests/factories/

## Responsibility

テスト用の型付き経済データを最小の既定値から生成し、個別テストが必要な列だけ上書きできるようにする。

## Design

`cpiDataFactory.ts`は`CpiData`単体/配列を生成する。`src/types`の型と`Partial<CpiData>` overrideでfixtureの意図を局所化し、CTI・earnings・population用factoryは維持していない。

## Flow

`cpiDataFactory.ts`の既定CPIレコード + override → loader/計算/componentテストの入力。`createCpiDataList`は複数期間の入力を作り、年/月、系列キー、欠損や境界値のテストへ渡す。

## Integration

公開`CpiData`や表示用計算の入力契約を維持するテスト基盤であり、内部hook型や実装詳細を新たな公開モデルとして扱わない。
