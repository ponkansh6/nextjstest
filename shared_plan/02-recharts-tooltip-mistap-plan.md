# Recharts グラフの誤タップによるツールチップ表示を減らす

## Context

モバイルでグラフの系列値ツールチップが意図せず表示される事象が頻発している。ツールチップは
`position: fixed` の下部シート(`z-index: 1000`, `max-height: 40dvh`, `CustomTooltip.tsx:50-66`)
としてレンダリングされるため、誤表示は画面の4割を覆う極めて邪魔な副作用になる。

### 根本原因(Recharts 3.9.2 のソースで確認済み)

Recharts はチャートラッパーの `onTouchMove` で**すべての** touchmove を
`touchEventAction` として dispatch する(`node_modules/recharts/lib/chart/RechartsWrapper.js:316-332`)。
`touchEventsMiddleware.js:60-70` がこれを受けて `setMouseOverAxisIndex` を dispatch し、
`tooltip.axisInteraction.hover` を書き換える。**移動量の閾値も方向の判定も存在しない**ため、
グラフ上に指を置いて縦にページスクロールしただけでツールチップが開く。

補足として、通常のタップ(touchmove なし)でツールチップが出ているのは、touchend 後に
ブラウザが合成する mousemove が同じ `hover` 経路を叩いているため。一方スクロール中は
ブラウザが合成マウスイベントを抑制するので、**誤表示の経路は touchmove 一本**に絞られる。

検討したが使えない手段: `RechartsWrapper` には dispatch を止める `dispatchTouchEvents` プロパティが
あるが、`CategoricalChart.js:45-62` が AreaChart / LineChart / BarChart から転送していないため
公開 API からは到達不能。

### 採用する方針

`<Tooltip trigger="click">` をタッチ端末で指定する。`combineTooltipInteractionState.js` により
`trigger="click"` は `axisInteraction.click` のみを読む。この状態を書くのは実クリックを処理する
`mouseEventsMiddleware.js:15-29` の `mouseClickAction` だけで、タッチ経路は決して `.click` を
書かない。つまり**スクロール由来の表示が構造的にゼロになる**。

副次的な効果として、`tests/e2e/tooltip-dismiss.e2e.spec.ts:47-54` に「スコープ外」として
記録されている既知の不具合(タップ→別地点タップで再表示されない)も、click は毎回確実に
発火するため同時に解消する。

トレードオフ: モバイルで指をなぞって値を連続表示するスクラブ操作は使えなくなる(合意済み)。

---

## 変更内容

### 1. ポインタ種別の判定を `isMobile` から分離する

`src/hooks/useChartTheme.ts`

現在 `isMobile` は幅のみ(`matchMedia("(max-width: 768px)")`, `:17`)で、これが
「レイアウト」と「入力方式」の2つの意味を兼ねてしまっている。これがタブレット横向き
(広い + タッチ)を取りこぼす原因なので、2つに分ける。

- `isMobile` — `(max-width: ${MOBILE_BREAKPOINT_PX}px)`。**現状維持**。下部シート化・
  凡例の圧縮・上位5件スライスといった**レイアウト**判断に使う。
- `isTouch` — `(pointer: coarse)`。**新規**。`trigger` の切替と ✕ ボタンの表示という
  **インタラクション**判断に使う。

既存の `subscribe` / `getSnapshot` は `useSyncExternalStore` パターン(`:11-20`)なので、
メディアクエリ文字列を引数に取る形に一般化して2つのクエリで再利用する。
`getServerSnapshot` は両方 `false` を返す(現状と同じ)。

`(hover: none)` は併用しない — タッチ+マウス併用機の判定が不安定になるため、
`pointer: coarse` 単独で判定する。CSS 側の既存パターン
(`CpiChart.module.css:167`, `:591` の `@media (hover: hover) and (pointer: fine)`)とは
目的が違う(あちらはホバー装飾の抑止)ので揃える必要はない。

### 2. Tooltip 設定を1箇所に集約する

新規 `src/app/components/charts/useChartTooltipProps.ts`

同一の `<Tooltip cursor={...} content={...} />` ブロックが6ファイルに複製されている
(`MajorIndicesChart.tsx:78`, `StackedAreaChart.tsx:97`, `ResidualAreaChart.tsx:63`,
`NewGraph.tsx:89`, `EarningsBreakdownChart.tsx:104`, `SpendingBarChart.tsx:155`)。
今回 `trigger` / `active` / `resetKey` が増えるので、先に集約する。

`CpiChart.tsx` が現在 `CustomTooltip` / `chartColors` / `isMobile` を個別に各チャートへ
渡している(`:523, :541, :575, :606, :635, :645, :658`)のを、**1つの `tooltipProps`
オブジェクト**に置き換える。各チャートは `<Tooltip {...tooltipProps} />` と書くだけになる。

Recharts v3 は redux で自己登録するのでラッパーコンポーネント化も理屈上は可能だが、
props スプレッドの方が確実にリスクゼロなのでこちらを採る。

フックが返すもの:

| キー      | 値                                                                                  |
| --------- | ----------------------------------------------------------------------------------- |
| `cursor`  | 現行と同じ `{ stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 }` |
| `trigger` | `isTouch ? "click" : "hover"`                                                       |
| `active`  | 抑制中のみ `false`、通常は `undefined`(= Recharts に委ねる)                         |
| `content` | `<CustomTooltip isMobile isTouch tooltipBg tooltipText resetKey />`                 |

`CustomTooltipProps`(`src/types/chart.ts:1-8`)に `isTouch` と `resetKey` を追加する。

### 3. タップのたびに `dismissed` を解除する ← 見落とすと機能退行になる

`src/app/components/CustomTooltip.tsx:11-17` / `CpiChart.tsx`

`dismissed` は `label` が変わったときだけ解除される。`trigger="click"` にすると
「✕ で閉じる → 同じ地点をもう一度タップ」で `label` が変わらないため、
**ツールチップが二度と開かなくなる**。現状は hover 経路のため顕在化していない。

対策: Recharts はチャートルートの `onClick` を外部ハンドラへ転送する
(`CategoricalChart.js:50` → `RechartsWrapper.js:247-253`)。これを使う。

- `CpiChart.tsx` に `const [tapNonce, setTapNonce] = useState(0)` を持たせ、
  `onClick={() => setTapNonce((n) => n + 1)}` を各チャートのルートへ渡す
  (これも `tooltipProps` と同じ経路で配る)。
- `tapNonce` を `resetKey` として `CustomTooltip` へ渡し、変化したら `dismissed` を解除する。
  既存の `prevKeyRef` による label 監視は、hover 時の挙動維持のためそのまま残す。

### 4. プログラム的スクロール中は表示を抑制する

`src/app/components/CpiChart.tsx:309-359`

タブ押下後、rAF の「追跡ループ」が最大約3秒(`MAX_FRAMES = 180`)スクロールし続ける。
この間の指の接触は誤タップの温床。

`isProgrammaticScrollRef`(ref なので再レンダリングを起こさない)と並行して
`const [isProgrammaticScroll, setIsProgrammaticScroll] = useState(false)` を持たせ、
ref を更新している3箇所(`:321`, `:322-323` の `handleScrollEnd`, `:352` のループ脱出)で
state も同時に更新する。ref は既存のスクロールスパム抑止ロジックが同期読みを必要とするため
残す(state への一本化はしない)。

これを `useChartTooltipProps` の `suppressed` として渡し、`active: false` にする
(`Tooltip.d.ts:21-26` の「false なら決して表示しない」)。

**エッジケース**: 抑制解除の瞬間に、抑制中のタップで立った `axisInteraction.click` が
そのまま表示に化ける。解除は約150msのテール付きで行い、かつ解除時に `tapNonce` を
**bump しない**ことで `dismissed` を維持する。実装時にここを実機確認すること。

### 5. ページスクロールで自動的に閉じる

`src/app/components/CustomTooltip.tsx`

取りこぼした誤表示を救う安全網。表示中かつ `isTouch` のときだけ、`{ passive: true }` の
scroll リスナを張り、表示開始時点の `window.scrollY` から一定量(40px 程度)離れたら
`setDismissed(true)`。デスクトップのホバー追従には影響させない。

これは施策4とかなり重なる(追跡ループのスクロールもこれで閉じる)ので、4は
二重の保険という位置づけになる。

### 6. ✕ ボタンの表示条件を `isTouch` に付け替える

`src/app/components/CustomTooltip.tsx:88-126`

`trigger="click"` では `mouseLeaveChart`(`tooltipSlice.js:161-171`)が `.hover` しか
クリアしないため、ツールチップは次のクリックまで残り続ける。したがって明示的な閉じる手段が
必要なのは「クリックトリガのとき」= `isTouch` であって `isMobile` ではない。
条件を `isMobile &&` から `isTouch &&` に変更する。

`onTouchEnd` の `preventDefault()`(`:95-104`)は**そのまま残す**。あのコメントが説明している
合成イベントによるタッチ追跡崩れは hover 経路の話で click トリガでは無関係になるが、
ボタンのタップが下のチャートへ抜けて `tapNonce` を bump してしまうのを防ぐ意味で
引き続き必要。

下部シートのレイアウト(`:50-66`)は `isMobile` のまま据え置く。

---

## 変更ファイル一覧

| ファイル                                            | 変更                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/hooks/useChartTheme.ts`                        | `isTouch`(`pointer: coarse`)を追加、メディアクエリ購読を一般化              |
| `src/app/components/charts/useChartTooltipProps.ts` | **新規** — Tooltip props を組み立てる                                       |
| `src/types/chart.ts`                                | `CustomTooltipProps` に `isTouch` / `resetKey` を追加                       |
| `src/app/components/CustomTooltip.tsx`              | `resetKey` での dismiss 解除、スクロール自動 dismiss、✕ を `isTouch` 条件へ |
| `src/app/components/CpiChart.tsx`                   | `tapNonce`、`isProgrammaticScroll` state、`tooltipProps` 生成と配布         |
| 6つのチャートコンポーネント                         | `<Tooltip {...tooltipProps} />` へ置換 + ルートに `onClick`                 |
| `openspec/specs/nextjstest/spec.md`                 | 下記参照                                                                    |

6ファイルはいずれも同じパターン(`<Tooltip>` ブロックの置換とチャートルートへの `onClick` 追加)。
代表例: `src/app/components/StackedAreaChart.tsx:80` と `:97-106`。

### 仕様書の更新(AGENTS.md 準拠)

- `Client Modules` の表(`spec.md:344`)— `useChartTheme.ts` の説明に `isTouch` を追記
- `Component Tree`(`spec.md:295-315`)— `useChartTooltipProps` を追加
- **要件を新設**(R7 Responsive Layout の近く)— 「タッチ端末ではグラフのツールチップは
  明示的なタップでのみ表示される」を WHEN/THEN シナリオで記述。
  `openspec/config.yaml` の `rules.spec` に従うこと。

---

## 検証

### ユニット(vitest)

`tests/utils/recharts-mock.tsx` と `tests/utils/logic-setup.tsx:14` で recharts が完全に
モックされているため、**ユニットテストでは Recharts のタッチ/トリガ挙動は一切検証できない**。
ユニットで担保するのは `CustomTooltip` のロジックのみ:

- `tests/components/CustomTooltip.test.tsx` に追加:
  - `resetKey` が変化したら `dismissed` が解除され再表示される(施策3の退行防止)
  - `isTouch=false` では ✕ ボタンが出ない / `isTouch=true` かつ `isMobile=false`(タブレット
    横向き相当)では ✕ が出る
  - 表示中に scroll イベントで閾値を超えたら消える(施策5)
- `tests/components/all.test.tsx` — `tooltipProps` へのプロップ変更に追随させる

### E2E(Playwright)

`playwright.config.ts:34-67` の `mobile-pixel`(Pixel 7、タッチあり)で検証する。
`tests/e2e/tooltip-dismiss.e2e.spec.ts` を拡張:

1. **ネガティブテスト(本命)** — グラフ上を縦にスワイプ
   (`page.touchscreen` で touchstart → 複数の touchmove → touchend)して、
   ツールチップが**出ないこと**を検証。これが今回の修正の核心。
2. **ポジティブテスト** — `bar.tap()` でツールチップが出る(既存 `:25-45` がそのまま通るはず)
3. **再タップ** — ✕ で閉じた後、**同じバー**をもう一度タップして再表示されること。
   施策3が無いと落ちるテスト。あわせて `:47-54` の「スコープ外」コメントを、
   制約が解消された旨に書き換える。
4. **タブジャンプ中** — `SectionTabs` のタブをタップした直後(追跡ループ実行中)に
   グラフへ触れてもツールチップが出ないこと(施策4/5)。

`chromium` プロジェクトでは**ホバーで従来どおり表示されること**の回帰確認を1本入れる
(`trigger` がデスクトップで誤って click になっていないこと)。

### 実機確認

エミュレータでは合成イベントの挙動が実機と異なるため、以下は実機で確認する:

- 実 iOS Safari / Android Chrome での、タップ→表示、スクロール→非表示
- 施策4のエッジケース(抑制解除の瞬間にツールチップが飛び出さないか)
- タブレット横向きでの `isTouch` 判定

---

### 実施状況（2026-08-11 完了）

1. **実装済みの全施策**:
   - 施策1: `useChartTheme.ts` に `isTouch`(`pointer: coarse`)を追加、メディアクエリ購読を `createMediaQueryStore` で一般化
   - 施策2: 新規 `src/app/components/charts/useChartTooltipProps.tsx` で Tooltip props を一元化。6チャートは `<Tooltip {...tooltipProps} />` に置換
   - 施策3: `CpiChart` に `tapNonce` を追加し、チャートルート `onClick` で bump → `resetKey` として `CustomTooltip` に渡し dismiss 解除
   - 施策4: `isProgrammaticScroll` state を追加し `active={false}` で抑制。解除は150msテール付き(`endProgrammaticScroll`)
   - 施策5: `CustomTooltip` に passive scroll リスナ(40px閾値)で自動 dismiss
   - 施策6: ✕ ボタンの表示条件を `isMobile` → `isTouch` に変更

2. **仕様書**: `openspec/specs/nextjstest/spec.md` に新要件 R15 を追加、`useChartTheme` の説明と Component Tree を更新

3. **テスト**:
   - ユニット: `CustomTooltip.test.tsx`(resetKey再表示/isTouch✕表示/スクロールdismiss等)、`all.test.tsx`、`ChartInfoButton.test.tsx`、`real-consumption-support-series.test.tsx` を新 props に追随
   - E2E: `tooltip-dismiss.e2e.spec.ts` に縦スワイプ非表示(ネガティブ)、✕後再タップ、タブジャンプ中抑制、デスクトップホバー回帰を追加

4. **検証結果**: `tsgo --noEmit` / `lint:fast` / `vitest`(183件) / `next build` / 全E2E(68 passed) すべて成功

5. **残タスク（実機確認）**: 計画の「実機確認」項目はエミュレータでは検証不可のため未実施
   - 実 iOS Safari / Android Chrome でのタップ→表示、スクロール→非表示
   - 施策4のエッジケース（抑制解除の瞬間にツールチップが飛び出さないか）
   - タブレット横向きでの `isTouch` 判定

---

## 第三者検証: E2E「タブジャンプ中抑制」テストのフレーキー原因分析（2026-08-11）

「実施状況」に記載の「全E2E(68 passed)」を別セッションで再実行したところ、
`tooltip-dismiss.e2e.spec.ts` の「タブジャンプ中（プログラム的スクロール中）に
グラフへ触れてもツールチップが出ないこと」(mobile-pixel) が2回中1回失敗した。
これは施策4のエッジケースとして計画自身が「実機確認が必要」と記していた懸念が
的中したものであり、**テストのタイミング設計の問題ではなく実装側の本物のバグ**
であることを Recharts のソース(`node_modules/recharts/lib/`)を辿って特定した。

### 根本原因: `active={false}` は表示のみを止め、内部クリック状態は止めない

1. **抑制中のタップも Recharts 内部状態を書き換えてしまう**
   `RechartsWrapper.js:248` — チャートの `onClick` は常に2つを同時に行う:

   ```js
   dispatch(mouseClickAction(e));       // Redux の axisInteraction.click を無条件更新
   callback({ handler: onClick, ... }); // 我々の handleChartClick (tapNonce++) も同時発火
   ```

   `isProgrammaticScroll=true` で `<Tooltip active={false}>` を渡していても、
   このチャート `onClick` 自体は抑制されない。`tapNonce` が増えるのと**全く同じ
   イベントで** Recharts 内部の「クリック位置」状態(`axisInteraction.click`)も
   同時に書き込まれる。

2. **`active={false}` は一時的な上書きに過ぎない**
   `Tooltip.js:140`:

   ```js
   finalIsActive = activeFromProps ?? isActive ?? false;
   ```

   抑制中は `activeFromProps=false` が勝つため確かに非表示になる。しかし抑制が
   解除されると `useChartTooltipProps.tsx:25` の `active: suppressed ? false : undefined`
   により `active` prop は `undefined` に戻り、`finalIsActive` は Redux 由来の
   `isActive` にフォールバックする。この `isActive` は手順1で書き込まれたまま
   残っているクリック状態を指すため、**何も操作していないのに抑制解除の瞬間に
   「後出し」でツールチップが表示される**。

3. **`CustomTooltip.tsx` 側もこの後出しを弾けない**
   抑制中のタップでも `resetKey`(=`tapNonce`)は即座に増えるため
   `useEffect(() => setDismissed(false), [resetKey])`(:11-13)が先に走り、
   `dismissed` フラグは邪魔にならない。label 監視の effect(:15-21)も
   「`active` が false→true に変わり label が変化した」ことを"新しい正当な
   タップ"と区別できないため、素通しで再表示させてしまう。

### なぜ「フレーキー」に見えたか

抑制解除のタイミング(rAF `chase` ループの `STABLE_FRAMES_THRESHOLD=30` フレーム、
または `scrollend` + 150msテール)は実時間換算が環境負荷で変動する。テストの
固定 `waitForTimeout(300)` のウィンドウ内に「抑制解除→後出し表示」が収まるか
どうかがブレるため、実行のたびに合否が変わって見えていた。表面上はタイミング
依存のテストに見えるが、本質は「抑制中にタップが Recharts 内部へ登録されて
しまい、解除後にそれが表示として顕在化する」という機能上の欠陥である。

### 実運用上の影響

E2E に限らず、実機でタブジャンプ中にグラフへ触れた場合も、スクロール(または
追跡ループ)が収まった直後に、何も操作していないのにツールチップが突然出現する。
これは本プランの目的(「タブジャンプ中の誤タップ対策」)を正面から破る不具合であり、
**修正が必要**と判断する。

### 修正方針(実装済み 2026-08-11)

`suppressed` の状態を `CustomTooltip` に明示的な prop として渡し、
「抑制が true→false に変わった瞬間、かつ新しい正当なタップ(=タブジャンプ終了後
の追加の `resetKey` 変化)が伴っていない場合」は強制的に `dismissed=true` にする
effect を追加した。既存の label 監視 effect より**後**に実行させることで、
同一コミット内の `setDismissed` 呼び出しの最終結果として後出し表示を打ち消す
(React は同一コミットの複数 `setState` を宣言順に適用するため)。

実装の要点:

- `src/app/components/charts/useChartTooltipProps.tsx` — `suppressed` を
  `CustomTooltip` へ明示的に渡す(従来は `active` の算出にのみ使用)。
- `src/types/chart.ts` — `CustomTooltipProps` に `suppressed?: boolean` を追加。
- `src/app/components/CustomTooltip.tsx` — 抑制解除 effect を追加。
  `prevSuppressedRef` / `prevResetKeyRef` で「解除と同時の正当な新規タップ
  (resetKey 変化)」を区別し、その場合は抑制しない。
- `tests/components/CustomTooltip.test.tsx` — 「抑制中のタップは解除後も
  表示されないこと」「抑制解除後の正当な新規タップは表示されること」を追加。
- `tests/e2e/tooltip-dismiss.e2e.spec.ts` — 「タブジャンプ中」テストの固定
  `waitForTimeout(300)` を、約3秒間の `not.toBeVisible()` ポーリングに変更し、
  抑制解除タイミングの変動に依存しないようにした。

検証結果:

- ユニット: `CustomTooltip.test.tsx` 11件(新規2件含む) / `test:all` 185件 すべて成功
- E2E: `tooltip-dismiss.e2e.spec.ts` 全件PASS。「タブジャンプ中」テストは
  3回連続実行で安定(修正前は2回中1回失敗)。
- 全E2E 68件 PASS / `tsgo --noEmit` / `lint`(0 errors) / `next build` 成功
