# Request examples

These examples use the same JSON body accepted by `scripts/jev-request.mjs` and the TypeSafe JEV `systemone` endpoint. Replace the context with the actual plan, diff, checks, and acceptance criteria.

このリポジトリでは `skills/jev-review/` を明示的に読み込む。別の Codex 環境で `.agents/skills/jev-review/` が必要な場合は、リポジトリの同ディレクトリをその場所へコピーしてからスキルを読み込む。

## Follow-up after a non-positive judgment

初回 `rawResponse` の choice が `not_valid`、`valid_but_limited`、`indeterminate`、または未知形式の場合は、初回結果を合格扱いせず、次のコマンドで理由の選択肢を提示する。`--reason` を指定しない場合は、クライアントが選択肢を表示して停止する。

```sh
node skills/jev-review/scripts/jev-request.mjs --follow-up review.json \
  --reason evidence_insufficient --reason acceptance_gap --output follow-up.json
```

既定の理由は `evidence_insufficient`、`acceptance_gap`、`implementation_mismatch`、`constraint_conflict`、`other`。`--reasons-file choices.json` で `{ "reason_id": "description" }` の JSON を渡せば差し替えられる。follow-up は初回結果を `state.priorReview` に含め、別の `rawResponse` と出力ファイルに保存する。認証情報以外のレビュー文脈の送信承認は初回と同じで、キーは送信しない。

この依頼で Codex ユーザーは、レビュー文脈・計画・差分要約・受入条件・検証結果など認証情報以外のデータを JEV に送信することを承認している。追加の承認待ちは不要である。承認対象はこのレビューコンテキストだけであり、`.env.local` の `TYPESAFE_API_KEY` などの認証情報は送信せず、承認文面にも含めない。

クライアントは明示的に export された `TYPESAFE_API_KEY` を優先し、未指定時は現在ディレクトリとスクリプト位置の祖先を探索して見つけた `.env.local` の `TYPESAFE_API_KEY` をデフォルトで読む。`TYPESAFE_ENV_FILE` で env ファイルを明示指定できる。どちらにもキーがなければ live request は失敗する。入力形状は送信前に検証される。

## Implementation-specific clarification

generic follow-up の回答が `needs_evidence`、`indeterminate`、または未知の文字列形式で未解決の場合は、実装固有の選択肢を使って第三段の質問を作成できる。初回結果、`clarified`、`needs_fix` は `--clarify` では受け付けない。選択肢ファイルは次の形式で、2件以上・一意な文字列 ID・空でない文字列の `question`、`label`、`description` を要求する。

```json
{
  "version": 1,
  "question": "Which implementation concern should be checked next?",
  "selectionMode": "single",
  "choices": [
    {
      "id": "missing_test",
      "label": "Missing test",
      "description": "Add the smallest test that demonstrates the behavior."
    },
    {
      "id": "runtime_path",
      "label": "Runtime path",
      "description": "Verify the behavior at the affected runtime boundary."
    }
  ]
}
```

選択肢を提示して停止するには `--choice` を省略する。選択後は `single` なら1件、`multiple` なら1件以上の `--choice ID` を渡す。

```sh
node skills/jev-review/scripts/jev-request.mjs --clarify follow-up.json \
  --choices-file implementation-choices.json --choice missing_test --output clarification.json
```

第三段は generic follow-up を `state.priorReview` に redacted で保持し、実装固有の質問・全選択肢・選択 ID と `effectiveVerdict: "requires_revalidation"` を別出力に保存する。第三段の回答だけで合格扱いにせず、追加証拠や修正後は通常の初回 JEV 再判定を行う。

## Plan review

```json
{
  "model": "jev-latest",
  "state": {
    "evaluationScope": "plan_validity",
    "background": "Paste the concise problem statement and proposed plan.",
    "acceptanceCriteria": ["Criterion one", "Criterion two"],
    "knownConstraints": ["No unrelated files"],
    "outputRequirement": "Return a choice, probabilities for every criterion, confidence, evidence, limitations, and the next validation step."
  },
  "questions": {
    "overall": {
      "type": "choice",
      "instructions": "Is this plan sufficient and internally consistent for the stated acceptance criteria?",
      "criteria": {
        "valid_as_defined": "The plan is sufficient as written.",
        "valid_but_limited": "The plan is usable with explicit limitations or small changes.",
        "not_valid": "A material flaw prevents the plan from meeting the criteria.",
        "indeterminate": "The supplied context is insufficient to judge."
      }
    }
  }
}
```

## Implementation checkpoint review

```json
{
  "state": {
    "evaluationScope": "implementation_checkpoint_validity",
    "background": "Describe the intended behavior and include the relevant diff summary.",
    "acceptanceCriteria": [
      "Behavior matches the plan",
      "Errors are surfaced",
      "No secrets are emitted"
    ],
    "verification": ["Request validation completes before submission"],
    "outputRequirement": "Separate transport success from substantive validity; return evidence, limitations, and any required fix."
  },
  "questions": {
    "implementation": {
      "type": "choice",
      "instructions": "Does the implementation satisfy the stated behavior and acceptance criteria based on the supplied diff and verification?",
      "criteria": {
        "valid_as_defined": "Evidence supports acceptance.",
        "valid_but_limited": "Acceptable with a documented limitation or follow-up.",
        "not_valid": "A required behavior is missing or incorrect.",
        "indeterminate": "Evidence is insufficient."
      }
    }
  }
}
```
