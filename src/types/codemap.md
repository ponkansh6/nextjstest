# nextjstest/src/types/

## Responsibility

サーバーloader/view-model、Client chart、テストが共有する経済データと表示行のTypeScript境界を定義する。

## Design

`data.ts`は`CpiData`、人口、CSV parsed row、GDP raw/normalized/null許容値、`chart.ts`は`CpiView`、`QuarterlyView`、`EarningsView`、tooltip propsを定義し、`index.ts`は主要型を再exportする。データの欠損は型上明示し、loaderの内部検証結果とClient公開viewを同一型として扱わない。

## Flow

CSV/loader → server view-model → `CpiView`/`QuarterlyView`/`EarningsView` → `CpiChart`、charts、tables、test factories。`src/lib`のadapterと`quarterlyPublicProjection`が境界変換を行う。

## Integration

Phase 1は内部hook型を追加しても公開データモデルを変更しない方針で、既存のServer→Client serializable propsと7チャートの型契約を保持する。URL/localStorage状態はこのデータ型に混ぜず、それぞれ`urlState`/hooksで所有する。
