# 消費支出チャートのツールチップに積み上げ合計を表示する

> **[状態]** 本ドキュメントはプランのみ。実装は未着手。

## Context

消費支出（名目）／（実質）は 10 費目＋サポート系列を `stackId="a"` で積み上げた棒グラフ
（`SpendingBarChart.tsx:170-185`）。しかしタップ／ホバー時の `CustomTooltip` は
各系列の内訳を列挙するだけで、**その時点の積み上げ全体がいくつなのかが読めない**。

指数は 2020年平均=100 に基準化されているため、合計値は「2020年比で消費全体がどれだけ
増減したか」を一目で示す最も重要な数字であり、内訳より先に見えるべきである。

さらにモバイルでは `CustomTooltip.tsx:24` で **上位5件までしか表示しない**（残りは「他 N 件」）。
現状のモバイル表示は内訳が半分欠けたまま合計も分からず、情報量が最も乏しい。合計行の追加は
モバイルでこそ効果が大きい。

---

## 決定事項

| 項目               | 決定                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| 対象チャート       | `section-consumption-nominal` / `section-consumption-real` の2つのみ                              |
| 有効化方法         | `CustomTooltip` に `showTotal?: boolean` を追加し、`bind(chartId, { showTotal: true })` で opt-in |
| 表示位置           | 日付ラベル直下・内訳リストの**上**（＝データ表示の一番上）                                        |
| ラベル             | `合計`                                                                                            |
| 合計の定義         | `payload` 全件の値の単純合計（＝**描画中の系列のみ**。凡例で非表示にした系列は含まない）          |
| 書式               | `toFixed(2)`（既存の内訳行と同じ）                                                                |
| モバイル           | 上位5件へ切り詰める**前**の全件から合計を算出する                                                 |
| 区切り             | 合計行の下に 1px の区切り線を入れ、内訳と視覚的に分離する                                         |
| 他チャートへの適用 | 今回は行わない（`StackedAreaChart` は寄与度で合計の意味が異なるため別途判断）                     |

### 「合計」ラベルにした理由

厳密には「表示中の系列の合計」だが、

- 非表示系列は凡例チップが dimmed 表示されるため、状態はチャート上で判別できる
- モバイルのツールチップは幅が限られ、長いラベルは内訳行を圧迫する

ため短いラベルを採る。代わりに ⓘ パネル（`chartInfoContent.ts` の
`consumption-expenditure`）の「データ加工」に1行追記して定義を明示する。

---

## 現状調査で確認した事実

### 単純合計で正しい（二重計上は起きない）

サポート系列 `民間最終消費支出（名目/実質）` は費目内訳と同じ `stackId="a"` に積まれているため
「内訳＋総額を二重に足してしまうのでは」という懸念があるが、
`server/lib/math/supportSeries.ts:34-38` が **2005〜2016年以外のサポート系列を 0 にする**。
一方の費目内訳は CTI ミクロ由来で 2018年以降のみ値を持つ。
つまり両者は時間軸上で排他であり、**`payload` の単純合計がそのまま総額になる**。

（2017年は両方 0 になる継ぎ目の年。合計も 0 と表示される — 後述の「落とし穴」参照）

### 非表示系列は `payload` に入らない

`SpendingBarChart.tsx:171` が `!hiddenKeys.includes(key)` の系列だけを `<Bar>` として描くため、
Recharts の `payload` にも現れない。よって合計側でのフィルタは不要で、
`payload.reduce()` がそのまま「表示中の合計」になる。

### `CustomTooltip` は全チャート共通

`useChartTooltipProps.tsx:83-90` が全チャート分の `<CustomTooltip>` 要素を生成しているため、
コンポーネントを直接書き換えると 7 チャートすべてに合計行が出る。
`bind()` に per-chart オプションを通す経路が必要（下記手順1〜2）。

### データテーブルに合計列は存在しない

`DataTablesSection.tsx` / `csvExport.ts` に合計の概念はない。今回もテーブル側には追加せず、
ツールチップ限定の表示にとどめる（整合性については「未決事項」参照）。

---

## 実装手順

### 1. 型に `showTotal` を追加 — `src/types/chart.ts:1-10`

```ts
export interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  isMobile: boolean;
  isTouch: boolean;
  tooltipBg: string;
  tooltipText: string;
  onDismiss?: () => void;
  /** 積み上げチャート向け: 描画中系列の合計を先頭に表示する */
  showTotal?: boolean;
}
```

### 2. `bind()` に per-chart オプションを通す — `src/app/components/charts/useChartTooltipProps.tsx:74-101`

```ts
export interface ChartTooltipBindOptions {
  showTotal?: boolean;
}

const bind = useCallback(
  (chartId: string, options?: ChartTooltipBindOptions) => {
    // ...
    content: (
      <CustomTooltip
        isMobile={isMobile}
        isTouch={isTouch}
        tooltipBg={chartColors.tooltipBg}
        tooltipText={chartColors.tooltipText}
        onDismiss={dismiss}
        showTotal={options?.showTotal}
      />
    ),
  },
  [chartColors, isMobile, isTouch, suppressed, activeChartId, dismiss],
);
```

戻り値の形（`{ tooltipProps, onClick, activeDot }`）は変えないため、
既存6チャートの `{...chartTooltip.bind(id)}` は無改修で動く。

### 3. 合計行を描画 — `src/app/components/CustomTooltip.tsx`

`displayPayload` を作る**前**に、元の `payload` から合計を出す（切り詰めの影響を受けさせない）:

```tsx
const total = showTotal
  ? payload.reduce((acc, e) => acc + (typeof e.value === "number" ? e.value : 0), 0)
  : null;
```

ラベル行（`:55-113` の flex コンテナ）と内訳リスト（`:114`）の間に挿入:

```tsx
{
  total !== null && (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "12px",
        fontSize: fontSize,
        fontWeight: "bold",
        color: tooltipText,
        padding: "2px 0 6px",
        marginBottom: "6px",
        borderBottom: "1px solid currentColor",
      }}
    >
      <span>合計</span>
      <span>{total.toFixed(2)}</span>
    </div>
  );
}
```

区切り線は `currentColor`（= `tooltipText`）を使い、ライト／ダーク双方で自動的に追従させる。
線が強すぎる場合は親 `div` 側で `opacity` を落とすのではなく、
区切り線用の内側 `span` に `opacity: 0.25` を当てて数値の可読性を保つ。

### 4. 2つの消費チャートで opt-in — `src/app/components/CpiChart.tsx:617, 647`

```tsx
{...chartTooltip.bind("section-consumption-nominal", { showTotal: true })}
{...chartTooltip.bind("section-consumption-real", { showTotal: true })}
```

### 5. ⓘ パネルに定義を追記 — `src/lib/chartInfoContent.ts:91-107`

`consumption-expenditure` の「データ加工」セクションに1項目追加:

```
{ text: "ツールチップの「合計」は、その時点で表示中（凡例で非表示にしていない）の系列の合計値" },
```

---

## 落とし穴

1. **モバイルの上位5件切り詰め**（`CustomTooltip.tsx:24`）
   `topPayload` から合計すると、モバイルだけ合計が小さく出る典型バグ。
   必ず `payload`（元配列）から算出する。テストで固定する。

2. **`payload` の要素が `value: undefined` を持ちうる**
   Recharts は欠損セルに対して `value` を持たない payload エントリを渡すことがある。
   `typeof e.value === "number"` のガードを必ず入れる（既存の内訳行と同じ扱い）。

3. **2017年は合計 0 になる**
   サポート系列も費目内訳も 0 の継ぎ目の年。「バグに見える 0」だが実際にデータがない年であり、
   棒自体も描かれていない。合計行を非表示にする分岐は入れない（`0.00` と正直に出す）。
   E2E では 2017 をタップ対象に選ばないこと。

4. **`React.memo` の再レンダリング**
   `CustomTooltip` は `React.memo`（`:6`）。`showTotal` は真偽値なので比較は問題ないが、
   `bind()` の第2引数にオブジェクトリテラルを渡すため `content` の要素は毎レンダー新しくなる。
   これは変更前から同じ（`content` は元々毎回新規生成）で、退行ではない。

5. **既存テストの payload 形状**
   `tests/components/CustomTooltip.test.tsx:5` の `payload` は1件。合計テストは複数件＋
   `isMobile` で6件以上のケースを新規に足す。

---

## テスト

### ユニット（`tests/components/CustomTooltip.test.tsx` に追加）

| ケース | 期待                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------- |
| T1     | `showTotal` 未指定 → 「合計」が描画されない（既存6チャートの非退行）                                 |
| T2     | `showTotal` かつ3系列 → 「合計」と各値の総和が `toFixed(2)` で描画される                             |
| T3     | `showTotal` + `isMobile` + 7系列 → 合計は**7件全部**の総和（上位5件の和ではない）／「他 2 件」も併存 |
| T4     | `value` が数値でないエントリを含む → 例外なく数値分のみ合計される                                    |

### ユニット（`tests/components/useChartTooltipController.test.tsx` に追加）

| ケース | 期待                                                                           |
| ------ | ------------------------------------------------------------------------------ |
| T5     | `bind("x", { showTotal: true }).tooltipProps.content.props.showTotal === true` |
| T6     | `bind("x").tooltipProps.content.props.showTotal` が falsy                      |

### E2E（`tests/e2e/` に追加、または `spending-filter.e2e.spec.ts` を拡張）

| ケース | 期待                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| T7     | 消費支出（名目）の 2022 以降の棒をタップ → ツールチップ先頭に「合計」が出る  |
| T8     | 凡例で「食料」を非表示 → 同じ点の合計値が食料の分だけ減る                    |
| T9     | 物価指数 費目別寄与度（`section-stacked`）のツールチップには「合計」が出ない |

---

## 仕様書更新（`openspec/specs/nextjstest/spec.md`）

- **Component Tree**（`:399-409` 付近）: `CustomTooltip` の説明に `showTotal` opt-in を追記
- **Requirements**: R15 の隣に新要件を追加
  - **WHEN** ユーザーが消費支出（名目/実質）チャートの任意の点をタップ／ホバーする
    **THEN** ツールチップの最上部（日付ラベル直下）に、その時点で積み上げられている
    描画中系列の合計が `合計` として表示される
  - **WHEN** 凡例で系列を非表示にした状態で同じ点を開く
    **THEN** 合計は非表示系列を除いた値になる
  - **WHEN** モバイル幅で内訳が上位5件に切り詰められる
    **THEN** 合計は切り詰め前の全系列から算出される
  - **WHEN** 消費支出以外のチャート（物価指数費目別寄与度・3種比較など）を開く
    **THEN** 合計行は表示されない

---

## 検証

```
pnpm type-check && pnpm lint && pnpm test && pnpm test:e2e && pnpm build
```

`pnpm dev` で目視確認:

- 消費支出（名目）2024Q1 の合計が、内訳10費目の手計算合計と一致すること
- 消費支出（実質）でも同様に出ること（凡例連動側でも欠落しないこと）
- 2010年（サポート系列のみ）の合計＝サポート系列の値であること
- ダークテーマで区切り線が沈まず、かつ強すぎないこと
- 物価指数 費目別寄与度・3種比較・給与内訳には合計行が出ないこと

---

## ロールバック

`git revert` 1コミットで戻せる範囲に収める。データ生成・スケーリングロジックには一切触れず、
表示層（`CustomTooltip` / `useChartTooltipProps` / `CpiChart` の2行）のみの変更。

---

## 未決事項

1. **データテーブル／CSVエクスポートとの整合性**
   ツールチップにだけ合計があり、`DataTablesSection` と CSV には無い状態になる。
   合計列を足すか、ツールチップ限定のままにするか。
   （テーブルは全系列を出すため「表示中の合計」という概念が成立せず、
   足すなら定義を「全系列の合計」に変える必要がある — 別プラン推奨）

2. **`StackedAreaChart`（物価指数 費目別寄与度）への展開**
   同じ opt-in 機構で足せるが、あちらは寄与度であり合計＝総合指数と一致するとは限らない。
   一致するかを実データで検証してから判断する。

3. **合計と前期比の併記**
   「合計 102.31（前期比 +0.4%）」まで出すと有用性は上がるが、
   ツールチップの `payload` には前の点の値が無いため、チャート側からデータを渡す設計変更が要る。
   今回は対象外とし、要望が出た時点で再検討する。
