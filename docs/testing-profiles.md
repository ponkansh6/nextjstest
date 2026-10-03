# テスト責務と実行プロファイル

## Husky hook launchers

Huskyの生成ランチャーはhook本体を `sh -e` で起動する。エントリポイントは
POSIX互換の薄いwrapperとし、`.husky/pre-commit` は
`.husky/pre-commit.bash`、`.husky/pre-push` は `.husky/pre-push.bash` を
`exec bash -e` で起動し、引数を透過する。Bash専用構文と共通lib参照は
`.bash`実体に置き、生成物 `.husky/_/*` は編集しない。

失敗したcommitの原因は、Bash専用構文を含む旧hook本体がHuskyの `sh -e`
経由で解釈され、実際のGit commitで失敗したことだった。この構成では
POSIX wrapperからBash実体を確実に起動し、既存の検証gateと終了コードを
維持する。

この文書は、現在の実ファイルに基づくテストの選択契約を記録する。件数は、既存の計測記録があるものだけを記載し、未実行の値は推測しない。

## Vitestの責務

通常の `vitest.config.ts` は `configDefaults.exclude` に加えて、`tests/production/**`、`tests/build/**`、`tests/e2e/**` を除外する。したがって `pnpm test` と `pnpm test:all` は、ローカルのコード・データ処理・UIコンポーネントのテストを対象にし、ネットワーク、Nextのビルド成果物、ブラウザ実行を成功条件に含めない。

| 層           | 実ファイル上の選択                                                                                                       | 契約                                                                                                                                                   | 主な実行方法                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| unit         | `tests/unit/**`、`tests/computation-contract/**`、`tests/data-mapping/**`、`tests/data-quality/**`、`tests/server/**` 等 | 純粋計算、状態、loader/server境界、データ契約をVitest環境で検証する。ブラウザや商用URLは要求しない                                                     | `pnpm test:all`（通常設定）または変更対象に対する `vitest related` |
| component    | `tests/components/**`                                                                                                    | Reactコンポーネントの描画、interaction、表示契約をテスト環境で検証する。実ブラウザのlayout・navigation・本番serverは契約外                             | `pnpm test:all` または `vitest related`                            |
| integration  | `tests/integration/**`、通常設定に含まれるserver/data境界テスト                                                          | 複数モジュール間のデータ変換・出力契約を検証する。Next build生成物・商用ネットワークは契約外                                                           | `pnpm test:all` または changed profileのrelated選択                |
| production   | `tests/production/**`                                                                                                    | `PROD_URL` に対して実デプロイ済みFlight payloadを取得し、デプロイ構造・商用データを検証する。未設定URLは明示的失敗であり、通常Vitestの成功には含めない | `PROD_URL=https://... pnpm test:prod`                              |
| build-parity | `tests/build/**`                                                                                                         | 先に `pnpm build` で生成した `.next` のRSC payloadとVitest側のデータ経路を比較する。build成果物がなければ明示的失敗                                    | `pnpm build && pnpm test:build-parity`                             |

production/build-parityは通常Vitestから除外され、`tests/vitest.integration.config.ts` の専用includeと `environment: "node"` で実行される。これは同じloader契約を常時二重実行するためではなく、外部デプロイまたは生成済みbuildという追加前提を持つ別契約として選択実行するためである。テストファイルの削除・移動は行わない。

### 選択条件と重複しない契約

- `fast`: pre-commitのOxfmt/Oxlintと、staged TS/TSXからVitest relatedを選ぶ局所フィードバック。pre-commitのtsgoは、staged type boundary変更時だけ実行する `pnpm exec tsgo --noEmit` であり、package scriptの `type-check:fast` と混同しない。relatedが0件でも、commit用の `--passWithNoTests` 契約では成功とする。全量保証ではない。
- `changed`: pre-pushはpush差分を分類する。related入力がある場合はVitest relatedを実行し、成功してテストファイルが選ばれたら1件のcomponent Browser Mode、build、selected routeのbuilt Chromium suite（6 cases）を実行する。docs/assets-onlyではrelated integrationだけをskipし、component Browser Mode、build、route suiteは実行する。related結果が空、JSON不在・不正・判定不能、またはrelated実行失敗ならfull/fallback列へ切り替える。各gateの非0終了でpushを停止する。
- `full` / fallback: pre-pushでは `lint:fast` → `type-check` → `test:coverage` → 1 selected component prepush Browser Mode → `build` → selected route prepush built Chromium suite（6 cases）→ `test:build-parity` → `security-check` の順で実行する。`PREPUSH_PROFILE=full git push` はこのfull列を明示的に選択する。fallback時も同じ2つのselected Browser Modeを一度だけ実行する。full pre-pushはPlaywright/E2E全matrixを実行しない。`pnpm test:full` は別のpackage profileであり、pre-pushのgate列とは区別する。productionは別枠で、full pre-pushの成功はproduction検証済みを意味しない。
- production: `PROD_URL` とネットワークが用意された場合だけ明示実行する。通常Vitest、changed、fullの成功条件に混ぜない。
- build-parity: `build`成功後に専用実行する。通常Vitestで同じbuild payload検証を重複実行しない。

過去の文書化時点のベースラインとして、通常Vitestは57 files・506 tests passed、build-parityは1 file・3 tests passedと記録されている。この57 files・506 testsは現行最終監査の59 files・546 testsとは別の過去値であり、現行の判定にはPlanの最終監査証跡を用いる。productionの成功件数、full完走件数、未計測の層別件数はこの記録時点では未実施であり、補間しない。

## Playwrightの4 project

設定は `playwright.config.ts`、テストルートは `tests/e2e` である。1回のPlaywright実行で設定全体の `webServer` を共有する。`dependencies` は設定されていないため、project間の依存関係・実行順がないことを意味し、projectごとにwebServerを独立起動するという意味ではない。既存記録の `playwright --list` は133 tests（chromium 84、chromium-dark 2、mobile-pixel 38、webkit-tabs-regression 9）だが、Phase 3では再計測していない。

| project                  | path/tag選択                                                                                                                                 | 固有責務と重複契約                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chromium`               | Desktop Chrome。`mobile-ux`、`consumption-mobile-readability`、`consumption-mobile-acceptance`、`plan27-private-consumption`をignore         | 主E2Eスイート。Desktop Chromiumで共通UI・route・interactionを検証する。mobile固有、dark tag、WebKit tabs回帰は担当しない                                    |
| `chromium-dark`          | `testMatch: /accessibility\.e2e\.spec\.ts/` かつ `grep: /@dark/`、Desktop Chrome + `colorScheme: dark`                                       | accessibility内の `@dark` ケースだけを担当する。darkでない共通ケースをchromiumと重複実行しない。ファイル内のskipされたdark describeは、実行済みとは数えない |
| `mobile-pixel`           | `mobile-ux`、`tooltip-dismiss`、`consumption-mobile-readability`、`consumption-mobile-acceptance`、`plan27-private-consumption`のみ、Pixel 7 | モバイルviewport/touch/readability固有ケースを担当する。Desktop専用の`consumption-boundary`や共通ロジックの全量重複は含めない                               |
| `webkit-tabs-regression` | `section-tabs-scroll.e2e.spec.ts`のみ、iPhone 13                                                                                             | WebKit固有のタブ押下とscroll競合回帰を担当する。browser固有ケースをchromiumへ移したり削除したりしない                                                       |

全project共通の契約は `fullyParallel: false`、`workers: 3`、Playwright test timeout `60_000`、`reporter: [["list"], ["html", { open: "on-failure" }]]`、`use.trace: "on-first-retry"`、CI時retry 2（local 0）、`webServer.reuseExistingServer: false` である。webServer timeoutは `90_000`。HTML reportは失敗時に開き、traceは最初のretryで取得する。webServerは `pnpm start --port ... --hostname 127.0.0.1`、base URLは `E2E_PORT`（既定3100）から構成される。`test:e2e:clean` は別scriptであり、Playwrightのproject dependencyではない。

ブラウザ実行そのもの、project別の再計測、server起動時間、clean時間は未実施である。既存の`--list`件数だけを実測記録として扱う。過去の隔離監査ハーネスのfailure検出結果はhook停止契約の検証であり、Playwright全matrixや実アプリのブラウザ故障検出率を示さない。

## scriptsとプロファイル

命名は `fast`＝局所、`changed`＝差分影響、`full`＝明示的全量とする。既存scriptの互換性を維持し、未知のscript名はpnpmの「script not found」で失敗するため成功扱いしない。

| profile        | script/入口                                      | 実行範囲                                                                                                                                                                                                        | 失敗時挙動                                                     |
| -------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| fast           | `lint:fast`、条件付きpre-commit tsgo、pre-commit | Oxlint、条件を満たすときの `pnpm exec tsgo --noEmit`、staged formatter/related。packageの `type-check:fast` は別名のscriptとして混同しない。CIの全量型検査とは異なる                                            | 呼び出し元へ非0を返しcommitを停止                              |
| changed        | pre-push既定（`PREPUSH_PROFILE`未指定）          | related入力があればVitest related、1 selected component Browser Mode、build、selected route built Chromium suite（6 cases）。docs/assets-onlyはrelated integrationだけをskipし、Browser Mode 2種とbuildは実行。 | relatedの判定不能/失敗/0件はfull fallback。各gate非0でpush停止 |
| full           | `PREPUSH_PROFILE=full git push`                  | `lint:fast`、`type-check`、coverage、1 selected component Browser Mode、build、selected route built Chromium suite（6 cases）、build-parity、security。Playwright/E2E full matrixは含まない                     | `hook_gate`が非0を伝播してpushを停止                           |
| production別枠 | `PROD_URL=... pnpm test:prod`                    | 実商用URLのpayloadだけ                                                                                                                                                                                          | URL/ネットワーク不備を明示的失敗。full成功へ読み替えない       |

`test` と `test:all`、`test:e2e`、`test:e2e:dark`、`test:e2e:clean`、`test:build-parity`、`test:prod` など既存scriptは変更していない。`test:full`の列にproductionは含まれない。

### cache/E2E計測

`pnpm run measure:cache-e2e` は、既存の `maybeCache` と `clearTestCache` をテスト用fixtureから呼び、cold → warm → clear後の再実行について、loader呼び出し回数、各wall time、hit/miss状態をJSON artifactへ保存する。本番runtime cacheは変更しない。既定の出力先は `artifacts/cache-and-e2e-measurement.json` で、`--output <file>` はリポジトリroot配下またはOSの一時ディレクトリ配下だけを受け付ける。全オプションは `pnpm run measure:cache-e2e -- --help`（または `node scripts/measure-cache-and-e2e.mjs --help`）で確認できる。

`.next` が存在する場合は、隔離した一時ポートで `pnpm start` を管理対象のプロセスグループとして起動し、server起動時間、server/test process とその子孫のPID・port残留、SIGTERMから必要時のSIGKILLまでのcleanup時間を記録する。通常終了、例外、SIGINT/SIGTERMのいずれでも両グループと一時領域をcleanupし、signal終了時もcleanup後にartifactを保存して非0終了する。`.next` の存在、mtime、24時間超の stale 判定も記録するが、削除はしない。実E2Eを必須にせず、必要な場合だけargvをJSON配列で `--e2e-command '["pnpm","exec","playwright","test","tests/e2e/foo.e2e.spec.ts"]'` のように指定する（shell実行はしない）。全処理は `/tmp` の一時領域と終了時cleanupを使い、無関係なPIDを探索・終了しない。

## CIとの差分、再実行、未保証範囲

### vendor integrity

`vendor/xlsx-0.20.3.tgz` は、リポジトリ内の `.sha512` manifest と Node標準 `crypto` の SHA512計算で `preinstall` 中に検証する。archive または checksum file が欠落した場合、manifest が不正な場合、または digest が一致しない場合は非0で install を停止する。検証処理は既存の pnpm 強制 `preinstall` と連結され、既存の lifecycle 動作を置き換えない。

### pre-push hook smoke-test

`pnpm run test:hook-smoke` は、`/tmp` 配下に一時bare remoteとwork repoを作り、fixtureの`.git/hooks/pre-push`へ既存hookを正規配置したうえで、実際の`git push`を行う。fixture内の`pnpm`だけをstub化するため、hookのstdin/ref解析、通常push、複数ref、初回push、remote削除、hook失敗時のremote未更新、`PREPUSH_PROFILE=full`のgate列を検証し、アプリ本体のlint/build/Browser Modeは実行しない。full列で確認するブラウザ選択は1 componentと1 routeの6 Chromium casesであり、Playwright/E2E full matrixは実行しない。終了時は`trap`相当の`finally`で一時領域を削除し、fixtureまたはhookが失敗した場合は非0で終了する。これはhook経路とGitの更新原子性のsmoke-testであり、実アプリの各gateの内容、CI、production、選択外のブラウザ/E2Eケースの成功を保証しない。

`.github/workflows/main.yml` の通常CIは install後に全依存の `pnpm audit --audit-level=high` → `pnpm exec secretlint "**/*"` → `pnpm type-check` → `pnpm lint:fast` → `pnpm test:all` → `pnpm build` を順に実行する。このジョブはpush/pull_requestで維持される。各stepの非0でjobが失敗し、後続stepは実行されない。auditとsecretlintはrequired stepとして可視化され、`continue-on-error`で隠さない。

### workflow_dispatch の full-validation

重い検証は通常のpush/pull_requestでは発火せず、Actionsから `workflow_dispatch` を手動実行した場合だけ `full-validation` jobで実行する。jobには `contents: read` のみを与え、ビルド後に `test:build-parity`、`security-check`、`test:e2e:clean && test:e2e` を実行する。build parityは先行する `pnpm build` の成果物を使う。各コマンドstepのwall timeは `GITHUB_STEP_SUMMARY` に追記し、pnpmキャッシュのhit/missもsummaryへ記録する。

`run_production` inputをtrueにした時だけproduction検証を追加する。production検証は前段のbuild、build-parity、security、E2Eの成否にかかわらず、`always()` で独立stepとして試行される。inputをfalseにしている間はsecretがあってもproductionへ接続しない。この場合はリポジトリsecret `PROD_URL` と外部ネットワークが必須で、secretが未設定なら明示的に失敗する。`PROD_URL` はproduction stepのenvにだけ渡す。Playwrightのreport/test-resultsと、存在する `artifacts/` の計測ファイルはworkflow artifactとして保存する。

`security-check` は `pnpm audit --audit-level=high` とsecretlintを含み、依存脆弱性やsecret検出で失敗し得る。失敗を `continue-on-error` で隠さず、full-validationの失敗として扱う。productionの成功はfull-validation全体の成功とは別に確認し、外部URL・secretの取り扱いと実行時間に注意する。

ローカルで明示的fullを再実行する場合は `pnpm test:full`、pre-pushのfullは `PREPUSH_PROFILE=full git push` を使う。E2E単独は `pnpm run test:e2e:clean && pnpm run test:e2e`、productionは `PROD_URL=... pnpm run test:prod`、build parityは `pnpm run build && pnpm run test:build-parity` とする。失敗原因を直して同じprofileを再実行し、`security-check`のネットワーク失敗やE2E server起動失敗を成功と読み替えない。

通常CIとfull-validationの範囲・発火条件は異なる。full-validationは手動実行のため、必要な時だけ実行し、E2Eのブラウザ依存、security-checkの監査ネットワーク、productionのsecret・外部ネットワーク・外部サービスの状態を確認して再実行する。production stepは前段失敗時にも試行されるが、productionの成否はfull-validation全体の成否とは別に記録する。

## 未実施計測

未取得の項目は、CPU、テスト件数の層別/project別内訳、Playwright project別実行時間、CI実環境値である。隔離契約監査の分類・gate停止検出は実測済みだが、これは実アプリの故障検出率を示さない。pre-pushで実行するBrowser Modeはselected component 1件とselected routeのChromium 6 casesに限られ、Playwright/E2E full matrixはpre-pushの保証範囲外である。cache hit/miss、server起動時間、clean時間は `measure:cache-e2e` のartifactで個別実行時に取得する。なお、「Phase 3は監査前の文書化」「この変更ではテスト、lint、type-check、build、E2E、production、build-parity、security、hook smoke-testを実行していない」は過去の文書化時点の記録である。現行最終監査の結果はPlanの証跡（通常テスト59 files・546 tests）を参照し、この過去記録を現行未実施判定として扱わない。production/network/CI待ちは別枠の未確認条件として残る。

## 隔離監査ハーネス

`pnpm run audit:validation-detection` は、`.husky/lib/push-impact.sh` を OS temporary 配下の一時 Git repositoryへ通し、代表パスの分類、full gateの停止・終了コード、changed実行列とpush marker契約を監査する。過去の監査記録にある `related → build → e2e` は当時のharness契約であり、現行pre-pushで全E2Eが実行される証拠ではない。`--output` は repository root または OS temporary 配下だけを受け付け、既定 artifact も OS temporary 配下に作成する。fixture は `mkdtemp` で作成し、終了時に削除するため、共有 worktree、Git index、`.next`、既存 PID、共有 remote は変更・削除しない。

出力 JSON には schema/version、全ケース数、分類 precision/recall/accuracy、gate failure detection rate、各ケースの実行 gate、fixture cleanup status を含める。これは隔離した停止・終了コード契約の監査であり、実アプリの lint/type-check/build/browser 故障そのものの検出率やPlaywright全matrixの実行を証明しない。実行証跡は共有repoへ配置せず、指定した `/tmp/plan31-validation-detection.json` に保存する。2026-09-15の監査では schema `nextjstest.validation-detection v1.0.0`、12 cases、classification precision/recall/accuracy=1、full gate failure detection rate=1、当時定義されたchanged marker契約のdetection rate=1、fixture cleanup=`completed` だった。この過去の監査値を現行pre-pushのブラウザsuite全体に対する検出率として扱わない。現行hookの選択範囲はselected component 1件とselected routeのChromium 6 casesであり、Playwright/E2E full matrixはpre-pushの保証範囲外である。実lint/type/build/browser故障検出率、実push、CI、productionの確認は別途必要である。

| 実施日時   | artifact                                                        | 分類 precision/recall/accuracy |                               gate failure detection rate |                         当時のchanged marker検出率 | fixture cleanup | 実環境検証                                                                                    |
| ---------- | --------------------------------------------------------------- | -----------------------------: | --------------------------------------------------------: | -------------------------------------------------: | --------------- | --------------------------------------------------------------------------------------------- |
| 2026-09-15 | `/tmp/plan31-validation-detection.json`（共有repo外の実行証跡） |          1 / 1 / 1（12 cases） | 1（lint/type-check/unit/build/build-parity/security/e2e） | 1（failure時非0・marker無し、success時marker有り） | completed       | 未確認（実アプリの実lint/type/build/browser故障検出率、実push、CI、productionは外部確認待ち） |
