# 実質消費の凡例をデフォルト非表示のアコーディオンとして追加するプラン

## 目的

消費支出（実質）セクション（`section-consumption-real`）に、**デフォルトで折りたたまれた
アコーディオン**として凡例を追加する。現状この凡例は完全に非表示で、
「凡例は『消費支出（名目）』と連動しています。」という案内文しか出ていない。

実質グラフだけを見ているユーザーは、**費目や四半期を切り替えるために名目セクションまで
スクロールで戻る必要がある**。アコーディオンにすれば、既定では邪魔にならず、
必要なときだけその場で開いて操作できる。

---

## 現状（コード確認済み）

| 対象               | 現状                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 実質チャートの呼出 | `CpiChart.tsx:621-651`。`<SpendingBarChart ... hideLegend linkedSectionId="section-consumption-nominal" />`                                    |
| 凡例の出し分け     | `SpendingBarChart.tsx:76-87`（`hideLegend` 時の案内文）と `:89-129`（通常の凡例）                                                              |
| 通常の凡例の構造   | `.legendContainer` > 「四半期」セクション（Q1〜Q4）+ 費目セクション（全選択解除 + 費目ボタン群）                                               |
| 案内文             | `凡例は「消費支出（名目）」と連動しています。`（`SpendingBarChart.tsx:76-87`）                                                                 |
| 既存アコーディオン | `DataTablesSection.tsx:28-33` がネイティブ `<details>` / `<summary>` を使用。CSS は `.chartDataTable summary`（`CpiChart.module.css:121-125`） |
| 凡例チップの規約   | `mobile-ux.e2e.spec.ts:16-17` — `.legendItem` のみ 32px 例外（他のボタンは 44px 必須）                                                         |

### ★ 最重要の設計制約: 実質の凡例は名目と「本当に」連動している

`CpiChart.tsx:227-259` の `handleLegendToggle` は、`keyPairs` から**名目キーと実質キーのペア**を
引き当て、`setNominalHiddenKeys` と `setRealHiddenKeys` の**両方**を更新する。
さらに以下も共有されている:

- `hiddenQuarters` / `handleQuarterLegendClick` — 四半期の表示状態はグローバル
- `onReset` — `createDualResetHandler` で名目・実質の両方をリセット

つまり**実質側の凡例から費目を消すと、名目グラフからも同時に消える**。
これは今回のアコーディオンで凡例を露出させたときに、ユーザーが最も驚くポイントである。

→ **案内文（連動しています）は撤去せず、アコーディオンの外に出したまま常時表示する。**
（後述「リスクと留意点」のとおり、既存 E2E もこの案内文リンクの可視性に依存している）

---

## 変更後の構成

```
消費支出（実質）セクション（section-consumption-real）
├── <h2>消費支出（実質）</h2> + ⓘ
├── <p class="chartNote">凡例は「消費支出（名目）」と連動しています。</p>   ← ★常時表示（据え置き）
├── ★ <details class="legendAccordion">                                    ← 新規・既定で閉
│     ├── <summary>凡例を表示（費目・四半期）</summary>
│     └── <div class="legendContainer">                                    ← 名目側と同一の中身
│           ├── 四半期セクション（Q1〜Q4）
│           └── 費目セクション（全選択解除 + 費目ボタン群）
│         </div>
│   </details>
├── .chartWrapper（棒グラフ）
└── <p class="chartNote"><a href="#data-table-...">データテーブルを表示 ▾</a></p>
```

---

## 対象ファイル

1. **`shared_plan/15-real-consumption-legend-accordion-plan.md`**（本プラン文書）
2. **`src/app/components/SpendingBarChart.tsx`** — `hideLegend` を `legendMode` へ置換し、アコーディオン分岐を追加
3. **`src/app/components/CpiChart.module.css`** — `.legendAccordion` / `.legendAccordion summary` を追加
4. **`src/app/components/CpiChart.tsx`** — 実質チャートの呼び出しを `legendMode="collapsible"` へ
5. **`tests/components/real-consumption-support-series.test.tsx`** — `hideLegend` を渡している 2 箇所を更新
6. **`tests/components/SpendingBarChart.test.tsx`**（新規） — アコーディオンの単体テスト
7. **`tests/e2e/real-consumption.e2e.spec.ts`** — アコーディオンの E2E を追加
8. **`openspec/specs/nextjstest/spec.md`** — R4 に連動凡例とアコーディオンのシナリオを追加

---

## 実装手順

### 1. `SpendingBarChart.tsx` — `hideLegend` を `legendMode` へ置換

現状は `hideLegend?: boolean` の 2 状態だが、今回「折りたたみ表示」が加わり **3 状態**になる。
`hideLegend` と `collapsibleLegend` の 2 つの boolean にすると無効な組み合わせ（両方 true）が
表現できてしまうため、**列挙型の 1 プロパティに統一する**。

```tsx
interface SpendingBarChartProps {
  // …既存 props は据え置き…
  /**
   * expanded    : 凡例を常時展開（名目チャート。既定）
   * collapsible : 案内文 + 既定で閉じたアコーディオン（実質チャート）
   */
  legendMode?: "expanded" | "collapsible";
  linkedSectionId?: string;
}
```

- `hideLegend` は**削除する**。`grep -rn "hideLegend" src/ tests/` が 0 件になることを確認する。
- 既定値は `legendMode = "expanded"`（現在の `hideLegend = false` と等価）。

#### 1-1. 凡例本体を関数へ切り出す

`:89-129` の `.legendContainer` ブロックをそのまま `renderLegend()` として括り出し、
`expanded` では直接、`collapsible` では `<details>` の中に置く。**中身は一切変更しない**
（四半期セクション・全選択解除・費目ボタン・`aria-pressed`・色の出し分けをそのまま維持）。

#### 1-2. `collapsible` の描画

```tsx
{
  legendMode === "collapsible" && (
    <>
      {/* 案内文はアコーディオンの外。既定で閉じていても連動の事実が見えるようにする */}
      <p className={styles.chartNote}>
        凡例は「
        <a
          href={`#${linkedSectionId}`}
          style={{ color: "var(--blue-500)", textDecoration: "underline" }}
        >
          消費支出（名目）
        </a>
        」と連動しています。
      </p>
      <details className={styles.legendAccordion}>
        <summary>凡例を表示（費目・四半期）</summary>
        {renderLegend()}
      </details>
    </>
  );
}
```

**ネイティブ `<details>` を使う理由**:

- `DataTablesSection.tsx:28-33` に**同じ идиом の先例がある**（新パターンを増やさない）。
- 開閉 state・`aria-expanded`・キーボード操作・スクリーンリーダー対応がブラウザ任せで済む。
  `useState` を足さないので `SpendingBarChart` は純粋な表示コンポーネントのまま。
- 閉じている間、中の凡例ボタンは**アクセシビリティツリーからもタブ順からも外れる**。
- `open` 属性を付けない = **デフォルト非表示**という要求をそのまま満たす。

### 2. `CpiChart.module.css` — `.legendAccordion` の追加

```css
/* 実質消費の凡例アコーディオン。DataTablesSection の <details> と同系統だが、
   グラフ直上に置くため余白を控えめにする */
.legendAccordion {
  margin-bottom: 1.5rem;
  border: 1px solid var(--card-border);
  border-radius: 0.375rem;
  background-color: var(--card-bg);
}

.legendAccordion summary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px; /* タップターゲット規約に合わせる（後述） */
  padding: 0 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--card-text);
  cursor: pointer;
}

.legendAccordion summary:focus-visible {
  outline: 2px solid var(--blue-500);
  outline-offset: 2px;
}

/* 中の .legendContainer は下線と下余白が二重になるので打ち消す */
.legendAccordion .legendContainer {
  margin-bottom: 0;
  border-bottom: none;
  padding: 0 0.75rem 1rem;
}
```

> `<summary>` は `role="button"` ではないため `mobile-ux.e2e.spec.ts:19` の 44px 検査には
> 引っかからない。それでも**リポジトリのタップターゲット方針に合わせて 44px を確保する**
> （検査されないから小さくてよい、とはしない）。
>
> `display: flex` を `<summary>` に当てると Chromium で開閉マーカー（▶）が消える。
> マーカーを残したい場合は `display: list-item` + `::marker` の調整が必要。
> **どちらにするかは「未確定事項 3」で判断する。**

### 3. `CpiChart.tsx` — 呼び出しの変更

`:647-648` の

```tsx
hideLegend;
linkedSectionId = "section-consumption-nominal";
```

を

```tsx
legendMode = "collapsible";
linkedSectionId = "section-consumption-nominal";
```

へ置換する。**名目側（`:592-618`）は無変更**（既定の `"expanded"` が適用される）。

### 4. 既存ユニットテストの追随

`tests/components/real-consumption-support-series.test.tsx:210` と `:267` が
`hideLegend` を渡しているため、`legendMode="collapsible"` へ置換する。
これらのテストは棒グラフのデータ・系列を検証しており、凡例の描画は本質ではないので
**アサーションの変更は不要**。

---

## テスト計画

> AGENTS.md の分離ルールに従い、テストの実装は `@fixer` に委譲し、実行・検証は Orchestrator が行う。

### 新規 `tests/components/SpendingBarChart.test.tsx`

| ID  | 内容                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- |
| U1  | `legendMode` 未指定（既定 `expanded`）で `<details>` が描画されず、凡例が直接表示される        |
| U2  | `legendMode="collapsible"` で `<details>` が描画され、**`open` 属性を持たない**（既定で閉）    |
| U3  | `legendMode="collapsible"` でも案内文リンク（`消費支出（名目）`）は `<details>` の**外**にある |
| U4  | `<details>` を開くと四半期ボタン（Q1〜Q4）と費目ボタンが操作可能になり、`onToggle` が呼ばれる  |
| U5  | `legendMode="collapsible"` の `<summary>` に `凡例` を含む文言が出る                           |

> U2 は「デフォルト非表示」という要求そのもの。`toHaveAttribute("open")` ではなく
> **`not.toHaveAttribute("open")`** を検証する点に注意（jsdom では `details.open === false`）。

### 追加 `tests/e2e/real-consumption.e2e.spec.ts`

| ID       | 内容                                                                                         |
| -------- | -------------------------------------------------------------------------------------------- |
| T-E2E-A1 | 初期表示で実質セクションの凡例ボタンが**見えない**（アコーディオンが閉じている）             |
| T-E2E-A2 | `<summary>` をクリックすると凡例が現れ、費目ボタンが可視になる                               |
| T-E2E-A3 | **★連動の検証**: 実質側の凡例で費目を非表示にすると、**名目チャートの棒本数も減る**          |
| T-E2E-A4 | 案内文リンク「消費支出（名目）」はアコーディオンの開閉に関係なく常に可視（既存テストの補強） |

**T-E2E-A3 が最も価値が高い。** `handleLegendToggle` の名目/実質ペア連動は
**現在どの E2E でも検証されていない**（`spending-filter.e2e.spec.ts` は名目側のみを
`getByTestId(NOMINAL)` にスコープしている）。実質側の凡例を露出させる今回の変更は、
この連動が初めてユーザーの目に触れる機会になるため、テストで固定しておく価値がある。

`spending-filter.e2e.spec.ts` の棒本数カウント（`bars(page, NOMINAL)`）を流用できる。

### 回帰確認（既存テスト）

| 対象                                       | 観点                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `real-consumption.e2e.spec.ts:111-135`     | **最重要**。案内文リンクの `isVisible` に依存。アコーディオン内に入れると落ちる → 外に出す設計で回避          |
| `real-consumption.e2e.spec.ts:141-160`     | `page.locator("[aria-pressed]").first()` が**セクション未スコープ**。DOM 順で積み上げ凡例が先頭のままか要確認 |
| `spending-filter.e2e.spec.ts`              | `getByTestId(NOMINAL)` にスコープ済みで影響なしの見込み。`nth(4)` のインデックスが動かないこと                |
| `legend-color-sync.e2e.spec.ts`            | `#section-stacked` / `#section-consumption-nominal` にスコープ済み。影響なしの見込み                          |
| `mobile-ux.e2e.spec.ts:19`                 | 閉じた `<details>` 内のボタンは不可視なので 44px 検査の対象外。`<summary>` も `role=button` ではない          |
| `mobile-ux.e2e.spec.ts:47`                 | 375px 横はみ出し。凡例が増えるので要確認                                                                      |
| `real-consumption-support-series.test.tsx` | `hideLegend` → `legendMode` の置換漏れがないこと                                                              |

### 検証ゲート（Orchestrator 実行）

`pnpm type-check` → `pnpm lint`（**警告 5 件から増えないこと**）→ `pnpm test`
→ **`pnpm build`** → `pnpm test:e2e`

> `pnpm test:e2e` は `.next` を再ビルドしない。`src/` を触ったら必ず
> `pnpm build && pnpm test:e2e` の順で実行する（`shared_plan/13` の L-2 で実際に踏んだ罠）。

### 目視確認

375×667 の light / dark 両テーマで、閉じた状態と開いた状態のスクリーンショットを取得する。
特に**開いたときにグラフが画面外へ押し出されすぎないか**を確認する
（凡例は費目 + 四半期で 2 段になり、実測で 200px 前後になる見込み）。

---

## 仕様書更新（`openspec/specs/nextjstest/spec.md`）

**R4: Interactive Legend** に 2 つのシナリオを追加する。R4 は現在 R4a / R4b しかなく、
**名目・実質の凡例連動という既存の重要な挙動がそもそも未記載**なので、
このタイミングで併せて埋める。

```md
#### Scenario R4c: Linked Nominal / Real Legends

- **WHEN** the user toggles a category in either the 消費支出（名目）or 消費支出（実質）legend
- **THEN** `handleLegendToggle` resolves the nominal/real key pair and hides the series in **both** charts
- **AND** the quarter filter (`hiddenQuarters`) and 全選択解除 are likewise shared by both charts

#### Scenario R4d: Collapsed Legend Accordion (Real Consumption)

- **WHEN** the 消費支出（実質）section renders
- **THEN** its legend is placed in a native `<details>` accordion that is **closed by default**
- **AND** the "凡例は「消費支出（名目）」と連動しています" note stays visible outside the accordion
- **AND WHEN** the user opens the accordion
- **THEN** the same quarter and category controls as the nominal chart become operable
```

Component Tree の `SpendingBarChart` の説明にも `legendMode` を追記する。

---

## リスクと留意点

| リスク                                                        | 対応                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **案内文をアコーディオン内に入れると既存 E2E が落ちる**       | `real-consumption.e2e.spec.ts:121-126` は `getByRole("link", { name: "消費支出（名目）" })` の `toBeVisible()` に依存。閉じた `<details>` 内は不可視になり **確実に落ちる**。→ 案内文は**アコーディオンの外**に置く（本プランの設計） |
| **連動の挙動がユーザーを驚かせる**                            | 案内文を常時表示に保つ。加えて `<summary>` の文言に「費目・四半期」と明示して、何が操作対象かを事前に示す                                                                                                                             |
| `hideLegend` の置換漏れ                                       | `grep -rn "hideLegend" src/ tests/` が 0 件になることを確認してから完了とする（`src` 4 箇所・`tests` 2 箇所）                                                                                                                         |
| `real-consumption.e2e.spec.ts:147` の未スコープセレクタ       | `page.locator("[aria-pressed]").first()` は DOM 順に依存。実質セクションは積み上げ・名目より**後ろ**にあるため `.first()` は変わらない見込みだが、**実行して確認する**                                                                |
| `<summary>` に `display: flex` を当てると開閉マーカーが消える | マーカーの有無を「未確定事項 3」で判断。消す場合は `▾` などの明示的なアフォーダンスを文言側に持たせる                                                                                                                                 |
| 開いたときにグラフが押し下げられる                            | アコーディオンは**グラフの上**にある。開くと棒グラフが下へずれる。`scroll-margin-top` は効かないため、目視で許容範囲か確認する                                                                                                        |
| ダークテーマで `<details>` の枠が見えにくい                   | `--card-border` はダークで `#262626`。`.chartDataTable` と同じ扱いなので既存と一貫するが、目視で確認する                                                                                                                              |
| `legendMode` 追加で `SpendingBarChart` の分岐が増える         | 凡例本体は `renderLegend()` に一本化し、**中身の重複を作らない**。分岐は「どこに置くか」だけにする                                                                                                                                    |

---

## 未確定事項（実装前に判断が必要）

1. **`<summary>` の文言** — 本プランは `凡例を表示（費目・四半期）` を採用。
   開いている間は「表示」が実態と合わなくなるが、ネイティブ `<details>` では文言の出し分けに
   JS が要る。文言を状態非依存にするなら `凡例（費目・四半期）` の方が正確。
2. **四半期セクションも含めるか** — 本プランは**含める**（名目側と同じ中身にする）。
   四半期だけは常時表示という選択肢もあるが、`hiddenQuarters` はグローバル共有なので
   名目側で操作できれば足りると判断した。
3. **開閉マーカー（▶/▾）を残すか** — `display: flex` で消える。
   中央寄せを優先してマーカーを消し文言だけにするか、`display: list-item` でマーカーを残すか。
   **アコーディオンだと一目でわかる方が親切なので、マーカーを残す方を推奨。**
4. **`legendMode` に `"hidden"` を残すか** — 現状 `hideLegend` の用途は実質チャート 1 箇所のみで、
   完全非表示を使う場所は無くなる。本プランは **2 値（`expanded` / `collapsible`）**とし、
   将来必要になったら足す方針。

---

# 検証結果（2026-08-18 実施 / 対象コミット `0825ec0`）

## 総合判定: **プランどおり完了。機能面の不具合なし。**

指摘は `<summary>` の縦位置に関する **Q-1（CSS の無効プロパティ）** と、
文言に関する **Q-2（プランで既知としていたトレードオフの再確認）** の 2 件のみ。

## 検証ゲート

| ゲート                  | 結果                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| `pnpm type-check`       | ✅ エラー 0                                                         |
| `pnpm lint`             | ✅ エラー 0 / **警告 5**（既存分のみ・新規増加なし）                |
| `pnpm test`             | ✅ 32 ファイル / **259 テスト全 pass**（254 → U1〜U5 の +5）        |
| `pnpm build`            | ✅ 成功                                                             |
| `pnpm test:e2e`（全体） | ✅ **96 passed / 22 skipped / 0 failed**（92 → T-E2E-A1〜A4 の +4） |

## プラン記載事項との突合

| プラン項目                                               | 実装状況                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `hideLegend` → `legendMode` 置換（2 値）                 | ✅ `SpendingBarChart.tsx:36,57`。`grep -rn "hideLegend" src/ tests/` は**0 件**  |
| 凡例本体を `renderLegend()` へ切り出し（重複を作らない） | ✅ `SpendingBarChart.tsx:62-107`。分岐は「どこに置くか」だけ（`:123-142`）       |
| ネイティブ `<details>`・既定で閉                         | ✅ `SpendingBarChart.tsx:135-138`。実測で `details.open === false`               |
| 案内文をアコーディオンの**外**に置く                     | ✅ `:125-134`。既存 E2E `real-consumption.e2e.spec.ts:112` は**そのまま pass**   |
| `.legendAccordion` CSS の追加                            | ✅ `CpiChart.module.css:127-157`                                                 |
| `min-height: 44px`                                       | ✅ 実測 307×44px                                                                 |
| `CpiChart.tsx` の呼び出し変更（名目側は無変更）          | ✅ 実質のみ `legendMode="collapsible"`                                           |
| 既存ユニットテスト 2 箇所の追随                          | ✅ `real-consumption-support-series.test.tsx` の 2 箇所を置換                    |
| U1〜U5（新規ユニット）                                   | ✅ `tests/components/SpendingBarChart.test.tsx:60,83,108,136,170`                |
| T-E2E-A1〜A4（新規 E2E）                                 | ✅ `real-consumption.e2e.spec.ts:167,196,215,249`                                |
| spec.md R4c / R4d                                        | ✅ `spec.md:148-160`。**未記載だった名目/実質の連動（R4c）も併せて明文化された** |

### 未確定事項への回答（実装で確定した内容）

1. **`<summary>` の文言** — `凡例を表示（費目・四半期）` を採用（→ Q-2 参照）
2. **四半期セクションを含めるか** — 含める。開いた状態で「四半期（Q1〜Q4）」＋費目の 2 段構成を目視確認
3. **開閉マーカー** — **残った。** `display: list-item` を採用し `list-style-type: disclosure-closed`（閉）
   → `disclosure-open`（開）でマーカーが ▶ / ▼ と切り替わることを目視確認。プランの推奨どおり
4. **`legendMode` に `"hidden"` を残すか** — 残さず 2 値。プランどおり

## 実測・目視確認（375×667 / light・dark 両テーマ）

| 状態       | 実測                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| 閉（既定） | `details.open === false` / `summary` 307×44px / マーカー `disclosure-closed` |
| 開         | `details.open === true` / アコーディオン高さ **344px**                       |

スクリーンショットで確認した内容:

- 閉じた状態: 案内文 → アコーディオン（1 行）→ 棒グラフ の順で、**凡例は一切見えない**。要求どおり。
- 開いた状態: マーカーが ▼ に変わり、「四半期」+ 費目の凡例が名目チャートと同じ構成で現れる。
- dark テーマ: `--card-border: #262626` の枠が `--card-bg: #1a1a1a` の塗りとともに
  カードとして識別でき、**プランで懸念した「枠が見えにくい」問題は起きていない**。
- 開くとグラフが 344px 下へずれるが、アコーディオンはグラフの**上**にあるため想定内。

### 回帰確認（既存テスト）

| 対象                                                                | 結果                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `real-consumption.e2e.spec.ts:112`（案内文リンク）                  | ✅ pass。**案内文を外に出す設計により、プランで予告した破綻を回避できた** |
| `real-consumption.e2e.spec.ts:138`（未スコープの `[aria-pressed]`） | ✅ pass。DOM 順は変わっていない                                           |
| `spending-filter.e2e.spec.ts`                                       | ✅ pass（`nth(4)` のインデックスも不変）                                  |
| `legend-color-sync.e2e.spec.ts`（3 件）                             | ✅ pass。セクションスコープ済みで影響なし                                 |
| `mobile-ux.e2e.spec.ts:19`（44px）                                  | ✅ pass（chromium / mobile-pixel 双方）                                   |

### T-E2E-A3（連動の検証）について

プランで「最も価値が高い」とした連動テストが追加され pass している。
実質セクションのアコーディオンを開いて費目を非表示にすると、
**名目チャートの `.recharts-bar-rectangle` の本数が減る**ことを検証しており、
`handleLegendToggle` のペア連動を初めて E2E で固定できた。
アサーションは前後の実数比較（`after < before`）であり、恒真ではない。

---

## Q-1【要対応・低〜中】`<summary>` の中央寄せが効いておらず、テキストが上に寄っている

### 症状（実測）

`.legendAccordion summary`（`CpiChart.module.css:132-141`）は
`display: list-item` に対して `align-items: center` / `justify-content: center` を指定しているが、
**これらは flex / grid コンテナ専用のプロパティで、`list-item` では無効**。
`min-height: 44px` だけが効くため、44px の箱の中でテキストが上端に張り付く。

```
[P15b] {"summaryH":44,"textH":18,"gapAbove":2,"gapBelow":24}
```

**上 2px / 下 24px** と非対称で、スクリーンショットでもラベルの下に空白の帯が見える。

（`padding: 0 0.75rem` で上下パディングが 0 のため、`min-height` で増えた分がすべて下に付く。）

### 変更プラン

無効な 2 行を削除し、上下パディングで中央寄せを作る。

```css
.legendAccordion summary {
  display: list-item; /* マーカーを残すため維持 */
  min-height: 44px;
  padding: 0.75rem; /* 0 0.75rem から変更。上下 12px で 12+18+12=42 → min-height が 44 に補う */
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--card-text);
  cursor: pointer;
}
```

`align-items` / `justify-content` は**削除する**（`display: flex` に変えるとネイティブの
開閉マーカーが消えるため、`list-item` のまま padding で解決するのが正しい）。

なお `text-align: center` を足せば水平方向も中央に寄るが、マーカーが行頭に付く関係で
左寄せのままの方が自然。**水平位置は現状維持を推奨。**

**影響範囲**: `src/app/components/CpiChart.module.css` のみ。E2E / ユニットへの影響なし。

## Q-2【判断のみ・低】開いている間も `<summary>` が「凡例を表示」のまま

プランの「未確定事項 1」で挙げたトレードオフがそのまま残っている。
開いた状態のスクリーンショットでは、凡例を表示中にもかかわらず
`▼ 凡例を表示（費目・四半期）` と表示される。

ネイティブ `<details>` で文言を出し分けるには JS か CSS の細工が必要なため、
**状態非依存の文言に変えるのが最も簡潔**。

- 変更する場合: `凡例（費目・四半期）`
  - 併せて `real-consumption.e2e.spec.ts:180` の
    `toHaveText("凡例を表示（費目・四半期）")` と、ユニット U5 の文言検証を更新する。
- 変更しない場合: マーカー（▶/▼）が状態を示しているため実害は小さい。**現状維持でも可。**

---

## 対応順序

1. **Q-1**（`summary` の無効プロパティ削除 + padding 修正）— CSS のみ、1 箇所
2. **Q-2**（文言を変えるかの判断）— 変える場合は E2E 1 箇所 + ユニット 1 箇所も更新

**検証時の注意**: `pnpm test:e2e` は `.next` を再ビルドしない。
CSS を触ったら必ず `pnpm build && pnpm test:e2e` の順で実行する。
