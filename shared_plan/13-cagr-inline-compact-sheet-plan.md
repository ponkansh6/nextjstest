# CAGR を費目別グラフ配下のコンパクトなボトムシートへ統合するプラン

## コンセプト

**モバイル画面の上部で費目別グラフの一端を見ながら、下部のポップアップで CAGR を確認できる状態にする。**

CAGR は「積み上げ凡例で選択した費目の合計」を基準に算出しており（`CpiChart.tsx:399-449` が
`stackedHiddenKeys` / `stackedKeys` を参照）、**費目別寄与度グラフに従属する機能**である。
にもかかわらず現状は独立した 1 セクション（`section-cagr`）としてグラフから切り離されており、
「どの費目を選ぶと年率がどう変わるか」を見比べられない。

グラフ直下のリンクからコンパクトなボトムシートを開き、設定・計算・結果をすべてシート内で完結させれば、
画面上部にグラフを残したまま費目選択と年率を往復できる。

## 3 つの要求

1. **計算ボタンと計算結果もボトムシートへ入れる**（現在はシート外のパネル本体にある）
2. **ボトムシートをコンパクトにする**（ボタンは多少小さくてもよい）
3. **CAGR 独立セクションを廃止**し、グラフと「データテーブルを表示 ▾」の間にポップアップリンクを置く

---

## 現状（コード確認済み）

| 対象                   | 現状                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAGR の配置            | `CpiChart.tsx:589-601` で `<CagrPanel sectionId="section-cagr">` を独立レンダリング。`.cagrSection` はカード（`CpiChart.module.css:380-386`、`padding: clamp(1.5rem…3rem)`） |
| CAGR パネル構造        | `CagrPanel.tsx:43-137`。`<h2>` + `.cagrControls`（トリガー + 計算する）+ `.cagrError` + `.cagrResult` + 注記 + `BottomSheet`（3 select のみ）                                |
| シート内 select        | `.cagrSheetControls` で**縦積み**（`CpiChart.module.css:757-761`）                                                                                                           |
| ボトムシート寸法       | `.bottomSheet`: `max-height: 60dvh` / `padding: 1.5rem` / ヘッダー `margin-bottom: 1rem`（`CpiChart.module.css:691-711`）                                                    |
| 費目別グラフ           | `StackedAreaChart.tsx:49-138`。末尾 `:134-136` に `<p className={styles.chartNote}><a href="#data-table-{sectionId}">データテーブルを表示 ▾</a></p>`                         |
| グラフ高さ（モバイル） | `.chartWrapper` は `@media (max-width: 768px)` で `aspect-ratio: 4/3` / `max-height: 650px`（`:539-543`）→ 375px 幅で約 281px                                                |
| セクションタブ         | `CpiChart.tsx:261-273` の `sections` に 8 件。うち `{ id: "section-cagr", label: "CPI年率" }`                                                                                |
| データテーブル         | `CpiChart.tsx:459-505` の 7 件に `section-cagr` は**無い**（CAGR にデータテーブルは存在しない）                                                                              |
| タップターゲット規約   | `mobile-ux.e2e.spec.ts:16-45` が**表示中の全ボタンに 44px 以上**を要求。例外は `.legendItem` の 32px のみ（コメントで明文化）                                                |

---

## 変更後の構成

```
費目別寄与度セクション（section-stacked / StackedAreaChart）
├── <h2>物価指数 費目別寄与度</h2> + ⓘ
├── 凡例（全選択解除 + 12 費目）
├── .chartWrapper（積み上げグラフ）
├── ★ belowChartSlot ─ <CagrPanel />          ← 新規スロット
│     └── <p class="chartNote">
│           <button class="cagrLink">年率上昇率（CAGR）を計算 ▾</button>
│         </p>
│     └── <BottomSheet compact title="年率上昇率（CAGR）">
│           ├── .cagrSheetRow ─ 開始年 / 終了年 / 評価月（★横並び）
│           ├── button.calculateButton（★シート内へ移動）
│           ├── .cagrResult もしくは .cagrError（★シート内へ移動・コンパクト化）
│           └── <p class="cagrSheetNote">※凡例で選択した費目の合計を基準に算出</p>
│         </BottomSheet>
└── <p class="chartNote"><a href="#data-table-section-stacked">データテーブルを表示 ▾</a></p>
```

**削除されるもの**: `.cagrSection` カード / `<h2>年率上昇率（CAGR）</h2>` /
`section-cagr` アンカー / 「CPI年率」タブ（セクション 8 → 7 件）。

---

## 対象ファイル

1. **`shared_plan/13-cagr-inline-compact-sheet-plan.md`**（本プラン文書）
2. **`src/app/components/StackedAreaChart.tsx`** — `belowChartSlot` prop を追加
3. **`src/app/components/CagrPanel.tsx`** — リンク + シート構成へ全面的に作り替え
4. **`src/app/components/BottomSheet.tsx`** — `compact` prop を追加
5. **`src/app/components/CpiChart.tsx`** — `CagrPanel` を `StackedAreaChart` のスロットへ移設、`sections` から `section-cagr` を削除
6. **`src/app/components/CpiChart.module.css`** — `.cagrLink` / `.cagrSheetRow` / `.cagrSheetNote` / `.bottomSheetCompact` を追加、`.cagrSection` 系を削除、`.cagrResult` 系をコンパクト化
7. **`tests/components/CagrPanel.test.tsx`** — T1〜T6 を改修
8. **`tests/components/BottomSheet.test.tsx`** — `compact` の単体テストを追加
9. **`tests/e2e/cagr-sheet.e2e.spec.ts`** — T-E2E-1〜4 を改修、コンセプト検証 T-E2E-5 を追加
10. **`tests/e2e/section-tabs-scroll.e2e.spec.ts`** — 「CPI年率」ケースを削除
11. **`openspec/specs/nextjstest/spec.md`** — R18 全面改訂、R10 の "eight" → "seven"、Component Tree 更新

---

## 実装手順

### 1. `BottomSheet.tsx` に `compact` prop を追加

```tsx
interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** 画面上部のコンテンツを見せるため高さと余白を切り詰める */
  compact?: boolean;
  children: React.ReactNode;
}
```

- `.bottomSheet` の className を
  `` `${styles.bottomSheet}${compact ? ` ${styles.bottomSheetCompact}` : ""}` `` にする。
- `useFocusTrap` / Escape / backdrop / `role="dialog"` / `aria-modal` は**一切変更しない**
  （`shared_plan/12` の R8e とその回帰テストがそのまま効き続けること）。

### 2. `CpiChart.module.css` の変更

#### 2-1. 追加

```css
/* コンパクト版ボトムシート: 上部のグラフを見せるため高さと余白を詰める */
.bottomSheetCompact {
  max-height: 45dvh;
  padding: 0.875rem 1rem 1.25rem;
}
.bottomSheetCompact .bottomSheetHeader {
  margin-bottom: 0.625rem;
}

/* グラフ直下のポップアップリンク。データテーブルリンクと並ぶ見た目に揃える */
.cagrLink {
  background: none;
  border: none;
  padding: 0.625rem 0.75rem;
  min-height: 44px;
  font: inherit;
  color: var(--blue-500);
  text-decoration: underline;
  cursor: pointer;
}
.cagrLink:focus-visible {
  outline: 2px solid var(--blue-500);
  outline-offset: 2px;
}

/* シート内 3 項目の横並び。ChartFilters の filterRow と同じ考え方 */
.cagrSheetRow {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
}
.cagrSheetRow .cagrItem {
  flex: 1 1 0;
  min-width: 0;
  gap: 0.25rem;
}
.cagrSheetRow .cagrItem label {
  font-size: 0.8125rem;
}
.cagrSheetRow select {
  width: 100%;
}

.cagrSheetNote {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  opacity: 0.75;
  color: var(--card-text);
}
```

#### 2-2. コンパクト化（既存クラスの変更）

- `.calculateButton`: シート内に入るため `width: 100%` / `margin-top: 0.875rem` を与える。
  `min-height: 44px` は**維持**（理由は「リスクと留意点」参照）。フォントサイズは
  `clamp(0.875rem, 0.6rem + 0.8vw, 1.75rem)` → `0.9375rem` 固定に下げてよい。
- `.cagrResult`: 3 行（ラベル / 大きな値 / 詳細）から**2 行**に圧縮する。
  `.cagrResultLabel` を廃し、`.cagrResultValue` を `1.5rem` 程度へ、
  `.cagrResultDetail` を `0.8125rem` へ。`padding` も `0.75rem` 程度に。
- `.cagrError`: `padding` を詰め、`font-size: 0.8125rem`。

#### 2-3. 削除

- `.cagrSection` および `@media (max-width: 768px)` 内の `.cagrSection`（`:506-508`）
- `.cagrContainer` / `.cagrControls` / `.cagrNote`（いずれも参照元が消える）
- `.cagrSheetControls`（`.cagrSheetRow` に置き換わる）
- `@media` 内の `.cagrControls` / `.cagrItem select` / `.calculateButton` の上書き（`:510-525`）
  — 横並び前提に変わるため、残すとレイアウトが壊れる

> **手順**: 削除は「`grep -rn "cagrSection\|cagrContainer\|cagrControls\|cagrNote\|cagrSheetControls" src/ tests/`
> の結果がゼロになったこと」を確認してから行う。

### 3. `StackedAreaChart.tsx` に `belowChartSlot` を追加

CAGR の 10 個の props を `StackedAreaChart` に流し込むと責務が壊れるため、**スロット方式**にする。

```tsx
interface StackedAreaChartProps {
  // …既存の props はすべて据え置き…
  /** グラフとデータテーブルリンクの間に差し込む要素 */
  belowChartSlot?: React.ReactNode;
}
```

`:133`（`.chartWrapper` の閉じ `</div>`）と `:134`（データテーブルリンクの `<p>`）の間に
`{belowChartSlot}` を置くだけ。既存の呼び出し側は prop 省略で従来どおり動く。

### 4. `CagrPanel.tsx` の作り替え

`CagrPanelProps` から **`sectionId` を削除**（他の props は据え置き）。

```tsx
export const CagrPanel = React.memo<CagrPanelProps>(({ allYears, cagrStartYear, ... }) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const displayYears = allYears.filter((y) => y >= MIN_DISPLAY_YEAR);

  return (
    <>
      <p className={styles.chartNote}>
        <button
          type="button"
          className={styles.cagrLink}
          onClick={() => setSheetOpen(true)}
          aria-label={`年率上昇率（CAGR）を計算（現在: ${…現在値…}）`}
        >
          年率上昇率（CAGR）を計算 ▾
        </button>
      </p>

      <BottomSheet compact open={sheetOpen} title="年率上昇率（CAGR）" onClose={() => setSheetOpen(false)}>
        <div className={styles.cagrSheetRow}>
          {/* 開始年 / 終了年 / 評価月 の 3 つの .cagrItem を現行のまま移設 */}
        </div>

        <button className={styles.calculateButton} onClick={calculateCAGR}
                disabled={cagrStartYear === cagrEndYear}>
          計算する
        </button>

        {cagrError && <div className={styles.cagrError}>…</div>}
        {cagrResult !== null && <div className={styles.cagrResult}>…</div>}

        <p className={styles.cagrSheetNote}>※凡例で選択した費目の合計を基準に算出</p>
      </BottomSheet>
    </>
  );
});
```

**維持する挙動**（既存テストが依存している）:

- `formatCagrRange` と結果詳細の表示書式（`shared_plan/12` の B-2 で `▾` を分離済み）
- `<option disabled>` の条件（`year > cagrEndYear` / `year < cagrStartYear`）と `MIN_DISPLAY_YEAR` フィルタ
- `disabled={cagrStartYear === cagrEndYear}`
- select 変更でシートを自動クローズ**しない**
- `aria-label` に現在値を含める（`shared_plan/12` の A-2）

**変わる挙動**: トリガーのラベルが「現在の期間」から「年率上昇率（CAGR）を計算 ▾」という
**機能名**に変わる。理由: グラフ直下のリンクとしては機能名の方が発見しやすく、
現在値は `aria-label` とシートを開いた先で確認できる。
（別案として `2005–2026 の年率を計算 ▾` のように現在値を混ぜる形もあり得る。要判断）

### 5. `CpiChart.tsx` の変更

1. `<StackedAreaChart>`（`:572-577` 付近）に `belowChartSlot={<CagrPanel …／sectionId は渡さない／>}` を追加。
2. 独立レンダリングしていた `<CagrPanel sectionId="section-cagr" …/>`（`:589-601`）を**削除**。
3. `sections` 配列（`:261-273`）から `{ id: "section-cagr", label: "CPI年率" }` を削除（8 → 7 件）。

> `activeId` の初期値は `sections[0].id` のままでよい。スクロールスパイ（`:318-343`）は
> 配列を走査するだけなので追随する。

### 6. コンセプト成立の実測（★このプランの合否判定）

「上部でグラフの一端が見える」は CSS 値からの推定では確認できないため、**E2E で数値計測する**
（下記 T-E2E-5）。375×667 の Pixel 相当ビューポートでの見積もりは:

| 要素                                    | 高さ         |
| --------------------------------------- | ------------ |
| ビューポート                            | 667px        |
| コンパクトシート（`max-height: 45dvh`） | 最大 300px   |
| **シート上に残る領域**                  | **約 367px** |
| `.chartWrapper`（375px 幅・4:3）        | 約 281px     |

グラフ本体（281px）はシート上の領域（367px）に収まる計算。ただし sticky タブバー（約 56px）と
グラフ見出し・凡例が上に乗るため、**実際にはグラフの上部〜中程が見える**状態になる。
T-E2E-5 で「シート表示中にグラフ要素の可視高さが 120px 以上」を不変条件として固定する。

### 7. （任意）シートを開いたときのスクロール調整

グラフをより多く見せるため、シートを開く際に `section-stacked` を画面上部へ寄せる案。

> **⚠️ 慎重に。** `CpiChart.tsx:287-305, 345-393` に、WebKit で
> 「近接した 2 つの `scrollIntoView` が互いをキャンセルする」不具合への対策
> （`isProgrammaticScrollRef` / `chase()` によるリトライ）が積み重なっている。
> 追加する場合は **`behavior: "auto"`（instant）** とし、`isProgrammaticScroll` による
> ツールチップ抑止フラグとの相互作用を必ず E2E で確認すること。

**まず 6 の実測を行い、グラフが十分見えているなら本手順は実施しない**ことを推奨する。

---

## テスト計画

> AGENTS.md の分離ルールに従い、テストの実装は `@fixer` に委譲し、実行・検証は Orchestrator が行う。

### 改修 `tests/components/CagrPanel.test.tsx`

| ID            | 内容                                                                                    |
| ------------- | --------------------------------------------------------------------------------------- |
| T1（改）      | 初期状態でシートは閉じ、3 select **および「計算する」ボタン**が DOM に存在しない        |
| T2（改）      | トリガーがリンク文言「年率上昇率（CAGR）を計算」で描画され、`aria-label` に現在値を含む |
| T3（改）      | トリガークリックで 3 select と「計算する」ボタンが**同時に**表示される                  |
| T4（維）      | シート内 select 変更で setter が呼ばれ、シートは開いたまま                              |
| T5（維）      | 開始年 select の `disabled` 条件（終了年側の対称条件も）                                |
| T6（改）      | 「計算する」は**シート内**にあり、`cagrStartYear === cagrEndYear` のとき `disabled`     |
| **T15（新）** | `cagrResult` が非 null のときシート内に結果が表示され、**シート外には表示されない**     |
| **T16（新）** | `cagrError` が非 null のときシート内にエラーが表示される                                |
| **T17（新）** | `sectionId` prop を渡さなくても型・描画が成立する（＝独立セクション廃止の担保）         |

### 追加 `tests/components/BottomSheet.test.tsx`

- **T18**: `compact` 指定時に `.bottomSheetCompact` 相当のクラスが付く／非指定時は付かない

### 改修 `tests/e2e/cagr-sheet.e2e.spec.ts`

| ID                                | 内容                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T-E2E-1（改）                     | `#section-stacked` 内のリンクからシートが開き、3 select と「計算する」がシート内に見える                                            |
| T-E2E-2（改）                     | シート内で開始年変更 → **シートを開いたまま**「計算する」→ 結果がシート内に表示（`.cagrResultValue` を `/^-?\d+\.\d{2}%$/` で検証） |
| T-E2E-3（維）                     | 背景タップでシートが閉じる                                                                                                          |
| T-E2E-4（維）                     | モバイル幅で横スクロールが発生しない（R7d）                                                                                         |
| **T-E2E-5（新・コンセプト検証）** | 375×667 でシートを開いた状態で、`#section-stacked` のグラフ描画領域の**可視高さが 120px 以上**であること                            |
| **T-E2E-6（新）**                 | `#section-cagr` が DOM に存在せず、タブバーに「CPI年率」ボタンが無いこと（独立セクション廃止の回帰）                                |

T-E2E-5 の可視高さは、`.chartWrapper` の `getBoundingClientRect()` とシートの `top` から算出する:

```ts
const visible = await page.evaluate(() => {
  const chart = document.querySelector("#section-stacked [class*='chartWrapper']")!;
  const sheet = document.querySelector("[class*='bottomSheet']:not([class*='Backdrop'])")!;
  const c = chart.getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  return Math.max(0, Math.min(c.bottom, s.top) - Math.max(c.top, 0));
});
expect(visible).toBeGreaterThanOrEqual(120);
```

### 改修 `tests/e2e/section-tabs-scroll.e2e.spec.ts`

- `:41` の `{ label: "CPI年率", sectionId: "section-cagr" }` を削除（残り 3 ケース）。
  同ファイルの「未マウント状態」ブロックも同じ配列を使っているか確認して合わせる。

### 回帰確認（既存テスト）

| 対象                                | 観点                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `mobile-ux.e2e.spec.ts:19`          | **最重要**。`.cagrLink` が 44px を満たすか。シート閉状態で新規ボタンが 1 つ増える |
| `mobile-ux.e2e.spec.ts:47`          | 375px 横はみ出しなし（3 select 横並びの影響を直撃）                               |
| `accessibility.e2e.spec.ts:171-224` | R8e（フォーカストラップ / 復帰 / スクロール保持）が `compact` 追加後も成立するか  |
| `range-change.e2e.spec.ts`          | 表示期間シート（`compact` 非指定）に影響が出ていないこと                          |
| `section-tabs-scroll.e2e.spec.ts`   | セクション 7 件化後もタブジャンプが機能すること（webkit プロジェクト含む）        |

### 検証ゲート（Orchestrator 実行）

`pnpm type-check` → `pnpm lint`（**警告 5 件から増えないこと**）→ `pnpm test`
→ **`pnpm build`** → `pnpm test:e2e`

> `shared_plan/12` の教訓: `pnpm test:e2e` は `.next` を再ビルドしない。
> `src/` を変更したら必ず `pnpm build && pnpm test:e2e` の順で実行する。

---

## 仕様書更新（`openspec/specs/nextjstest/spec.md`）

1. **R10（Section Navigation）** — 冒頭の "the eight chart sections" を **"the seven chart sections"** に修正。
2. **R18** を全面改訂:

```md
### R18: CAGR Compact Sheet Under the Contribution Chart

The system SHALL expose CAGR as a compact bottom sheet anchored to the 費目別寄与度 chart,
so that part of the chart stays visible while the user adjusts and reads the CAGR.

#### Scenario R18a: Entry Point

- **WHEN** the user views the 費目別寄与度 chart
- **THEN** a popup link appears between the chart and the "データテーブルを表示" link
- **AND** no standalone CAGR section or `CPI年率` tab exists

#### Scenario R18b: Self-Contained Sheet

- **WHEN** the link is tapped
- **THEN** a compact `BottomSheet` opens containing start-year / end-year / evaluation-month
  selects on one row, the 計算する button, and the result or error
- **AND** none of these controls are rendered outside the sheet

#### Scenario R18c: Chart Remains Visible

- **WHEN** the sheet is open on a 375x667 viewport
- **THEN** at least 120px of the contribution chart's plot area remains visible above the sheet

#### Scenario R18d: Sheet Stays Open While Editing

- **WHEN** the user changes one of the three selects
- **THEN** the sheet stays open and the previously calculated result is cleared
```

3. **Component Tree** — `CagrPanel` を `StackedAreaChart` の子（`belowChartSlot`）として記載し、
   `BottomSheet` の説明に `compact` バリアントを追記。
4. **Test Requirements** — `cagr-sheet.e2e.spec.ts` の説明を
   「CAGR コンパクトシートの開閉・計算導線・グラフ可視性（R18）」に更新。

---

## リスクと留意点

| リスク                                                   | 対応                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **「ボタンを小さく」と 44px タップターゲット規約の衝突** | `mobile-ux.e2e.spec.ts:16-45` は表示中の全ボタンに 44px を要求し、例外は `.legendItem`（32px）のみ。**まず `min-height: 44px` を保ったまま、余白・字送り・3 列化だけでコンパクト化する**方針を採る。それでも 45dvh に収まらない場合に限り、`.calculateButton` を例外リスト（36px）へ追加し、テスト側のコメントに理由を明記する。**規約を黙って緩めない。** |
| CAGR の結果がシート内のみになり、閉じると見えなくなる    | 設定変更で `cagrResult` が `null` になる既存挙動（`CpiChart.tsx:204-219`）と整合。シートを開けば直前の結果が残っている。トリガーの `aria-label` に現在の期間を含めることで文脈も保つ                                                                                                                                                                       |
| 3 select 横並びが 375px で溢れる                         | `ChartFilters` は同幅で 3 要素横並びを実現済み（`mobile-ux.e2e.spec.ts:125` が保証、select 実測 75.5px）。`.cagrSheetRow .cagrItem { flex: 1 1 0; min-width: 0 }` で等幅化し、T-E2E-4 で回帰を押さえる                                                                                                                                                     |
| `.cagrSection` 系 CSS の削除漏れ                         | 削除前後で `grep -rn "cagrSection\|cagrContainer\|cagrControls\|cagrNote\|cagrSheetControls" src/ tests/` を実行し、ゼロを確認                                                                                                                                                                                                                             |
| セクション 8 → 7 でタブ関連テストが落ちる                | `section-tabs-scroll.e2e.spec.ts:41` と spec.md R10 の "eight" を同時に更新。webkit プロジェクトでも実行されるため見落としやすい                                                                                                                                                                                                                           |
| `compact` 追加で R8e（フォーカス管理）が壊れる           | `BottomSheet` の変更を **className の分岐 1 箇所のみ**に限定し、`useFocusTrap` / Escape / backdrop には触れない                                                                                                                                                                                                                                            |
| `belowChartSlot` により `StackedAreaChart` が肥大化する  | slot は `ReactNode` を差し込むだけで、CAGR のロジック・state は `CagrPanel` と `CpiChart` に留まる。`StackedAreaChart` の既存 props は一切変更しない                                                                                                                                                                                                       |
| `max-height: 45dvh` がランドスケープで窮屈になる         | `@media (orientation: landscape) and (max-height: 500px)` は `.chartWrapper` を `85svh` にしている（`:326-330`）。同条件で `.bottomSheetCompact` を `70dvh` へ緩める指定を検討                                                                                                                                                                             |

---

## 未確定事項（実装前に判断が必要）

1. **トリガーの文言** — 機能名のみ（`年率上昇率（CAGR）を計算 ▾`）か、現在値を混ぜる
   （`2005–2026 の年率を計算 ▾`）か。本プランは前者を採用しているが、
   `shared_plan/12` の A-2（現在値の可視化）の方針とはやや逆行する。
2. **手順 7（シート開閉時のスクロール調整）の要否** — 手順 6 の実測結果を見てから判断する。
3. **「CPI年率」タブの完全削除 vs `section-stacked` への付け替え** — 本プランは削除を採用。
   タブから CAGR へ到達する導線が必要なら、タブ押下で `section-stacked` へスクロール
   **かつシートを開く**という選択肢もあるが、タブの意味論（セクションへの移動）から外れる。

---

# 検証結果（2026-08-17 実施 / 対象コミット `31c1ac7`）

## 総合判定

**実装はプランどおり完了し、全検証ゲートを通過した。コンセプト（上部にグラフ・下部に CAGR）も実測で成立を確認した。**

ただしシートの高さ配分に **2 件の要対応事項（L-1 / L-2）** がある。いずれも
「シート内コンテンツが `max-height` を超えて内部スクロールを要する」問題で、
**プランの想定（結果カードまで収まる）が小さいビューポートで崩れている。**

## 検証ゲート

| ゲート                  | 結果                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `pnpm type-check`       | ✅ エラー 0                                                    |
| `pnpm lint`             | ✅ エラー 0 / **警告 5**（既存分のみ・新規増加なし）           |
| `pnpm test`             | ✅ 31 ファイル / **252 テスト全 pass**（248 → T15〜T18 の +4） |
| `pnpm build`            | ✅ 成功                                                        |
| `pnpm test:e2e`（全体） | ✅ **87 passed / 22 skipped / 0 failed**                       |

新規 E2E（T-E2E-5 グラフ可視性 / T-E2E-6 セクション廃止）も pass。
回帰対象として挙げた 5 件（`mobile-ux` の 44px タップターゲット・375px はみ出し・3 要素横並び、
`accessibility` の R8e 3 件、`range-change`、`section-tabs-scroll` の webkit 含む全件）すべて通過。

> テスト総数が 87 で前回と同数なのは、`section-tabs-scroll` の「CPI年率」ケース 2 件
> （chromium + webkit）が消え、T-E2E-5 / T-E2E-6 の 2 件が増えて相殺したため。

## プラン記載事項との突合

| プラン項目                                                                                      | 実装状況                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BottomSheet` の `compact` prop                                                                 | ✅ `BottomSheet.tsx:11,45`。変更は **className 分岐 1 箇所のみ**で、`useFocusTrap` / Escape / backdrop / `role` / `aria-modal` は無改変。プランの制約を厳守 |
| `StackedAreaChart` の `belowChartSlot`                                                          | ✅ `StackedAreaChart.tsx:33,49,136`。`.chartWrapper` とデータテーブルリンクの間に配置。既存 props は無改変                                                  |
| `CagrPanel` の作り替え（`sectionId` 削除）                                                      | ✅ `CagrPanel.tsx:6-17` から `sectionId` を削除。`<h2>` / `.cagrSection` カードも撤去                                                                       |
| 計算ボタン・結果・エラーをシート内へ                                                            | ✅ `CagrPanel.tsx:110-131` ですべて `BottomSheet` の子。シート外には `.cagrLink` のみ（要求 1 達成）                                                        |
| 3 select 横並び（`.cagrSheetRow`）                                                              | ✅ `CagrPanel.tsx:60`、CSS `:698-714`。375px で横スクロールなし（T-E2E-4 / `mobile-ux:47`）                                                                 |
| `CpiChart` からの独立レンダリング削除                                                           | ✅ `belowChartSlot` へ移設。`sections` から `section-cagr` を削除（8 → 7、`CpiChart.tsx:263-271`）                                                          |
| `.cagrSection` / `.cagrContainer` / `.cagrControls` / `.cagrNote` / `.cagrSheetControls` の削除 | ✅ `grep` で参照ゼロを確認。モバイル媒体クエリ内の上書きも併せて削除済み                                                                                    |
| `min-height: 44px` の維持                                                                       | ✅ `.calculateButton` / `.cagrLink` ともに 44px 維持。`mobile-ux.e2e.spec.ts:19` の例外リストを**緩めずに**コンパクト化を達成（プランの最重要制約）         |
| 手順 7（シート開閉時のスクロール調整）                                                          | ✅ 未実施。手順 6 の実測でグラフが十分見えているため、プランの推奨どおり見送りが妥当                                                                        |
| spec.md（R18 全面改訂 / R10 eight→seven / Component Tree）                                      | ✅ 反映済み                                                                                                                                                 |

## コンセプト成立の実測（★プランの合否判定）

一時 Playwright スペックで production ビルドを計測し、スクリーンショットで目視確認した
（確認後にスペックは削除済み）。

| ビューポート               | シート高さ | グラフ可視高さ | 判定                   |
| -------------------------- | ---------- | -------------- | ---------------------- |
| 375×667（結果なし）        | 270px      | **175px**      | ✅ 閾値 120px を上回る |
| 375×667（結果あり）        | 300px      | **145px**      | ✅ 閾値 120px を上回る |
| 390×844（結果あり）        | 361px      | **221px**      | ✅                     |
| 667×375 横向き（結果あり） | 169px      | **165px**      | ✅（ただし L-2 参照）  |

375×667 のスクリーンショットでは、**上部に積み上げグラフの上半分（凡例 + プロット領域）が見え、
下部にシートが載る**状態を目視で確認した。**コンセプトは成立している。**

これにより `shared_plan/12` から 3 回連続で残っていた「実機幅での `position: fixed` 表示位置の
目視確認」も、デバイスエミュレーション上では**解消**とみなせる。

---

## L-1【要対応・中】375×667 で結果表示時にシート内コンテンツが 61px あふれる

### 症状（実測）

375×667 で計算結果を表示すると、シートの `scrollHeight`（360px）が
`clientHeight`（299px）を **61px 超過**する。`.bottomSheet` は `overflow-y: auto` のため
クラッシュはしないが、**シート内を指でスクロールしないと下端の要素に到達できない。**

超過して隠れるのは DOM 末尾の 2 要素:

| 要素                                                     | 位置（ビューポート 667px 基準）          |
| -------------------------------------------------------- | ---------------------------------------- |
| `.cagrResult` の詳細行 `2015年01月 → 2026年01月`         | top 599 → **bottom 678**（11px 超過）    |
| `.cagrSheetNote` `※凡例で選択した費目の合計を基準に算出` | top 690 → **bottom 708**（完全に画面外） |

スクリーンショットでも、詳細行が画面最下端で切れているのが確認できる。
**「結果が出た瞬間に、その結果の前提（対象期間・算出基準）が読めなくなる」**という、
情報の優先順位が逆転した状態になっている。

390×844 では `hiddenPx: 0` で収まるため、**小さい縦画面（iPhone SE 相当）固有**の問題。

### なぜ既存テストで検知できなかったか

- **T-E2E-5** はグラフの可視高さだけを測っており、シート内部の収まりを見ていない。
- **T-E2E-2** は `.cagrResultValue`（`1.30%` の要素）の可視性のみを検証している。
  この要素は超過領域の手前にあるため可視で、**その下の詳細行と注記が切れていても pass する。**

### 変更プラン

`45dvh` を維持したままコンテンツを約 61px 削る。単独では足りないため組み合わせる。

1. **結果を 1 行化**（−約 24px）— `.cagrResult` を横並びにし、値と期間を同一行へ。

   ```css
   .cagrResult {
     flex-direction: row;
     align-items: baseline;
     justify-content: space-between;
     gap: 0.5rem;
   }
   ```

2. **余白の圧縮**（−約 28px）

   ```css
   .calculateButton {
     margin-top: 0.5rem;
   } /* 0.875rem から */
   .cagrResult {
     margin-top: 0.5rem;
     padding: 0.5rem 0.625rem;
   }
   .cagrSheetNote {
     margin-top: 0.5rem;
   } /* 0.75rem から */
   .bottomSheetCompact {
     padding: 0.875rem 1rem 0.875rem;
   } /* 下 1.25rem から */
   ```

3. **`.cagrResultValue` を `1.25rem` へ**（−約 6px）

合計で約 58px 削減。なお残差が出る場合は 4 として
**`.cagrSheetNote` をシートヘッダー直下（select 行の上）へ移す**。
注記は「これから何を計算するか」の説明なので、位置的にもむしろ自然になり、
かつ DOM 末尾から外れるため切れなくなる。

> **⚠️ `max-height` を上げる解法は避ける。** `45dvh → 50dvh` にすると 375×667 での
> グラフ可視高さが 145px → 111px となり、**T-E2E-5 の閾値 120px を下回る**。
> コンセプトとのトレードオフになるため、コンテンツ側を削るのが正しい。

### テスト追加

**T-E2E-7**: 375×667 で結果表示時、シートが内部スクロールを要しないこと。

```ts
const overflow = await page.evaluate(() => {
  const sheet = document.querySelector<HTMLElement>(
    "[class*='bottomSheet']:not([class*='Backdrop']):not([class*='Header']):not([class*='Title']):not([class*='Close'])",
  )!;
  return sheet.scrollHeight - sheet.clientHeight;
});
expect(overflow, `シート内で ${overflow}px がスクロールしないと見えない`).toBeLessThanOrEqual(0);
```

**T-E2E-8**: `.cagrResultDetail` と `.cagrSheetNote` の `bottom` が
ビューポート内かつシート内に収まること（L-1 の直接的な回帰検知）。

---

## L-2【要対応・高】横向き（667×375）でシート内の 192px が隠れ、結果の詳細行が切れる

### 症状（実測）

667×375 の横向きでは `.bottomSheetCompact` の `45dvh` が **169px** にしかならず、
361px のコンテンツに対して **192px（過半）が隠れる**。
`.cagrResultDetail` は `detailFullyVisible: false`（＝クリップ）と計測された。

**これはプランのリスク表で挙げた項目そのものであり、対応が実装されていない。**
プラン該当行:

> `max-height: 45dvh` がランドスケープで窮屈になる →
> `@media (orientation: landscape) and (max-height: 500px)` は `.chartWrapper` を
> `85svh` にしている（`:326-330`）。同条件で `.bottomSheetCompact` を `70dvh` へ緩める指定を検討

`grep -n "orientation: landscape"` の結果は `CpiChart.module.css:326` の 1 件のみで、
`.bottomSheetCompact` 向けの指定は存在しない。

### 変更プラン

プランに記載済みの案をそのまま実装する。既存の landscape ブロック（`:326-330`）に追記するか、
同条件のブロックを新設する。

```css
@media (orientation: landscape) and (max-height: 500px) {
  .bottomSheetCompact {
    max-height: 70dvh;
  }
}
```

`70dvh` = 262px。L-1 の対応でコンテンツを約 300px に圧縮できれば残りは約 38px となり、
横向きでは内部スクロール前提を許容する判断もあり得る。**L-1 を先に実施し、
その後の実測値を見て `70dvh` / `80dvh` を決めるのが確実。**
横向きではグラフ側も `85svh`（319px）と大きいため、シートを 262px まで許しても
グラフの一部は残る（実測で確認すること）。

### テスト追加

**T-E2E-9**: 667×375 で結果表示時、`.cagrResultDetail` がビューポート内に収まること。

---

## L-3【低優先・軽微】`.cagrResultLabel` が死んだ CSS として残っている

`CagrPanel.tsx` は `.cagrResultLabel` の要素（`<p>年率上昇率（CAGR）:</p>`）を
レンダリングしなくなったが、CSS には `.cagrResultLabel { display: none }`
（`CpiChart.module.css:456-458`）が残っている。`grep -rn "cagrResultLabel" src/ tests/` の
ヒットはこの CSS 定義 1 件のみ。

**変更プラン**: ルールごと削除する。`display: none` で無効化するのではなく、
参照が無いなら定義も消すのが正しい（他の削除済みクラスと扱いを揃える）。

**影響範囲**: `src/app/components/CpiChart.module.css` のみ。

---

## 未確定事項への回答（実測を踏まえて）

1. **トリガーの文言** — 実装は機能名のみ（`年率上昇率（CAGR）を計算 ▾`）を採用。
   `aria-label` に現在値を含めており（`CagrPanel.tsx:48`）、A-2 の趣旨は満たしている。
   グラフ直下でデータテーブルリンクと並ぶ位置では機能名の方が読みやすく、**現状で妥当**。
2. **手順 7（スクロール調整）** — 実測でグラフ可視高さ 145〜221px を確保できているため
   **不要**。WebKit の `scrollIntoView` 相殺リスクを負う理由がない。
3. **「CPI年率」タブ** — 削除で確定。T-E2E-6 が回帰を押さえている。

---

## 対応順序

1. **L-2**（横向きの `max-height` 緩和）— プランで予告済みの未実装項目。影響が最も大きい
2. **L-1**（375×667 のコンテンツ 61px 削減）— 1 行化 + 余白圧縮 + 必要なら注記の位置変更
3. **T-E2E-7 / T-E2E-8 / T-E2E-9** の追加 — L-1 / L-2 の回帰検知。
   既存の T-E2E-2 / T-E2E-5 は**シート内部の収まりを検証していない**ため必須
4. **L-3**（死んだ CSS の削除）
5. spec.md の R18c に「シート内コンテンツが内部スクロールなしで収まること」を追記するか判断

---

# L-1〜L-3 対応の検証結果（2026-08-17 / 対象コミット `9cbe1eb`）

## 総合判定

**L-1 と L-3 は解消。L-2 は「修正コードは書かれているが CSS カスケードにより一切効いていない」。**

さらに **L-2 の回帰テスト T-E2E-9 は、バグが残っている状態でこそ pass する恒真アサーション**に
なっており、この不具合を検知できない（M-1）。

## 検証ゲート

| ゲート                  | 結果                                                |
| ----------------------- | --------------------------------------------------- |
| `pnpm type-check`       | ✅ エラー 0                                         |
| `pnpm lint`             | ✅ エラー 0 / 警告 5（既存分のみ）                  |
| `pnpm test`             | ✅ **252 テスト全 pass**                            |
| `pnpm build`            | ✅ 成功                                             |
| `pnpm test:e2e`（全体） | ✅ **90 passed / 22 skipped / 0 failed**（87 → +3） |

**ただし全 pass は品質の証明にならない。** 下記のとおり T-E2E-9 は不具合を通してしまう。

## L-1: ✅ 解消（実測で確認）

| ビューポート | 変更前                               | 変更後                                                                             |
| ------------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| 375×667      | `hiddenPx: 61`、詳細行・注記が切れる | **`hiddenPx: 0`**、値/詳細行/注記すべて `inViewport: true` かつ `inSheet: true` ✅ |
| 390×844      | `hiddenPx: 0`                        | `hiddenPx: 0` ✅                                                                   |

グラフ可視高さは 375×667 で 145px → **150px** とむしろ改善。閾値 120px を維持。
1 行化・余白圧縮・フォント縮小の組み合わせは**プランどおりに機能している。**

## L-3: ✅ 解消

`grep -rn "cagrResultLabel" src/ tests/` の結果ゼロ。`display: none` での無効化ではなく
ルールごと削除されており、他の削除済みクラスと扱いが揃っている。

---

## L-2: ❌ **未解消**（CSS カスケード順による無効化）

### 症状（実測）

`9cbe1eb` 適用後も横向きの数値がまったく変わっていない。

| ビューポート | シート高さ | 隠れる量 | 結果の値・詳細行・注記        |
| ------------ | ---------- | -------- | ----------------------------- |
| 667×375      | **169px**  | 126px    | すべて `inViewport: false` ❌ |
| 844×390      | **176px**  | 86px     | すべて `inViewport: false` ❌ |

169px は `375 × 0.45 = 168.75` すなわち **`45dvh` のまま**。
`70dvh` なら 262px になるはずだが、そうなっていない。

### 原因: 後方の同一詳細度ルールに負けている

```
CpiChart.module.css:330   @media (orientation: landscape) and (max-height: 500px) 内
                          .bottomSheetCompact { max-height: 70dvh; }
CpiChart.module.css:671   .bottomSheetCompact { max-height: 45dvh; }   ← こちらが後
```

**メディアクエリは詳細度を上げない。** 両者とも `(0,1,0)` で並ぶため、
ソース順で後にある `:671` の `45dvh` が常に勝つ。追加した `70dvh` は死んだ宣言になっている。

### A/B 実測による証明

同一の宣言をファイル末尾（`.bottomSheetCompact` の基底定義より後ろ）へ移して再ビルドしたところ、
数値が明確に変化した:

| ビューポート | 現状（`:330` に配置）          | 基底定義より後ろへ移動                               |
| ------------ | ------------------------------ | ---------------------------------------------------- |
| 667×375      | 169px / 隠れ 126px / 詳細行 ❌ | **263px / 隠れ 32px / 詳細行 `inViewport: true` ✅** |
| 844×390      | 176px / 隠れ 86px / 詳細行 ❌  | **262px / 隠れ 0px / すべて表示 ✅**                 |

> 検証後、`CpiChart.module.css` は元に戻し再ビルド済み。作業ツリーは変更なし。

### 変更プラン

**`:326-332` の landscape ブロックから `.bottomSheetCompact` の指定を取り除き、
`.bottomSheetCompact` の基底定義（`:671-677`）の直後に landscape ブロックを新設する。**

```css
/* コンパクト版ボトムシート: 上部のグラフを見せるため高さと余白を詰める */
.bottomSheetCompact {
  max-height: 45dvh;
  padding: 0.75rem 1rem 0.625rem;
}
.bottomSheetCompact .bottomSheetHeader {
  margin-bottom: 0.375rem;
}

/* 横向きは縦の余裕が無いため上限を緩める（基底定義より後ろに置くこと。
   メディアクエリは詳細度を上げないため、先に書くと 45dvh に負ける） */
@media (orientation: landscape) and (max-height: 500px) {
  .bottomSheetCompact {
    max-height: 70dvh;
  }
}
```

コメントで「基底定義より後ろに置く」理由を明記し、将来の並べ替えで再発しないようにする。

**影響範囲**: `src/app/components/CpiChart.module.css` のみ。

---

## M-1【要対応・高】T-E2E-9 が L-2 を検知できない（恒真アサーション）

### 問題

```ts
// tests/e2e/cagr-sheet.e2e.spec.ts:204-230
expect(
  sheetHeight,
  `横向きでシート高さ ${sheetHeight}px が 70dvh（≈263px）を超過`,
).toBeLessThanOrEqual(263);
```

L-2 の症状は「**シートが小さすぎて中身が入りきらない**」だが、このテストは
「**シートが大きすぎないこと**」を検証している。方向が逆である。

- バグが残っている状態: `sheetHeight = 169` → `169 ≤ 263` で **pass**
- 修正された状態: `sheetHeight = 263` → `263 ≤ 263` で **pass**

**どちらでも pass するため、回帰検知の役割をまったく果たしていない。**
実際、L-2 が 1 mm も直っていない現在の実装で T-E2E-9 は緑になっている。

加えて、`max-height: 70dvh` を指定している以上 `sheetHeight ≤ 263` は CSS が保証しており、
このアサーションは**構造的に失敗し得ない**。

なお、テストファイル冒頭のコメント（`:14`）は

> T-E2E-9: 667x375 横向きで**結果の詳細行がビューポート内に収まる**（L-2 回帰）

と書かれており、**コメントと実装が食い違っている**。プランで指定した内容もコメント側である。

### 変更プラン

プランどおり、症状そのもの（詳細行の可視性）をアサートする。

```ts
const detail = await page.evaluate(() => {
  const el = document.querySelector<HTMLElement>("[class*='cagrResultDetail']")!;
  const r = el.getBoundingClientRect();
  return { bottom: r.bottom, inViewport: r.bottom <= window.innerHeight + 1 };
});
expect(detail.inViewport, `横向きで cagrResultDetail の下端 ${detail.bottom}px が画面外`).toBe(
  true,
);
```

**このアサーションは現在の実装で必ず fail する**（実測 `bottom: 418` > 375）ことを確認済みなので、
L-2 の修正と同時に赤 → 緑へ変わることを確認できる。**先にテストを直して赤を確認してから
CSS を直す**（`bugfix-tdd` の手順）と確実。

---

## M-2【判断が必要】L-2 修正後も横向きには残るトレードオフ

カスケードを直して `70dvh` を効かせても、**667×375 では 32px が依然としてシート内スクロールを要する**
（注記 `※凡例で選択した費目の合計を基準に算出` の下端が 398px で画面外）。
また **グラフ可視高さが 165px → 113px へ低下**し、縦向きで採用した閾値 120px を下回る。

375px という高さでは「295px のシート」と「意味のあるグラフ表示」は物理的に両立しない。
選択肢:

- **(a) 現実的な妥協（推奨）** — `70dvh` を適用し、横向きでは注記 1 行分（32px）の内部スクロールを
  許容する。値と詳細行という**最重要情報は画面内に入る**（実測済み）。
  T-E2E-9 は「詳細行が可視」までを保証し、注記は対象外とする。
- **(b) 注記を結果より上へ移動** — `.cagrSheetNote` を select 行の直上へ移すと、
  横向きでも DOM 末尾が結果カードになり、スクロールなしで最重要情報が収まる可能性がある。
  縦向きの見た目にも影響するため、実測して判断する。
- **(c) 横向き専用レイアウト** — シートを右半分のサイドシートにする等。効果は大きいが
  `BottomSheet` の構造変更を伴い、本プランのスコープを超える。

**推奨は (a)。** ただし T-E2E-5（グラフ可視高さ 120px）の閾値は縦向き専用である旨を
テストのコメントに明記し、横向きに同じ基準を適用しないことを明確にする。

---

## 対応順序（今回分）

1. **M-1**（T-E2E-9 を症状ベースへ修正）— **先にテストを直して赤を確認する**
2. **L-2**（landscape ブロックを基底定義の後ろへ移動）— 1 で赤にしたテストが緑になることを確認
3. **M-2**（横向きの妥協点を (a) で確定し、T-E2E-5 のコメントに縦向き専用である旨を追記）
4. spec.md の R18c に「シート内コンテンツが内部スクロールなしで収まること（縦向き）」を追記

**検証時の注意**: `pnpm test:e2e` は `.next` を再ビルドしない。
CSS を触ったら必ず `pnpm build && pnpm test:e2e` の順で実行する。
