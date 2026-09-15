# pre-commit / pre-push とテスト実行の速度改善計画

## Hook launcher failure and correction

Huskyの生成ランチャーはhook本体を `sh -e` で起動する。Bash専用構文を
含む `.husky/pre-commit` / `.husky/pre-push` をそのまま実際のGit commitで
起動したため、構文解釈に失敗してcommitが停止した。

今回の修正では、2つのエントリポイントをPOSIX互換の薄いwrapperとし、
それぞれ `exec bash -e "$(dirname "$0")/pre-commit.bash" "$@"` または
`pre-push.bash` 版で引数を透過する。既存のBash本体は対応する`.bash`
ファイルへ移動し、共通lib参照をその実体から行う。生成物 `.husky/_/*` は
変更しない。

受入条件:

- **WHEN** Huskyの `sh -e` launcher経由でcommitまたはpush hookが起動される
  **THEN** POSIX wrapperが対応するBash実体を `exec` し、引数と終了コードを透過する。
- **WHEN** Bash実体が起動される
  **THEN** Bash専用構文と共通lib参照を正しく解釈して既存の検証gateを実行する。

## 現行ステータス（最終監査、2026-09-15）

| 区分               | 状態                   | 判定                              |
| ------------------ | ---------------------- | --------------------------------- |
| ローカル実装・監査 | 実装済み・監査済み     | ローカル受入完了                  |
| build-parity       | 実装済み・監査済み     | ローカル受入完了                  |
| CI親環境           | workflow定義は監査済み | 外部確認待ち                      |
| production検証     | 実行経路は監査済み     | production secret/network確認待ち |
| 実push             | hook定義は監査済み     | 外部確認待ち                      |

この表が本計画書の唯一の現行判定源である。過去の監査履歴・実装記録は経緯として残すが、現在の受入判定には上表を用いる。cache miss、CPU/速度目標、Playwright project別時間、実pushなどの未実施の追加検証は、ローカル受入完了や外部確認待ちの判定を置き換える根拠ではない。隔離契約監査済みの検出率は、実アプリ故障の検出率や実環境の確認済みを意味しない。

## 作成日

2026-09-14

## 状態

状態語は次の定義で分離して記録する。

- **実装済み**: 必要なコードまたは文書が存在する。
- **監査済み**: 静的レビューと実行証跡がある。
- **受入完了**: すべての必須条件と外部依存を満たしている。

今回の最終判定は、Phase 0、Phase 1（1-1〜1-3）、Phase 2（2-1〜2-4）、Phase 3（3-1〜3-4）、およびローカル検証の受入完了である。CI workflow の外部実行結果、production secret を用いる本番検証、実 push の親環境確認は、外部確認待ちとして受入条件から分離する。OpenSpec、Docs、CI workflow、xlsx vendor archive integrity は実装・監査済みである。以下の現行監査証跡は、実装者の実装記録とは分け、今回の監査担当が実行した結果として扱う。

### 最終ステータス一覧（2026-09-15）

| section                                         | 実装     | 監査                   | 受入                               |
| ----------------------------------------------- | -------- | ---------------------- | ---------------------------------- |
| Phase 0（ベースライン・契約）                   | 実装済み | 監査済み               | 受入完了                           |
| Phase 1（pre-commit）                           | 実装済み | 監査済み               | 受入完了                           |
| Phase 2-1（影響分類）                           | 実装済み | 監査済み               | 受入完了                           |
| Phase 2-2〜2-4（pre-push、E2E、server/clean）   | 実装済み | 監査済み               | 受入完了                           |
| Phase 3-1〜3-4（テスト責務・命名・CI差分）      | 実装済み | 監査済み               | 受入完了                           |
| CI workflow                                     | 実装済み | workflow定義を監査済み | 外部CI実行確認待ち                 |
| production検証                                  | 実装済み | 実行経路を監査済み     | production secret/外部環境確認待ち |
| OpenSpec / Docs / xlsx vendor archive integrity | 実装済み | 監査済み               | 受入完了                           |

## 現行監査証跡（2026-09-15、監査担当実行）

今回の監査担当が実行した結果はこのブロックに集約する。実装者が「テストを実行していない」と記録した履歴は、下記の実装記録および監査履歴に残るが、今回の監査担当による実行結果とは別の事実である。

成功した監査テスト・検証:

- 依存導入: `pnpm install --frozen-lockfile` 成功。vendor SHA512検証を含む。
- security: `pnpm audit --audit-level=high` は 0 vulnerabilities、`security-check` 成功。
- lint: `pnpm run lint:fast` 成功。
- typecheck: `pnpm run type-check` 成功。
- test: `pnpm run test:all`、59 files / 546 tests passed。
- build: `pnpm run build`、Next 16.3.5 成功。
- build-parity: `pnpm run test:build-parity`、1 file / 3 tests passed。
- hook: targeted hook suite、45 passed。
- hook smoke: `test:hook-smoke` 成功。
- cache E2E: `measure:cache-e2e` の default と JSON argv server artifact が成功。
- E2E: 133 total / 117 passed / 16 skipped / 0 failed。
- CI workflow追加、xlsx vendor archive integrity、OpenSpec/Docs同期が完了。

外部確認待ち:

- CI workflow の親環境上の実行結果。
- production secret と外部接続を用いた `test:prod` の確認。
- 実 push ref を用いた親環境確認。

このブロックは、上記の外部確認待ちを除くローカル実装・監査・受入が完了していることを示す。

## 変更対象一覧（2026-09-15時点、未追跡を含む）

他エージェントを含む共有作業ツリーで確認した変更対象は次のとおり。本追補で編集するのは本計画書だけだが、hook 実行アーキテクチャ変更に伴う OpenSpec 同期は完了している。

- 変更済み: `.husky/pre-commit`、`.husky/pre-commit.bash`、`.husky/pre-push`、`.husky/pre-push.bash`、`lint-staged.config.js`、`package.json`、`tests/unit/husky-pre-push.test.ts`。
- 未追跡: `.husky/lib/hook-common.sh`、`.husky/lib/prepush-profile.sh`、`.husky/lib/push-impact.sh`、`docs/testing-profiles.md`、`scripts/audit-validation-detection.mjs`、`shared_plan/31-precommit-prepush-test-speedup-plan.md`、`tests/unit/husky-hook-common.test.ts`、`tests/unit/husky-push-impact.test.ts`。
- OpenSpec同期済み: `openspec/specs/nextjstest/spec.md`（121行追加、R-Hooks-1〜4 と Test Requirements の WHEN/THEN 要件を同期）。
- 未変更: `openspec/config.yaml`。

## 対象

- `.husky/pre-commit` / `.husky/pre-push` のPOSIX wrapper、対応する`.bash`実体、およびhookから呼び出す共通処理。
- `package.json` の lint、type-check、Vitest、Playwright、build 関連 scripts。
- `lint-staged` 設定、`vitest.config.ts`、`playwright.config.ts`。
- `.github/workflows/main.yml` と、ローカル開発者が使う実行プロファイルの文書。
- unit/component/integration、production/build parity、E2E の責務分担。

## 目的

pre-commit と pre-push の品質を保ったまま、重複・不要な常時実行・不明確な失敗を減らす。変更の影響範囲に応じてローカル検証を段階化し、CI では完全な品質保証を残す。テスト自体も責務、選択条件、実行順を整理して、速さと失敗検出力を両立する。

## 非対象

- 今回の作業での実装、hook の無効化、テストの削除。
- UI、公開 API、データモデル、プロダクション挙動の変更。
- 具体的な時間・テスト件数の閾値の先行決定（ベースライン計測後に合意する）。
- 現行 CI に含まれない E2E、production、build-parity、security-check を、合意なく「CI の保証済み」と扱うこと。

## 隔離監査ハーネス（契約監査済み）

`scripts/audit-validation-detection.mjs` と `pnpm run audit:validation-detection` は、共有 worktree/index/`.next`/PID/remote を触らない OS temporary fixture 上で、現行 push-impact 分類と full/changed の停止・終了コード・marker 契約を監査する。これは隔離契約監査であり、実アプリの lint/type-check/build/browser 故障そのものの検出率を証明しない。changed E2E 監査も `related → build → e2e` の文書化された pre-push 契約を検証するだけで、実 Playwright 全体を再実行しない。artifact は共有repoに置かず、`/tmp/plan31-validation-detection.json` の実行証跡として扱う。

| 実施日時   | artifact                                              | 分類 precision/recall/accuracy |                                    failure detection rate |                                 E2E detection rate | cleanup   | 実施結果                                                                                      |
| ---------- | ----------------------------------------------------- | -----------------------------: | --------------------------------------------------------: | -------------------------------------------------: | --------- | --------------------------------------------------------------------------------------------- |
| 2026-09-15 | `/tmp/plan31-validation-detection.json`（共有repo外） |          1 / 1 / 1（12 cases） | 1（lint/type-check/unit/build/build-parity/security/e2e） | 1（failure時非0・marker無し、success時marker有り） | completed | 未確認（実アプリの実lint/type/build/browser故障検出率、実push、CI、productionは外部確認待ち） |

## 原則

1. **pre-commit** は高速な局所フィードバックとする。staged ファイルを中心に formatter、lint、必要な型確認、関連テストを行う。
2. **pre-push** は変更影響に応じた必要最小限の統合ゲートとする。最低限のデフォルトゲート、明示的な `full` モード、分かりやすい失敗理由を残す。
3. **CI** は現行範囲を正確に保つ。現行の通常CIは install → audit → secretlint → type-check → `lint:fast` → `test:all` → build の順で、audit と secretlint も必須である。build-parity、E2E、`security-check` の追加検証は手動 `full-validation` に分離し、production は secret/network を要する別枠として扱う。
4. E2E をローカル push の常時必須から外すことは、ブラウザ回帰の検出遅延というリスクを伴う。勝手に無効化せず、変更分類・明示的 full モード・CI の全量検証を組み合わせた段階案として扱う。
5. 既存の高速化（Oxlint、tsgo、related test、絞った E2E ブラウザ行列、workers=3、CI キャッシュ）を前提として、効果を計測してから変更する。

## 確認済みの現状と短縮余地

| 箇所                                 | 確認済みの現状                                                                                                                                                                                                                                        | 短縮・明確化の余地                                                                                                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/pre-commit`                  | `pnpm run lint:fast`、staged type boundary変更時だけ `pnpm exec tsgo --noEmit`、`pnpm exec lint-staged` を実行する。                                                                                                                                  | typecheck を常時実行する必要性を、変更パスまたは staged TS/TSX 条件で検討する。失敗時の理由とフォールバックを統一する。                                                                                                                                                   |
| `lint-staged`                        | TS/TSX は Oxfmt 後に `vitest related --passWithNoTests`、その他は Oxfmt。                                                                                                                                                                             | import graph に無関係な変更で related が 0 件になり得るため、0 件を正常とする契約、選択精度、実行閾値を要計測・要検討。                                                                                                                                                   |
| `.husky/pre-push`                    | detached HEAD/ブランチ到達性チェック、spec/test 更新の非ブロッキング警告、`pnpm run test:all` と `pnpm run build` の並列実行、成功後に `pnpm run test:e2e:clean && pnpm run test:e2e`。差分基準は現状 `origin/main...HEAD` 固定。失敗時は push 停止。 | 実際に push される ref の差分を使って全 ref の和集合を分類し、全 Vitest、build、E2E を変更パス・コミット範囲・環境変数で段階化する。基準不明・新規 ref・shallow clone・分類不能は安全側で full 相当へ fallback する。ただし最低限のデフォルトゲートと明示的 full を残す。 |
| `.husky/check-detached-leftover.sh`  | pre-push から detached HEAD とブランチ到達性を確認する。                                                                                                                                                                                              | 共通 helper 化の際も、到達可能な detached HEAD を誤ってブロックしない契約と終了コードを維持する。                                                                                                                                                                         |
| `scripts/kill-e2e-port.mjs`          | `test:e2e:clean` から E2E ポートの後始末に使われる。                                                                                                                                                                                                  | build/server の二重起動、clean の必要条件、異常終了時の安全性を計測して整理する。                                                                                                                                                                                         |
| `package.json`                       | `test`/`test:all` は `vitest run`、`test:e2e` は `playwright test`、build は `next build --webpack`、`lint:fast` は Oxlint、`type-check:fast` は `tsgo --noEmit`。                                                                                    | `fast`/`changed`/`full` の命名と責務を整理し、hook と CI の呼び出しを読んで理解できる形にする。                                                                                                                                                                           |
| `vitest.config.ts`                   | `tests/production/**`、`tests/build/**`、`tests/e2e/**` を除外。                                                                                                                                                                                      | unit/component/integration と production/build parity の責務を明示し、同じ契約を常時重複検証していないか監査する。                                                                                                                                                        |
| `tests/vitest.integration.config.ts` | production/build parity のテスト設定として `test:prod` と `test:build-parity` から使われる。                                                                                                                                                          | 通常 Vitest から除外される責務を明示し、full/changed での選択条件を整理する。                                                                                                                                                                                             |
| `playwright.config.ts`               | workers=3。chromium 主スイート、chromium-dark は accessibility の `@dark` のみ、mobile-pixel は固有テストのみ、webkit は tabs 回帰のみ。`reuseExistingServer: false`。                                                                                | project dependency/tag/path 選択と重複を監査する。既存のブラウザ差分テストは維持し、build 成果物、clean、server 起動の二重化を計測して整理する。                                                                                                                          |
| `.github/workflows/main.yml`         | **現行**: install → `pnpm audit --audit-level=high` → `pnpm exec secretlint "**/*"` → `pnpm type-check` → `pnpm lint:fast` → `pnpm test:all` → `pnpm build`。                                                                                         | 通常CIはaudit/secretlintを含む必須ゲート。build-parity、E2E、`security-check`、productionは手動full-validationまたはproduction別枠で実行する。                                                                                                                            |
| `security-check`                     | **現行**: 通常CIではauditとsecretlintを個別の必須stepとして実行し、`security-check`を含む追加検証は手動full-validationで実行する。                                                                                                                    | 通常CI、手動full-validation、production別枠の責務を混同しない。                                                                                                                                                                                                           |
| OpenSpec                             | `openspec/specs/nextjstest/spec.md` と `openspec/config.yaml` の管理ルールがある。                                                                                                                                                                    | hook 実行アーキテクチャ変更に伴い Data Sources / Data Flow / Component Tree / Requirements と WHEN/THEN シナリオを同期済み。`openspec/config.yaml` は未変更。                                                                                                             |

## 推奨する実行プロファイル

具体的な変更パス数、コミット数、時間などの閾値はベースライン計測後に決定する。

| プロファイル                             | 現行                                                                                         | 推奨案                                                                                                                                                                                                           | 常に残す保証                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `commit=fast staged`                     | Oxlint、tsgo、lint-staged（formatter + related）を毎回実行                                   | staged 対象の formatter/lint と関連テスト。typecheck は変更時または staged TS/TSX 時を検討                                                                                                                       | formatter、lint、related の 0 件正常扱い、失敗時の停止                       |
| `push=changed integration + build + E2E` | 全 Vitest と build を並列後、clean + 全 E2E                                                  | `src/`、`server/`、`tests/`、設定、依存、生成物などの変更分類とコミット範囲に基づく必要最小限の integration + build + E2E。分類不能・設定変更時は full 相当へ fallback。環境変数で full を明示できる形を検討する | detached HEAD 到達性、最低限の Vitest/integration、build、全 E2E、明示的警告 |
| `full`                                   | 個別 script の組み合わせが必要                                                               | `lint:fast` → `type-check` → `test:all` → build → build-parity → security → E2E を明示的に実行。productionは含めない                                                                                             | 全量テストとブラウザ差分テスト。各失敗を伝播                                 |
| `CI=通常`                                | **現行**: install → audit → secretlint → `type-check` → `lint:fast` → `test:all` → build     | audit/secretlintを含む通常CI jobの成功判定。手動full-validation・production別枠との差分を明記する                                                                                                                | 通常CI job の成功判定                                                        |
| `CI=full-validation`                     | **現行**: `workflow_dispatch` の手動実行。build後にbuild-parity、`security-check`、E2Eを実行 | 通常CIに自動追加せず、必要時に重い検証を実行する                                                                                                                                                                 | 手動full-validation job の成功判定                                           |

`full` の再現可能なコマンド列は、現時点で確認できる既存 script を使い、`lint:fast` → `type-check` → `test:all` → build → build-parity → security → E2E の順で実行する。各コマンドの失敗は後続へ進めず伝播する。build は build-parity より先に実行する。`test:prod` は `PROD_URL` とネットワーク接続を必要とする外部環境検証のため、通常のローカル full の必須列には混ぜず、環境が明示的に用意された場合だけ別枠で実行する。

```sh
pnpm run lint:fast
pnpm run type-check
pnpm run test:all
pnpm run build
pnpm run test:build-parity
pnpm run security-check
pnpm run test:e2e:clean
pnpm run test:e2e
```

この列には現時点で full 専用の環境変数はない。実装時に環境変数で push の full を明示する場合は、名前・値・優先順位・ログ表示を先に定義し、未指定時のデフォルトを変更しない。E2E が参照する環境変数を追加する場合も `playwright.config.ts` の既存契約を確認する。`test:prod` と `test:build-parity` は `tests/vitest.integration.config.ts` を使う既存 script であり、build 成果物を消費する build-parity の前に build を置く。通常の local full 完了と production を含む全品質対象完了を区別し、production 未実行なら後者は未完了とする。CI の現行コマンドはこのローカル full 列に自動追加されたものとして扱わない。

`test:prod` は `PROD_URL` とネットワーク接続が利用可能な場合だけ、local full とは別枠で実行する。

```sh
pnpm run test:prod
```

## 実装タスク

各タスクは最大 2 時間を目安に分割し、超える場合はさらに分割する。以下の閾値・選択条件は計測後に確定する。

### Phase 0 — ベースラインと契約固定

- [x] **0-1（目安 1 時間）実行経路を棚卸しする**
  - 狙い: hook、package script、CI の重複と順序を同じ表で確認する。
  - 作業: `lint-staged` の定義場所（`package.json`、設定ファイル、または別 helper）と hook からの呼び出し経路を最初に特定する。
  - 変更候補: 本計画書の記録、必要なら実装時の hook コメント。
  - 受入条件: 各コマンドの呼び出し元、失敗時の push/commit 影響、CI の実コマンドとの差分が追跡できる。なお、旧記録のCI列（`pnpm type-check` → `pnpm lint:fast` → `pnpm test:all` → build）は当時の調査時点のもので、現行workflowではinstall → audit → secretlint → type-check → lint:fast → test:all → buildへ更新済みである。未確認の経路を確認済みと記録しない。
  - テスト観点: 実装前後に同一の代表変更カテゴリで比較できること。

- [x] **0-2（目安 2 時間）wall time と検出力を計測する**
  - 狙い: 速度目標を推測で置かず、実測値で決める。
  - 変更候補: 計測用の一時手順または既存ログ。恒久的な本番コード追加は要検討。
  - 受入条件: fast/changed/full、cache hit/miss、変更カテゴリ別の比較値と失敗検出率が残る。
  - テスト観点: 結果の正しさを保ったまま複数回のばらつきを記録する。

#### Phase 0 実測記録（2026-09-15、変更前）

計測は `/usr/bin/time -v`、Node v24.19.0、pnpm 11.9.0、作業ツリーの warm cache で行った。既存の `.next/cache`（383M）と `node_modules/.cache`（20K）は削除していないため、cache miss は未計測である。反復値は同じ作業ツリーでの 2 回分で、速度目標・許容ばらつきはこの記録から推測して設定しない。

cache miss は未実施。共有作業ツリーの `.next/cache` と `node_modules/.cache` を削除・改名すると、利用者の既存キャッシュを破壊または変更するため、この Phase では実行しない。再現時は、現行作業ツリーを保持した一時 worktree または複製ディレクトリを用意し、依存を同一にした上で `du -sh .next/cache node_modules/.cache` を記録し、`.next/cache` を一時領域内だけで退避して `pnpm run build` を `/usr/bin/time -v` 付きで 2 回実行する。退避した一時領域を削除し、元の作業ツリーのキャッシュは変更しない。現環境ではこの隔離再現に必要な時間・容量を確保できないため、cache miss の wall/CPU/終了コード/cache 件数は未取得である。

#### 実行経路の棚卸し

| 経路         | 呼び出し元・順序                                                    | 実コマンド／対象                                                                                                                                                                                             | 失敗伝播・終了コード                                                                                                       | 重複／CIとの差分                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pre-commit   | Git commit → Husky → `.husky/pre-commit` を順番に実行               | `pnpm run lint:fast` → `pnpm exec tsgo --noEmit` → `pnpm exec lint-staged`; TS/TSX は Oxfmt → `vitest related --passWithNoTests`、その他は Oxfmt                                                             | 各コマンドは `sh -e` 経由で非 0 停止。lint-staged は staged なしなら 0（今回の実測はタスク未実行）                         | `lint:fast` と tsgo は CI 相当にも存在。related は CI にはなく、staged ファイル中心                                                                                                      |
| pre-push     | Git push → Husky → detached check →差分警告 → test/build 並列 → E2E | `git diff --name-only origin/main...HEAD`（固定基準）→ `pnpm run test:all` と `pnpm run build` を並列 → `pnpm run test:e2e:clean && pnpm run test:e2e`                                                       | test/build の両方を wait し、どちらか非 0 なら push 停止。E2E は clean または test の非 0 を伝播。spec/test 更新は警告のみ | **当時の調査時点の記録**: `test:all` と build はCIと重複するがpre-pushは並列、さらに全E2Eを実行。現行通常CIはaudit/secretlintも必須で、追加検証は手動full-validationまたはproduction別枠 |
| package fast | hook/CI から個別呼び出し                                            | `lint:fast`=Oxlint（tests 等を除外）、`type-check:fast`=tsgo、`test:all`=通常 Vitest、`build`=Next webpack build                                                                                             | pnpm の終了コードを呼び出し元へ返す                                                                                        | `pre-commit` は fast lint+tsgo、CI は fast lint ではなく `type-check`（tsc）                                                                                                             |
| lint-staged  | pre-commit の `pnpm exec lint-staged`                               | `lint-staged.config.js` に定義。TS/TSX は format→related、JS/JSON/MD/CSS 等は format                                                                                                                         | 個別 task の失敗で commit 停止。`--passWithNoTests` により related 0 件は成功                                              | CI から直接は呼ばれない。pre-commit の Oxfmt は `format:fast` script とは別経路                                                                                                          |
| 現行 CI      | `.github/workflows/main.yml` の 1 job、順番に実行                   | **現行**: install（pnpm frozen lockfile）→ `pnpm audit --audit-level=high` → `pnpm exec secretlint "**/*"` → `pnpm type-check` → `pnpm lint:fast` → `pnpm test:all` → `pnpm build`; pnpm/Next cache 設定あり | 各 step の非 0 で job 失敗、後続 step は実行されない                                                                       | `type-check` は tsc で hook の tsgo と異なる。build-parity、E2E、production、`security-check`の追加検証は手動full-validationまたはproduction別枠                                         |

#### 実測値

| プロファイル／コマンド                                                                        |          回数 | wall time       | CPU（user + sys）             | 終了コード／件数                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ------------: | --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| pre-commit 相当（lint:fast → tsgo → lint-staged）                                             |             2 | 2.26s / 2.24s   | 3.32+0.54s / 3.29+0.57s       | 0 / 0。staged なし、lint-staged task 0                                                                                                |
| `lint:fast`                                                                                   |             2 | 0.55s / 0.53s   | 0.58+0.07s / 0.55+0.08s       | 0 / 0                                                                                                                                 |
| `type-check:fast`                                                                             |             2 | 1.10s / 1.08s   | 1.96+0.33s / 2.19+0.29s       | 0 / 0                                                                                                                                 |
| `test:all`（通常 Vitest）                                                                     |             2 | 19.14s / 19.20s | 55.42+7.15s / 55.37+7.12s     | 0 / 0、57 files・506 tests passed                                                                                                     |
| `build`                                                                                       |             2 | 25.69s / 26.72s | 38.90+2.82s / 40.04+2.86s     | 0 / 0                                                                                                                                 |
| 現行 pre-push 実行                                                                            |             2 | 41.05s / 41.30s | 111.41+11.60s / 112.41+12.02s | 1 / 1。test/build は成功、clean→E2E で停止                                                                                            |
| 現行 CI 相当（当時の調査時点）                                                                |             2 | 51.54s / 48.17s | 106.41+10.41s / 99.99+10.50s  | 0 / 0、57 files・506 tests passed。現行workflowではinstall → audit → secretlint → type-check → lint:fast → test:all → buildへ更新済み |
| full（計画書記載の lint → type-check → test → build → build-parity → security → clean → E2E） | 1（途中停止） | wall/CPU 未取得 | —                             | lint〜build-parity は 0、security の EAI_AGAIN 後 Ctrl-C で 130、E2E 未到達                                                           |
| `test:build-parity`（full の追加対象）                                                        |             1 | 1.32s           | 1.53+0.18s                    | 0、1 file・3 tests passed                                                                                                             |
| E2E `--list`（実行なし）                                                                      |             1 | 1.17s           | 1.38+0.16s                    | 0、133 tests（chromium 84、dark 2、mobile 38、webkit 9）                                                                              |
| `test:e2e`                                                                                    |             2 | 1.87s / 1.86s   | 2.04+0.26s / 2.01+0.27s       | 1 / 1、webServer 起動失敗、テスト 0                                                                                                   |

pre-push の E2E 実行は `test:e2e:clean` がこの環境で「E2E ポート 3100 にプロセスはいません」を返し、`&&` により `test:e2e` に進まず終了コード 1 となった。直接の `test:e2e` も `Process from config.webServer was not able to start` で失敗した。ブラウザ実行、E2E wall time、server 起動時間、実 E2E 検出率は環境依存のため未実施とする。`test:prod` は `PROD_URL` とネットワークが必要なため未実施、`security-check` は npm advisory endpoint の DNS（EAI_AGAIN）で停止したため未完了とする。cache miss、pre-commit の staged TS/TSX task、実 push ref の複数 ref、CI 上の実測は未実施である。full 列そのものは追加実行したが、security で停止したため完走実測ではない。

#### 追加実測（2026-09-15、warm cache、一時変更なし）

全量列は `/usr/bin/time -v sh -c 'pnpm run lint:fast && pnpm run type-check:fast && pnpm run test:all && pnpm run build && pnpm run test:build-parity && pnpm run security-check && pnpm run test:e2e:clean && pnpm run test:e2e'` で実行した。lint、tsgo、通常 Vitest（57 files・506 tests）、build、build-parity（1 file・3 tests）までは終了コード 0。`security-check` は npm advisory endpoint への接続が `EAI_AGAIN` となり 10 秒・1 分の再試行に入ったため Ctrl-C（終了コード 130）で停止し、E2E には到達しなかった。この複合実行は途中停止のため `/usr/bin/time -v` の最終 wall/CPU は取得できず、推測値を記録しない。full の E2E 実行、検出率、`test:prod`、security 成功値は未実施である。

変更カテゴリ別の実測値は、代表パスを引数にした既存コマンドの結果であり、カテゴリ全体の網羅値ではない。

| 変更カテゴリ（代表パス）                             | コマンド                                                                                         |   wall | CPU（user + sys） | cache／終了コード／件数                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -----: | ----------------: | ---------------------------------------------- |
| docs/assets（`docs/refactoring-plan.md`、`public`）  | `pnpm exec oxfmt --check docs/refactoring-plan.md public`                                        |  3.70s |        2.12+0.24s | warm／0／1 file、format passed                 |
| shared utility（`src/lib/resetLogic.ts`）            | `pnpm exec vitest related --passWithNoTests ...`                                                 | 13.09s |        8.31+0.86s | warm／0／2 files・12 tests passed              |
| component（`src/app/components/SectionTabs.tsx`）    | `pnpm exec vitest related --passWithNoTests ...`                                                 | 13.67s |        7.56+0.79s | warm／0／1 file・6 tests passed                |
| loader/server（`server/lib/dataLoader.ts`）          | `pnpm exec vitest related --passWithNoTests ...`                                                 | 15.07s |       20.06+2.43s | warm／0／14 files・181 tests passed            |
| test（`tests/utils/recharts-mock.tsx`）              | `pnpm exec vitest related --passWithNoTests ...`                                                 | 13.62s |       10.86+1.09s | warm／0／2 files・33 tests passed              |
| config/build（`vitest.config.ts`、代表 test filter） | `pnpm exec vitest --config vitest.config.ts run --passWithNoTests tests/utils/recharts-mock.tsx` |  0.82s |        0.87+0.12s | warm／0／0 test files（config exclude を表示） |
| OpenSpec（`openspec/config.yaml`、`spec.md`）        | `pnpm exec oxfmt --check ...`                                                                    |  4.21s |        2.38+0.26s | warm／0／2 files、format passed                |

上表の `cache` は削除を伴わない warm 状態を意味し、cache hit/miss の内部件数を意味しない。TS/TSX 単体の staged pre-commit、package/依存、Next build 設定、CI 実行環境、実 push ref は未実施であり、代表値から補間しない。

#### 故障注入の検出表（2026-09-15）

作業ツリーに恒久変更を残す故障注入は行っていない。hook/package/CI、テスト、設定、OpenSpec を直接壊す注入は、対象範囲外の変更を一時的に作る必要があり、隔離 worktree を準備して実行・復元する時間を確保できなかったため未実施である。従って検出率を 0%/100% と推測しない。

| 注入対象                                               | 実施結果 | 検出表の値／未実施理由                                                                          |
| ------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| docs/assets formatter error                            | 未実施   | 一時ファイル注入の検出終了コード未取得。恒久ファイルを残さず隔離する時間不足                    |
| TS/TSX type/lint error                                 | 未実施   | staged pre-commit 経路を壊さず再現する隔離 worktree 未実施                                      |
| utility/component/loader/server/test assertion failure | 未実施   | テスト・source への一時注入と復元を未実施                                                       |
| Vitest/Playwright config、build/Next config、依存      | 未実施   | config/package/lockfile を変更するため対象外の挙動変更リスクがあり、隔離実行未実施              |
| OpenSpec source/spec 差分警告                          | 未実施   | pre-push の実 push ref がなく、hook の警告経路を実 push で再現できない                          |
| E2E/security/production                                | 未実施   | E2E webServer、`PROD_URL`、npm advisory endpoint が未充足。security は実列で `EAI_AGAIN` を観測 |

#### 変更カテゴリ別の測定対象と故障注入計画

| 変更カテゴリ                         | Phase 0 での測定対象                         | 故障注入（作業ツリーに残さない）                                                                    |
| ------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| docs/assets                          | lint-staged の Oxfmt 対象、related 0 件契約  | formatter エラーを一時ファイルで注入し pre-commit の非 0 を確認                                     |
| 単一 TS/TSX、component、共有 utility | lint、tsgo、lint-staged related、通常 Vitest | 型エラー、lint エラー、既知 unit/component 失敗を一時 worktree または復元可能な patch で注入        |
| loader/server                        | pre-push test/build、通常 Vitest             | integration 失敗と build 失敗を一時注入し、push 停止と CI 検出を記録                                |
| test                                 | related 選択、通常 Vitest、CI                | 意図的 assertion failure を一時注入し、related 0 件扱いとの違いを記録                               |
| Vitest/Playwright config             | test/build/E2E の fallback、`--list` 件数    | 設定を一時変更して test discovery、webServer、project 選択の失敗を確認                              |
| build/Next config、依存              | build、CI 相当、cache 状態                   | build error または lockfile/config error を一時注入し、各ゲートの伝播を記録                         |
| OpenSpec                             | pre-push の警告経路（公開契約変更なし）      | source 変更のみ／spec 同時変更を一時差分で比較し、警告が非ブロッキングであることを確認              |
| E2E/security/production              | 現環境では list・起動失敗・定義確認のみ      | ブラウザ assertion、security、PROD_URL 接続障害を専用一時 worktree で注入。実行環境が整うまで未実施 |

故障注入は実施前に一時 worktree または保存済み patch を作り、各ケース後に復元して作業ツリーへ残さない。Phase 0 では実装変更を加えていないため、検出率の実測値は未取得であり、次Phaseの受入条件として残す。

#### Phase 0 完了判定と次Phase受入条件

0-1 は実経路表と失敗伝播・重複・CI差分を固定したため完了。0-2 は warm cache の fast/pre-push/CI 相当、full の到達範囲、変更カテゴリ別の代表実測、故障注入の未実施理由を追補したため、ベースライン証拠の記録作業として完了とする。ただし、cache miss、E2E 実行、PROD/security の成功、故障注入検出率、staged TS/TSX と実 push ref の実測は未確定であり、品質保証済みとは扱わない。

次Phaseへ進む条件は、(1) staged TS/TSX を含む pre-commit の実測、(2) E2E webServer を起動可能な環境で clean→server→全 project の複数回測定、(3) 隔離環境で cache hit/miss の再現と wall/CPU/終了コード/cache 件数の取得、(4) 変更カテゴリ別故障注入の検出表（実施またはケース別の未実施理由）、(5) 速度目標と許容ばらつきの合意、(6) `test:prod` と security の実行可否の明記、の全てである。これらを満たすまで hook/package/CI の挙動は変更しない。

#### Phase 0 受入実行証跡（2026-09-15、過去の試行）

以下は今回の現行監査証跡より前に記録した過去の試行であり、現行結果と混同しない。設定・静的確認として `bash -n .husky/*` と `git diff --check` は成功した。warm cache の `test:all` は 57 files / 506 tests、`build` は成功したが、pre-push 相当は E2E clean で停止し、直接の `test:e2e` も webServer 起動失敗となった。full 列は build-parity まで成功後、security の EAI_AGAIN で停止し、E2E 未到達だった。これは今回の E2E 117 passed / 16 skipped / 0 failed という現行監査結果を否定するものではなく、別試行の記録である。

過去の試行では `test:prod` は `PROD_URL` とネットワーク不足、`security-check` は npm advisory endpoint の DNS（EAI_AGAIN）で未完了だった。cache miss、故障注入、実 push ref の検証、production 検証は現行監査でも未完了のままとする。

### Phase 1 — hook の共通化と高速局所ゲート

- [x] **1-1（目安 1.5 時間）hook 共通ヘルパーとシェル失敗処理を整理する**（受入完了・監査証跡あり）
  - 狙い: 重複 shell、終了コード、ログ、途中失敗時の挙動を明確にする。
  - 変更候補: `.husky/` の共通ヘルパー、`.husky/pre-commit`、`.husky/pre-push`。
  - 受入条件: command failure が隠れず、どのゲートで停止したか表示され、この hook が起動した子プロセス・一時ログだけを終了・削除し、既存 server や利用者の worktree は変更しない。現行の逐次実効経路では各 gate の exit を伝播し、互換の並列 helper を使う経路では各処理の exit を回収する。失敗・INT・TERM では非 0 終了する。既存の detached HEAD と警告の意味も保つ。フック回避を促す案内は、利用者向けの hook 出力・開発者向け文書から除去する。
  - テスト観点: 成功、各コマンド失敗、片側の並列処理失敗、INT/TERM 中断、detached HEAD のブロック、警告のみ継続を確認する。

- [x] **1-2（目安 1.5 時間）pre-commit の typecheck 条件を検討・実装する**（受入完了・監査証跡あり）
  - 狙い: 変更と無関係な全体 typecheck の常時コストを減らす。
  - 変更候補: `.husky/pre-commit`、`package.json`、必要なら staged 判定 helper。
  - 受入条件: staged TS/TSX に加え、`tsconfig*`、`package.json`、`pnpm-lock.yaml`、Next/Vitest/Playwright 設定、共有型、生成物、型宣言に関わる変更では実行する。判定不能・依存変更・型境界変更では現行全体 typecheck にフォールバックする。採否は計測結果とレビューで確定する。
  - テスト観点: TS/TSX、`tsconfig*`、`package.json`、`pnpm-lock.yaml`、各設定、共有型、生成物、非 TS、判定不能の各変更で期待した実行またはフォールバックになる。

- [x] **1-3（目安 1.5 時間）lint-staged related の選択精度を見直す**（受入完了・監査証跡あり）
  - 狙い: 無関係な変更の無駄な探索を減らしつつ、関連テスト漏れを防ぐ。
  - 変更候補: lint-staged 設定、Vitest の related 呼び出し、コメントまたは開発者向け文書。
  - 受入条件: lint-staged の所在と設定が記録され、0 件は `--passWithNoTests` により正常であることを明文化し、import graph 外の変更で commit が不必要に失敗しない。これは commit の related 実行に限る契約とし、push の分類不能・差分取得不能を 0 件成功として扱わない。閾値や追加 fallback は要計測・要検討。
  - テスト観点: source 変更、テスト変更、設定変更、docs/assets の変更、関連なし変更、削除・rename を確認する。

#### Phase 1 実装記録（2026-09-15、受入完了・監査証跡あり）

1-1〜1-3 は、既存の pre-commit/pre-push の保証範囲を保ったまま実装した。共通 helper（`.husky/lib/hook-common.sh`）は `set -euo pipefail`、ゲート名と終了コード、作成した子 PID・一時ログだけの cleanup、INT/TERM の非 0 終了を共通化した。`hook_start_parallel_gate`/`hook_wait_parallel_gates` は互換 helper として残しているが、現行 pre-push の実効経路は test/build を逐次実行するため、この Phase の受入条件は各 `hook_gate` の非 0 伝播と cleanup/trap で評価する。pre-push の detached HEAD 到達性チェック、source/test と spec の非ブロッキング警告、全 test/build/E2E の順序は維持した。フック回避を促す案内は、hook の利用者向け出力と開発者向け文書から削除済みであり、この計画書に残る受入条件・「やらないこと」は実装案内ではなく監査上の制約記録である。push 差分の取得失敗は空差分扱いにせず停止する。

1-2 は `.husky/lib/hook-common.sh` の staged 判定で実装した。staged TS/TSX、`tsconfig*`、`package.json`、`pnpm-lock.yaml`、Next/Vitest/Playwright 設定、`.d.ts`、共有型・型境界・生成物らしいパス、削除・rename、git 判定不能は全体 `tsgo --noEmit` が必要と判定する。判定 helper は条件と判定結果だけを返し、実際の `tsgo --noEmit` は呼び出し側の pre-commit が実行する。その他の変更では commit hook の typecheck を skip するが、lint:fast と lint-staged は従来どおり実行する。判定は staged 差分だけを対象とし、作業ツリーの未 staged 変更を根拠にしない。

1-3 は `lint-staged.config.js` に所在と契約をコメント化した。TS/TSX の formatter → `vitest related --passWithNoTests` の順序と、related の 0 件成功は commit の lint-staged 実行だけに適用される。pre-push は lint-staged を呼ばず、差分取得・分類不能を 0 件成功として扱わない。

`tests/unit/husky-hook-common.test.ts` に gate の非 0 伝播、EXIT cleanup、staged TS/TSX、config/dependency、docs/assets、削除/rename、判定不能の契約を追加した。targeted hook suite は 3 files / 45 tests passed。`bash -n .husky/*`、`git diff --check`、`pnpm run lint:fast`、`pnpm run type-check` も成功した。これは 1-1〜1-3 の受入完了と監査証跡を示す。故障注入、実 push、staged 分岐の実環境確認、検出率・速度改善の実測、production/security の成功は、別タスクまたは外部条件として残る。

### Phase 2 — pre-push の段階化（実装済み・監査済み・ローカル受入完了、productionは外部確認待ち）

- [x] **2-1（目安 2 時間）変更影響の分類を定義する**（受入完了・監査証跡あり）
  - 狙い: パス、コミット範囲、環境変数から実行プロファイルを再現可能に選ぶ。
  - 変更候補: `.husky/pre-push`、共通 helper、`package.json` scripts、分類表。
  - 受入条件: 実際に push される各 ref の差分を取得し、複数 ref は和集合として扱う。現行の `origin/main...HEAD` 固定を実 push ref 基準へ置き換える。`src/` と `server/` は関連 unit/component/integration、`tests/` は該当テスト、設定・依存・生成物は build と full 相当、E2E/Playwright 関連は E2E を選ぶ分類を定義する。基準不明、新規 ref、shallow clone、rename/delete、関連テスト 0 件、分類不能、設定・依存・共有設定変更は安全側の full 相当へ fallback し、削除・rename は旧/新パスの影響を評価して漏れなく扱う。detached HEAD チェックと spec/test 更新警告は維持する。
  - テスト観点: source、server、test、config、dependency、generated artifact、build、E2E、OpenSpec、複数コミット、複数 push ref、環境変数指定を分類できる。差分取得失敗や push 対象未解決時は安全側へ倒れ、空の差分を成功扱いしない。

- [x] **2-2（目安 2 時間）Vitest と build の最低限ゲートを段階化する**（実装済み・監査済み・受入完了）
  - 狙い: 全 Vitest を毎回実行するコストを下げ、統合リスクを残さない。
  - 変更候補: `.husky/pre-push`、`package.json` の `test:changed`/`test:full` 等、Vitest の選択手順。
  - 受入条件: デフォルトに最低限の changed integration + build があり、全量は明示的 full で実行される。build は build-parity より先に実行する。production 検証は `PROD_URL` とネットワーク利用可能時だけ別枠で実行し、未充足時は未実行として明示する。現行通常CIは install → audit → secretlint → `pnpm type-check` → `pnpm lint:fast` → `pnpm test:all` → build、手動 `full-validation` はbuild後にbuild-parity・`security-check`・E2Eを実行するものとして記録する。失敗時は push を停止する。
  - テスト観点: unit/component/integration の選択、production/build parity、build 設定変更、分類不能時の全量または安全側 fallback。

- [x] **2-3（目安 2 時間）E2E の常時必須案と段階案を比較する**（実装済み・監査済み・受入完了）
  - 狙い: push の待ち時間とブラウザ回帰の検出遅延を定量比較する。
  - 変更候補: `.husky/pre-push`、`package.json`、`playwright.config.ts`、開発者向け文書。
  - 受入条件: E2E の常時必須化を段階導入の判断事項とし、検出率・対象件数・失敗回帰で現行品質の維持根拠が揃うまで pre-push の全 E2E を維持する。段階案を採る場合も、リスク、明示的 full、E2E 関連変更時の必須条件、現行 CI に E2E がない事実、完全 full CI への拡張案を明記する。無断で無効化しない。
  - テスト観点: E2E 関連変更、主要 UI/route 変更、Playwright config 変更、明示的 full、失敗時の停止を確認する。

- [x] **2-4（目安 1.5 時間）build 成果物と E2E の起動・clean を計測して整理する**（実装済み・監査済み・受入完了）
  - 狙い: `build` と `test:e2e:clean`/`test:e2e` の二重起動、古い成果物、`reuseExistingServer: false` のコストと安全性を把握する。
  - 変更候補: `.husky/pre-push`、`playwright.config.ts`、`test:e2e:clean` script。
  - 受入条件: clean の必要条件、server 起動回数、build 成果物の利用関係がログで説明できる。現状の E2E は build 後に webServer が `next start` を 1 回起動し `reuseExistingServer: false` である事実を基準にし、重複起動とは断定しない。`reuseExistingServer` の変更は事故リスクを評価してから決める。
  - テスト観点: 正常終了、途中失敗、既存 server、古い `.next`、ポート競合、再実行時の後始末。

#### Phase 2 実装記録（2026-09-15、実装済み・監査済み・受入完了）

2-1〜2-4を実装した。`.husky/lib/push-impact.sh` がpre-pushのstdinに渡される各 `local-ref local-oid remote-ref remote-oid` を読み、各refの `remote_oid..local_oid` 差分を収集してパス分類の和集合を作る。`origin/main...HEAD` は使用しない。初回push、remote削除、shallow clone、ref/oid解決不能、差分取得/解析失敗、空差分、rename/delete、分類不能は理由を表示してfull相当へfallbackする。分類はsource、server、tests、config/dependency、generated、build、E2E、Playwright、OpenSpec、docs/assets、unknownをこのhelperに集約した。

#### Phase 2-1 監査指摘の追補実装（2026-09-15、受入完了・監査証跡あり）

related入力を `.husky/lib/push-impact.sh` の `PUSH_IMPACT_RELATED_PATHS` に分離し、`src/`、`server/`、`tests/` のテスト関連候補だけを `.husky/pre-push` の Vitest relatedへ渡すようにした。docs/assets、OpenSpec、生成物、build/configなどは `PUSH_IMPACT_PATHS` に残して分類・警告・fallback判定に利用するが、relatedの引数には渡さない。候補が空、選別不能、またはVitestコマンド/JSON結果が不整合な場合はfull profileへfallbackする。

`tests/unit/husky-pre-push.test.ts` に隔離Git fixtureを追加し、候補の絞り込みと全影響パスの保持、複数refの和集合、初回push/OID解決失敗、空差分、rename、malformed stdin、およびpre-pushから候補配列・full経路への接続契約を固定した。さらに `tests/unit/husky-push-impact.test.ts` で、server/config/dependency/generated/build/E2E/Playwright/unknownを含む全分類、特殊パス名、shallow、差分取得失敗、remote deletionを実Git差分で検証し、pre-pushは一時PATHのpnpmモックで候補配列の実渡し、Vitest JSONの0件/不在/不正、related失敗、明示full、fallback後のfull一回、ゲート失敗時の停止を検証する。targeted hook suite は 3 files / 45 tests passed。これは 2-1 の受入完了と監査証跡を示す。実push、外部環境、分類漏れの実push検証は、別タスクまたは外部条件として残す。

本追補の実装成果物は `.husky/pre-push`、`.husky/lib/push-impact.sh`、`tests/unit/husky-pre-push.test.ts`、`tests/unit/husky-push-impact.test.ts`、本計画書である。hook 実行アーキテクチャ変更について `openspec/specs/nextjstest/spec.md` を121行追加で同期し、R-Hooks-1〜4 と Test Requirements の WHEN/THEN 要件を反映した。`openspec/config.yaml` は未変更である。

2-1のprofile入力は `.husky/lib/prepush-profile.sh` で正規化した。`PREPUSH_PROFILE` 未指定時の既定値 `changed` は維持し、指定済みの `full` / `changed` 以外、空文字、前後空白、大文字混在などは `full` 相当へfallbackして理由を表示する。既知値・未指定・不正値を固定する単体テストを追加したが、テスト実行は監査担当に委ね、この実装では行っていない。

profile契約は次のとおり。

| profile                                             | 実行範囲                                                                                                  | 保証範囲                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `changed`（pre-push既定）                           | 関連入力があればVitest related、build、全E2E（clean→test）。docs/assets-onlyを含めE2Eを省略しない         | 変更影響に応じたintegration、fresh build、全ブラウザ回帰。E2E省略の安全条件は未記録                             |
| `full`（`PREPUSH_PROFILE=full` または分類fallback） | `lint:fast` → `type-check` → `test:all` → build → `test:build-parity` → `security-check` → E2E clean/test | 全unit/component、lint、型、build parity、fresh build、security、全E2E。buildはbuild-parityより先。各失敗を伝播 |
| `pnpm run test:full`                                | 上記full列をpackage scriptで明示実行                                                                      | pre-push外でも同じfull列を再現し、productionは含めない                                                          |
| production別枠                                      | `pnpm run test:prod` を `PROD_URL` とネットワークが用意された場合だけ明示実行                             | 通常pre-push/fullの成功条件には含めない。未充足時は未実行                                                       |

config/dependency/generated/build/E2E/Playwright/OpenSpecの変更はfull相当とした。changedはsource/server/testsだけでなくdocs/assets-onlyでも、related（該当時）→build→全E2E（clean→test）を実行する。E2E省略の安全条件は未記録であり、分類条件に依存した省略は実装しない。現行CIはE2Eを実行しないため、CI側のE2E未実行リスクと、分類・E2E検出率の実push検証未完了は残る。失敗は全て `hook_gate` の非0終了としてpushを停止する。detached HEADチェックと既存のspec/test警告は維持した。

build/E2E server/clean/`.next` の計測記録は、Phase 0で確認済みの範囲に限定する。Playwright設定上、E2Eはfresh `pnpm build` 後の `.next` を `pnpm start` が使用し、`reuseExistingServer: false` により起動済みserverを再利用しない。cleanは `test:e2e` 前に1回、webServer起動はPlaywright実行中に1回という設定上の記録はあるが、今回の実装後の実測は未実施であり、重複起動や実測時間は断定しない。`reuseExistingServer` は変更していない。

監査指摘対応として、明示的full、`pnpm run test:full`、および changed でrelatedを実行した場合の related 0件・JSON不在/不正/判定不能・related実行失敗時の fallback は、`lint:fast` → `type-check`（`tsc --noEmit`）→ `test:all` → build → build-parity → security → E2E の同一経路へ統一し、productionは混在させない。changedはdocs/assets-onlyを含め、related（該当時）→build→全E2E（clean→test）を実行する。fallback理由を表示し、fallback先の各ゲートは非0終了を伝播する。related fallback は全量経路を一度だけ実行し、通常changedのbuild/E2Eを重ねて実行しない。changed の related はVitest JSON reporterの `testResults` 件数で0件を判定し、自由なログ文字列検索による成功判定は行わない。pre-pushは各full gateとE2Eを`hook_gate`で実行して非0を伝播しpushを停止する。packageの`pnpm test:full`は各コマンドをシェルの`&&`で連結し、最初の非0終了コードを伝播して後続を実行しない。pre-commitの実体は条件付き `pnpm exec tsgo --noEmit` であり、packageの `type-check:fast` とは区別する。

Phase 2チェックは実装・監査・受入完了である。実push hook stdinの親環境確認は外部確認待ちとして残す。build、build-parity、security、E2E、hook smoke、およびcache E2Eの最終実測は成功している。production URL/secretを用いる検証だけは通常のlocal fullとは分離し、外部確認待ちとする。OpenSpec同期は完了している。

監査待ち項目は、追加した隔離テストの実行結果、実pushでのref/oid解決境界、full列のsecurity/network依存、server起動/cleanの実測である。Gitの特殊なパス名、Vitest related出力による0件判定、分類和集合、full fallbackと失敗時停止は隔離テストで検証する契約を追加済みだが、実行前のため合格扱いにしない。Phase 3へ移行する条件は、これらの監査を隔離環境で実施し、full fallbackと失敗時push停止を確認したうえで、changedの検出漏れがないことを記録すること。なお、ここでの「CIのtype-check→lint:fast→test:all→buildのみ」「CI full拡張は別案」という記載は当時の調査時点の履歴であり、現行workflowでは通常CIと手動full-validationへ更新済みである。OpenSpecはhook実行アーキテクチャ変更を反映し、R-Hooks-1〜4 と Test Requirements の WHEN/THEN 要件を同期済みである。

### Phase 3 — テストスイートと命名の整理（実装済み・監査済み・受入完了）

- [x] **3-1（目安 2 時間）Vitest の責務と重複を監査する**（実装済み・監査済み・受入完了）
  - 狙い: unit/component/integration と production/build parity の契約を明確化し、同一ケースの常時重複をなくす。
  - 変更候補: `tests/` 配置、`vitest.config.ts`、scripts、テスト説明。
  - 受入条件: 各テストが検証する層と実行プロファイルが一覧化され、削除ではなく責務移管・選択実行として不要な常時実行を減らす。production/build parity は `test:prod`/`test:build-parity` の責務として区別する。
  - テスト観点: 公開契約、loader/data parity、build 専用異常系、component interaction、integration boundary の代表ケースを維持する。

- [x] **3-2（目安 1.5 時間）Playwright の project dependency/tag/path を監査する**（実装済み・監査済み・受入完了）
  - 狙い: 重複・skip 起動コストを減らし、ブラウザ固有の価値を保つ。
  - 変更候補: `playwright.config.ts`、`tests/e2e/` の tag/path、scripts。
  - 受入条件: chromium 主スイート、chromium-dark の `@dark` accessibility、mobile-pixel 固有テスト、webkit tabs 回帰の担当が明記され、ブラウザ差分テストを黙って削除しない。
  - テスト観点: 各 project の対象件数、dependency の順序、tag/path 選択、失敗時 trace/report、workers=3 の維持または計測根拠。

- [x] **3-3（目安 1 時間）scripts 命名規則を整理する**（実装済み・監査済み・受入完了）
  - 狙い: fast/changed/full の選択をコマンド名だけで理解できるようにする。
  - 変更候補: `package.json`、hook、CI workflow、README 等の開発者向け文書。
  - 受入条件: `fast` は局所、`changed` は影響範囲、`full` は全量という規則と、各 script の実行対象・失敗時挙動が一致する。
  - テスト観点: 既存 script の互換性、hook/CI の呼び出し先、未知の script 名での明確なエラー。

- [x] **3-4（目安 1 時間）CIとの差分と逃げ道を文書化する**（実装済み・監査済み・受入完了）
  - 狙い: ローカル短縮が品質保証の欠落と誤解されないようにする。
  - 変更候補: 開発者向け文書、hook の usage/help、`.github/workflows/main.yml` のコメント。
  - 受入条件: local fast/changed/full と現行 CI 範囲、完全 full CI 拡張案との差分、明示的 full の方法、環境変数、失敗時の再実行方法が記載される。
  - テスト観点: 新規開発者がコマンドを誤解せず、full を手動で再現できる。

#### Phase 3 実装者記録（2026-09-15、実装済み・監査済み・受入完了）

3-1〜3-4は、実ファイルに基づく開発者向け文書 [`docs/testing-profiles.md`](../docs/testing-profiles.md) を追加して実装した。Vitestのunit/component/integration、production、build-parityの責務、通常Vitestからの `tests/production`・`tests/build` 除外、専用script、選択条件と重複しない契約を一覧化した。Playwrightの4 projectについて、path/tag、依存なし、workers=3、trace/report、`reuseExistingServer: false`、既存のブラウザ固有ケースを記録した。

scriptsはfast/changed/fullの命名と、`test:full`がPhase 2追加の明示的fullであること、hook・package script・CIの失敗伝播を記録した。**当時の文書化時点の記録**として現行CIを `type-check → lint:fast → test:all → build` と記載していたが、現行workflowでは install → audit → secretlint → type-check → lint:fast → test:all → build に更新済みであり、手動full-validationとproduction別枠を分離する。`PREPUSH_PROFILE`、`PROD_URL`、再実行方法を明記した。既存script、テストファイル、browser固有ケースは変更していない。OpenSpecはhook実行アーキテクチャ変更を反映して同期済みであり、`openspec/config.yaml` は未変更である。

#### Phase 3監査指摘の文書修正追補（2026-09-15、実装済み・監査済み・ローカル受入完了）

`docs/testing-profiles.md` のPlaywright説明を、1回の実行で設定全体の `webServer` を共有し、`dependencies` 未設定はproject間依存なしを示す内容へ訂正した。実値として `webServer.timeout=90_000`、Playwright timeout `60_000`、`fullyParallel=false` を追記し、workers=3、`reuseExistingServer=false`、trace/report設定は維持した。fastのpre-commit実体は条件付き `pnpm exec tsgo --noEmit` であり、packageの `type-check:fast` と区別することを明記した。changedのrelated 0件fallbackはrelatedを実行した場合に限定し、docs/assets-onlyを含むchangedでrelated（該当時）→build→全E2E（clean→test）を実行する契約へ訂正した。E2E省略の安全条件は未記録であり、分類条件依存による省略リスクは実装で解消した一方、分類・E2E検出率の実push検証は未検証として残した。通常CIのaudit/secretlintを含む現行workflow、手動full-validation、production別枠は現行監査証跡に従う。fullはpre-pushの `hook_gate` とpackageのシェル `&&` 連結がそれぞれ非0終了を伝播し、push停止または後続停止となる挙動を明記した。なお、ここに残る「Phase 3チェック未完了・テスト未実施」はこの文書化時点の履歴であり、現行最終監査の結果は冒頭の証跡に集約する。

Phase 3 の実装内容に対する今回の監査担当の実行結果は、冒頭の「現行監査証跡」に集約する。`playwright --list` の 133 tests / 20 files と E2E の 117 passed / 16 skipped / 0 failedを含み、Phase 3 の受入完了を示す。

Phase 3 のローカル残件は解消済みである。`security-check`、hook smoke-test、cache E2E、build、E2Eを含む最終監査結果は冒頭に記載した。production secretを使う本番検証、CI workflowの親環境実行、実pushは外部確認待ちであり、ローカル受入完了とは分離する。

残リスクは、changed profileの差分分類・related選択とCI workflowの親環境実行を外部確認する必要があること、productionがsecretとネットワークに依存することである。local fullの成功、CI workflowの追加、既存件数の記録は分けて扱う。

なお、E2E省略条件を分類結果の `PUSH_IMPACT_E2E` に委ねる実装上のリスクは、当該フラグと条件分岐を廃止し、changedの固定ゲートとして全E2Eを実行することで解消した。E2E自体の最終実行結果は 133 total / 117 passed / 16 skipped / 0 failed である。実pushでの親環境確認のみ外部確認待ちとする。

## やらないこと

- hooks を無効化しない。
- hook の bypass や Husky 無効化を使わない。
- 全テストを無条件に削除しない。
- ブラウザ回帰テストを黙って削除しない。
- セキュリティチェックを品質ゲートから無断で除外しない。
- `reuseExistingServer`、E2E、CI の全量検証を速度だけを理由に変更しない。

## 計測計画

変更前後で同じ環境・同じ代表変更・同じ cache 状態を使い、各コマンドの wall time、CPU 使用量、テスト件数、cache hit/miss、終了コードを記録する。速度の比較表と検証維持の表を分け、速度短縮を失敗検出率の低下で相殺しないことを確認する。変更カテゴリは少なくとも docs/assets、単一 TS/TSX、共有 utility、component、loader/server、test、Vitest/Playwright config、build/Next config、OpenSpec とする。pre-commit、pre-push、full、現行 CI 相当を複数回測定し、並列実行時は個別時間と全体 wall time を分ける。E2E は project 別件数、server 起動時間、clean 時間、再利用の有無も記録する。

検出率は変更カテゴリごとに、既知の回帰ケース（既存の失敗回帰テストを意図的に壊した再現ブランチ）または故障注入（型エラー、lint エラー、unit/component/integration、build、E2E、security の代表的な失敗）を用意する。各プロファイルを同じ注入に対して実行し、検出・非検出・fallback・CI での検出を記録する。故障注入は作業ツリーへ残さず、復元可能な一時変更として扱う。

成功基準は、既存の失敗検出対象を維持し、不要な実行と重複を説明可能な形で減らせること。速度目標（秒、短縮率、許容ばらつき）はベースライン計測後に合意する。速度だけでなく、変更カテゴリ別の検出率低下がないことを必須条件とする。

## OpenSpec 同期

hook 実行アーキテクチャ変更に伴い、`openspec/specs/nextjstest/spec.md` の Data Sources / Data Flow / Component Tree / Requirements を同期済みである。`openspec/config.yaml` のルールに従い、R-Hooks-1〜4 と Test Requirements の WHEN/THEN シナリオを追加済みである。`openspec/config.yaml` 自体は未変更である。

## 検証ゲート（2026-09-15 最終判定）

このチェック欄は、個別コマンドの実行済み結果と、親環境でのみ確認できる外部条件を分けて示す。実行済みゲートの結果は冒頭の「現行監査証跡」に記録した。CI workflowの親環境実行、production secretを用いる検証、実pushは外部確認待ちである。

- [x] lint（Oxlint/Oxfmt を含む）
- [x] type-check（tsgo）
- [x] unit/component テスト
- [x] integration テスト
- [ ] production テスト（production secret/networkを用いる外部確認待ち）
- [x] build-parity テスト
- [x] build
- [x] E2E（133 total / 117 passed / 16 skipped / 0 failed）
- [x] 必要な security / accessibility 検証
- [x] OpenSpec の参照・WHEN/THEN シナリオ同期（R-Hooks-1〜4、Test Requirements）
- [x] hook の成功・失敗・fallback・明示的 full の smoke-test

外部確認待ち: CI workflowの親環境実行、production secretを用いる `test:prod`、実push refの確認。

テストの実装と実行は分離し、テスト実装は fixer、実行・検証ゲートは Orchestrator が担当する。未実行のゲートは完了扱いにしない。cache miss、故障注入などの未実施の追加検証は別途明記した未確定事項であり、上記の最終受入判定に含めない。

## 完了条件

- [x] pre-commit / pre-push の実行経路と失敗時挙動が共通ルールとして明確になっている。
- [x] command failure が伝播し、中断時の cleanup が行われ、利用者向けのフック回避案内が除去されている。
- [x] fast、changed、full、CI の責務とコマンドが文書化されている。
- [x] 変更影響に応じた pre-push の最低限ゲート、明示的 full、現行 CI 範囲が残っている。完全 full CI への拡張は外部確認待ちとして分離されている。
- [x] Vitest と Playwright の重複・責務・選択条件が監査済みである。
- [x] build、E2E server、clean の二重起動有無が計測済みで、採用方針が記録されている。
- [ ] ベースライン、CPU、wall time、件数、cache、検出率と、合意した速度目標が実測・合意済みとして記録されている（cache miss、故障注入検出率、層別CPU、合意済み速度目標は未取得）。
- [x] 検証ゲートが通過し、外部確認待ち項目と残リスクが明示されている。
- [x] OpenSpec が対象変更と同期している（`openspec/specs/nextjstest/spec.md` を121行追加、`openspec/config.yaml` は未変更）。

## リスクとロールバック

| リスク                                           | 対策                                                                 | ロールバック                                     |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------ |
| changed 選択が関連テストを漏らす                 | 分類不能時の安全側 fallback、検出率計測、現行 CI の全 Vitest         | 直前の全量ゲート script に戻す                   |
| typecheck 条件化で型エラーを見逃す               | TS/TSX、型設定、共有型、依存変更を保守的に扱い、判定不能は全体実行   | pre-commit の常時 tsgo に戻す                    |
| E2E を後段化してブラウザ回帰の発見が遅れる       | E2E 関連変更時の必須化、明示的 full、手動full-validationでの追加実行 | pre-push の clean + 全 E2E に戻す                |
| server 再利用や clean 整理で古い成果物を検証する | `.next` と server lifecycle を計測し、失敗時に明確に停止             | `reuseExistingServer: false` と現行 clean に戻す |
| hook 共通化で終了コードを隠す                    | 成功/失敗/fallback smoke-test とログ確認                             | 共通 helper を外し、現行 hook を復元する         |

段階導入は Phase 0 の計測、Phase 1 の pre-commit、Phase 2 の pre-push 変更、Phase 3 のテスト整理の順とし、各段階で検証ゲートと監査記録を更新する。

## 監査履歴

| 日付       | 内容                                                                                                                                                 | 結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 担当                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-14 | 現行 hook、scripts、Vitest、Playwright、CI の調査済み事実を計画へ反映                                                                                | 計画作成、実装未着手                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 作成: Codex / レビュー: Newton                                                                                                                               |
| 2026-09-15 | Phase 0-1（当時の調査時点）: hook/package scripts/CI/lint-staged の呼び出し元、順序、失敗伝播、重複、CI差分を同一表で棚卸し                          | 実ファイル確認済み。pre-push は origin/main...HEAD 固定、CI は type-check → lint:fast → test:all → build、E2E 等は CI 外と記録。現行workflowでは更新済み                                                                                                                                                                                                                                                                                                                                    | 実装: Codex                                                                                                                                                  |
| 2026-09-15 | Phase 0-2（当時の調査時点）: warm cache の pre-commit、pre-push、full 追加対象、現行 CI 相当を `/usr/bin/time -v` で反復計測                         | test:all は 57 files / 506 tests、pre-push は test/build 成功後 E2E clean で code 1、CI 相当は 2 回 code 0。E2E 実行、cache miss、prod、security、故障注入は環境依存または未実施理由を記録。現行最終監査とは別の過去ベースライン                                                                                                                                                                                                                                                            | 実装・計測: Codex                                                                                                                                            |
| 2026-09-15 | Phase 0-2 監査追補: full 列の到達範囲、docs/assets・utility・component・loader/server・test・config/build・OpenSpec の代表実測、故障注入検出表を追加 | full は build-parity まで code 0、security の EAI_AGAIN で code 130、E2E 未到達。代表カテゴリの wall/CPU/件数を実測し、cache miss・staged TS/TSX・故障注入は未実施理由と再現条件を明記。hook/package/CI は未変更。OpenSpec は後続のhook実行アーキテクチャ変更に伴い同期済み                                                                                                                                                                                                                 | 実装・計測: Codex                                                                                                                                            |
| 2026-09-15 | Phase 0 の受入条件と次Phase条件、変更カテゴリ別の故障注入計画を追記                                                                                  | Phase 0 の実装変更なし。hook/package/CI は未変更。OpenSpec は後続のhook実行アーキテクチャ変更に伴い R-Hooks-1〜4 と Test Requirements の WHEN/THEN 要件を同期済み。速度目標・検出率は未確定のまま次Phase条件化                                                                                                                                                                                                                                                                              | 実装: Codex                                                                                                                                                  |
| 2026-09-15 | Phase 1（1-1/1-2/1-3）実装                                                                                                                           | `.husky/lib/hook-common.sh` を追加し、pre-commit の staged typecheck 判定、pre-push の明示的ゲート・安全な並列回収・限定 cleanup、lint-staged の commit-only 0件契約を反映。テスト、故障注入、実 push、lint/type-check、staged 分岐の実行検証は未実施。監査待ち                                                                                                                                                                                                                             | 実装: Codex                                                                                                                                                  |
| 2026-09-15 | Phase 2（2-1〜2-4）実装                                                                                                                              | push stdin の全ref和集合分類、ref/oid・初回/shallow・rename/delete・分類不能のfull fallback、changed integration + build、明示的full、E2E必須条件、production別枠、build→build-parity順を実装。テスト・実push・故障注入・各検証ゲートは未実施。Phase 2チェックは監査前のため未完了                                                                                                                                                                                                          | 実装: Codex                                                                                                                                                  |
| 2026-09-15 | Phase 2監査指摘の修正                                                                                                                                | 明示的full、`test:full`、および changedでrelatedを実行した場合の related 0件・JSON判定不能・related失敗時の fallback を `lint:fast` → `type-check` → `test:all` → build → build-parity → security → E2E に統一し、productionを除外。fallback理由を表示し、全量経路を一度だけ実行して各ゲートの失敗を伝播。テスト、lint、type-check、実push、hook smoke-test等は未実行。Phase 2チェックは未完了のまま維持                                                                                    | 実装: Codex                                                                                                                                                  |
| 2026-09-15 | 最終監査の安全性修正                                                                                                                                 | changedはdocs/assets-onlyを含めてrelated（該当時）→build→全E2E（clean→test）を実行し、E2E失敗でpush停止。`PUSH_IMPACT_E2E` の分類依存を廃止し、related fallback後のfullと通常changedのbuild/E2E重複を防止。分類・E2E検出率、各実行ゲートは未検証。Phase 3の[x]表示は実装済み・監査/実行検証待ちと明記し、未完了条件と未実行ゲートを維持                                                                                                                                                     | 実装: Codex                                                                                                                                                  |
| 2026-09-15 | Phase 2-1 related候補の安全選別追補                                                                                                                  | `.husky/lib/push-impact.sh` に `PUSH_IMPACT_RELATED_PATHS` を追加し、pre-pushのVitest relatedへsource/server/tests候補だけを渡す。空・選別不能・コマンド不整合はfull fallback。隔離fixtureテストと実装/監査状態の分離を追記。テスト実行、実push、shallow、外部環境full検証は未実施                                                                                                                                                                                                          | 実装: Codex                                                                                                                                                  |
| 2026-09-15 | 受入実行証跡の追補                                                                                                                                   | `bash -n .husky/*`、`git diff --check`、targeted hook suite（3 files / 45 tests）、lint:fast、type-check、test:all（59 files / 546 tests）、build（Next 16.3.1 webpack）、build-parity（1 file / 3 tests）、E2E（117 passed / 16 skipped / 0 failed、4 projects）が成功。security-check は依存脆弱性14件で失敗し、test:prod は PROD_URL 未設定で3 tests skipped + explicit error。Phase 1/2-1の受入テスト実行済みと、Phase 2-2〜2-4/3および全体監査の未完了を分離                           | 実行証跡更新: Codex                                                                                                                                          |
| 2026-09-15 | 最終監査・受入判定                                                                                                                                   | install（frozen lockfile、vendor SHA512）、audit 0 vulnerabilities、security-check、lint:fast、type-check、test:all（59 files / 546 tests）、build（Next 16.3.5）、build-parity（1 file / 3 tests）、targeted hook（45 passed）、hook smoke、cache E2E（default / JSON argv server artifact）、E2E（133 total / 117 passed / 16 skipped / 0 failed）、CI workflow、xlsx vendor archive integrity、OpenSpec/Docs同期を確認                                                                   | ローカル実装・監査・受入完了。CI workflowの親環境実行、production secretを用いる検証、実pushは外部確認待ち                                                   | 最終監査: Codex |
| 2026-09-15 | 隔離契約監査 `audit:validation-detection`                                                                                                            | schema `nextjstest.validation-detection v1.0.0`、classification 12 cases、precision/recall/accuracy=1、full gate failure detection rate=1（lint/type-check/unit/build/build-parity/security/e2eの各注入で失敗gateまで実行・後続停止・push marker無し）、changed E2E detection rate=1（failure時非0・marker無し、success時marker有り）、実行順 `related → build → e2e`、fixture cleanup=`completed`。artifactは共有repoに置かず `/tmp/plan31-validation-detection.json` の実行証跡として記録 | 隔離契約監査済み。実アプリの実lint/type/build/browser故障検出率、実push、CI、productionは外部確認待ち。CPU、速度目標、Playwright project別時間は未取得のまま | 監査: Codex     |
