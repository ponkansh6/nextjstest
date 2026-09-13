# CPI・給与物価差・3種比較のX軸共通化プラン

作成日: 2026-09-13
更新日: 2026-09-13
状態: 完了

## 目的

CPI主要、給与物価差、3種比較で重複しているX軸の設定とモバイル表示ルールを一つに集約する。375px前後でもラベルが重ならず、各チャートが同じ時系列軸の方針で表示される状態を完成させる。

## 実装方針

- `TimeSeriesXAxis` を `src/app/components/charts/` に追加する。
- `dataKey`、tick生成、`XAxisEdgeTick`、軸線、tick線、`dy`、`interval` を共通コンポーネントで管理する。
- tick生成は既存の開始年・終了年・マイルストーン年・系列境界の方針を保持する。
- モバイルでは表示tick数を制限し、隣接ラベルの重なりを防止する。
- 3種比較固有の2017/12・2018/1境界はオプションとして扱い、モバイルでは通常の年ラベルを優先する。
- チャート固有の `YAxis`、`AreaChart`/`LineChart`、系列、Tooltip、margin は各チャートに残す。

## 完了条件

- [x] 共通X軸コンポーネントを追加する
- [x] CPI主要・給与物価差・3種比較を共通X軸コンポーネントへ移行する
- [x] 375px幅で3チャートのX軸ラベルが隣接して重ならない（最大5tick）
- [x] PC幅の開始年・終了年・マイルストーン年表示を維持する（既存tick計算を保持）
- [x] 3種比較の系列境界表示を既存の縦線で維持し、近接する境界ラベルは全幅で過密表示を避ける
- [x] X軸tick計算の単体テストを追加・更新する
- [x] 仕様書のData Flow / Component Tree / Requirementsを実装と同期する
- [x] lint、type-check、単体テスト、関連E2E、モバイル実画面キャプチャ監査を実行する
- [x] 監査で検出した差異を修正し、再監査で合格する

## 検証記録

### 実装監査（2026-09-13）

- `TimeSeriesXAxis.tsx` を追加し、CPI主要・給与物価差・3種比較のX軸 JSX 重複を除去した。
- 既存の開始/終了年・マイルストーン年・境界tick方針を維持し、`includeBoundaryTicks` と `maxTicks` をオプション化した。
- 境界tickを除外し、351〜390pxでは最大5tick、320〜350pxでは最大4tickへ制限した。375pxでは2015/1を含む開始年・マイルストーン年・終了年が重ならず、320pxでは4tickで過密表示を解消した。
- `pnpm type-check`: PASS。
- 対象lint（5コンポーネント＋共通X軸）: PASS。
- `pnpm test -- tests/components tests/lib`: PASS（39 files / 344 tests）。
- この時点で残っていた要件（tick分岐テスト、OpenSpec同期、PC幅/境界tickのE2E再監査）は、以下の最終監査で完了した。

### 修正・最終監査（2026-09-13）

- tick間引きの重複選択バグを修正し、内部tickを均等に選択する実装へ変更した。
- `tests/unit/x-axis-ticks.test.ts` を追加し、デスクトップの境界tick保持とモバイル4tick制限を検証した。
- `pnpm type-check`: PASS。
- `pnpm lint --no-cache`: PASS（既存warning 5件、error 0件）。
- `pnpm test`: PASS（40 files / 346 tests）。
- `pnpm build`: PASS。
- `pnpm test:e2e --project=chromium tests/e2e/advanced-series.e2e.spec.ts`: PASS（2 tests）。
- 375px実画面キャプチャ再監査: CPI主要、給与物価差、3種比較の各tickが `2005/1`・`2010/1`・`2015/1`・`2020/1`・終了月の5点に統一され、従来のラベル重なりを解消した。
- 完了判定: 全チェックボックス達成。未解決の実装差異なし。

### 幅違い監査・修正（2026-09-13）

- 320/375/390pxでは5tick表示が成立していたが、430/768pxで2017/12・2018/1の境界ラベルが重なることを検出した。
- 境界は `YearReferenceLines` の縦線で確認できるため、`TimeSeriesXAxis` では境界ラベルを全幅で抑止した。
- 320/375/390/430/768pxを再確認し、全チャートで隣接ラベルの重なりがないことを確認した。
