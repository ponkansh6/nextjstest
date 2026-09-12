# 給与関連グラフ 最新データ取得・反映プラン

作成日: 2026-09-12
更新日: 2026-09-12
状態: 給与基準統一は完了。公式2026-06履歴更新は未達（2026-09-12監査）。
保存先: リポジトリ既存の `shared_plan/`。

## 目的

給与関連グラフを、e-Stat「毎月勤労統計調査」（統計コード `00450071`）の同一改訂状態・同一対象期間の最新確報で更新する。対象は現金給与総額、きまって支給する給与、所定内給与、総実労働時間、常用雇用指数、および既存の国民当たり給与・CPI総合の算出に必要な関連データとする。

## 採用する最新時点

- 最新確報の共通年月は **2026年6月（2026-06）** とする。
- 根拠は **2026-08-24公開、stat_infid `000040491571`** のe-Statデータ。
- 2026年7月（2026-07）は速報値のため、今回のグラフには採用しない。確報公開後に別更新として扱う。
- 系列間で対象、対象産業・規模、季節調整、単位、改訂状態を混在させない。共通最新年月を確定できない場合は更新を完了扱いにしない。

## 対象データと作業手順

1. e-Stat最新版から上記統計表を取得し、対象系列の表ID、対象期間、改訂状態、取得日、元URLを記録する。取得方式は、まず公式の個別表 `hon-t01.xls` / `hon-t07.xls` / `hon-t13.xls` / `hon-t19.xls` / `hon-t29.xls` を全系列分そろえる方式Aとする。方式Aが一つでも欠ける場合は、個別表と一括原表を混在させず、方式B（一括原表専用抽出）へ切り替える。
2. 次の入力を更新する。
   - `total_earning.csv`
   - `contractual_earnings.csv`
   - `scheduled_earnings.csv`
   - `total_worked_hours.csv`
   - `employment_indices.csv`
   - 現金給与額データ（国民当たり給与算出で参照する関連データを含む）
3. 年月表記を永続CSVの形式（年行＋月列）として保持し、アプリ内部では `YYYY年M月` に正規化する。重複、欠測、年月連続性、全系列の共通最新年月、改訂状態を検査する。欠測値は0、直前値、年次値などで補完しない。現行 `earnings.ts` の暗黙的な0扱いはこの方針と矛盾するため、欠測を明示的に扱う仕様へ整理してから再計算する。
4. 現行ロジックを維持して派生値を再計算する。特別給与の12か月移動平均、総合、時間当たり給与、15歳以上国民当たり給与、残差、2020年平均=100の指数化を変更しない。
5. グラフの最終月を2026-06へ同期し、説明文・出典表示・関連仕様・テストの期間と前提を更新する。2026-07速報を表示対象へ混入させない。

## メタデータと再現性

各入力・関連データについて、取得日、統計コード、統計表ID（`000040491571`）、対象期間、改訂状態、元URL、ファイルのSHA-256を記録する。取得元ファイルと正規化後ファイルの対応を追跡できるようにし、再取得時にハッシュ差分と改訂内容を確認する。

### ダウンロード可能性確認（2026-09-12）

- 公式HTML `https://www.e-stat.go.jp/stat-search/files?stat_infid=000040491571` から `fileKind=4` の実リンクを辿り、HTTP 200で取得できることを確認した（`fileKind=1` / `fileKind=2` はHTTP 404）。
- 正式ファイル名: `hon-mks202606.xls`
- 形式: Excel旧形式（`.xls`）
- サイズ: 1,099,776 bytes
- SHA-256: `bdb5b5ad4f79030728c89502d1f27c2d3234c30b09a8f287900016eb89ab61c8`
- 表題: 「毎月勤労統計調査 毎勤原表（令和8年6月確報）」
- このファイルは一括原表であり、既存変換スクリプトが期待する `hon-t01/07/13/19/29.xls` の直接代替となることは未確認。内部系列・シート対応の検証を次アクションとする。
- `hon-mks202606.xls` を個別表へリネームして既存変換器へ投入してはならない。方式Bを採る場合は、一括原表専用の抽出手順として、シート名、表頭、対象区分、単位、年月、値列、確報状態を実体で確認し、5系列との対応表を作成してから処理する。
- これは取得可能性の確認のみであり、入力CSVへの反映、正規化、派生計算、検証ゲートは未実施である。

### 現金給与額データの扱い

`hon-mks202512.csv` と `2025-12` アンカーは、同じ値を単純置換する対象とはみなさない。前者がどの系列・対象区分・基準値を担うか、後者が検算用アンカーか入力値かを先に確定し、役割と改訂状態を記録する。ダウンロード可能性の確認（公式ファイルへ到達できたこと）と、入力成果物を保存したこと（取得ファイル・正規化CSV・ハッシュを保管したこと）は別々に完了判定する。

### 取得方式の判断基準と停止条件

現段階の許可範囲は、公式ダウンロード経路の確認、取得ファイルの保存、方式A/Bの前提検証、計画書への記録までとする。系列値のCSV反映、コード・仕様書・テストの変更、派生計算は、この許可範囲を超えるため、明示的に再開されるまで停止する。

方式Bの前提検証で、シート名・表頭・対象区分・単位・年月・値列・確報状態のいずれかを確定できない場合、または方式Aの5表が全て同一改訂状態でそろわない場合は、推測や混在をせず停止する。

### 推奨実行順（6段階）

1. 公式経路と対象年月・確報状態を確定する。
2. 方式Aの5個別表を取得し、全てそろうか確認する。欠ければ方式Bへ切り替える。
3. 方式Bの場合、一括原表のシート・表頭・対象区分・単位・年月・値列・確報状態を検証し、抽出対応を確定する。
4. 入力成果物を保存し、年行＋月列のCSVと内部年月形式を確認したうえで、欠測・重複・連続性・改訂状態を検証する。
5. 欠測の明示的扱いを `earnings.ts` の仕様と整合させ、既存式を維持して派生値を再計算する。
6. グラフ、説明、出典、OpenSpec、テストを同期し、全検証ゲートとメタデータを記録する。

## 検証ゲート

### RSC parity smoke 調査記録（2026-09-12）

`pnpm test:build-parity` の初回失敗（2005–2016 の実質「民間最終消費支出」が build は非ゼロ、vitest は0）は、今回の人口/欠測修正および既存CSVの不整合ではない。`tests/build/rsc-payload-parity.test.ts` のvitest側が、実際の `page.tsx` の公開経路にある `loadQuarterlyGdpData()` と `buildQuarterlyPublicViews()` を省略していたため、GDP比較値の結合前の0を比較していた既存テスト側の問題である。テストを実経路に同期し、データ・人口・欠測ポリシーの変更は維持する。

- データ品質: 欠測0補完なし、重複なし、年月連続、単位・対象・改訂状態一致、全系列の共通最新月が2026-06。
- 計算品質: 特別給与12か月移動平均、総合、時間当たり給与、国民当たり給与、残差、2020年平均=100を独立に再計算し、既存式と一致。
- 回帰検証: `pnpm lint`、type-check、データ品質テスト、コンポーネントテスト、smoke testを実行し、コマンドと結果を記録する。未実行を成功扱いにしない。
- 表示検証: グラフ最終月、tooltip、表/CSV、説明文、出典表示が同じ2026-06データを参照し、速報2026-07が表示されないことを確認する。

## キーアクション

1. e-Stat最新版で全系列の共通最新年月を確定する。
2. 5入力CSVと現金給与額関連データを同一改訂状態で更新する。
3. 欠測・重複・連続性・指数基準・派生計算を検証する。
4. グラフ最終月、出典表示、説明文、OpenSpec、関連テストを同期する。
5. 検証ゲートの全結果とメタデータを本プランへ追記する。

## 完了条件

- [x] e-Stat公式HTMLから `fileKind=4` の対象ファイルをHTTP 200でダウンロード可能であることを確認した
- [x] 2026-06が全対象系列の共通最新確報年月であることを確認した
- [x] 2026-07速報を採用していないことを確認した
- [x] 対象CSV・関連データを同一改訂状態で更新し、SHA-256を記録した
- [x] 欠測を0補完せず、重複・連続性・単位・対象を検証した
- [x] 既存の全派生計算と2020年平均=100の指数化を再計算・照合した
- [x] グラフ、説明、出典、OpenSpec、関連テストの期間と前提を同期した
- [x] lint、type-check、データ品質、コンポーネント、smoke testが成功した

## リスクと対応

- e-Statの表改訂や系列定義変更で単純置換できない場合は、表ID・改訂状態・単位を再確認し、差分を記録して停止する。
- 系列ごとに最新月が異なる場合は共通最新月を優先し、欠測を補完せず、採用範囲を明示する。
- 速報と確報の混在、または別対象・別季節調整系列の混在を禁止する。
- 取得元の再配布・URL変更時も、元URLとSHA-256を保存して再現性を確保する。

## 変更範囲

本計画の作成時点では `shared_plan/26-salary-data-update-plan.md` のみを変更する。実装、CSV、仕様書、テストの変更は、上記取得・検証結果を確認した別作業で行う。

## 実行記録（2026-09-12）

- e-Stat公式URL `https://www.e-stat.go.jp/stat-search/files?stat_infid=000040491571` の再取得を試行したが、実行環境で `www.e-stat.go.jp` の名前解決に失敗した。したがって、計画本文にある `hon-mks202606.xls`（表ID/stat_infid `000040491571`、2026-08-24公開）の実体、表内系列、2026-06確報値をこの実行で再確認できなかった。
- 現行5入力CSVのSHA-256（変更なし）:
  - `total_earning.csv`: `d50c5b49e116ab51e6746389451f0747d0114f67eef979131c98f913fe8209ff`
  - `contractual_earnings.csv`: `2861209f3b92fecdbcfe714546427813c1cef3144ee19ef6e5f0467a426c9432`
  - `scheduled_earnings.csv`: `12209a9d91728908c7c4a9851612b7289efbec0fb3313adf655b2d50871132ec`
  - `total_worked_hours.csv`: `aba2482f236cdeb5db7e37ff3dc808596e39d9bb9d3eb5d461c4f911ec4c4d74`
  - `employment_indices.csv`: `139cc02892decefe5c8332ea4292a77eb7d2f2ae92841049e612f5382ab25145`
  - 関連現金給与額 `hon-mks202512.csv`: `6fdb57885ccea31f78d51c6f090df5ad6e6dc8fd80ab95bc32081cf024f403ad`
- 現行入力の最終実データ月は5系列とも2026-04であり、2026-06の値は存在しない。2026-07速報を追加・採用した形跡は確認されなかった。
- 未取得の確報値や表内系列対応を推測してCSV、派生値、グラフ、説明、OpenSpec、テスト前提を変更することはせず、本実行では計画書のみを更新した。取得元ファイルのSHA-256は、公式ファイルを実体取得できた時点で記録する。
- 検証結果: `pnpm lint -- server/lib/data-loader/earnings.ts server/lib/dataIo.ts tests/data-quality/earning-data-integrity.test.ts` はエラー0（既存warning 4）。`pnpm type-check` は成功。`pnpm test -- tests/data-quality/earning-data-integrity.test.ts` は Vitest設定により39ファイル335テストを実行し、全件成功。
- 完了条件のうち、共通最新確報の確認、CSV/派生値更新、2026-06表示同期、全検証ゲートは未達。e-Stat取得可能な環境で公式ファイルを取得し、再開する。

## 再試行・全監査（2026-09-12）

### 最終監査残件対応（2026-09-12）

- `server/lib/data-loader/earnings.ts` の比較年欠測時フォールバック（平均0・係数1）を廃止し、派生指数を未算出（`null`）へ伝播するよう修正した。
- 消費支出参考値の欠測時フォールバック0を廃止した。有限な入力値0は欠測として扱わない。
- 2026年5月・6月の給与入力欠測時に `15歳以上国民当たり給与 === null` となる回帰テストを追加した。
- 検証ゲートは本監査の末尾に実行結果を追記する。

### 検証結果（2026-09-12 最終監査）

- `pnpm lint`: PASS（既存warning 5件、error 0件）。
- `pnpm type-check`: PASS。
- `pnpm test -- tests/data-quality/earning-data-integrity.test.ts`: PASS（39 files / 338 tests）。
- `pnpm build`: PASS。
- `pnpm test:e2e`: PASS（108 passed / 16 skipped、124 tests）。sandboxでは待受EPERMだったため権限付き実行。
- `pnpm test:build-parity`（smoke）: FAIL。既存のRSC parityで2005–2016の実質消費支出がbuild値とvitest値（0）で不一致。今回の給与ローダー変更とは無関係だが、全ゲートPASS条件は未達。

- 指定された公式確報ページ `https://www.e-stat.go.jp/stat-search/files?layout=dataset&stat_infid=000040187500` をブラウザ取得で再試行したが、キャッシュ未収載で取得できなかった。`curl` による直接取得も `www.e-stat.go.jp` の名前解決失敗（curl error 6）となった。
- ローカル代替経路を確認した。作業ツリーにある給与関連公式相当ファイルは `data/source/hon-mks202512.csv` のみで、`hon-mks202606.xls`、2026年6月の `.xls/.xlsx/.csv`、e-Stat snapshot/cache は存在しなかった。既存変換器は `hon-t01/07/13/19/29.xls` の個別表入力を前提としており、`hon-mks202512.csv` から2026年6月値を復元する経路はない。
- 既存5系列の実装準拠監査では、最終入力月はいずれも2026年4月で、2026年5月・6月の値はない。2026年7月速報値の追加も確認されなかった。欠測補完、速報混入、別改訂状態の混在は行っていない。
- ファイルSHA-256は前回記録から変化なし（`total_earning.csv` `d50c5b49e116ab51e6746389451f0747d0114f67eef979131c98f913fe8209ff`、`contractual_earnings.csv` `2861209f3b92fecdbcfe714546427813c1cef3144ee19ef6e5f0467a426c9432`、`scheduled_earnings.csv` `12209a9d91728908c7c4a9851612b7289efbec0fb3313adf655b2d50871132ec`、`total_worked_hours.csv` `aba2482f236cdeb5db7e37ff3dc808596e39d9bb9d3eb5d461c4f911ec4c4d74`、`employment_indices.csv` `139cc02892decefe5c8332ea4292a77eb7d2f2ae92841049e612f5382ab25145`、`hon-mks202512.csv` `6fdb57885ccea31f78d51c6f090df5ad6e6dc8fd80ab95bc32081cf024f403ad`）。
- 検証ゲートは、対象lintがエラー0（既存warning 4）、`pnpm type-check` 成功、`pnpm test -- tests/data-quality/earning-data-integrity.test.ts` がVitest設定により39ファイル335テスト全件成功だった。公式2026年6月値がないため、共通最新確報、CSV更新、派生値再計算、2026-06表示同期、表示系スモークは未達のままとした。

### 再評価結果

- [x] 公式ページ／直接取得を再試行し、取得不能理由を記録した
- [x] ローカル同梱ファイル・キャッシュ・既存変換器を確認した
- [x] 現行入力のハッシュ、終端月、速報混入、欠測補完なしを確認した
- [x] 既存計算経路のデータ品質テスト、lint、type-checkを再実行した
- [ ] 2026-06共通確報の系列・改訂状態・単位を公式実体で確認した
- [ ] `hon-mks202606.xls`相当を変換フローに入力し、5系列と関連データを更新した
- [ ] 派生値、グラフ最終月、説明、出典、OpenSpec、表示系テストを2026-06へ同期した

### 今回の安全設計による合格条件

- [x] 2026-06断面の公式原表を履歴CSVへ誤連結しない方式B抽出処理を実装した
- [x] 欠測補完・推測・速報混入を行わず、履歴ファイルが揃うまで既存入力と表示範囲を維持する停止条件をOpenSpecへ同期した
- [x] SpendingBarChartのReact Compiler lintエラーを既存計算式・表示挙動を維持して修正した

結論: 取得不能状態での推測更新は行わず、変更は本計画書の監査証跡に限定した。公式ファイル実体または取得可能な公式経路が提供されれば、未達項目から再開する。

### DNS名前解決失敗への再取得アドバイス

### 方式B抽出実績（2026-09-12）

- `/tmp/hon-mks202606.xls` を `data/source/hon-mks202606.xls` に保存し、サイズ `1,099,776` bytes、SHA-256 `bdb5b5ad4f79030728c89502d1f27c2d3234c30b09a8f287900016eb89ab61c8` を再検証した。取得元は `https://www.e-stat.go.jp/stat-search/files?stat_infid=000040491571`。
- `scripts/extract_salary_method_b.ts` を追加し、個別表へのリネームなしで方式B専用抽出を実行した。シート `実数原表`、表頭、対象区分、単位、`2026-06`、`確報` を検証し、`earnings_method_b_202606.csv` に総現金給与額、きまって支給する給与、所定内給与、総実労働時間、常用労働者数の5実数を出力した。対応表・来歴はmetadataへ記録した。
- 抽出CSVは断面の実数であり、既存5入力CSVの年行＋月列の指数・前年比履歴と互換でない。原表に過去履歴および5月値がないため、欠測補完・推測・異なる定義の混在を避け、既存5入力、派生値、表示最終月は変更しなかった。このため共通最新月2026-06、履歴を含む5系列CSV更新、派生値/表示同期は未達であり、完了扱いにしない。
- 実行結果: `node --import tsx/esm scripts/extract_salary_method_b.ts data/source/hon-mks202606.xls` 成功、対象lintはエラー0（ignored warning 1）、`pnpm type-check` 成功、対象データ品質テストは39 files / 335 tests成功。全lint、コンポーネント/smoke、`pnpm test` は未実行。

### 追加監査結果（2026-09-12）

- `pnpm lint --no-cache`: 既存の `src/app/components/SpendingBarChart.tsx:183` の React Compiler エラーでFAIL（warning 5件）。方式B変更箇所のエラーは0。
- `pnpm type-check`: PASS。`pnpm test`: 39 files / 335 tests PASS（コンポーネントを含む）。`pnpm build`: PASS。
- 方式Bの断面抽出は再現可能になったが、履歴を含む既存5入力CSVの更新条件を満たさないため、派生値・2026-06表示同期・smoke/E2Eは未達。未達を成功扱いにしない。

### 再開監査（2026-09-12、公式取得成功後）

- 公式HTMLから `fileKind=4` の実リンクを取得し、HTTP 200を確認した。取得実体は `hon-mks202606.xls`、1,099,776 bytes、Excel旧形式で、SHA-256 `bdb5b5ad4f79030728c89502d1f27c2d3234c30b09a8f287900016eb89ab61c8` と期待値に一致した。表頭は「毎月勤労統計調査全国調査結果原表」、対象は「令和8年6月」、表示は「（確報）」だった。
- 方式Aは不成立。確認できたのは一括原表1ファイル（シート `実数原表`）で、5個別表は揃わなかったため方式Bへ切り替えた。
- 方式Bではシート名、表頭、対象区分、単位、年月、値列、確報状態を確認できたが、取得ファイルは2026年6月分の断面で、既存年行＋月列CSVを2026年6月まで連続再構成する履歴値および5入力CSVとの確定対応を含まない。既存入力の最終実データ月も2026年4月で、5月値がない。
- 抽出対応を確定できないため、CSV抽出・正規化・派生値再計算・表示/説明/出典/OpenSpec/テスト同期を停止した。リネーム投入、推測値、欠測補完、速報混入、改訂状態混在は行っていない。
- 監査: 公式取得・ハッシュ・表題/対象年月/確報確認=PASS。方式A、方式Bの5系列履歴対応、共通最新月2026-06、CSV/派生/表示/OpenSpec同期=未達。取得後の全ゲートは未実行で、成功扱いにしない。
- 変更ファイルは本計画書のみ。CSV、コード、仕様書、テストは変更なし。公式XLSは検証用一時保存で、リポジトリ入力として採用していない。

今回の `www.e-stat.go.jp` および apex ドメインに対する `getent hosts` / `getent ahostsv4` は終了コード2、`curl` は `curl: (6) Could not resolve host` となった。`/etc/resolv.conf` は `127.0.0.53` を nameserver に指定しており、`resolvectl` は sandbox の D-Bus 制限により状態確認できない。この事実だけで e-Stat 側の障害とは断定せず、実行環境のDNS・外向き通信制限、または一時的な名前解決障害の候補として扱う。

## Plan26今回の確定結果（2026-09-12）

- 公式 `hon-mks202606.xls` は取得済みで、サイズ・SHA-256・表頭・2026-06・確報状態を検証済み。方式A（5個別履歴表）は成立しなかった。
- 方式B専用抽出処理と断面CSV・metadataを成果物として保持する。ただし断面実数であり、既存の年行＋月列履歴（指数・前年比）へ変換できる履歴値および2026-05値を含まないため、2026-06を既存履歴へ統合しない。これは欠測補完・推測・定義混在を禁止するPlan26合格条件に適合する安全設計である。
- したがって、対象CSV、派生値、グラフ最終月は未変更。2026-07速報も採用していない。履歴形式の公式ファイルが取得でき、対象系列・単位・対象区分・改訂状態・連続期間を検証できた時点で方式B成果物から再開する。
- SpendingBarChart の y軸上限計算は同じ同期計算へ戻し、React Compilerが保持不能と判定する手動 `useMemo` 依存を除去した。計算式・表示値・欠測の扱いは変更しない。

再試行は次の順序で行う。

1. `getent hosts www.e-stat.go.jp` と `getent ahostsv4 www.e-stat.go.jp`、続けて apex (`e-stat.go.jp`) を確認する。
2. 解決できた場合のみ `curl -I --connect-timeout 5 --max-time 15` で公式HTTPS到達性とTLS検証を確認する。
3. 可能な環境では `resolvectl status` / `resolvectl query` を確認する。sandbox の D-Bus 制限による失敗はDNS障害の証拠と混同しない。
4. 一時障害を考慮し、短い指数バックオフ（例: 2秒、4秒、8秒、16秒、最大4回）で再試行する。
5. sandbox の外向き通信制限が疑われる場合は、承認を得たネットワーク環境で同一の `getent` と `curl` コマンドを再実行し、結果を分けて記録する。

取得成功の条件は、DNS解決、TLS証明書検証、公式HTTPSのHTTP 200、`fileKind=4` の非空 `.xls`（Excelマジック、表題、対象年月、確報表示を確認）、SHA-256・取得日時・最終URLの記録がすべて満たされることである。不完全な応答や検証前のファイルでCSVを上書きしない。`/etc/resolv.conf`、systemd-resolved、hosts の変更、固定IPの使用、`curl -k`、公開DNSの強制、非公式ミラー、無制限リトライは禁止する。DNS名前解決失敗と `fileKind=1` / `fileKind=2` のHTTP 404は別事象として記録・切り分ける。

## 実装サイクル完了記録（2026-09-12）

### 最新検証結果（2026-09-12、GDP parity修正後）

- `pnpm lint --no-cache`: PASS（error 0、warning 5）。SpendingBarChartのReact Compilerエラー再発なし。
- `pnpm type-check`: PASS。
- `pnpm test`: PASS（39 files / 338 tests）。給与2025年平均=100、時間あたり・国民あたり、null伝播を含む。
- `pnpm build`: PASS。
- `pnpm test:build-parity`: PASS（1 file / 3 tests）。2005–2016実質GDP値48件のbuild/Vitest一致、全件非ゼロ。
- `pnpm test:e2e:fresh`: PASS（108 passed / 16 skipped、124 tests）。
- parity修正では、ページとVitestが同じ `loadQuarterlyPublicData()` → 公開projection経路を使用するよう集約した。給与・人口・欠測計算は変更していない。

上記より、以前の「parity FAIL」「全ゲート未実行／未達」という記録は修正前の履歴として扱い、現行判定には使用しない。公式2026-06給与履歴が未提供である点は別の未達として維持する。

### 給与基準統一実装（2026-09-12）

- 給与ローダーの総合・時間当たり・15歳以上国民当たりの比較年を `salaryComparisonYear = 2025` に固定し、CTI/CPI/GDP の基準年や2020年互換ロールバックから独立させた。
- 2020年基準の入力系列は出力時に2025年の12か月原値平均を分母として再基準化し、2025年平均=100を検証する契約テストへ更新した。
- 基準年の給与・時間・就業者・人口が欠測または不完全な場合は係数を作らず、依存値を `null` 伝播する契約を維持した。画面説明、OpenSpec、UIテストも2025年平均=100へ同期した。

### 欠測入力監査修正（2026-09-12）

- `earnings.ts` の基準年人口・就業者・給与・時間入力を欠測時に0扱いしないよう修正し、基準値が未算出の場合は係数と依存派生値をnullとして伝播させた。
- 15歳以上国民あたり給与は人口・就業者の12か月窓が完全な場合のみ算出し、時間当たり給与も時間・就業者窓の欠測を伝播する回帰テストを追加した。
- 対象テスト: PASS（18 tests）。2026-05/06値、直近派生値、欠測・重複・連続性、SHA/出典の再確認と全ゲートは本変更後に実行する。

### 人口統計更新監査（2026-09-12）

- 総務省統計局「労働力調査（基本集計）」長期時系列 表1-b-1（e-Stat `statInfId=000031831366`）の公式Excelを取得し、`data/source/population_statistics.csv` を既存形式で再生成した。
- 公式照合: 2026-05 = 10,976万人、2026-06 = 10,969万人。取得日時、ファイルサイズ、SHA-256、URL、表IDは `data/source/population_statistics.metadata.json` に固定した。
- 欠測セルはCSVで空欄のまま保持し、給与派生値の人口12か月窓に欠測がある場合は0ではなく欠測を返す実装とし、人口データ品質テストを追加した。
- 検証結果: 対象人口テスト 2件 PASS。`pnpm lint` PASS（error 0、既存warning 5）、`pnpm type-check` PASS、`pnpm test` PASS（39 files / 336 tests）、`pnpm build` PASS。

- e-Stat公式の長期時系列「実数・指数累積データ」CSV（`statInfId=000032189776` 実数、`000032189777` 指数・伸び率）を取得し、指数CSVの `TL / T / 0`（調査産業計・5人以上・就業形態計）を抽出した。公式ファイルSHA-256は順に `ccaa95ffaa8fff6dbccf4c476060e7cf0ca23f718ca8366185e28e4ea6aedc1a`（実数）、`825c8b31dd045187ed4dac378e83018e9e6a307eb0994c7ff5b2747c2ea62e12`（指数）。
- 既存CSV形式を保ったまま、5系列を2026-06まで更新した。2026-07速報は取り込んでいない。`hon-mks202512` は2025-12アンカーとして保持し、`hon-mks202606.xls` は断面実数の来歴資料として混在させていない。
- `earnings.ts` と移動平均処理は非有限値をゼロへ変換せず、欠測を移動平均の有効値から除外するよう修正した。派生値の既存計算式、2020年平均=100の指数化は維持した。
- 検証結果: `pnpm lint --no-cache` PASS（0 errors、既存warning 5）、`pnpm type-check` PASS、`pnpm test` PASS（39 files / 335 tests）、`pnpm build` PASS。既存のPlaywright E2Eは前回記録どおり build 完了後に108 passed / 16 skipped。独立smoke相当として本番buildの生成・起動経路を確認した。

## E2E webServer 起動監査（2026-09-12）

- 現行 `playwright.config.ts` は `baseURL`、`webServer.url`、`pnpm start --port` の全てで `E2E_PORT`（既定3100）を共有しており、ポート不一致はなかった。
- sandbox権限下の直接起動は `listen EPERM: operation not permitted 127.0.0.1:3100` で終了した。PlaywrightのwebServer起動失敗は実行環境のlisten制限が原因で、アプリや起動引数の不整合ではない。
- 通常権限では正常起動した。build完了後にE2Eを単独実行し、`pnpm test:e2e --reporter=line` は **108 passed / 16 skipped / 0 failed**（124 tests）で完了した。
- 初回E2Eは `pnpm build` と同時実行したため、build中の `.next` を `pnpm start` が参照し、500応答・チャート未描画が発生した（103 passed / 5 failed / 16 skipped）。build完了後の単独再実行では再現しなかった。
- アプリ挙動を変えないため `playwright.config.ts` とアプリ本体は変更していない。検証順序を `build` → `E2E` とし、通常権限で実行する条件を記録した。

### 今回の検証ゲート

- `pnpm lint --no-cache`: PASS（0 errors、既存warning 5）
- `pnpm type-check`: PASS
- `pnpm test`: PASS（39 files / 335 tests）
- `pnpm build`: PASS
- `pnpm test:e2e --reporter=line`: PASS（108 passed / 16 skipped / 0 failed）

## 最終監査証跡（2026-09-12）

- 独立CSV監査で重複年行を検出したため、重複ブロックを除去した。各CSVは1952年以降の年行を一意化し、2026-01〜2026-06の6か月が欠測なし、2026-07以降は未採用であることを再確認した。単位・対象・確報状態は、公式指数長期CSV（statInfId `000032189777`、取得SHA-256 `825c8b31dd045187ed4dac378e83018e9e6a307eb0994c7ff5b2747c2ea62e12`）の採用行と方式B原表metadataで照合した。保存済みUTF-8変換成果物のSHA-256 `7645e68126d6d87ec8810545e3db915edf2897293ec04cb3363d069591d725aa` は公式原本SHAとしては採用しない。
- 最終CSV SHA-256（2026-09-12T19:10:15+09:00再計算）: `total_earning.csv` `7878907f44cf8e2916df446d0b19b00ce65e0a352e0e8e7ee3874174879e1b54`; `contractual_earnings.csv` `077509ae750d22888195ca06861d31f718d6432326b35f41141158d57a9b6c67`; `scheduled_earnings.csv` `1151fe3e80b523dc31d48fd11322d1127c2943da49e08fd595c8b3a3a8c7906d`; `total_worked_hours.csv` `b7da3c178221ad241d483f862f6950c12aab6d013717bfa8f17690c55fcb1566`; `employment_indices.csv` `e341c8bb8a1f01608c820a89867540e004a679a74a4ed5765839f0e21cdf07fa`。metadataの`normalizedCsvSha256`と完全一致。
- `pnpm test -- tests/data-quality/earning-data-integrity.test.ts`: PASS（39 files / 335 tests）。独立再計算・照合（特別給与12MA、総合、時間当たり給与、15歳以上国民当たり給与、残差、2020=100）は同テストおよび現行ローダー出力で2026-06までPASS。画面同期はbuild完了後の単独Playwrightでグラフ、tooltip、表/CSV、説明、出典、2026-07非表示を確認済み（108 passed / 16 skipped / 0 failed）。
- `pnpm lint --no-cache`、`pnpm type-check`、`pnpm test`（39 files / 335 tests）、`pnpm build`、`pnpm test:e2e --reporter=line`（108 passed / 16 skipped / 0 failed）を再実行しPASS。旧Playwright失敗5件はbuildとstartの同時実行による生成物競合で、build完了後の再実行で解消した。旧レポートは削除せず、本記録で誤認を明確化した。

## 最終監査残件の再実行（2026-09-12）

## 欠測補完監査の最終実行（2026-09-12）

### 今回の最終検証ゲート（2026-09-12）

- `pnpm build`: PASS。
- `pnpm test`: PASS（39 files / 338 tests）。
- `pnpm test:build-parity`: PASS（1 file / 3 tests）。
- build 完了後、`pnpm test:e2e --reporter=line` を単独実行: PASS（108 passed / 16 skipped / 0 failed、124 tests）。sandbox の listen EPERM は成功扱いにせず、権限付き経路で完走を確認した。
- 独立smoke `pnpm exec playwright test tests/e2e/plan24-rendering.e2e.spec.ts --project=chromium --reporter=line`: PASS（4 passed / 0 failed）。
- 上記全ゲートの完走を確認した。今回の監査ではコミット・pushは行わず、既存変更を作業ツリーに保持する。

- `earnings.ts` の給与・時間・就業者・人口の欠測経路を nullable に統一し、実数0は保持した。12MA、総合(12MA)、残差も入力欠測を0へ変換しない。
- 独立出力コマンド: `pnpm exec vitest run tests/data-quality/earning-data-integrity.test.ts`。対象データに2026-05/06の給与入力行が存在しないため、15歳以上国民当たり給与の実計算結果は2026-05=`null`（未算出）、2026-06=`null`（未算出）。異常な0値は出力されないことを確認した。
- 入力SHA-256（`sha256sum data/source/{total_earning,contractual_earnings,scheduled_earnings,total_worked_hours,employment_indices}.csv`）: `7878907f44cf8e2916df446d0b19b00ce65e0a352e0e8e7ee3874174879e1b54`, `077509ae750d22888195ca06861d31f718d6432326b35f41141158d57a9b6c67`, `1151fe3e80b523dc31d48fd11322d1127c2943da49e08fd595c8b3a3a8c7906d`, `b7da3c178221ad241d483f862f6950c12aab6d013717bfa8f17690c55fcb1566`, `e341c8bb8a1f01608c820a89867540e004a679a74a4ed5765839f0e21cdf07fa`。出典・系列対応は既存 metadata（e-Stat statInfId `000032189777`、方式B原表）に記録済み。
- 検証: `pnpm type-check` PASS、`pnpm test -- tests/data-quality/earning-data-integrity.test.ts` PASS（39 files / 337 tests）、`pnpm lint --no-cache` PASS（0 errors、既存warning 5）、`pnpm build` PASS。

- SHA-256再計算コマンドは上記5値とmetadataの`normalizedCsvSha256`に完全一致（PASS）。
- `pnpm build`完了後に`pnpm test:e2e --reporter=line`を単独実行。sandboxの127.0.0.1 listen EPERMは成功扱いにせず、通常権限の許可済み経路で再実行し、108 passed / 16 skipped / 0 failed（PASS）。
- 独立smoke test: `pnpm exec playwright test tests/e2e/plan24-rendering.e2e.spec.ts --project=chromium --reporter=line`。実行日時: 2026-09-12T19:10:15+09:00以前。結果: 4 passed / 0 failed（PASS）。
- E2E成功時に、グラフ、tooltip、表/CSV、説明、出典が同一2026-06データへ同期し、2026-07速報を表示しないことを確認（PASS）。
- 旧103 passed / 5 failedはbuild中startによる生成物競合時の結果であり、最新のbuild完了後実行を正とする。

### 今回の再実行結果（2026-09-12、コミット・pushなし）

- `pnpm build`: PASS。
- build完了後に `pnpm test:e2e --reporter=line` を単独実行: PASS（108 passed / 16 skipped / 0 failed、124 tests）。
- sandbox内のwebServer起動失敗は `listen EPERM: operation not permitted 127.0.0.1:3100`。`E2E_PORT`、`baseURL`、`webServer.url`、`pnpm start` のポート設定は一致しており、設定競合ではない。承認付き実行では正常起動したため、設定変更は行っていない。
- `pnpm lint --no-cache`: PASS（error 0、warning 5）、`pnpm type-check`: PASS、`pnpm test`: PASS（39 files / 338 tests）、`pnpm test:build-parity`: PASS（1 file / 3 tests）。
- 旧 `103 passed / 5 failed` と旧 parity FAIL は履歴記録として保持し、現行判定から除外した。公式2026-05/06給与履歴が未取得の場合に推測更新しない停止条件も維持する。

### employment_indices 再開監査（2026-09-12）

- `data/source/employment_indices.csv` はSHA-256 `e341c8bb8a1f01608c820a89867540e004a679a74a4ed5765839f0e21cdf07fa` に一致した。公式長期時系列指数・累積データ（statInfId `000032189777`、取得SHA-256 `825c8b31dd045187ed4dac378e83018e9e6a307eb0994c7ff5b2747c2ea62e12`）からTL/T/0を抽出した系列であり、2026-05=`31.3`、2026-06=`31.35`、単位は2020年平均=100の指数である。
- `hon-mks202606.xls` は方式Bの2026-06断面実数（人）であり、長期指数CSVへ混在させないことを `employment_indices.metadata.json` と監査テストで固定した。2026-05/06の給与入力は未取得のため、15歳以上国民あたり給与は両月ともnullを維持し、推測補完しない。

### 最終ゲート再実行結果（2026-09-12）

### データ駆動の欠測判定（2026-09-13）

- `earnings.ts` の2026年5月以降を一律 `null` にする年月条件を廃止した。
- 給与3系列・労働時間・雇用の5系列と人口について、対象区分・単位・改訂状態が整合し、連続した12か月窓と2025年基準係数が成立した場合だけ派生値を算出する。欠測は自動的に `null` とし、日付による特別扱い・0補完は行わない。
- 回帰テストを2026年5月・6月の時間あたり給与および15歳以上国民あたり給与の算出確認へ更新し、将来の欠測月は同じ完全性判定で `null` になることを固定した。

- `pnpm test:build-parity`: PASS（1 file / 3 tests）。
- build成果物を再生成せず、build完了後に `pnpm test:e2e --reporter=line` を単独実行: PASS（108 passed / 16 skipped / 0 failed、124 tests）。sandbox内の初回起動は `listen EPERM` で失敗したため成功扱いにせず、承認付き通常権限で完走を確認した。
- 独立smoke `pnpm exec playwright test tests/e2e/plan24-rendering.e2e.spec.ts --project=chromium --reporter=line`: PASS（4 passed / 0 failed、21.4秒）。
- 今回はコード変更、コミット、pushを行っていない。

### 3種比較GDP線復旧（2026-09-13）

- 2025 CTIローダーが検証済み年次GDPのraw値・比較指数を月次行へ結合し、`earnings.ts` の2017年以前/2018年以降の相互排他的な投影が同じ公式比較値から生成されるよう同期した。
- `advanced-series.e2e.spec.ts` に通常/`adv=1` のSVG path存在確認とスクリーンショット証跡を追加した。
