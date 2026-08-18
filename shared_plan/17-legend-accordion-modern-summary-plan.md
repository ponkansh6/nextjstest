# 実質消費「凡例を表示」ボタンをモダンな UI にするプラン

## 目的

消費支出（実質）の凡例アコーディオン（`shared_plan/15` で追加）の開閉トリガー
`<summary>` を、**素の `<details>` 見出しのまま**の状態から、
リポジトリで確立済みの「モダンなボタン」語彙に揃える。

あわせて `shared_plan/15` の検証で見つかった未対応事項 **Q-1（中央寄せが効いていない）** を
同じ変更の中で解消する。

---

## 現状（コード確認・実測済み）

`.legendAccordion summary`（`src/app/components/CpiChart.module.css`）:

```css
.legendAccordion summary {
  display: list-item;
  align-items: center; /* ← list-item では無効 */
  justify-content: center; /* ← list-item では無効 */
  min-height: 44px;
  padding: 0 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--card-text);
  cursor: pointer;
}
```

375×667 での実測値:

| 項目                 | 実測                                                         |
| -------------------- | ------------------------------------------------------------ |
| サイズ               | 307 × 44px（タップターゲットは確保済み）                     |
| マーカー             | ネイティブ（`list-style-type: disclosure-closed` / `-open`） |
| 文字色 / 背景        | `var(--card-text)` / 親の `var(--card-bg)`（**塗りなし**）   |
| **テキストの縦位置** | **上 2px / 下 24px**（＝上端に張り付き、下に空白の帯）       |

### 問題点

1. **Q-1（`shared_plan/15` 未対応）**: `align-items` / `justify-content` は
   flex / grid コンテナ専用で **`display: list-item` では無効**。
   `padding: 0 0.75rem` により上下パディングが 0 なので、`min-height: 44px` で
   増えた分がすべて下に付き、**上 2px / 下 24px という非対称**になっている。
2. **「押せるもの」に見えない**: 塗りも枠も無く、`var(--card-text)` の黒文字。
   同じ画面にある `.cagrLink`（トーナルピル）や `.sectionTab`（ピル）と比べて
   **操作要素としての手がかりが弱い**。
3. **開閉状態の表現がブラウザ既定のマーカー任せ**。小さく目立たない。
4. `shared_plan/15` の **Q-2** も未解決 — 開いている間も「凡例を**表示**」のまま。

---

## リポジトリで確立済みの「モダン」語彙（P14 の成果を再利用する）

`shared_plan/14` で **トーナルピル**を導入し、専用トークンを 3 テーマ分定義済み。

| トークン               | light     | dark                       |
| ---------------------- | --------- | -------------------------- |
| `--cta-tonal-bg`       | `#eff6ff` | `rgba(59, 130, 246, 0.15)` |
| `--cta-tonal-bg-hover` | `#dbeafe` | `rgba(59, 130, 246, 0.24)` |
| `--cta-tonal-text`     | `#1d4ed8` | `#93c5fd`                  |

**コントラスト比は P14 で実測済み（light 6.16:1 / dark 8.05:1、いずれも WCAG AA 超）。**
`.legendAccordion` の背景は `var(--card-bg)` で、P14 の計測時と**同じ下地**
（dark で `#1a1a1a` → 合成後 `rgb(31,42,59)`）なので、**そのまま流用すれば比は変わらない。**

→ **新しい配色トークンを増やす必要はない。** P14 の資産をそのまま使う。

---

## デザイン方針

**アコーディオンのヘッダー行**として、全幅のトーナルバー + 右端に回転シェブロン。

```
┌─────────────────────────────────────────┐  ← .legendAccordion（枠 + overflow:hidden）
│ 凡例を表示（費目・四半期）           ⌄ │  ← summary: トーナル地・全幅・44px
├─────────────────────────────────────────┤
│  （開いたときだけ）四半期 + 費目の凡例   │  ← .legendContainer（card-bg のまま）
└─────────────────────────────────────────┘
```

- 閉: トーナルのバーだけが見える → **一目で「押せる」とわかる**
- 開: シェブロンが 180° 回転して `⌃` になり、下に凡例が出る

**なぜ全幅バーで、`.cagrLink` のような中央寄せインラインピルにしないか**:
`.cagrLink` は「グラフの下に置かれた独立した CTA」だが、こちらは
**開閉する箱のヘッダー**である。箱の幅いっぱいに広がる方がアコーディオンとして自然で、
タップ領域も広くなる。**色とフォントは `.cagrLink` と揃え、形だけ役割に合わせる。**

---

## 対象ファイル

1. **`shared_plan/17-legend-accordion-modern-summary-plan.md`**（本プラン文書）
2. **`src/app/components/SpendingBarChart.tsx`** — `<summary>` にラベル要素とシェブロン SVG を追加
3. **`src/app/components/CpiChart.module.css`** — `.legendAccordion` / `.legendAccordion summary` を改訂、`.legendAccordionIcon` を新設
4. **`tests/components/SpendingBarChart.test.tsx`** — U6 / U7 を追加
5. **`tests/e2e/real-consumption.e2e.spec.ts`** — T-E2E-A5（シェブロン回転）を追加
6. **`tests/e2e/accessibility.e2e.spec.ts`** — T-A11Y-2（コントラスト）を追加
7. **`openspec/specs/nextjstest/spec.md`** — R4d に体裁を追記

---

## 実装手順

### 1. `SpendingBarChart.tsx` — `<summary>` の中身を構造化

```tsx
<details className={styles.legendAccordion}>
  <summary>
    <span>凡例を表示（費目・四半期）</span>
    <svg className={styles.legendAccordionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </summary>
  {renderLegend()}
</details>
```

- **ラベル文言は変更しない。** `real-consumption.e2e.spec.ts:181` が
  `toHaveText("凡例を表示（費目・四半期）")` と**完全一致で検証している**（`grep` で確認済み）。
  SVG は `textContent` に寄与しないため、アイコン追加だけなら**このテストは通り続ける**。
- シェブロンは `.cagrLink` と**同一のパス（`M4 6l4 4 4-4`）**を使う。P14 で導入した形と揃える。
- `aria-hidden="true"` を必ず付ける（`<summary>` のアクセシブル名を汚さない）。
- 開閉状態は `<details>` がネイティブに公開するため、
  **`aria-expanded` を手で付けてはいけない**（二重に伝わる）。

### 2. `CpiChart.module.css` — トーナルヘッダー化

```css
.legendAccordion {
  margin-bottom: 1.5rem;
  border: 1px solid var(--card-border);
  border-radius: 0.375rem;
  background-color: var(--card-bg);
  /* summary の角を親の border-radius で切り取る。
     details[open] ごとに summary 側の角丸を切り替える必要がなくなる */
  overflow: hidden;
}

.legendAccordion summary {
  display: flex; /* Q-1: これで align-items が実際に効く */
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0 0.875rem;
  background-color: var(--cta-tonal-bg);
  color: var(--cta-tonal-text);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;

  /* ネイティブマーカーを消す（自前シェブロンに置き換えるため） */
  list-style: none; /* Firefox / 標準 */
}
.legendAccordion summary::-webkit-details-marker {
  display: none; /* 旧 Safari */
}

@media (hover: hover) and (pointer: fine) {
  .legendAccordion summary:hover {
    background-color: var(--cta-tonal-bg-hover);
  }
}

.legendAccordion summary:active {
  background-color: var(--cta-tonal-bg-hover);
}

.legendAccordion summary:focus-visible {
  outline: 2px solid var(--blue-500);
  outline-offset: -2px; /* overflow:hidden で外側が切れるため内側に描く */
}

.legendAccordionIcon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.legendAccordion[open] .legendAccordionIcon {
  transform: rotate(180deg);
}
```

**設計上の判断**:

- **`display: flex` に変えることで Q-1 が解消する。** `align-items: center` が
  初めて実際に効き、44px の箱の中でテキストが縦中央に来る。
  「無効なプロパティを消す」のではなく「効く状態にする」形で直す。
- `justify-content: space-between` で **ラベル左・シェブロン右**。
  中央寄せ（現行 CSS の意図）ではなく左寄せにするのは、
  アコーディオンヘッダーとして一般的で、複数行に折り返したときも崩れないため。
- **`transform: rotate()` を使う点について**: P14 では
  「hover の `translateY` は reduced-motion で戻らないので増やさない」と判断した。
  ただし今回の回転は**装飾ではなく開閉状態の表示**であり、
  `prefers-reduced-motion` 下でも「回転済みの状態」が保たれる必要がある。
  グローバルリセット（`globals.css:205-214`）は `transition-duration` を潰すため、
  **アニメーションだけが無効化され、状態表示は残る**。これは正しい挙動。
- `outline-offset` を **負値**にする。親に `overflow: hidden` を入れるため、
  外向きのフォーカスリングが切り取られてしまうのを避ける。
- `min-height: 44px` は維持（タップターゲット規約）。

### 3. `.legendContainer` の余白調整

summary に塗りが付くことで、開いたときの境界が視覚的に立つ。
現行の `.legendAccordion .legendContainer { padding: 0 0.75rem 1rem }` に
**上パディングを足す**（`padding: 1rem 0.75rem`）と、ヘッダーと中身が詰まりすぎない。
実装後にスクリーンショットで確認して微調整する。

---

## テスト計画

> AGENTS.md の分離ルールに従い、テストの実装は `@fixer` に委譲し、実行・検証は Orchestrator が行う。

### 追加 `tests/components/SpendingBarChart.test.tsx`

| ID  | 内容                                                                                    |
| --- | --------------------------------------------------------------------------------------- |
| U6  | `<summary>` 内にシェブロン `<svg>` があり `aria-hidden="true"` を持つ                   |
| U7  | `<summary>` の `textContent` が `凡例を表示（費目・四半期）` のまま（SVG が混入しない） |

> U7 は既存 E2E の完全一致アサーションを**ユニット層でも守る**ための保険。

### 追加 `tests/e2e/real-consumption.e2e.spec.ts`

**T-E2E-A5**: シェブロンが開閉で回転する。

```ts
const icon = realSection.locator("summary svg");
const closed = await icon.evaluate((el) => getComputedStyle(el).transform);
await realSection.locator("summary").click();
const opened = await icon.evaluate((el) => getComputedStyle(el).transform);
expect(closed).not.toBe(opened); // 状態で見た目が変わる
expect(opened).toContain("matrix"); // rotate(180deg) は matrix(-1, ...) になる
```

> `transform` は computed 値が `matrix(...)` になる点に注意。
> `"rotate(180deg)"` という文字列比較はできない。

### 追加 `tests/e2e/accessibility.e2e.spec.ts`

**T-A11Y-2**: `<summary>` の文字色と背景色のコントラスト比が **4.5:1 以上**。

P14 で追加した **T-A11Y-1 のコントラスト計算ロジックをそのまま流用できる**
（半透明背景を不透明な祖先と合成する処理を含む）。
`chromium` / `chromium-dark` の両プロジェクトで走るため、1 本で両テーマを検証できる。

> **注意**: 計算ロジックを T-A11Y-1 からコピーせず、**共通ヘルパーに切り出して両方から使う**。
> 同じ 50 行が 2 箇所にあると、片方だけ直して食い違う。

### 回帰確認（既存テスト）

| 対象                                   | 観点                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `real-consumption.e2e.spec.ts:181`     | **最重要**。`toHaveText("凡例を表示（費目・四半期）")` の完全一致が崩れないこと                                      |
| `real-consumption.e2e.spec.ts:196-270` | T-E2E-A1〜A4（開閉・連動・案内文）が引き続き pass すること                                                           |
| `SpendingBarChart.test.tsx:170`（U5）  | `textContent` に `凡例` を含むこと                                                                                   |
| `mobile-ux.e2e.spec.ts:19`             | `<summary>` は `role=button` ではないので 44px 検査の対象外だが、**規約どおり 44px を維持しているか目視/実測で確認** |
| `mobile-ux.e2e.spec.ts:47`             | 375px 横はみ出しなし                                                                                                 |

### 検証ゲート（Orchestrator 実行）

`pnpm type-check` → `pnpm lint`（**警告 5 件から増えないこと**）→ `pnpm test`
→ **`pnpm build`** → `pnpm test:e2e`

> `pnpm test:e2e` は `.next` を再ビルドしない。CSS を触ったら必ず
> `pnpm build && pnpm test:e2e`（もしくは `pnpm test:e2e:fresh`）の順で実行する。

### 目視・実測確認

375×667 の light / dark 両テーマで、**閉じた状態と開いた状態**のスクリーンショットを取得し、
以下を確認する。

1. **Q-1 の解消**: `<summary>` テキストの上下余白が対称になっていること
   （現状は上 2px / 下 24px。実測して数値で確認する）
2. ネイティブマーカーが**消えていること**（`⌄` が二重に出ていない）
3. 開いたときにシェブロンが反転していること
4. dark テーマでトーナル地が沈みすぎず、かつ浮きすぎないこと

---

## 仕様書更新（`openspec/specs/nextjstest/spec.md`）

**Scenario R4d** に体裁を 1 行追記する。

```md
- **AND** the accordion header is a tonal bar (reusing the `--cta-tonal-*` tokens) with a
  chevron that rotates when opened, meeting WCAG AA contrast in both themes
```

---

## リスクと留意点

| リスク                                              | 対応                                                                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`toHaveText` の完全一致が壊れる**                 | ラベル文言は**変更しない**。SVG は `textContent` に寄与しないため安全。U7 でユニット層にも保険を掛ける                                                                                              |
| **ネイティブマーカーの消し漏れ**（エンジン差）      | `list-style: none` と `::-webkit-details-marker { display: none }` の**両方**を書く。`display: flex` だけでは Firefox でマーカーが残る                                                              |
| **Safari での見た目が検証されない**                 | `webkit-tabs-regression` プロジェクトは `section-tabs-scroll.e2e.spec.ts` のみを対象としており、**このアコーディオンは WebKit で自動検証されない**。マーカー消しは仕様に忠実に 3 通り書いて担保する |
| `overflow: hidden` でフォーカスリングが切れる       | `outline-offset` を負値にする。実装後に Tab でフォーカスして目視確認する                                                                                                                            |
| `transform` が reduced-motion で残る                | **意図的**。回転は装飾ではなく開閉状態の表示なので残す必要がある。アニメーションのみグローバルリセットで無効化される                                                                                |
| コントラスト計算ロジックの二重管理                  | T-A11Y-1 からコピーせず**共通ヘルパーへ切り出す**。片方だけ修正して食い違う事故を防ぐ                                                                                                               |
| **44px タップターゲットを下げてしまう**             | `min-height: 44px` は維持。`shared_plan/13` 以来「規約を黙って緩めない」方針を継続する                                                                                                              |
| `.chartDataTable` の `<details>` と見た目が食い違う | データテーブル側は素の `<summary>` のまま残る。**今回のスコープ外**（未確定事項 2 で判断）                                                                                                          |

---

## 未確定事項（実装前に判断が必要）

1. **ラベル文言（`shared_plan/15` の Q-2）** — 本プランは
   `凡例を表示（費目・四半期）` を**維持**する前提で書いている。
   シェブロンが状態を示すようになるため、状態非依存の `凡例（費目・四半期）` に
   変える合理性は上がる。**変える場合は `real-consumption.e2e.spec.ts:181` の
   完全一致アサーションと U5 も同時に更新すること。**
2. **`.chartDataTable` の `<details>` も同じ体裁にするか** — 本プランは**対象外**。
   データテーブルは「補助情報の格納庫」であり、凡例ほど操作頻度が高くない。
   統一するなら別プランで `.accordion` として共通化するのが筋。
3. **全幅バー vs 中央寄せピル** — 本プランは**全幅バー**を採用。
   `.cagrLink` と完全に同じ見た目（中央寄せピル）にする案もあるが、
   開閉する箱のヘッダーとしては全幅の方が自然でタップ領域も広い。
4. **閉じているときだけ枠線を出すか** — 現行は `.legendAccordion` に常時 `1px` 枠。
   summary に塗りが付くと閉状態では枠がほぼ不要になる。
   実装後のスクリーンショットを見て、二重に見えるようなら枠を外す判断をする。
