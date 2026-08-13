# グラフのガイド線（カーソル）が解除されない問題

## Context

タッチ端末でグラフをタップすると、値のツールチップと同時に「その地点を指しているガイド線」
(Recharts の Cursor。`.recharts-tooltip-cursor`) が表示される。しかし**このガイド線を消す手段が
一つも存在しない**。

再現する経路（すべて現行実装で発生）:

| 操作                                      | 期待                     | 実際                               |
| ----------------------------------------- | ------------------------ | ---------------------------------- |
| グラフをタップ → **グラフ外をタップ**     | ガイド線もシートも消える | **両方残る**                       |
| グラフをタップ → **✕ ボタン**             | ガイド線もシートも消える | シートだけ消え、**ガイド線が残る** |
| グラフをタップ → **40px 以上スクロール**  | 同上                     | シートだけ消え、**ガイド線が残る** |
| グラフ A をタップ → **グラフ B をタップ** | A のガイド線が消える     | **A と B の両方にガイド線が残る**  |

`shared_plan/02-recharts-tooltip-mistap-plan.md` で「表示させない」側は潰したが、
**「表示を解除する」側が丸ごと未実装**だった、というのが本件の位置づけ。

---

## 根本原因

### 原因1: `CustomTooltip` が `null` を返してもガイド線は消えない

`node_modules/recharts/lib/component/Tooltip.js:185`:

```js
return React.createElement(React.Fragment, null,
  createPortal(tooltipElement, tooltipPortal),
  finalIsActive && React.createElement(Cursor, { cursor, ... }));
```

**Cursor は `content` の外側で、`<Tooltip>` 自身が描画している**。
`CustomTooltip.tsx:56-58` の `if (isTouch && dismissed) return null;` は
`content` の中身を消すだけなので、`finalIsActive` には一切影響しない。
つまり現行の「閉じる」処理 3 種（✕ ボタン `:122-160`、スクロール `:41-51`、
抑制解除 `:25-39`）は**すべてガイド線を残す**。

### 原因2: Recharts はクリック状態を決してクリアしない

`state/tooltipSlice.js` で `axisInteraction.click.active` に書き込むのは
`setMouseClickAxisIndex`(`:194-201`) の `= true` **のみ**。`false` にするリデューサは存在しない。
`mouseLeaveChart`(`:161-170`) がクリアするのは `axisInteraction.hover.active` だけである。

`combineTooltipInteractionState.js:15-16` により `trigger="click"` は
`axisInteraction.click` しか読まないので、**一度タップしたら Redux 上は永久に active のまま**。
グラフ外タップも、他グラフのタップも、スクロールも、この状態には届かない
（各チャートが独立した Redux store を持つため、グラフ B のタップがグラフ A の状態を消すこともない）。

デスクトップ (`trigger="hover"`) では `mouseLeaveChart` が hover をクリアするため
この問題は起きない。**本件はタッチ端末（`trigger="click"`）固有**である。

### 原因3: 唯一の抜け道である `active` prop を、閉じる用途に使っていない

`Tooltip.js:140`:

```js
var finalIsActive = activeFromProps ?? isActive ?? false;
```

`active={false}` を渡せば Redux 状態に関わらず `finalIsActive=false` になり、
**ツールチップもガイド線も同時に消える**。これが唯一の制御点。
現行 `useChartTooltipProps.tsx:25` はこれをプログラム的スクロール抑制にしか使っておらず
(`active: suppressed ? false : undefined`)、ユーザー操作による解除には使っていない。

---

## 採用する方針: 表示状態を React 側に一元化する

「どのチャートのツールチップを表示中か」を **`activeChartId` という単一の state** で持ち、
`<Tooltip active={...}>` を完全に制御する。

```
active = (isTouch && activeChartId !== chartId) ? false : undefined
```

- 表示中のチャート → `undefined`（Recharts の Redux 状態に委ねる = 従来どおり）
- それ以外のチャート → `false`（**ツールチップとガイド線の両方が消える**）
- デスクトップ (`isTouch=false`) → 常に `undefined`（ホバー挙動を一切変えない）

`activeChartId` を `null` にする操作が「解除」になる:

| 契機                                            | 実装場所                      |
| ----------------------------------------------- | ----------------------------- |
| グラフ外への `pointerdown`                      | document リスナ（新規）       |
| ✕ ボタン                                        | `CustomTooltip` → `onDismiss` |
| 40px 以上のページスクロール                     | hook 内（既存ロジックを移設） |
| プログラム的スクロール開始（`suppressed=true`） | hook 内 effect                |

`activeChartId` を設定する操作は「チャートルートの `onClick`」のみ。

### 副次的に解消される問題

- **他グラフのガイド線が残る問題** — 単一 state なので、B をタップすれば A は自動的に `false` になる。
- **抑制解除後の「後出し」表示**(`02-...-plan.md` の第三者検証で特定されたバグ) —
  抑制中は `handleChartClick` が `activeChartId` を書かないため、解除時に表示すべき状態が
  そもそも存在しない。`prevSuppressedRef` / `prevResetKeyRef` による打ち消し処理
  (`CustomTooltip.tsx:25-39`) は**不要になるので削除する**。
- **`resetKey` (`tapNonce`) の仕組み** — 「✕ 後の同一地点再タップ」は
  `activeChartId: null → id` の遷移が自然に担うため、**丸ごと削除できる**。

### 検討したが採用しない案

- **`CustomTooltip` 内でガイド線を消す** — 不可能。Cursor は `content` の外で描画される（原因1）。
- **`cursor={false}` にしてガイド線自体を廃止** — 「どの地点の値か」が読めなくなる UX 後退。
  ガイド線は正しく機能している要素であり、消したいのは「残り続けること」だけ。
- **Recharts の store にクリア用アクションを dispatch** — store は内部実装で公開 API がなく、
  そもそもクリア用リデューサが存在しない（原因2）。
- **`key` を付け替えてチャートを再マウント** — 全系列の再描画コストとレイアウトのちらつきが出る。

---

## 変更内容

### 1. `useChartTooltipProps` を「コントローラ」化する

`src/app/components/charts/useChartTooltipProps.tsx`（既存を書き換え）

現在は props オブジェクトを 1 個返すだけだが、チャートごとに `active` が変わるため
**チャート ID を受け取る形**に変える。

```ts
export const useChartTooltipController = ({ suppressed }: { suppressed: boolean }) => {
  const { isMobile, isTouch, chartColors } = useChartTheme();
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  // ...
  return { bind: (chartId: string) => ({ tooltipProps, onClick }) };
};
```

`bind(chartId)` が返すもの:

| キー                   | 値                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `tooltipProps.cursor`  | 現行と同じ `{ stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 }`            |
| `tooltipProps.trigger` | `isTouch ? "click" : "hover"`（現行維持）                                                      |
| `tooltipProps.active`  | `isTouch ? (activeChartId === chartId ? undefined : false) : (suppressed ? false : undefined)` |
| `tooltipProps.content` | `<CustomTooltip isMobile isTouch tooltipBg tooltipText onDismiss={dismiss} />`                 |
| `onClick`              | `() => { if (!suppressed) setActiveChartId(chartId); }`                                        |

`bind` の結果は `useMemo` で `activeChartId` / `suppressed` / テーマをキーにキャッシュし、
毎レンダーでチャートコンポーネントへ渡る props の同一性を保つ。

**hook 内に置く 3 つの副作用**（いずれも `activeChartId != null` のときだけ購読する）:

1. **グラフ外 `pointerdown`** — `document` の **capture フェーズ**に
   `{ passive: true, capture: true }` で登録。
   `(e.target as Element).closest(".recharts-wrapper") == null` なら `setActiveChartId(null)`。
   - `.recharts-wrapper` を基準にできる根拠: `RechartsWrapper.js:236-241` で
     `setTooltipPortal(node)` に**ラッパー div 自身**を渡しているため、ツールチップ本体
     （モバイルの `position: fixed` ボトムシート含む）も ✕ ボタンも `.recharts-wrapper` の
     DOM 子孫になる。つまり「シートや ✕ をタップしても外側判定にならない」が自動的に成立する。
   - capture を使うのは、`SectionTabs` などの中間ハンドラが `stopPropagation` しても
     確実に届かせるため。
   - あるチャートのラッパー内をタップした場合は何もしない。直後の `click` で
     そのチャートの `onClick` が `activeChartId` を正しく更新する。
2. **スクロール解除** — `CustomTooltip.tsx:41-51` の 40px 閾値ロジックをそのまま移設。
   購読条件を `active && isTouch` から `activeChartId != null && isTouch` に読み替える。
3. **抑制連動** — `useEffect(() => { if (suppressed) setActiveChartId(null); }, [suppressed])`。

### 2. `CustomTooltip` を純粋な表示コンポーネントに戻す

`src/app/components/CustomTooltip.tsx`

表示・非表示の判断が hook 側へ移るので、内部状態と effect を**すべて削除**する。

- 削除: `dismissed` state、`prevKeyRef` / `prevSuppressedRef` / `prevResetKeyRef`、
  `resetKey` の effect(`:13-15`)、label 監視の effect(`:17-23`)、
  抑制解除の effect(`:25-39`)、スクロール解除の effect(`:41-51`)、
  `if (isTouch && dismissed) return null;`(`:56-58`)
- 追加: `onDismiss?: () => void` prop。✕ ボタンの `onClick` / `onTouchEnd` は
  `setDismissed(true)` を `onDismiss?.()` に置き換える。
- **`onTouchEnd` の `preventDefault()` / `stopPropagation()` はそのまま残す**
  (`:129-138`)。React の portal はイベントを React ツリー沿いに伝播させるため、
  ✕ のタップが `RechartsWrapper` の `onClick` まで上がって `activeChartId` を
  再セットしてしまうのを防ぐ役割は変わらない。既存コメントも維持する。

`src/types/chart.ts` — `CustomTooltipProps` から `resetKey` / `suppressed` を削除し、
`onDismiss?: () => void` を追加。

### 3. `CpiChart` から `tapNonce` を削除し、`bind` を配る

`src/app/components/CpiChart.tsx`

- 削除: `const [tapNonce, setTapNonce] = useState(0)`(`:283`)、
  `const handleChartClick = () => setTapNonce((n) => n + 1)`(`:309`)
- 変更: `:305-308` を `const chartTooltip = useChartTooltipController({ suppressed: isProgrammaticScroll })` へ
- 7 箇所の `tooltipProps={tooltipProps} onClick={handleChartClick}` を
  `{...chartTooltip.bind("<chartId>")}` の 1 行に置換する。
  `isProgrammaticScrollRef` と `endProgrammaticScroll` の 150ms テール(`:287-295`)は現状維持。

チャート ID は既存の `sectionId` をそのまま使う（重複がなく、E2E からも参照しやすい）:

| 行     | コンポーネント             | chartId                       |
| ------ | -------------------------- | ----------------------------- |
| `:545` | `MajorIndicesChart`        | `section-cpi-major`           |
| `:561` | `StackedAreaChart`         | `section-stacked`             |
| `:594` | `SpendingBarChart`（名目） | `section-consumption-nominal` |
| `:625` | `SpendingBarChart`（実質） | `section-consumption-real`    |
| `:658` | `EarningsBreakdownChart`   | `section-earnings`            |
| `:671` | `ResidualAreaChart`        | `section-residual`            |
| `:681` | `NewGraph`                 | `section-new-graph`           |

### 4. 6 つのチャートコンポーネント

`MajorIndicesChart` / `StackedAreaChart` / `ResidualAreaChart` / `NewGraph` /
`EarningsBreakdownChart` / `SpendingBarChart`

props のインターフェース (`tooltipProps: ChartTooltipProps` / `onClick?: () => void`) と
`<Tooltip {...tooltipProps} />`・チャートルートの `onClick={onClick}` は**そのまま**。
`bind()` がその 2 つを返す形にしたので、これらのファイルは**変更不要**。
（代表例: `StackedAreaChart.tsx:29-30`, `:85`, `:111`）

---

## 変更ファイル一覧

| ファイル                                             | 変更                                                     |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `src/app/components/charts/useChartTooltipProps.tsx` | `activeChartId` による制御化、解除 effect 3 種、`bind()` |
| `src/app/components/CustomTooltip.tsx`               | 内部状態・effect を全削除、`onDismiss` prop へ           |
| `src/types/chart.ts`                                 | `resetKey` / `suppressed` 削除、`onDismiss` 追加         |
| `src/app/components/CpiChart.tsx`                    | `tapNonce` 削除、7 箇所を `{...bind(id)}` へ             |
| 6 つのチャートコンポーネント                         | **変更なし**                                             |
| `openspec/specs/nextjstest/spec.md`                  | 下記参照                                                 |

### 仕様書の更新（AGENTS.md 準拠）

- **R15c を書き換え** — 現行は「`resetKey` により再表示される」と実装詳細に踏み込んでおり、
  仕組みごと無くなる。「✕ で閉じた後、同じ地点の再タップで再び開く」という振る舞いの記述にする。
- **R15e を書き換え** — 打ち消し effect ではなく「抑制中のタップは `activeChartId` を
  更新しないため、解除後に後出し表示されない」に更新。
- **R15 に解除のシナリオを新設**:
  - R15f: グラフ外タップ → ツールチップ**とガイド線**が消える
  - R15g: 別グラフのタップ → 直前のグラフのガイド線が消え、同時に 2 本表示されない
  - R15h: ✕ / スクロール解除時にガイド線も同時に消える
- `Component Tree` / `Client Modules` — `useChartTooltipProps` の説明を
  「Tooltip props 生成」から「タッチ端末のツールチップ表示状態の一元管理」に更新。

---

## 検証

### ユニット（vitest）

`tests/utils/recharts-mock.tsx` で recharts が完全にモックされているため、
**ガイド線の描画そのものはユニットで検証できない**。検証するのは「`active` prop が
正しく `false` になるか」まで。

新規 `tests/components/useChartTooltipController.test.tsx`（`renderHook`）:

- `isTouch=true` の初期状態で、全チャートの `active` が `false`
- `bind("A").onClick()` 後、A は `active: undefined`、B は `active: false`
- 続けて `bind("B").onClick()` すると **A が `false` に戻る**（他グラフのガイド線残留の回帰防止）
- `.recharts-wrapper` の外側での `pointerdown` で全チャートが `false` に戻る
- `.recharts-wrapper` の内側での `pointerdown` では戻らない
- `window.scrollY` を 40px 超動かして `scroll` を発火すると `false` に戻る
- `suppressed=true` の間は `onClick()` しても `active` が `undefined` にならず、
  `suppressed=false` に戻しても表示されない（R15e の回帰防止）
- `isTouch=false` では `active` が常に `undefined`、`trigger` が `"hover"`

`tests/components/CustomTooltip.test.tsx`（既存 11 件を整理）:

- 削除: `resetKey` 再表示、抑制解除の後出し 2 件、スクロール自動 dismiss、
  同一 label 維持、別データ点で再表示（いずれも hook 側テストへ移動、または責務消滅）
- 変更: 「✕ で消える」→「✕ タップで `onDismiss` が呼ばれる」
- 維持: `isTouch` / `isMobile` の組み合わせによる ✕ ボタンの表示条件 4 件

`tests/components/all.test.tsx` — `tooltipProps` の受け渡し形が変わる箇所に追随。

### E2E（Playwright / `mobile-pixel`）

`tests/e2e/tooltip-dismiss.e2e.spec.ts` を拡張。**ガイド線は
`.recharts-tooltip-cursor`（`Cursor.js:106`）で直接アサートできる**ので、
既存テストが「閉じるボタンが消えたか」しか見ていない点を補強する。

1. **既存「✕ で閉じられる」を強化** — ✕ タップ後に
   `nominal.locator(".recharts-tooltip-cursor")` が `toHaveCount(0)` になること。
   **現行実装では落ちるテスト**（原因1）。
2. **グラフ外タップ（本命）** — バーをタップ → ガイド線ありを確認 →
   グラフ外（ページ見出しなど `.recharts-wrapper` の外）をタップ →
   閉じるボタンとガイド線の両方が消えること。**現行実装では落ちる**。
3. **別グラフのタップ** — 名目グラフをタップ → 実質グラフをタップ →
   ページ全体の `.recharts-tooltip-cursor` が **1 本だけ**であること。**現行実装では落ちる**。
4. **スクロール解除でガイド線も消える** — 既存のスクロール dismiss にガイド線の
   アサートを追加。**現行実装では落ちる**。
5. **回帰維持** — 既存の縦スワイプ・再タップ・タブジャンプ中抑制の 3 件はそのまま通ること。
6. **デスクトップ回帰** — `chromium` のホバー表示テストに加え、
   チャート外へマウスを動かすとガイド線が消えること（`mouseLeaveChart` 経路が
   壊れていないことの確認）。

### 実機確認

- 実 iOS Safari / Android Chrome での、グラフ外タップ・✕・スクロールによる解除
- ボトムシート本体をタップしても閉じてしまわないこと（portal が `.recharts-wrapper`
  配下である前提の実地確認）
- タブジャンプ中のタップが解除後に後出しされないこと
