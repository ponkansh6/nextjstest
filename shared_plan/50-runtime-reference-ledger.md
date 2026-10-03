# Plan50: 参照台帳 (Reference Ledger)

この台帳は CPI/CTI ランタイムにおける2025基準単独運用および旧2020基準（fallback/rollback）の削除に向けた依存関係を管理する。

## 1. 入力リソース表（2025/2020両方）

| 識別子                            | パス                                          | 役割                         | 基準 | 必須性   | 参照元 (file:line)         |
| :-------------------------------- | :-------------------------------------------- | :--------------------------- | :--- | :------- | :------------------------- |
| `cpi_data2025_long.csv`           | `data/source/cpi_data2025_long.csv`           | CPI Index (2025)             | 2025 | 必須     | `server/lib/dataIo.ts:164` |
| `cpi_data2025_long.metadata.json` | `data/source/cpi_data2025_long.metadata.json` | CPI Metadata (2025)          | 2025 | 必須     | `server/lib/dataIo.ts:168` |
| `contribution2025.csv`            | `data/source/contribution2025.csv`            | CPI Weight (2025)            | 2025 | 必須     | `server/lib/dataIo.ts:166` |
| `cpi_data.csv`                    | `data/source/cpi_data.csv`                    | CPI Rollback / Fallback      | 2020 | 削除済み | `server/lib/dataIo.ts:165` |
| `contribution.csv`                | `data/source/contribution.csv`                | CPI Weight Rollback          | 2020 | 削除済み | `server/lib/dataIo.ts:167` |
| `cti_data.csv`                    | `data/source/cti_data.csv`                    | CTI Rollback Main            | 2020 | 削除済み | `server/lib/dataIo.ts:62`  |
| `cti_support_nominal.csv`         | `data/source/cti_support_nominal.csv`         | CTI Support Nominal Rollback | 2020 | 削除済み | `server/lib/dataIo.ts:63`  |
| `cti_support_real.csv`            | `data/source/cti_support_real.csv`            | CTI Support Real             | 2020 | 削除済み | `server/lib/dataIo.ts:64`  |
| `cti_data2025.csv`                | `data/source/cti_data2025.csv`                | CTI Main Candidate           | 2025 | 必須     | `server/lib/dataIo.ts:71`  |
| `cti_support_nominal2025.csv`     | `data/source/cti_support_nominal2025.csv`     | CTI Support Nominal          | 2025 | 必須     | `server/lib/dataIo.ts:92`  |
| `cti_support_real2025.csv`        | `data/source/cti_support_real2025.csv`        | CTI Support Real             | 2025 | 必須     | `server/lib/dataIo.ts:93`  |

## 2. Call path 依存表

### CPI系 Call Path

- `data/source/cpi_data2025_long.csv` → `buildCpiFilePaths` (`server/lib/dataIo.ts:160`) → `selectCpiPair` (`server/lib/data-loader/cpiSource.ts:115`) → `loadCpiDataInternal` (`server/lib/data-loader/cpi.ts:39`) → `getCpiDataStatus` (`server/lib/data-loader/cpi.ts:38`) → `src/app/page.tsx:25`, `src/lib/chartInfoContent.ts`

- `buildCpiFilePaths()` の呼び出し元: `server/lib/data-loader/cpiSource.ts:29`, `tests/unit/cpi-loading-coverage.test.ts:19`, `tests/unit/server/lib/data-fixture-comparison.test.ts:69`
- `selectCpiPair()` の呼び出し元: `server/lib/data-loader/cpi.ts:39`, `:78`, `:88`
- `getCpiDataStatus()` の呼び出し元: `src/app/page.tsx:25`, `server/lib/dataLoader.ts`（re-export）, `tests/unit/home-page-coverage.test.tsx:10`, `tests/unit/cpi-loading-coverage.test.ts:140,157`, `tests/unit/server/lib/cpiSource.test.ts:129,148,159`, `tests/unit/server/lib/data-loader.test.ts:143,182,208,220`

### CTI系 Call Path

- `data/source/cti_data2025.csv` → `buildCtiFilePaths` (`server/lib/dataIo.ts:68`) → `selectCtiPair` (`server/lib/data-loader/ctiValidation.ts:410`) → `loadCtiDataInternal` (`server/lib/data-loader/cpi.ts:104`) → View-models / Chart / Table / CSV

- `server/lib/dataIo.ts:60` → `tests/utils/cti-2020-rollback-fixture.ts:10`（rollback）
- `server/lib/dataIo.ts:68` → `server/lib/data-loader/cpi.ts`（Loader main）
- `tests/unit/server/lib/dataLoader-facade.test.ts:86,105,167`（rollback fixture 利用）

## 3. Reason Code（Phase 2 導入対応表 — 現状は未実装）

**3a. 現状契約（事実）**

- `CpiDataStatus.reason?: string`（`server/lib/data-loader/cpiSource.ts:11-16`）、`CtiDataStatus.reason?: string`（`server/lib/data-loader/ctiValidation.ts:17-22`）は**自由文**。13コードは現状**どこにも実装されていない**（Phase 2 導入対象）。
- reason の代入は `selectCpiPair()`（`cpiSource.ts:114-125`）と `selectCtiPair()`（`ctiValidation.ts:410-436`）の `lastReason` のみ。成功時は reason なし。
- 伝搬の実態: `server/lib/data-loader/cpi.ts:80,90,109` の `console.error` のみ。`src/app/page.tsx:49-67` は `baseYear`/`valid` のみ参照し `reason` は不参照。`src/lib/chartInfoContent.ts` も CPI/CTI status の `reason` を不参照。→ **Phase 2 で UI へ reason を伝搬させる契約が必要**（plan 受入条件と一致させる）。
- テストで `reason` をアサートしているのは `tests/unit/cpi-loading-coverage.test.ts:163`（`toContain("2020 pair: missing index or contribution file")`）と `:197`（invalidStatus モックの `reason: "no pair"`）のみ。`tests/unit/server/lib/data-loader.test.ts` は `baseYear`/`pair`/`valid` のみで `reason` はアサートしない。
- Phase 2 決定: status の `reason` は自由文から機械可読コード union（CPI: `cpi_source_missing` / `cpi_metadata_invalid` / `cpi_hash_mismatch` / `cpi_schema_invalid` / `cpi_period_invalid` / `cpi_value_invalid` / `cpi_fail_closed`、CTI: `cti_source_missing` / `cti_metadata_invalid` / `cti_hash_mismatch` / `cti_schema_invalid` / `cti_period_invalid` / `cti_required_support_unavailable` / `cti_fail_closed`、計14コード）へ変更する。元の実メッセージは console.error のみに残し、status には載せない。表にないメッセージは該当側の `*_fail_closed` へ分類する。

**3b. 実失敗メッセージ全列挙表**
列: `実メッセージ原文 | 検出元 (file:line) | 割当てる Phase 2 コード`
全メッセージを、以下の実測値から漏れなく割り当てる（**1メッセージは1コードに一意割当、二重計上禁止**）:

CPI:

- `cpiValidation.ts:30` "missing 類・品目 or ウエイト header" / `:36` "missing required contribution header: 総合" / `:48` "missing index or contribution file" / `cpiSource.ts:50` "missing 2025 metadata" → `cpi_source_missing`
- `cpiSource.ts:53` "2025 metadata is not ready" / `:54` baseYear mismatch / `:55` indexFile mismatch / `:57` contributionFile mismatch / `:58` monthlyRows mismatch / `:66` "invalid 2025 metadata" / `:81` "2025 metadata file pairing mismatch" → `cpi_metadata_invalid`
- `cpiSource.ts:63` "2025 metadata CSV SHA-256 mismatch" / `:83` "2025 CSV SHA-256 mismatch" → `cpi_hash_mismatch`
- `cpiValidation.ts:37` "duplicate contribution headers" / `:60` "duplicate index headers" / `:67` "index contains no valid 年月 rows" / `cpiSource.ts:90` "2025 CSV monthly row count mismatch" / `:91` "2025 CSV series count mismatch" → `cpi_schema_invalid`
- `cpiSource.ts:60` "2025 metadata period mismatch" / `:93` "2025 CSV period mismatch" / `:94` "2025 CSV contains duplicate months" / `:103` "2025 CSV monthly series is not continuous`→`cpi_period_invalid`
- `cpiSource.ts:111` "2025 CSV general-index average mismatch" → `cpi_value_invalid`（決定: `cpi_value_invalid` へ新設割当（Phase 2 確定））
- `selectCpiPair` 初期値 "no complete CPI pair" と全候補失敗時の最終 `lastReason`（`cpiSource.ts:115-125`）→ `cpi_fail_closed`

CTI（実測行番号）:

- `ctiValidation.ts:151` "missing metadata" / `:184` "missing required CTI set file" / `:190` "missing CTI 年月 header" → `cti_source_missing`
- `:156` "metadata is not ready for 2025" / `:157` "metadata file pairing mismatch" / `:162` "invalid metadata" / `:235` "invalid 2025 series map headers" / `:241` "invalid 2025 official snapshot headers" / `:248` "2025 CTI metadata basis fields are missing" → `cti_metadata_invalid`
- `:159` "metadata SHA-256 is missing or invalid" / `:268` "metadata SHA-256 mismatch" → `cti_hash_mismatch`
- `:101`/`:103`/`:108` "invalid or duplicate CTI support period" / `:112` "invalid CTI support value" / `:143` "CTI nominal/real support period set mismatch" / `:193` "missing required CTI total headers" / `:215` "invalid CTI required numeric value" / `:367` "invalid or duplicate 2025 series map rows" / `:375` "invalid or duplicate 2025 official snapshot rows" / `:383` "2025 series map and official snapshot code set mismatch" → `cti_schema_invalid`
- `:130` "CTI support periods are not continuous" / `:197`/`:199` "invalid or discontinuous CTI 年月" / `:198` "invalid or duplicate CTI 年月" / `:256` "2025 CTI metadata period mismatch" / `ctiValidation.ts:407` "incomplete 2025 CTI calendar year" → `cti_period_invalid`
- `:94` "missing CTI support period or series header" / `:115` "CTI support contains no values" / `:303` "missing official quarterly source workbook" → `cti_required_support_unavailable`
- `selectCtiPair` 初期値 "no complete CTI set" と全候補失敗時の最終 `lastReason` → `cti_fail_closed`
- `:281` "invalid official quarterly metadata or Plan39 manifest" / `:337` "official quarterly CTI artifact/metadata/manifest mismatch" / `:352` "invalid official quarterly CTI period range" は §4 の四半期/GDP専用群（対象外契約）であり**13コード対象外**。この3件は表とは別行に置き「対象外（四半期契約）」と明記。

**3c. 伝搬契約（Phase 2 で確立すべき経路）**

- 現状: loader → `console.error` 止まり。
- Phase 2 目標: `CpiDataStatus.reason`/`CtiDataStatus.reason` → page props（`src/app/page.tsx:22-25` の `Promise.all`）→ `cpiInfoState`/CTI 状態表示 → `src/lib/chartInfoContent.ts` の info テキスト。空文字・省略で「正常扱い」にしない。

## 4. CTI 2025 artifact bundle 実列挙と3群分離

`buildCtiFilePaths()` (`server/lib/dataIo.ts:68`) で定義される全キーを対象CTI計算・四半期/GDP専用・rollbackの3群に分離する。

| 鍵/識別子                                        | ファイルパス                                                             | 役割                 | 必須性                                                                                                 | 欠落時の影響   | 分類群            | Consumer (file:line)                                                               |
| :----------------------------------------------- | :----------------------------------------------------------------------- | :------------------- | :----------------------------------------------------------------------------------------------------- | :------------- | :---------------- | :--------------------------------------------------------------------------------- |
| `main` (rollback)                                | `data/source/cti_data.csv`                                               | 2020 Rollback Main   | 不要                                                                                                   | なし           | Rollback(2020)    | `server/lib/dataIo.ts:62`, `tests/server/support-map-join.test.ts:4`               |
| `supportNominal` (rollback)                      | `data/source/cti_support_nominal.csv`                                    | 2020 Nominal         | 不要                                                                                                   | なし           | Rollback(2020)    | `server/lib/dataIo.ts:63`                                                          |
| `supportReal` (rollback)                         | `data/source/cti_support_real.csv`                                       | 2020 Real            | 不要                                                                                                   | なし           | Rollback(2020)    | `server/lib/dataIo.ts:64`                                                          |
| `candidateMain`                                  | `data/source/cti_data2025.csv`                                           | CTI Main 2025        | 必須                                                                                                   | 読み込み失敗   | 対象CTI計算       | `server/lib/dataIo.ts:71`, `ctiValidation.ts:5`                                    |
| `candidateDistributionAdjusted`                  | `data/source/cti_data2025_distribution_adjusted.csv`                     | 分布調整済データ     | 必須                                                                                                   | 読み込み失敗   | 対象CTI計算       | `server/lib/dataIo.ts:72`, `ctiValidation.ts`                                      |
| `candidateDistributionAdjustedMetadata`          | `data/source/cti_data2025_distribution_adjusted.metadata.json`           | メタデータ           | 必須                                                                                                   | 検証失敗       | 対象CTI計算       | `server/lib/dataIo.ts:77`                                                          |
| `candidateSupportNominal`                        | `data/source/cti_support_nominal2025.csv`                                | サポートNominal      | 必須                                                                                                   | 計算失敗       | 対象CTI計算       | `server/lib/dataIo.ts:92`, `gdpSupport.ts:120,128,172`, `ctiValidation.ts:217-219` |
| `candidateSupportReal`                           | `data/source/cti_support_real2025.csv`                                   | サポートReal         | 必須                                                                                                   | 計算失敗       | 対象CTI計算       | `server/lib/dataIo.ts:93`, `gdpSupport.ts`, `ctiValidation.ts:217-219`             |
| `seriesMap`                                      | `data/source/cti-2025-series-map.csv`                                    | シリーズマッピング   | 必須                                                                                                   | マッピング失敗 | 対象CTI計算       | `server/lib/dataIo.ts:94`                                                          |
| `officialSnapshot`                               | `data/source/cti-2025-official-series.csv`                               | 公式スナップショット | 必須                                                                                                   | 整合性エラー   | 対象CTI計算       | `server/lib/dataIo.ts:95`                                                          |
| `metadata`                                       | `data/source/cti_data2025.metadata.json`                                 | メタデータ           | 必須                                                                                                   | 検証失敗       | 対象CTI計算       | `server/lib/dataIo.ts:96`                                                          |
| `supportNominalMetadata`                         | `data/source/cti_support_nominal2025.metadata.json`                      | Nominalメタ          | 必須                                                                                                   | 検証失敗       | 対象CTI計算       | `server/lib/dataIo.ts:97`                                                          |
| `supportRealMetadata`                            | `data/source/cti_support_real2025.metadata.json`                         | Realメタ             | 必須                                                                                                   | 検証失敗       | 対象CTI計算       | `server/lib/dataIo.ts:102`                                                         |
| `gdpDisplayNormalization`                        | `data/source/cti-gdp-display-normalization2025.json`                     | GDP表示正規化        | 任意 (gdpSupport consumer の契約内)                                                                    | 表示崩れ       | GDP表示専用・任意 | `server/lib/dataIo.ts:107`, `server/lib/data-loader/gdpSupport.ts:124,166`         |
| `candidateDistributionAdjustedQuarterly`         | `data/source/cti_data2025_distribution_adjusted_quarterly.csv`           | 四半期分布調整       | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | 四半期欠落     | 四半期/GDP専用    | `server/lib/dataIo.ts:82`, `quarterlyAggregation.ts:202`                           |
| `candidateDistributionAdjustedQuarterlyMetadata` | `data/source/cti_data2025_distribution_adjusted_quarterly.metadata.json` | 四半期メタ           | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | 四半期欠落     | 四半期/GDP専用    | `server/lib/dataIo.ts:87`, `quarterlyAggregation.ts:203`                           |
| `quarterlySupportNominal`                        | `data/source/cti_support_nominal_quarterly2025.csv`                      | 四半期Nominal        | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | 四半期欠落     | 四半期/GDP専用    | `server/lib/dataIo.ts:112`, `quarterlyAggregation.ts:30`, `gdpSupport.ts:346,388`  |
| `quarterlySupportReal`                           | `data/source/cti_support_real_quarterly2025.csv`                         | 四半期Real           | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | 四半期欠落     | 四半期/GDP専用    | `server/lib/dataIo.ts:117`, `gdpSupport.ts`                                        |
| `quarterlySupportNominalMetadata`                | `..._quarterly2025.metadata.json`                                        | 四半期Nominalメタ    | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | -              | 四半期/GDP専用    | `server/lib/dataIo.ts:122`, `gdpSupport.ts:347,389`                                |
| `quarterlySupportRealMetadata`                   | `..._quarterly2025.metadata.json`                                        | 四半期Realメタ       | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | -              | 四半期/GDP専用    | `server/lib/dataIo.ts:127`                                                         |
| `quarterlyOfficialNominal`                       | `..._quarterly2025.official.csv`                                         | 四半期公式Nominal    | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | -              | 四半期/GDP専用    | `server/lib/dataIo.ts:132`                                                         |
| `quarterlyOfficialReal`                          | `..._quarterly2025.official.csv`                                         | 四半期公式Real       | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | -              | 四半期/GDP専用    | `server/lib/dataIo.ts:137`                                                         |
| `quarterlyEstatNominal`                          | `..._quarterly2025.estat.csv`                                            | e-Stat Nominal       | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | -              | 四半期/GDP専用    | `server/lib/dataIo.ts:142`                                                         |
| `quarterlyEstatReal`                             | `..._quarterly2025.estat.csv`                                            | e-Stat Real          | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | -              | 四半期/GDP専用    | `server/lib/dataIo.ts:147`                                                         |
| `quarterlyNormalization`                         | `...-normalization2025.json`                                             | 四半期正規化         | 四半期契約内では必須・欠落時は四半期 fail-closed (`spec.md:1263,2438,3280`). 対象CTI月次計算には非依存 | -              | 四半期/GDP専用    | `server/lib/dataIo.ts:152`                                                         |

### support/旧月次系の全 consumer 判定（監査記録）

| consumer                                         | 判定                               | 根拠 file:line                                     |
| :----------------------------------------------- | :--------------------------------- | :------------------------------------------------- |
| `server/lib/data-loader/cpi.ts`                  | 共用（2025優先/rollback fallback） | `server/lib/data-loader/cpi.ts:78,104`             |
| `tests/data-quality/cti-data-integrity.test.ts`  | 対象外（rollback fixture のみ）    | `tests/data-quality/cti-data-integrity.test.ts:16` |
| `tests/server/support-map-join.test.ts`          | 対象外（contract test）            | `tests/server/support-map-join.test.ts:8`          |
| `src/lib/clientCalculations`（computeChartData） | 対象外（NewGraph のみ）            | `src/lib/clientCalculations`                       |

※ 判定と根拠行番号は Phase 2 実装時に再検証する。

## 5. テスト/fixture assertion 台帳

| テストファイル・行番号                                            | Assertion内容                                                                                                                     | 2025置換 / 廃止（根拠）                                                                                                             |
| :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `tests/data-quality/cti-gdp-source-integrity.test.ts:5,24`        | CTI/GDPソースの整合性チェック                                                                                                     | **2025置換**: 2025基準ファイル群のハッシュ・整合性検証に切り替え (`tests/data-quality/cti-gdp-source-integrity.test.ts:5,24`)       |
| `tests/data-quality/earning-data-integrity.test.ts:15,383,798`    | 賃金データの正当性検証 (`earning-data-integrity.test.ts:15` で `loadEarning2020RollbackFixture` 利用)                             | **2025置換**: 2025基準の賃金・CTIデータ検証へ移行 (`tests/data-quality/earning-data-integrity.test.ts:15,383,798`)                  |
| `tests/data-quality/plan21-quarterly-gdp.test.ts:4,22`            | 四半期GDP計算の検証                                                                                                               | **継続/対象外契約**: 四半期専用パスとして維持 (`tests/data-quality/plan21-quarterly-gdp.test.ts:4,22`)                              |
| `tests/unit/view-models-coverage.test.ts:28,444,468`              | ビューモデルカバレッジ                                                                                                            | **2025置換**: 2025基準データでのモック検証に更新 (`tests/unit/view-models-coverage.test.ts:28,444,468`)                             |
| `tests/unit/server/lib/data-fixture-comparison.test.ts:13,70`     | データfixture比較テスト                                                                                                           | **2025置換**: 2025系 artifact の比較検証へ移行 (`tests/unit/server/lib/data-fixture-comparison.test.ts:13,70`)                      |
| `tests/unit/cpi-loading-coverage.test.ts:97,98,484,485`           | CPIローディングカバレッジ                                                                                                         | **2025置換**: 2020 fallback ロジックテストを削除し2025単独テストへ (`tests/unit/cpi-loading-coverage.test.ts:97,98,484,485`)        |
| `tests/unit/server/lib/data-loader/gdpSupport.test.ts:24,110,130` | GDPサポート検証                                                                                                                   | **継続/対象外契約**: 独立GDP consumer として維持 (`tests/unit/server/lib/data-loader/gdpSupport.test.ts:24,110,130`)                |
| `tests/server/support-map-join.test.ts:4,30`                      | `buildCtiRollback2020FilePaths` 利用の結合テスト (`tests/server/support-map-join.test.ts:4` で `loadCti2020RollbackFixture` 利用) | **廃止**: 2020ロールバックセットの廃止に伴いテストを削除 (`tests/server/support-map-join.test.ts:4,30`)                             |
| `tests/utils/cti-2020-rollback-fixture.ts:8`                      | 2020ロールバック用fixture (`rollback2020 = { source: "rollback-2020" }`)                                                          | **廃止**: ロールバック用fixtureの全体廃止 (`tests/utils/cti-2020-rollback-fixture.ts:8`)                                            |
| `tests/unit/cti-loader-validation-coverage.test.ts:363`           | `rollback-2020` オプションテスト (`it("accepts a complete rollback-2020 pair...")`)                                               | **廃止**: 2020オプションの廃止 (`tests/unit/cti-loader-validation-coverage.test.ts:363`)                                            |
| `tests/unit/server/lib/dataLoader-facade.test.ts:86,105,167`      | ファサード経由の2020ロールバックテスト (`const options = { source: "rollback-2020" as const }`)                                   | **廃止**: ロールバックパスの廃止 (`tests/unit/server/lib/dataLoader-facade.test.ts:86,105,167`)                                     |
| `tests/data-quality/cti-data-integrity.test.ts:10,16`             | fixture利用 (`loadCti2020RollbackFixture`) と assertion (series non-zero values, recentCtiRows > 0)                               | **2025置換**: 2025基準への移行に伴いfixture利用を廃止し2025データ検証へ置換 (`tests/data-quality/cti-data-integrity.test.ts:10,16`) |
| `tests/unit/server/lib/data-loader/ctiValidation.test.ts:17`      | `selectCtiPair({source:"rollback-2020"})` のテスト                                                                                | **廃止**: 2020ロールバックオプションの廃止に伴い削除 (`tests/unit/server/lib/data-loader/ctiValidation.test.ts:17`)                 |
| `tests/unit/cpi-loading-coverage.test.ts:199,200`                 | `getCpiDataStatus({source:"rollback-2020"})` のアサーションテスト                                                                 | **廃止**: 2020ロールバックオプションの廃止に伴い削除 (`tests/unit/cpi-loading-coverage.test.ts:199,200`)                            |

## 6. 分類（対象runtime/API / 品質検査 / Phase 2 修正対象仕様書 / 履歴・provenanceのみ / 無参照）

| 分類                       | 対象ファイルパス                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| :------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **対象runtime/API**        | `server/lib/dataIo.ts`, `server/lib/data-loader/cpi.ts`, `server/lib/data-loader/cpiSource.ts`, `server/lib/data-loader/ctiValidation.ts`, `server/lib/dataLoader.ts`, `server/lib/data-loader/gdpSupport.ts` (※対象外契約(独立GDP/四半期)だが `buildCtiFilePaths` 共用 consumer として明記), `server/lib/view-models/quarterlyAggregation.ts` (※対象外契約(独立GDP/四半期)だが `buildCtiFilePaths` 共用 consumer として明記)                                                                                                                                                                       |
| **品質検査**               | `tests/data-quality/cti-gdp-source-integrity.test.ts`, `tests/data-quality/earning-data-integrity.test.ts`, `tests/data-quality/plan21-quarterly-gdp.test.ts`, `tests/unit/cpi-loading-coverage.test.ts`, `tests/unit/server/lib/data-fixture-comparison.test.ts`, `tests/unit/cti-loader-validation-coverage.test.ts` (`:363` rollback option), `tests/unit/server/lib/dataLoader-facade.test.ts`, `tests/unit/server/lib/data-loader/ctiValidation.test.ts`, `tests/unit/server-data-loader-coverage.test.ts`, `tests/unit/view-models-coverage.test.ts`, `tests/server/support-map-join.test.ts` |
| **Phase 2 修正対象仕様書** | `openspec/specs/nextjstest/spec.md` (行番号: 815, 830, 1359, 1373, 1374, 1375, 1406, 1415, 1427, 1433, 1499, 1505, 1683, 2243, 2438, 2475, 2487, 2489, 2517, 2581, 3254, 3275, 3276, 3280, 3283), `openspec/config.yaml:31`                                                                                                                                                                                                                                                                                                                                                                         |
| **履歴・provenanceのみ**   | `data/source/*2025.metadata.json`（下書き `shared_plan/50-ledger-part-{cpi,cti,classification}.md` は本台帳へ集約済みのため削除した。）                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **無参照**                 | `public/cpi_data.csv` (過去の静的アセット名残), `results/plan39/*.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 監査補足（検索・生成script）

- 検索クエリ: `rg -n "rollback-2020|fallback|baseYear|base_year|2020基準|2020年基準" -g '!node_modules'`、および `cpi_data\.csv` / `contribution\.csv` / `cti_data\.csv` / `cti_support_nominal\.csv` / `cti_support_real\.csv` の各 `rg -n`（`-g '!node_modules'` 付き）— 合計6クエリ
- 生成script棚卸し: `package.json` に `data/source/` 配下CSVへの明示的な生成scriptなし（更新は手動または外部同期）; `scripts/` に該当CSVへの直接読み書き参照なし
- `data/source/cpi_data.csv` 等5ファイルの spec.md 参照行: cpi_data.csv → 815, 1374 / contribution.csv → 815 / cti_data.csv → 830 / cti_support_nominal.csv → 830 / cti_support_real.csv → 830

## 7. 未確定項目

- ① `spec.md` 区分（全39行の確定）:
  | 行番号 | 区分 | 一行根拠                                                     |
  | :----- | :--- | :----------------------------------------------------------- |
  | 679    | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 815    | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 830    | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 875    | D    | 2020はprovenanceのみ、表示基準は2025と既に規定               |
  | 883    | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 1037   | D    | 2020はprovenanceのみ、表示基準は2025と既に規定               |
  | 1063   | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 1079   | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 1086   | B    | 過去のlegacy分類の引用 (履歴・provenanceのみ)                |
  | 1359   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1373   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1374   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1375   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1406   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1415   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1427   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1433   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1456   | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 1464   | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 1499   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1505   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1683   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 1690   | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 2243   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 2438   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 2475   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 2487   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 2489   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 2517   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 2581   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 3254   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 3275   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 3276   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 3280   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 3283   | A    | 2020 fallback/rollbackの選択・表示・テスト必須の現行有効契約 |
  | 3366   | C    | 対象外契約 (Plan36/37/38セクション内)                        |
  | 3704   | B    | Research-only米国センサス2020 base（履歴・provenanceのみ）   |
  | 3751   | B    | Research-only米国センサス2020 base（履歴・provenanceのみ）   |
  | 3782   | B    | Research-only米国センサス2020 base（履歴・provenanceのみ）   |
  - `openspec/config.yaml:31`「指標は2020年基準でスケール統一」→ **A**（2025基準へ書き換え）
- ② §4 の Consumer 列（各 artifact の依存キー・行番号）により解決済み。
- ③ resolved (Phase 2 決定): 13コード+`cpi_value_invalid`=14コードを status reason の union として実装する。`cpiSource.ts:111` の代表値検査は `cpi_value_invalid` へ割当済み（§3b参照）。
- ④ Phase 2 決定: `CpiDataStatus` は `{ baseYear: 2025 | null; pair: "2025" | null; valid: boolean; reason?: CpiReasonCode }` に縮小、`CtiDataStatus` は `baseYear: 2025 | null; pair: "2025" | null` に縮小。`CtiLoadOptions.source` は `"auto"` のみ（`"rollback-2020"` 除去）。`CtiPair.baseYear`/`pair` は 2025 のみに縮小。
