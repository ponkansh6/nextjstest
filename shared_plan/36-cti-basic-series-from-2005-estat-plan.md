# Plan36: 2005年以降CTI基本系列の公式取得（完了）

## 目的と完了状態

e-Statのcurrent 2025年基準「CTIミクロ基本系列」を、二人以上世帯について公式原表から長期保存可能なraw/normalized成果物へ固定した。取得・検証・監査は2026-09-18に完了し、plan36は未確定計画ではなく完了済みの専用取得成果物である。

## 公式選定根拠と現行識別子

- 正式対象: e-Stat current 2025年基準 CTIミクロ基本系列、二人以上世帯
- 原数値: `statInfId=000040499070`
- 季節調整値: `statInfId=000040499082`
- 形式: 公式 `fileKind=0` のXLSX（各variantの公式URLはmetadataに記録）
- 選定根拠: 公式メタデータ・表題・対象世帯・基準年・値種別・系列構成を確認し、原数値と季節調整値を別variantとして採用した。季節調整表には公式系列コード行がないため、コードを推測・生成していない。

## 期間・件数

- raw公式XLSX source range: 2002-01〜2026-07
- normalized adopted range: 2005-01〜2026-07
- 2 variant（原数値、季節調整値）
- 各variant: 22系列 × 259月 = 5698 rows
- `-` は欠損、numeric 0は有効なゼロとして区別。補間・丸め・異基準接続は未実施。

## 成果物

成果物ディレクトリは `data/source/official-cti-2025-long-term/`。

- raw公式XLSX: 2
- normalized CSV: 2（columns: `variant,series_index,official_series_code,series_name,month,raw_value,is_missing`）
- metadata: 2
- `manifest`
- `series-map`: 44 rows
- `representative-snapshot`: 132 rows
- 全成果物のSHA-256とmanifest相互参照: 検証済み

## 検証・安全性

metadataでは対象variant、statInfId、fileKind、基準年、対象世帯、値種別、表題、source range、normalized range、系列数、月数、成果物参照を記録し、validatorでは対象sheet/title/header、schema、系列identity、period、duplicate、continuity、series-map/snapshot整合性を検証した。HTML/404/empty/unknown応答はfail closedとした。`-` は欠損、numeric 0は有効なゼロとして区別し、補間・丸め・異基準接続はしていない。取得はretry/timeout対応、appIdはserver-onlyで値をログ・成果物へ出さない。同一filesystem stagingとatomic publishを使い、失敗時は既存成果物を保持する。

監査ではschema、title、sheet、order、identity、period、duplicate、continuityの各検査を実施し、全てPASSとなった。全9 artifact（raw XLSX 2、normalized CSV 2、metadata 2、manifest、series-map、representative-snapshot）についてSHA-256を検証し、manifestとの相互参照もPASSとなった。series-mapは44行、representative-snapshotは132行で、2 variantそれぞれ22系列×259月=5698行の内容と整合した。専用Vitestは17/17 PASS、既存CTI回帰は35/35 PASS、`pnpm type-check`、`pnpm build`、`git diff --check`、公式fetchもPASSとなった。`pnpm lint`は既存warning 5件のみで、errorなし。認証情報、appId値、環境変数名はログ・成果物に記録していない。

監査コマンドの結果は [36-audit-log-2026-09-18.md](36-audit-log-2026-09-18.md) に、秘密情報を含めず記録した。

## 失敗からの修正履歴

初回はCSV前提で失敗し、XLSX入力へ修正した。旧fileKind/IDの誤認は`fileKind=0`と公式IDへ修正し、横持ち22系列の解釈、タイトルのカナ連結、季節列ずれを順に修正した。さらにEXDEVは同一filesystem stagingへ、`governmentStatisticsCode`不一致は公式値との整合へ修正した。test fixture/type注釈の不備も修正した。対象sheet/title/header判定、XLSX parser、atomic publish経路を整備した後、公式fetchを再実行して成功し、最終検証で期間・件数・ハッシュ・相互参照・全テスト結果を確定した。旧IDや誤ったfileKindの候補は採用していない。

監査時の実行結果（秘密情報なし）は次のとおり。

- `node scripts/fetch-cti-basic-series-2025.mjs`: 公式fetch成功
- `pnpm exec vitest run tests/data-quality/cti-basic-series-2025.test.ts`: 専用Vitest 17/17 PASS
- CTI回帰検証: 既存CTI 35/35 PASS
- `pnpm type-check`: PASS
- `pnpm lint`: PASS（既存warning 5件のみ）
- `pnpm build`: PASS
- `git diff --check`: PASS

取得runnerには公式XLSX取得、XLSX検証、正規化、manifest/SHA-256検証、atomic publishを含む。実行時の認証情報、appId値、環境変数名は記録していない。

## 未接続範囲

plan36は長期取得成果物に限定し、既存loader、API、UI、公開データモデル、README、コード、テスト、既存の2025 loader dataへ接続・変更しない。既存の2025候補選択と完全な2020 rollback説明は引き続き既存loader契約として有効であり、plan36成果物の採用を意味しない。

## 監査ログ

監査結果の詳細は [36-audit-log-2026-09-18.md](36-audit-log-2026-09-18.md) に記録している。最終判定はPASSであり、未接続範囲は既存loader/UIである。

## 完了日

2026-09-18
