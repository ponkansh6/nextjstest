# Plan52: e-Statデータの一括再取得・再生成CLI

作成日: 2026-10-16  
状態: 実装途中。賃金source contract、6系列mapping、employment/part-time移行は実装・検証済み。sourceは21列CP932（Windows-31J）CSV、`種別=指数`、TL/T/0で、439件の月次行と36件の `CY` 年次行を含む。全6系列のcanonical値identityを1990-01〜2026-06の438か月で照合し、6系列を2026-07まで更新した。年次値は `CY` 行から採用し、不完全な半期・四半期・年度値は空欄を維持する。旧 `employment_indices.csv` の438件は公式常用雇用指数へ移行し、従来のパート比率値は `part_time_worker_ratio.csv` に全件保持した。focused 84/84、全体1389 passed/4 skipped、lint、type-check、build、browser smokeは合格。`pnpm data:refresh --check` はcanonical移行ファイルの未コミット変更により `canonical-edited` でtransport前に停止したため、実source CLI fetch/staging、全46成果物のstaged runtime suite、publish/recoveryは未確認。Plan全体は未完了。
対象環境: Node.js 24.x / pnpm 11（既存package.jsonに準拠）

## 目的と範囲

e-Stat由来の静的入力と、そこから作るCSV・メタデータ・照合用snapshot・派生系列を棚卸しし、公表後に開発者が一度のコマンドで安全に最新化できる仕組みを作る。基本コマンドは `pnpm data:refresh`、公開せず取得から最終検証までを行う確認コマンドは `pnpm data:refresh --check` とする。月次等の公表後に開発者が手動で実行する。実行時はNext.jsアプリの起動を要しない。

範囲は、現在の画面・計算から到達する実利用を起点に、e-Stat取得箇所・入力・派生依存を棚卸しし、実利用対象に公式定義に合う取得adapter、staging内の再生成・品質検証、失敗時に既存成果物を保つ一括publish、来歴・実行レポート、関連仕様とテストを整えることである。過去planに登場すること、`data/source`にあること、loader実装があることだけでは実利用とみなさない。現在未使用のraw・snapshot・adapter・候補系列は現状整理に分類して更新対象外とする。provider種別（e-Stat API/file、他provider、照合・派生、非対象、由来未確定）を明示する。

対象外はアプリUI、アプリ内の更新機能、cron、CIスケジュール、cloud job、常駐プロセス、DB導入、Git commit/pushの自動化である。開発者が明示的に実行するローカルCLIだけを作る。初版には `--only`、offline、resume等の追加CLIを設けない。内部では依存グラフに従って必要な全対象を処理する。`--check` は取得・正規化・派生生成・最終検証まで行い、canonicalファイルを公開せず差分概要を返す。

## 現状と棚卸し対象

ダッシュボードの静的データは `server/lib/dataIo.ts` と `server/lib/data-loader/*` が読む。e-Stat APIの動的proxyは `server/lib/estat.ts` と `src/app/api/estat/*` にあり、別経路である。既存proxyの挙動変更は目的にせず、CLIからproxy経由でアプリを起動する構成にもしない。

| 群 | 現在見つかる成果物・処理 | 計画上の扱い |
|---|---|---|---|
| CPI | `cpi_data2025_long.csv` / `.metadata.json`（metadataにAPI用 `statsDataId=0004052037` とファイル配布用 `statInfId=000040482945` を別々に記録）、`cpi_data2025.csv`、`contribution2025.csv`、`cpi-2025-official-series.csv`、`cpi-2025-series-map.csv`。`server/lib/data-loader/cpi*` が読み検証する。 | CPI adapterはAPI候補を表題・統計名・月次頻度・2025年基準等で解決し、file配布候補もカタログの意味的identity・形式・更新日で解決する。metadata/API応答・候補・取得bytesのhashを記録し、選択表の単位・分類・期間とcanonical履歴重複を検査して5成果物をstageする実装がある。実データ候補の解決・履歴照合・生成は未実行で、受入済みではない。 |
| 賃金・労働 | `total_earning.csv`、`contractual_earnings.csv`、`scheduled_earnings.csv`、`total_worked_hours.csv`、`employment_indices.csv`、`part_time_worker_ratio.csv` と対応するmetadata 2件。`statInfId=000032189777`。現行e-Stat原CSVは21列CP932（Windows-31J）、`種別=指数`、分類TL/T/0で、439件の月次行と36件の `CY` 年次行を含む。 | parser/adaptorは原CSV contractを実装済み。6系列のsource-to-canonical値対応を1990-01〜2026-06の438か月で照合した。`employment_indices.csv` は公式常用雇用指数へ移行し、旧ファイルの438値を `part_time_worker_ratio.csv` へ全件保持した。adapterは6系列を登録し全系列に2026-07を含む。年次値はCYから取得し、不完全な半期/四半期/年度値は空欄を保持する。旧 `/tmp/estat-earnings-index.utf8.csv` 固定入力経路は互換経路であり新mappingの根拠ではない。実source CLI fetch/staging・consumer品質検証・publish/recoveryは未確認。 |
| CTI基本 | `scripts/fetch-cti-basic-series-2025.mjs` が公式XLSXの3表を検査し、`official-cti-2025-long-term/` にraw・normalized・metadata・manifest等をstageする。識別子は原数値 `statInfId=000040499070`、季節調整 `000040499082`、分布調整 `000040499028`。 | 公式XLSX parser、タイトル・sheet・系列identity・連続期間・欠測と0の区別・manifest/hash照合・staging publishを再利用する。既存実装の単独CLIから一括runnerへ移行する。 |
| CTI現役依存 | `server/lib/data-loader/ctiValidation.ts` の採用候補検証は対応表、公式snapshot/metadata、調整候補、四半期CSV、Plan39 manifest、annual Aを必要とする。`server/lib/consumptionTotal12Ma.ts` は `cti-adjusted` のA/manifest、`official-cti-2025-long-term/000040499070.normalized.csv` の過去raw weights、`000040499028.normalized.csv` の2017年以降観測を使う。`quarterlyAggregation.ts` は `000040499087` artifactを参照する。 | runtime計算と現役data-quality検証の両方から到達するため対象に含める。Plan36/39/49・公式long-termという過去plan起源だけで除外しない。registryは5つの論理file identityと31出力を宣言し、カタログ候補を意味的identity・format・dateで動的解決、取得したrawから既存builder経由でraw・normalized・metadata・manifest・derivedを整合させるadapterが実装されている。実カタログ候補、公式ファイル、31成果物の生成・品質検証は未確認。API `statsDataId`、配布 `statInfId`、catalog resource IDは別に扱う。 |
| 人口 | `population_statistics.csv` / `.metadata.json`（配布 `statInfId=000031831366`）、`data/source/economics_source/lt01-b10.xlsx`、`scripts/ts_converters/convert_population.ts`。現行runtimeから参照される。 | 現行runtime依存としてregistryに2出力とpopulation adapterが登録されている。adapterは固定SHA-256、workbook schema・既知観測値・coverageを検査し、converter互換CSVとmetadataを作る。ローカルmetadataとworkbookの一致・既知値照合は確認済みだが、adapter実行・staging検証は未実施。 |
| GDP候補（更新対象外） | `data/source/cti_support_nominal_quarterly2025.csv` / `cti_support_real_quarterly2025.csv` とmetadata、e-Stat照合用の `.estat.csv` が存在し、metadata上はAPI `statsDataId=0003113633`（名目）/`0003113612`（実質）、`seriesCode=cat01=12;tab=12`、期間2005Q1–2025Q4（84四半期）、ESRI URL例 `gaku-mg2621.csv` / `gaku-jg2621.csv` が記録される。 | runtime参照調査で現行画面・計算から到達するGDP consumerは確認されなかった。`src/app/page.tsx` からの現在の四半期表示経路はCPI/CTIを使い、GDP loaderは現行runtime callerを持たない。したがってGDP CSV、ESRI公式取得、official snapshot/metadata、e-Stat照合、GDP派生はすべて今回の更新対象外とし、現状整理にだけ残す。loader/metadata/過去plan/ファイルの存在だけでは対象へ含めない。将来runtime consumerが追加された時点で別途計画する。 |
| CTI調整・家計調査等 | `cti-size-composition/` にはe-Stat基本CTIや労働力調査XLS、家計調査・特別集計など異なる由来のraw/派生・manifestが同居する。Plan39のL入力は家計調査由来。 | ファイル単位で公式発行元・source ID・用途・下流依存を確認する。e-Stat由来入力はregistry対象とし、非e-Statの入力値は初版では更新せず、expected SHA-256等で予期しない変更を検知する。由来未確認を推測で確定しない。 |
| 旧変換一括shell | `scripts/run_all_conversions.sh` と旧 `.spec` / executable生成script群。 | 中核経路に採用しない。依存先・現行出力への影響を棚卸しし、既存利用者がいないことを確認して置換または廃止対象を定める。存在しないbinaryを呼んでも成功扱いになり得る経路を完了条件に含めない。 |

`hon-mks202512.csv`、`hon-mks202606.xls`、`earnings_method_b_202606.csv` は賃金系列CSVとは単位・期間・作成経路が異なる断面/補助成果物である。runtime pinned inputsの用途は維持し、実ファイル・metadata・参照先の相互関係が確認できるまで履歴系列へ自動連結・置換しない。給与Plan26の説明だけで異なるファイルを同一系列とみなさない。

## 技術的キーポイント

1. **意味的identityで取得対象を固定する。** registryにはsource種別（API、Excel、CSV）、統計名・表題、世帯/産業/規模等の分類、頻度、単位、基準年、対象期間、採用する改訂状態、必要なseries codeを持たせる。APIの `statsDataId`、ファイル配布の `statInfId`、カタログ識別子は別型の値として保存する。値が似ていても同一IDと推測しない。公式最新候補をidentityで一意に解決し、その後metadataと照合する。IDを固定して更新を見逃す方法も、候補IDの最大値だけで選ぶ方法も不可。候補複数、表年度更新、廃止、基準改定、定義・schema変更は自動混合せずfail closedで停止しregistry見直しに回す。
2. **API全件取得と応答検査を行う。** `getStatsData` 等のページングは `NEXT_KEY` / `startPosition` を使い、最終ページまで取得する。公式APIは既定limitが10万件であることを前提に、limit到達とページ欠落を検査する。通信は逐次または小さな固定並列とし、timeout、429・5xxだけに上限付きbackoffを設ける。HTTP 200でもJSON内業務statusを確認し、HTML・空応答・不正JSON・想定外schemaを失敗扱いにする。
3. **ファイル取得をAPI取得と分ける。** XLSX/CSVのfile download契約を明示し、API用 `ESTAT_APP_ID` を全URLに機械的に付与しない。CTI既存scriptが使う認証方式・API要否はadapter移行時に確認する。CSVの文字コード・BOM、XLS/XLSX形式、欠測記号（例 `-`）と数値0を別に扱う。`.env.local` はNext起動なしでCLIが明示的に読む（必要なら `TYPESAFE_ENV_FILE` のような設定ではなく本CLI用env pathを定義）。API取得でapp IDが必須なら明示設定または既定 `.env.local` から取得し、未設定ならfail closed。
4. **秘密を成果物に含めない。** API key/app ID、認証付きURLはログ、例外、rawレスポンス、metadata、manifest、実行レポートへ出さない。URLを来歴として記録する場合は認証queryを除去する。エラー文は安全なendpoint識別子とHTTP/statusの範囲に限り、env値・URL全文・bodyをechoしない。
5. **実利用対象の全期間を取り直して改訂を反映する。** consumer/runtime経路で使われると確認した管理対象系列の全対象期間を毎回再取得し、過去改訂も正規化・派生計算に反映する。巨大表はregistryで確定した必要範囲・分類だけを要求し、API pagingで取得する。差分/増分最適化は初版に入れない。取得日時を最新の公表期間と混同せず、source公表日、収録末尾、改訂状況を別々に報告する。収録末尾は月次・四半期等のsource頻度ごとに判定し、未収録の将来期間を補わず、既存履歴消失・後退・途中切断は停止条件とする。
6. **現役consumerのstaging全体を検証してから公開する。** 一括runnerは実利用sourceからconsumerまでの依存順DAGを実行し、raw→normalized→derived→metadata/manifest/official snapshotを同一filesystem上のrun stagingへ出す。系列identity、schema、units/baseline、period coverage・continuity、重複key、有限値、欠測、履歴保持、raw/normalized hash、source→derived lineage、影響するdata-quality checkをcanonicalではなくstagingに向けて検証する。data-loaderは明示rootを受けられる形にし、staging検証が誤ってliveファイルを読む状態を避ける。
7. **publishを回復可能な一括処理にする。** exclusive lockを取得する。通常runは前回未完了journalがあれば先に復旧し、`--check` はjournalを見つけたら書換を伴う復旧をせず停止する。対象ファイルをallowlistに限定し、解決済みpathが許可root外に出ないことを確認する。全sourceとderivedの検証後だけcanonicalを更新する。backup＋durable journal＋rename/rollbackでCSV・metadata・manifestを整合させ、例外時は旧ファイルへrollbackする。複数flat fileのrenameは読者から見た完全な原子性を保証しないため、最終反映中はアプリ等の読者を停止する開発運用条件を明記する。lockはreadersを止めるものではない。kill/電源断からの復旧が終わるまで次回通常runは禁止する。
8. **no-opとraw来歴を両立させる。** publish対象の変更判定には、正規化した系列内容と意味のあるsource metadata/revisionから作るsemantic fingerprintを使う。API応答時刻・取得日時・一時URL等volatile wrapperはrun reportだけに記録し、追跡metadataを更新しない。semantic fingerprintが同じ場合、追跡対象の既存raw原本・来歴をそのまま保ち、今回取得したraw bytesのSHA-256とfetch証跡はgitignoreのrun reportへ記録する。semantic差分がある場合はraw原本を改変せず取得bytesのまま保存し、そのhashと正規化成果・source metadataを結び付ける。raw SHA-256は今回取得したbyte列の同一性、semantic fingerprintは公開成果を更新すべき意味差分の判定に使い、両者を混同しない。rawに秘密情報を含めず、秘密を含み得るAPI応答をraw原本として保存しない。各run report（sourceごとのfetch/unchanged/revision/publish/fail、coverage、検証概要）はgitignore領域に出す。失敗時は非zero exitとし、ログには秘密を含めない。commit/pushは行わない。

公式資料: [e-Stat API仕様・利用手引き](https://www.e-stat.go.jp/api/api-info/e-stat-manual3-0)、[e-Stat API利用規約](https://www.e-stat.go.jp/api/terms-of-use?en%2Fterms-of-use=&terms-of-use=)。実装時にpaging・limit・認証・配布形式・規約を一次資料で再確認する。

## 提案構成

新規CLIの配置案（実装時に既存scripts規約と合わせて確定）:

```text
scripts/data-refresh/
  cli.mjs                 # 引数解析、結果概要、exit code
  registry/               # 現役consumer起点のsource identity・取得形式・出力allowlist・依存宣言
  transport/              # API paging、公式ファイルdownload、retry/timeout
  adapters/               # runtime利用が確認されたCPI, earnings, CTI等の個別変換
  runner.mjs              # DAG、lock、staging、journal、publish/rollback
  validation/             # 共通・対象別・data-quality検査
```

`package.json` に `data:refresh` scriptを追加し、Node 24で実行する。HTTP clientはNode標準fetch、CSV/XLSX parserは既存依存（`xlsx`, `iconv-lite`, `tsx`等）と既存converterを優先して再利用し、新規常駐サービスやDBを加えない。対象は現役consumer/runtime経路から逆引きし、動的API proxyが任意に検索する全表を定期snapshot化しない。Next.js固有runtimeや既存server-only/API proxyをCLIへ安易にimportしない。`--check` はsame-run staging結果を検証し、publish操作を呼ばないmodeとして実装する。

## 実行フロー

```text
lock取得
  → --check時: 未完了journalがあれば recovery-required で停止（canonical変更なし）
  → 通常run時: 未完了journalの検査・rollback復旧
  → 管理対象canonicalファイルのローカル編集/未コミット変更preflight（存在時は上書きせず停止）
  → 現役consumerから辿れるregistry対象の検査・公式source identity解決
  → e-Stat API/ファイルを取得（全対象、全対象期間）
  → stagingへraw保存・normalize
  → series identity / schema / period / history / units / missing / digest検証
  → DAG順にmetadata・manifest・snapshot・derivedを再生成
  → staging rootに対する対象data-quality検証
  → 差分・coverage・改訂レポート作成
  → --check: staging破棄して終了 / 通常: backup+journal+renameで全対象publish
  → 成功後にreport確定、lock解放
```

取得・変換・検証のどこか1件でも失敗した場合はcanonicalを変更しない。publish途中の例外はjournalに基づきrollbackする。OS停止等で中断した場合、通常runは復旧を先に完了する。`--check` は未完了journalを見つけたら書換を伴う自動復旧をせず `recovery-required` で停止する。publish前に管理対象canonicalファイルだけを調べ、ローカル編集/未コミット変更があれば上書きしない。無関係な作業ファイルの変更は許容する。現役consumerから逆引きした対象sourceがすべて一意に解決し、必須adapterがすべて登録され、全依存成果を作ってからのみ成功終了する。未使用データや動的proxyの任意検索可能表を網羅対象として増やさない。

## タスク分割と受入条件

各タスクは概ね2時間以内を目安とし、各系列のadapter作成を独立した小タスクとして分割する。テスト実装とテスト実行は分離し、テストは実装担当が追加し、Orchestratorが検証ゲートを実行する。

| # | 作業単位 | 現在の状態 | 受入条件 |
|---|---|---|
| 1 | runtime consumer・静的source・converter・旧binary・data-quality検査の棚卸し | **完了（実装・文書範囲）。** 現行依存inventory、対象範囲、GDP等の対象外理由を文書化し、最終監査で再照合した。 | 現行画面/計算と必須data-quality検証から依存を逆引きし、現役eStat由来入力と全下流を列挙。未使用/過去候補は現状整理に残して更新対象外とする。由来未確定の現役必須sourceは未確定のまま記録し、黙ってskipしない。 |
| 2 | registryのschemaと対象identity登録 | **完了。** API ID・file IDを別型で扱い、CPI/CTI/earnings/populationのrequired output inventoryは合計46件（賃金6系列とmetadata 2件を含む）。最新のfocused/full test gatesでも合格。46件は契約数であり全件がstaging/publish済みという意味ではない。 | API ID・file IDの別型、表・分類・頻度・単位・基準年・期間・revision・outputs・dependenciesを検査できる。CPI・CTIの既存metadataと矛盾しない。 |
| 3 | 共通transportと秘密情報取扱 | **完了（fixture・static gate範囲）、実source受入は未完了。** API paging/status/retry、env読込と安全なエラー処理、file HTTPS/host allowlist/redirect拒否/429・5xx等の有界retryを実装し全テスト合格。実API・配布file動作と実sourceでの秘密漏洩受入は未確認。 | paging最終ページまで取得し、不完全ページ・API業務status・HTML/JSON異常を検知。429/5xx retry有限。API必須envはCLIでロードし、ログ・artifact・reportにsecretが残らない。公式file downloadでapp IDを誤って必須化しない。 |
| 4 | lockとstaging基盤 | **完了（fixture検証範囲）。** lock、同一FS staging、output allowlist/path containment、canonical変更preflightとcleanup経路のテストを含む全suiteが合格。実sourceによる全件stagingは未実施。 | lock取得、同一FS staging、path allowlist、cleanup、管理対象canonicalだけの変更preflightを独立実装し、競合・path escape・対象上書き防止・無関係ファイル変更の許容をfixtureで確認する。 |
| 5 | semantic fingerprintとcheck mode | **完了（fixture検証範囲）。** semantic fingerprint、volatile report、raw hash証跡、no-op/check経路のfixtureを含む全suiteが合格。最新賃金adapterを含む実sourceでのCLI checkは未実施。 | meaning-bearing fingerprint、volatile report、raw hash記録、`--check` no-publish、no-opで追跡raw/metadata保持をfixtureで確認する。未完了journalがあれば `recovery-required` で停止しcanonical無変更とする。 |
| 6 | publish journal・rollback・recovery | **完了（fixture検証範囲）。** backup、journal、rollback/recovery経路のfixtureを含む全suiteが合格。実canonical publish/recoveryは未実施。 | backup、durable journal、rename順、例外rollback、kill後の通常run復旧をfixtureで確認し、読者停止条件を文書化する。 |
| 7 | CTI adapter統合 | **一部完了。** 5論理file identity、31 outputs、既存parser/builder、revision/history auditのfixtureとadapter testsが合格。公式候補解決・取得、31出力staging、runtime suiteは未実施。 | Plan36 parser/validatorとruntime依存であるraw/normalized/manifest/hash成果を一括DAGから利用し、現役CTI依存群をすべて処理する。既存単独更新の契約を整理する。 |
| 8 | CPI adapter | **一部完了。** CPIのAPI/file identity候補解決、2025基準・月次条件、5成果物生成・検査のfixture testsは合格。実候補・履歴照合・staging生成は未実施。 | CPIのAPI/file ID、統計表、分類、基準年、runtime conversion outputsを照合し、long CSVと現役派生map/contribution/snapshotをstagingから再現できる。 |
| 9 | 賃金adapter群（系列ごとに小タスク） | **完了（source contract/identity/migration）。** 21列CP932（Windows-31J）source、`種別=指数`、TL/T/0、439月次+36 `CY` 年次行のparserと6系列mappingを実装した。canonical 438か月の値同一性を確認し、employment index移行、従来438パート比率の保存、2026-07までの6系列を検証済み。年次値はCYから採用し、不完全な半期/四半期/年度は空欄に保つ。focused 84/84/full 1389 passed・4 skipped等の最新ゲートも合格。runtime CLI fetch/staging/publish/recoveryは未確認であり、WU11/13の受入に残る。 |
| 10 | 人口 adapter | **一部完了。** `population_statistics.csv` と `lt01-b10.xlsx` のruntime利用を特定し、workbook SHA-256、2026年5月=10976・6月=10969、7月=10950と以降の欠測を確認した。adapterとisolated fixture testsはあるが、全source refreshでのadapter実行・staging検証は未実施。 |
| 11 | data-loader staging root・品質検査接続 | **一部完了。** 固定runtime project/dependencyとpinned inputの隔離、staged outputs、canonical fallback拒否の実装とisolated fixture testsは合格。earnings adapter登録後の全source stagingとstaged runtime suiteは未実施。 |
| 12 | 仕様・実行文書・旧経路整理 | **完了（文書同期・最終照合）。** OpenSpec、Plan 52、旧shellの失敗伝播などを最終実装・監査結果と照合した。 |
| 13 | 検証ゲートと手動実行手順 | **一部完了。** latest focused 84/84、全体test 1389 passed/4 skipped、lint、type-check、build、browser smokeは合格。`pnpm data:refresh --check` はmigration対象canonicalファイルが未コミットのため `canonical-edited` でtransport前に停止した。実source CLI fetch、全staged runtime suites、publish/recoveryは未確認。 |

### 技術的キーポイントの実装・受入状況

以下はコード上の実装有無と受入証拠を分けて記す。最新検証ではfocused suite 84/84、全体test 1389 passed・4 skipped、lint/type-check/build/browser smokeが合格した。これらはadapter/source contractとrepository品質の証拠であり、実sourceのCLI fetchやstaged quality合格を意味しない。`pnpm data:refresh --check` はmigration対象canonicalファイルの未コミット変更を `canonical-edited` として検知しtransport前に停止した。

1. **意味的identity・候補解決 — 一部達成:** identity分離とcandidate selection fixture/testsは全件合格。実カタログ/APIでの候補確定、改定/基準変更の実source照合は未実施。
2. **API全件取得・検査 — 一部達成:** paging・件数・継続性・業務status・timeout・retryのfixture testsは合格。実API全件取得は未実施。
3. **file取得・秘密取扱 — 一部達成:** HTTPS allowlist、redirect拒否、bounded retry、安全なerror/reportのfixture testsは合格。実配布file取得と実source応答に対する漏洩確認は未実施。
4. **staging・全件再生成 — 一部達成:** allowlist、staging、CPI 5/CTI 31/earnings 8/人口2 outputs、隔離runtime validatorの実装・fixture testsはある。46件はrequired output契約であり生成数ではない。`--check` は未コミットcanonical移行差分を検出し `canonical-edited` でtransport前に停止したため、全件stagingとstaged runtime validationは未実施。
5. **fingerprint・check・raw lineage — 一部達成:** semantic fingerprint、`--check` no-publish、no-op/raw hash挙動のfixture testsは合格。latest `--check` は `canonical-edited` でtransport前に停止し、実データのno-op/revision受入は未実施。
6. **journal・rollback・recovery — 一部達成:** allowlist付きjournal、backup、rollback/recoveryのfixture testsは合格。実canonical publish、実障害復旧は未実施。
7. **運用境界 — 一部達成:** `run_all_conversions.sh` の事前確認・失敗伝播と手動CLI境界を実装し、全test/build/smoke等のrepository gateが合格。初回source取得、publish/recoveryの実地確認は未実施。
8. **品質証拠 — 一部達成:** latest focused suite 84/84、全体test 1389 passed・4 skipped、lint、type-check、build、browser smokeは合格。21列CP932 source、6系列mapping、CY annual handling、employment/part-time migrationは実装・検証済み。`--check` は `canonical-edited` のためtransport前に停止し、実source CLI fetch、全46 outputsのstaged runtime suite、publish/recoveryは未実施。Plan52全体は未完了。

### 受入シナリオ例

- **WHEN** APIが複数ページを返す、**THEN** `NEXT_KEY` を使って最終ページまで取り、全件またはregistryで固定した必要範囲が連続していることを確認する。
- **WHEN** HTTP 200のHTMLやAPI業務statusエラーが返る、**THEN** raw sourceとして受理せず、canonical成果物を変更せず失敗する。
- **WHEN** 公式表に複数候補、分類変更、基準改定、schema差がある、**THEN** 最大ID等で自動採用せず、対象adapterを停止してregistry定義の見直しを要求する。
- **WHEN** 現役consumerが使う古い月次値が公式改訂される、**THEN** 対象全期間を再取り込みし、rawからnormalizeと全下流派生を再生成する。
- **WHEN** 最新公表済みのsource頻度に対して先の月/四半期値がまだ収録されていない、**THEN** 未来値を補完せず、source公表日と頻度に応じた最終収録期間を報告する。
- **WHEN** どれかのsourceまたは派生検証が失敗する、**THEN** 全CSV/metadata/manifestの既存版を保持する。
- **WHEN** publish中に例外または中断が起きる、**THEN** 次回起動時にjournalから復旧し、復旧完了前は新規runを開始しない。
- **WHEN** `--check` 開始時に未完了publish journalが存在する、**THEN** canonicalを書き換える復旧を実行せず `recovery-required` で停止する。
- **WHEN** publish対象canonicalにローカル編集または未コミット変更がある、**THEN** その対象を上書きせず停止し、無関係なファイルの変更は許容する。
- **WHEN** `pnpm data:refresh --check` を実行する、**THEN** 取得・正規化・派生生成・最終検査を行い、publishせず変更概要とsource別判定を返す。
- **WHEN** sourceや派生に意味的差分がない、**THEN** semantic fingerprintでunchangedと判定し、取得時刻だけの更新をしないのでcanonical Git差分がゼロとなる。今回のraw bytes SHA-256と取得証跡はgitignore領域に残し、既存追跡raw/来歴は保持する。
- **WHEN** 一括refreshの対象を決める、**THEN** 現行画面/計算と必須data-quality検証からruntime依存を逆引きし、必要なraw・照合snapshot・derivedだけを対象とする。未使用GDP quarterly artifactsや動的proxyの任意検索表は更新しない。
- **WHEN** GDP quarterly supportのloaderやmetadataが存在するが、現行runtime consumerから到達しない、**THEN** GDP入力・ESRI取得・e-Stat照合・GDP派生は更新対象へ含めず、その理由をinventoryに記録する。
- **WHEN** 現役CTI計算が `official-cti-2025-long-term`、Plan39 artifactsまたはそのmetadata/manifestに依存する、**THEN** 過去plan起源だけを理由に除外せず、対応するraw/normalized/manifestと派生を一緒に扱う。
- **WHEN** 一括refreshの現役対象がそろっている、**THEN** 必須sourceのskipなしで全対象を処理する。由来未確定または未実装adapterがある間は成功とせず、完成判定もしない。

## テスト・検証計画

ネットワーク依存テストではなく制御可能なfixtureで次を検証する。

- API paging最終ページとページ途中の通信失敗、429再試行上限、5xx上限、HTTP 200エラーページ、JSON業務status失敗、timeout、limit/coverage不足。
- official fileのHTML/空/404、文字コード/BOM、XLSX誤形式、schema/title/sheet/series identity違い。
- statsDataIdとstatInfId混同、複数候補、未知source/分類、単位・基準年の変更、期間後退、過去改訂反映、重複、欠測と0、非有限値。
- 依存DAG再生成、staging rootに限定したdata-quality検証、同じsemantic fingerprintでのno-op、今回raw hashのrun領域記録、既存追跡raw/来歴の保持、履歴保持、allowlist path escape拒否。
- lock競合、publish前失敗、publish中断・rollback・次回recovery、`--check`無変更、秘密情報漏洩検査。

既存 `package.json` の検証入口に合わせて `pnpm lint`（`lint:fast`）、`pnpm type-check`、`pnpm test`（対象suite）、対象データ品質テスト、必要な`pnpm build`と関連smoke testを実行する。API proxy回帰も既存route testで確認する。プロジェクト全体の全browser/e2eを初版CLIの常時ゲートにはせず、影響面に応じて選択する。対象testファイルとコマンドの実在は実装時に確認する。検証を未実行のまま成功扱いにしない。

仕様書は実装変更と並行して `openspec/specs/nextjstest/spec.md` を更新し、Data Sources / Data Flow / Component Tree / Requirementsを同期する。要件にはWHEN/THENシナリオを記載する。本計画ではJEVチェックポイント実行を完了条件に含めない。JEV判定を利用する場合も、通常のlint/type-check/test/coverage/spec-refs/smokeの代替にしない。本計画の策定にはJEVレビューを適用しない。

## 開発者の実行手順案

1. e-Stat公表後、他のapp/data readerが起動していないことを確認する。公開中はcanonicalの複数flat fileが一瞬ずつ置換されるため、最終反映時には読者停止が必要。CLIは管理対象canonicalのローカル編集/未コミット変更だけをpreflightし、該当ファイルがあればpublishを止める。無関係なファイル変更は許容する。
2. 必要なAPI用 `ESTAT_APP_ID` をCLIから参照可能な `.env.local` または明示env fileに設定する。値をコマンド引数・ログ・terminal echoへ出さない。公式ファイル取得だけの系列では不要。
3. `pnpm data:refresh --check` を実行し、source別候補、収録末尾、公表日、改訂、差分、検査結果を確認する。失敗があれば計画/registryを見直し、publishしない。
4. 確認が済んだら `pnpm data:refresh` を実行する。成功時にsourceごとの取得/unchanged/revision/coverage/publish概要をgitignore領域のreportに記録する。
5. 差分と検証結果をreviewし、通常の開発者手順でcommit/pushを判断する。CLIは自動commit/pushしない。

## 変更ファイル候補

- `package.json`: `data:refresh` script。
- `scripts/data-refresh/**`: registry、transport、runner、adapters、validation、テスト用fixture。
- `scripts/ts_converters/**`、`scripts/fetch-cti-basic-series-2025.mjs`、`scripts/update_earnings_from_estat.ts`、`scripts/run_all_conversions.sh`: 再利用・wrapper化・置換・廃止のうち棚卸しで決めた範囲。
- 対象CSV、raw snapshot、metadata、manifest、series-map等の成果物。由来未確定ファイルの更新は定義確定後のみ。
- `server/lib/dataIo.ts` / `server/lib/data-loader/**`: staging rootを受ける検査・loader接続が必要な範囲に限定。
- `openspec/specs/nextjstest/spec.md`: source・flow・依存・要件シナリオ。
- 対象data-quality / adapter / CLIテスト、および開発者向け実行手順（既存の適切な文書を実装時に選定）。
- gitignore領域: run report（volatileな取得時刻、今回取得raw hash/証跡、semantic fingerprint比較）、lock、journal、staging/backupの運用置場。同じsemantic fingerprintなら追跡rawは既存版を保持し、今回取得raw bytesはrun領域だけに置く。semantic変更時だけ取得原本byte列を追跡rawとして公開する。raw成果物の追跡範囲は既存repo規約・容量を確認して対象ごとに決める。

## 内部調査で解決する事項

- CPIの意味的候補解決と既存long CSV・派生出力のsource mappingはコード化済み。実API候補と実取得データによる最終照合は未実施。
- 公式e-Statの21列CP932/Windows-31J CSV（`種別=指数`、TL/T/0）と6系列のcanonical 438/438か月値対応を照合・実装済み。raw 439月次+36 `CY` 年次行をparseし、年次値はCYから採用、不完全な半期/四半期/年度値は空欄に保持する。employment indexを正し、元438パート比率を別CSVに保存した。`pnpm data:refresh --check` はmigration対象canonicalの未コミット差分を理由に `canonical-edited` でtransport前に停止。残るのは通常状態での実source CLI fetch/staging、staged consumer suite、publish/recoveryの受入である。`hon-mks202512.csv`、`hon-mks202606.xls`、`earnings_method_b_202606.csv` は別定義の成果物として相互関係を確認するまで混在させない。
- 人口CSVと `lt01-b10.xlsx` のローカル出典・runtime consumer・adapter責任は特定済み。公式sourceからの再取得とstagingでの内容突合は未実施。
- cti-size-composition内の各rawの発行元と、どのderivedがe-Stat変更で再計算されるか。家計調査等の非e-Stat入力は初版で固定してよいか、hash照合契約。
- 旧変換binary/shellの現存利用者、出力、廃止時の互換要否。
- 各adapterで必要な最小取得範囲、API/file配布の正式な認証要件と規約、metadataの改訂日表現。
- 複数ファイル公開時の開発運用（Next.js等読者停止）とjournalのdurability/復旧方式。
- raw公式取得物の追跡方針・repoサイズ影響・既存 `.gitignore` に対するrun artifact置場。

## 完成基準

- runtime consumerと必須data-quality検証から逆引きした実利用対象のみのsource inventoryに、必要なe-Stat由来入力と全影響derivedが載り、非e-Stat入力・由来未確定・未使用候補の区別が明確。
- 実利用の管理対象全件に意味的identity・取得方法・adapter・検査・依存・出力があり、必須対象を黙ってskipしない。過去planやloader定義、artifact存在のみで未使用対象を追加しない。
- Node24/pnpmで、アプリ起動なしに `pnpm data:refresh` と `pnpm data:refresh --check` を手動実行できる。自動スケジュールは導入しない。
- check mode、no-op、全期間の過去改訂反映、fail-closed、staging品質検証、lock/recovery/rollback、秘密情報保護がfixtureと適切な検証で確認済み。現役CTIのruntimeと品質検証依存は全て含み、未使用GDP quarterly artifactsは明確に除外される。
- 対象全sourceとdependent成果物が成功したときだけcanonical一式を更新し、失敗は非zeroで既存版を保持する。publish時の読者停止条件と失敗時復旧手順が文書化される。
- data-quality・API proxy回帰・lint・type-check・関連test/build/smokeが実施され、結果が記録される。OpenSpecが実装と同期する。
- JEVチェックポイント実行は本計画の完了条件に含めない。commit/pushはCLIが行わない。
