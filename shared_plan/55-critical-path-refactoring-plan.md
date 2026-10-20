# 重要経路に絞ったリファクタリング計画

> **[状態]** 2026-10-20時点の計画作成済み・実装未着手。対象はCTI公開検証境界の整理と、根拠が確認できる場合に限るCPIチャート公開データ組立境界の整理の2件。

## 目的

保守時の誤変更リスクが高い重要経路に範囲を限定し、既存の入力・出力契約を保ったまま責務境界を読み取りやすくする。大規模な再編や性能改善は目的にせず、実装前に既存動作と検証順序を固定し、小さな変更として比較できる計画にする。

## 重要度判断と対象範囲

### P1: CTI公開検証の取得境界と純粋検証境界

対象は server/lib/data-loader/ctiValidation.ts の validateCtiPair を中心とする公開CTI validation 経路である。同ファイルには、必須artifactの存在確認、CSV読込と解析、月次・四半期連続性、metadataとhash、2025 official series map / snapshot、manifestとの整合性、期間・数値検証、理由コード変換、ペア選択が集まっている。入力取得、解析、ドメイン検証、結果分類を追うときに一つの関数内を往復するため、検証規則を保った局所的な境界整理を優先する。

対象の主な関数は validateCtiPair、mapCtiReasonToCode、selectCtiPair と、これらを呼ぶ server/lib/data-loader/cpi.ts のCTI status処理である。初回の実装では現在のvalidation順序と最初に返すreasonを明文化し、その契約に沿う入力snapshotと純粋検証helperの境界を提案する。

### P2: CPIチャートの四半期公開データ組立（条件付き）

対象候補は src/app/components/CpiChart.tsx の、四半期data正規化からtable keys、metadata、dataTables descriptorを組み立てる箇所である。現在、名目・実質のそれぞれについて公開key取得、表示用data正規化、table data/key/header作成を同一コンポーネント内で行う。実装前にこの重複が変更波及または不整合リスクを生む具体例を確認できた場合に限り、共通の明確な境界へ整理する。具体例が見つからない場合はP2を実施しない。

CpiChart はすでに useCagrState、useSectionNavigation、useUrlState、useCpiChartDisplayData と CpiChartSections に責務を分けている。hook追加や描画部分の単純な切り出しは対象にしない。

### 非対象

- server/lib/data-loader/ctiAdjusted.ts の整理。V2実使用とlegacy利用の境界が確定しておらず、今回の小範囲に収まらない。
- e-Stat経路。Plan52で扱われ、今回の対象ではない。
- server/lib/data-loader/cache.ts の挙動変更。本番とテストの差異に関わる。
- page / facade全体の再編、性能改善、依存更新、新機能、CTI定義・publication gateの変更。
- Plan50のrollback除去・typed reasonおよびPlan54の名称・schema cleanupの再実施。これらの既存変更を前提に現行コードを整理する。
- docs/refactoring-plan.md の旧記述を現行実装の根拠として扱うこと。実装・テストを優先し、過去計画との違いは必要に応じて注記する。

## 現行責務と実装前の確認

- ctiValidation.ts は現在、2025年だけの CtiPair とfail-closed CtiDataStatus を扱う。validateCtiPair は8つのrequired artifactを先に確認し、各検証境界で最初に見つかった文字列reasonを返す。selectCtiPair は成功時にpairを返し、失敗時は baseYear: null、pair: null、valid: false と mapCtiReasonToCode によるtyped reasonを返す。
- validationではファイル存在、読み込み、PapaParse、metadata/hash、month/quarter continuity、official series mapとsnapshot、annual manifestとquarterly artifactのidentityおよび期間・値を確認する。early returnの優先順位とI/O例外の現在の伝播を、挙動変更より先にテストとコードから記録する。
- server/lib/data-loader/cpi.ts はCTI statusを利用し、invalid時に空系列を返すfail-closed経路を持つ。検証内部の構造整理でstatusや空配列の契約を変えない。
- CpiChart は四半期名目・実質dataを normalizeSpendingChartData と normalizePublicChartData に通し、公開keyをtable・表示に使用する。名目系列から ctiMetadata を作り、7セクションの dataTables descriptorを構築している。描画と表示状態はすでに複数hookと CpiChartSections が所有する。

### 実装前に固定するvalidation記録

着手時に次の列を持つ一覧を作り、複数の不正入力を組み合わせたときに先に報告される理由も記録する。これは実装結果の受け入れ比較に使う。

| 記録項目         | 固定する内容                                                  |
| ---------------- | ------------------------------------------------------------- |
| 判定段階         | 現行コード上の実行順と、その段階へ到達する前提                |
| 入力元           | file path、CSV/JSON、manifest、workbook等の読み込み元         |
| 判定条件         | 必須列、continuity、identity、hash、期間、代表値など          |
| 失敗結果         | 返されるvalidation messageと mapCtiReasonToCode のreason code |
| 例外境界         | 例外をcatchする箇所、catch後のmessage、未catch時の伝播先      |
| 呼び出し側       | selectCtiPair / cpi.tsが公開status・データへ反映する方法      |
| 代表的な競合異常 | 同時に成立させる2条件と、現行で優先される失敗                 |

対象入力には、必須artifact欠損、main CSVのheader不在、required total column欠損、不連続または重複月、metadata pairing不整合、CSV hash不一致、official mapとsnapshot不一致、quarterly artifact/manifest/workbook不整合、quarterly期間異常を含める。既存testで優先順が明示されない場合は現行コードの実行順と理由文字列を根拠に記録し、実装時に必要な最小testを補う。

## テクニカルキーポイント

### P1: CTI validation

- 最初に現行順序の一覧を作る。少なくとも8ファイルの存在確認、main CSVの読込・header、required total columns、月次行・数値、metadata、series map / official snapshot、SHA-256 identity、quarterly metadata / manifest / workbook、連続quarter・range、representative value、最後の2025暦年完全性について、順序と返却reasonを記録する。並び替えによって複数の異常入力のreasonが変わらないようにする。
- 検証前に取得するデータは、検証に必要なファイル内容と解析結果を束ねた狭いsnapshot境界に集める。純粋helperはfilesystem、process.cwd()、hash生成、PapaParse入力読込を直接参照せず、渡された値を検証する。現在のCSV parserの仕様・エラー扱いを変えない。
- helperの分割は現行関数内にある独立した検証まとまりに限定する。汎用validation framework、全型の刷新、reasonの新設、複数reasonの一括収集は行わない。mapCtiReasonToCode の既存分類とunknown reasonの cti_fail_closed を維持する。
- filesystem APIが投げる例外、JSON parse時のcatch、PapaParseのerror配列確認など、現在の例外境界を一覧化して保持する。事前に全I/Oを一括取得する実装を選ぶ場合も、欠損・読込例外・parse異常のどれが先に観測されるかを変えない。
- 2025固定、invalid時のnullable baseYear/pairとtyped reason、cpi.ts のstatus・空配列によるfail-closed、既存export、戻り値とmetadataの形を保つ。Plan50 / Plan54で確定した現行契約を再定義しない。

### P2: CPI chart data assembly（実施条件を満たす場合のみ）

- 最初に名目・実質のdata変換、key選択、table descriptorが同じ定義を重ねて持つ箇所を特定し、変更時に不整合が起きる具体的な経路を示す。根拠がなければP2は見送り、P1だけを完了範囲とする。
- 抽出する場合は既存の型と公開識別子を使い、名目/実質の差を引数や既存registryで明示する。CpiChartからDOMやchart renderingを移さず、descriptor/data変換境界だけを最小限整理する。
- props、URL keyと初期値、legendの名目・実質連動、四半期表示、CAGR、7セクションの順序とID、lazy mount、Chart/Table/CSVの同一公開data、measurement識別子、registry順を保つ。欠損値・非有限値の処理も変えない。
- "use client" の依存グラフにserver-only moduleを追加しない。Next.js関連コードに着手する前に、このリポジトリのNext.jsに同梱された関連ガイドを再確認する。調査済みのガイドは node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md、06-fetching-data.md、15-route-handlers.md。

## 実施段階と成果物

### 1. 挙動契約の固定

- P1のvalidation順序、早期return、reason分類、I/Oと例外境界、callerのstatus/空配列挙動をコードと既存testから整理する。
- P2を進める場合は重複と変更波及の実例、および維持する表示・出力契約を先に記録する。
- 成果物: 変更対象を限定した契約メモと、対応する既存テスト一覧。
- 完了条件: P1の複数同時異常ケースにおけるreason優先順と、P2の実施可否を説明できる。

### 2. P1の境界整理

- filesystem/path依存の取得・parseと、取得済み値に対する純粋な判定の境界を作る。
- 各helperは現在の独立した規則だけを持ち、呼び出し順は現行validation順と一致させる。
- 成果物: ctiValidation.ts内または同じdata-loader領域の狭い取得境界・純粋検証境界。
- 完了条件: public export・戻り値・エラー分類とI/O例外挙動を保ち、既存テストが順序契約をカバーする。

### 3. 条件付きP2の境界整理

- 段階1で具体的根拠が得られた場合のみ、四半期公開dataとtable descriptorの繰り返し組立を整理する。
- 成果物: 明示された入力から公開dataとtable specを組み立てる小さな境界。P2見送り時は追加変更なし。
- 完了条件: chart/table/CSVが同じ正規化済み四半期projectionとseries順を使い、既存の表示・操作契約を保つ。

### 4. 仕様同期と検証

- 実装差分に応じて openspec/specs/nextjstest/spec.md のData Sources / Data Flow / Component Tree / Requirementsを同期する。各変更要件に openspec/config.yaml の規則に沿うWHEN/THENシナリオを記載する。
- srcの責務・Component Treeを変えた場合はComponent Treeを、取得・検証経路を変えた場合はData Sources / Data Flowを更新する。影響しない節は変更しない。
- 今回挙動維持の対象となる既存要件は保ち、境界変更に伴って参照先が変わる場合は同期する。config規則に従い、影響する性能・アクセシビリティ要件、実在する型・コンポーネント名への参照も確認する。
- 完了条件: 実装、仕様、テストが同じ契約を記述し、検証結果が対象変更に対応づいている。

## 保全契約と受け入れ条件

- WHEN 8つのCTI required artifactのうち一つ以上が欠損する THEN 現行の検証順序で決まるreasonを返し、成功pairを返さない。
- WHEN 複数のCTI入力異常が同時に存在する THEN 現行のearly returnとreason優先順位を保ち、呼び出し元が観測するtyped reasonを変えない。
- WHEN 2025 CTI pairが有効である THEN baseYear: 2025 のpairを返し、公開結果とmetadata形状を維持する。
- WHEN metadata、CSV、map、snapshot、manifest、quarterly artifact間のidentity/hashが不整合である THEN 現行のreason分類でfail-closedにし、原因を検証通過させない。
- WHEN CSVまたはJSONの読み込みが現行の例外境界で失敗する THEN 例外を吸収または伝播する境界を変えず、別のreasonで先行遮蔽しない。
- WHEN CTI validationがinvalidを返す THEN cpi.tsのstatusと空配列の公開動作を維持する。
- WHEN P2の重複根拠が見つからない THEN P2の実装を開始せず、P1のみを対象完了とする。
- WHEN P2を実施する THEN 名目/実質四半期のchart、table、CSVが同じ公開key・値・順序を使い、URL、legend連動、CAGR、section ID、lazy mountの挙動を維持する。
- WHEN CPI chartの依存を解決する THEN client component graphからserver-only moduleへ到達しない。
- WHEN 対象の実装変更を完了する THEN 影響するOpenSpec節が現行実装と一致し、変更要件にWHEN/THEN scenarioがある。

## 実装時の検証案

以下は実装後にOrchestratorが実行する。テストの実装が必要な場合はfixerが担当し、テスト実装者自身は検証結果を報告せず、Orchestratorが検証ゲートを実行する。今回は計画書の作成のみのため、テストは実行していない。

### P1対象

- pnpm exec vitest run tests/unit/cti-loader-validation-coverage.test.ts tests/unit/server/lib/data-loader/ctiValidation.test.ts tests/unit/server/lib/dataLoader-facade.test.ts tests/data-quality/cti-source-integrity.test.ts tests/data-quality/cti-source-artifacts.test.ts
- source integrity / artifact / facade / CPI caller testを着手時に再確認し、変更経路に対応する対象を追加する。上記は現行の検証境界やsource artifactを扱う実在ファイルを列挙した候補であり、data-quality testが変更契約と無関係なら外す。
- pnpm type-check でstrict TypeScript型を確認する。
- pnpm lint:fast で変更ファイルのlintを確認する。
- pnpm test:coverage は変更規模と既存coverage要件に応じて実施し、CTI loader validation対象のcoverageと全体への影響を確認する。

### 条件付きP2対象

- pnpm exec vitest run tests/components/CpiChart.test.tsx tests/unit/useCpiChartDisplayData.test.ts tests/unit/useUrlState.test.ts tests/integration/chart-table-csv-parity.test.ts
- pnpm type-check と pnpm lint:fast を実行する。
- P2でclient component依存やNext.js境界に触れる場合、関連するbuildまたはbrowser smoke gateを選び、依存境界・主要操作を確認する。

pnpm test:coverage、pnpm type-check、pnpm lint:fast はpackage scriptsに存在する。spec-refsというscriptはpackage scriptsで確認できないためコマンドとして記載しない。JEV判定はlint、型チェック、testの代わりにしない。計画書だけの段階では仕様書を変更せず、実装が仕様に影響した時点で同期する。

## リスクと見送り条件

- I/O前倒しや並列化で「最初に報告される理由」が変わるリスクがある。取得最適化は行わず、順序契約を維持できない場合はhelper分離をさらに小さくする。
- 取得境界を導入して例外のcatch範囲が変わると、既存status分類やログに影響する。catchの範囲とmessage分類は現状を保ち、必要な差分が契約変更を伴う場合は本計画から外す。
- CpiChartのP2はコード量の大きさだけを根拠に進めない。繰り返しが具体的な不整合または変更波及リスクと結び付かなければ見送る。
- 既存テストで保全契約を示せない場合は、先に対象範囲を絞ったtestを追加してから実装する。広域テストの追加で目的を拡張しない。
- Plan50 / Plan54や過去計画に記録された旧状態を現行契約として復活させない。実装時の判断は現行コードと現行OpenSpecを根拠にする。
