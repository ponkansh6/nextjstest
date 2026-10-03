# pre-push を約3分以内に短縮する計画

## 目的と成功条件

目的はpre-pushの開発体験を改善し、通常経路をおおむね180秒以内に近づけること。維持する検証は全テストの検出力同等性ではなく、変更の影響箇所とデグレ懸念に根拠がある部分に絞る。失敗時の非0終了、不明時の安全側fallback、必要な分類安全性は維持する。まず計測環境の負荷に左右されにくい小さなコード確認と1箇所ずつの改善から進める。変更前の全経路baseline、cold/warm反復統計、P95推定は開始条件にしない。改善後、余裕がある環境で代表的な成功runを1回計り、約180秒の達否を記録する。測れなかった経路や目標未達はそのまま明記し、短縮量や完走を推測しない。

## 現行の経路と検証条件

`.husky/pre-push.bash` はまず clean worktree と detached HEAD 到達性を確認する。続いて pre-push stdin に渡された全 ref を `.husky/lib/push-impact.sh` で分類する。`origin/main...HEAD` への固定比較ではなく、push 対象refの差分の和集合を使い、一つでもfull条件に該当すればfullとする。OpenSpec変更、設定・依存・Playwright設定、E2E、生成物、build関連、未知のパス、削除・rename、新規ref、remote削除、shallow clone、ref/diff解決失敗はfull条件である。source/test関連入力があるのに候補が空/不正、または関連テスト選択に失敗した場合もfullに倒す。docs/assets-onlyのように関連入力がない変更はrelatedをskipしてcomponent browser smoke、build、built routeを実行する。変更なし/分類結果なしはfullとする。`PREPUSH_PROFILE=changed|full` を受け付け、未対応値はfullとして扱う。

changed profile は、source/test関連入力がある場合に `pnpm exec vitest related --run --passWithNoTests ...` を走らせる。関連テストの失敗、Vitest JSONの `testResults=0`、JSON結果の不正など選択が不確かな場合はfull fallbackとなる。正常に関連テストが選べた場合は `pnpm run test:browser:prepush:component` を実行する。関連入力がない変更ではrelatedをskipし、component browser smokeを実行する。その後、`pnpm run build` と `pnpm run test:browser:next-route-poc:prepush:built` を順に実行する。共有build成果物がroute検証に必要なため、この順序は維持する。

full profile は以下をすべて実行し、各ゲートの失敗をpush失敗として伝播する。pre-push fullのBrowser Mode選択は `prepush-browser` であり、E2E全体ではない。

1. `pnpm run lint:fast`
2. `pnpm run type-check`
3. `pnpm run test:coverage`（`VITEST_MAX_WORKERS=2`）
4. 現在は `pnpm run test:browser:prepush:component`（選択case: `BottomSheet-focus.browser.test.tsx`）。`test:browser:component:all` は全件用コマンドとして残るが、pre-push fullでは使わない。
5. `pnpm run build`
6. 現在は `pnpm run test:browser:next-route-poc:prepush:built`（Chromiumのrisk selection 6件）。`test:browser:next-route-poc:built:all` は全件用コマンドとして残るが、pre-push fullでは使わない。
7. `pnpm run test:build-parity`
8. `pnpm run security-check`（high以上のauditとsecretlint）

production検証はPROD_URL/networkの確立が別途必要なためhookの外である。pre-pushに `test:e2e` / `test:e2e:clean` は含まれない。

### Browser Modeで残すリスク検証

fullはunit/type/lint/build/parity/securityなど幅広いゲート群と、デグレ懸念を根拠に選んだBrowser検証を含むprofileとする。Browser全件やWebKit保証をfullの定義にはしない。現行の選択はcomponent 1件 `BottomSheet-focus.browser.test.tsx` と `scripts/prepush-browser-route-selection.json` のChromium 6件。既存テストがあること自体を過去の不具合発生の証拠とはみなさず、既知不具合歴は未確認として扱う。

| リスク                   | 現在選択しているcase                                                                         | 残す理由                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| dialog内のTab focus      | `BottomSheet-focus.browser.test.tsx`: 実ブラウザのTabがdialog内に留まり、wrapしてcloseへ戻る | browserのTab順序とfocus trapのデグレ懸念に直結する。     |
| production chart操作     | `production chart interaction`（custom command）                                             | production build上のチャート操作に関するcase。           |
| lazy tabsとscroll        | `batch5 lazy tabs scroll`                                                                    | 遅延表示とscrollの組み合わせを確認する。                 |
| spending-chart range変更 | `batch4 spending-chart range変更visible bar維持`                                             | range変更後のvisible bar維持を確認する。                 |
| hidden legend後のデータ  | `phase6-b03 hidden legend後chart/table/CSV data保持`                                         | 表示切替後のchart/table/CSV間データ保持を確認する。      |
| outside-heading touch    | `phase6-b13 outside-heading touch stacked chart cursor/active dots解除`                      | touch後にcursorとactive dotsが解除される挙動を確認する。 |
| keyboard legend focus    | `phase6-b14 keyboard Tab legend focus outline`                                               | Tab移動後のlegend focus表示を確認する。                  |

テスト名とその責務を、変更箇所・既知不具合情報（現在は未確認）・ブラウザ固有挙動に照らして1件ずつ選ぶ。削ったcase全件を逐次調査せず、全件をCIへ移して同等実行・同等検出力を証明することも要求しない。変更対象にWebKit固有挙動の具体的懸念がある場合は、その根拠に応じて該当testを1〜数件だけ別実行または追加する。WebKit全件の常時実行は要求しない。

通常CI `.github/workflows/main.yml` は `main` へのpushと `main` を対象とするpull requestで起動し、install → `pnpm audit --audit-level=high` → secretlint → `pnpm type-check` → `pnpm lint:fast` → `pnpm test:all` → `pnpm build` → `pnpm test:browser:next-route-poc:built` の順に実行する。coverage、component Browser Mode、build-parity、`security-check` は手動 `full-validation` の追加検証であり、productionは別枠。`test:all` はcoverageと同等ではない。従って現時点で「通常CIがpre-push全体を代替する」とは扱えない。手動CIだけへの移管も通常のpush時保証にはならない。

## 既存の計測値と実行環境の制約

`shared_plan/46-vitest-browser-mode-speedup-plan.md` には、Browser Modeのfull runについて2026-09-28の履歴値がある。2-config full runは約518秒、別のprofile付きfull runは約506秒で、どちらも2 full-run config（Chromium、WebKit）の結果である。test durationの合計はrunner wall timeと異なる計測境界である。これらはpre-push全体や現行changed profileの時間ではなく、pre-push selectionの計測値とも混同しない。既存値は歴史的referenceとしてのみ残し、新しいbaselineの反復統計に混ぜない。

`shared_plan/31-precommit-prepush-test-speedup-plan.md` の2026-09-15 warm計測では、2回の `test:all` が19.14/19.20秒、buildが25.69/26.72秒、旧pre-pushが41.05/41.30秒だった。旧pre-pushはE2E clean段階で終了コード1となった途中終了で、現行hookとは構成も異なるため、現行hookの成功完走baselineには使えない。

現行pre-push全体の完走時間は未測定である。以前開始したbenchmarkは結果を取得できず、成功/失敗・時間とも不明である。機器負荷のため大きな計測matrixを初動や受入条件にしない。既存のhook smoke、選択出力、dry-run、計器は利用できる範囲で読み、実測harnessが未確認でもコード静的確認へ進める。過去値は歴史的参考にとどめ、現行経路のbaseline、短縮量、達成実績には使わない。

## 小さな段階計画

各段階は「1回に1つの成果物・変更」に限定する。現行選択契約を保ち、軽い確認を終えてから必要な実ゲートへ進む。重いゲートを完遂できない場合は成功扱いにせず、変更対象をさらに小さくする。

### 0. 既存の手掛かりを読む

まず既存のdry-run、hook smoke/log、選択出力、計測コードを読む。これらが既に確認済みなら読み直し不要。現状のbenchmark harnessは実測初動の必須条件にしない。

**終了条件:** 既存の選択経路と使える軽量fixtureが分かる。harnessの実動作や性能が未確認でも次へ進める。

### 1. 静的確認で改善候補を1つ見つける

hookと選択manifest/scriptを読み、重複起動、不要な起動、同じ責務を担う選択ケースなど、コード上根拠のある候補を1つだけ特定する。全経路の時間を測らず、Browserと全buildを一括反復しない。候補がコードから分からなければ、任意で単独の軽いゲートを1回観測して候補を探す。観測が機器負荷で難しければ保留し、規模の小さい範囲に絞る。

**終了条件:** 対象箇所、デグレ懸念の根拠、残すcaseとその責務、維持する失敗伝播/安全条件が短く記録されている。候補を確認できなければ推測で削らず、別の小さな対象を探す。

### 2. 対象1箇所を改善して必要な範囲を確認する

候補を1つだけ変更する。例えば重複起動を1つ減らす、または責務が重複する選択ケースを整理する。実際の重複を確認する前に変更内容を決め打ちしない。まず選択caseの存在と失敗終了を既存の軽量fixtureまたは該当する軽量fixture 1〜数件で確認し、その後、根拠に応じて必要な実ゲートを1回だけ可能な範囲で逐次実行する。fixtureがstubしか通らない場合、実経路は未検証と記録する。実ゲートが重く完遂できない場合は対象をさらに小さくするか、検証待ちとして止め、成功扱いしない。

**終了条件:** 変更が狙った1箇所に限られ、影響したゲートの成功/失敗伝播を確認できている。満たせなければ次の改善へ進まない。

### 3. 検証済みの変更だけを積み重ねる

前の変更が必要な検証を通ってから、次の独立した候補に進む。複数の改善をまとめない。source/test入力ありでrelated選択がゼロ、複数refの和集合、削除/rename、unknownなど既存のfull fallback契約を守る。Browser/route選択や分類を変更する場合は、まず安全fixture、次に必要な実ゲートを逐次確認する。既存unit/smoke全体を毎回重ねて実行せず、変更に関係する確認を選ぶ。

**終了条件:** 各変更に対象・軽量確認・必要な実ゲートの結果が対応し、未検証箇所が明記されている。lint/type/test/JEVなど実装時に必要なリポジトリゲートは免除しない。重くて完遂不能な必須ゲートがあれば未完了のままとする。

### 4. 余裕があれば改善後の時間を1回確認する

依存やcacheを再導入せず、他の重い処理を止め、並列計測せずに、変更後の代表的な成功scenarioを1回だけ壁時計で計る。計器が負荷を増やす場合は計器を外して全体時間だけ測るか、測定を見送る。変更前baselineと比較しない。結果にはscenario/profile、exit code、全体時間、約180秒目標の達否だけを記録する。fullを計るなら必要時に1回とし、手動CIの完了をローカルfull成功として扱わない。負荷で中断したrunは成功ではなく、追加測定を強制せず段階2/3の小さな確認へ戻る。

**終了条件:** 実際に完走した場合だけ、その時間とprofileを記録する。未測定経路は未達成/未確認と明記し、3分以内達成や短縮量を推測しない。

### 後回しにする独立案件

CI移管、並列化、cache導入、P95/反復統計、cold/warm matrix、harness拡張は、最初の小さな改善に必要な前提にしない。後で必要性が示された項目を1つずつ別案件として扱う。特に機器スペックの制約がある間は並列実行を初手にしない。CI移管を選ぶ場合は通常CIでの実行範囲とrequired checkの現状を確認する。現状のCI coverageは未確認であり、CI移管もBrowser選択縮小も同じ判断として扱わない。

## ゲート配置表

| 検証/契約                                            | 通常changed                      | full/不明           | CI上の現状                                                                  | 配置方針                                                                                                            |
| ---------------------------------------------------- | -------------------------------- | ------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| clean worktree、detached HEAD、push ref/diff安全分類 | 常時                             | 常時                | 同等なpush ref契約は確認されていない                                        | pre-pushに残す。失敗は停止                                                                                          |
| lint                                                 | `lint:fast`はfull fallback時     | `lint:fast`         | 通常CIで必須                                                                | CIとの重複を測定後に限り統合を検討                                                                                  |
| type check                                           | 通常changedでは未実行            | `type-check`        | main push/PR CIで必須                                                       | 今回のBrowser選択縮小で一括削除しない。省略候補は別件として影響箇所とデグレ懸念を根拠に判断。不明時full             |
| Vitest unit/integration                              | related test                     | `test:coverage`     | `test:all`はmain push/PR CI、coverageは手動full                             | relatedのゼロ件/失敗/不明はfull fallback。coverageの扱いは別件としてリスクに応じ判断し、Browser縮小の条件と混ぜない |
| component Browser Mode                               | `test:browser:prepush:component` | selected risk cases | 手動full                                                                    | 実コード影響と具体的なデグレ懸念を根拠に選ぶ。Browser全件や除外caseのCI同等性証明は求めない                         |
| production build                                     | `build`                          | `build`             | main push/PR CIで必須                                                       | routeとの共有成果物を保ち一度だけ実行                                                                               |
| built route Browser Mode                             | `...:prepush:built`              | selected risk cases | `...:built`はmain push/PR CI、allは手動full                                 | build後に実行。変更箇所と懸念に沿って選択し、manifest/wrapperの失敗伝播は維持                                       |
| build parity                                         | 通常は省略、full fallback時      | `test:build-parity` | 手動full                                                                    | Browser選択縮小と同時に一括削除しない。省略候補にする場合は別件としてデグレ懸念を判断                               |
| dependency audit/secretlint                          | 通常は省略、full fallback時      | `security-check`    | audit/secretlintはmain push/PR CIに個別stepあり。`security-check`は手動full | Browser選択縮小と同時に一括削除しない。失敗/timeoutはfail-closed。省略候補は別件として判断                          |
| production検証                                       | 別枠                             | 別枠                | PROD_URL/networkを使う別枠                                                  | pre-push検証に含まれると誤記しない                                                                                  |
| Playwright E2E (`test:e2e`)                          | 実行しない                       | 実行しない          | pre-push現行gateではない                                                    | hook常時gateとして扱わない。別のCI/手動検証の範囲を確認                                                             |

## 安全契約

- gitが渡す全refを対象に差分を和集合として分類し、`origin/main...HEAD`等に置き換えない。
- 新規branch/ref、remote削除、削除/rename、空差分、source/test関連入力ありでの候補ゼロ/不正、unknown path、shallow clone、不正・不明ref、分類失敗、relatedの失敗または不確定結果はfullへ倒す。複数refは全refの和集合で分類し、いずれかのrefにfull条件があればfullへ倒す。
- lint/type/test/browser/build/route/parity/securityのいずれかが失敗すればhookも非0。timeout、JSON不正、選択不能、network失敗を成功扱いしない。
- build成果物を使うrouteテストはbuild後に実行する。共有 `.next`、port、browser server、CPU/メモリ競合を壊す並列化をしない。
- full profileを常備し、変更分類の緩和は新旧fixtureの期待profile・実行gate・exit codeを確認した後に限る。
- hookを迂回して所要時間を達成したことにしない。`--no-verify`、`HUSKY=0`、hooksPath差し替え等は禁止。

## 最小記録・受入条件とロールバック

各小変更について、変更対象と根拠、使ったfixture/確認、影響した実ゲートの結果、未検証事項を記録する。時間計測を行った場合だけscenario/profile、完走可否、exit code、全体wall timeを追加する。before値、CPU/メモリ精密統計、P95は必須記録にしない。

各段階の受入は、その段階の終了条件を満たし、選定したデグレ懸念が対象に含まれること、manifestに選択caseが存在すること、選択wrapperの失敗が非0で伝播すること。必要に応じ選択した実テストを1回だけ実行する。stubしか実行していない場合はブラウザ実動作未確認と記録する。代表成功runを完走できた場合は約180秒の達否を受入記録に加える。未測定は未達/未確認として扱い、3分目標の達成条件を満たしたとは報告しない。full profileや全シナリオの網羅計測、全gate失敗注入、cold/warm反復、削除case全件のCI同等性証明は各小変更の必須受入にしない。分類・選択・失敗伝播の契約に影響する変更時に関連caseを確認する。

変更が安全契約違反、失敗伝播漏れ、または必要fixtureの退行を起こしたら、その単一変更を戻し、最後に受入済みのhook構成へ戻す。測定負荷や未完了時間だけを理由に危険な迂回を行わず、対象を縮小して未検証と記録する。

## 想定変更ファイルと仕様同期

実装に進む場合の候補は `.husky/pre-push.bash`、`.husky/lib/push-impact.sh`、`.husky/lib/prepush-profile.sh`、計測/harness scriptとunit/smoke fixture、必要に応じ `package.json`、CI workflowおよび `docs/testing-profiles.md`。実際に変更する範囲は実コードの根拠と関連する軽量確認で決め、必要な場合に限り個別計測を補助に使う。不要な仕組みを増やさない。

hook経路、影響分類、ゲート配置、データ/検証フローを変更した場合は、`openspec/specs/nextjstest/spec.md` と `openspec/config.yaml` のspecルールを確認し、Data Sources / Data Flow / Component Tree / Requirementsを実装と同期する。該当RequirementにはWHEN/THENシナリオを記載する。実装チェックポイントでは `skills/jev-review/SKILL.md` を明示的に読み、実コード・要件・テスト・検証証拠で妥当性を確認する。標準レビューでは初回requestより前にcase-specificな相互排他的候補を2件以上用意して `--clarification-candidates` と同時に渡す。テスト実装はfixerへ委譲し、検証ゲートはOrchestratorが実行する。

計画作成時点では、現行pre-pushの実測・実装は未実施だった。計測器とdry-runはその後実装されたが、実測harnessの安全性・完走は未確認である。現在の実行状況は以下の通り。

## Execution status (2026-10-03) / 実行状況

**実装済みとして確認されているもの（以下は各記録時点の履歴。最新方針は末尾を参照）**

- `.husky/pre-push.bash` と `hook-common.sh` に、opt-inのTSV計測を追加済み。gate/totalのtimestamps・ms・exit、profile、scenario、cache conditionを記録し、記録失敗はhook結果に影響しない。
- `scripts/hook-smoke.mjs` に計測schema、total、failed-build exitのassertionを追加済み。`pnpm run test:hook-smoke` は成功。
- `openspec/specs/nextjstest/spec.md` にR-Hooks-6の隔離timing harnessと説明を追加済み。
- `scripts/prepush-benchmark.mjs` はpushせずhookを直接呼び出す一時fixture用CLI runnerとして実装・更新済み。引数なしのhelp、`--dry-run` matrix、明示full、期待profile/exit/final gateのassertion、`.env*`除外を含む。

**検証済み**

- `pnpm run test:hook-smoke` 成功。timing schema/total/failed-build assertionを通過。
- `pnpm exec vitest run tests/unit/husky-push-impact.test.ts tests/unit/husky-pre-push.test.ts` 成功（2 files / 30 tests）。出力にはfixture由来のstderrが含まれたが、終了コードは0。
- `node --check scripts/prepush-benchmark.mjs` とrunnerの `--help` 成功。
- `--dry-run --scenarios source-test,config --profiles auto --cache-states next-cold,next-warm` 成功。期待どおり4 workload cellsのchanged/full gate orderを出力。

**未検証・未実施**

- 実benchmark `source-test/auto/next-cold` を開始したが、結果出力を取得できなかった。停止依頼後はexec sessionに再接続できず (`Unknown process id`)、成功/失敗・計測値とも未確認。baselineとして扱わない。
- runnerの実行時隔離性、および実scenarioでのsource tree・index・`.next`不変性の結果は未確認。
- cold/warm各3回の実baseline、median/maxは未取得。OS/page cacheは制御されていない。
- 過去の計画では段階0未完了としていた。今回、baseline取得・cold/warm反復・実測harnessの完走を先行条件から外したため、これらを再試行しなくても既存の手掛かりを使ってコード静的確認へ進める。計測runnerの実行時隔離性、source tree/index/`.next`不変性、代表scenarioの実runは引き続き未確認。
- 改善候補の静的確認、対象1箇所の最適化、変更に応じたfixture/実ゲート確認、改善後の代表成功runはいずれも未実施。通常/fullの完走時間、約180秒達否、短縮量は未確認であり、完走や達成を主張できない。並行化/cache/CI移管も未着手で、後回しの任意案件。

## Execution status (2026-10-03, 追記) / 段階0〜1 の静的確認

**段階0（既存の手掛かりを読む）: 完了**

- 以下を読解し、選択経路と使える軽量fixtureを確認した（すべて読取のみ、実行なし）。
  - `.husky/pre-push.bash`（224行）: clean worktree → detached HEAD → `push_impact_collect/print` → spec/test staleness警告（96-117行）→ changed/full 分岐（204-224行）。changedは related → `test:browser:prepush:component` → `build` → `test:browser:next-route-poc:prepush:built` の順。fullは lint:fast → type-check → test:coverage → component Browser Mode → build → built route → build-parity → security-check の8ゲート。`COMPONENT_BROWSER_RAN`/`FULL_PROFILE_RAN` フラグで component browser と build/route の二重実行は防止済み。
  - `.husky/lib/push-impact.sh`（212行）: 全refの差分和集合分類。full条件（config/openspec/e2e/generated/build/unknown/削除/rename/new ref/shallow/解決失敗/related選択失敗）と `PUSH_IMPACT_HAS_SOURCE`/`HAS_TESTS`/`HAS_RELATED_INPUT` フラグを確認。
  - `.husky/lib/hook-common.sh`: `hook_gate` の非0伝播、cleanup trap。`hook_start_parallel_gate`/`hook_wait_parallel_gates` は未使用の互換helper（pre-push実効経路は逐次）。
  - `.husky/lib/prepush-profile.sh`: `full|changed` 正規化、未知値はfull。
  - `.husky/check-clean-worktree.sh` / `.husky/check-detached-leftover.sh`: 併走契約はそのまま。
  - `package.json` scripts: full/changed の各ゲート実体。`type-check`(tsc) と `type-check:fast`(tsgo) は別物、`test:coverage` は `VITEST_MAX_WORKERS=2`。
  - `vitest.config.ts` / `vitest.browser.config.ts`: 既定configは browser-mode/production/build/e2e を除外。
  - `scripts/run-prepush-component-browser.mjs`（53行）: 単一test name選択 + JSON検証。`scripts/run-next-route-poc.mjs`（517行）: selection-file検証、BUILD_ID必須、next start readiness、逐次config実行。
  - 軽量fixture: `scripts/hook-smoke.mjs`（478行、git一時remote+スタブPATHで全経路を仮実行、timing assertionあり）、`tests/unit/husky-push-impact.test.ts` / `tests/unit/husky-pre-push.test.ts`（30 tests）。実測harness (`prepush-benchmark.mjs`) は段階1の必須条件として使わない。

**段階1（静的確認で改善候補を1つ）: 進行中・候補未確定**

- explorer調査（ses_efe54fb9dffe11eWdTQA9BkgSz）+ オーケストレータ自身の全文読取により、コード上根拠のある候補を収集。
- **候補A（explorer提示、軽微）**: `pre-push.bash:96-117` の staleness 警告が `grep` で `PUSH_FILES` を再分類しており、`push-impact.sh` のフラグ（`PUSH_IMPACT_HAS_SOURCE` 等）と責務が重複。ただし効果はgrep数個の削減で、壁時計への寄与は小さい見込み。`openspec/specs/.*/spec\.md$` の一致関係がフラグで完全カバーされるかは未確認（explorerも未確認と明記）。
- **候補B（オーケストレータ読取、より大きい）**: full profile の `test:browser:component:all` および `test:browser:next-route-poc:built:all`（Chromium+WebKitの2 config逐次、履歴値で約506〜518秒）がfull全体の支配的コスト。ただしplan46の計測測値は歴史的referenceであり、現行経路の実測は未実施。選択縮小は安全契約（「full profileを常備」「分類緩和はfixture確認後」）に触れるため、単独では即決しない。
- **候補C（構造的、未評価）**: changed 経路の `vitest related` → component browser → build → route の逐次実行。並列化はplanの「後回し案件」かつ安全契約「共有 `.next`/port/CPU競合を壊す並列化をしない」に該当するため初期対象外。
- **段階1の決定（候補Aを選定）**: 対象は `pre-push.bash:95-117` の staleness 警告ブロック。根拠は「`push-impact.sh` が路線分類の唯一の owner であるべきなのに、`pre-push.bash` が同じ入力 `PUSH_FILES` を4回の `grep -qE` で再分類しており、責務重複＋プロセス起動4回の不要起動」。維持する安全条件: 警告は非ブロッキング（終了コードに影響しない）であること、条件構造・正規表現・文言・出力順を完全互換で維持すること、clean worktree / detached HEAD / 分類 / ゲート順序・非0伝播に一切触れないこと。効果見込みは壁時計へ寄与が小さい（ms単位）ことを明記し、180秒達成の主張根拠にしない。支配的コストの特定は段階4の代表run計測に委ねる。候補B（full の browser:all 縮小）は安全契約「full profileを常備」「分類緩和はfixture確認後」に触れるため、段階2の対象にしない。

**未検証・未実施（現時点）**

- コード変更・spec変更・テスト実行・JEVレビュー・commit・pushは一切未実施（読取のみ）。
- 段階2（対象1箇所の改善）、段階3（検証済み変更の積み重ね）、段階4（代表成功run計測、約180秒達否）はいずれも未着手。
- 通常/fullの完走時間、短縮量、約180秒達否は未確認。測定していないものを推測で記録しない。

## Execution status (2026-10-03, 段階2〜4) / 実装・検証・計測

**段階2（候補Aの実装）: 完了**

- fixer（fix-1 / ses_efe3c884bffel93gZzJkSC5Wl1）に `.husky/pre-push.bash` 単一ファイルのみを委譲。95-117行の staleness 警告2ブロックを、4回の外部 `grep -qE` から `while IFS= read -r line` + `[[ =~ ]]` の純bash 2ループへ置換。条件構造・4つの正規表現・文言・空行・出力順・非ブロッキング（終了コード非依存）を維持し、それ以外の行は変更していない。diff に含まれる timing 計測ブロックは前回セッションの未コミット変更であり今回の変更対象外。
- 委譲指示との一致を Orchestrator が diff で確認済み（変更範囲は staleness ブロックのみ）。

**段階3（検証ゲート、Orchestrator実行）: すべて通過**

- `bash -n .husky/pre-push.bash` → SYNTAX_OK。
- 旧 grep 実装 vs 新 bash 実装の等価性プローブ（空入力/srcのみ/src+tests/docsのみ/serverのみ/spec.mdのみ/src+spec/openspec changes/e2e/大文字SRC/混合 の11ケース）→ 全一致（PROBE_RESULT=0）。`set -euo pipefail` 下で終了コード0も確認。
- `pnpm run test:hook-smoke` → 成功（initial, normal, docs-only skip, multi-ref, deletion, failure atomicity, full profile, Browser Mode failure/fallback gates）。
- `pnpm exec vitest run tests/unit/husky-push-impact.test.ts tests/unit/husky-pre-push.test.ts` → 2 files / 30 tests すべて成功。
- 実装チェックポイントで `skills/jev-review/SKILL.md` を明示的に読み、JEV 標準レビューを実施（request + case-specific 相互排他候補3件を `--clarification-candidates` で提出）。初回判定は `valid_as_defined`（confidence 0.93、passProbability 0.94）で合格。更問は不要。
- spec 影響: 分類・ゲート配置・データ/検証フロー・hook経路の構成は変更していないため、`openspec/specs/nextjstest/spec.md` の更新は今回不要と判断。

**段階4（代表成功run計測）: 実施したが計測未取得**

- 他に重い処理を止めず並列計測せず、`node scripts/prepush-benchmark.mjs --scenarios source-test --profiles changed --cache-states next-warm --runs 1 --output-dir /tmp/opencode/stage4` を1回だけ実行（2026-10-03T12:41:05Z 開始、出力はファイルへ逐次記録）。
- 結果: ゲート実行前に `isolated offline pnpm install failed (1)` で失敗。fixture の `pnpm install --offline --frozen-lockfile` が1で終了し、details は runner が withholding。gate は1本も走らず、wall time と exit code の計測は未取得（`gate-timings.tsv` はヘッダのみ）。
- 追加の軽量診断（本体 repo と最小 fixture で比較）: 本体 repo では `pnpm install --offline --frozen-lockfile --ignore-scripts` が exit 0。package.json + pnpm-lock.yaml + pnpm-workspace.yaml + .npmrc の最小 fixture では出力0バイトで exit 1（`--loglevel=debug` / `--reporter=append-only` でも無音）。`pnpm store status` は esbuild@0.28.2 の integrity 変化を指摘（`pnpm install --force` での再取得を提案）。失敗原因の完全特定は未達。
- **決定（ユーザー判断）: 段階4はここで打ち切り、「未測定」として確定する。** 再測定は強制しない。**source-test/changed/next-warm の全体時間、約180秒達否、短縮量は未取得のまま。達成も未達も主張しない。** dry-run マトリクス（source-test/changed/next-warm、期待 exit 0、4ゲート: changed integration tests → test:browser:prepush:component → build → test:browser:next-route-poc:prepush:built）は事前に確認済み。

**現時点の総括**

- 段階0・1・2・3は完了（1箇所の改善は検証済み、JEV `valid_as_defined`）。段階4は計測未取得で打ち切り。
- 通常/fullの完走時間、短縮量、約180秒達否は未確認のまま。壁時計目標の達否判定はこれで断定しない。
- 次の候補として残るもの:
  - **候補B（未着手、支配的と見込まれる）**: full profile の Browser Mode 2 config 逐次（履歴値 約506〜518秒）。ただし (1) 現行経路の実測は未取得、(2) 選択縮小は安全契約「full profileを常備」「分類緩和はfixture確認後」に触れる、(3) plan46 の値は歴史的 reference。→ 実測取得が前提となり、段階4の fixture 無音失敗の解決が先に必要。
  - **計測 harness の復旧（段階4の前提）**: fixture offline install の無音失敗（原因未特定）を直さなければ、代表run計測も baseline も取れない。優先度は高いが、単独では180秒目標への直接改善にならない。
  - **候補C（後回しの任意案件）**: changed 経路の逐次実行の並列化。共有 `.next`/port/CPU 競合を壊さない範囲のみ、安全契約の確認後。
- 並行化/cache/CI移管は引き続き後回しの任意案件。
- 未コミット変更: `.husky/pre-push.bash`（staleness 純bash化 + 前回セッションの timing 計測ブロック）、本計画書。commit は未指示のため未実施。

## Execution status (2026-10-03, 候補B 絞り込み) / 計測しない静的整理

以下はB1実装前の当時点の候補・次アクション記録であり、現行方針ではない。実装後の状態と最新方針は後続節を参照。

計測は行わず、explorer（exp-2）の調査＋マネージャー自身のコード確認による事実だけで絞り込み候補を列挙する。

**確認した事実（ファイル:行）**

- full profile の browser ゲートは `.husky/pre-push.bash:214,221`（`run_full_profile` 内）。`browser_profile` 引数既定は `all` で、明示 full（:232 `run_full_profile`）は `all`、changed からの fallback 4箇所（:153,173,183,191）は `prepush-browser` を渡す。**「prepush-browser 選択を使う full」は既に実装済みで fallback でだけ使われている。**
- `test:browser:component:all` = `vitest run --config vitest.browser.config.ts`（package.json:24）。config は include `tests/browser-mode/**/*.browser.test.tsx`（実体 22ファイル）、`testNamePattern: /^(?!.*-webkit)/`、Chromium 単一 instance、fileParallelism true / maxWorkers 2（vitest.browser.config.ts:18-27）。
- `test:browser:next-route-poc:built:all` = `node scripts/run-next-route-poc.mjs` 選択なし（package.json:26）。選択なしは `VITEST_CONFIGS.all` = `["vitest.browser.aggregate-chromium.config.ts", "vitest.browser.webkit.config.ts"]` の **2 config 逐次**（run-next-route-poc.mjs:22,470-481）。next start サーバは invocation ごとに1つだけ起動し readiness 待ち、browser API ポートは 63000-63999 から config 数だけ確保（:166-191）。route config 側は fileParallelism false / maxWorkers 1、testTimeout 45s / hookTimeout 90s（vitest.browser.next-route.config.ts:39-45）。webkit config は3ファイル・`testNamePattern: /webkit/`・webkit instance（vitest.browser.webkit.config.ts:26-41）。
- `prepush-browser` 選択時: component は `test:browser:prepush:component`（単一テスト）、route は `--selection-file=scripts/prepush-browser-route-selection.json`（chromium の aggregate config 1つ・6テスト名、webits なし）。fallback full はこれで動く。
- `test:full` は browser に `component:jev` / `routes:jev`（JEV選択経路）を使い、`component:all` / `built:all` は pre-push full のみが使う（package.json:45, hook-smoke.mjs:257-259 の full で `component:all`/`built:all` を gate 順序 assert、:280/:289-293 で failure注入も built:all 指定）。
- spec（R-Hooks-4, spec.md:1167-1180）の full gate 順序リストは `lint:fast → type-check → test:coverage → build → test:build-parity → security-check → test:e2e:clean → test:e2e`。browser ゲートはリストに明記されておらず、e2e 2ゲートは hook 側で「production validation: not run」として意図的に未実行。

**絞り込み候補（効果順、いずれも未実測）**

- **B1（中核案）: 明示 full にも `prepush-browser` 選択を適用する** — `pre-push.bash:232` の `run_full_profile` に `prepush-browser` を渡す1行級の変更。fallback full と同じ既存経路を使うため新規コードが最小。browser ゲートは「component 全22ファイル + route 2config逐次」→「component 1テスト + route 6テスト×chromium 1config」に縮小。
  - 必要な fixture 確認（安全契約「分類・選択縮小は fixture 確認後」）: hook-smoke の full profile assertions（component:all/built:all の順序・failure注入）と husky-pre-push.test.ts:390-404（script 文言）が現状と反転するため、更新が必要。spec R-Hooks-4 は gate 名を browser まで特定していないため、webkit 検証・残り21 component テストが full で走らなくなる点は「full の検出力縮小」として明示的に判断が必要。
- **B2: route `built:all` から webkit config を外す** — `run-next-route-poc.mjs:22` の `VITEST_CONFIGS.all` から webkit を除く、または pre-push 専用 config 選択を追加。2 config 逐次 → 1 config。webkit 側は3ファイル・逐次・maxWorkers 1 のため構成比は大きい見込み（未実測）。
  - `built:all` は現状 pre-push full と hook-smoke のみが参照（`test:full` は jev 経路）なので、参照範囲は限定的。hook-smoke の gate 名 assert は script 名を変えれば維持可能。webkit を pre-push から外す判断は「full は webkit も見る」という運用前提の確認が要る。
- **B3: component `all` の対象を pre-push 専用に縮小** — B1 の一部または独立案。`vitest.browser.config.ts` の include を直接絞ると CI（`test:browser:all`）にも波及するため、pre-push 専用 script（selection 追加）に分けるのが安全。効果は B1 とほぼ重複するため、B1 を採るなら実質不要。
- **対象外とした案**: 2 browser ゲートの並列化（CPU/port 競合、安全契約で禁止）、ゲート削除・失敗時スキップ（失敗検出力、契約違反）、`test:coverage`/`build` 等の非 browser ゲートは候補Bの範囲外。

**判断（未実測であることを前提とした順序づけ）**

- 実装量・fixture 影響の小ささで B1 を第一候補、B2 を第二候補とする。ただし効果量はどちらも未計測であり、180秒達成の主張根拠にはしない。
- 次アクションは「B1 の fixture 含む可否判断 → （採る場合）fixer に1ファイル委譲 → マネージャーが hook-smoke + 単体テストで検証」。段階4の代表run計測は harness（fixture offline install）復旧が未解決のため後続に据える。

## Execution status (2026-10-03, 候補B1 実装) / 明示 full の browser 選択縮小

以下はB1実装時点の履歴。今回のユーザー明示方針および現行の次アクションは末尾の最新サマリを参照。

**当時の判断**: 絞り込み節の第一候補 B1 を採用（マネージャー決定、ユーザー未明示の選択。自律実行モードに従う）。効果量は未計測のまま。今回のユーザー明示方針は末尾の最新サマリを参照。

**実装（fixer、ファイル単位の委譲4件）**

- `.husky/pre-push.bash:232` — `run_full_profile` → `run_full_profile prepush-browser`（1行）。明示 full（`PREPUSH_PROFILE=full`・classifier full）が fallback と同じ固定 pre-push Browser Mode 選択を使う。`run_full_profile` 内の `all` 分岐・既定値 `${1:-all}`・ゲート順序・メッセージは維持（`all` は hook から到達不能になるが package.json の `:all` コマンドは raw unfiltered として維持、削除判断は保留）。
- `scripts/hook-smoke.mjs` — full profile の gate 順序 assert・failure 注入（`HOOK_SMOKE_FAIL_GATE`）・failure 後の2ゲート実行 assert を prepush ゲート名へ更新。fallback full の assert は既に一致のため無変更。
- `tests/unit/husky-push-impact.test.ts` — explicit full テストの gate 名・`MOCK_FAIL_GATE`・出力メッセージ期待を prepush ゲート名へ更新。
- `openspec/specs/nextjstest/spec.md` — 「Pre-push does not invoke the selector: it runs all ... cases」を固定選択の記述へ修正、full profile の gate 順序リスト・scenario WHEN/THEN（約2425, 2957, 2979, 3276）の browser 2ゲート名を prepush 版へ。`test:browser:next-route-poc:built:all` が raw unfiltered suite を実行するという package.json コマンドの記述（約3125）は維持。

**検証（マネージャー自身が実行）**

- `bash -n .husky/pre-push.bash` → SYNTAX_OK。grep で5 call site（:153,:173,:183,:191,:232）すべて `prepush-browser` を確認。
- `pnpm run test:hook-smoke` → passed（full profile・Browser Mode failure/fallback gates 含む）。
- `pnpm exec vitest run tests/unit/husky-push-impact.test.ts tests/unit/husky-pre-push.test.ts` → 30 passed / 0 failed。
- `pnpm run lint:fast`（oxlint）→ findings なし。
- JEV 標準レビュー（`skills/jev-review/scripts/jev-request.mjs`、相互排他候補3件 `--clarification-candidates`）→ 初回 `valid_as_defined`、confidence 0.73、passProbability 0.77、更問不要。

**明示された非回帰事項（この変更で変わったこと）**

- full profile の browser 検出面は「component 全22ファイル + route 2 config 逐次」→「component 1テスト + route 6テスト×chromium 1config」に縮小。WebKit検証はpre-pushでは走らない。全件コマンドは残るが、CIでの実行範囲や他の実行先の有無は未確認。
- 180秒達成の達否は**未判定**（段階4は未測定で打ち切り済み、この変更でも未計測）。

**未コミット変更**: `.husky/pre-push.bash`（staleness 純bash化 + timing 計測ブロック + B1 1行）、`.husky/lib/hook-common.sh`、`scripts/hook-smoke.mjs`、`tests/unit/husky-push-impact.test.ts`、`openspec/specs/nextjstest/spec.md`、`pnpm-workspace.yaml`、`scripts/prepush-benchmark.mjs`（untracked）、本計画書。commit は未指示のため未実施。

## Execution status (2026-10-03 続行) / 選択run実行・fixture充足判断・追加fixture

前セッション（ses_efe55f8e5ffe3hO1pobhZ16Zjb）は `pnpm run test:browser:prepush:component` の起動直後に中断していた。本続行でそこから再開した。

**静的確認（explorer 結果の再確認、コード実行なし）**

- 選択caseの存在: component は `scripts/run-prepush-component-browser.mjs:10-12` の `tests/browser-mode/BottomSheet-focus.browser.test.tsx` 1件。route は `scripts/prepush-browser-route-selection.json` の6件がすべて対応する browser テストファイル内の fullName と完全一致。config はすべて `vitest.browser.aggregate-chromium.config.ts`。
- 選択成功判定: 両 wrapper とも0件/不一致時に `assertSelectedBrowserCasesPassed` 経由で throw または `process.exitCode = 1`。0件でも成功する経路は存在しない（`run-next-route-poc.mjs:432-440`、`run-prepush-component-browser.mjs:43-49`）。
- 失敗伝播: `.husky/pre-push.bash` の `hook_gate` は `|| return $?` で gate 失敗を即時伝播。
- 既存fixture: `scripts/hook-smoke.mjs:369-437` が related 選択の empty/invalid/indeterminate で full fallback し、fallback 内の gate 順序と browser 2ゲートの実行回数まで assert。

**マネージャー自身の実測（実ブラウザ、stub ではない）**

- `pnpm run test:browser:prepush:component` → 1 passed / 1 file、3.26s、exit 0。
- `pnpm run test:browser:next-route-poc:prepush:built` → exit 0。selection 6件が1件ずつ別 invocation で実行され、各 invocation とも `1 passed`（それ以外は Vitest の testNamePattern による意図的な skip）。経過秒 4.79 / 5.49 / 7.22 / 8.30 / 7.05 / 6.73。
- 補助プローブ: testNamePattern が1件も一致しない場合の Vitest は exit 0 で終了し、JSON report では該当ケースが `status: "skipped"`（`numPendingTests: 1`）。→ wrapper の JSON 検証が唯一の fail-closed 守りであることを実測で確認。

**fixture 充足の判断と追加した1件**

- 判断: 存在・wrapper成功判定・失敗伝播の fixture は上記のとおり充足。追加は「追加で確認できる具体的なデグレ懸念」に限る方針に従い、component wrapper だけが fail-closed の source-pin を持たない非対称のみを対象とした（route wrapper は `tests/unit/next-route-poc-runner.test.ts:37-50` が source-pin 済み）。
- 追加: `tests/unit/prepush-component-browser-runner.test.ts`（新規、fixer 2件の委譲で作成）。(a) fail-closed wiring の source-pin（`assertSelectedBrowserCasesPassed(report, [selectedName])`、`process.exitCode = 1`、`--testNamePattern` の前後アンカー、`--reporter=json`）、(b) `selectedFile`/`selectedName` を wrapper ソースから抽出し、対象ファイル存在と `describe("...")` + " " + `it("...")` の連結が fullName と一致すること。初稿は fullName を単一文字列の `toContain` で失敗（fullName は describe+it の連結）、連結検証に修正して通過。
- WebKit が pre-push から外れる点、選択外 case の CI 実行範囲、180秒達否は**いずれも未確認・未判定のまま**。段階4の計測は未取得（打ち切り済み）。

**検証（マネージャー自身が実行）**

- `pnpm exec vitest run`（新規 + husky-pre-push + husky-push-impact + browser-selection-validation + next-route-poc-runner）→ 5 files / 43 tests passed。
- `pnpm exec vitest run tests/unit` → 73 files / 868 tests passed。
- `pnpm run test:hook-smoke` → passed。
- `pnpm run lint:fast` → findings なし。`pnpm run type-check` → clean。`bash -n` ×2 → SYNTAX_OK。
- JEV 標準レビュー（`skills/jev-review/scripts/jev-request.mjs`、相互排他候補3件 `--clarification-candidates`）→ 初回 `valid_as_defined`、confidence 0.99、passProbability 0.99、更問不要。

**未コミット変更（追記時点）**: `.husky/pre-push.bash`、`.husky/lib/hook-common.sh`、`scripts/hook-smoke.mjs`、`tests/unit/husky-push-impact.test.ts`、`openspec/specs/nextjstest/spec.md`、`pnpm-workspace.yaml`、`scripts/prepush-benchmark.mjs`（untracked）、`tests/unit/prepush-component-browser-runner.test.ts`（untracked）、本計画書。commit は未指示のため未実施。

## Execution status (2026-10-04) / Stage 4 online 再計測

Stage 4 の計測ハーネスを online install mode で再実行し、`source-test` / `auto` の next-cold 3回・next-warm 3回（計6 run）を完了した。これは測定結果の取得であり、Stage 4 の成功条件を満たしたことを意味しない。

- **全6 run が hook failure で終了**し、成功runは0件。cold と warm-up の route Chromium ゲートでは `p45-b-section-tabs-scroll-82-case01` で `Target crashed` が発生した。warm 側の component Browser Mode ゲートでは `BottomSheet-focus` 実行中に `Browser connection closed` が発生した。
- 成功完走がないため、成功runの中央値は算出できず、約180秒以内の達否も証明できない。失敗runの所要時間を成功完走時間として扱わない。
- source worktree / index / config / `.next` の安全性 assertion は全runで true。CPU時間と最大RSSは benchmark JSON に正しく取り込まれたが、これらはhook全体のプロセスツリー計測であり、単一ゲートやcontainer全体の資源量を示すものではない。
- warm run のうち1件はゲート時刻の並びが不正だった。壁時計の調整による可能性があるが、原因は確定していないため、そのrunのゲート時刻順序は有効な経過時間証拠として使わない。
- **artifact 保全実装**: retention は `test:browser:next-route-poc:prepush:built` と `test:browser:prepush:component` の2つの選択済み Browser gate ID が失敗した場合だけ発動する。route 側はフィルターした PNG screenshot、component 側はサニタイズ済み summary を保存する。raw Playwright trace/report は保存しない。header/cookie、request、DOM data を含む可能性があるためであり、この省略理由も記録する。artifact 保全後も元のhookの非0終了を維持する。
- 上記の保全処理は実装済みだが、Orchestrator によるテストと、この処理を使った診断再計測は未実施。次はその検証を行い、保存された限定artifactで同じBrowser failureの診断を続ける。原因が分かるまで測定成功やStage 4完了としない。

**Stage 4 は未完了**。代表的な成功runの所要時間と180秒目標の達否は引き続き未確認である。artifact 保全実装のテストと診断再計測も待機中。

## Execution status (2026-10-04, 最新更新) / Stage 4 再計測結果

以下は上記の失敗run記録後に、残存benchmark fixtureの容量を確認・整理して行った最新計測である。上記のTarget crashed / Browser connection closedおよびENOSPC試行は履歴として保持する。ENOSPCはstale temporary fixtureの削除前に発生しており、削除後の今回の計測では再発しなかった。削除したfixtureは `/tmp/nextjstest-prepush-benchmark-IsmPIZ`（1,345,904,640 bytes）で、削除時点で関連するactive processはなかった。

- `source-test` / `auto` / `next-cold` は exit 0、84.449秒。直前のwarm-upはexit 0、84.542秒。
- `source-test` / `auto` / `next-warm` は exit 0、74.522秒。
- 両runで選択されたgate、gate順序、source worktree / index / config / `.next` の安全性assertionはすべて合格。coldのuser/system CPUは104.15/11.85秒、最大RSSは1,017,964 KiB。warmは83.99/10.88秒、最大RSSは1,064,156 KiB。CPU/RSSはhook全体のプロセスツリー計測である。
- 先行計測で起きたcold routeの`Target crashed`とwarm component browserの接続失敗は、stale fixture削除後の今回のrunでは再現しなかった。ただし削除との因果関係は証明されていない。
- artifact retentionの挙動確認と関連smokeは完了。raw traceはプライバシー上保存対象から除外し、制限した診断artifactのみを扱う。

**Stage 4 判定:** 代表的なchanged/auto経路について、cold・warmとも成功runが得られ、いずれも180秒未満だったため、この経路の目標確認は満たした。full profileとfallback profileの実時間は未測定であり、その達否は未確認。before値がないため短縮量・改善率は示さない。B1で省略したcomponent/WebKitケースのCI同等性・branch protection上の必須checkも未確認であり、移管済みとは扱わない。

**最終検証結果（Orchestrator実行）**

- `pnpm run lint:fast`、`pnpm run type-check`、`pnpm run test:hook-smoke` は成功。
- `pnpm run test` は115 files、1304 passed、4 skippedで成功。
- `pnpm run test:coverage` は成功し、statements / branches / functions / lines のcoverageはすべて100%。
- JavaScriptファイルの `node --check` と `git diff --check` は成功。
- project spec-refs commandは存在しない。R-Hooks-6のWHEN/THENは手動レビュー済み。
- 標準の初回JEV再判定は `valid_as_defined`（confidence 0.90、pass probability 0.91）で、更問なし。対象scopeは、実測済みのchanged/auto Stage 4経路とfiltered artifact-retention実装およびその検証。full/fallbackの計測時間とB1で省略したケースのCI同等性は引き続き未確認。
