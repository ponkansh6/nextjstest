# Plan41: 名目消費支出の正式調整済みCTIへの四半期接続改善計画

作成日: 2026-09-22
状態: 実装checkpoint／検証中（Plan39年次成果物を保持し、Plan40の2005–2017表示契約を本計画で更新）

## Purpose

2017年以前の名目消費支出の四半期表示を、2018年以降に表示される正式な調整済みCTIの水準へ接続する。対象は四半期表示用の2005–2017年だけであり、Plan39の年次原本・推計モデル・公式2017年年次アンカーは再計算しない。2018年以降の値と経路は不変とする。

Plan40の2005–2017表示アンカーと2017年季節比契約は本計画で上書きする。2018年以降のruntimeが選択済みの `CpiData[]`（T、`000040499069`、総世帯）を水準と2017年季節性に使い、Tに存在しない2005–2016年の季節比だけ過去季節比source M（`000040499070`、二人以上の世帯）から得る。Tの2017年平均をPlan39年次アンカーへ固定係数として適用し、2017年四半期はTの四半期平均へ一致させる。2016→2017の季節source切替は残余仮定であり、境界値の一致は要求しない。

## 実装開始ゲート（最初に行う最小再現）

同一fixtureで、次を実数値・metadata・実際のチャート投影まで突合する。前回確認で得た数値は再検証するまで引用しない。

- `shared_plan/39-cti-micro-adjusted-series-connection-estimate-plan.md`（Plan39-v2）の年次アンカー（C=2005–2016、A=2017）と、runtimeが`loadCtiDataInternal`で選択したTに2017年12か月が存在すること。
- Tは `data/source/cti_data2025.csv`、metadata `statInfId=000040499069`、2025年基準、総世帯、2017-01〜2026-07であることを確認する。M（`000040499070`、二人以上の世帯）は2005–2016の過去季節比専用で、2017年の水準・季節比には使わない。
- T/Mそれぞれの統計表、対象世帯、基準年、単位、値種別、頻度、10費目名、月キーの重複・欠損・符号を確認し、2017年のTは各系列12か月であることを証跡化する。
- 入力10費目が加法可能な寄与指数または金額であることを確認する。Otherは2017年HだけPlan39-v2の `H_other,2017 = H_total,2017 - Σ主要9費目`（`17.3`）を使い、2005–2016年Hは既存 `result.other` 推計値を保持する。T/Mそれぞれの月次Otherは `total - Σ主要9費目` と対応させ、独立公式series 11はOtherの入力に使わない。
- `server/lib/view-models/quarterlyAggregation.ts` から `src/lib/quarterlyPublicProjection.ts`、グラフ、tooltip、データ表、CSVまで、2017Q4と2018Q1を同じfixtureで追跡する。四半期計算には選択済みTを引数注入し、別loader選択や固定 `cti_data2025.csv` の再読を行わない。
- 同じ投影経路で旧support系列や別のCTI経路が混在していないことを確認する。

入力source、単位、基準、費目対応、チャート経路が確定できない場合は計算・表示を開始せず、`unavailable` と理由を返す。

## Requirements（WHEN / THEN）

### R1: 固定費目係数による接続

**WHEN** 10費目すべてについて、Plan39年次アンカー `H_{i,y}`（C=2005–2016、A=2017）とruntime選択済みTの2017年12か月が検証済みである。
**THEN** 次を計算し、2005–2017年の表示アンカーにだけ適用する。

`a_i = mean_{m=1..12}(T_{i,2017,m})`
`s_i = a_i / H_{i,2017}`（`H_{i,2017}` は公式A年次値）
`Hdisplay_{i,y} = s_i × H_{i,y}`
`Qdisplay_{i,y,q} = Hdisplay_{i,y} × mean(M_{i,y,q,1..3}) / mean(M_{i,y,1..12})`（`y<2017`）
`Qdisplay_{i,2017,q} = Hdisplay_{i,2017} × mean(T_{i,2017,q,1..3}) / mean(T_{i,2017,1..12}) = mean(T_{i,2017,q,1..3})`

`s_i` は費目ごとに固定し、年ごとに再推定しない。2017年の四半期はTの四半期平均と一致する。2018年以降は既存値を変更しない。

開始ゲートで再計算したT係数（`s_i = T̄_{i,2017} / H_{i,2017}`）は次の通りである。`その他の消費支出` は年次・月次残差契約で求める。総合は10費目の係数には含めない。

| 費目             |              `s_i` |
| ---------------- | -----------------: |
| 食料             | 0.8014916934619508 |
| 住居             | 0.9133835470085472 |
| 光熱・水道       | 0.8584757383966244 |
| 家具・家事用品   | 0.8367594696969697 |
| 被服及び履物     | 0.9053597560975610 |
| 保健医療         |  0.972431818181818 |
| 交通・通信       | 1.0360496688741723 |
| 教育             | 1.1298035714285715 |
| 教養娯楽         | 0.8880558035714287 |
| その他の消費支出 | 0.9297779383429667 |

主要9費目はAの公式直接値を年次アンカーに使い、2017年OtherはPlan39-v2の公式年次総合からの残差、2005–2016年Otherは既存 `result.other` 推計値を年次アンカーに使う。2017年の四半期は、各費目について `Σ_q Qdisplay_{i,2017,q}/4 = T̄_{i,2017}` となる恒等式を検算する。2017年のraw一致と、既存の2桁公開丸め後の一致は分けて検証する。

### R2: 出所と原本の区別

**WHEN** 補正値を投影する。
**THEN** `source/provenance` に元source・先source・基準年・単位・対象世帯・適用範囲・`s_i` を記録し、Plan39の公式A直接値と区別する。2005–2016と2017の四半期表示は `official=false`、年次Aの直接値は従来どおり公式として保持する。

### R3: 費目と総合

**WHEN** 10費目を構築する。
**THEN** 費目名を一対一で対応させ、同一定義・同一単位・同一基準年を要求する。入力は加法可能な寄与指数または金額とし、独立100指数の単純和は拒否する。主要9費目は公式Aの直接値を使う。Otherは2017年HだけPlan39-v2の公式年次総合−主要9費目（`17.3`）、2005–2016年Hは既存 `result.other`、T/M月次はそれぞれの総合−主要9費目を使い、独立公式series 11は使わない。総合表示は10費目の合算とし、残差には丸めやゼロ下限を適用せず恒等式を保つ。ただし負または非正の季節性入力は`invalid_seasonal_input`でfail-closedにし、負のquarter outputを表示しない。総合を別係数化しない。費目ごとの成長率は保つが、総合の成長率は保証しない。

### R4: fail-closed

**WHEN** 2017年の重複年データ、欠損、ゼロ、負値、非有限値、12か月未満／超過、費目対応不能、source契約不一致、または月次3か月不足がある。
**THEN** 接続済みと表示せず、既存の欠損契約に従って値を `null`/`unavailable` とし、機械可読な理由を全表示経路へ伝播する。2017年接続係数が欠損・不正なら当該費目の2005–2017全期間を unavailable とする。その他の年の月次欠損なら12か月分母が成立しないため当該年の全四半期を unavailable とし、2018年以降は保持する。総合は必要費目に欠損があれば `null` とし、部分和を表示しない。0補完・補間・重複マージ・旧supportへのフォールバックは禁止する。
Tの2020年fallbackを含め、実際に選択されたsourceとmetadata（statInfId、baseYear、householdScope、coverage）を同一選択結果で検証し、不適合ならPlan41期間をfail-closedにする。Mの過去季節比が不足・不正でも同様に対象年をunavailableとし、別loaderを選び直さない。

### R5: 季節性と基準

**WHEN** 月次から四半期へ変換する。
**THEN** 2005–2016はMの同じ年の12か月平均を分母に使い、2017年はTの同じ年の12か月平均を分母に使う。2025年アンカーを季節比分母へ流用しない。2016→2017の季節source切替は残余仮定として記録し、2017Q4と2018Q1の値一致や総合=100は要求しない。

## Data Sources / Data Flow

入力は、Plan39の年次成果物C/A（原本を読み取り専用で利用）、runtimeが選択済みのT（`data/source/cti_data2025.csv`、metadata `000040499069`、2025年、総世帯、2017-01〜2026-07）および過去季節比専用M（`000040499070`、二人以上の世帯）である。loaderはTの選択結果を引数として受け、別loader選択や固定source再読を行わず、metadataと対応表を検証して接続係数・表示アンカー・四半期値・provenanceを生成する。`quarterlyAggregation` は2005–2017だけ新しい表示アンカーを受け取り、2018以降は既存経路を通す。`quarterlyPublicProjection`、chart、tooltip、表、CSVは同一projectionを利用し、`official`、source、reason、季節派生情報を一致させる。T/M月次Other残差は総合から主要9費目を直接減算し、丸めやゼロ下限を適用せず恒等式を保つ。ただしR4に従い、負または非正の季節性入力は表示値として通さず、measurementを`status=unavailable`、`reason=invalid_seasonal_input`としてfail-closedにする。負残差の検証では入力の`total−Σmajor`恒等式と、このunavailable理由を検証し、負のquarter outputは期待しない。非enumerableな`ctiMetadata`は選択済みTから明示引数としてaggregationへ渡し、UI・CSVの公開projectionへ伝播する。

Tの2017年部分は正式runtime水準・季節性へ合わせるブリッジ入力であり、Mは2005–2016の過去季節性だけを提供する。TとMの世帯範囲差および2016→2017の季節source切替は、母集団差や季節性の変化を推定するものではない。固定係数 `s_i` の適用範囲と限界をprovenanceへ残す。

表・CSV等は実在する既存公開経路に限って受入確認の対象とし、存在しない経路や成果物をこの計画のために新設しない。

## Component Tree（実装時の接続点）

`loadCtiDataInternal (selected T injection)` + `historical seasonal M loader` → `connection coefficient / display anchor builder` → `server/lib/view-models/quarterlyAggregation.ts` → `src/lib/quarterlyPublicProjection.ts` → `SpendingBarChart / tooltip / data table / CSV`

Plan39の `ctiAdjustedConnectionEstimateV2` は年次原本の所有者であり、Plan41の表示補正で上書きしない。

## Non-goals

- Plan39のC/A/L、beta、D、Other、年次artifactを再計算・改変しない。
- 2018年以降の正式CTI、系列定義、値、チャート経路を変更しない。
- 2017Q4と2018Q1を無理に連続値へする、季節性を消す、総合の成長率を保存することを目標にしない。
- 固定係数から母集団差の年次変動や因果効果を推定しない。

## 実装段階と責任分離

1. fixture再現、source・単位・基準・費目対応・経路を確認し、開始ゲートの証跡を作る（完了）。
2. 係数、表示アンカー、provenance、fail-closed契約を最小変更で実装する。Plan39原本と2018年以降の分岐を保つ。
3. テスト実装は実装担当（`@fixer`）が行う。テスト実行、type-check、lint、実投影確認、JEVレビューはOrchestratorが行い、責任を混在させない。
4. 実装変更と並行してopenspecのData Sources / Data Flow / Component Tree / Requirementsを実装と同期する。これはPlan41文書作成の範囲外である。

## 受入条件とテスト

- 2017年全4四半期・全10費目が、選択済みTの同年四半期平均とraw値で一致する。既存2桁公開丸め後の一致は別に確認する。
- 2005–2017の各年で、4四半期平均が `s_i × H_{i,y}` になる。
- 各費目の年次成長率が、補正前の元アンカー `H_{i,y}` の年次成長率と等しい。
- `s_i` の掛け忘れ、二重適用、2017公式A直接値の誤上書きを検出する。
- 2018年以降の値・metadataが不変で、実投影・グラフ・tooltipに旧support系列が混在しない。
- 2016→2017の季節source切替（M→T）の値連続性は要求しない。一方、2017Q4と2018Q1は同じT経路なので、両四半期の値が等しいことは要求しないが、境界変化率がTのraw値から計算した変化率と一致することを要求する。raw値で検証し、公開値は既存の丸めを考慮する。
- 総合が10費目合算で、季節差が保持される。2017年OtherはA総合−9費目、2005–2016年Otherは既存 `result.other`、T/M月次Otherは各々の総合−9費目である。
- 欠損、重複、ゼロ、負値、非有限値、12か月不備、対応不能でfail-closedになる。
- 10費目のT/M source、単位、基準年、世帯範囲、provenance、`official=false` がchart・tooltip・表・CSVで一致する。
- 数値比較の許容誤差は、丸め前のfixtureで固定したabsolute toleranceとrelative toleranceを使い、表示丸め後の値で判定しない。
- 表・CSV等の確認は実在する既存公開経路に限る。存在しない経路や成果物を受入のために新設しない。

## リスク

正式T/M sourceの改訂、費目コード変更、年次Aとの単位・対象世帯差により係数が変わる。TとMの世帯範囲差および2016→2017の季節source切替は経験的な表示接続として明記し、同一母集団の推定値とは扱わない。source hashとmetadataを保存し、選択済みTで係数を再計算する。係数に恣意的な極端値の閾値は設けず、係数一覧・出典・適用範囲をレビューする。

## レビュー記録

- 開始ゲート結果: runtime sourceが `000040499070` ではなく、`loadCtiDataInternal` 選択済みT（`000040499069`、総世帯）であることを確定した。旧M平均への接続係数・旧Other係数は訂正し、T係数（食料`0.8014916934619508`、住居`0.9133835470085472`、光熱・水道`0.8584757383966244`、家具・家事用品`0.8367594696969697`、被服及び履物`0.9053597560975610`、保健医療`0.972431818181818`、交通・通信`1.0360496688741723`、教育`1.1298035714285715`、教養娯楽`0.8880558035714287`、Other`0.9297779383429667`）へ置換した。Otherは2017年Hのみ`17.3`、2005–2016年Hは既存`result.other`、T/Mは月次total−主要9費目であり、直接series 11は使わない。開始ゲート待ちとユーザー選択待ちは解消した。
- 実装差分とPlan41要件の一致確認: 選択済みTの注入、T2017水準・季節性、M2005–2016季節比、Other残差、fail-closed理由を実装中。Plan39年次artifactと2018年以降経路は変更しない。
- テスト／型チェック／lint／実投影: 型チェック・lint初回は通過した。関連テストは修正後に再実行中であり、最終判定は未完了。実データ検証は年次130件の最大誤差`7.1e-15`、2017年四半期40値のT一致、2018年以降34四半期の深い完全一致、2017Q4総合の旧値`109.8598505`からT raw`98.2431333`への接続、2018Q1 raw`95.5640667`／公開`95.56`を確認した。
- 実装状態: 実装checkpoint／検証中。`SeriesMeasurement`へ`sourceId`、`statInfId`、`householdScope`、`seasonalitySourceId`、`targetSourceId`、`targetHouseholdScope`、`bridgeAppliedRange`、`bridgeCoefficient`を追加し、loader選択済み配列の非enumerable `ctiMetadata` と `aggregation=plan41_bridge` を通じてUI・CSVへ伝播中。
- JEVレビュー: 初回 `valid_but_limited` → follow-up `needs_evidence` → clarification `verify_t_injection_and_2018_immutability`、effective verdict `requires_revalidation`。自律loopでT注入・2018年以降不変性の実証材料を追加したが、JEV通常checkpointは未実施であり、合格とは記載しない。JEVはテスト等の代替としない。
- 最終検証記録: 公開面の実runtime provenanceは証跡JSONの29/29を確認した。最終実測の`pnpm test`は78 files / 750 passed / 4 skipped、hookのfocused runはsandbox外で2 files / 32 passedだった。`pnpm test`にはhookテストも含まれるため、hookの別実行は補助確認として記録する。type-check、lint、buildはいずれもexit 0だった。旧記録のfocused tests 85/131は対象コマンドと実行ログがなく再現不能なため、確定値から除外する。これらは実装と公開面の検証証拠であり、JEV判定の代替ではない。
- JEV再判定記録: 再判定結果は親エージェントが確定して追記する。記録先は`<JEV再判定ファイルのパス>`、最終choiceは`<未確定：親が追記>`（現時点の既存判定を記載する場合は`valid_but_limited`）とし、ここでは最終choiceを断定しない。
- JEV v2最終再判定（歴史的証跡）: `.tmp/plan41-jev-final-revalidated-v2-result.json` に記録した。`choice=valid_but_limited`、`confidence=0.56`、確率は `valid_but_limited=0.67`、`valid_as_defined=0.32`、`not_valid=0.01`、`indeterminate=0`。公開証拠は `hasBridgeCoefficient=true`、29/29 を確認した。follow-up は `reason=constraint_conflict`、`choice=clarified`、`confidence=0.70`、確率は `clarified=0.77`、`needs_fix=0.19`、`needs_evidence=0.03`、`indeterminate=0.01`。これは旧JEV v2の結果であり、今回の最終実測（`pnpm test` 78 files / 750 passed / 4 skipped、hook 2 files / 32 passed）と混同しない。CSV列の偽陰性は修正済みで、残る限定はM→T seasonal source切替等の既知データ契約である。完了報告のみを記録し、テストは親が実行済みである。
