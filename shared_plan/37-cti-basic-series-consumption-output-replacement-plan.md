# Plan37: 民間最終消費支出をCTI基本系列に置き換えて出力する計画

> 状態（是正前監査時点の履歴）: レビューで追加発見した未完了事項あり。以下の記述は是正前監査として残す。現在の完了判定は末尾の追補を参照する。

## 目的

完了済みPlan36で取得したe-Statの2025年基準CTIミクロ基本系列から、二人以上世帯の「消費支出（名目）」原数値を固定選択し、現在のGDP由来の民間最終消費支出比較線をこのCTI系列へ置き換えて表示する。通常表示と延長表示の切替契約は維持し、2005年1月から取得済み最新月まで同じ公式CTI系列を連続表示できるようにする。

Plan36の保存metadataで表ID・期間・更新状態を確認し、今回の出力接続のための再取得は原則不要とする。Plan36の完了成果物を入力契約として扱い、値の採用条件や算式を先送りしない。

## 入力と系列選択

- 入力ディレクトリ: `data/source/official-cti-2025-long-term/`
- 原数値: `000040499070.normalized.csv`
- 系列対応: `series-map.csv`
- 固定選択: `series_index=1`、`official_series_code=1`、系列名「消費支出（名目）」
- 対象: 二人以上世帯、2025年基準、原数値、2005-01〜2026-07（調査時点の取得済み範囲）
- 原数値の保存値 `x_t` は公式2025年基準値をそのまま保持する。独自の比較表示値は保存原数値と別フィールドとして扱う。
- `000040499082.normalized.csv` の季調系列、実質系列 `series_index=12` は今回追加しない。

重複月、欠損、非有限値は入力検証で検出し、同月の値を推測・合算しない。numeric 0は有効値として保持し、個々の基準月が0でも抑止しない。

## 出力仕様

現在のGDP由来「民間最終消費支出」経路のうち当該比較線への接続をCTI入力へ変更する。GDPの他用途・他の比較経路は温存する。表示ラベル、説明、出典、表、CSVキー、tooltip、凡例、境界文言はCTI基本系列名と公式CTI出典にそろえ、GDP名やGDPとの接続を当該線に残さない。

- 通常範囲: 既存の通常表示境界（現行契約では2017年以前）を維持する。
- 延長範囲: 既存の延長境界（現行契約では2018年以降）と `adv` on/off の挙動を維持する。
- 延長値: 取得済み公式月次値を継続表示する。予測値、GDP値との接続、季調値との混合は行わない。
- 12か月移動平均: `M_t = mean(x_{t-11}, ..., x_t)`。連続した12暦月が全て有限のときだけ計算し、2005-01〜2005-11は必ずnullとする。欠損時に部分窓、0補完、補間はしない。
- 推奨比較指数: `B = mean(M_{2025-01}, ..., M_{2025-12})`、`I_t = 100 * M_t / B`。`B` の12月が全て存在し、有限かつ0より大きい場合だけ生成する。
- 基準不成立: `B` を構成する12個の `M` が全てそろい有限であることを確認し、`B <= 0` の場合だけ新CTI比較系列を非表示にして理由をメタデータ/状態へ出す。個々の基準月の0は許容する。GDP代用や黙ったfallbackはしない。
- CTI利用不能時: chartConstantsのCTI通常・延長registryが入力の状態を動的に反映し、`status`/`reason` と凡例・公開チャートの表示状態を一致させる。利用不能時に `valid`/`reason: null` を固定しない。
- 表・CSV metadata: `section-new-graph` の `DataTableSpec` にCTI系列registry由来のmetadata（出典、unit、status、reason）を渡し、グラフ・表・CSVの公開契約を一致させる。

既存コードでは比較系列に基準年平均=100のスケール経路があり、`supportSeries.ts` 等で `100 / base` を計算し、公開projectionでは表示値を丸めている。実装時に `CpiData` とチャート用キーの単位契約を確認する。内部値は既存チャートの単位契約に合わせ、必要な1↔100変換は境界1か所だけで行う。公開値・軸・CSVの意味を一致させ、二重倍率を禁止する。原数値の保存単位と独自表示再基準化は公式指数と明確に区別する。

出力キー案は通常範囲を `CTIミクロ基本系列（名目・参考）`、延長範囲を `CTIミクロ基本系列（名目・参考・延長）` とする。実装時の既存キー契約との衝突は型と公開projection境界で解消する。

## テクニカルキーポイント

1. `earnings.ts` の `buildConsumptionMaps` / `output` を、CTIの固定系列から作る原数値Map・12MA Map・比較指数Mapへ分離する。既存費目データの入力を無条件に総入替しない。
2. `cpi.ts` の `selectCtiPair`、`loadCtiDataInternal` または専用loaderで、Plan36のlong-term CSVを系列identity付きで読み込む。通常のCTI費目ローダー契約と衝突する場合は専用入力境界を置く。
3. `chartConstants` のキー、系列レジストリ、色、凡例ラベルをCTI基本系列名へ更新し、既存GDPキーとの誤結合を型で防ぐ。
4. `CpiChart` / `CpiChartSections`、`DataTablesSection`、CSV exporter、共通tooltip、凡例、セクション見出し、出典metadataを同一の公開キーへ接続する。グラフ・tooltip・表・CSVで値と欠損を一致させる。
5. 通常/延長の境界は既存の `adv` 契約を読み、CTI長期値の表示期間だけを差し替える。延長offで2018年以降が混入する、または延長onで公式値が欠落する状態を許さない。
6. 2020 rollbackはplan37の対象外とし、専用のCTI入力、metadata、source mode、選択・表示・fallback経路は実装しない。2020 rollback専用経路の維持や互換表示は本計画の完了条件に含めず、2025長期系列の計算・表示契約にも持ち込まない。
   Plan37公開線は `SeriesDescriptor`/`SeriesMeasurement` の同一型で raw/12MA/normal/extension を追跡し、`Record<string, unknown>` と旧 `消費支出（参考）` の実値を公開経路へ持ち込まない。旧row shapeは内部互換のnullフィールドとしてのみ保持する。
7. 既存基準設定の契約がCTI長期系列に対応しない場合は、理由付きで対象表示を抑止する。GDPへ黙ってfallbackしない。

> 適用範囲注記: plan37が置換するCTI比較線では、2020 rollbackを選択・表示・fallbackせず、新規取得も実装もしない。一方、既存loader/既存仕様が別途定義する2020 rollback契約そのものを本計画で変更・削除するものではなく、必要な全体廃止は別計画とする。

## 段階的実装

### Phase 1: 入力境界と計算

Plan36成果物のschema、系列identity、期間、重複、欠損を検証するloaderを追加または既存loaderへ限定接続する。CTI固定系列から原数値、12MA、2025基準比較指数を生成し、基準不成立時の状態理由を定義する。2020 rollbackは対象外として選択・表示・fallbackを行わない。

### Phase 2: view-model と出力契約

`earnings.ts` のoutputおよび型、`chartConstants`、ページの公開データを更新する。通常/延長境界、`adv` on/off、null、表示単位、キー名を一貫させる。対象線に残るGDP由来の接続だけを除去する。

### Phase 3: UIとメタデータ

`CpiChart`、`CpiChartSections` と関連チャート、tooltip、凡例、表、CSV、境界説明、出典表示をCTI基本系列へ接続する。ユーザー向け文言から対象線のGDP参照を除き、CTIの系列名・2025年基準・原数値/比較指数の区別を表示する。

### Phase 4: 仕様同期と検証

実装と並行して `openspec/specs/nextjstest/spec.md` の Data Sources / Data Flow / Component Tree / Requirements を更新する。`openspec/config.yaml` の規則に従い、各要件へWHEN/THENシナリオを追加する。テスト実装はfixer、テスト実行と最終ゲートはOrchestratorが担当する。

## WHEN/THEN受入シナリオ

- WHEN 入力を読み込む THEN `series_index=1` かつ `official_series_code=1` の名目消費支出だけを採用し、季調・実質12系列は採用しない。
- WHEN 2005-01〜2005-11を表示する THEN 12MAはnullで、2005-12は連続12月がそろう場合だけ値を持つ。
- WHEN 2017-12/2018-01を表示する THEN 通常/延長の既存境界に従い、系列の切替による欠落・GDP値混入がない。
- WHEN `adv` をoff/onする THEN 既存の通常/延長表示範囲と状態遷移を維持し、延長値は公式月次値から得る。
- WHEN 2025年12か月の12MA基準が有効 THEN `I_t=100*M_t/B` を表示し、`x_t` 原数値は別の公式値として保持する。個々の `M` が0でも、12個が有限かつそろい `B>0` なら表示する。
- WHEN 12個の `M` に欠損・非有限値がある、または `B<=0` である THEN 新CTI比較系列を表示せず、理由を示し、GDPへfallbackしない。
- WHEN CTI入力または基準が利用不能である THEN CTI通常・延長registryの `status`/`reason` を実状態へ反映し、`valid`/`reason: null` 固定の系列や凡例を公開しない。
- WHEN 欠損月・重複月がある THEN 部分窓・0補完・重複統合をせず、検証失敗または対象系列抑止として扱う。
- WHEN グラフ、tooltip、表、CSVを同じ月で見る THEN 系列ラベル、単位、値、null、出典metadataが一致する。
- WHEN NewGraphの表またはCSVを出力する THEN `DataTableSpec.metadata` にCTIの出典、unit、status、reasonが含まれ、グラフ側の系列metadataと一致する。
- WHEN 2020 rollbackを選ぼうとする THEN plan37では選択・表示・fallbackを行わず、2020 rollback専用経路の新規取得・実装・維持を対象外として扱う。2025長期系列・GDP・季調との接続は行わない。
- WHEN 成果物の最新月が2026-07で翌月2026-08が未提供 THEN 2026-07は計算対象、2026-08は行・値を生成せずnull/非表示とし、将来の最新月を実装へ固定しない。
- WHEN `earning-data-integrity.test.ts` の4 skipを監査する THEN Plan37 CTI basicの2件（現行CTIキーのNewGraph投影、2016-12/2017-01連続性）はactive化し、残り4件は `legacy:` 接頭辞付きのGDP/旧CTI/rollback別契約として残す。skip数とテスト名をOpenSpecの分類に記録する。

## 検証計画

### E2E対象境界とLazyMount待機契約

Plan37の月次E2Eは、`page.goto`後に対象section、`.recharts-wrapper`、
`svg.recharts-surface`、および`svg path/line`のcount/visibleをexpectで確認する。
tooltip操作はその後にsurfaceの`boundingBox()`を取得してから実行し、共通fixtureの
`__MOUNT_ALL__`だけを描画完了条件にしない。

月次CTIの表/CSV parityは現行Series Registryのraw/12MA normal/extension契約だけを
対象とする。四半期GDP/CTI projectionの表・CSV契約（projectionが空の環境を含む）は
Plan37の失敗条件から分離し、Plan24の独立legacy契約として
`tests/e2e/plan24-rendering.e2e.spec.ts`および関連unitで検証する。四半期GDPの期待値を
Plan37の月次CTI比較線へ移管したり、空データを本体で補完したりしない。

取得成果物の既知公式原本点と系列identityを照合し、独立実装した12MA・2025再基準値を比較する。少なくとも2005-11、2005-12、2017-12、2018-01、取得済み最新月、翌月境界を確認する。欠損、重複、基準12個の `M` の欠落/非有限、`B<=0`、個別0の許容、通常/延長 `adv` on/off、単位1/100経路を検証する。

グラフ、tooltip、表、CSVの同値性、対象範囲に残る旧GDP名・キー・出典文言の検索を行う。2020 rollback専用経路の維持は完了条件に含めず、plan37で2020 rollbackの選択・表示・fallbackを行わないことだけを確認する。実装完了後にOrchestratorが既存のlint、type-check、build、関連unit/data-quality/e2e、`git diff --check` および必要なsmoke-testを実行し、テスト実装とテスト実行を分離する。

## 不確定事項

実装時に確認すべき事項は、long-term CSVのloader接続方式、既存公開viewの正確なキー/単位契約、通常/延長境界の実コード上の定義、基準不成立時のUI理由表示位置に限る。系列選択、対象世帯、原数値、12MA、2025基準、GDP非fallback方針は本計画で確定する。

## レビューで追加発見した未完了事項（是正前監査）

- `src/lib/chartConstants.ts:410` のCTI通常系列および `:425` のCTI延長系列は、`status: "valid"`、`reason: null`（descriptorを含む）を固定している。CTI利用不能時にグラフ公開契約と凡例が実状態から乖離するため、入力状態をregistryへ接続し、利用不能理由を公開表示へ反映するまで未完了とする。
- `src/app/components/CpiChart.tsx:304` の `section-new-graph` 用 `DataTableSpec` に `metadata` がない。CTIの出典、unit、status、reasonが表・CSVへ渡らないため、CTI系列registry由来のmetadataを指定するまで未完了とする。

上記2件の是正と対応する受入確認が完了するまで、Plan37の完了条件は成立しない（是正前監査時点の判定）。

## 完了判定追補（2026-09-18）

是正前監査で未完了とした2件について、実装および受入確認の完了を追補する。

- registryのdynamic status/reason対応済み。CTI通常・延長registryは入力のtyped descriptorの状態を反映し、artifact不在・基準不成立・invalidを固定validとして公開しない。
- NewGraphのDataTableSpec metadata伝播対応済み。raw/12MA/normal/extensionのCTI metadata（出典、unit、status、reason）を表・CSVへ渡し、グラフ側と契約を一致させた。
- OpenSpec skip分類は **Plan37=0 / legacy=4**。Plan37対象のskipはなく、legacy契約のskip 4件は既存の分類として保持する。
- 最新ゲート結果は、build、type-check、lint、関連Vitest、通常ホストでのE2E、`git diff --check` がすべてPASS。関連Vitestは94 passed / 4 skipped、通常ホストE2Eは125 passed / 19 skipped / 0 failed、Plan37対象E2Eは13/13 passed。
- sandboxのwebServer起動失敗（終了コード1）は、Playwright本体の実行前に発生した環境制約であり、通常ホスト権限で同一コマンドが成功した結果（終了コード0）とは分離して扱う。sandbox失敗をPlan37実装の失敗とは判定しない。
- 以上により、Plan37の実装・受入・仕様同期・監査ゲートは完了し、Plan37の完了判定を **完了** とする。上記「未完了事項（是正前監査）」の記述は履歴であり、現在の完了判定を取り消さない。
