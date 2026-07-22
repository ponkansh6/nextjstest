## 安全に関するルール

- **`git --no-verify` / `git commit -n` の使用禁止**: pre-commit/pre-push hooks を強制実行。`~/.local/bin/git` によりブロック。
- **`HUSKY=0` の使用禁止**: husky hook runner 無効化。`~/.local/bin/git` によりブロック。
- **`git -c core.hooksPath=...` の使用禁止**: `~/.local/bin/git` によりブロック。
- **`GIT_CONFIG_PARAMETERS` / `GIT_CONFIG_KEY_N` 経由の hooksPath 注入禁止**: `~/.local/bin/git` によりブロック。

## リソース制約

- **subagent 並列禁止**: 直列実行のみ。1つ完了→次。
- **sudo 不可**: `lxqt-sudo` を使用。チェーン時は一時スクリプトにまとめる。

## 委譲ルール

- Orchestrator は自らコマンド実行しない。以下に委譲:
  - 探索/検索 → `@explorer`
  - 外部調査 → `@librarian`
  - 設計判断/デバッグ → `@oracle`
  - UI実装 → `@designer`
  - 実装作業 → `@fixer`
- `@fixer` 委譲時は既存コンテキストを含め再読込コストを削減する。

## 仕様書管理

- **仕様書パス**: `openspec/specs/nextjstest/spec.md`
- **更新タイミング**: 実装変更と並行して仕様書を更新。コミット・プッシュは変更後に行う。
- **更新ルール**:
  - コンポーネントの追加/削除・データモデル変更・API変更・アーキテクチャ変更は仕様書に反映する。
  - Data Sources / Data Flow / Component Tree / Requirements の各セクションを実装と同期させる。
  - `openspec/config.yaml` の rules.spec に従い、各要件に WHEN/THEN シナリオを記載する。
- **委譲**: 仕様書の差分探索 → `@explorer`、仕様書の書き換え → `@fixer` に委譲する。

## 実行モード

- 確認を求めず最後まで自律実行。軽微な修正は連続実行。完了または重大エラーのみ報告。
