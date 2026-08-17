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
