# ドメイン識別子と仕様書の整理計画

> **[状態]** 2026-10-18時点の実装と証拠currentness監査を完了。canonical reader、repository-owned caller移行、canonical writerによるactive B/A再生成、fingerprint付きanalysis/cache、検証済みrollback snapshot、現行要件本文の`#current-requirements`への物理集約、dated checkpoint全25件の限定的意味監査を実施した。互換API/wire aliasは明示したversioned migration条件の下で保持する。旧JEV/UI/chart/tooltip/refresh workflowは再実行していないため、完了範囲は現行CTI契約・artifact・analysis・rollback・文書整合性に限る。

## 目的

`plan37` / `plan39` / `plan40` / `plan49` のような履歴上の計画番号を、現行の仕様・実装・公開契約の恒久的なドメイン名として使っている箇所を整理する。計算モデル、入力境界、公開データ契約が名前から読み取れるようにし、現行仕様と過去の経緯を別々に追跡できる状態にする。

この計画は、既存の数値、系列構成、利用者に見える表示、公開JSONの形を不用意に変えずに、識別子と仕様書の重複を段階的に整理するための実施案である。

## 前提と今回の範囲

- 策定時の仕様書は4,633行で、先頭の互換契約群と後半の現行要件・履歴記録が同居していた。
- 策定時点では計画書のみ追加する想定だった。以下の計画基準と実際の実装・検証状況は末尾の「実装状況と最終監査」で区別して記録する。
- 機械識別子もドメインに沿う汎用名へ移行し、旧データとの互換性を保つことを計画上の仮定とする。着手時に既存artifactの利用者と保持期間を調査して具体化する。
- 破壊的な一括置換は行わない。旧名と新名を同じ内部表現へ読む境界を先に用意し、読取側の準備後にwriterを移行する。
- `shared_plan/` の名前、過去の計画・監査文書、third-party由来の `plan` という語は改名対象外とする。
- 実装着手時はNext.js関連コードの変更前に、リポジトリのバージョンに対応する `node_modules/next/dist/docs/` の関連ガイドを読む。

## 現状の整理

- `openspec/specs/nextjstest/spec.md` では、Data Sources / Data Flow / Component Tree / Requirements が先頭の7 / 19 / 41 / 69行付近と、600 / 773 / 850 / 939行付近に重複している。
- 仕様書内に現行契約、廃止済み経路、過去の監査記録、完了した実装記録が混在しており、どの説明が現行の根拠かを判別しにくい。
- 現行の先頭Current noticeは保持し、内容を機能名に基づく説明へ書き換える。計画番号を現行機能名の代用にしない。
- 現行計画37はe-Stat内部の月次basic raw / 12MA / extension互換データを扱う。NewGraphへの投影は行わない。
- 計画39はcomposition-adjusted annual estimate v2を扱う。
- 計画40は10費目の統合四半期名目推計で、2017Q1以降に公式系列へ接続する。
- 計画49はNewGraphの消費総合strict12MAを扱う。
- 計画38専用の四半期経路はretiredであり、計画40の公開四半期projectionとは別経路である。
- 現在の仕様にある識別子を全て計画番号由来とみなして機械的に置き換えず、現行契約、内部実装、履歴記録、互換値を分類する。

## 命名方針

新しい名前は、計画番号ではなく処理の意味、データ境界、契約の役割が分かる語を用いる。互換性のために旧文字列を受け付ける場合は、移行境界を限定し、内部で使う正規名は一つにする。

| 現行識別子                           | 提案する汎用名                                                | 意味と互換区分                                                                   |
| ------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `plan39-v2`                          | `composition-adjusted-v2`                                     | アルゴリズムの版。`model: 'v2-bottom-up'` は既存の意味を維持する。               |
| `CtiAdjustedV2Plan40InputValidation` | `AnnualAnchorInputValidation`                                 | 年次anchor入力の検証結果型。内部型名の変更候補。                                 |
| `CtiAdjustedV2Plan40InputMetadata`   | `AnnualAnchorInputMetadata`                                   | 同じ検証境界に属する入力metadata型。                                             |
| `validateCtiAdjustedV2Plan40Inputs`  | `validateAnnualAnchorInputs`                                  | 年次anchor入力の検証関数。                                                       |
| `contract: 'plan39' \| 'plan40'`     | `inputContract: 'annual-public' \| 'quarterly-annual-anchor'` | 同一計算モデル内で異なる入力検証境界を表す提案名。既存の意味を確認して移行する。 |
| `validatePlan40Inputs`               | `requireAnnualAnchorValidation`                               | 独立したbooleanの現行意味を維持する提案名。入力contractと安易に統合しない。      |
| `plan39-annual-v1`                   | `adjusted-cti-annual-v1`                                      | schema識別子。保存済みartifactの読み取り互換を要する。                           |
| `plan39-quarterly-nominal-v1`        | `adjusted-cti-quarterly-nominal-v1`                           | 四半期schema識別子。公開境界への影響を調査する。                                 |
| `plan40-v2-cost-stack`               | `estimated-cost-stack-v2`                                     | 内部row kind。公開JSONからはomitする現行境界を維持する。                         |
| `plan40-official-quarterly`          | `official-quarterly-adjusted`                                 | 内部row kind。公開JSONからはomitする現行境界を維持する。                         |
| `QUARTERLY_PLAN40_V2_*`              | 既存の `QUARTERLY_PUBLIC_*` を優先                            | 新aliasを乱立させず、既存generic registryへ集約できるか調査する。                |
| `isPlan39V2`                         | `isCompositionAdjustedV2`                                     | 実行時識別子の候補。利用箇所と旧入力互換を調べる。                               |
| 計画37 / 計画49由来コメント          | `basic monthly CTI` / `total consumption strict12MA`          | 現行機能の説明。履歴文書では元の計画番号を残せる。                               |

名称変更では公開文字列と内部型名を同時に扱えると仮定しない。保存済みschema値、公開JSON、row kind、内部の判別子を個別に分類する。

## テクニカルキーポイント

- 単純な全置換をしない。コード、テスト、script、fixture、schema、公開artifact、仕様、codemap、履歴資料の出現箇所を分類してから変更する。
- 読取境界で旧形式と新形式を同じcanonical内部表現へ正規化する。未知のversionや不整合な識別子の組み合わせはfail-closedとする。
- readerを先に整備し、canonical descriptorとliteral型を揃えて二重管理を防ぐ。writerはreaderと下流consumerの準備後に移行する。
- 互換readerは境界の一箇所に置く。旧値をシステム全体で許容したり、旧値・新値の全組み合わせを認めたりしない。整合性が確認できる組み合わせだけを許容する。
- `schema`、`estimateVersion`、`inputContract`、内部`row kind`は異なる役割として別型で扱う。互いを一つの「version」概念にまとめない。
- 原本のSHA、revision、path、manifest、metadata間の整合性検証を、名前の正規化によって迂回しない。正規化前後のどの値を照合するか明記する。
- fingerprintとcache keyの入力、生成、照合の順序を監査する。数値が同等でもidentityが変わる場合は、旧cacheの扱いと再生成条件を定める。
- 既存snapshotやevidenceを一括書換えしない。artifact移行と履歴証跡の保持を分離し、古いevidence IDも追跡可能にする。
- base year 2025、2017Q1の公式系列接続、2005–2016年の推計区間と2017年以降の公式値、四半期10費目の順序と総合除外、strict12MAのwindow・欠測処理、公開JSON表示を不変条件として扱う。
- metadata判定にkey prefix判定を併用する既存fallbackは、呼出元とテストを調べる。等価性を示せた範囲のみ変更し、根拠なしに削除しない。
- 年次入力と四半期入力の検証境界を維持する。両方が同じ計算モデルを使う場合でも、input contractとannual anchor validationの独立した条件を保持する。

## 影響が想定されるファイル

- `server/lib/ctiAdjustedConnectionEstimateV2.ts` — 123–127行付近のoptions、182–185行付近のresult、365–427行付近のvalidation、542行付近の分岐。
- `server/lib/data-loader/ctiValidation.ts` — 218–285行付近の計画番号依存の型・検証。
- `server/lib/view-models/quarterlyAggregation.ts` — 181行付近のschema、498–504行付近および597–603行付近のrow kind。
- `server/lib/consumptionTotal12Ma.ts` — strict12MA系列名・説明の整理候補。
- `server/lib/ctiBasicSeries2025LongTerm.ts` — basic monthly CTIの現行名と履歴語の分類候補。
- `src/types/chart.ts` — 129–133、164–176、245行付近の型・契約識別子。
- `src/lib/quarterlyPublicProjection.ts` — 公開projectionと内部row kindの境界、および互換export重複。
- `src/codemap.md`、`src/lib/codemap.md`、`src/types/codemap.md` — 現行説明の同期対象。
- `openspec/specs/nextjstest/spec.md`、必要なら `docs/` の履歴文書、関連package scriptsと該当テスト。

これらは調査対象であり、すべてのファイル変更を必須とする一覧ではない。出現箇所と依存関係を確認し、変更単位を小さく保つ。

## 実施段階と成果物

### 1. 出現箇所と契約境界の棚卸し

- 対象: server/lib、src/types、src/lib、scripts、tests、public artifacts、OpenSpec、codemap、package scripts。
- 成果物: 旧名→新名候補→出現箇所→データ分類（内部 / 公開 / 保存済み / 履歴 / 互換）をまとめた表。
- 完了条件: caller、writer、reader、schema値、公開projection、履歴資料を区別し、現行識別子がどの契約に属するか説明できる。
- テスト考慮: この段階では既存テストとfixtureの参照関係を調査し、実行結果と期待値を記録する。テスト追加は行わない。

### 2. canonical名と境界readerの導入

- 対象: `ctiAdjustedConnectionEstimateV2.ts`、`ctiValidation.ts`、`quarterlyAggregation.ts`、関連型定義。
- 成果物: 正規名のdescriptorと型、旧形式をcanonical内部表現へ読む限定された互換境界。
- 共通の数学処理とprovenance / annual-anchor入力検証の境界を整理する候補。まず責務を明確化し、挙動同等が示せる場合に限定して抽出する。余計な抽象化やモデル統合はしない。
- 完了条件: 旧形式と新形式が同一の内部契約へ解決され、未知version・不整合metadata・許容外の混在値を拒否する。年次・四半期の検証境界が維持される。
- テスト考慮: 旧 / 新の同等性、未知version拒否、metadata改ざん拒否、年次 / 四半期の検証経路を対象にする。

### 3. 呼出元・内部名・テスト名の移行

- 対象: production caller、内部コメント、script、テスト名・fixture。旧exportとscript名は参照元を全て確認した後に扱う。
- 成果物: 現行コードで計画番号に依存しない名前を採用し、旧機械値は限定された境界に残す。
- 完了条件: canonical descriptorとliteral型の定義元が一箇所で、呼出元は用途に応じた名前を使う。旧exportが必要なら移行期間と削除条件が記録される。
- テスト考慮: テスト名の置換に合わせても検証対象とfixtureの意味を変えない。テスト実装はfixerが行い、実行・検証はOrchestratorが行う。

### 4. writerと現在artifact生成の移行

- 対象: 現行のschema writer、estimate metadata生成、公開projectionに到達するartifact生成経路。
- 成果物: reader整備後に生成される新artifactをcanonical名へ切替える段階的な変更。
- 完了条件: 数値・系列・公開JSON shapeが不変で、生成物のmetadataとmanifestが整合し、旧artifactの読取が継続する。rollback時のreader/writer組み合わせを明記する。
- テスト考慮: 旧artifactと新artifactの数値・fingerprint・cache動作を比較する。数値同等でもidentity差があれば更新・無効化方針を確認する。

### 5. 仕様・codemap・履歴の整理

- 対象: 実装段階と並行してOpenSpecの現行節、三つのcodemap、必要なdocs。
- 成果物: 現行仕様を一つの正本へまとめ、廃止契約・過去監査・完了記録を `docs/history/cti-contract-evolution.md` 等の履歴文書へ切り出し、仕様からリンクする。
- 完了条件: 歴史上の事実と既存anchor / requirement IDに対応表またはリンクがあり、履歴を削ることなく現在の契約を判別できる。履歴切出しは実装契約の再定義を意味しない。
- テスト考慮: 仕様を参照するscriptが存在するか調査する。対応する自動検査がなければrg/manual確認を記録する。

### 6. 検証と旧語の例外監査

- 対象: 変更したコード・テスト・schema・文書、およびリポジトリ全体の残存語。
- 成果物: 検証記録、残す旧語とその理由を示す例外表。
- 完了条件: 現行契約に残る計画番号由来語は互換境界か明示した例外に限られ、履歴・`shared_plan/`・third-party語の残存は誤検知扱いできる。
- テスト考慮: 次節の実装時検証を実施し、変更した経路と結果を対応付ける。

段階は独立した小さなPRに分割し、各PRの変更範囲を受け入れ条件とともに明記する。すべての整理を一つの巨大な変更にまとめない。

## 仕様書の整理方針

- 先頭Current noticeは残し、現在有効な契約と履歴文書への案内を機能名で記す。
- Data Sources / Data Flow / Component Tree / Requirementsの現行説明を、それぞれ一つの正本へ整理する。重複した旧節は内容とanchorを照合して移動またはリンク化する。
- retired route、過去監査、完了した変更の記録は、現行仕様要件と同じ階層に重ねず履歴資料へ移す。
- 既存anchorやrequirement IDを変える必要がある場合は、旧IDから移行先への対応表を残す。参照元を調べずにIDを一括改名しない。
- `src/codemap.md`、`src/lib/codemap.md`、`src/types/codemap.md` と `docs/refactoring-plan.md`、testing profilesの現行説明を実装段階ごとに同期する。
- 仕様の各要件には `openspec/config.yaml` の規則に従うWHEN / THENシナリオを記載する。現行要件と履歴説明を混ぜて検証不能にしない。

## 受け入れ条件

- WHEN 旧形式または新形式の対応artifactを読み込む THEN 同じcanonical内部表現と同じ計算結果を得る。
- WHEN 未知のversion、改ざんされたmetadata、または不整合な識別子の組み合わせを読み込む THEN fail-closedで拒否し、正規化処理で検証を回避しない。
- WHEN 年次入力と四半期入力を処理する THEN それぞれのinput boundaryと独立したannual anchor validation条件を保つ。
- WHEN composition-adjusted系列を生成する THEN base year 2025、2017Q1の公式接続、2005–2016年推計と2017年以降の公式値の扱いが変更されない。
- WHEN 年次と四半期のcomposition-adjusted系列を生成する THEN 年次系列は2017年に接続し、四半期系列は2017Q1に接続する現行の区別を維持する。
- WHEN 四半期10費目を公開projectionへ渡す THEN 費目順序、総合の除外、内部row kindの非公開条件を維持する。
- WHEN strict12MAを計算する THEN window、欠測時の扱い、NewGraphの総合消費系列が維持される。
- WHEN 新writerで現在artifactを生成する THEN 新名称を使い、readerは移行期間中に許容した旧artifactを読める。
- WHEN 公開データを利用する THEN JSONのshapeと表示が維持される。公開識別子文字列の変更が必要な場合は、明記したschema migrationと旧読取互換を用意する。
- WHEN 現行仕様を参照する THEN Data Sources / Data Flow / Component Tree / Requirementsの説明が現行実装と一致し、変更要件にWHEN / THENシナリオがある。
- WHEN 現行requirement本文を集約する THEN 36 canonical groups（monthly basic-series, hooks, chart parity, R1–R21, and 12 domain groups）が`#current-requirements` H2配下にあり、R14a/R14bは一つのR14 group内の2 scenariosとして扱い、26/26旧heading anchorsを保つ。再現可能な拡張link監査は4文書270件（same-document fragments 218 + relative local-file links 52、外部URL 2件を除外、broken 0件）で、`#stage-5-dated-checkpoint--scenario-traceability-inventory`も解決する。従来の215件（OpenSpec 213 + history pointer 2）はfilter定義がない未再現の過去集計であり、現OpenSpec単体の214 local linksとも整合しないため、数値基準は未検証。retired/dated scenario本文は歴史記録として区別する。
- WHEN 過去の監査・evidence・完了記録を参照する THEN 旧IDや記録をたどれる。古いevidenceを一括書換えしない。
- WHEN 現行文書の用語を監査する THEN 計画番号由来の名前は互換・履歴として表で明示した場合を除き、現行機能の説明に使われない。
- WHEN 計画番号由来の語を検索する THEN `Plan[0-9]+|plan[0-9]+` のような番号付き語を監査し、`shared_plan/` や正当な一般語 `plan` まで一律に改名対象としない。
- WHEN 履歴・shared plan・third-partyの`plan`語を検索する THEN 改名対象外として残り、現行契約との混同が説明されている。

## 実装時の検証案

以下は実装着手後に実施する検証案である。

- `pnpm lint:fast` と `pnpm type-check` を実施する。
- 関連unit/component testを実行する。初期候補は以下で、実装時に改名後のpathへ置き換える。
  - `tests/unit/cti-adjusted-connection-estimate-v2.test.ts`
  - `tests/unit/plan40-annual-anchor-validation.test.ts`
  - `tests/unit/server/lib/data-loader/ctiValidation.test.ts`
  - `tests/unit/quarterly-public-projection-boundary.test.ts`
  - `tests/unit/plan39-quarterly-nominal.test.ts`
  - `tests/unit/cti-adjusted-publication-gate-fingerprint.test.ts`
  - `tests/components/quarterly-public-metadata.test.tsx`
  - `tests/components/plan39-public-metadata.test.tsx`
- `pnpm exec vitest run <対象ファイル>` を基本とし、広いfixtureや共通型を変更した場合は必要性を判断して `test:coverage`、build、route smokeを追加する。
- route検証が必要な変更では `pnpm run test:browser:routes:jev` を候補とする。既存pre-pushで実行される `pnpm run test:browser:next-route-poc:prepush:built` とは目的と対象を区別する。
- hook自体を変更しない限り `test:hook-smoke` は対象外とする。hookを変更するPRでは別途実施する。
- 仕様参照専用の自動scriptがないことを確認し、なければrg/manual確認で識別子残存、内部/公開境界、anchor・requirement IDの参照を確認する。
- 変更したすべての公開・保存済みデータ経路について、旧・新artifactの読み込み、metadata整合性、数値、欠測、fingerprint/cache、JSON shapeを確認する。

## 2026-10-18 実装状況と最終監査

### 段階別達成度

| 段階                            | 達成状況                                                    | 根拠 / 残作業                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 出現箇所と契約境界           | 完了（指定semantic scope）                                  | 対象server/type/src/test/scriptのreader・writer・consumer、公開projection、番号付き語彙台帳、およびPlan54 Stage 5 inventoryのdated/checkpoint全25件を、計画指定のdrift dimensions（schema family、metadata prefix inference、API caller、writer、fingerprint/cache、active/retired route）で照合した。[証拠currentness監査](../docs/history/plan54-evidence-currentness-audit.md)は各記録のcurrent/archive-only/supersededを記録する。現行番号付き語彙台帳は403 files / 2,366 matching lines、Plan54別集計は1 file / 52 lines、safe rename candidate paths 0。カテゴリ内訳は[履歴台帳説明](../docs/history/cti-contract-evolution.md#repository-vocabulary-inventory)を参照。補助bare-`plan`台帳の最新手動集計は1,281 occurrences / 1,039 distinct lines / 190 filesで、内訳は356 historical, 827 generic, 98 literal, 0 ambiguous。bare-plan ledger validatorもpassし、1,281件 / 1,039 distinct lines / 190 filesと内訳全件が一致。個別の旧JEV/UI/chart/refresh workflowを再実行したという意味ではない。 |
| 2. canonical名とboundary reader | 完了                                                        | `server/lib/ctiDomainContract.ts` にalgorithm descriptor、annual/quarterly schema family reader、legacy/new inputContract resolverを追加。schema literalは`shared/cti-contract-schemas.mjs`でwriter/reader/rollback readerと共有。annual readerはmanifest/artifact metadata familyの照合後にSHA/revision等を引き続き検証。quarterly readerは未知schemaを拒否する。unknown-schema・schema-family不一致・inputContract組合せと年次anchor検証経路を含むfocused testsがpass。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3. consumer/internal名          | 完了（repository-owned callers）                            | canonical test/production callerを移行し、未使用quarterly aliasを除去。公開`estimateVersion` descriptor/literalはclient-safeな`shared/cti-estimate-contract.ts`に集約し、production callerは`annual-public`と独立annual-anchor flag、writerはgeneric row-kind名を使用する。`validatePlan40Inputs`、旧result properties、`validateCtiAdjustedV2Plan40Inputs`、`loadCtiAdjustedData`、および公開`estimateVersion: "plan39-v2"`は互換/API境界として保持し、削除条件をhistory文書に明記した。外部consumer inventoryとversioned migration前の破壊的削除は行わない。                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4. current writers/artifacts    | 完了（active current set）                                  | canonical annual/quarterly writerを適用し、active B/A artifactsを再生成。Lとquarterly CSVのbytesは不変。manifest/audit/metadataを整合させ、fingerprint付きanalysis結果を生成。pre-canonical (`a1e71f1f5f0d0c77a122dd7a8559d8d340e1325e6e5134cda63de166159be981`) と post-canonical (`f8027e1d571402cbeafcf9c64ce2f0fc15eb5d3a3bf7c97bd334a6e5f14e3fed`) のadditive snapshotは両方作成・検証・保持し、旧snapshot/resultも保持。各SHA、revision、retrievedAt、input/analysis fingerprint、snapshot IDは[証拠currentness監査](../docs/history/plan54-evidence-currentness-audit.md#current-implementation-evidence-2026-10-18)に記録。                                                                                                                                                                                                                                                                                                                                                                       |
| 5. spec/codemap/history         | 完了（現行正本・traceability範囲）                          | 36 canonical requirement groupsのWHEN/THENを`#current-requirements`へ物理集約し、26/26旧heading anchorsを維持。従来のacceptance criterionにある215件（OpenSpec 213 + history pointer links 2）はfilter定義がない未再現の過去集計であり、現OpenSpec単体の214 local linksとも整合しないため、数値基準は未検証。再現可能な拡張監査はPlan54・OpenSpec・Plan54 history 2文書の計4文書を対象に270 local links（same-document fragments 218 + relative local-file links 52、外部URL 2件を除外、broken 0件）を確認し、`#stage-5-dated-checkpoint--scenario-traceability-inventory`も解決。26/26旧heading anchorsを維持。Data Sources/Data Flow/Component Treeはdomain section内のscoped detailsであり、dashboard canonical index/global requirement sectionsをcross-domain source of truthとして明示。dated/checkpoint全25件についてstatus、current destination、指定drift dimensionsを[証拠currentness監査](../docs/history/plan54-evidence-currentness-audit.md)に記録。これは旧workflowの再実行ではない。      |
| 6. validation / exception audit | 完了（現行CTI契約・artifact・analysis・rollback・台帳範囲） | unknown/conflicting inputContract fail-closed、canonical/legacy schema family、writer output parity、public metadata/JSON shape、fingerprint/cache identity、rollback snapshot `--verify`を確認。最終runはlint、type-check、22 Vitest files / 296 passed / 1 skipped、analysis `--analysis` / `--check`、rollback verifierがpass。bare-plan ledger validatorもpassし、1,281 occurrences / 1,039 distinct lines / 190 files（356 historical + 827 generic + 98 literal + 0 ambiguous）と一致。旧snapshot/resultは保持。旧JEV/UI/chart/tooltip/refresh workflowは再実行しておらず、該当する過去の利用者操作結果を現行保証するものではない。保持aliasのversioned removal conditionsは[history map](../docs/history/cti-contract-evolution.md#conditions-for-removing-retained-compatibility-names)に記録。                                                                                                                                                                                                   |

### 受け入れ条件の最終照合

| 条件群                                                                | 判定                                | 根拠 / 境界                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 旧/新schema読取のcanonical化、未知version・不整合family・metadata拒否 | 達成                                | reader family testsとcurrent artifact readers。SHA/revision/path/manifest照合は正規化後も維持。                                                                                                                                                                                                                                                                                                                  |
| 年次/四半期入力境界と独立annual-anchor validation                     | 達成                                | canonical caller移行、resolver/loader casesとfocused suite。                                                                                                                                                                                                                                                                                                                                                     |
| 推計数値、期間境界、2017/2017Q1接続、費目順・総合除外                 | 達成                                | writer parity、既存 focused checks、current output comparison。                                                                                                                                                                                                                                                                                                                                                  |
| strict12MA window・欠測・NewGraph系列                                 | 現行契約維持                        | current requirement/specと既存実装を維持。過去JEV/UI/chart workflowの再生とは区別。                                                                                                                                                                                                                                                                                                                              |
| canonical writer、manifest/metadata/hash整合、旧artifact読取          | 達成                                | active B/A再生成、L/quarterly CSV不変、rollback readerと検証済みsnapshot。                                                                                                                                                                                                                                                                                                                                       |
| fingerprint/cache identityとcurrent analysis                          | 達成                                | 入力fingerprintを含む新analysis結果を生成し、`--check`で照合。旧resultは保存。                                                                                                                                                                                                                                                                                                                                   |
| 公開JSON shape・key order・public `estimateVersion`・row-kind非公開   | 達成                                | writer parityとfocused suite。公開wire literalはversioned migrationまで維持。                                                                                                                                                                                                                                                                                                                                    |
| 現行spec、36 requirement groups、WHEN/THEN、old anchor/link維持       | 達成                                | 36 groups、26/26 old anchors。従来の215 links（OpenSpec 213 + history pointer 2）はfilter定義がなく再現不能な過去集計で、現OpenSpec単体の214 local linksとも整合しないため、数値基準は未検証。再現可能な4文書横断集計は270 local links（218 same-document fragments + 52 relative local-file links、external URLs 2 excluded）/ broken 0で、`#stage-5-dated-checkpoint--scenario-traceability-inventory`も解決。 |
| 現行用語・番号付き語彙・bare `plan`の分類                             | 達成（番号付き語彙・bare-plan台帳） | 最新手動bare-`plan` recountは1,281 occurrences / 1,039 distinct lines / 190 files、内訳356 historical + 827 generic + 98 literal + 0 ambiguous/unclassified。bare-plan ledger validatorが上記集計でpass。                                                                                                                                                                                                        |
| dated evidence traceability                                           | 達成（計画指定dimensions）          | inventoryの25件を個別記録し、current/archive-only/supersededを記録。旧JEV/UI/chart/tooltip/refresh workflow自体は再実行せず、現行結果を主張しない。                                                                                                                                                                                                                                                              |

この照合は計画の現行実装・契約成果物を対象とする。過去の利用者操作記録や旧workflowの結果を再現する条件へ読み替えない。

### テクニカルキーポイント照合

- **一括置換回避 / reader-first / fail-closed**: 対応済みのreader範囲では許可したschema familyのみcanonical化し、未知schemaとinput-contract衝突を拒否する。loaderはunknown/衝突contractをartifact/fingerprint/evidence load前に拒否し、builderのannual-public defaultへ落とさない。resolver pair table、builder unknown/conflict、loader unknown/conflictのunit casesを含む最終22 Vitest files / 296 passed / 1 skippedがpass。
- **descriptor / literal型を一元化**: algorithmとschema/input contract descriptorは`ctiDomainContract.ts`へ集約し、公開`estimateVersion` descriptor/literalはclient-safeな`shared/cti-estimate-contract.ts`へ集約。公開measurement shapeは維持し、deprecated aliasは外部consumer/retention policy確認まで互換目的で残す。
- **schema / estimateVersion / inputContract / row kindの分離**: 型・resolver・production callerで分離。`requireAnnualAnchorValidation`はinputContractとは独立し、旧boolean aliasを保持。
- **annual/quarterly接続境界・数値・並び・欠測・strict12MA**: 計算式、期間値、公開key順を変更していない。既存artifactと実writer生成物のrows/seasonal/public annual・quarterly JSON parityを比較するmkdtemp integration testがpass。
- **SHA/revision/path/manifest/metadata**: readerはschema canonicalization後にも既存hash/revision/path/manifest照合を保持。writer outputはcanonical schema文字列になるためmanifest/content hashとそのfingerprint identityが変化する。legacy/canonical schema loader fixtureは同じ数値行と異なるexact fingerprintを確認するケースを追加し、旧analysis cacheの再利用を止めるexisting exact fingerprint guardと整合する。checked-in sourceから生成するwriter parity testとmixed-family/path/hash/revision rollback verifier testsがpass。
- **public JSON / row kind**: quarterly projectionは従来どおりrow kindをomitし、`estimateVersion: "plan39-v2"`も明示的migrationまで維持。writer parity integrationでannual/quarterly公開JSONの値・key order・shapeを比較しpass。
- **spec正本 / anchor / WHEN-THEN**: Current dashboard contractはcanonical current-spec index/案内としてData Sources/Data Flow/Component Treeとdomain sourcesを関連付ける。現行36 canonical requirement groupsのWHEN/THEN本文は`#current-requirements` H2配下の`### Consolidated current requirements`に物理集約済みであり、R-Plan37/R-Hooks/R4-4/R1–R21と12 domain groupsを含む。R14a/R14bは一つのR14 canonical group内の2 scenariosであり、別groupではない。26/26旧heading anchorsを維持する。従来のOpenSpec/history pointer 215件（OpenSpec 213 + history pointer 2）はfilter定義がない未再現の過去集計で、現OpenSpec単体の214 local linksとも整合しないため、数値基準は未検証。再現可能なPlan54・OpenSpec・Plan54 history 2文書の4文書拡張監査は270 local links（same-document fragments 218 + relative local-file links 52、外部URL 2件を除外）/ broken 0件で、`#stage-5-dated-checkpoint--scenario-traceability-inventory`も解決。旧Requirements見出し・ID・scenario anchorはリンクを維持する。retired/dated scenario本文は履歴としてcurrent requirementsから区別し、retired-only本文3件はhistoryへ移動した。各dated recordの指定drift dimensionsとの照合は完了したが、歴史的JEV/UI/chart/refresh workflowの再実行はしていない。
- **metadata prefix fallback**: `src/types/chart.ts`、`DataTablesSection.tsx`、`CustomTooltip.tsx`からkey prefix判定を除去し、明示的estimate/aggregation metadataで判定する。`CpiChartSections.tsx`は既知のquarterly public nominal keyのsource metadataにaggregationがない場合、明示的projection aggregationを補完する。prefixだけでmetadataが欠ける任意系列はcomposition-adjustedとして扱わない。bare-prefix invalid caseをutility testへ追加し、最終Vitest runに含まれてpass。
- **dated evidenceと実装証拠の境界**: [証拠currentness監査](../docs/history/plan54-evidence-currentness-audit.md)にStage 5 inventoryの25記録すべてを一行ずつ対応付けた。schema family、metadata prefix inference、API caller、writer、fingerprint/cache、active/retired routeの計画指定範囲でcurrent/archive-only/supersededを分類した。旧JEV/UI/chart/tooltip/refresh workflowはruntime再実行していない。

<a id="stage-5-dated-checkpoint--scenario-traceability-inventory"></a>

### Stage 5 dated checkpoint / scenario traceability inventory

所在は行番号ではなく、現行`openspec/specs/nextjstest/spec.md`内の見出し名・安定anchorで特定する。statusは現在の根拠性であり、archive-onlyは本作業のruntime evidence対象外であることを示す。

| 記録 / headline                                      | Status                             | Source → current destination                                                                                                                    | Plan54 evidence scope                                              |
| ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Plan40 JEV checkpoint record                         | stale                              | `### Plan40 JEV checkpoint record` → 記録を保持、現行要件への移動なし                                                                           | archive-only                                                       |
| Plan38 replacement contract                          | superseded / retired               | `## Plan38 historical/legacy contract and Plan40 replacement contract` → 現行 nominal contract anchor `#current-quarterly-nominal-cti-contract` | archive-only。旧Plan38経路はretired                                |
| SharedPlan40 integrated contract                     | active                             | `#current-quarterly-nominal-cti-contract` → current domain contract section                                                                     | schema boundary only; adjacent to and outside Plan54 runtime proof |
| SharedPlan41 current section                         | active                             | `## SharedPlan 41: 正式調整済みCTIへの名目四半期接続` → current domain contract section                                                         | schema boundary only; adjacent to and outside Plan54 runtime proof |
| Plan41 checkpoint (2026-09-23)                       | stale                              | `### Plan41 implementation checkpoint（2026-09-23）` → historical checkpoint                                                                    | archive-only; explicitly predates nominal B/A and L/D              |
| Plan41 final record (2026-09-23)                     | stale                              | `### Plan41 最終検証記録（2026-09-23）` → historical final record                                                                               | archive-only; no current test/JEV run, old placeholders            |
| Plan41 JEV v2                                        | stale                              | `### Plan41 JEV v2最終再判定` → historical JEV record                                                                                           | archive-only                                                       |
| Plan40 runtime continuation                          | superseded                         | `### Plan40 runtime 検証の続編（修正前の中間記録）` → later Plan40/Plan47/48 records                                                            | archive-only; intermediate record                                  |
| Old Plan40 checkpoint                                | stale                              | `### Plan40 実装完了チェックポイント（旧Plan40履歴: nominal B/A・L/D改訂前、現行証拠ではない）` → historical checkpoint                         | archive-only; B/A/L/D assertions are not reverified here           |
| Old user verification                                | stale                              | `### 旧Plan40完了時のユーザー視点検証（nominal B/A・L/D改訂前の履歴、現行証拠ではない）` → historical user-verification record                  | archive-only                                                       |
| Old JEV                                              | stale                              | `### 旧Plan40実装後JEVレビュー（nominal B/A・L/D改訂前の履歴、現行判定ではない）` → historical JEV record                                       | archive-only                                                       |
| Old decision                                         | stale                              | `## 旧Plan40 完了判定記録（nominal B/A・L/D改訂前の履歴、現行判定ではない）` → historical decision                                              | archive-only                                                       |
| Continuation checkpoint                              | superseded                         | `## 続編: 実装完了チェックポイント` → subsequent verification records                                                                           | archive-only; intermediate checkpoint                              |
| Verification / unresolved matters                    | stale                              | `### 実装後の検証記録と未確定事項` → historical verification record                                                                             | archive-only                                                       |
| Tooltip parity addendum                              | superseded                         | `### 実装完了チェックポイント補遺: tooltip境界parity` → later interaction/public-series records                                                 | archive-only; no old tooltip parity runtime claim                  |
| JEV re-review                                        | superseded                         | `### 実装完了チェックポイント補遺: JEV再判定` → later production evidence                                                                       | archive-only                                                       |
| Production final evidence                            | superseded                         | `### production最終証拠` → later issue-resolution/final records                                                                                 | archive-only                                                       |
| Issue resolution / final verification                | stale                              | `### 既存問題の解消と最終検証` → historical verification record                                                                                 | archive-only                                                       |
| Final JEV addendum                                   | superseded                         | `### 最終JEVレビュー補遺` → later Plan47/48 interaction/public-series records                                                                   | archive-only                                                       |
| Final interaction / public series                    | superseded                         | `### 最終実装チェックポイント補遺: 操作契約と行単位の公開系列` → active SharedPlan47/48 sections                                                | archive-only; old UI/chart assertions are not reverified here      |
| SharedPlan47                                         | active                             | `## SharedPlan 47: 名目消費10費目のcanonical系列統合（現行優先仕様）` → current Plan47 contract                                                 | schema boundary only; outside Plan54 runtime proof                 |
| SharedPlan48 and record                              | active                             | `## SharedPlan 48: 表示中の名目消費から導く実質CTI（現行優先仕様、実装・検証済み）` / `### 実装・検証記録` → current Plan48 contract/record     | schema boundary only; outside Plan54 runtime proof                 |
| Plan52 refresh current contract and superseded audit | active contract / superseded audit | `## SharedPlan 52: e-Statデータの一括再取得・再生成CLI` → current refresh contract plus its historical audit                                    | archive-only for refresh behavior; outside Plan54 scope            |
| Final Plan39 audit synchronization (period-unified)  | stale                              | `### Final Plan39 audit synchronization (period-unified)` → diagnostic/history; current requirements remain at the Plan39 current period anchor | archive-only                                                       |
| Plan49 source reference and old requirement stubs    | active references                  | `shared_plan/49` → preserved `#legacy-cti-monthly-compatibility-field` anchor, stub/history map, and current Plan49 source                      | link/anchor preservation only; no Plan49 runtime evidence          |

このinventoryは記録の所在・status・移行先を閉じる。個別の旧checkpoint runtimeを再実行したとは意味しない。記録ごとの限定的意味照合は[証拠currentness監査](../docs/history/plan54-evidence-currentness-audit.md)に完了記録を置いた。Data Sources/Data Flow/Component Treeはdomain section内のscoped detailsとして保持し、dashboard canonical indexと`#current-requirements`配下のglobal requirementsを横断仕様の正本とする。

### 残す番号付き語の例外

各例外は所在と保持理由を以下に示し、互換値を恒久的な現行名称にしない。削除/移行の具体的条件は[`docs/history/cti-contract-evolution.md`の解除条件表](../docs/history/cti-contract-evolution.md#conditions-for-removing-retained-compatibility-names)に記録する。

| 語 / 出現群                                                                                    | 残す理由                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan39-v2` public `estimateVersion`                                                           | 既存Client/CSV/public metadata contract。新APIはcomposition-adjusted-v2を意味名とし、wire文字列はschema migrationまで維持。                                                           |
| `plan39-annual-v1`, `plan39-quarterly-nominal-v1`                                              | 保存済みartifact/snapshot/evidence互換。読取境界の許可値としてのみ残す。historical fixtureは旧形式テスト用。                                                                          |
| `plan39` / `plan40`                                                                            | `inputContract` migration alias。estimator option readerでcanonical input boundaryへ写像し、schema/model/versionとは混同しない。                                                      |
| `plan40-v2-cost-stack`, `plan40-official-quarterly`                                            | 旧internal row-kind reader/type aliasとlegacy fixtures。公開projectionではomit。                                                                                                      |
| `scripts/plan39/`, `results/plan39/`, snapshot/evidence path、`PlanNN`履歴記述、`shared_plan/` | 保存パス・監査・既存計画のtraceability。改名・一括artifact書換え対象外。                                                                                                              |
| `Plan37` / `Plan49` がspec・test名/descriptionにある箇所                                       | 月次basic CTI / strict12MAの履歴要件、test ledger、fixture lineage。対応anchorとscenario IDを`docs/history/cti-contract-evolution.md`へ記録。test-only vocabularyの一括改名は未実施。 |
| `Plan39` / `Plan40` を含む保存schema、analysis/evidence名、API compatibility fields            | 旧artifact schema、public `estimateVersion` wire value、input option/API alias、internal row-kind alias。場所と保持理由は同history docの分類表を参照。                                |

本監査はコード経路、plan要件、現行artifact/cache/snapshot、およびdated evidenceを対応付けた。最終実装検証は`pnpm lint:fast`、`pnpm type-check`、22 Vitest files / 296 passed / 1 skipped、analysis `--analysis` / `--check`、rollback verifierがpass。bare-plan ledger validatorも1,281 occurrences / 1,039 distinct lines / 190 files（356 historical, 827 generic, 98 literal, 0 ambiguous）でpass。`git diff --check`もpass。full Vitest suiteを意味しない。rollback snapshotは新規に作成・検証し、既存snapshot/resultは保持した。annual rollback verifierはannual artifactsの`statisticalCode`を検査するが、quarterly verifierに同検査を含むという主張ではない。最新番号付き語彙検索は403 files/2,366 lines、Plan54別集計は1 file/52 lines、safe rename candidate pathsは0。補助bare-`plan` ledgerの最新集計は1,281 occurrences / 1,039 distinct lines / 190 files（356 historical, 827 generic, 98 literal, 0 ambiguous/unclassified）で、validatorはpass。台帳のcounts/scopeとvalidator状態はStage 1表に記録する。現行36 canonical requirement groupsのWHEN/THEN本文を`#current-requirements` H2配下の`### Consolidated current requirements`に物理集約し、R14a/R14bは一つのR14 group内の2 scenariosとして扱い、26/26旧heading anchorsを維持した。旧anchorはstub/aliasとcurrent source mapから集約本文へ案内する。旧acceptance criterionの215 local links（OpenSpec 213 + history pointer links 2）はfilter定義がない未再現の過去集計であり、現OpenSpec単体の214 local linksとも整合しないため、数値基準は未検証。再現可能な拡張文書link auditはPlan54・OpenSpec・Plan54 history 2文書の4文書について270 local links（218 same-document fragments + 52 relative local-file links、外部URL 2件を除外）/ broken 0件を確認し、`#stage-5-dated-checkpoint--scenario-traceability-inventory`も解決し、26/26旧heading anchorsを維持した。retired/dated scenario本文はcurrent requirementsから区別し履歴として保持した。旧JEV/UI/chart/tooltip parity/refresh checkpointのruntime verificationを行ったとは主張しない。
