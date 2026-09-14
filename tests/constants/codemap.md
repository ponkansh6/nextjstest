# nextjstest/tests/constants/

## Responsibility

複数テストで共有する日付境界とデータ系列キーを一元化し、テストの期待値を本番定義と混同せず読みやすくする。

## Design

`test-dates.ts`は固定期間・基準日、`test-keys.ts`は給与系列と消費系列のキー配列をexportする。値はテスト入力と期待値の組み立てに限定して使い、実装側の`src/lib/chartConstants.ts`を変更・置換しない。

## Flow

共有定数 → unit/component/data-quality/E2Eテストの入力・filter・assertion。日付境界や名目/実質系列の列挙を各テストへ複製しない。

## Integration

Phase 1の表示用hook・URL状態分割後も、期間、hidden系列、advanced系列の回帰テストが同じ意味のキーと境界を使えるよう支える。公開URLキーやデータモデルの定義元ではない。
