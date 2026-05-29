# テスト改善案

現状:

- tests ディレクトリにユニット/統合が混在している箇所がある
- データ依存のテストが生データに依存しているケースあり

提案:

1. tests/unit, tests/integration, tests/fixtures に整理
2. データ読み込みはモック化（fs 依存はモック or サンプル JSON を使用）
3. vitest config にカバレッジ閾値を追加し、CI で fail するようにする
4. GitHub Actions 等で `lint` `type-check` `test` を PR チェックに追加

短期: fixtures を整理してユニットテストを安定化
中期: CI パイプラインを追加して自動化
