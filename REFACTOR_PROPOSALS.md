# リファクタリング提案（概要）

対象: /src、/tests、/scripts、およびリポジトリ構成

優先度（推奨順）

- 高: パフォーマンス改善（chartLogic, chartUtils）、サーバ／クライアント責務の分離（fs/同期I/Oの切り離し）
- 中: リポジトリのクリーンアップ（.venv, build, node_modules, coverage等の除外と整理）
- 中: 型と依存性の整理（CpiData型の明確化、useMemoの依存配列見直し）
- 低: テストの整理・CI導入（テスト分離、カバレッジ閾値）

短期アクション（数時間〜数日）

1. src/lib/chartLogic.ts の内部で複数回走る find を Map に置き換え O(1) 参照へ。
2. src/lib/cpiData.ts を "データ読み込み（fs依存）" と "変換ロジック" に分割。読み込みはサーバ専用に移す。
3. useCpiChartData の useMemo 依存を安定化（props オブジェクトではなく個別フィールドを依存にする）。
4. 大量ファイル/ビルド成果物を .gitignore に追加してリポジトリを軽くする。

中期アクション（数日〜1週間）

1. サーバ側でデータ前処理を行い JSON を生成、クライアントはその JSON を取得して描画する流れにする。
2. chartUtils のユニットテストを整備し、境界条件（年月のフォーマット差、欠損）を網羅する。
3. TypeScript の型定義を整理し、CpiData を src/lib/types.ts に移動する。

長期アクション（1週間〜）

1. CI に lint/test/build を追加し、PR 時に自動検証する。
2. 大きなデータファイル（public/cpi_source 等）は外部ストレージへ移行（S3 等）し、リポジトリを軽量化する。

参考ファイル

- REFACTOR_CODE.md（具体的なコード改善案）
- REFACTOR_ARCHITECTURE.md（責務分離の提案）
- REFACTOR_CLEANUP.md（.gitignore と不要ファイル整理案）
- REFACTOR_TESTS.md（テスト改善案）

---

作業を希望する順や優先度を教えてください（このまま具体的なPRやコード修正も作成可能です）。
