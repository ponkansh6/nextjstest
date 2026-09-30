# 名目消費支出の10費目系列を期間別に統一する計画

> 状態: 計画確定（実装未着手）。ユーザー決定により、2005Q1–2016Q4は世帯構成補正ありのPlan39、2017Q1以降は公式四半期系列を採用する。

## 目的と採用定義

名目消費支出の公開系列を10費目に統一し、各四半期・各費目につき採用元を一つにする。値を合算するのでなく、2005Q1–2016Q4は世帯構成補正を適用したPlan39接続推定値、2017Q1以降はe-Stat公式の調整系列・分布調整値（原数値）を採用する。ここでいう世帯構成補正は二人以上世帯割合（Pi）による既存の費目別補正式であり、年齢や世代別の新しいモデルを導入する意味ではない。Plan40は補正前baseを選ぶ既存コード契約の呼称であり、公式期間までPlan40推定と呼ばない。2017Q1は公式行が存在する場合だけ公式値を使い、行が得られない場合は既存のunavailable契約を維持する。

公式系列はe-Stat統計表ID `000040499087` の「総・四(原)」、総世帯、2025年基準の指数である。9費目は公式四半期値、10費目目の「その他の消費支出」は公式総合から9費目を引き小数1桁に丸めた派生残差であり、公式観測とは表示・metadataで区別する。2017Q1の例は、ローカル取込済みソース `data/source/cti_data2025_distribution_adjusted_quarterly.csv` の先頭データ行で総合91.1、9費目合計74.9、残差16.2となる。採用中の公式artifactとのrevision/hash対応は実装前に既存loaderの検証経路で確認する。実行時の画面値や境界での連続性はこの計画時点では未測定であり、接続点を無断で再基準化・平滑化しない。

月次basic `000040499069` の四半期平均は切替先ではない。これは旧系列契約であり、現行推定はその値を単純平均するものではない。

## コードで確認したデータ定義と経路

- [quarterlyAggregation.ts](../server/lib/view-models/quarterlyAggregation.ts#L664) の `computeQuarterlyAggregates` は、旧月次名目行からPlan38対象年を除外した後、[同ファイル](../server/lib/view-models/quarterlyAggregation.ts#L767) で `loadCtiAdjustedV2Estimate({ contract: "plan40" })` を明示して接続推定・公式四半期行を追加する。名称ではなくこの呼出しと値の式が採用定義の根拠である。
- 年次アンカーは [ctiAdjustedConnectionEstimateV2.ts](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L611) でB/Aから算出し、その年次rowsを [quarterlyAggregation.ts](../server/lib/view-models/quarterlyAggregation.ts#L327) のhistorical builderが受け取って四半期へ季節配分する。builderは2005–2016の月次10系列として、公式CTI basicの1総合＋9費目を読み、月別の「その他」を総合−9費目合計として導出する。各四半期値は `年間アンカー × 当該3か月平均 ÷ 同年12か月平均`（[計算](../server/lib/view-models/quarterlyAggregation.ts#L387)・[式とmetadata](../server/lib/view-models/quarterlyAggregation.ts#L399)）。月重複、月欠落、非正値、年次アンカー不在、公開ゲート不合格では値をnullにする既存fail-closed条件を保ち、ゲートを緩和しない。
- 年次アンカーのカテゴリ別定義は [ctiAdjustedConnectionEstimateV2.ts](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L611) にある。9費目 `c` は `B_y,c × (A_2017,c / B_2017,c)`、その他は `OtherB_y × (OtherA_2017 / OtherB_2017)`、総合は10費目の和。Plan39では各費目の基準予測に既存の二人以上世帯割合補正を加える。値は2025年基準の指数で、家計の円建て支出額ではない。
- 世帯構成補正はコードに実装されているが、現行四半期本番呼出しには採用されていない。`buildCtiAdjustedV2Estimate` は世帯構成artifactを読み、`base_y,c = B_y,c × A_2017,c / B_2017,c`（その他は同じ比率でB残差を接続）を基準にする。補正係数は `gamma_c = (A_2025,c - base_2025,c) / (piJan_2025 - piJan_2017)`、歴史値は `base_y,c + gamma_c × (piIV4_y - piIV4_2017)`（[較正入力とgamma](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L595)・[適用](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L705)）。較正側のJanuary setai-n世帯構成比と歴史側のIV-4比率は異なる調査/vintageであり、2017年中心化は両系列の比較可能性を証明しない。2011年IV-4値は未検証の2010/2012間の線形補間で、endpointを使う遡及的な暫定補正は因果効果・独立予測検証・将来にも妥当なモデルを意味しない。公式Aの2017年以降値は補正せずそのまま渡す。
- 履歴では、2026-09-22のPlan40統合commit `f7e8d3f9d3066cbb134c0806eeada51e14e0dad1` が補正式の `plan40 ? base : corrected` 分岐を導入した。2026-09-23の四半期runtime接続commit `bafcdf566433ec6a8a6aa23eb139255653ffe073` は公開呼出しからPlan40を明示指定した。2026-09-30の世帯構成Pi2plus production補正commit `582e9370fef334f2d215187fb8e0eb2f560a87c5` は補正式を追加したが、このPlan40分岐を置き換えていない。したがって現行公開四半期経路は `loadCtiAdjustedV2Estimate({ contract: "plan40" })` により `corrected = base` を選ぶ。「コードに補正式がある」ことと「現行採用推定に補正が入る」ことは別である。
- 採用推定は既存Plan39契約の補正式とする。四半期callerは `contract: "plan39"` を明示し、loader defaultに依存しない。これにより世帯構成補正を選ぶ一方、既存Plan39のmanifest/provenance/fingerprintと保存済みanalysisの整合およびpublication gateを適用する。Plan40にある有用なsource metadata・coverage・base year・frequencyの検査は、モデル選択契約とは独立したinput-integrity要件として新しい公開経路にも保全する。Plan40 baseを採用する理由は今回の歴史推計の目的には残っておらず、Plan40を別利用者向けに維持する必要がある場合もその契約自体は変更しない。Plan40のLOOを機械的な採用条件にはしない。保存analysisのモデルとfingerprintが一致すればPlan39結果を使い、不一致なら該当モデル・入力に対応した分析を再計算して再評価する。gate条件は無断で迂回・緩和しない。
- 補正付きモデルについて保存されている [JEV所見](../results/plan39/jev-review-production-pi2plus-v3.json) は `threshold_redesign_incomplete` と `connection_2017_reaudit_incomplete` により、その監査時点で `accepted=false` を記録している。記録上は2016–2017のOther-share変化0.766176ポイントが当時の公式由来threshold 0.763942ポイントを超えていた。この保存結果から現在のproduction gate/runtimeがacceptedまたはclosedであるとは断定せず、実装前に最新状態を確認する。既存thresholdを根拠なく緩和せず、thresholdを変更する必要が生じた場合は別要件・根拠・再検証を要する。2025年A値はgammaのendpoint較正にも使われるため、2025年への一致は独立検証として数えない。
- 保存済みの [Plan39分析](../results/plan39/plan39-analysis-a8c7ad0fa68a5208.json) は別のsnapshot/分析成果物であり、`schemaVersion: "plan39-analysis-v1"`、`inputFingerprint: sha256:a8c7ad0fa68a5208c24ff6d86bd562e60613ed0ea4f127cded1de8ec4b2c744f`、`v2.model: "v2-bottom-up"`、`v2.version: "plan39-v2"`、default contract 39、`v2.publicationGate.accepted: true` を記録する。このファイルの補正推計は2005–2016年で利用可能で、総合は2005年99.4721、2016年91.7729。`v2.householdComposition.retrospectiveValidation` は2018–2024年を対象に、2025年をendpoint calibration yearとしてbaseline MAE/RMSE 1.8357/2.1819からcorrected 0.07759/0.08486へ低下した値を保存する。これらは保存済み入力・モデルにおける強い回顧的整合の根拠であり、採用する歴史参考推計を支える。A系列に2005–2016年の直接正解値はなく、この比較は2025 endpointを使った回顧的比較であって独立forecast validationではない。四半期別精度も未評価である。standalone rolling/LOOのOther beta診断をPi補正の独立精度証明と同一視しない。スクリプト `scripts/plan39/run-analysis.mjs`、B/A/LとPi artifact/manifest hashesが結果に含まれ、loaderは保存analysisと現在入力の一致を検査する。この `accepted: true` は当該snapshotのpublicationGateを表し、JEV所見の別時点・別対象における `accepted: false` を上書きしない。現時点のgate/runtime状態は未測定であり、実装時に現在入力との一致とgate根拠を確認する。保存結果だけからlive経路の公開可否や実描画結果は断定しない。
- L系列は接続値の算式には使わず、Plan40 loader内でB/A/Lを用いるrolling/LOO証拠の構築とpublication gateに関わる（[loader](../server/lib/data-loader/ctiAdjusted.ts#L484)）。証拠・ゲートを通過したかの既存条件は保持する。
- 公式四半期loaderは `000040499087` のブック、シート、列、revision/hash、2017Q1からの連続範囲を検証する（[loadOfficialNominalQuarterly](../server/lib/view-models/quarterlyAggregation.ts#L210)）。公式行は9値をそのまま採用し、その他を総合−9費目から導出する（[公式行の組立](../server/lib/view-models/quarterlyAggregation.ts#L480)）。その他のmetadataは `derived_residual` / `official: false` を保ち、10系列すべてを公式観測と表示しない。

## 現行コードにおけるPlan39/Plan40契約の差

Plan39とPlan40は別々の推定builderではない。どちらも `buildCtiAdjustedV2Estimate` が同じB/A/L・世帯構成入力から同じ年次rowsを作り、`estimateVersion` も両方 `plan39-v2` である。契約名やversion文字列だけでは系列を区別できず、差は契約分岐による推定式、入力検証、公開判定にある（[builderと契約分岐](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L537)・[基準式](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L611)・[gamma](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L648)・[補正選択](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L705)）。loaderは両契約で世帯構成Pi artifactも読む（[Pi入力読込み](../server/lib/data-loader/ctiAdjusted.ts#L689)・[loader契約](../server/lib/data-loader/ctiAdjusted.ts#L735)）。

両契約に共通するのは、2005–2016年の年次推定、2017年以降の年次公式A、基準値 `base_t = B_t × (A_2017 / B_2017)`、`Other` 残差比による接続、および10費目合計である。Lは年次基準値の式には入らない。ただしLは検証用rolling/LOOの入力に必要であり、式に使わないことはloaderや公開判定から省く意味ではない。

| 観点              | Plan39                                                                                                           | Plan40                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2005–2016年の出力 | 基準値に世帯構成補正を加え、`base_t + gamma × (PiIV4_t − PiIV4_2017)` とする。                                   | 基準値 `base_t` を出力する。                                                                                                                                                                                   |
| gamma             | `(A_2025 − base_2025) ÷ (PiJan_2025 − PiJan_2017)`。                                                             | 出力式には使わない。世帯構成Pi artifactのloader読込み自体は両契約にあるため、「Plan40はPiを読まない」とはしない。                                                                                              |
| 入力検証          | 両契約共通のrequired rows・カテゴリ等の検証を行う。                                                              | 共通検証に加え、strict metadata、2025年基準値、annual nominal artifactの指定coverageを検証する。これは全2018–2024年metadataを一律検査するという意味ではない。                                                  |
| 公開判定          | 共通のblocking reason、Pi availability/reconciliation、および現在の入力に一致する保存済みrolling/LOO分析を使う。 | 共通のblocking reasonに加え、`plan40InputContractValid` と当該呼出しsnapshotのB/A/Lから再計算しfingerprintが一致するlive rolling/LOOを要求する。schema、pass状態、全foldの有限値、leakage-free条件も判定する。 |
| rolling/LOO証拠   | 保存済み分析が現在の入力に一致することを要求する。                                                               | 呼出しsnapshotの入力で計算した証拠を要求する。Lは基準値の式には不要でも、この検証には必要。                                                                                                                    |
| 呼出し            | `contract` 省略時のdefault。補正式を計算する経路がある。                                                         | 四半期グラフの本番経路が明示指定する契約。基準値を採る。                                                                                                                                                       |
| 現行公開経路      | 補正計算は実装されているが、現在の四半期production routeでは使用していない。                                     | 現在の四半期集計でactive。グラフ・表・CSVへ渡す歴史年次値はPlan40の基準値由来。                                                                                                                                |

Plan40の追加入力契約は[検証処理](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L365)、両契約共通の公開gateは[判定処理](../server/lib/ctiAdjustedConnectionEstimateV2.ts#L998)、live rolling/LOOの計算とfingerprint照合は[loader処理](../server/lib/data-loader/ctiAdjusted.ts#L494)、保存analysisとの照合は[loaderの検証処理](../server/lib/data-loader/ctiAdjusted.ts#L539)・[保存証拠の取扱い](../server/lib/data-loader/ctiAdjusted.ts#L584)にある。

したがってPlan39採用と公開経路の検証条件整理は別の作業として扱う。呼出しだけを変えてvalidationやgateを無検討で弱めない。Plan39の既存入力manifest/provenance/fingerprintと保存analysisの整合およびgateを適用し、Plan40由来の有用なstrict source metadata/coverage/base year/frequency確認は独立したinput-integrity要件として保全する。Plan39を旧monthly系列、Plan40をすべての期間の推定値とみなす説明も誤りである。

2017年以降の年次Aは両契約とも公式値で、世帯構成補正を加えない。実グラフが2017年以降に公式四半期原値を選ぶ処理は、年次builderのPlan39/40差とは別段階の `quarterlyAggregation` にある（[四半期接続](../server/lib/view-models/quarterlyAggregation.ts#L768)）。したがって「Plan39は四半期平均」「Plan40は公式四半期」という契約差ではない。Plan39の補正値を四半期へ季節配分する場合も、上記の共通historical builderを通る。補正モデルのrolling/LOO証拠を無補正モデルの合格結果で代用してはならない。現行の実描画値・全gateの実行結果はこのコード差分だけからは確認していない。

## 現状の重複リスク

旧月次名目行はPlan38対象の2005–2017年を除外して追加される一方、2018年以降は残る（[年範囲](../server/lib/view-models/quarterlyAggregation.ts#L33)、[行選択とv2追加](../server/lib/view-models/quarterlyAggregation.ts#L761)）。同期間行のcoalesceは公式行を優先するが、測定値mapをfallbackとpreferredの両方からキー単位で結合し、異なる名前の費目を除去しない（[coalesce](../server/lib/view-models/quarterlyAggregation.ts#L611)）。公開投影はPlan40行に対しPlan40の10キーに加え旧名目キーとsupportキーも公開する（[registry/projection](../src/lib/quarterlyPublicProjection.ts#L28)）。CpiChartもPlan40行が存在するとき、このunionをチャート・表・CSVに渡す（[CpiChart](../src/app/components/CpiChart.tsx#L145)）。`normalizeSpendingChartData` は2018年境界でsupport系列を切り替えるが、異なる名称の旧費目aliasは排除しない（[normalizer](../src/app/components/SpendingBarChart.tsx#L77)）。SpendingBarChartは渡されたsupport以外の全キーを同じstackに積む（[Bar描画](../src/app/components/SpendingBarChart.tsx#L378)）。

既存ブラウザ計測はPlan40の10系列だけを対象に最上端を推定しており（[計測対象](../tests/browser-mode/phase6-b06.route.command.ts#L316)）、上に別名の旧系列が積まれた場合の棒全体は保証しない。従ってコードから二重加算可能性は確認できるが、現行ブラウザで実際にどの期間・値が二重描画されるかは未確認であり、実描画を先に記録する。

## 設計方針

1. 10費目のカテゴリ対応は、現在のregistryの意味を基準に中立的なcanonical registry/descriptorとして定義する。既存の10キー `CTIミクロ調整系列（…）` は互換性を考慮して維持できる。これは既存のPlan40由来のキー・row kind名を互換用に使うことと、選択する推定モデルがPlan40であることを区別する。旧キーとの対応は、食料↔食料（名目）、住居↔住居（名目）、光熱・水道↔光熱・水道（名目）、家具・家事用品↔家具・家事用品（名目）、被服及び履物↔被服及び履物（名目）、保健医療↔保健医療（名目）、交通・通信↔交通・通信（名目）、教育↔教育（名目）、教養娯楽↔教養娯楽（名目）、その他の消費支出↔その他の消費支出（名目）とする。実際の旧キー定義は[chartConstants.ts](../src/lib/chartConstants.ts#L25)、canonicalキーは同ファイルの[v2 mapping](../src/lib/chartConstants.ts#L209)にある。
2. 周期・行の採用元選択を公開投影より前に行い、公開rowには各期間のcanonical10費目だけを載せる。期間別に推定行か公式行の片方を選択し、同名カテゴリを足さない。公式値欠損時に推定や旧月次値へfallbackせず、null/status/reasonを保持する。公式ソース自体が読めないときの2017 markerを含むunavailable契約も維持する。
3. 合計は構成費目として同じstackに加えない。公式totalは整合検証用に保持し、表示する場合は別種の検証値とする。その他は公式total由来の派生値であることをtooltip、表、CSV metadataで識別する。
4. チャート、表、CSV、tooltipは同一の選択済みデータセットとdescriptorを使い、旧aliasを公開列・stack seriesに混在させない。別用途がlegacy aliasを必要とする場合は、内部互換用途を明示して公開名目消費の契約から隔離する。
5. 判定不能・欠損・ゲート不合格を見かけ上の値で埋めない。単位・基準年、strict input validation、publication gateの条件を重複解消だけのために変えない。採用するhistorical modelはPlan39の既存世帯構成補正式とし、Plan40由来のsource metadata検査もinput-integrity要件として保全する。

## 実装順

1. 実装開始時に現行runtimeのrow・全series key・measurement provenanceとチャートDOMの全bar group、各期の実合計を記録し、二重描画の有無を確定する。テストの部分計測値だけを現状証拠にしない。
2. Plan39出力のmodel/source fingerprint metadataと既存gateを整理する。Plan39保存analysisのmodel・B/A/L/Pi・manifest fingerprint一致を確認し、不一致なら当該モデルで再計算・再評価する。Plan40由来のsource metadata/coverage/base year/frequency確認を独立したinput-integrity要件として保全する。
3. 四半期seasonal anchorを補正済みPlan39年次値へ接続し、名目公開投影をcanonical10費目だけにする。2016Q4/2017Q1の採用境界、未公開行のstatus/reasonを表現し、callerは `contract: "plan39"` を明示する。chart、table、CSV、tooltipへ同じdataset/provenanceを渡し、旧aliasの重複加算を防ぐ。
4. 既存の50–150確認はplausibility checkとして保持してよいが、10費目の出所・全stack合計・source total整合の代わりにしない。新forecast LOOを一律必須条件にはしない。
5. 実装と並行して `openspec/specs/nextjstest/spec.md` のData Sources / Data Flow / Component Tree / Requirementsを更新し、各要件にWHEN/THENシナリオを記載する。実装チェックポイントで `skills/jev-review/SKILL.md` を明示的に読みJEV判定を行い、通常のlint/type-check/test等の代用にしない。

実装前には、このNext.js版に同梱された `node_modules/next/dist/docs/` の関連ガイドを読む。リポジトリのpackage scriptsと既存検証手順を確認したうえで、変更に対応するlint、type-check、unit/integration test、browser smoke、coverage/spec-refsの必要ゲートを実行する。テストの実装とrootによる実行・検証は分離する。git hookの迂回は禁止し、ここではcommit/pushを計画しない。

## 受入条件

- WHEN 2016Q4を表示する THEN 10費目はCTI接続推定のprovenanceを持ち、公式観測値と混ざらない。WHEN 2017Q1を表示する THEN 10費目は公式四半期行のprovenanceを持ち、推定値を加算しない。2017Q4/2018Q1も境界外のlegacy aliasがcanonical stackへ漏れない。
- WHEN 同一期に旧aliasへ大きなpoison値を入れたfixtureを渡す THEN canonical10費目の値と棒全体は変わらない。WHEN 公開datasetに追加stack keyを混入させた場合 THEN browser assertionは失敗する。
- WHEN chart DOMを検査する THEN 全期間の公開名目stack groupはcanonical10費目だけであり、各期の描画下端はゼロ基線、segmentに隙間・重複がなく、全segmentの高さから復元した合計が選択済みdatasetの10値合計と一致する。部分系列だけの最上端検査では合格しない。
- WHEN 公式9費目とその他を検証する THEN その他はコード所定の丸めで公式総合−9費目合計となり、10費目合計は公式総合に丸め許容内で一致する。50–150範囲は副次的なplausibility checkに限定する。
- WHEN 2005–2016の有効な完全年・四半期を検証する THEN 3か月平均/12か月平均から算出した四半期推定は年次アンカーに対する季節配分を再現する。expected値はproduction helperを再利用せず独立fixture/計算で導く。
- WHEN 対象公式行が欠ける、公式sourceが無効、その他残差が正でない、または既存publication gateが閉じる THEN 公式期間を推定/月次で埋めず、既存のunavailable/nullとreasonを示す。
- WHEN 画面、表、CSV、tooltipで同一セルを追う THEN value、status、canonical category、source/provenance、official/derived区分が一致する。すべての10費目を公式とラベルせず、その他はderivedと示す。
- WHEN 選択モデルと入力snapshot（B/A/L/Pi各artifactおよびmanifest hash）が保存済みPlan39分析に一致する THEN 保存analysisの主要metricを独立fixture計算で再現し、歴史出力の有限性・10カテゴリ構成・総合一致を確認する。一致しない場合はモデルに対応した分析を再計算・再評価する。再現性確認に恣意的な精度閾値を新設しない。
- WHEN 2005–2016の年次10費目を計算する THEN 各費目の基準予測は `base_t = B_t × (A_2017 / B_2017)`、補正予測は `base_t + gamma × (PiIV4_t − PiIV4_2017)` とする。`gamma = (A_2025 − base_2025) ÷ (PiJan_2025 − PiJan_2017)` は費目別に求め、Otherは基本・調整系列それぞれの総合−9費目残差を接続して専用gammaで補正し、総合は10費目の和とする。WHEN 四半期値を構成する THEN 補正済み年次アンカーを既存3か月平均/12か月平均のseasonal allocationへ渡す。
- WHEN 2016Q4/2017Q1の境界を表示する THEN 2016Q4までは補正済みPlan39推定、2017Q1以降は公式四半期原値を採り、公式値がない場合はunavailable/nullを保つ。2017年以降に補正式をかけない。
- WHEN seriesを公開する THEN 10 canonical費目だけを各期間に一度載せ、旧名目aliasが同じ棒に加算されない。Plan40由来の既存key/rowkindは互換用命名として扱い、モデル採用を意味する記述はcanonical descriptorから分離する。
- WHEN Plan39出力を公開する THEN model/source fingerprint metadata、既存Plan39 gate、保存analysisとの整合を確認する。不一致時は同じモデル・入力snapshotで再計算・再評価する。Plan40由来の有用なsource metadata/coverage/base year/frequency検査もinput-integrity要件として適用し、公開条件や閾値を無断で緩和しない。保存済みPlan39 analysisの `accepted: true` は採用する歴史参考推計を支える回顧的根拠として扱い、2025 calibrationのため独立forecast validationとは表示しない。新forecast LOOを一律の表示条件にしない。

## 決定事項と未検証リスク

ユーザー決定により、2005–2016は既存の世帯構成（二人以上世帯割合）補正を適用するPlan39、2017以降は公式四半期系列を採用する。Plan40 baseを今回採用する理由は残っていない。Plan40 contract自体やその有用なsource validationを廃止する判断ではなく、必要なsource metadata検査は新しいPlan39公開経路にも独立要件として保全する。補正は年齢・世代別モデルを新設する意味ではない。

保存済みPlan39分析の `accepted: true` と2018–2024回顧的metricを、採用する歴史参考推計の根拠として記録する。2005–2016年の直接A正解値はなく、2025 endpoint calibrationを含むため、延長forecast精度の証明ではない。現行public routeはコード上Plan40 baseを明示しているが、今回の計画による実装変更は未着手である。JEV所見は特定snapshot・対象の記録であり、現在のgate/runtimeを示さない。実装時にcurrent input fingerprintとgate状態を確認し、保存analysisとの不一致時は対応するモデルで再計算・再評価する。

未確認事項は、現行ブラウザでの実際の二重描画、最新完全公式四半期、実行時のPlan39 gate結果、境界の季節接続と年次アンカーの実値である。公式値と推定値の尺度・境界に差があっても、再基準化や平滑化を暗黙に加えず、観測結果と別提案として扱う。
