# CAGR ポップアップリンクをモダンなボタンにするプラン

## 目的

費目別寄与度グラフ直下の CAGR ポップアップトリガー（`.cagrLink`）を、
**下線付きテキストリンク**から**モダンなボタン**へ変更する。

## 現状（実測・スクリーンショット確認済み）

375×667 で計測した現在の `.cagrLink`:

| 項目             | 値                                                   |
| ---------------- | ---------------------------------------------------- |
| 見た目           | 青の下線付きテキスト `年率上昇率（CAGR）を計算 ▾`    |
| `background`     | `rgba(0, 0, 0, 0)`（透明）                           |
| `border`         | `0px none`                                           |
| `border-radius`  | `0px`                                                |
| `color`          | light `#3b82f6` / dark `#60a5fa`（`--blue-500`）     |
| `font-size`      | 13.6px（親 `.chartNote` の clamp を継承）            |
| 実寸             | 212 × 44px（タップターゲットは確保済み）             |
| **親の opacity** | **`0.8`**（`.chartNote`、`CpiChart.module.css:357`） |

**問題点**:

1. すぐ下の「データテーブルを表示 ▾」も同じ青リンクで、**視覚的な重みが同一**。
   CAGR は「開いて操作する主機能」なのに、副次的なアンカーと区別がつかない。
2. 親 `.chartNote` の `opacity: 0.8` を継承しており、**全体が薄い**。
   ボタン化してもこの親のままでは塗りが濁り、コントラストも目減りする。
3. `border-radius: 0` / 塗りなしで、リポジトリ内の他の操作要素と作りが違う。

## リポジトリ既存の「ボタンらしさ」の語彙（合わせるべき対象）

| クラス                             | 形                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `.sectionTab`                      | `border-radius: 9999px` / `min-height: 44px` / `1px solid var(--card-border)` / `background: var(--card-bg)` |
| `.sectionTab[aria-current="true"]` | `background: var(--blue-500)` / 白文字（**塗りつぶしピル**）                                                 |
| `.sectionRange`                    | 同じピル。`inline-flex` + `align-items: center`                                                              |
| `.themeToggleButton`               | 同じピル（44×44 の円）                                                                                       |
| `.calculateButton`                 | `border-radius: 0.375rem` の塗りつぶし。hover で `translateY(-1px)` + `box-shadow`                           |

**すでにピル型（`9999px`）が UI 全体の語彙**になっている。新しい形を発明せず、この系統に乗せるのが
「モダン」かつ一貫する最短路。

---

## デザイン案（案 C を推奨）

| 案      | 見た目                                               | 長所                                                             | 短所                                                           |
| ------- | ---------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| **A**   | 塗りつぶしピル（`--blue-500` 地 / 白文字）           | 最も目立つ。アクティブタブと同じ語彙                             | シート内の「計算する」（同じ塗り）と競合。グラフ直下で強すぎる |
| **B**   | アウトラインピル（`--card-bg` 地 / 枠線）            | `.sectionTab` と完全に同一で最も無難                             | 上部のタブ群と見分けがつかず、CTA として弱い                   |
| **C ★** | **トーナルピル**（薄い青地 / 濃い青文字 / 枠線なし） | テキストリンクより明確に強く、「計算する」より弱い。階層が正しい | 配色トークンの追加が必要（後述 §2）                            |

**推奨は案 C（トーナル）。** 理由:

- 「データテーブルを表示」（ただのテキスト） < **CAGR トリガー（トーナル）** < 「計算する」（塗りつぶし）
  という**3 段階の視覚的階層**が素直に作れる。
- 上部のタブ群（アウトラインピル）とも役割が被らない。
- Material 3 の tonal button / iOS の tinted button に相当する、現代的で一般的な形。

---

## 対象ファイル

1. **`shared_plan/14-cagr-link-modern-button-plan.md`**（本プラン文書）
2. **`src/app/globals.css`** — トーナル用のテーマ対応トークンを **3 箇所**に追加（§2 参照）
3. **`src/app/components/CpiChart.module.css`** — `.cagrLinkRow` 新設、`.cagrLink` を全面改訂
4. **`src/app/components/CagrPanel.tsx`** — ラッパーを `.chartNote` から `.cagrLinkRow` へ、`▾` を インライン SVG へ
5. **`tests/e2e/accessibility.e2e.spec.ts`** — コントラスト比の回帰テストを追加
6. **`tests/components/CagrPanel.test.tsx`** — アイコンの `aria-hidden` とラベル維持のテストを追加
7. **`openspec/specs/nextjstest/spec.md`** — R18a にトリガーの体裁を追記

---

## 実装手順

### 1. `CagrPanel.tsx` — ラッパーの差し替えとアイコン化

```tsx
<p className={styles.cagrLinkRow}>
  <button
    type="button"
    className={styles.cagrLink}
    onClick={() => setSheetOpen(true)}
    aria-label={`年率上昇率（CAGR）を計算（現在: ${cagrStartYear}年${mm}月から${cagrEndYear}年${mm}月）`}
  >
    年率上昇率（CAGR）を計算
    <svg className={styles.cagrLinkIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
</p>
```

- **`aria-label` は一字も変えない。** E2E 7 箇所・ユニット 8 箇所が
  `getByRole("button", { name: /年率上昇率（CAGR）を計算/ })` に依存している（`grep` で確認済み）。
- **可視テキストも変えない。** `CagrPanel.test.tsx:44` が
  `trigger.textContent).toContain("年率上昇率（CAGR）を計算")` を検証している。
  SVG は `textContent` に寄与しないため安全。
- `▾`（U+25BE）をインライン SVG に置き換える。`ChartInfoButton.tsx:90-110` に
  インライン SVG の先例があり、`stroke="currentColor"` で色が自動追従する。
  グリフと違ってフォント依存の縦位置ズレが起きない点も利点。
- `aria-hidden="true"` を必ず付ける（`ChartInfoButton.tsx:96` と同じ）。

### 2. `globals.css` — テーマ対応トークンの追加

**既存トークンだけでは両テーマで WCAG AA（4.5:1）を満たせない。** 概算コントラスト比:

| 文字色       | light 地 `#eff6ff`        | dark 地 `rgba(59,130,246,.15)` over `#1a1a1a`（≒`#1f2a3b`） |
| ------------ | ------------------------- | ----------------------------------------------------------- |
| `--blue-500` | `#3b82f6` → **3.38:1 ❌** | `#60a5fa` → 5.71:1 ✅                                       |
| `--blue-600` | `#2563eb` → 4.75:1 ✅     | `#3b82f6` → **3.95:1 ❌**                                   |

`--blue-500` / `--blue-600` のどちらを使っても**片方のテーマで AA を割る**。
そのため専用トークンを追加する。

`globals.css` は**ダークの定義が 2 箇所**（`@media (prefers-color-scheme: dark)` 内の
`:root:not([data-theme="light"])` と `:root[data-theme="dark"]`）にあるため、
**合計 3 箇所すべてに追加すること**（片方だけだと OS 設定と手動切替で挙動が食い違う）。

```css
/* :root[data-theme="light"] に追加 */
--cta-tonal-bg: #eff6ff;
--cta-tonal-bg-hover: #dbeafe;
--cta-tonal-text: #1d4ed8; /* light 地で約 6.2:1 */

/* @media (prefers-color-scheme: dark) の :root:not([data-theme="light"]) と
   :root[data-theme="dark"] の両方に追加 */
--cta-tonal-bg: rgba(59, 130, 246, 0.15);
--cta-tonal-bg-hover: rgba(59, 130, 246, 0.24);
--cta-tonal-text: #93c5fd; /* dark 地で 5.7:1 以上 */
```

> 上記の比は概算。**実装後に §テスト計画の T-A11Y-1 で実測して確認する。**

### 3. `CpiChart.module.css` — `.cagrLinkRow` 新設と `.cagrLink` 改訂

#### 3-1. ラッパーを `.chartNote` から独立させる

`.chartNote` の `opacity: 0.8` を継承させないことが目的。塗りのあるボタンに親 opacity が
掛かると、色が濁るうえコントラスト比も実効的に低下する（§2 の計算が崩れる）。

```css
/* CAGR トリガーの行。.chartNote と違い opacity を掛けない
   （塗りのあるボタンに親 opacity を掛けるとコントラストが落ちるため） */
.cagrLinkRow {
  margin: 0.75rem 0 1.25rem;
  text-align: center;
}
```

#### 3-2. `.cagrLink` をトーナルピルへ

```css
.cagrLink {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 44px; /* mobile-ux の 44px 規約。絶対に下げない */
  padding: 0 1.125rem;
  border: none;
  border-radius: 9999px; /* .sectionTab / .sectionRange と同じピル */
  background-color: var(--cta-tonal-bg);
  color: var(--cta-tonal-text);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

@media (hover: hover) and (pointer: fine) {
  .cagrLink:hover {
    background-color: var(--cta-tonal-bg-hover);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  }
}

.cagrLink:active {
  background-color: var(--cta-tonal-bg-hover);
}

.cagrLink:focus-visible {
  outline: 2px solid var(--blue-500);
  outline-offset: 2px;
}

.cagrLinkIcon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}
```

**設計上の判断**:

- `font-size` は `.chartNote` 由来の `clamp(...)`（実測 13.6px）をやめ **`0.875rem` 固定**にする。
  `.sectionTab` / `.sectionRange` と同じ値で、ピル系の文字サイズが揃う。
- `text-decoration: underline` は**外す**。ボタンに下線が付いているとリンクと混同される。
- hover は `@media (hover: hover) and (pointer: fine)` で囲う。
  リポジトリ全体の規約（`.sectionTab` / `.maxRangeButton` / `.calculateButton` と同じ）。
- **`transform` は使わない。** `globals.css:193-201` の `prefers-reduced-motion` リセットは
  `animation-duration` / `transition-duration` / `scroll-behavior` を潰すが **`transform` は戻さない**。
  `.calculateButton` の `translateY(-1px)` は既存の負債であり、新規に増やさない。
  浮き上がりの表現は `box-shadow` だけで足りる。

---

## テスト計画

> AGENTS.md の分離ルールに従い、テストの実装は `@fixer` に委譲し、実行・検証は Orchestrator が行う。

### 追加 `tests/e2e/accessibility.e2e.spec.ts`

**T-A11Y-1（最重要）**: CAGR トリガーの文字色と背景色のコントラスト比が
light / dark 両テーマで **4.5:1 以上**であること。

`accessibility.e2e.spec.ts:52` に既存のコントラスト計算テスト
（`凡例のコントラスト比が WCAG AA 以上`）があるが **`describe.skip` で無効化されている**。
その計算ロジックを流用しつつ、**新規テストは skip しない** describe に置くこと。

```ts
// 背景が半透明（dark の rgba(59,130,246,.15)）のため、
// 親要素の背景と合成してから比を計算する必要がある点に注意
const ratio = await link.evaluate((el) => {
  /* 合成 → 相対輝度 → 比 */
});
expect(ratio).toBeGreaterThanOrEqual(4.5);
```

`chromium` と `chromium-dark` の両プロジェクトで走るため、1 本書けば両テーマを検証できる。

### 追加 `tests/components/CagrPanel.test.tsx`

- **T19**: トリガーの可視テキストが `年率上昇率（CAGR）を計算` のままであること（既存 T2 の補強）
- **T20**: アイコン `<svg>` が `aria-hidden="true"` を持ち、アクセシブル名に混入しないこと

### 回帰確認（既存テスト）

| 対象                                         | 観点                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `mobile-ux.e2e.spec.ts:19`                   | **最重要**。`min-height: 44px` を維持しているか。`padding` 変更で幅も要確認      |
| `mobile-ux.e2e.spec.ts:47`                   | 375px 横はみ出しなし（ボタンが横に伸びるため）                                   |
| `cagr-sheet.e2e.spec.ts`（7 箇所のセレクタ） | `getByRole("button", { name: /年率上昇率（CAGR）を計算/ })` が引き続き解決するか |
| `cagr-sheet.e2e.spec.ts:102` (T-E2E-5)       | ボタンの高さが変わるとグラフ可視高さ 120px の余裕が動く。**要再実測**            |
| `CagrPanel.test.tsx`（8 箇所のセレクタ）     | 同上                                                                             |

### 検証ゲート（Orchestrator 実行）

`pnpm type-check` → `pnpm lint`（**警告 5 件から増えないこと**）→ `pnpm test`
→ **`pnpm build`** → `pnpm test:e2e`

> `pnpm test:e2e` は `.next` を再ビルドしない。CSS を触ったら必ず
> `pnpm build && pnpm test:e2e` の順で実行する（`shared_plan/13` の L-2 で実際に踏んだ罠）。

### 目視確認

light / dark 両テーマで 375×667 のスクリーンショットを取得し、
**「データテーブルを表示」との視覚的な強弱がついているか**を確認する。
CSS 値の妥当性は自動テストでは判定できない。

---

## 仕様書更新（`openspec/specs/nextjstest/spec.md`）

**R18a: Entry Point** に体裁を追記する。

```md
#### Scenario R18a: Entry Point

- **WHEN** the user views the 費目別寄与度 chart
- **THEN** a tonal pill button appears between the chart and the "データテーブルを表示" link,
  visually stronger than that plain text link and weaker than the filled 計算する button
- **AND** its label and text contrast meet WCAG AA (4.5:1) in both light and dark themes
- **AND** no standalone CAGR section or `CPI年率` tab exists
```

`R8`（Accessibility）配下にコントラスト要件を置く案もあるが、
**R8 は既存シナリオが `:focus-visible` / キーボード / reduced-motion に限られている**ため、
このボタン固有の要件は R18a に置く方が追いやすい。

---

## リスクと留意点

| リスク                                                     | 対応                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **アクセシブル名が変わりテストが総崩れになる**             | `aria-label` と可視テキストは**一字も変えない**。変更するのは見た目と `▾` → SVG のみ。SVG は `textContent` に寄与しない            |
| **既存トークンでは AA を満たせない**（§2）                 | `--cta-tonal-*` を新設し、**light / dark(media) / dark(attr) の 3 箇所すべて**に定義する。1 箇所でも漏れるとテーマ切替で色が壊れる |
| 親 `.chartNote` の `opacity: 0.8` が残ったままになる       | `.cagrLinkRow` へ差し替える。ここを怠ると §2 のコントラスト計算が成立しない                                                        |
| ボタンが大きくなりグラフ可視高さ（T-E2E-5 の 120px）を圧迫 | 現状 44px を維持するので理屈上は不変だが、`.cagrLinkRow` の `margin` 変更で総高が動く。**T-E2E-5 の実測値を変更前後で比較する**    |
| dark の背景が半透明でコントラスト計算を誤る                | `rgba(59,130,246,0.15)` は下地との合成が必要。T-A11Y-1 では**合成後の色**で比を計算する                                            |
| `transform` の hover 演出を足して reduced-motion を壊す    | `transform` は使わず `box-shadow` のみ。グローバルリセットは `transform` を戻さない（`globals.css:193-201`）                       |
| 44px タップターゲット規約を下げてしまう                    | `min-height: 44px` は固定。`shared_plan/13` でも「規約を黙って緩めない」方針を貫いており、ここでも同じ                             |

---

## 未確定事項（実装前に判断が必要）

1. **案 A / B / C の選択** — 本プランは **案 C（トーナル）** を前提に書いている。
   案 A（塗りつぶし）にする場合、地は `--blue-500` ではなく **`--blue-600`** を使うこと。
   白文字 on `--blue-500` は約 **3.68:1** で AA を満たさない
   （`.calculateButton` と アクティブタブが既にこの状態にあるが、**本プランのスコープ外**）。
   `--blue-600`（`#2563eb`）なら約 5.17:1 で AA を満たす。
2. **ボタン内に現在の期間を出すか** — `年率上昇率（CAGR）を計算` の下に
   小さく `2005–2026` を添える 2 行ボタンにすると情報量が上がるが、高さが 44px → 約 56px に増え、
   T-E2E-5 のグラフ可視高さを削る。**現在値は `aria-label` とシート内で確認できる**ため、
   本プランでは**採用しない**。
3. **アイコンの向き** — ボトムシートは下から出るため `▾`（下向き）は直感に反するという見方もある。
   ただし「押すと下部に何か出る」を示すとも読めるため、**現行どおり下向き**を維持している。
   変えるなら「開く」を示す別の意匠（例: 上向きシェブロン）を検討する。

---

# 検証結果（2026-08-18 実施 / 対象コミット `eafd7d2`）

## 総合判定: **プランどおり完了。要修正事項なし。**

実装・テスト・仕様書のすべてがプランと一致し、全ゲートを通過。
実ブラウザでの配色実測と light / dark 両テーマの目視確認も完了した。
指摘は**コミットメッセージの数値誤り（P-1）**と**ダークでの hover 影（P-2）**の 2 件のみで、
いずれも実装の不具合ではない。

## 検証ゲート

| ゲート                  | 結果                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `pnpm type-check`       | ✅ エラー 0                                                                     |
| `pnpm lint`             | ✅ エラー 0 / **警告 5**（既存分のみ・新規増加なし）                            |
| `pnpm test`             | ✅ 31 ファイル / **254 テスト全 pass**（252 → T19/T20 の +2）                   |
| `pnpm build`            | ✅ 成功                                                                         |
| `pnpm test:e2e`（全体） | ✅ **92 passed / 22 skipped / 0 failed**（90 → T-A11Y-1 × 2 プロジェクトの +2） |

## プラン記載事項との突合

| プラン項目                                           | 実装状況                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 案 C（トーナルピル）の採用                           | ✅ `CpiChart.module.css:690-712`。`border-radius: 9999px` / `--cta-tonal-bg` 地 / `--cta-tonal-text` 文字                     |
| `--cta-tonal-*` を **3 箇所**に定義                  | ✅ `globals.css:49-51`（light）/ `:98-100`（`prefers-color-scheme: dark`）/ `:149-151`（`[data-theme="dark"]`）。**漏れなし** |
| `.cagrLinkRow` 新設（`.chartNote` から独立）         | ✅ `CpiChart.module.css:684-687`。実測で**親の `opacity` が `1`** になったことを確認（変更前は `0.8`）                        |
| `min-height: 44px` の維持                            | ✅ 実測 237×44px。`mobile-ux.e2e.spec.ts:19` も chromium / mobile-pixel 双方で pass                                           |
| `▾` → インライン SVG（`aria-hidden="true"`）         | ✅ `CagrPanel.tsx:49-58`。T20 で `aria-hidden` を検証                                                                         |
| `aria-label` / 可視テキストを変えない                | ✅ 一字も変更なし。E2E 7 箇所・ユニット 8 箇所のセレクタが全て解決（T19 が可視テキストを固定）                                |
| `transform` を使わない（reduced-motion 対策）        | ✅ hover は `background-color` + `box-shadow` のみ。`transform` の新規追加なし                                                |
| hover を `(hover: hover) and (pointer: fine)` で囲う | ✅ `CpiChart.module.css:698-703`                                                                                              |
| `text-decoration: underline` を外す                  | ✅ 削除済み                                                                                                                   |
| T-A11Y-1（コントラスト回帰テスト）                   | ✅ `accessibility.e2e.spec.ts:79-160`。**`describe.skip` ではない** describe に配置されている                                 |
| T19 / T20（ユニット）                                | ✅ `CagrPanel.test.tsx:120-133`                                                                                               |
| spec.md R18a の改訂                                  | ✅ プランの文面どおり反映                                                                                                     |

## 配色の実測（production ビルド）

プランの §2 は概算値だったため、実ブラウザで computed style を取得して検証した。

| テーマ | 文字色                         | 背景（生値）                   | 合成後の背景      | **コントラスト比** |
| ------ | ------------------------------ | ------------------------------ | ----------------- | ------------------ |
| light  | `rgb(29, 78, 216)` `#1d4ed8`   | `rgb(239, 246, 255)` `#eff6ff` | 同左（不透明）    | **6.16:1** ✅      |
| dark   | `rgb(147, 197, 253)` `#93c5fd` | `rgba(59, 130, 246, 0.15)`     | `rgb(31, 42, 59)` | **8.05:1** ✅      |

両テーマとも WCAG AA（4.5:1）を大きく上回る。プランの概算（light 約 6.2 / dark 5.7 以上）とも整合。

### T-A11Y-1 がダークのトークンを本当に測っているかの確認

`chromium-dark` プロジェクトは `colorScheme: "dark"` を与えるだけで `localStorage` を設定しない。
`layout.tsx:50` のインラインスクリプトは **`localStorage` に値が無ければ `data-theme` を付けない**ため、
`@media (prefers-color-scheme: dark)` 内の `:root:not([data-theme="light"])` が適用される。

実測で確認:

```
[V14b] {"dataThemeAttr":null,"color":"rgb(147, 197, 253)","bg":"rgba(59, 130, 246, 0.15)"}
```

`data-theme` 属性が無い状態でダークのトークンが効いており、
**T-A11Y-1 の `chromium-dark` 実行はダーク経路を正しく検証している。**

> 参考: T-A11Y-1 のコントラスト計算は半透明背景を不透明な祖先と合成しており、
> ロジックは妥当。`shared_plan/13` の T-E2E-9 のような恒真アサーションにはなっていない
> （トークンを AA 未満の色に変えれば失敗する）。

## 目視確認（プランのテスト計画に明記した項目）

375×667 で light / dark 両テーマのスクリーンショットを取得し確認した。

- **light**: 薄い青のピルに濃い青の太字 + シェブロン。直下の「データテーブルを表示 ▾」（素の青リンク）
  と比べて**明確に強く**見え、意図した階層になっている。
- **dark**: 半透明の青地に水色の文字。暗い背景から浮きすぎず、かつ十分に目立つ。
- 両テーマとも `border-radius: 9999px` のピルが上部タブ群と同じ語彙になっており、
  UI 全体として統一感がある。

**「モダンなボタンにする」という要求は達成されている。**

---

## P-1【軽微・要注意】コミットメッセージのコントラスト比が実測と食い違う

`eafd7d2` のコミットメッセージ 3 行目:

> - WCAG AA compliant contrast ratios (light ~11:1, dark ~8:1 on card bg)

**dark の ~8:1 は実測 8.05:1 と一致するが、light の ~11:1 は誤り。実測は 6.16:1。**
`#1d4ed8` on `#eff6ff` は数学的に 6.16:1 であり、11:1 にはならない
（11:1 に達するのは白地に近い背景の場合）。

AA / AAA（7:1）の判定に影響する数値なので、**「AAA を満たしている」と誤読される余地がある**
（light は AAA 7:1 に届いていない）。実害はないが、記録としては正しくない。

> **補足**: `shared_plan/13` の `92b8c9a` でも「Update spec.md」と書きながら spec.md を
> 変更していなかった。コミットメッセージの事実性が 2 回続けて崩れているため、
> **数値やファイル名を書く際は実測値・実際の変更ファイルと突き合わせる**運用にしたい。

**対応**: 過去のコミットメッセージは書き換えない（push 済みの履歴を壊さない）。
本文書に実測値を残すことで記録を正す。

## P-2【低優先・任意】ダークテーマで hover の影がほぼ見えない

`CpiChart.module.css:701` の `box-shadow: 0 1px 3px rgb(0 0 0 / 0.08)` は、
ダークの地色（`--card-bg: #1a1a1a`）に対して黒 8% の影であり**視認できない**。

ただし hover 時には `background-color` が `--cta-tonal-bg-hover`
（`rgba(59,130,246,0.24)`）へ変わるため**フィードバック自体は成立している**。
また hover は `(hover: hover) and (pointer: fine)` に限定されており、
主要ターゲットであるモバイルには影響しない。

**対応するなら**: 影をテーマ対応トークンにするか、ダークでは影の代わりに
`outline: 1px solid var(--blue-500)` 相当の縁取りを使う。
**必須ではない**ため、他の作業と合わせて対応するかは任意。

---

## 未確定事項への回答（実装を踏まえて）

1. **案 A / B / C の選択** — 案 C（トーナル）で確定。実測どおり階層が機能しており、
   案 A で懸念した「計算する」との競合も起きていない。
2. **ボタン内に現在の期間を出すか** — 採用せず。実測でボタン幅は 237px となり、
   375px 幅に対して既に十分な存在感がある。2 行化する必要はない。
3. **アイコンの向き** — 下向きシェブロンのまま。スクリーンショットで確認したところ、
   グリフ `▾` より線が細く軽快で、`▾` 時代より明らかに洗練されている。変更不要。

**本プランは完了。** 残件は P-2（任意）のみ。
