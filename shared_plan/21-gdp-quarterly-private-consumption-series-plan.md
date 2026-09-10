# GDP民間最終消費支出・四半期系列化計画

## 調査状況（2026-09-10）

判定: **完了（e-Stat独立照合、ready係数、実データ表示経路、E2Eスモークを同期）**

### 現状監査（2026-09-10、Plan22反映）

名目・実質の四半期CSV/metadata/e-Stat snapshotはe-Statと内閣府CSVを84期照合済みで、2025Q1〜Q4の名目・実質係数は内部で保持する。公開projectionではGDP raw/comparison 4キーを除外し、既存の民間最終消費支出（名目・実質）各1系列のみをchart/table/CSVへ渡す。`page.tsx` は `granularity`、`comparisonReady`、`independentConfirmation` をchart infoへ渡す。E2E/build自体はこの整理では実行していない。

残件はなく、既定の四半期経路はready時に有効である。年次系列への無言fallbackは行わず、取得失敗時はfail closedとする。

- 年次GDP系列は従来経路として保持し、ロールバック時に明示的に選択できる。通常のready経路では四半期原系列を使用し、年次値を四半期へ反復しない。
- e-Stat独立照合は名目 `0003113633`・実質 `0003113612` とも84期一致でready。比較系列はready時のみ表示し、pending/failed時は無効化する。
- 主系列は名目・実質とも原系列とする。季節調整系列は今回の主表示に採用しない。
- 内閣府公表CSV、e-Stat snapshot、出典・取得日・改定状態をmetadataへ記録した。

## 目的とPlan 20との関係

Plan 20で整備したGDPのraw値／2025年平均=100の比較指数という分離、名目・実質の独立検証、fail closed、info表示を維持する。本計画は、年次raw系列を四半期公式系列へ置き換え、四半期の実際の変動を比較表示へ反映する追加計画である。Plan 20の年次系列を無言で上書きせず、移行完了まで旧データをロールバック可能な状態に保つ。

GDPは固定基準年を持つ指数ではない。名目はcurrent prices、実質は公式のprevious-year chain-linked系列として扱い、2025年への変更は表示正規化年（2025年のQ1〜Q4平均=100）のみとする。

## 取得・系列確定

- e-Stat metadata APIで候補IDの表題、系列コード、系列名称、名目/実質、原系列、単位、期間、更新日を取得する。
- APIの実データ取得結果を保存し、候補IDが実際に民間最終消費支出の名目・実質原系列を指すことを確認してから採用する。候補IDや系列コードを名称だけで決め打ちしない。
- 必須表示期間を2005Q1以降とし、その期間について欠測・重複・順序逆転がないこと、四半期キーが`YYYY-Qn`として連続することを確認する。公式系列が2005Q1まで遡れない候補は採用せず、取得不能としてfail closedする。期間を偽装したり、別系列・年次値で補完したりしない。
- 内閣府の四半期GDP速報CSVを独立に取得し、e-Stat値と系列定義、単位、代表四半期、全期間の差分を照合する。速報改定による差は改定日・取得日とともにmetadataへ記録し、機械的な一致を要求する場合の許容条件を明記する。

一次資料:

- [e-Stat 政府統計の総合窓口](https://www.e-stat.go.jp/)
- [e-Stat 四半期別GDP速報（候補表ID 0003113633）](https://www.e-stat.go.jp/stat-search/database?layout=dataset&statdisp_id=0003113633)
- [e-Stat 四半期別GDP速報（候補表ID 0003109766）](https://www.e-stat.go.jp/stat-search/database?layout=dataset&statdisp_id=0003109766)
- [内閣府 GDP統計](https://www.esri.cao.go.jp/jp/sna/menu.html)

## 成果物（既存上書き禁止）

- `data/source/cti_support_nominal_quarterly2025.csv`
- `data/source/cti_support_real_quarterly2025.csv`
- 対応する`*.metadata.json`（statInfId、系列コード、名称、unit、frequency、seasonalAdjustment、priceMeasure、revisionDate、sourceURL、取得日時、SHA-256、照合結果）
- `data/source/cti_support_nominal_quarterly2025.official.csv`
- `data/source/cti_support_real_quarterly2025.official.csv`（内閣府独立照合スナップショット）
- 四半期raw値と比較指数を分けた正規化metadata。既存の年次CSV、2020/2025年次成果物は上書きしない。

## 正規化・データ契約

- 名目・実質それぞれで、2025Q1〜Q4の4値が有限かつ揃っている場合のみ平均を計算する。
- `factor = 100 / mean(value[2025Q1..2025Q4])`、`normalizedValue = rawValue * factor`とする。名目と実質で係数を共有しない。
- 2025年の4期が不足、重複、無効、ゼロ、または公式照合に失敗した場合は比較指数を生成しない。年次値、直近値、2020係数への無言fallbackは禁止する。
- raw四半期金額と比較指数を別フィールド・別CSV・別表示系列として保持する。raw値から年次値を再構成する場合、四半期合計による年次再構成は名目フローの検算に限定する。実質連鎖系列は非加法性を尊重し、四半期値の単純合計による公式年次値一致を要求しない。実質値の年次比較は公式年次系列または公式定義に従う検算結果として扱い、集計規則をmetadataとテストで固定する。
- quarter→月次変換が必要な画面では、四半期値の各月への関連付け規則を明示し、月次値を係数計算や四半期集計の入力に逆利用しない。

## 実装範囲

- ローダーに四半期CSV、metadata、公式snapshotの独立検証を追加する。
- 四半期を第一級のデータ粒度としてview-modelへ渡し、既存の年次反復経路を無言で使わない。
- UI、凡例、ツールチップ、データテーブル、CSV出力に「四半期」「名目/実質」「原系列」「比較指数（2025年平均=100）」を明示する。
- 取得失敗、系列未確定、2005Q1以降の連続性不足、2025年4期不足、公式照合不一致をinfoへ表示する。年次系列へ無言fallbackしない。
- `openspec/specs/nextjstest/spec.md`のData Sources、Data Flow、Requirements、WHEN/THENシナリオを実装と同期する。

## テスト計画

- metadata API候補IDから正式系列コードを確定できること。
- e-Stat値と内閣府snapshotの代表値・期間・単位・改定情報を照合できること。
- 必須期間2005Q1以降の四半期連続性、重複なし、正しい`YYYY-Qn`順序を検証し、そこまで遡れない候補をfail closedすること。
- 2025Q1〜Q4平均から名目・実質別の係数と100基準値を検証すること。
- 4期不足、欠損、ゼロ、照合失敗時に比較指数が無効となり、年次値へfallbackしないこと。
- quarter→月次変換と月次→四半期集計の契約、raw/normalized分離、UI/info文言を検証すること。
- 既存年次系列のロールバック経路を別テストで保持し、テストの`skip`で未実装を隠さないこと。

## 段階的実装順

1. [完了] metadata APIと実取得で名目 `0003113633`・実質 `0003113612` の系列コード、定義、単位、提供期間を確定し、取得結果を保存した。
2. [完了] e-Stat raw snapshotと内閣府official snapshotを保存し、代表値・全84期・単位・改定情報を照合した。
3. [完了] 2025Q1〜Q4の実値から名目・実質別の正規化係数を生成し、readyとして有効化した。
4. [完了] 四半期raw値・比較指数をview-model、page、chart、table、CSV出力へ注入し、年次反復経路を既定経路から除去した。
5. [完了] `page.tsx` が `getQuarterlyGdpSupportStatus()` を取得し、chart infoへ `granularity`、`comparisonReady`、`independentConfirmation` を渡す。pending時は比較線を表示しない。
6. [完了] e-Stat独立照合、official snapshotの独立性、比較係数の本番有効化、四半期raw/comparisonのchart/table/CSV描画、年次値の四半期反復経路除去、実データのUI/E2Eスモーク、既存年次ロールバック経路を完了した。型検査・lint・E2E/buildはこの作業では実行していない。

## ロールバック

四半期CSV・metadata・official snapshotを削除せず、データセット選択フラグで旧Plan 20の年次経路へ戻せるようにする。ただし四半期取得失敗時に利用者へ知らせず年次へ切り替えることは禁止し、ロールバック状態をinfoに明示する。

## 受入条件

- e-Stat metadata APIと実取得で正式な名目・実質原系列が確定し、一次資料への来歴がmetadataに残る。
- 2005Q1以降（公式提供範囲内）の四半期値が連続し、内閣府CSVとの独立照合結果が記録されている。
- 既存CSVを上書きせず、rawと比較指数が分離されている。
- 名目・実質それぞれで2025Q1〜Q4平均=100が再現できる。
- 4期不足・欠損・照合失敗時はfail closedし、年次反復値へ無言fallbackしない。
- UI/infoが系列粒度、価格概念、原系列/季調、正規化状態、改定状態を正しく表示する。
- openspec、テスト、ロールバック手順が実装と一致する。E2E/buildの検証ゲートは未実行であることを記録する。

## Plan23による最新状態（2026-09-10）

- 四半期raw/comparison artifactsと独立確認は維持する。独立性は保存済みmetadataに記録された出典・取得日時・改定情報・照合結果の範囲で確認できるものであり、保存metadataだけでは外部公表値との再照合や将来時点の独立性まで保証しない。
- 公開projectionはGDP内部4系列（名目/実質のraw・comparison）を除外し、既存の「民間最終消費支出（名目）」と「民間最終消費支出（実質）」の2系列のみを公開する。
- Plan23でpage結合を修正し、四半期内部データと公開projectionの境界を同期した。
- 実行済み検証は、`pnpm test`（37 files / 309 tests）、type-check、build、quarterly-gdp Playwright E2E（1 passed）である。
- 外部公表値との再照合はPlan23の対象外であり、完了扱いにしない。
