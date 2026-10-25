## 安全に関するルール

- **`git --no-verify` / `git commit -n` の使用禁止**: pre-commit/pre-push hooks を強制実行。`~/.local/bin/git` によりブロック。
- **`HUSKY=0` の使用禁止**: husky hook runner 無効化。`~/.local/bin/git` によりブロック。
- **`git -c core.hooksPath=...` の使用禁止**: `~/.local/bin/git` によりブロック。
- **`GIT_CONFIG_PARAMETERS` / `GIT_CONFIG_KEY_N` 経由の hooksPath 注入禁止**: `~/.local/bin/git` によりブロック。
- **Playwright 用 loopback listen**: このリポジトリ（`/home/shunki/working/nextjstest`）の作業全般で、Playwright やローカル検証用サーバーが `127.0.0.1:3001` に TCP listen することを許可済み（pre-push に限定しない）。必要な場合は対象コマンドだけを最初から `sandbox_permissions=require_escalated` で実行する。この許可は `0.0.0.0` listen、任意の外部通信、永続的な sandbox / 承認設定の変更を含まない。
- **pre-push 検証と通常 push の昇格実行**: ユーザーは、このリポジトリ（`/home/shunki/working/nextjstest`）の pre-push 検証に必要な次の操作と、依頼に含まれる通常の `git push` に必要な昇格権限を明示許可済み。
  - pre-push のための `.git` metadata 更新（`git worktree add` / `remove` / `prune` など）。
  - `pnpm audit` と、必要な場合の read-only Turso schema drift 確認に必要な外向き通信。
    pre-push 検証で上記操作を行う場合、最初の実行から対象コマンドだけを `sandbox_permissions=require_escalated` で実行する。push が依頼に含まれる場合は、通常の `git push` 自体も最初から `sandbox_permissions=require_escalated` で実行し、通常権限での失敗を試さない。`--force` / `--force-with-lease` / ref deletion など履歴を破壊する push はこの許可に含まず、個別の明示指示が必要。昇格は上記操作に限り、`0.0.0.0` listen、任意の外部通信、不要な権限拡大を許可しない。また、永続的な sandbox / 承認設定の変更を意味しない。

## リソース制約

- **subagent 並行実行(最大3つ)**: 同時に実行するエージェントは最大3つまで。
- **sudo 不可**: `lxqt-sudo` を使用。チェーン時は一時スクリプトにまとめる。

## 委譲ルール

- Orchestrator は自らコマンド実行しない。以下に委譲:
  - 探索/検索 → `@explorer`
  - 外部調査 → `@librarian`
  - 設計判断/デバッグ → `@oracle`
  - UI実装 → `@designer`
  - 実装作業 → `@fixer`
- **依頼単位は小さく保つ**: 1 回の委譲は「1 つの明確な成果物」を単位とし、単位を大きくし過ぎないこと。関心事が混在する場合は分割して別 agent に委譲する。
- **コンテキスト過剰蓄積を防ぐため積極的に新設する**: 既存 agent の context が膨張し続ける場合は同じ役割を抱え込まず、目的特化した新しいサブエージェントを新設して責務を分離する。長大な履歴の再利用より、単位を絞った新規セッションへの再委譲を優先する。
- `@fixer` 委譲時は既存コンテキストを含め再読込コストを削減する。
- **テスト実装とテスト実行は分離する**: テストの実装は `@fixer` に委譲し、テストの実行・検証は Orchestrator 自身が行う。サブエージェントが自分の実装したテストを自ら実行して検証結果を報告する運用は禁止し、Orchestrator が検証ゲート（lint, type-check, test, coverage, spec-refs, smoke-test）を走らせて結果を確認する。
- **実装内容の一致確認**: サブエージェントの実装完了時は、Orchestrator が実装内容（変更差分・成果物）と委譲時の指示内容が一致していることを確認する。乖離があった場合は、指摘して修正を再委譲してから検証ゲートを通過させる。
- **`@oracle` は見解の提示のみを行う**: `@oracle` は設計判断・アーキテクチャ評価・レビュー・デバッグ方針などの「見解」を返すことに限定し、自ら手を動かした調査（コマンド実行、コードの実行・修正、ファイル漁り）を行ってはならない。根拠となるコードや実行結果が必要な場合は、Orchestrator が事前に収集して委譲時に渡すか、データ取得そのものは `@explorer` / `@librarian` に委譲する。

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
- プラン策定・プランレビューは対象外とする。レビュー結果は作業中に判断へ反映し、監査保存は任意とする。JEV判定はテスト・型チェック・lintの代替にしない。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
