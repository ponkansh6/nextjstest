# pre-push detached HEAD チェックの健全性修正プラン

## 目的

プッシュ時に detached HEAD の残りコミット（どのブランチからも到達できない未プッシュコミット）を検知してブロックする仕組み（fix-14、コミット `9a877cc`）を導入したが、その実装に **pre-push フック全体を無効化してしまう副作用バグ** が判明した。本プランはそのバグを修正し、検証を強化することを目的とする。

## 背景・経緯

### 1. 発生したトラブル（2026-08-15）

- モバイル横並び修正（fix-10 `c5c8921` / fix-11 `f1fcffc` / fix-12 `42e032c`）のコミットが **detached HEAD 上に積まれたまま** となり、`git push origin main` が「Everything up-to-date」と表示されて素通り。**origin/main には反映されていなかった**。
- 原因: ローカルの main ブランチが古い `bab74cc` のまま、detached HEAD にのみ新コミットが存在していた。
- 対処: `git checkout main` → `git merge --ff-only 42e032c` → `git push origin main` で解決済み（`bab74cc..42e032c`）。

### 2. fix-14: detached HEAD 検知機構の実装（コミット `9a877cc`）

再発防止として以下を実装・プッシュ済み:

| ファイル                            | 内容                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `.husky/check-detached-leftover.sh` | detached HEAD かつ、どのローカル/リモートブランチからも到達できないコミットが残っている場合に `exit 1` するスクリプト |
| `.husky/pre-push`                   | 冒頭で上記スクリプトを呼び出し、ブロック時は以降のテスト実行をスキップして `exit 1`                                   |
| `tests/unit/husky-pre-push.test.ts` | 3ケース（ブロック / 到達可能でスルー / 通常ブランチでスルー）を検証する Vitest テスト                                 |

単体テスト（3件）は PASS 済み。シナリオ検証（/tmp/opencode/detached-verify）でも以下を確認済み:

- **シナリオ1（トラブル再現）**: detached HEAD + origin 未到達コミット → `exit 1`（ブロック）✅
- **シナリオ2（過剰ブロック防止）**: detached HEAD でも `remotes/origin/main` から到達可能 → `exit 0`（スルー）✅

## 発見された重大バグ

### 現象

`.husky/pre-push` 4行目でチェックスクリプトを **source（`. `）** している:

```sh
. "$(dirname "$0")/check-detached-leftover.sh"
if [ $? -ne 0 ]; then
  exit 1
fi
```

POSIX sh では、**source されたスクリプト内の `exit 0` / `exit 1` は親シェル（pre-push 全体）を即時終了させる**。

### 実証結果

`/tmp/opencode/detached-verify/pretend-pre-push.sh`（pre-push を模したラッパー）で検証:

```
>>> pre-push started
EXIT=0
```

- ブランチ上（通常状態）でチェックスクリプトが `exit 0` を呼ぶと、**pre-push 全体がその時点で終了**
- 「Running unit tests, build, E2E...」が **一切実行されない** まま EXIT=0 で成功扱い
- つまり、**通常状態の push ではユニットテスト・ビルド・E2E がすべてスキップされる**

### 影響

- **fix-14 自身のプッシュ時も pre-push のテスト群が素通りしていた可能性が高い**
- 以後のすべてのプッシュで品質ゲート（unit / build / E2E）が機能しなくなる
- pre-commit のみが残るが、push 時検証が失われる

## 修正方針

`source`（`. script`）を **サブプロセス呼び出し**（`sh script`）に変更する。これにより:

- チェックスクリプトの `exit 0` / `exit 1` はサブプロセスの終了コードになり、親（pre-push）には影響しない
- `$?` チェックが正しく機能し、ブロック時のみ pre-push が `exit 1`

```sh
# 修正後
sh "$(dirname "$0")/check-detached-leftover.sh"
if [ $? -ne 0 ]; then
  exit 1
fi
```

## 対象ファイル

1. **`.husky/pre-push`** — 4行目の source をサブプロセス呼び出しに修正
2. **`tests/unit/husky-pre-push.test.ts`** — 以下のテストを追加・強化
   - **T4（新規）**: 通常状態（ブランチ上）で pre-push を模したラッパーを実行し、フルシーケンス（テスト実行マーカー）が最後まで実行されること
   - **T5（新規）**: detached HEAD + 未到達コミットの状態で、ラッパーがブロックしてフルシーケンスを実行しないこと
3. **`shared_plan/11-pre-push-detached-head-fix-plan.md`**（本プラン文書）

## 実装手順

### 1. `.husky/pre-push` の修正

```sh
# --- Detached HEAD leftover check ---
sh "$(dirname "$0")/check-detached-leftover.sh"
if [ $? -ne 0 ]; then
  exit 1
fi
```

### 2. 回帰テストの追加

`tests/unit/husky-pre-push.test.ts` に以下を追加:

- **T4（通常状態でフルシーケンス実行）**: テンポラリリポジトリで `main` ブランチ上にいるとき、pre-push 冒頭の呼び出し形式（`sh script`）を模したラッパーを実行し、「マーカー行（例: `FULL_SEQUENCE`）」が出力されることを検証。source 方式のままならマーカーが出ないため、このテストが回帰を検知する。
- **T5（ブロック時はフルシーケンスを実行しない）**: detached HEAD + 未到達コミット状態で同じラッパーを実行し、`exit 1` かつマーカーが出力されないことを検証。

### 3. 既存テストの維持

- T1〜T3（`check-detached-leftover.sh` 単体の3ケース）はそのまま維持。

## 検証手順

1. `pnpm exec vitest run tests/unit/husky-pre-push.test.ts` — 新テスト含め全 PASS を確認
2. `pnpm test`（全ユニット/コンポーネントテスト）— 回帰がないこと
3. `pnpm lint` / `pnpm type-check` — 静的検査
4. 手動シナリオ検証（/tmp/opencode/detached-verify 再利用）:
   - シナリオ1: detached HEAD + 未到達 → ブロック
   - シナリオ2: detached HEAD でも origin 到達可能 → スルー
5. `git push origin main` — **pre-push フックが実際にフルシーケンス（unit + build + E2E）を実行し、全検証が走ること** をログで確認
6. `git status` がクリーン / `HEAD == origin/main` / main ブランチ上であること

## 完了条件

- [ ] `.husky/pre-push` の source → サブプロセス呼び出しへの修正
- [ ] T4 / T5 の回帰テスト追加（source 方式に戻しても検知できること）
- [ ] 全ユニットテスト・lint・type-check PASS
- [ ] 実リポジトリで `git push origin main` 時に pre-push フックが全検証を実行
- [ ] origin/main と HEAD が一致、作業ツリーがクリーン
