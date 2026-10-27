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

通常の `vitest.config.ts` は `configDefaults.exclude` に加えて、`tests/production/**` と `tests/build/**` を除外する。したがって `pnpm test` と `pnpm test:all` は、ローカルのコード・データ処理・UIコンポーネントのテストを対象にし、ネットワーク、Nextのビルド成果物、ブラウザ実行を成功条件に含めない。

| 層           | 実ファイル上の選択                                                                                                       | 契約                                                                                                                                                   | 主な実行方法                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| unit         | `tests/unit/**`、`tests/computation-contract/**`、`tests/data-mapping/**`、`tests/data-quality/**`、`tests/server/**` 等 | 純粋計算、状態、loader/server境界、データ契約をVitest環境で検証する。ブラウザや商用URLは要求しない                                                     | `pnpm test:all`（通常設定）または変更対象に対する `vitest related` |
| component    | `tests/components/**`                                                                                                    | Reactコンポーネントの描画、interaction、表示契約をテスト環境で検証する。実ブラウザのlayout・navigation・本番serverは契約外                             | `pnpm test:all` または `vitest related`                            |
| integration  | `tests/integration/**`、通常設定に含まれるserver/data境界テスト                                                          | 複数モジュール間のデータ変換・出力契約を検証する。Next build生成物・商用ネットワークは契約外                                                           | `pnpm test:all` または changed profileのrelated選択                |
| production   | `tests/production/**`                                                                                                    | `PROD_URL` に対して実デプロイ済みFlight payloadを取得し、デプロイ構造・商用データを検証する。未設定URLは明示的失敗であり、通常Vitestの成功には含めない | `PROD_URL=https://... pnpm test:prod`                              |
| build-parity | `tests/build/**`                                                                                                         | 先に `pnpm build` で生成した `.next` のRSC payloadとVitest側のデータ経路を比較する。build成果物がなければ明示的失敗                                    | `pnpm build && pnpm test:build-parity`                             |

production/build-parityは通常Vitestから除外され、`tests/vitest.integration.config.ts` の専用includeと `environment: "node"` で実行される。これは同じloader契約を常時二重実行するためではなく、外部デプロイまたは生成済みbuildという追加前提を持つ別契約として選択実行するためである。テストファイルの削除・移動は行わない。

### Coverage-only test collection

`pnpm run test:coverage` だけは、カバレッジ対象ソースへin-processで到達できないと監査されたtest harness/tooling suiteを、Vitest CLIの反復可能な `--exclude` optionでtest collectionから外します。対象は `tests/components/minimal.test.tsx`、`tests/data-quality/cti-source-artifacts.test.ts`、`tests/scripts/data-refresh/**`、`tests/scripts/plan39/**`、`tests/unit/browser-mode-report-*.test.ts`、`tests/unit/browser-selection-validation.test.ts`、`tests/unit/browser-test-*.test.ts`、`tests/unit/chromium-provider-persistent-server.test.ts`、`tests/unit/csv-parser.test.ts`、`tests/unit/husky-*.test.ts`、`tests/unit/isolated-route-context.test.ts`、`tests/unit/jev-*.test.ts`、`tests/unit/legend-toggle-logic.test.ts`、`tests/unit/math/dependency-boundary.test.ts`、`tests/unit/mobile-css-contract.test.ts`、`tests/unit/next-route-poc-runner.test.ts`、`tests/unit/palette.test.ts`、`tests/unit/prepush-*.test.ts` です。

この一覧はtest collectionだけを狭めます。`vitest.config.ts` のsource include、source coverage denominator、100% thresholdsは変えません。通常の `pnpm test` と `pnpm test:all` は従来どおり全test discoveryを使います。

除外反映後の計測では、`test:coverage` は94 files、1,167 passed / 1 skippedで、statements・branches・functions・linesの全指標が100%でした。Vitest Durationは49.40s、コマンドwall timeは50.41sです。除外前の127 files / 1,503 passed / 1 skipped / 約140sはcommit `3e63315`時点の歴史的結果です。migration commit `11e4760`の127 files / 1,502 passed / 1 skippedとは別runで、その間にcommit `f27c285`がlauncher-timing unit assertionを1件追加しています。33 suites除外前の両結果は現行runの件数・時間として扱いません。

### 選択条件と重複しない契約

- `fast`: pre-commitのOxfmt/Oxlintと、staged TS/TSXからVitest relatedを選ぶ局所フィードバック。pre-commitのtsgoは、staged type boundary変更時だけ実行する `pnpm exec tsgo --noEmit` であり、package scriptの `type-check:fast` と混同しない。relatedが0件でも、commit用の `--passWithNoTests` 契約では成功とする。全量保証ではない。
- `changed`: pre-pushは関連テストを選択し、成功後に `test:browser:all` → `build` → 起動確認をfail-fastで実行する。related選択が空・失敗・不確定の場合はfull validationへ移る。docs/assetsのみのpushはrelatedテストとstatic/unit gatesを省き、同aggregate gate、build、起動確認を実行する。
- `full`: `PREPUSH_PROFILE=full` またはpush impactが不確定な場合は `lint:fast` → `type-check` → `test:coverage` → `test:browser:all` → build → 起動確認 → build-parity → securityをfail-fastで実行する。aggregate gateはstandardとPixel 7の両projectを全件実行し、個別ケース選択やJEV dispatchを使わない。productionは別枠で、pre-push成功はproduction検証済みを意味しない。
- production: `PROD_URL` とネットワークが用意された場合だけ明示実行する。通常Vitest、changed、fullの成功条件に混ぜない。
- build-parity: `build`成功後に専用実行する。通常Vitestで同じbuild payload検証を重複実行しない。

過去の文書化時点のベースラインとして、通常Vitestは57 files・506 tests passed、build-parityは1 file・3 tests passedと記録されている。この57 files・506 testsは現行最終監査の59 files・546 testsとは別の過去値であり、現行の判定にはPlanの最終監査証跡を用いる。productionの成功件数、full完走件数、未計測の層別件数はこの記録時点では未実施であり、補間しない。

## Browser Mode

activeなBrowser Mode test fileは `tests/browser-mode/standard.browser.test.tsx` と
`tests/browser-mode/pixel7.browser.test.tsx` の2つです。Vitest configのinline
projectsはそれぞれ1ファイルだけを選びます。標準条件はChromium 1280×800、
Pixel 7条件はviewport/screen 412×915、DPR 2.625、Pixel 7 UA、mobile/touchです。
両projectはローカルcomponent/page fixtureを描画します。現行manifestはstandard
14件・Pixel 7 22件の計36件です。Pixel 7のgeometry 112/140/79とoverflow
120/127/142は各1回のrenderで検証し、CagrPanelはfocus/Escape/backdrop pairと
result/detail pairの2ケースにまとめています。spending legend、hover、filterも
1つのcomposite caseです。B12 #307とB13 #473/#508/#535の4ケースはsynthetic
pointer interactionを使います。B12 #430のroute navigation caseは削除しました。現行ケースはproduction
route compositionやtrusted physical-touch deliveryを検証しません。standardではnominal
とreal tooltip totalを1 caseで確認します。Browser Modeは `@vitest/browser-playwright`
providerを使います。

## scriptsとプロファイル

命名は `fast`＝局所、`changed`＝差分影響、`full`＝明示的全量とする。既存scriptの互換性を維持し、未知のscript名はpnpmの「script not found」で失敗するため成功扱いしない。

| profile        | script/入口                                      | 実行範囲                                                                                                                                                                                          | 失敗時挙動                                               |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| fast           | `lint:fast`、条件付きpre-commit tsgo、pre-commit | Oxlint、条件を満たすときの `pnpm exec tsgo --noEmit`、staged formatter/related。packageの `type-check:fast` は別名のscriptとして混同しない。CIの全量型検査とは異なる                              | 呼び出し元へ非0を返しcommitを停止                        |
| changed / full | pre-push既定、または `PREPUSH_PROFILE=full`      | changedは関連テスト後に`test:browser:all`、build、readiness確認。docs/assetsは同gate、build、readiness確認。fullはstatic/unit gates、同gate、build/readiness、build-parity、security。fail-fast。 | 非0終了でpushを停止                                      |
| production別枠 | `PROD_URL=... pnpm test:prod`                    | 実商用URLのpayloadだけ                                                                                                                                                                            | URL/ネットワーク不備を明示的失敗。full成功へ読み替えない |

`test` と `test:all`、`test:build-parity`、`test:prod` は維持している。`test:full`の列にproductionは含まれない。

### cache/E2E計測

`pnpm run measure:cache-e2e` は、既存の `maybeCache` と `clearTestCache` をテスト用fixtureから呼び、cold → warm → clear後の再実行について、loader呼び出し回数、各wall time、hit/miss状態をJSON artifactへ保存する。本番runtime cacheは変更しない。既定の出力先は `artifacts/cache-and-e2e-measurement.json` で、`--output <file>` はリポジトリroot配下またはOSの一時ディレクトリ配下だけを受け付ける。全オプションは `pnpm run measure:cache-e2e -- --help`（または `node scripts/measure-cache-and-e2e.mjs --help`）で確認できる。

`.next` が存在する場合の隔離server計測は既存の `measure:cache-e2e` 契約を維持する。
Browser Mode正式入口は `test:browser:standard`、`test:browser:pixel7`、
`test:browser:all` であり、JEVを介したbrowser selectionは行わない。
suite runnerはVitest JSON reportで実行件数、全件成功、skipなしを検証する。
さらに `scripts/browser-mode-case-manifest.mjs` のstandard 14件 / Pixel 7
22件の `fullName` とreportの全caseを完全一致させる。Pixel 7のspending
legend・hover・filter acceptanceは単一のcomposite caseに統合しています。
必要なら
`BROWSER_MODE_REPORT_PATH` でJSON reportをrepositoryまたはOS temporary
directory内に保持できる。
Pixel 7 Browser Modeはローカルfixtureを使い、Next serverを起動しません。
pre-pushはBrowser Modeの後にbuildし、`127.0.0.1:3001` でNext serverの起動と
readinessだけを確認します。startup checkではrouteやbrowser interactionを実行しません。
Gitが実際の `.husky/pre-push` launcherを呼ぶ際、呼び出し元が
`PREPUSH_TIMING_FILE` を指定していなければ、launcherは `${TMPDIR:-/tmp}` に
uniqueなTSV timing reportを作成します。完了後にreport pathとgate別/total duration・
exit codeを表示します。`PREPUSH_TIMING_FILE=/path/to/report.tsv` で保存先を上書き
できます。Bash実装を直接呼び出すbenchmark runnerは明示したpathを使用します。
Pixel 7のB12 #307とB13 #473/#508/#535はローカルfixture上のsynthetic pointer
interactionです。B12 #430のroute navigation caseは削除され、現行suiteはproduction
route compositionやtrusted physical-touch deliveryを検証しません。
旧browser JEV selector/runnerとroute selection JSONはinactive legacy資産として
保持され、package scripts、CI、Husky pre-pushからは呼び出されない。

## CIとの差分、再実行、未保証範囲

### vendor integrity

`vendor/xlsx-0.20.3.tgz` は、リポジトリ内の `.sha512` manifest と Node標準 `crypto` の SHA512計算で `preinstall` 中に検証する。archive または checksum file が欠落した場合、manifest が不正な場合、または digest が一致しない場合は非0で install を停止する。検証処理は既存の pnpm 強制 `preinstall` と連結され、既存の lifecycle 動作を置き換えない。

### pre-push hook smoke-test

`pnpm run test:hook-smoke` は、`/tmp` の隔離fixtureでGit hookのstdin/ref解析、通常push、複数ref、初回push、remote削除、失敗時のremote未更新、`PREPUSH_PROFILE=full`のgate順を確認する。fixture内の`pnpm`はstub化するため、アプリ本体のlint/build/Browser Modeは実行しない。これはhook経路のsmoke-testであり、実アプリのgate、CI、productionの成功は保証しない。

`.github/workflows/main.yml` の通常CIはinstall後に全依存の `pnpm audit --audit-level=high` → `pnpm exec secretlint "**/*"` → `pnpm type-check` → `pnpm lint:fast` → `pnpm test:all` → `pnpm run test:browser:all` を順に実行する。browser allはstandardの後にPixel 7を実行し、Next buildは含まない。このジョブはpush/pull_requestで維持される。各stepの非0でjobが失敗し、後続stepは実行されない。auditとsecretlintはrequired stepとして可視化され、`continue-on-error`で隠さない。

### workflow_dispatch の full-validation

重い検証は通常のpush/pull_requestでは発火せず、Actionsから `workflow_dispatch` を手動実行した場合だけ `full-validation` jobで実行する。jobには `contents: read` のみを与え、coverage後に `test:browser:all`、続けてbuild、その成果物を使う `test:build-parity` と `security-check` を実行する。各コマンドstepのwall timeは `GITHUB_STEP_SUMMARY` に追記し、pnpmキャッシュのhit/missもsummaryへ記録する。

`run_production` inputをtrueにした時だけproduction検証を追加する。production検証は前段のbuild、build-parity、securityの成否にかかわらず、`always()` で独立stepとして試行される。inputをfalseにしている間はsecretがあってもproductionへ接続しない。この場合はリポジトリsecret `PROD_URL` と外部ネットワークが必須で、secretが未設定なら明示的に失敗する。`PROD_URL` はproduction stepのenvにだけ渡す。存在する `artifacts/` の計測ファイルはworkflow artifactとして保存する。

`security-check` は `pnpm audit --audit-level=high` とsecretlintを含み、依存脆弱性やsecret検出で失敗し得る。失敗を `continue-on-error` で隠さず、full-validationの失敗として扱う。productionの成功はfull-validation全体の成功とは別に確認し、外部URL・secretの取り扱いと実行時間に注意する。

ローカルで明示的fullを再実行する場合は `pnpm test:full`、pre-pushのfullは `PREPUSH_PROFILE=full git push` を使う。productionは `PROD_URL=... pnpm run test:prod`、build parityは `pnpm run build && pnpm run test:build-parity` とする。失敗原因を直して同じprofileを再実行し、`security-check`のネットワーク失敗を成功と読み替えない。

通常CIとfull-validationの範囲・発火条件は異なる。full-validationは手動実行のため、必要な時だけ実行し、security-checkの監査ネットワーク、productionのsecret・外部ネットワーク・外部サービスの状態を確認して再実行する。production stepは前段失敗時にも試行されるが、productionの成否はfull-validation全体の成否とは別に記録する。

## 未実施計測

未取得の項目はCPU、実測された新Browser Mode件数、CI実環境値である。実装時の検証で実行した範囲と未実行範囲はそのrunの証跡で記録する。production/network/CI待ちは別枠の未確認条件として残る。

## 隔離監査ハーネス

`pnpm run audit:validation-detection` は、`.husky/lib/push-impact.sh` を OS temporary 配下の一時 Git repositoryへ通し、代表パスの分類、full gateの停止・終了コード、changed実行列とpush marker契約を監査する。過去の監査記録にある `related → build → e2e` は当時のharness契約であり、現行pre-pushで全E2Eが実行される証拠ではない。`--output` は repository root または OS temporary 配下だけを受け付け、既定 artifact も OS temporary 配下に作成する。fixture は `mkdtemp` で作成し、終了時に削除するため、共有 worktree、Git index、`.next`、既存 PID、共有 remote は変更・削除しない。

出力 JSON には schema/version、全ケース数、分類 precision/recall/accuracy、gate failure detection rate、各ケースの実行 gate、fixture cleanup status を含める。これは隔離した停止・終了コード契約の監査であり、実アプリの lint/type-check/build/browser 故障そのものの検出率やPlaywright全matrixの実行を証明しない。実行証跡は共有repoへ配置せず、指定した `/tmp/plan31-validation-detection.json` に保存する。2026-09-15の監査では schema `nextjstest.validation-detection v1.0.0`、12 cases、classification precision/recall/accuracy=1、full gate failure detection rate=1、当時定義されたchanged marker契約のdetection rate=1、fixture cleanup=`completed` だった。この過去値は現行pre-pushのBrowser Mode全体に対する検出率を示さない。実lint/type/build/browser故障検出率、実push、CI、productionの確認は別途必要である。

| 実施日時   | artifact                                                        | 分類 precision/recall/accuracy |                               gate failure detection rate |                         当時のchanged marker検出率 | fixture cleanup | 実環境検証                                                                                    |
| ---------- | --------------------------------------------------------------- | -----------------------------: | --------------------------------------------------------: | -------------------------------------------------: | --------------- | --------------------------------------------------------------------------------------------- |
| 2026-09-15 | `/tmp/plan31-validation-detection.json`（共有repo外の実行証跡） |          1 / 1 / 1（12 cases） | 1（lint/type-check/unit/build/build-parity/security/e2e） | 1（failure時非0・marker無し、success時marker有り） | completed       | 未確認（実アプリの実lint/type/build/browser故障検出率、実push、CI、productionは外部確認待ち） |
