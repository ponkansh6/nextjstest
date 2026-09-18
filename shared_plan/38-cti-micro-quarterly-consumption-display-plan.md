# Plan38: CTIミクロを賃金比較から外し、名目消費支出の四半期表示へ移設する計画

作成日: 2026-09-18
状態: 実装済み・監査完了（2026-09-18）
前提: 本計画はPlan37の完了判定を変更せず、Plan37で給与比較へ追加されたCTIミクロ表示を移設する。

## 1. 目的

CTIミクロの原数値・比較通常・比較延長の3系列を給与グラフから外し、`民間最終消費支出` の代替として名目消費支出グラフへ表示する。表示範囲は2005Q1〜2017Q4の四半期とし、2018年以降は既存のCTI消費支出費目積上を維持する。

「消費支出から外す」という解釈は採用しない。今回外す対象は賃金グラフ、賃金表、賃金CSVおよびPlan37で給与比較用に追加したCTI通常・延長系列である。共用CTIローダーと他の給与・CPI系列は保持する。

## 2. 対象と非対象

### 対象

- 給与グラフ、給与表、給与CSVからCTIミクロの原数値・比較通常・比較延長の3系列を除去する。
- `SpendingBarChart` と `CpiChartSections` の `section-consumption-nominal` で、既存GDP support slot（2005Q1〜2017Q4）をCTIミクロ名目四半期系列へ置換する。
- CTI artifact `data/source/official-cti-2025-long-term/000040499070` の `series_index=1`、`official_series_code=1`、名目原指数を入力とする。
- 2005Q1〜2017Q4の52四半期を、各四半期の異なる3暦月の有限値平均で生成する。
- グラフ、tooltip、表、CSVの系列名、値、単位、出典、集計方法、状態・理由を一致させる。
- `openspec/specs/nextjstest/spec.md` のData Sources / Data Flow / Component Tree / Requirementsを実装と同期する。

### 非対象

- 2018年以降の既存CTI消費支出費目積上の変更。
- `section-consumption-real` への名目CTI流用。実質グラフは既存経路を維持する。
- CTIの12か月移動平均、給与用CPI系列、共用ローダー、Plan37の完了判定・監査ログ。
- GDPへのfallback、2005年未満または2018年以降へのCTI support拡張。

## 3. 入力・計算契約

- CTI原数値はartifactの公式2025年基準系列から読み、既存の系列identity、出典、単位、取得metadataを引き継ぐ。
- 各四半期は異なる3暦月を1回ずつ使う。3か月のいずれかが欠損・非有限、重複月、期間外、重複入力となる場合、共有四半期行は維持したままCTI support値を`null`として扱う。推定、0補完、重複統合はしない。
- 数値0は有限な有効値として許容し、3か月が揃う四半期の平均に含める。
- 対象期間は厳密に2005Q1〜2017Q4。52四半期の入力が揃わない場合は該当する共有行のCTI support値を`null`とし、不足状態をmetadataへ出してGDP値を代用しない。
- 月次CTIを12MAへ変換しない。既存のGDP換算係数・年次反復・別系列の再基準化を使わず、artifactの指数をそのまま四半期平均へ集計する。
- 2018年以降の既存費目積上と指数基準が一致するか検証する。一致しない場合は両者を連続した同一系列として見せず、状態理由を公開する。

### 責務境界（Plan38専用経路と既存互換経路）

- Plan38専用CTI経路だけが、名目CTI supportの対象期間を厳密に2005Q1〜2017Q4へ限定する。対象四半期の月欠損・非有限・重複・3か月不足・期間外入力は、共有行を残したままCTI値を`null`とし、`reason`をmetadataへ保持する。zero-fill、GDP fallback、補間、重複統合は行わない。
- `server/lib/view-models/quarterlyAggregation.ts` と `src/lib/math/quarterlyCompleteness.ts` に残る2018Q1以降のlegacy費目経路のzero-fillおよび2018年開始判定は、既存互換契約のための経路であり、Plan38専用CTI経路へ到達しない。これらの既存挙動は、Plan38が禁止するCTI欠損処理と混同せず、Plan38のために一律変更しない。
- GDP raw/comparisonの名前・値・measurementはPlan38名目公開契約から分離し、GDPはreal/legacy互換契約に限定する。この分離は、既存real/legacyの値の扱いを変更することを意味しない。

## 4. 公開データ契約

- GDP名のまま意味を置き換えず、CTI専用の公開キー、表示ラベル、source、unit、frequency、aggregation、status、reasonを定義する。
- 名目系列のラベルにはCTIミクロ、名目、四半期、対象期間を明示する。表・CSVにも同じmetadataを渡す。
- CTI入力不足・重複・不正・基準不一致時は`invalid`または`unavailable`として公開し、凡例を非表示にするか利用不可理由を明示する。正常時の凡例を固定表示しない。
- `section-consumption-real`には名目CTIキーを渡さず、実質系列の既存metadataと表示を維持する。
- 2005年未満およびCTI support対象外期間ではCTI supportの値だけを生成せずnullとし、他系列用の共有行は維持する。2018年以降も既存費目積上の共有行を維持し、CTI supportの値は生成しない。

## 5. 影響調査ポイント

実装時に次の既存経路を確認し、GDP専用の命名・分岐・固定凡例をCTI専用契約と混同しないようにする。

- `EARNINGS_SERIES_REGISTRY`、給与ページの`earningsKeys`、給与用NewGraphのCTI通常・延長系列。
- `SpendingBarChart`、`CpiChartSections`、`section-consumption-nominal` / `section-consumption-real`。
- `quarterlyProjection`、`quarterlyAggregation`、`quarterlyGdpTransform`、`quarterlyPublicProjection`、`quarterlyCompleteness`。
- GDP supportを前提にした公開キー、手動legend名、tooltip、表、CSV exporter。
- 2017Q4/2018Q1境界、`adv`や期間filter、nominal/real共通行集合、既存2018年以降の完全性判定。

## 6. 段階的実装

### Phase 1 — 賃金経路からの除去 `[x]`

給与グラフ・表・CSVおよびPlan37の給与比較NewGraphからCTIミクロの原数値・比較通常・比較延長の登録、projection、凡例、tooltip、metadataを除去する。CTI共用loaderと給与の他系列は残し、賃金の既存出力が壊れていないことを確認する。

#### テクニカルキーポイント

- `src/lib/chartConstants.ts` の `EARNINGS_SERIES_REGISTRY`、`EARNINGS_TOTAL_KEYS`、`EARNINGS_AUXILIARY_KEYS`、`EARNINGS_TABLE_CONFIGS`からCTI 3系列を除き、CTIの共有定数・`ctiBasicDescriptors`・loader契約は保持する。
- `src/app/page.tsx` の `earningsKeys` と `toEarningsView` の入力列を給与系列だけにし、CTI列をSSRから賃金viewへ再注入しない。
- `src/app/components/CpiChart.tsx` の給与表定義と `src/app/components/CpiChartSections.tsx` の `earningsTooltipMeta` / `comparisonVisibleKeys` / CTI用トグル依存を同じregistryから投影する。
- `src/app/components/EarningsBreakdownChart.tsx` と `NewGraph.tsx` のseries・legend・tooltip・CSV列をregistry投影に揃え、CTIキーの直接参照を給与経路から消す。
- `src/lib/quarterlyPublicProjection.ts`、CTI loader、消費支出側の`ctiInfoState`連携を壊さず、賃金の他系列と共有loaderの依存方向を回帰確認する。

### Phase 2 — 名目四半期CTI support `[x]`

既存GDP slotの代わりにCTI専用loader/view-modelを接続し、2005Q1〜2017Q4の各3か月平均を生成する。欠損、0、重複、不正月、52期不足を明示的に扱い、GDP fallbackを禁止する。2018年以降の費目積上と境界を分離する。

#### テクニカルキーポイント

- `server/lib/ctiBasicSeries2025LongTerm.ts` のartifact解決・検証で `000040499070`、`series_index=1`、`official_series_code=1`、公式identityとSHA/metadataを固定し、別variantやGDP入力を受け付けない。
- 月次CTIの集計は`server/lib/view-models/quarterlyAggregation.ts` の`computeQuarterlyAggregates`から専用経路へ分離し、12MAや`applySupportSeriesScaling`を通さず、各四半期の3暦月を1回ずつ単純平均する。
- `server/lib/view-models/quarterlyGdpTransform.ts` のGDP raw→comparison結合を名目CTI専用公開キーへ置換し、共有`QuarterlyRow`は維持する。CTI専用キーへ値または不成立時の`null`を入れ、既存GDP名目キーは名目公開projectionから除外し、実質supportは保持する。
- `src/lib/math/quarterlyCompleteness.ts` の共用完全性判定を一律に2005年へ変更せず、新CTI support経路で2005Q1開始の完全性を検証する。共用判定を変更する場合は、2018年開始の既存実質・費目経路への影響を確認してから同期する。
- 重複月、欠損、非有限、期間外、3か月以外、52期不足を入力境界で判定し、数値0は有効値として平均に含める。補間・0補完・重複統合・GDP fallbackは実装しない。
- `server/lib/view-models/quarterlyProjection.ts` と`src/lib/quarterlyPublicProjection.ts`で2005Q1〜2017Q4のみ値を公開し、2018Q1以降はCTI supportを生成せず既存費目積上の行集合を残す。

### Phase 3 — 三面出力と状態表示 `[x]`

`SpendingBarChart`、表、tooltip、CSVを同じ公開キーと行集合へ接続する。出典、単位、集計方法、status/reason、2018年以降との系列関係を一致させ、invalid時の凡例表示を修正する。

#### テクニカルキーポイント

- `src/lib/chartConstants.ts` のGDP固定命名・`SUPPORT_SERIES_KEY_NOMINAL`・`DISPLAY_LABEL_OVERRIDES`をCTI専用公開キー／ラベル／`unit`／`frequency`／`aggregation`／`status`／`reason`へ更新し、GDP名を表示契約に残さない。
- `src/lib/quarterlyPublicProjection.ts`、`src/app/components/ChartDataContract.tsx`、`src/app/components/CpiChart.tsx`の表・CSV定義を同じ公開キーと共有行から作り、丸め・null・metadataを三面で一致させる。
- `src/app/components/SpendingBarChart.tsx` の`normalizeSpendingChartData`、support判定、`hasLegacyGdp`、`data-gdp-periods`/`data-cti-periods`をCTIの2005〜2017境界へ変更し、2018費目積上の分岐を維持する。
- `src/app/components/CpiChartSections.tsx` の`spendingTooltipMeta`と`spendingAllowedKeys`、`src/app/components/CustomTooltip.tsx`の除外キーを公開projectionと同一の行・metadataに接続する。
- `src/lib/chartInfoContent.ts` と`ctiInfoState`の公開状態を表・CSV・tooltipへ渡し、invalid/unavailable時は凡例を非表示にするか、利用不可の理由を明示する。
- measurement-aware exportはPlan38名目CTIキーについてgraph / tooltip / table / CSVのmetadata parityを必須とする。real/legacy exportは既存契約を維持する範囲で扱い、Plan38のmetadata契約をreal/legacyへ一般化しない。
- `section-consumption-real`には名目CTIキーを渡さず、`SpendingBarChart`のnominal/real共通ロジックで実質の既存support metadataと2018Q1境界を回帰確認する。

### Phase 4 — OpenSpec・検証 `[x]`

実装と並行して仕様書のData Sources / Data Flow / Component Tree / Requirementsを更新し、`openspec/config.yaml`の規則に従うWHEN/THENを追加する。テスト実装とテスト実行を分離し、最終ゲートでOrchestratorがlint、type-check、build、関連unit、parity、E2E、`git diff --check`を確認する。

#### テクニカルキーポイント

- `openspec/specs/nextjstest/spec.md` のData Sources / Data Flow / Component Tree / Requirementsを、`ctiBasicSeries2025LongTerm.ts`→`quarterlyAggregation.ts`/`quarterlyProjection.ts`→`quarterlyPublicProjection.ts`→`SpendingBarChart`の実装経路と同期する。
- 各要件に`openspec/config.yaml`の規則に従うWHEN/THENを記載し、賃金CTI除去、2005Q1〜2017Q4平均、無効入力、GDP fallback禁止、名目/実質境界、graph/table/CSV parityを個別に検証可能にする。
- テスト実装は`tests/unit`、`tests/server`、`tests/components`、`tests/computation-contract`、`tests/e2e`の意味のある既存配置へ委譲し、テスト実行と結果判定はOrchestratorが担当する。
- `tests/data-quality/cti-basic-series-2025.test.ts`でartifact identityと公式列、`tests/unit/quarterly-consumption-completeness.test.ts`で0・欠損・重複・非有限・境界、`tests/e2e/chart-table-csv-parity.e2e.spec.ts`で公開三面を検証する。
- `tests/components/SpendingBarChart.test.tsx`、`tests/components/real-consumption-support-series.test.tsx`、`tests/unit/client-calculations.test.ts`で2017Q4/2018Q1、名目CTI、実質保持、給与の他系列を回帰確認する。
- 最終監査では実装差分、registry参照、公開projection、OpenSpec、関連E2E/fixture、Playwright実行設定を確認する。検証結果はVitest 115 passed / 4 skipped、Playwright 16 passed、type-check成功、scoped lint成功、build成功、`git diff --check`成功である。テスト実装はfixer、テスト実行と結果判定はOrchestratorが担当する。

## 7. WHEN/THEN受入シナリオ

- WHEN 給与グラフ・表・CSVを表示する THEN CTIミクロの原数値・比較通常・比較延長の3系列が存在せず、他の給与系列は従来どおり表示される。
- WHEN 2005Q1〜2017Q4の名目消費支出を表示する THEN CTI専用ラベルの四半期系列が52期の3か月平均として表示され、GDP名・GDP値は出ない。
- WHEN 1四半期の3か月がすべて有限で、その中に0がある THEN 0を有効値として平均し、四半期行を残す。
- WHEN 月欠損、非有限値、重複月、異なる3暦月でない入力がある THEN 共有四半期行は維持したままCTI support値をnullとし、0補完・補間・重複統合・GDP fallbackを行わない。
- WHEN 2005年未満または2018年以降を表示する THEN CTI support値だけを生成せずnullとし、他系列用の共有行と2018年以降の既存費目積上の行は維持する。
- WHEN 2017Q4から2018Q1へ移る THEN CTI supportと既存費目積上の境界を明示し、異なる基準を同一連続系列として偽装しない。
- WHEN CTI入力が利用不能または基準不一致である THEN registryと公開metadataのstatus/reasonを反映し、正常時の凡例を固定表示せず、GDPへfallbackしない。
- WHEN グラフ、tooltip、表、CSVを同じ四半期で見る THEN ラベル、値、単位、出典、集計方法、欠損、status/reasonが一致する。
- WHEN 名目・実質の両セクションを表示する THEN CTI名目系列は名目だけに存在し、実質セクションは既存の実質系列を使う。

## 8. 検証項目

- 賃金からのCTI原数値・比較通常・比較延長の3系列除去をregistry、projection、DOM、表、CSVで確認する。
- 2005Q1、2005Q2、2017Q4、2018Q1の境界と52四半期の連続性を確認する。
- 月欠損、重複、非有限値、0値、四半期不足、2018年以降の入力をfixtureで検証する。
- CTI専用metadata、表/CSV parity、invalid凡例、GDP fallback禁止を確認する。
- 名目への接続後も実質グラフ、既存2018年以降積上、給与の他系列、共用loaderに回帰がないことを確認する。

## 9. 完了条件

- CTIミクロが賃金の公開3面から除去されている。
- 2005Q1〜2017Q4だけにCTI名目四半期系列の値が表示され、対象外期間ではCTI support値がnullとなり、GDP専用名称・値・fallbackが残っていない。
- 欠損・重複・非有限・0・境界・metadata・invalid状態が受入シナリオどおりである。
- 2018年以降の既存費目積上と実質グラフが維持され、名目CTIが実質へ混入していない。
- OpenSpec、テスト、公開projection、グラフ・表・CSVが同じ契約に同期している。
- 完了判定は実装差分と上記検証結果、およびこの文書・OpenSpecの整合性で行い、未コミットであることを未完了条件にしない。

### 実装範囲・理由

- 賃金CTI除去、GDP専用キーとPlan38名目CTI公開キーの分離、graph / tooltip / table / CSVのmetadata parityを実装範囲とする。これはPlan38の公開責務を給与・GDP互換経路から切り離し、同じmeasurementを三面へ渡すために必要である。
- 関連E2Eと独立fixtureの更新、ならびにPlaywright設定／実行プロファイルとの互換回帰確認を実装・検証範囲に含める。これは2005Q1〜2017Q4の52期、2017Q4/2018Q1境界、nominal-only、salary除去、chart/table/CSV parityを本番境界で確認するためである。Playwright設定そのものを変更したと主張するものではなく、既存設定での対象project・起動条件・検証範囲を記録する。
- 既存の2018Q1以降legacy費目経路、real/legacy GDP契約、共用loaderその他の無関係な既存差分は、Plan38の新規実装成果として数えない。Plan38が行うのは専用経路への接続と互換回帰の確認である。

### 実装・監査完了記録

- 固定artifact `000040499070` の series 1 / official code 1 を使用し、2005Q1〜2017Q4の52四半期を異なる3暦月の単純平均で生成する経路を確定した。
- 欠損、重複、非有限、期間外、3か月不足、0値、対象外境界を fail-closed で扱い、invalid/unavailable reason を metadata に保持する。GDP fallback、補間、0補完、12MA化は行わない。
- graph / tooltip / table / CSV の metadata parity（source、unit、frequency、aggregation、status、reason）を維持し、nominal-only のCTIキーを real 経路から分離した。
- 給与の実系列だけを給与graph/table/CSVへ残し、旧CTI raw / normal-comparison / extension の3系列と給与用registry参照を除去し、不在をテストで明示した。
- 2017Q4/2018Q1境界、2018年以降の既存費目積上、OpenSpecのData Sources / Data Flow / Component Tree / Requirementsを実装と同期した。
- 検証結果: 実装済み・監査完了。直近の記録はVitest 115 passed / 4 skipped、Playwright 16 passed、type-check成功、scoped lint成功、build成功、`git diff --check`成功。未コミット状態は完了条件に含めない。
