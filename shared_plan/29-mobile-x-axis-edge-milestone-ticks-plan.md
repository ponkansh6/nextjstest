# モバイルX軸の端点・マイルストーン表示改善プラン

作成日: 2026-09-13
状態: 実装中

## 目的

モバイルの時系列X軸で、開始・終了ラベルを必ず表示し、データに存在する
`2005年1月`、`2010年1月`、`2015年1月`、`2020年1月`、`2025年1月`も、
両端ラベルと実際の描画領域で重ならない場合は表示する。デスクトップの表示規則は維持する。

## 根拠と対象

- `src/app/components/charts/TimeSeriesXAxis.tsx` は `ResponsiveContainer` 内の Recharts
  `<XAxis dataKey="年月" ticks={...} interval={0}>` を使い、`dy={10}` で
  `XAxisEdgeTick` を描画している。現在は viewport 幅に応じて `maxTicks=4/5` を渡している。
- `src/app/components/charts/xAxisTicks.ts` は開始・終了を追加した後、
  `EDGE_GAP_MONTHS=36` でマイルストーンを月数だけで除外し、さらに `maxTicks` で内部候補を
  間引く。これはチャートの実幅・ラベル幅を見ていないため、要件の判定根拠にならない。
- 対象は `TimeSeriesXAxis` を利用する `MajorIndicesChart`、`ResidualAreaChart`、`NewGraph` のみとし、
  `SpendingBarChart` / `StackedAreaChart` / `EarningsBreakdownChart` など独自 `XAxis` は対象外にする。
- `src/app/components/charts/XAxisEdgeTick.tsx` は `YYYY年M月` を `YYYY/M` に短縮し、
  `textAnchor="middle"`、端点だけ `emphasisFill`、他を `fill` で描画する。フォントは既存の
  SVG/CSS設定を継承するため、既存の表示書式・色・`dy` を使う。
- `src/lib/chartConstants.ts` の `MILESTONE_YEARS` は `[2010, 2015, 2020, 2025]`、
  開始年の基準は `MIN_DISPLAY_YEAR=2005` である。2005はデータ開始端点なら端点として扱い、
  内部候補としても対象年リストに含める。
- OpenSpec `openspec/specs/nextjstest/spec.md` の R2b は共有X軸と端点色を規定している。
  現在の固定4/5tick・境界tick抑止の記述は、この変更後の仕様へ同期する。

## 最小実装案

1. `computeXAxisTicks` はモバイルでも `EDGE_GAP_MONTHS` と `maxTicks` による候補削除を行わず、
   データ中の開始値・終了値・対象1月（2005/2010/2015/2020/2025）を順序保持して重複排除する。
   既存の `includeBoundaryTicks` はデスクトップ互換のため残し、デスクトップの挙動は変更しない。
2. `TimeSeriesXAxis` はモバイル時に `maxTicks` を渡さず、候補を全て `<XAxis>` に渡す。カテゴリ軸の
   tick座標は Recharts がデータ配列のインデックスから算出するため、別の座標計算・新依存は追加しない。
3. `XAxisEdgeTick` で Recharts 公開 hook `usePlotArea()`（`node_modules/recharts/types/hooks.d.ts`）を使い、
   `plotArea.x` と `plotArea.width` を取得して端点座標と描画領域を確定する。Recharts実装の
   `CartesianAxis.js` は全 `finalTicks.map(...)` を描画し、各カスタムtickへ個別の `coordinate` と
   `visibleTicksCount` を渡すため、全tick列をtickコンポーネント内で共有する必要はない。`XAxis` の既定
   padding（型定義・既存設定を確認し、現状の未指定なら左右0）を含む座標系として、各tickの coordinate と
   `plotArea.x/width` から端点矩形を計算する。ラベル幅は `YYYY/M` と既存CSS
   `.recharts-cartesian-axis-tick-value` の `font-size: clamp(12px, 0.6vw + 9px, 24px)` に合わせ、
   推定計算とSVG描画のfontSizeを一致させる。DOM計測・新依存は導入しない。
   端点は常に表示し、既存の `textAnchor="middle"` は変更しない。内部マイルストーンは、推定矩形が開始・終了の矩形と交差する場合だけ非表示にする。
4. 内部候補同士の交差はこの要件の端点判定とは分けて扱う。狭い幅で対象1月同士が交差する場合に、
   `maxTicks` で年を機械的に間引かず、対象ラベル同士の同時表示が成立しない幅を受入条件の制約として
   明記する。必要なら後続プランで内部候補の優先順位を決める。
5. `XAxisEdgeTick` が端点判定に使うインデックスは、Rechartsから渡される全tick列に対して解釈し、
   `visibleTicksCount` に依存して端点位置を誤認しないようにする。デスクトップでは現行の中央寄せ・色を保つ。

## 受入条件（WHEN / THEN）

- WHEN モバイルで時系列データを表示する THEN 開始tickと終了tickは必ずDOM/SVGに存在し、端点ラベルは
  プロット枠内に収まり、互いに重ならない（2点データ以上で、端点ラベル幅を収める必要最小幅を満たす場合）。
- WHEN データが1点だけの場合 THEN 同一の開始/終了ラベルを1個だけ表示し、重複描画しない。
- WHEN 対象1月がデータに存在し、端点ラベルとの推定矩形が交差しない THEN その対象1月tickを表示する。
- WHEN 対象1月の推定矩形が端点と交差する THEN その対象1月だけを非表示にし、端点tickは残す。
- WHEN データに対象1月が存在しない THEN 存在しないtickを生成しない。
- WHEN デスクトップで表示する THEN `EDGE_GAP_MONTHS`・境界tick・既存の端点色/中央寄せを含む現行挙動を維持する。
- WHEN モバイルの描画幅が対象1月同士の同時表示に足りない THEN 実装は端点条件を優先し、内部候補の扱いを
  仕様上の制約として記録し、根拠なく年を `maxTicks` で削除しない。

## テスト計画

- `tests/unit/x-axis-ticks.test.ts` を更新し、候補生成が端点と全対象1月を返すこと、重複値を返さないこと、
  デスクトップの境界tick互換を検証する。
- `XAxisEdgeTick` のコンポーネントテストを追加または既存テストへ追記し、既存の中央寄せを維持したうえで、
  端点重複時の対象tick非表示、非重複時の表示を検証する。
- モバイル相当の狭幅E2EでSVGの表示ラベル、端点の枠内、端点との矩形交差なしを確認する。
  実フォント差による推定幅の限界を確認するため、代表幅（320/375/390px）で実画面監査を行う。
- `pnpm type-check`、対象テスト、関連X軸E2Eを実行する。テスト実装と実行は分離する。

## 実装記録（2026-09-13）

- `computeXAxisTicks` に `preserveAllMilestones` を追加し、モバイルでは固定 `maxTicks` と月数ベースの候補削除を行わないようにした。
- `TimeSeriesXAxis` はモバイル（768px以下）で全候補をX軸へ渡し、境界tickだけは除外する。
- 内部の表示候補はキリ番（2010/1・2015/1・2020/1・2025/1）に限定し、2017/12・2018/1などの非キリ番境界ラベルはデスクトップを含めて除外する。
- `XAxisEdgeTick` は Recharts の `usePlotArea()` とtick座標を使い、端点と交差する内部tickだけを非表示にする。
- 端点の `textAnchor="middle"` は変更していない。
- `tests/unit/x-axis-ticks.test.ts` にモバイル候補保持のテストを追加し、既存中央寄せを壊さない構成を維持した。
- 320/375/390pxの実画面監査を実施し、端点近傍候補のみが非表示となることを確認した。
- `pnpm type-check`: PASS。
- 対象lint: PASS（テストファイルは既存設定でignore warning）。
- 対象unit/component test: PASS（40 files / 347 tests）。
- Rechartsのtick `x` が `string | number` であることに合わせて型を修正し、既存の他チャートも含む型検査を通過させた。
- 端点の `text-anchor="middle"` は変更していない。キリ番以外の内部ラベル除外後の最終監査は未実施。

## 仕様同期予定

実装と同じ変更で `openspec/specs/nextjstest/spec.md` の R2b を更新し、固定4/5tickおよび
`EDGE_GAP_MONTHS` によるモバイル除外の記述を、端点必須・実幅判定・対象1月候補保持の WHEN/THEN
シナリオへ置き換える。`Data Flow` / `Component Tree` に変更があれば共有X軸の判定責務も同期する。
