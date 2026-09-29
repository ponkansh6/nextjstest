## 安全に関するルール

- **`git --no-verify` / `git commit -n` の使用禁止**: pre-commit/pre-push hooks を強制実行。`~/.local/bin/git` によりブロック。
- **`HUSKY=0` の使用禁止**: husky hook runner 無効化。`~/.local/bin/git` によりブロック。
- **`git -c core.hooksPath=...` の使用禁止**: `~/.local/bin/git` によりブロック。
- **`GIT_CONFIG_PARAMETERS` / `GIT_CONFIG_KEY_N` 経由の hooksPath 注入禁止**: `~/.local/bin/git` によりブロック。

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
- 実装チェックポイントでは、環境の自動検出に依存せず `skills/jev-review/SKILL.md` を明示的に読み、JEV で妥当性を判定する。プラン策定・プランレビューはこのスキルの対象外とする。レビュー結果は作業中に確認して判断へ反映し、監査ドキュメントとしての保存は必須としない。必要または有用な場合に限り `--output` 等でローカル保存する。新規v3初回レビューで有効な応答が `valid_as_defined` 以外（6つの理由項目または `indeterminate`）なら、Codexが選択肢を選んだりユーザーに選択を求めたりせず、初回所見・影響要件・証拠・修正案・必要証拠から独自の相互排他的な即時次アクションを2件以上作り、JEVに1回だけ更問して選択・根拠・次アクション・未確定点を返させる。選択肢は「現行要件の下で実装だけを変更」「現行実装の下で要件だけを改訂」「どちらも変更せず証拠だけを収集」のように変更対象を一つに限定し、各選択肢に同一案件のfinding、affected location/requirement、evidence（未提示ならその旨）を明記し、他の次アクションを同時に含めない。更問は choice ID のほか、case-specific finding、affected location/requirement、observed evidence または exact `neededEvidence`、具体的な `nextAction`/`proposedFix`、および `remainingUncertainty`（なしの場合は明示的に `none`）を返す必要がある。有効な choice でも診断詳細が不足した場合は `resolution: "unresolved"`、`diagnosisStatus: "incomplete"`、`unresolvedReasons` を作業中のレビュー結果として明示する。必須詳細が揃う場合だけ更問を完了扱いにする。初回の `decisionSummary` と選択肢分布を保持し、更問結果の `effectiveVerdict` は必ず `requires_revalidation` として、初回不合格を合格にしない。更問が失敗・無効・選択肢外なら未解決として扱い、更問を連鎖させない。初回合格は更問しない。初回API/応答が失敗・無効・未対応なら更問せず、初回エラー動作を維持する。追加証拠または修正後に初回JEV再判定を行う。手動 `--clarify ... --choice` と非標準 `--follow-up` は互換ユーティリティとして保持する。TypeSafe API は明示指定した `TYPESAFE_API_KEY` を優先し、未指定時は現在ディレクトリまたはスクリプト位置の祖先にある `.env.local` の `TYPESAFE_API_KEY` をデフォルト利用する（`TYPESAFE_ENV_FILE` で明示指定可、キーがなければ送信を fail-closed）。JEV へ送るレビュー文脈・実装差分・検証結果など認証情報以外のデータ送信はユーザーが承認済みとする。認証情報は送信せず、承認対象にも含めない。`TYPESAFE_MODEL`、`TYPESAFE_BASE_URL` は任意指定とする。API 失敗やHTTP成功だけを妥当と扱わず、JEV判定は既存テスト・型チェック・lintの代替にしない。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
