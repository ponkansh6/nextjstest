# 未使用コード・未到達処理の調査と整理計画

> **2026-10-22時点の状態:** tracked repository内でコーディングエージェントが実行可能な範囲の調査・cleanup実装・仕様同期・適用可能な検証は完了。詳細な計画照合とゲート結果は[実施監査](./59-unused-code-cleanup-audit.md)を参照。pre-change baselineは復元不能のため未達として記録する。repo外のcaller/live data sourceおよび人間によるvisual reviewは未確認・対象外。`data:refresh --check` はstale ignored semantic stateにより失敗し、live rebaselineは行っていない。これは限定したrepo内調査の完了を示し、全dynamic/external利用の網羅確認を主張しない。

## 目的と実施範囲

コード上で参照されない要素に加え、途中の処理では参照されていても到達可能な画面・ユーザー操作へ結果が届かない要素を調査し、不要と証拠で確認できたものだけを小さく削除する。画面に表示されないことだけを削除理由にせず、仕様上必要な未実装・表示不具合、非視覚利用、副作用を区別する。

計画作成時点では、調査・削除を進めるための計画保存までを今回の範囲としていた。その後、計画の実行を進め、tracked repository内で根拠を確認できた不要項目を整理し、OpenSpec等を同期した。計画作成時の判断・初期状態は以下に履歴として残し、最終状態と達成度は[実施監査](./59-unused-code-cleanup-audit.md)に記録する。外部・live・人手の確認を完了したとは扱わない。

Plan57「[プロジェクト構造・ファイル整理計画](./57-project-structure-cleanup-plan.md)」はファイル配置と保全を主題とし、本計画はコードとデータの有効な利用経路を主題とする。Plan58「[プロジェクト完成度レビューに基づく改善計画](./58-project-readiness-improvement-plan.md)」は完了済みであり、その対象を重複して改修しない。既存計画、ログ、backup、データ、生成物を「古い」「未参照に見える」という理由だけで削除しない。

## 初期確認の現状と根拠

| 項目                      | 2026-10-22時点の確認                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 判断                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 作業ツリー                | 初回確認時の `git status --short` で変更なし                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | これは計画作成時の履歴情報。実装前baselineは後から復元できず、最終状態・除外事項は実施監査に記録する                                                                                                                                                                                                                                                                                                                                              |
| Next.js                   | `package.json` は `next: 16.3.8`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Next規約ファイルやroutingを扱う場合は、現地ガイドを再確認する                                                                                                                                                                                                                                                                                                                                                                                     |
| TypeScript unused検出     | `tsconfig.json` に `noUnusedLocals` / `noUnusedParameters` の設定なし                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | compilerだけで未使用コード全体を検出できる前提にしない                                                                                                                                                                                                                                                                                                                                                                                            |
| lint                      | `package.json` の `lint:fast` はOxlint（testsと `scripts/ts_converters/` 等を除外）。`.oxlintrc.json` は `correctness: error`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | lint結果は対象範囲に限る。除外領域を別途棚卸しする                                                                                                                                                                                                                                                                                                                                                                                                |
| 依存候補設定              | `.depcheckrc` は依存関係検出ツール向けignore設定を含む                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 依存候補の発見補助としてのみ使い、コード・依存の削除判定にはしない                                                                                                                                                                                                                                                                                                                                                                                |
| hook共通helper            | `.husky/lib/hook-common.sh` の `hook_start_parallel_gate()`（72–83行）と `hook_wait_parallel_gates()`（88–110行）は `.husky/` 内の呼出検索で利用箇所を確認できず、Plan51も未使用互換helperと記録                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 未使用候補。動的参照・外部source契約・他のhook実行経路を含めた監査前に削除確定しない                                                                                                                                                                                                                                                                                                                                                              |
| 月次CTI状態の画面情報経路 | `src/app/page.tsx` 67–132行で`ctiInfoState`を組み立て、178行で`CpiChart`へ渡す。`src/app/components/CpiChart.tsx` 47–66行で型/propを扱い、70行から `getChartInfoContent("consumption-expenditure", undefined, ctiInfoState)` へ渡るが、`src/lib/chartInfoContent.ts` 316–327行では第3引数を`_ctiState`として読まず、四半期向け静的説明を返す。productionの `getChartInfoContent` callerは4件でCTI state付きはこの1件。`CtiChartInfoState` の`baseline` / `artifactRoot` / `artifactStatus` / `artifactReason`は型宣言とpageでの設定以外にconsumerなしとの初期文字列調査。OpenSpec Component Treeは四半期consumption infoがPlan40 seriesを説明し月次CTI selection/statusと独立、NewGraph infoも独立と記載 | 途中で途切れるデータ経路候補。型・全caller・生成処理の副作用とtest契約を確認する。削除するとしても専用のCTI状態生成/prop/未使用第3引数/専用型とその契約に境界を限定し、四半期household説明、月次CTI本体、共有fetch/計算を保持する。生成処理に副作用や共有用途がないか確認し、React hookを含む場合は呼出順を維持する。仕様上の独立性を壊さず、必要な表示欠落が見つかった場合は保留しUI機能追加へ自動拡張しない。browser上の実際の表示/操作は未確認 |
| 全体の未使用監査          | 計画作成時点では未実施。後続作業でtracked repo内の対象範囲を調査                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 調査範囲・保留・除外は実施監査を参照。全dynamic/external利用の網羅確認とはみなさない                                                                                                                                                                                                                                                                                                                                                              |

hook helperは並列gateの起動・wait・ログ集約を担う。周囲の `hook_gate`、共有配列、cleanup/trap、一時ファイル/PIDの後始末、失敗伝播、pre-pushの逐次実行経路は別の実行契約である。候補関数だけを検討対象とし、呼出検索を理由に周辺機構をまとめて削除しない。

## 対象範囲と候補の分類

対象領域は `src/`、`server/`、`shared/`、`scripts/`、`tests/`、`.husky/`、`public/`、`data/`、`.github/workflows/`、rootのpackage/config類、および実装から参照される仕様・運用資料とする。大きな自動削除を行わず、候補ごとに次の区分を付ける。

| 区分                         | 意味                                                                                             | 処置                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 未使用を確認                 | 静的・動的な入口と外部契約を調べ、必要な経路・副作用・仕様用途がないと確認                       | 影響範囲ごとの小差分で削除可能                                               |
| 経路が途切れる候補           | 値や処理は作られる/渡されるが、画面・操作・保存・応答などの利用先へ届かない                      | 仕様と非視覚用途を調査。不要と確定するまで削除しない                         |
| 仕様上の欠落・表示不具合候補 | 仕様が出力・操作を要求するのに表示または動作がない                                               | 削除対象にせず保留。別途、仕様・実装判断を記録し、UI機能追加へ自動拡張しない |
| 動的参照・外部契約の疑い     | reflection、文字列名、CLI、CI、利用者入力、外部呼出し等が残る可能性                              | 参照元・契約が解決するまで保留                                               |
| 意図的な非視覚利用           | 保存、検証、認証、ダウンロード、ログ、アクセシビリティ、SEO/metadata、計測など画面表示以外で機能 | 利用要件と呼出経路を記録し、未使用扱いしない                                 |
| 判断材料不足                 | 生成、テスト、fixture、記録、古いが参照される成果物など用途が確定しない                          | 保留理由と追加で必要な証拠を記録し、保全する                                 |

候補台帳には最低限、path/symbol/field、定義位置、根拠となる検索範囲と入口、参照・データ経路、動的可能性、仕様上の意味、利用者影響、副作用・非視覚用途、分類、削除可否、削除する場合の対応差分、必要な検証、未解決点を記載する。検索結果がないことは、調査範囲と動的参照の可能性を併記しない限り証明として扱わない。

## 調査方法

### 1. 実装着手時のbaselineと入口一覧

- 作業ツリー、追跡状態、既存差分、現在のpackage scripts、lint/tsconfig/coverageの対象・除外を記録し、変更に関係する既存gateを変更前に実行してbaseline結果を残す。既存失敗と今回の変更による失敗を区別する。他者の作業差分は保持し、所有範囲を分ける。
- route、page/layout、route handler、CLI、package script、CI workflow、Husky hook、cron/手動運用手順、export、データ更新jobなど実行入口を一覧化する。
- `src/server/shared/scripts/tests/.husky/public/data/.github/workflows` とroot設定を別々に走査する。設定のglob、include/exclude、生成先、ignoreによる未検査箇所も記録する。
- 自動検出は候補列挙に使い、Next規約ファイル、公開URL/asset、CLI、テストfixture、生成物、環境変数キー、設定値、ドキュメント・運用契約を通常のimport到達性だけで判定しない。

### 2. 静的参照と実行時・外部参照

- TypeScript/JavaScriptのimport、type-only import、re-export、dynamic import、`require`、barrel export、route registry、registry/mapによるsymbol参照を入口から追う。
- shellの `source`/`.`、関数呼出し、`eval`、コマンド文字列、Node/Python CLI、Python import、子プロセス、shebang、package scripts、CI、pre-commit/pre-pushを調べる。
- glob、規約ベースのファイル発見、文字列から組み立てるpath、`process.cwd()`、環境変数・設定値・ユーザー入力からの動的選択、reflection、外部からの呼出し契約を確認する。
- URL文字列、Nextのファイル規約、public asset path、CSS class/selector、JSON/CSV field、schema名、テストのfixture/snapshot、データproducer/consumer、manifest/hash/validatorの契約を追跡する。
- 追跡状態、生成・再生成手順、テスト専用か、証跡・backupかを確認する。`depcheck`等の依存候補結果だけでmanifest依存を削らない。

### 3. データが画面または機能の出口へ届くか

対象機能ごとに、入口から出口までの連鎖を追う。概念上の経路は次の通りであり、実際の層は機能ごとに異なる。

`取得/入力 → parse/変換/集計 → API/loader → props/state/store → filter/条件分岐 → DOM・操作・保存・応答などの出口`

- APIで取得・算出されるがresponseに入らない値、propsとして渡されるが読まれないfield、stateへ格納されるがUIや副作用に使われない値、計算結果が別値で上書きされる箇所を確認する。
- JSXに存在してもCSSの `display:none`/`visibility:hidden`、`hidden`、条件式、feature flag、未到達route、常にfalseになる分岐、イベント未接続でユーザーへ到達しない可能性を調べる。画面サイズ・権限・初期state・URL条件ごとの表示差も確認する。
- UI表示以外にも、a11y tree/ARIA、キーボード操作、metadata/SEO、download、clipboard、storage、server response、validation、認証・認可、ログ・audit、計測、cache、データ更新、外部通知などの出口を調べる。
- 各データ要素についてproducerからconsumerの最終利用箇所まで矢印をつなぎ、経路が切れる位置、表示されない条件、仕様が要求する結果を台帳に記録する。
- 画面が見えないという観察だけでは削除判断を行わない。仕様が要求する表示がない場合は不具合候補として保留し、別の修正判断が下るまで削除もUI実装も行わない。
- 具体的な初期例では、`page.tsx`の月次CTI状態構築→`CpiChart` prop→`chartInfoContent.ts`第3引数が未消費となっているように見える。production callerの一覧・型field consumer・OpenSpecの独立性記述を文字列調査した初期根拠はあるが、browser確認は未実施。削除を検討する場合はCTI状態の専用経路だけを境界とし、四半期household説明、月次CTI本体、共有fetch/計算を保持する。生成側が副作用/共有用途を持たないか確認し、React hookを削除・移動する場合は呼出順を維持する。値経路の存在だけで表示バグとも死んだコードとも断定せず、意図・完全な参照・生成処理の副作用を確認する。

### 4. ブラウザー上の到達可能性と証拠

- 静的追跡で説明できない画面/操作は、既存のbrowser/component/routeテスト、必要に応じた実ブラウザー確認で表示条件を確認する。少なくとも関連route、代表的なデータ状態、権限/feature flag、viewport/interactionを記録し、DOMとa11y上の可視性、操作後の出口を確認する。
- テスト上の未表示だけを一般ユーザーにも未到達の証拠としない。テストが使うmock/fixture、feature flag、routeの起動条件が本番と一致するかを確認する。
- 証拠は候補のpathと条件を再現できる形で残す。スクリーンショットだけでなく、DOM/ARIA、レスポンスやstate/操作結果等、判定根拠に必要な観察を添える。秘密値・個人データを記録しない。
- 既存browser testで検証できない場合は、テスト追加が妥当かを判断する。テスト実装は `@fixer` に委譲し、実行と差分・結果の一致確認はOrchestratorが行う。不要コード削除を証明する目的だけの冗長なテストは追加しない。

## 初期の調査候補

| 候補                                                                                       | 既知の根拠                                                                                                                                                                                                                                                                                                                                                                          | 追加調査と判断条件                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/lib/hook-common.sh` の `hook_start_parallel_gate()` / `hook_wait_parallel_gates()` | `.husky/` の関数参照検索でcallerなし。Plan51は互換helperとして記録し、pre-push実効経路は逐次と説明                                                                                                                                                                                                                                                                                  | すべてのhookとsource、外部script、文字列/eval参照、配列・PID・log・cleanup/trapの共有関係、hook smoke範囲を確認。helper単位で未使用が確認できた場合に限り削除候補とする。hook全体の安全動作と逐次gateを損なわない                                                                                                                                     |
| `page.tsx` → `CpiChart` → `chartInfoContent.ts` の月次CTI状態                              | `page.tsx` 67–132行で状態を生成、178行で渡し、`CpiChart.tsx` 47–66/70行からresolver第3引数へ渡すが、`chartInfoContent.ts` 316–327行は `_ctiState` として読まず静的な四半期説明を返す。4つのproduction callerのうち状態を渡すのは1つ。OpenSpec Component Tree 58/61–62行はNewGraph/四半期infoが月次CTI状態と独立と説明。unit/coverage testsはprop形状を確認するがbrowser表示は未確認 | caller/型/生成処理/副作用を完全に確認し、中間stateとpropを整理できるか判断。削除境界は専用state生成/prop/未使用引数/型に限定し、四半期household説明、月次CTI本体、共有fetch/計算を保持する。React hookが関わる場合は呼出順を維持する。関連test prop shapeも更新対象になり得る。四半期表示の独立契約を維持し、仕様上必要な表示欠落があれば削除せず保留 |
| `ChartDataContract` のhidden状態                                                           | `src/app/components/ChartDataContract.tsx` 51–65行はhidden DOMに `data-testid` / series / points / descriptors / public rowsを公開し、複数チャートから利用（例: `SpendingBarChart.tsx` 251行）。DOM tests/data-contract consumerも複数                                                                                                                                              | 現時点で削除候補にはしない。hiddenでもproduction contractがある例として記録し、全consumerと契約の用途を維持                                                                                                                                                                                                                                           |
| package依存、設定、データ、test-only要素                                                   | 自動検出未実施。`.depcheckrc` はignore設定を含む                                                                                                                                                                                                                                                                                                                                    | manifest使用、CLI/設定/動的ロード、CI、生成処理、テスト専用性、証跡価値を個別に確認。候補ツールの出力で一括削除しない                                                                                                                                                                                                                                 |

追加の候補は実査後に同じ台帳へ加える。対象なし、利用継続、仕様不具合、動的参照未解決のいずれも結論として許容し、その理由を残す。

## テクニカルキーポイント

### 到達性とデータフロー

- 「参照なし」と「到達可能な消費者がない」は異なる。呼出ありでも、戻り値破棄、使われないprop、未描画field、未使用response、dead branchは最終用途まで追う。一方で、副作用だけの関数は値を返さなくても使用されている場合がある。
- 入口から出口へ方向付きで追跡し、分岐条件を含める。例えば `API field → loader → props → component → rendered text/ARIA/download` のどこで切れるかを記録し、単純な文字列検索や局所的なgrepを到達性解析の代わりにしない。
- 公開API・URL・ファイル名・CLI引数・環境変数・外部提供データなど、コード外の呼出元を持つ境界は内部参照がないだけで削除しない。契約元を確認できない間は保留する。

### Next.jsとクライアント/サーバー境界

- App Routerの `page`、`layout`、`route`、loading/error等のspecial file、route segment、metadata、server actionやdynamic importはNextの規約または実行時入口になり得る。一般的なunused解析の結果だけで削除しない。
- `src/` 内の表示コードと `server/`、`shared/` のデータ経路を追い、Server/Client Component境界、`'use client'`、server-only module、直列化されるpropsを維持する。到達不能に見えるmoduleがclient bundle/server処理の境界に関与する場合は影響を確認する。
- Nextコードまたは規約ファイルを変更する前に、インストール済みNext 16.3.8のローカルガイドを読む。共通prefixは `node_modules/next/dist/docs/01-app/` で、対象は `01-getting-started/02-project-structure.md`、`03-api-reference/03-file-conventions/page.md`、`03-api-reference/03-file-conventions/layout.md`、`03-api-reference/03-file-conventions/route.md`、`02-guides/lazy-loading.md`。別バージョンの一般知識を根拠にしない。

### CSS、可視性、アクセシビリティ

- DOMに存在しない、存在するが視覚的に隠れる、視覚には現れるがa11y treeから隠れる、操作できない状態を区別する。`display`/`visibility`/opacity/position、responsive media query、`hidden`属性、親要素のスタイルも見る。
- 表示条件、feature flag、role/permission、URL/query、初期ロード、空データ/error/loading状態、viewportにより到達性が変わる。代表的な状態だけを全条件へ一般化しない。
- 可視テキストがなくてもARIA名、スクリーンリーダー向け文言、focus管理、キーボード操作、metadata等が正当な用途を持つ。視覚的に非表示という理由だけで削除しない。

### 削除と仕様同期

- 削除は参照元・対象を同じ変更単位で扱い、関連する生成物・import・script・config・テストを更新する。未使用候補を理由にディレクトリ一括削除や依存の一括整理をしない。
- API、data model、表示契約、利用者操作、コンポーネント構造に変更があれば、`openspec/specs/nextjstest/spec.md` のData Sources / Data Flow / Component Tree / Requirementsを実装と同期し、要件の変更・削除時は `openspec/config.yaml` の規則に沿うWHEN/THEN scenarioを記載する。
- 内部dead codeの削除で外部仕様・データフロー・コンポーネント構造に変化がない場合も、仕様との照合結果と更新不要の理由を台帳に記録する。仕様が要求するのに未実装の表示はコード削除で隠さない。

### ツールと検出限界

- 新しいunused解析ツールの導入や `noUnusedLocals` / `noUnusedParameters` の有効化は必須にしない。まず既存lint/type-checkと、言語・設定・実行入口を横断した探索を使う。導入/設定変更の利益が必要になった場合は、誤検出・対象外・既存違反を別途評価する。
- `lint:fast` は `tests/**` と `scripts/ts_converters/**` を除外しているため、全treeの証明ではない。TypeScript compilerの未使用検査も現在は未設定であり、動的参照、CSS、文字列契約、画面到達性の証明にはならない。
- `depcheck`等は依存候補の列挙用である。package scripts、CLI、plugin、設定ファイル、dynamic import、peer/runtime contractを照合するまで依存を削除しない。

## 段階計画

1. **初期調査と計画保存（計画作成時に完了）:** clean baseline、Next/lint/type設定、既知のhook候補、関連Planを確認し、本計画を `shared_plan/` に保存した。削除判断・変更・検証はこの段階では行わなかった。
2. **実装時baselineと範囲確定:** 着手時の差分を保全し、全入口・対象領域・除外範囲を一覧化する。生成物・fixture・backup・運用記録を早期に削除対象から決めつけない。
3. **静的候補と経路台帳の作成:** symbol/field/config/file/asset/dependencyごとに静的参照と外部参照を探索し、producerから出口まで追う。表示されない処理を含め上記分類を付け、根拠・不確実性を記録する。
4. **証拠と仕様による判定:** 動的参照、Next規約、CSS/condition、a11y/非視覚利用、browser到達性、仕様要件を確認する。未解決は保留し、仕様上必要な欠落は別判断へ分離する。
5. **小分けの削除:** 未使用が確認された最小単位から削除し、参照・設定・fixtureや文書の実契約を同じ差分で整える。削除後に対象範囲を再検索し、他のhook経路やデータ更新経路に影響がないか確認する。
6. **仕様差分と検証:** 仕様変更の要否を判定して必要なWHEN/THENを更新する。Orchestratorが実装差分と委譲範囲を照合し、適切な検証ゲートとbrowser証拠を確認する。結果・保留理由を台帳へ反映してから計画の状態を更新する。

### 検証マトリクス（計画時の候補。実施結果は監査を参照）

| 変更対象/証明したいこと         | ゲート候補                                                                                         | 適用条件・限界                                                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS/JS参照、型・import整合       | `pnpm type-check`、必要なunit/integrationは `pnpm test:all`                                        | type-checkは動的参照/表示到達性を証明しない。全testは対象変更に応じて実行し、既知のscript名を着手時に再確認                                                                                                                |
| lint対象のコード整理            | `pnpm lint:fast`                                                                                   | testsとconverter領域を除外する。対象外の変更には対応テスト・専用確認を追加                                                                                                                                                 |
| test専用候補、fixture、test設定 | 該当test、必要なら `pnpm test:coverage`                                                            | fixtureやsnapshotは実行時・回帰検知契約を確認してから判定                                                                                                                                                                  |
| hook helper・hook経路           | `pnpm test:hook-smoke` と該当するhook挙動の確認                                                    | hook smokeは一般的なhelper未使用の証明ではない。並列helper削除後も逐次gate、非0伝播、cleanup/trap、安全規則を確認                                                                                                          |
| 取得/変換から画面・操作まで     | 関連component browser `pnpm test:browser:component:all`、必要時 `pnpm test:browser:next-route-poc` | 対象route・条件を選んでDOM/ARIA・操作・出口を確認。CTI候補では月次CTIの選択/可用性を変えても四半期説明とグラフ表示が変わらないことをcomponent/browserで確認する。後者はNext route変更など必要な場合のみ使用し、buildを含む |
| Next route/build規約            | `pnpm build`、必要時 `pnpm test:build-parity`                                                      | Nextコード、route、規約fileに触れた場合。build parityは `tests/build` を対象とする                                                                                                                                         |
| data/manifest/refresh経路       | 対象のdata-refresh/runtime validatorテストとfixture                                                | 実データpublishや外部接続を暗黙に行わず、既存fail-closed/hash/producer-consumer契約を維持                                                                                                                                  |
| 仕様との参照整合                | 実装symbol/pathとOpenSpecの手動照合                                                                | `spec-refs`専用scriptはpackage scriptsにない。`audit:validation-detection`はhookのchanged-detection監査でありspec参照検査ではない。架空の `pnpm spec-refs` は実行計画に含めない                                            |

表中のコマンドは計画時の検証候補である。最終差分への適用結果、skip、未解決点は[実施監査](./59-unused-code-cleanup-audit.md)に記録し、検証失敗を成功扱いしない。

## 完了基準

- 調査対象の入口・領域・設定上の除外を記録し、候補台帳の各判断に検索範囲、呼出/データ経路、動的参照、仕様・非視覚用途の根拠がある。
- 到達可能な画面・操作へ届かない処理について、未使用、意図的非視覚利用、仕様上の欠落/不具合、外部契約疑い、証拠不足を区別し、非表示だけで削除した対象がない。
- 削除した場合は対象が最小限で、参照元・設定・テスト・関連文書が整合し、hook安全契約、Next規約、data protectionを維持している。
- 仕様上必要な未表示機能は削除せず保留/別判断として理由を残す。内部整理のみの場合はOpenSpecを照合し、更新不要とした根拠を残す。
- 変更対象に対する適用可能なlint、型チェック、test、build/browser等を実施し、実装差分と検証結果を照合した。最終結果と未達事項は実施監査に記録し、`data:refresh --check`、baseline、外部/live、人手による確認は成功扱いしない。
- 対象なしや保留を含む調査結果と残課題を記録する。完了範囲をtracked repository内で調査した範囲に限定し、網羅的なdynamic/external監査とは表現しない。

## 安全と作業ルール

- `git --no-verify`、`git commit -n`、`HUSKY=0`、`git -c core.hooksPath=...`、`GIT_CONFIG_PARAMETERS` / `GIT_CONFIG_KEY_N` によるhooksPath注入は禁止し、hooksを必ず有効に保つ。
- 最大3 agentの制約を守り、探索は`@explorer`、実装は`@fixer`へ成果物を限定して委譲する。`@oracle`は事前に得た根拠への見解のみとする。
- テスト実装と実行を分離する。テスト実装が必要ならfixerへ委譲し、実行・検証と委譲指示との一致確認はOrchestratorが担当する。
- 仕様変更が必要な場合は探索と書換を分け、OpenSpecのData Sources / Data Flow / Component Tree / RequirementsおよびWHEN/THENを同期する。
- この計画保存ではcommit/pushを試さない。後続実装をcommit/pushする際も既存hooksを有効にする。
