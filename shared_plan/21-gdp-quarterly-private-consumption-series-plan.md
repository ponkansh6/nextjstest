# GDP民間最終消費支出・四半期系列化計画

## 調査状況（2026-09-10）

判定: **部分実装（四半期成果物・検証骨格まで。実運用経路と独立照合は未完）**

### 現状監査（2026-09-10）

完了しているのは、名目・実質の四半期CSV/metadata/official snapshotファイル、2005Q1〜2025Q4の84期、基本ハッシュ・連続性・非反復検証、検証関数の骨格、および `page.tsx` から `getQuarterlyGdpSupportStatus()` を取得してchart infoへ `granularity`、`comparisonReady`、`independentConfirmation` を渡す状態伝播である。`pending-independent-confirmation` 時は比較線を表示しない。関連テスト37件は成功したが、これはpending時のfail-closedを確認するテストを含むため、2025年四半期系列が本番表示経路へ接続されたことの証明ではない。

未完了事項は以下のとおり。

- e-Statの独立照合がpending（候補表IDは名目 `0003113633`、実質 `0003113612`）
- official snapshotが内閣府CSVの複製であり、e-Statとの独立比較資料になっていない
- 2025Q1〜Q4の正規化係数が `null`
- page/UI/chartが年次値の四半期反復経路を使用し、四半期raw値・比較指数が注入されていない
- 年次系列への無言fallback排除が未達
- 実データを使ったUI/E2E検証が不足

なお、e-Stat独立照合、official snapshotの独立性、比較係数の本番有効化、四半期raw/comparisonデータをチャート・table・CSVへ実際に描画する経路、年次値の四半期反復経路の除去、UI/E2Eスモークは未完了である。

したがって、現時点で既定経路を2025年四半期系列へ切り替えてはならない。

- 現行の名目・実質GDPは年次値を保持し、同じ年の月次値および四半期値へ反復している。年次値を単純に4分割しているわけではないが、Q1〜Q4は同値となり、四半期変動を表さない。
- e-Stat独立照合は未取得のため、比較系列は `pending-independent-confirmation` として無効化している。
- 主系列は名目・実質とも原系列とする。季節調整系列は今回の主表示には採用せず、前期比など別用途での採用可否を別途判断する。
- 内閣府公表CSVを基準値およびofficial snapshotとして保存し、出典・取得日・改定状態をmetadataへ記録した。

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

1. [未完] metadata APIと実取得で名目 `0003113633`・実質 `0003113612` の系列コード、定義、単位、提供期間を確定し、取得結果を保存する。
2. [未完] e-Stat raw CSVと、内閣府とは独立したofficial snapshotを新規保存し、代表値・全期間・単位・改定情報を照合する。
3. [未完] 2025Q1〜Q4の実値から名目・実質別の正規化係数を生成し、`null` のまま比較指数を有効化しない。
4. [未完] 四半期raw値・比較指数をview-model、page、chart、table、CSV出力へ注入し、年次反復経路を既定経路から除去する。
5. [完了] `page.tsx` が `getQuarterlyGdpSupportStatus()` を取得し、chart infoへ `granularity`、`comparisonReady`、`independentConfirmation` を渡す。pending時は比較線を表示しない。
6. [未完] e-Stat独立照合、official snapshotの独立性、比較係数の本番有効化、四半期raw/comparisonのchart/table/CSV描画、年次値の四半期反復経路除去、実データのUI/E2Eスモーク、既存年次ロールバック、型検査、lintを完了し、全受入条件を確認してから既定経路へ切り替える。

## ロールバック

四半期CSV・metadata・official snapshotを削除せず、データセット選択フラグで旧Plan 20の年次経路へ戻せるようにする。ただし四半期取得失敗時に利用者へ知らせず年次へ切り替えることは禁止し、ロールバック状態をinfoに明示する。

## 受入条件

- e-Stat metadata APIと実取得で正式な名目・実質原系列が確定し、一次資料への来歴がmetadataに残る。
- 2005Q1以降（公式提供範囲内）の四半期値が連続し、内閣府CSVとの独立照合結果が記録されている。
- 既存CSVを上書きせず、rawと比較指数が分離されている。
- 名目・実質それぞれで2025Q1〜Q4平均=100が再現できる。
- 4期不足・欠損・照合失敗時はfail closedし、年次反復値へ無言fallbackしない。
- UI/infoが系列粒度、価格概念、原系列/季調、正規化状態、改定状態を正しく表示する。
- openspec、テスト、ロールバック手順が実装と一致し、全検証ゲートを通過する。
