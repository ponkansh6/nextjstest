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
- 実装チェックポイントでは、環境の自動検出に依存せず `skills/jev-review/SKILL.md` を明示的に読み、JEV で妥当性を判定する。プラン策定・プランレビューはこのスキルの対象外とする。レビュー結果は作業中に確認して判断へ反映し、監査ドキュメントとしての保存は必須としない。必要または有用な場合に限り `--output` 等でローカル保存する。新規標準レビューでは、実コード・要件・テスト・検証証拠に基づく相互排他的なcase-specific即時アクション候補を2件以上、初回リクエスト前に作成し、JSON `{ "choices": [...] }` を `--clarification-candidates PATH` で同時に渡す。各候補は `id`、`label`、`finding`、`affected`、`evidence` または正確な `neededEvidence` の一方、`nextAction` または `proposedFix` の一方、`remainingUncertainty` を備える。候補の不足は送信前に拒否する。JEVには初回・更問とも選択、confidence、probabilitiesだけを求め、理由生成を求めない。初回応答が有効で `valid_as_defined` 以外なら、一度だけ更問し、JEVの選択IDをローカル候補へ対応づける。Codexは候補を選ばず、ユーザーにも選択を求めない。選択候補は `resolution: "selected"`、`diagnosisSource: "provided_candidate"`、`diagnosisStatus: "complete"` として扱い、診断内容はCodexが提示した候補に由来する。初回の `decisionSummary` と確率分布を保持し、更問の `effectiveVerdict` は必ず `requires_revalidation` とする。更問が失敗・無効・選択肢外なら未解決とし、手動更問も含め連鎖させない。初回合格または初回API/応答失敗・無効・未対応時は自動更問しない。追加証拠または修正後に通常の初回JEV再判定を行う。候補fileなしの旧CLI挙動、手動 `--clarify ... --choice`、非標準 `--follow-up` は互換ユーティリティとして保持する。TypeSafe API は明示指定した `TYPESAFE_API_KEY` を優先し、未指定時は現在ディレクトリまたはスクリプト位置の祖先にある `.env.local` の `TYPESAFE_API_KEY` をデフォルト利用する（`TYPESAFE_ENV_FILE` で明示指定可、キーがなければ送信を fail-closed）。JEV へ送るレビュー文脈・実装差分・検証結果など認証情報以外のデータ送信はユーザーが承認済みとする。認証情報は送信せず、承認対象にも含めない。`TYPESAFE_MODEL`、`TYPESAFE_BASE_URL` は任意指定とする。API 失敗やHTTP成功だけを妥当と扱わず、JEV判定は既存テスト・型チェック・lintの代替にしない。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
