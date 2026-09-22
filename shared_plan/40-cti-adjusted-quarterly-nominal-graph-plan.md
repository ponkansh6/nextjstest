# SharedPlan 40: CTI調整四半期名目グラフ統合計画

## 背景

2005–2017の名目消費支出を、e-Statの月次データとPlan39-v2のbottom-up調整系列で
既存の名目グラフへ接続する。Plan39専用年次セクションは増設せず、2018Q1以降の
既存費目別CTIと同じグラフ・凡例・表示経路を使う。

## 決定事項

- 名目消費支出指数は2025年=100とする。
- e-Stat統計表000040499070の月次元データから2005Q1–2017Q4を3か月平均で派生する。
- 四半期measurementは `seriesType`/`official` に加えて
  `annualAnchorType`（`estimated`/`official`）と `quarterlyDerived=true` を持つ。
  これは公式四半期値ではなく、表示上も「月次派生」と明示する。2017年は公式年次Aを
  アンカーにするが、そこから得た四半期値は公式四半期値ではない。
- 2005–2016はPlan39-v2のB/A/L、費目別beta、Dを使うbottom-up推計、2017は公式Aを使う。
- 2005–2017は対象四半期の全10カテゴリを積み上げる。Otherはv2専用の年次anchorから
  導出し、e-Stat同名月次は季節プロファイルとして使う。ResidualをOtherの代用にしない。
- 2018Q1以降は既存費目別CTIを継続し、2017Q4/2018Q1の切替を注記する。
- Plan39専用年次セクションは非表示にし、既存名目グラフへ統合する。凡例は既存と共通にする。
- 推計／公式／unavailableの状態、`seriesType`/`official`、
  `annualAnchorType`/`quarterlyDerived`、noteは注記、tooltip、データ表、CSVで
  同一measurementから示す。

## データソース

主入力は e-Stat 統計表 `000040499070` の月次元データ。対象月は各暦四半期の3か月、
対象期間は2005Q1–2017Q4。指数化は2025年の基準値を100とする。調整計算は既存の
Plan39-v2契約で検証済みのB（基本）、A（調整）、L（長期ベンチマーク）とその
artifact metadataを使い、未検証の別ソースやGDPをフォールバックにしない。

## 式

費目 `i` の年 `y`・四半期 `q` の値は、実装の
`annualAnchor * (quarterMean / annualMean)` に合わせ、
`V_{i,y,q} = H_{i,y} × mean(M_{i,y,q,1..3}) /
mean(M_{i,y,1..12})` とする。`H_{i,y}` は Plan39-v2 の年次アンカーであり、
2017年は公式A、2005–2016年はbottom-up推計値である。したがって分母は
`mean(Q_2025 months)` ではなく、同じ費目・同じ年の12か月平均である。
2025年=100への基準化は、e-Statの2025年公式Aアンカーを基準にする計画契約として
扱う（現行コードから正規化済みであること自体は未確認）。四半期値を別の2025年
四半期平均で再正規化しない。

Plan39-v2の重複期間は `R_i,t=A_i,t/B_i,t`、切片0の費目別betaは
`beta_i=sum(log(R_total)*log(R_i))/sum(log(R_total)^2)`、長期補正は
`D_t=(L_t/L_2017)/(B_total,t/B_total,2017)`。2005–2016は
`C_i,t=B_i,t*R_i,2017*D_t^beta_i`、`T_t=sum(C_i,t)+C_other,t`。
Otherは `B_other=B_total-sum(B_9)`, `A_other=A_total-sum(A_9)`,
`R_other=A_other/B_other` から専用のbeta/推計値を導出する。2017年は公式Aを採用し、
2018Q1以降は既存CTI費目値を採用する。

## テクニカルキーポイント

- 月次派生の実装は `server/lib/view-models/quarterlyAggregation.ts` の
  `buildPlan39V2CtiNominalRows`。各費目について対象年の12か月と対象四半期の3か月を
  同じ `records` から取り、`annualAnchor × quarterMean / annualMean` を計算する。
  2025公式Aを月次分母に流用したり、2025年の四半期平均を分母にしたりしない。
- 2025年の基準値は `server/lib/ctiAdjustedConnectionEstimateV2.ts` が読む公式A
  artifact の2017–2025行に由来する。計画上、Aの対象年・費目の値は有限かつ正で、
  2025年を含む公式A系列の完全性と系列同一性を確認する。現行の artifact validation
  は有限性・構造を検査するが、全費目の正値と2025年=100の正規化を保証する証拠は未確認。
  月次側も各費目の対象年12か月が全て有限・正で、対象四半期の3か月がその12か月の
  部分集合であることを計画要件にする。ただし現行 `quarterlyAggregation` は月値の
  有限性と `annualMean > 0` を検査し、月値ごとの正値検査はしていない。月次の系列
  コード・費目名は全期間で同一の e-Stat 000040499070 系列を使い、別系列を混在させない。
- 公開カテゴリ／キーの対応は `src/lib/chartConstants.ts` の
  `CTI_ADJUSTED_V2_PUBLIC_CATEGORIES` と `CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY` を
  registry の唯一の対応表とする。総合を除く10費目が chart、tooltip、データ表、CSVで
  同じ順序・キー・measurement を共有し、v1の `残差` registry と混在しない。
- 2005Q1–2016Q4 は `seriesType=estimated_adjusted`、`official=false`、
  `annualAnchorType=estimated`。2017Q1–Q4 は公式Aを年次アンカーにするが、四半期値は
  月次派生なので `seriesType=official_adjusted`、`official=false`、
  `annualAnchorType=official`、`quarterlyDerived=true` とする。`official` は四半期値が
  公式かどうかを表し、`annualAnchorType` は年次アンカーの出所を表すため同じ意味に
  扱わない。2017Q4/2018Q1の境界は `server/lib/view-models/quarterlyAggregation.ts`
  と `src/lib/quarterlyPublicProjection.ts` の既存公開経路で一度だけ切り替える。
- 月次欠損・重複・非有限値、12か月完全性違反、3か月未満、年次アンカーまたは
  B/A/L・beta・D・Otherの必須入力不備は、計画上、その四半期の総合を除く10費目を
  一括して `status=invalid` かつ `seriesType=unavailable`、`value=null`、理由付きにする。
  現行実装は欠損・重複を四半期単位で検出し、算出後の非有限値は費目単位で無効化するため、
  10費目原子性は未達の実装ギャップとして扱う。総合を含む11カテゴリ全体を一律に
  無効化するのではなく、公開対象の10費目の原子性を受入条件にする。GDP、Residual、
  0補完、補間、重複マージは代替経路にしない。
- 受入条件の「2025年=100」は基準年の年平均（2025年の公式A年次アンカー）を指す。
  各四半期の値を100にするという意味ではない。検証では、2025年アンカーの年平均が
  100であることと、各四半期が月次季節比率を保った値であることを別々に確認する。
- 実装と公開経路の確認対象は、計算の
  `server/lib/view-models/quarterlyAggregation.ts`、年次アンカーの
  `server/lib/ctiAdjustedConnectionEstimateV2.ts`、公開投影の
  `src/lib/quarterlyPublicProjection.ts`、キーregistryの
  `src/lib/chartConstants.ts`、measurement型と注記の `src/types/chart.ts`、
  CSVの `src/lib/csvExport.ts` とする。これらで値、状態、出所、注記の parity を確認する。

## 境界と失敗時の扱い

2005Q1–2017Q4は月次派生で、2005Q1–2016Q4の年次アンカーはbottom-up、2017Q1–Q4は
公式Aアンカーである。2018Q1以降は既存CTIである。月次の欠損、
重複、非有限値、四半期3か月未満、またはB/A/L・beta・D・Otherのanchorを含む必須入力不備は、
対象四半期の全10カテゴリを一括で `value=null` のunavailableにする。不完全なstackは表示しない。
補間、0補完、重複マージ、GDPやResidualへのフォールバックは禁止する。公式A（2017以降）は
推計失敗で上書きしない。

## 受入条件

- 2025年の公式A年次平均が100として扱われ、2005Q1–2017Q4の各値に月次派生metadataがある。
- 2005–2016の10カテゴリがbottom-upで再現可能で、2017は公式年次Aアンカーとして区別される。
- 2017Q4/2018Q1境界と2018Q1以降の既存費目別CTIが注記される。
- Plan39専用年次セクションがなく、既存凡例と同じregistryへ統合される。
- chart、tooltip、データ表、CSVの数値・source/unit/frequency/aggregation/status/reason/
  `seriesType`/`official`、`annualAnchorType`/`quarterlyDerived`、noteが一致する。
  unavailableは全経路で空値と理由を示す。
- 欠損・重複月およびanchorを含む不完全入力が対象四半期の全10カテゴリに対して
  一括fail-closedになり、不完全stackや代替値を生成しない。

## テスト項目

- 2025基準化、四半期3か月平均、対象外月、欠損月、重複月、非有限値、3か月未満。
- beta/D/Otherと2005–2016積み上げ、2017公式A、2017Q4/2018Q1切替。
- 共通凡例、注記、tooltip、データ表、CSVの値・measurement metadata parity。
- `seriesType`/`official` と `annualAnchorType`/`quarterlyDerived`、noteの全10カテゴリ parity。
- unavailableの空値・reason、GDP/Residual/旧専用年次セクションの混入防止。

## リスク

e-Statの改訂や月次定義の変更で再集計結果が変わる可能性がある。B/A/Lの母集団・
単位差、Otherの導出不安定性、2017接続と2018切替の二重計上も監査対象とする。
変更時はsource metadata、artifact hash、reasonを更新し、既存CTIの契約を壊さない。

## 過去のJEVレビュー記録

以下は過去の記録であり、今回の文書更新の判定結果として扱わない。

公式クライアントで送信前の入力検証を行い、入力が有効であることを確認した後、
`.env.local` の `TYPESAFE_API_KEY` を認証専用に読み込んで本判定を実行した。
結果は `/tmp/jev-plan40-review-live.json` に保存した。JEV の `rawResponse` は
`choice=valid_but_limited`、`confidence=0.53`、確率
`valid_as_defined=0.02` / `valid_but_limited=0.64` / `not_valid=0.26` /
`indeterminate=0.08` だった。`rawResponse` に `evidence` と `limitations` の明示は
なく、Plan40の妥当性には未確定点が残る。したがって本結果は限定付き判定として記録し、
既存のテスト、型チェック、lintの代替や無条件の妥当性承認とは扱わない。

初回判定が限定付きだったため、理由 `evidence_insufficient` で follow-up を送信した。
初回レビューは `priorReview` として保持され、送信前の入力検証と本送信ともに成功した。
follow-up の結果は `/tmp/jev-plan40-follow-up.json` に保存し、`choice=needs_evidence`、
`confidence=0.79`、確率 `needs_evidence=0.84` / `clarified=0.14` /
`needs_fix=0.01` / `indeterminate=0.01` だった。応答上、`evidence` と `limitations` の
明示はなかった。これは実装の否定ではなく、追加の根拠提示が必要という意味であり、
実装の妥当性を確定するには受入条件に対応する検証証拠が引き続き必要である。JEVは
既存のテスト、型チェック、lintその他の検証の代替とは扱わない。

証拠付き implementation checkpoint review では、受入条件、具体的なテストアサーション、
`type-check`、変更コードの `oxlint`、production `build`、`git diff --check` を
verification state として明示した。初回レビューおよび更問では `needs_evidence` だったが、
実装・テストの証拠を独立した verification として提示した結果、最終判定は
`choice=valid_as_defined`、`confidence=0.35` となった。確率は
`valid_as_defined=0.51` / `valid_but_limited=0.44` / `not_valid=0.01` /
`indeterminate=0.04` である。`rawResponse` に `evidence` と `limitations` の明示はなかった。
この判定はJEVによる独立評価であり、既存のテスト、型チェック、lint、buildその他の検証の
代替とは扱わない。

## 今回のJEVレビュー

過去の記録とは分離して、今回の計画本文、実装との照合根拠、受入条件、未確認点を含む
文書レビュー request を公式クライアントで新規に作成・送信した。request は
`/tmp/plan40-doc-review-request.json`、判定と raw response は
`/tmp/plan40-doc-review-result-v2.json` に保存した。結果は
`choice=valid_as_defined`、`confidence=0.54`、確率
`valid_as_defined=0.65` / `valid_but_limited=0.33` / `not_valid=0.02` /
`indeterminate=0` だった。JEVは既存のテスト、型チェック、lintその他の検証の代替とは
扱わない。

## SharedPlan 40 続編: ユーザー視点の最小操作評価（履歴・後続記録により更新済み）

> **履歴上の中間評価。** 以下の「2005–2017 が `unavailable`/`null`」という記述は、修正前の観測結果を保存したものであり、後続の「完了時のユーザー視点確認」および「実装完了チェックポイント」により superseded されている。現在の判定には使用しない。

実装内部の fixture ではなく、利用者が画面で行う最小限の操作で現状を評価する。名目消費を選択し、データ表を展開してCSVをダウンロードした。確認結果は、2005–2017 の全行が `unavailable`/`null` で、画面の表示は「利用できません」だった。2018Q1以降は数値が表示され、期間ごとの出所注記、データ表の展開、CSV出力は操作できた。したがって、2005Q1–2017Q4の表示可能なPlan40値は、ユーザー視点ではまだ確認できていない。

### 続編の受入条件

- 名目消費を開いた利用者が2005Q1–2017Q4の各行で数値と月次派生／年次アンカーの注記を確認できる。全行が一律に `unavailable`/`null` にならない。
- 本当に利用不能な行は、グラフ、tooltip、データ表、CSVで空値と同じ機械可読理由を示し、「利用できません」だけで原因を示さない。
- 2017Q4から2018Q1への切替と、各期間の出所が画面上で判別できる。
- データ表とCSVの値、空値、状態、理由、出所が同じ行単位で一致する。

### 再評価の最小操作

名目消費を選択し、2005Q1、2017Q4、2018Q1を順に確認する。データ表を展開して同じ3期間の値・状態・理由・出所を確認し、CSVを1回ダウンロードする。2005Q1–2017Q4に数値があり、2018Q1で既存CTI経路へ切り替わること、画面とCSVのmetadataが一致することを記録する。全行が `unavailable`/`null` のまま、または原因が「利用できません」だけなら、操作自体が成功していても受入不可と判定する。

### 続編時点の未達判定（修正前の履歴）

ユーザー視点の現状は、2018Q1以降の数値表示、出所注記、データ表展開、CSV出力は確認済みである。一方、2005–2017の全行が `unavailable`/`null` で「利用できません」と表示されたため、Plan40の2005Q1–2017Q4値表示と利用者向け原因説明に関する受入条件は未達とする。この判定は最小操作による現状評価であり、原因調査・実装完了の証拠とは扱わない。

### 続編で確認した実装上の阻害要因と最小修正方針（修正前の履歴）

診断では、`server/lib/data-loader/ctiAdjusted.ts` が常に `contract: "plan39"` を使用しており、Plan40の対象年・metadata検証結果を生成していない。また、Plan39のevidence gateが `accepted=false` のため、`quarterlyAggregation` の2005–2016行が `unavailable` になっている。これが2005–2017を画面で数値化できない実装上の阻害要因である。

最小修正方針は、既存Plan39契約を変更せず、Plan40専用のロード経路を追加して `contract: "plan40"` と対象年・10カテゴリ・source/artifact metadataの厳格な検証を通すことである。Plan40経路では、検証成功時に2005–2016のbottom-up値と2017の公式Aアンカーから月次派生四半期値を生成し、失敗時は対象10カテゴリを同一reasonの `value=null`/`unavailable` とする。四半期層でPlan39 gateを迂回して値を補完すること、既存2018Q1以降の経路を変更することは受入条件に含めない。

## 続編JEVレビュー

続編のユーザー視点評価、受入条件、再評価操作、未達判定、実装上の阻害要因と最小修正方針を含むレビュー request について、公式クライアントの入力検証を通過した後に送信し、送信成功を確認した。初回判定は `choice=valid_but_limited`、`confidence=0.59`、確率は `valid_but_limited=0.69` / `not_valid=0.21` / `valid_as_defined=0.07` / `indeterminate=0.03` だった。JEVの `rawResponse` には `evidence` と `limitations` の明示がなかったため、現状のユーザー評価と計画には証拠および制約の記録を引き続き補う必要がある。この判定は既存テスト、型チェック、lint、ブラウザ操作その他の検証の代替ではなく、実装の妥当性を無条件に確定するものとして扱わない。

## 続編: Plan40 runtime 検証結果と残課題（修正前の中間記録）

Plan40 loader の接続修正は完了した。`contract: "plan40"` を指定したロード経路は Plan39 の analysis/evidence gate に閉じられず、builder の Plan40 input validation と annual/publication 状態を保持する。Plan39 の既存経路と既定呼び出しは維持した。

ただし実 artifact を Plan40 契約で検証すると、入力自体はなお invalid だった。確認された理由には `A:raw_range_excludes_target:2005`、`A:adopted_range_excludes_target:2005..2016`、`L:ignored_category`、`L:extra_category` などがある。このため fail-closed の結果、ブラウザ上の2005–2017は引き続き `null` / `unavailable` であり、loader接続修正だけでは表示可能な数値にならない。

次の完了条件は、Plan40 専用の B/A/L artifact を2005–2017、10カテゴリ、必要な source/artifact metadata 契約に整備し、Plan40 関連テスト、type-check、対象ファイル lint、ブラウザ最小操作、JEVレビューを再実施して通過させることである。Plan39 の既存 artifact/runtime 経路と publication gate の契約は変更しない。

実装後の検証記録として、Plan40 関連41件、type-check、対象2ファイルの oxlint は通過した。全体 lint は `jev-request.mjs` の既存 `no-unsafe-finally` により失敗した。この失敗は Plan40 loader 修正の結果とは切り分け、全体 lint の再実行時にも記録する。

### 続編JEVレビュー（中間判定）

続編の follow-up は `choice=needs_fix`、`confidence=0.47`（`needs_fix=0.60`、
`clarified=0.34`、`needs_evidence=0.06`）だった。これは実装前の中間判定であり、完了判定ではない。

### 実装完了チェックポイント（現行の権威ある判定）

- runtime は `loadCtiAdjustedV2Estimate({ contract: "plan40" })` を明示し、既存の
  `contract: "plan39"` と publication gate を維持した。
- Plan40 の A/B/L 検証を役割別の実データ範囲（A: 2017–2025、B: 2005–2025、
  L: 2005–2017）に整合させた。Other は series 11 の直接値を互換入力として扱い、
  production の年次値は total から series 2–10 を差し引いて導出する。
- L の `missing_required_year` を入力契約違反として検証失敗にし、対象値を
  fail-closed で公開しないことを回帰確認した。実 artifact を使う integration regression test も追加した。
- v2 registry を chart、表、CSV に統合し、既存の legacy projection 契約を維持した。
  Plan40 行だけに v2 10費目を追加する。
- Plan40 targeted tests 43件（実 artifact integration regression test を含む）、`type-check`、対象変更の
  oxlint、`git diff --check` が通過した。
  全体 lint は既存 `skills/jev-review/scripts/jev-request.mjs` の `no-unsafe-finally` で失敗した。

### 完了時のユーザー視点確認（現行の権威ある証拠）

名目消費を選択し、データ表を開き、CSVを1回ダウンロードする最小操作を再実施した。
「利用できません」の表示はなく、2005Q1 と 2017Q4 は v2 数値、2018Q1 は既存 legacy
CTI 数値を表示した。CSV は87行で、同じ3期間を含み、画面とCSVの値・状態・出所の対応を確認した。

### 実装後JEVレビュー（前回チェックポイント・最新判定により更新済み）

実装後の通常の初回判定は `choice=valid_but_limited`、`confidence=0.39` だった。
確率は `valid_but_limited=0.54`、`valid_as_defined=0.44`、`not_valid=0.01`、
`indeterminate=0.01`。follow-up は `choice=clarified`、`confidence=0.44` で、
確率は `clarified=0.58`、`needs_evidence=0.35`、`needs_fix=0.06`、
`indeterminate=0.01` だった。いずれの raw response にも `evidence` と `limitations` の
明示はなかったため、JEV判定にはこの記録上の制約がある。受入の根拠は、43件の targeted
tests、type-check、対象oxlint、git diff check、およびブラウザとCSVのユーザー視点証拠とする。

## Plan40 現行の完了判定（権威ある最終記録）

本プランの続編に関する現在の判定は、直前の「実装完了チェックポイント」「完了時のユーザー視点確認」および最新JEVレビューに基づき、完了とする。L の `missing_required_year` は入力検証失敗として fail-closed になることを実 artifact integration regression test で確認済みである。修正前の `unavailable`/`null` 観測、Plan39契約経由、Plan40入力範囲不整合、および過去のJEV判定は履歴として保持するが、現行判定を上書きしない。最小操作では名目消費の選択、データ表の展開、CSVのダウンロードを行い、2005Q1・2017Q4のv2数値、2018Q1のlegacy CTI数値、画面とCSVの値・状態・出所の対応を確認済みである。

最新の実装後JEVレビューは HTTP 成功し、`choice=valid_as_defined`、`confidence=0.50`、確率は `valid_as_defined=0.63`、`valid_but_limited=0.37`、`not_valid=0`、`indeterminate=0` だった。`rawResponse` に `evidence` と `limitations` の明示はなかったため、この制約は保持する。これは直前の `valid_but_limited` / `clarified` 判定を supersede する最新結果であり、既存のテスト・型チェック・lintの代替とは扱わない。
