# Plan50: 旧基準・ロールバック・不要互換経路の整理計画

> 作成日: 2026-10-03<br>
> 状態: **Phase 1 完了・Phase 2 進行中**。参照台帳は確定。spec/config先行更新は全39行分類＋config.yaml:31を含め適用完了（未コミット、spec.md 1505/2478行の旧文言等も修正済み）。実装コードは runtime 4ファイル（server/lib/data-loader/cpi.ts, cpiSource.ts, cpiValidation.ts, ctiValidation.ts）に変更あり（reason code union導入・2025型縮小・rollback-2020 option除去・isLegacy2020分岐削除等、未コミット）。テスト群は型不整合（24 errors）で未追随。<br>
> 対象: CPI/CTI対象runtimeにおける2020基準計算入力・fallback・rollbackの廃止と、CTI旧月次互換経路の棚卸し。

## 目的

**2020年基準を使わないことは決定済み**であり、この計画では再評価・承認待ちにしない。対象となるCPI/CTI実行経路は検証済みの2025年基準入力だけを使い、欠落・不整合・検証失敗時は旧基準へ切り替えず、`unavailable` と機械可読な理由を返してfail closedにする。実装対象の2020年runtime入力、resolver、status/API契約、専用metadata・fixture・テストを依存関係に沿って除去する。

この決定は、履歴資料や対象外の統計に記録された「2020年基準」というラベルを一律削除する指示ではない。対象経路で2020年データを計算入力、再試行候補、明示rollbackとして読まないことを保証し、無関係な過去データの来歴と説明は保持する。

「NewGraphで旧CTI月次系列が使われていない」ことだけを根拠に、CTIローダー、旧資産、データ品質検査全体を未使用とは判定しない。公開契約、他チャート、CSV、四半期変換、品質検査、fixtureを呼び出し元まで追跡してから削除対象を確定する。

## 現状と根拠

### CPI 2020基準fallback

- `server/lib/dataIo.ts` の `buildCpiFilePaths()` は2025年の `cpi_data2025_long.csv` / `contribution2025.csv` と旧 `cpi_data.csv` / `contribution.csv` のパスを返す。
- `server/lib/data-loader/cpiSource.ts` の `buildCpiSourceCandidates()` は2025ペア検証後に2020ペアも候補にし、`selectCpiPair()` が最初に通ったペアを選ぶ。これらのpath・candidate・選択statusは対象経路から除去する。
- `server/lib/data-loader/cpi.ts` は選択ペアの系列を読み込む。実質CTI投影では2025基準CPIを必須とする追加条件がある。
- `src/app/page.tsx` と `src/lib/chartInfoContent.ts` はCPIの基準年・fallback状態を画面や情報文へ伝える契約を持つ。2020経路の削除に伴い、status型/APIからfallback source/baseYear分岐を除き、画面・ログ・unavailable理由を2025-only契約へ整理する。
- `shared_plan/18-cpi-2025-fixed-weight-plan.md` は完全な2020ペアへのrollbackを過去の設計決定として記載している。本計画の対象runtimeではその決定を**明示的に置き換える**。Plan18の履歴は書き換えず、実装時に現行OpenSpec要件だけを本決定へ同期する。

### CTI 2020 rollback と旧月次経路

- `server/lib/dataIo.ts` の `buildCtiRollback2020FilePaths()` は `cti_data.csv`、`cti_support_nominal.csv`、`cti_support_real.csv` を返し、共通の `buildCtiFilePaths()` に統合される。この既存rollback bundleと、現行コードが2025 CTI計算で実際に必要とするartifact bundleは別々に台帳化し、2025側の正確なpath・役割・依存consumerをPhase 1で確定する。
- `server/lib/data-loader/ctiValidation.ts` の `CtiLoadOptions` と `selectCtiPair()` に `rollback-2020` 選択肢がある。`server/lib/data-loader/cpi.ts` は選択sourceに応じてCTI本体および名目/実質supportを読む。対象APIから2020 source optionと専用support読込を除去する。
- `tests/utils/cti-2020-rollback-fixture.ts` は旧loaderを `source: "rollback-2020"` で明示呼び出しする。これを使うテストには `tests/data-quality/cti-data-integrity.test.ts`、`tests/data-quality/earning-data-integrity.test.ts`、`tests/server/support-map-join.test.ts` などがある。したがって、resolverだけを先に消すことはしない。
- 旧CTI系列・support資産を参照するテストやデータ品質検査、GDP/四半期supportの読込経路が残り得る。`buildCtiFilePaths()` は現行2025系列やGDP supportにも使われるため、オブジェクト全体や同名の全ファイルを一括削除しない。
- Plan49ではNewGraphの旧CTI月次比較registry 3項目を `消費(総合)` 1項目へ置換し、旧月次fieldsをmerged loader dataに残す場合もNewGraphへ登録・投影しない契約となった。これはNewGraphにおける非使用の証拠であって、loader全体や他の公開面で未使用という証拠ではない。
- `shared_plan/19-cti-micro-2025-base-plan.md` は2025 artifactセット不成立時に完全な2020セットへ切り替える決定を記録している。本計画の対象runtimeではこれを**明示的に置き換え**、必要な2025 artifactのいずれかが不成立なら該当consumerをunavailableとする。Plan19は歴史記録として保持し、現行specと実装契約を同期する。

### 一括削除の対象と誤認しないもの

`ChartDataContract.tsx`、`CustomTooltip.tsx` 等のmeasurement/payload fallbackやnull-safetyは、UIの汎用型・描画契約であり、旧ファイルへのデータfallbackとは別である。個別の不要性を呼び出し元と契約で証明できない限り変更しない。

## 対象範囲

1. CPIは2025基準ペアだけをruntime入力として選択する。2025のmetadata・hash・期間・系列数・連続性・代表値等の検証に失敗した場合は、有効な `unavailable` 状態と機械可読な理由を返す。2020ペアへの自動・明示fallbackおよびrollbackを対象経路から除去する。
2. CTIの `rollback-2020` API、resolver、2020 runtime入力・専用support処理、metadata、fixture、専用テストを一つの契約群として棚卸しする。公開/API契約とデータ品質検査は2025入力を検査する形へ置換する。旧source専用assertionを削除する場合は、検査目的が不要となる根拠を記録する。
3. CTI旧月次系列の参照元をNewGraph registry/view-modelだけでなく、loader、通常/延長チャート、四半期projection、テーブル、CSV、データ品質テスト、fixtureまで追跡する。残存使用があれば移行または対象外を選択し、曖昧なまま削らない。
4. 旧2020 runtimeデータファイルと専用metadataの削除は、本番・開発・テスト・script・CIにruntime依存がなくなり、生成・取得手順にも不要となったことを確認後に行う。historical provenanceや別統計の参照はデータ本体削除を妨げず、来歴記録は必要に応じて残す。Git履歴上のrollback手段だけでruntime資産を維持しない。

## 対象外

- 対象外の過去資料、履歴データ、別統計に含まれる2020年の表示ラベル・provenance。対象CPI/CTI runtime以外から2020基準情報を一律に削除しない。
- CPI/CTIの現行2025公式入力、来歴metadata、series map、検証に必要な原本・スナップショット。
- 対象CTI runtime bundleとしてPhase 1で特定されないCTI四半期系列、独立したGDP比較support、名目/実質の四半期support、Plan38等が現在使う公開/API契約。旧rollbackと同じ `buildCtiFilePaths()` に含まれるという理由だけで削除しない。ただし対象CTI計算の2020 sourceを補う入力として参照される部分はこの除外に含めず、2025 runtimeから切り離す。
- UIの汎用fallback、null-safety、tooltip/payload契約、任意値への防御処理。
- 旧仕様・完了計画における履歴としての説明。実装と現在のOpenSpec要件を区別する。

## 実装フェーズ

### Phase 1: 対象runtimeと参照台帳の確定

`rg`等でpath builder、旧CPI/CTIファイル名、`rollback-2020`、旧CTI系列key、support CSV名を全リポジトリで検索する。コード、公開/API consumer、テスト、script、CI、docs、OpenSpecを「対象runtime/API」「品質検査」「履歴・provenanceのみ」「無参照」に分類し、入力file→loader→view-model→chart/table/CSVの依存表を `shared_plan/50-runtime-reference-ledger.md` として作成する。台帳には現行のstatus/result/API型と全consumer、各consumerで返すunavailable reason codeと伝搬先を記録する。reason codeは少なくとも `cpi_source_missing`、`cpi_metadata_invalid`、`cpi_hash_mismatch`、`cpi_schema_invalid`、`cpi_period_invalid`、`cti_source_missing`、`cti_metadata_invalid`、`cti_hash_mismatch`、`cti_schema_invalid`、`cti_period_invalid`、`cti_required_support_unavailable` を具体化し、現行の失敗箇所・consumerに照らして統合や追加が必要なら台帳内でコード編集前に確定する。CPI/CTIの2020入力を読むcall pathを特定し、歴史的ラベルだけの参照とは分ける。

CTIについては、現行コードから2025計算に必要なartifact bundleを一つずつ列挙し、各path、役割（CTI本体、support、validation metadata、mapping/snapshot等）、source basis/frequency、利用consumer、必須性と失敗時の影響を台帳へ記録する。2020 rollback bundleとの対応を推測で1対1または三点セットと仮定しない。独立したGDP support consumerは別契約として分け、対象CTI計算に本当に必要なsupportと区別する。

Phase 1の完了条件は、全runtime/API consumerにownerとなる入力とstatus/API型、機械可読reason code、unavailable伝搬先が一対一に紐づき、2020 runtime参照と歴史的provenance参照の分類が済み、CTI 2025 artifact bundleのpathと役割に未確定項目がないこと。未確定のpath・依存はPhase 2のcode editへ進めない。

### Phase 2: 現行spec/configの先行更新と2025単独入力契約の確立

コード変更の開始時に、まず `openspec/specs/nextjstest/spec.md` と `openspec/config.yaml` を更新して2020基準を使わない固定決定、対象runtime境界、reason/status契約を要件として表す。そのspec/config契約に沿って同じ実装変更セットでコードを更新し、最終内容も同期する。Plan18/19は歴史的記録であり、現行spec/configより優先する根拠として扱わない。

CPIの候補を2025ペア一つに限定し、旧2020 path・candidate読込を遮断する。欠落・破損・metadata/hash/shape不一致では `pair: null`, `baseYear: null`, `valid: false` と台帳で確定したreason付きstatusを返す。API型、ページ状態、グラフ/情報文へunavailableと理由を伝え、対象画面にrollback/fallback説明を残さない。部分ペアや基準混在は許可しない。

CTIはPhase 1で列挙した2025 artifact bundleのうちconsumerに必要なartifactが無効または未提供の場合に2020へ切り替えず、台帳で確定したreason付きunavailableを返す。runtime sourceを2025のみに固定したうえでrollback option/APIと旧fixtureを除去する。fixtureの各assertionは該当consumerが使う2025入力の検査へ置換し、source固有の履歴検査だけを根拠付きで整理して、データ品質カバレッジを保つ。

必要な2025 CTI入力が未提供なら、2020年基準のCTIデータや2020基準化係数で穴埋めしない。独立したGDP supportの要否はconsumer contractごとにPhase 1で特定する。CTIとGDPを同一出力に必要とするconsumerは欠落artifactを示すreasonでunavailableとし、独立利用できるGDP consumerはその既存契約・由来の範囲で切り離して維持する。

### Phase 3: 旧runtime経路・資産の契約単位削除

Phase 1の参照台帳に基づき、旧2020選択option/resolver、2020専用path、対象CTI計算の2020 sourceに従属するsupport分岐、fixture、runtime専用metadata・テストを依存順に削除する。共用loader、2025用path、対象runtime外の四半期/GDP support、現行品質検査に必要な処理は独立させて保持する。旧CTI月次系列の残存consumerがあれば呼び出し元を移行するか、対象外として境界と理由を記録し、必要フィールドを保つ。対象runtimeが2020基準の計算を行わず、2020入力へ到達しないことは常に受入必須とする。

### Phase 4: status伝搬と契約同期の最終確認

CPI/CTIの状態表示・説明を2025単独入力と利用不能理由に同期する。Phase 2で先行更新した `openspec/specs/nextjstest/spec.md` と `openspec/config.yaml` のData Sources / Data Flow / Component Tree / Requirements、reason/status契約が実装/API/公開状態と一致することを確認し、必要な同期修正を同じ変更セットに含める。Plan18/19の相反するrollback決定は履歴として維持し、本計画と現行spec/configを対象runtimeの有効契約として扱う。

## テクニカルキーポイント

- **CPI call path:** `server/lib/dataIo.ts: buildCpiFilePaths()` → `server/lib/data-loader/cpiSource.ts: buildCpiSourceCandidates()/selectCpiPair()` → `server/lib/data-loader/cpi.ts` のloader/status → `getCpiDataStatus()` 等のpage props → `src/app/page.tsx` / `src/lib/chartInfoContent.ts`。2025の指数・ウェイトを不可分な単一ペアとして検証し、候補配列に2020 pathを含めない。検証失敗は `pair: null` と `unavailable` + reasonを下流まで保つ。status/APIから旧baseYear/source enum分岐も除く。
- **CTI call path:** `server/lib/dataIo.ts: buildCtiFilePaths()/buildCtiRollback2020FilePaths()` → `server/lib/data-loader/ctiValidation.ts: CtiLoadOptions/selectCtiPair()` → `server/lib/data-loader/cpi.ts` の `loadCtiDataInternal()` とCTI/support読込 → earnings/view-model/projection → 消費チャート、NewGraph、table/CSV/API consumers。Phase 1台帳で確定したartifact path・役割ごとに対象runtimeからrollback option・2020 paths・source-specific support branchを除き、CTI本体および必須と確認されたsupportの検証失敗をstatus/reasonとして伝搬する。独立GDP consumerは別契約のまま追跡する。
- **Single source / fail closed:** 各loaderの候補型とresolverを2025 source一つに絞る。2020ファイルが存在しても探索・open/stat/hash・再試行しない。CPI両CSVを一つのpairとして扱う。CTI artifactの組み合わせはPhase 1台帳に記録したpath・役割・consumer contractに従い、実コードで確認されていない三点bundleを仮定しない。必須artifactの欠落や不整合を部分データで補完しない。対象CPI/CTI計算で2020データから基準係数や通常値を算出する分岐も除去し、2025基準値の検証が失敗すれば計算結果を公開しない。
- **Artifact / metadata validation:** runtime validationは成果物の存在、原本・生成物SHA-256、metadataのsource ID/URL・期間・行数・系列数、schema/header・必須コード、月重複と連続性、代表値/基準年検査を照合する。CTI supportは周波数・名目実質・単位・期間・接続条件も確認する。hashだけの一致でschemaやsemantic checksを省略しない。失敗は安定した機械可読reasonへ分類する。
- **Status/error propagation:** status型とerror reasonをloaderからAPI/page props、view-model、chart/info、table/CSVまで追跡する。空配列やゼロ値へ変換して正常扱いせず、利用不能の系列を部分的に表示しない。画面の基準・source説明は実際の2025 source contractとvalidation結果に一致させる。
- **Shared builders and consumers:** `buildCtiFilePaths()` や共用loaderを変更する際は、四半期CTI、GDP support、Plan38等の呼び出し元とNewGraph外の全公開consumerを一覧化する。対象外の有効pathを専用builder/型へ切り出し、共通オブジェクトの削除で壊さない。旧月次fieldの削除はconsumer移行完了後に限る。
- **Fixtures, tests, lineage:** `tests/utils/cti-2020-rollback-fixture.ts` と全利用テストのassertionを列挙する。2025 fixtureへ置換した検査は公式snapshot/metadataと独立に照合し、source pairing、support join、row integrityを引き続き検証する。削除対象にはruntime専用の2020 CPI/CTI CSV・support・metadata・fixture・source enum/API分岐・生成/取得scriptを含め、参照台帳と照合してから削除する。CI参照も調べ、historical provenanceと対象外統計のデータ来歴は保持する。
- **Spec/config synchronization:** 実装コードに先行して現行spec/configへ固定決定・runtime境界・status/reason要件を記述し、同一変更セットの実装完了時に最終同期する。`openspec/config.yaml` のspec rulesに従い、各要件をWHEN/THENで書き、2020 runtime計算/fallback/rollback禁止、unavailableのreason伝搬、残す四半期/GDP経路を明記する。Plan18/19本文は履歴記録として保持し、現行契約の根拠にしない。

## 受け入れ条件

- WHEN 2025 CPIの完全なペアと全検証が有効 THEN 2025ペアのみを選び、基準年とデータ状態を全公開面で一致させる。
- WHEN 2025 CPIの片方のファイル、metadata、hash、schema、期間、系列数、連続性、必須値が欠落または不正 THEN 2020入力に一切アクセスせず、`unavailable` と機械可読な理由を返し、部分ペア・混在・空データの有効扱いをしない。
- WHEN 実質CTI投影がCPIを必要とするが2025 CPIが利用不能 THEN その投影を理由付きで利用不能にし、別基準CPIを使わない。
- WHEN Phase 1台帳で必須とされたCTI 2025 artifactが利用不能または不正 THEN `rollback-2020` API/resolverを持たず、2020 CTI入力を開かずに該当artifactのreason codeを返す。独立GDP consumerのavailabilityはそのconsumer自身のcontractで判定する。
- WHEN CTI計算に必要な2025入力が未提供または検証不成立 THEN 2020基準CTI/GDP値や2020基準化係数で通常値を計算せず、該当するCTI consumerを理由付きunavailableにする。独立したGDP consumerは別source contractのまま維持する。
- WHEN 対象経路の2020入力・API・旧資産・fixtureを削除する THEN 全参照を台帳化し、公開APIと各データ品質assertionを2025検査へ置換済みである。歴史来歴だけの参照があれば、データを無差別に消さず境界を記録する。
- WHEN 旧CTI月次fieldをloaderから除く THEN NewGraph以外の全consumerを監査し、各consumerの移行・廃止を完了している。NewGraphにprojectionがないことだけを根拠にしない。
- WHEN `buildCtiFilePaths()` や共用loaderを整理する THEN Phase 1台帳に記録した現行CTI 2025 artifact、四半期CTI、独立GDP supportのpath/validation/公開結果がconsumer contractどおり維持される。
- WHEN UI汎用fallback/null-safetyを変更候補とする THEN データ資産fallbackと別の根拠・対象契約を示せない変更は含めない。
- WHEN OpenSpecを更新する THEN Data Sources / Data Flow / Component Tree / Requirementsが実装に同期し、各変更要件にWHEN/THENがある。

## 検証観点

### CPI

- 2025ペア有効、各片側ファイル欠落、metadata欠落/不正、hash mismatch、行数/期間/系列数不一致、月重複/不連続、2025年基準平均不成立を確認する。
- 全失敗ケースで2020 CSVが存在していても読込・選択されないこと、statusが `valid: false` で基準年なし、理由が識別可能であることを確認する。
- `getCpiDataStatus()`、`loadCpiDataInternal()`、`loadCpiIndexDataInternal()`、page props、チャート/info文の値・status・文言が一致し、fallback説明がないことを確認する。

### CTI/API/データ品質

- 2025 source auto選択と、2025欠落・不正時のfail-closedを確認する。型・公開APIからrollback選択肢が除去されたことを確認する。
- `cti-2020-rollback-fixture.ts` 利用箇所をそれぞれ置換/廃止し、従来のテストが保証したsource pairing、support join、row integrityに対応する現行検査が残ることを確認する。
- CTI旧月次keyのconsumer検索結果を再監査し、NewGraph registry/projected rowsにないことに加えて、他画面・API・table/CSV・テストで必要性が解消済みであることを確認する。
- Phase 1台帳が示す2025 CTI artifactごとのpath、validation、表示・出力を検証し、四半期CTIと独立GDP supportを別consumerとして代表ケース確認する。

### 公開面と一般防御

- 欠測・loader errorで利用不能状態が伝搬し、CPI/CTI chart、tooltip、表、CSVの値・理由・sourceが不一致にならないことを確認する。
- `ChartDataContract.tsx`、`CustomTooltip.tsx` 等のgeneric fallback/null safetyに旧ファイル名・旧基準依存を導入していないことを確認する。

## 仕様書の同期対象

`openspec/specs/nextjstest/spec.md` の以下を実装と同時に更新する。

- **Data Sources:** CPI/CTIの2025-only runtime入力とmetadata、対象runtimeから除去した2020入力・専用資産、歴史来歴として残す2020ラベル、維持するCTI 2025・quarterly/GDP supportを区別する。
- **Data Flow:** CPI単一候補の検証からunavailableへ至る経路、CTI 2025のfail-closed、削除後の各公開/API consumer経路を記述する。
- **Component Tree:** CPI status/info文とCTI公開面の状態伝搬を実装に合わせる。
- **Requirements:** 対象CPI/CTI runtimeにおける2020計算入力・fallback・rollback禁止、理由付きunavailable、旧経路削除後のデータ品質検査、現行四半期/GDP契約と汎用UI fallbackの維持をWHEN/THENで定義する。

`openspec/config.yaml` のspec規則に従い、要件変更ごとに具体的なWHEN/THENシナリオを置く。完了済みPlan18/37/49等の経緯や将来計画の記述を、実装要件と取り違えない。

## リスクと依存

- CTI `buildCtiFilePaths()` が広範に共有されるため、path整理を一括置換すると四半期集計やGDP supportを壊す恐れがある。呼び出しごとに必要なpathを分離する。
- rollback fixtureが現在の品質検査で実際に使われている。旧テストを消すだけでは契約の退行となるため、各assertionを現行sourceで再現するか、検査の目的自体を廃止する理由を明示する。
- CPI利用不能時に `[]` を返す既存loader契約だけでは原因表示が失われる場合がある。状態API/ページまで理由を通し、既存consumerとの型互換を確認する。
- 対象runtimeでは2020年基準値を計算入力としてもfallbackとしても使わない。別統計や歴史説明に現れる2020年ラベル・provenanceは対象外として保持する。
- 現行データ・四半期supportや汎用UI fallbackは名称に `fallback` / `support` が含まれても、実参照と契約を確認して除外範囲を守る。
- 仕様書と既存planに記録された過去のrollback方針は履歴として残る場合がある。現在の仕様要件、古い完了計画、過去監査を識別して編集する。

## 進捗

- [x] 参照台帳作成とCTI旧月次全consumer監査
  - Phase 1 A（reason code 対応表）・B（spec.md 39行分類・未確定項目解消）は `shared_plan/50-runtime-reference-ledger.md` §3/§6/§7 で確定。理由: 13コードは現状未実装であること・実メッセージ対応表・A25/B4/C8/D2 分類を台帳に記録済み。
  - Phase 1 完了審査: 合格（前回FAIL A: reason code status型マッピング不明確 / B: spec.md分類矛盾 はいずれも解消。Phase 2の既知決定事項として §7③ cpiSource.ts:111 代表値検査の割当先のみ残存）。
  - Phase 2 進行中:
    - spec/config先行更新完了（openspec/config.yaml:31、openspec/specs/nextjstest/spec.md、1505/2478行の旧2020選択文言修正済み、`rollback-2020`/`2020 fallback` の非禁止文言残存なし）。
    - 実装コード適用済み（いずれも未コミット）: CpiReasonCode/CtiReasonCode（7+7=14種）のunion導入、mapCpiReason/mapCtiReasonToCode実装、CpiDataStatus/CtiDataStatus/CpiPair/CtiPairの2025限定縮小、CtiLoadOptions.sourceの"auto"のみ化、selectCpiPair/selectCtiPairからの2020 candidate削除、cpi.tsのisLegacy2020分岐全削除。
- [x] テスト群の新契約への追従（fix-13〜18 で typecheck 0・unit 113 files/1245 passed を確認）
- [x] UIへのreason伝搬（CpiChartInfoState への label/reason 伝搬、getCpiUnavailableLabel 実装、page.tsx の空データエラー文言を cpiInfoState.label ベースに変更済み）
- [x] Phase 3 fixture・旧資産削除
  - dataIo.ts の rollback/fallback キー、旧CSV5点（cpi_data.csv, contribution.csv, cti_data.csv, cti_support_nominal.csv, cti_support_real.csv）、旧converter4点（convert_bm01_1.ts, convert_zmi2020s.ts, convert_cti0111_1.ts, convert_cti0211_1.ts）、cti-2020-rollback-fixture.ts を削除。verify_2025_01.ts は cpi_data2025_long.csv 参照へ変更。
- [x] Phase 4 spec最終同期
  - spec.md 815/830/968/2474/2486 の旧CSV記述を削除済み反映、config.yaml R3h 更新済み
- [x] 検証ゲート（typecheck/lint/test）未実行
  - typecheck 0 / unit 113 files 1245 passed 4 skipped / browser gate exit 0（chromium 22/22, webkit 4/4）
