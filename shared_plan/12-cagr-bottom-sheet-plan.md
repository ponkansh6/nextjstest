# CAGR 設定（開始年・終了年・評価月）のボトムシート化プラン

## 目的

`CagrPanel` の「開始年 / 終了年 / 評価月」の 3 つの `<select>` を、パネル内にインライン配置する現行方式から、年数フィルター（表示期間）と同じ **下部ポップアップ（ボトムシート）** 方式へ変更する。

現状の課題:

- `.cagrControls` は `flex-wrap: wrap` で、モバイル幅では 3 つの select と「計算する」ボタンが折り返して縦に伸び、セクションが間延びする。
- ページ内に「期間を選ぶ UI」が 2 種類（上部タブバーのボトムシート／CAGR セクションのインライン select）存在し、操作モデルが一貫していない。

変更後は、CAGR セクションに現在の設定を要約したトリガーボタンだけを置き、タップでボトムシートを開いて 3 項目をまとめて設定する。

## 現状の実装（確認済み）

| 対象                 | 現状                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 表示期間ボトムシート | `src/app/components/CpiChart.tsx:518-542` にインライン JSX。`.rangeSheetBackdrop` / `.rangeSheet` / `.rangeSheetHeader` / `.rangeSheetTitle` / `.rangeSheetClose`（`CpiChart.module.css:685-729`） |
| トリガー             | `SectionTabs.tsx:52-59` の `.sectionRange` ボタン（`aria-label="表示期間を変更"`、ラベルは `2005–2026 ▾`）                                                                                         |
| 閉じる契機           | 背景タップ / ✕ ボタン / select 変更時に自動クローズ（`handleSetStartYear` / `handleSetEndYear`、`CpiChart.tsx:279-286`）                                                                           |
| CAGR 設定 UI         | `src/app/components/CagrPanel.tsx:39-95` のインライン select 3 つ + 「計算する」ボタン                                                                                                             |
| CAGR ステート        | `CpiChart.tsx:196-201`（`cagrStartYear` / `cagrEndYear` / `cagrMonth` / `cagrResult` / `cagrError`）。URL 同期の対象外                                                                             |
| 設定変更時の挙動     | `CpiChart.tsx:204-219` で設定が変わると `cagrResult` を `null` にリセット                                                                                                                          |

## 対象ファイル

1. **`shared_plan/12-cagr-bottom-sheet-plan.md`**（本プラン文書）
2. **`src/app/components/BottomSheet.tsx`** — 新規。ボトムシートの共通コンポーネント
3. **`src/app/components/CpiChart.module.css`** — `.rangeSheet*` → `.bottomSheet*` へ改称し、CAGR トリガーボタン用クラスを追加
4. **`src/app/components/CpiChart.tsx`** — 表示期間シートを `BottomSheet` へ置き換え
5. **`src/app/components/CagrPanel.tsx`** — トリガーボタン + `BottomSheet` 構成へ変更
6. **`tests/components/CagrPanel.test.tsx`** — 新規単体テスト（T1〜T6）
7. **`tests/components/BottomSheet.test.tsx`** — 新規単体テスト（T7〜T9）
8. **`tests/e2e/cagr-sheet.e2e.spec.ts`** — 新規 E2E テスト（T-E2E-1〜T-E2E-4）
9. **`openspec/specs/nextjstest/spec.md`** — R10b の記述調整、新要件 `R18`、Component Tree の更新

---

## 実装手順

### 1. `BottomSheet.tsx` の新設（共通化）

表示期間シートと CAGR シートで backdrop / ヘッダー / ✕ ボタンが完全に同じ構造になるため、先に共通コンポーネントとして切り出す。

```tsx
interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}
```

- `open === false` のときは `null` を返す（現行の条件付きレンダリングと同じ挙動）。
- 構造は現行の `CpiChart.tsx:519-541` をそのまま踏襲:
  - `.bottomSheetBackdrop`（`onClick={onClose}`）
  - `.bottomSheet` に `role="dialog"` / `aria-modal="true"` / `aria-label={title}` を付与
  - `.bottomSheetHeader` > `.bottomSheetTitle`（`title`）+ `.bottomSheetClose`（`aria-label="閉じる"`、`✕`）
  - `children` を本文としてレンダリング
- `Escape` キーで `onClose` を呼ぶ `useEffect` を追加（現行の表示期間シートには無い改善。`ChartInfoButton.tsx` の実装パターンに揃える）。
- **フォーカストラップは今回のスコープ外**とする。`ChartInfoButton.tsx:66-101` に既存実装があるため、必要になった段階で共通フックへ切り出す。

> **注意**: `position: fixed` は祖先に `transform` / `filter` / `contain` があると基準がずれる。`.cagrSection`（`CpiChart.module.css:380-386`）にはこれらが無いことを確認済みだが、実装後に実機幅で表示位置を目視確認すること。

### 2. `CpiChart.module.css` の変更

- `.rangeSheetBackdrop` → `.bottomSheetBackdrop`
- `.rangeSheet` → `.bottomSheet`
- `.rangeSheetHeader` → `.bottomSheetHeader`
- `.rangeSheetTitle` → `.bottomSheetTitle`
- `.rangeSheetClose` → `.bottomSheetClose`

これらのクラス名は `CpiChart.tsx` と `CpiChart.module.css` 内でしか参照されておらず（テストからの参照なし・確認済み）、機械的な改称で安全。**スタイル値は一切変更しない。**

追加するクラス:

```css
/* CAGR 設定のトリガーボタン。SectionTabs の .sectionRange と同系統の見た目 */
.cagrRangeButton {
  min-height: 44px;
  padding: clamp(0.625rem, 0.4rem + 0.5vw, 1.25rem) clamp(1rem, 0.7rem + 0.8vw, 2rem);
  border-radius: 0.375rem;
  border: 1px solid var(--card-border);
  background-color: var(--card-bg);
  color: var(--card-text);
  font-size: clamp(0.875rem, 0.12rem + 1.56vw, 2rem);
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}
@media (hover: hover) and (pointer: fine) {
  .cagrRangeButton:hover {
    border-color: var(--blue-500);
  }
}
.cagrRangeButton:focus-visible {
  outline: 2px solid var(--blue-500);
  outline-offset: 2px;
}

/* シート内の select 群（縦積み） */
.cagrSheetControls {
  display: flex;
  flex-direction: column;
  gap: clamp(1rem, 0.33rem + 1.39vw, 2rem);
}
```

`.cagrControls` / `.cagrItem` はシート内でも再利用する（`.cagrControls` の `flex-direction` はシート内向けに `.cagrSheetControls` で上書きする形にし、既存の定義自体は触らない）。

### 3. `CagrPanel.tsx` の変更

**Props に変更なし**（シートの開閉状態は `CagrPanel` 内部の `useState` で完結させる。`cagrStartYear` などのステートは従来どおり `CpiChart` 側が保持）。ただし `React.memo` のままだと `useState` 追加後も問題ないことを確認する。

構成:

```
.cagrSection
├── <h2>年率上昇率（CAGR）</h2>
├── .cagrContainer
│   ├── .cagrControls
│   │   ├── button.cagrRangeButton   ← 新設トリガー
│   │   └── button.calculateButton   ← 「計算する」は据え置き
│   ├── .cagrError（変更なし）
│   └── .cagrResult（変更なし）
├── <p>※凡例で選択した費目の合計を基準にCAGRを算出</p>
└── <BottomSheet open={sheetOpen} title="CAGRの期間・評価月" onClose={...}>
        └── .cagrSheetControls > 開始年 / 終了年 / 評価月 の 3 select（現行 markup を移設）
```

- トリガーボタンのラベル: `` `${cagrStartYear}年${mm}月 → ${cagrEndYear}年${mm}月 ▾` ``（`mm` は `String(cagrMonth).padStart(2, "0")`）。`.cagrResultDetail`（`CagrPanel.tsx:107-110`）と同じ書式なので、書式生成をローカル定数に括り出して両者で共有する。
- `aria-label="CAGRの期間・評価月を変更"` を付与（E2E のセレクタ安定化のため）。
- **select の閉じ挙動**: 表示期間シートは 1 項目変更で自動クローズしているが、CAGR は 3 項目を続けて設定するのが通常のため **自動クローズしない**。閉じるのは 背景タップ / ✕ / Escape の 3 経路のみ。
- select の `<option disabled>` 条件（`year > cagrEndYear` / `year < cagrStartYear`）と `MIN_DISPLAY_YEAR` フィルタは現行のまま維持する。
- 「計算する」ボタンはシート外（パネル本体）に据え置く。理由: 設定変更で `cagrResult` が `null` にリセットされる既存挙動（`CpiChart.tsx:204-219`）があり、シートを閉じた後にパネル上で計算 → 結果表示という導線が自然なため。`disabled={cagrStartYear === cagrEndYear}` も維持。

### 4. `CpiChart.tsx` の変更

`CpiChart.tsx:518-542` のインライン JSX を差し替えるのみ:

```tsx
<BottomSheet
  open={rangeSheetOpen}
  title="表示期間の選択"
  onClose={() => setRangeSheetOpen(false)}
>
  <ChartFilters ... />
</BottomSheet>
```

ステート名 `rangeSheetOpen` / `setRangeSheetOpen`、`handleSetStartYear` / `handleSetEndYear` の自動クローズ挙動はそのまま維持する（既存 E2E `tests/e2e/range-change.e2e.spec.ts` と `tests/e2e/mobile-ux.e2e.spec.ts` が依存しているため）。

---

## テスト計画

> AGENTS.md の分離ルールに従い、テストの実装は `@fixer` に委譲し、実行・検証は Orchestrator が行う。

### ユニット `tests/components/BottomSheet.test.tsx`

- **T7**: `open={false}` のとき何もレンダリングされない
- **T8**: 背景クリック / ✕ クリックでそれぞれ `onClose` が 1 回呼ばれる
- **T9**: `Escape` キー押下で `onClose` が呼ばれる

### ユニット `tests/components/CagrPanel.test.tsx`

- **T1**: 初期状態でシートは閉じており、開始年 / 終了年 / 評価月の select が DOM に存在しない
- **T2**: トリガーボタンのラベルが `2000年01月 → 2025年01月 ▾` 形式で現在値を反映する
- **T3**: トリガーボタンをクリックすると 3 つの select が表示される
- **T4**: シート内の開始年 select 変更で `setCagrStartYear` が呼ばれ、**シートは開いたままである**（表示期間シートとの挙動差の明示）
- **T5**: 開始年 select で `cagrEndYear` より後の年が `disabled` になる（および終了年側の対称条件）
- **T6**: 「計算する」ボタンはシート外に常時表示され、`cagrStartYear === cagrEndYear` のとき `disabled`

### E2E `tests/e2e/cagr-sheet.e2e.spec.ts`

- **T-E2E-1**: CPI年率セクションで「CAGRの期間・評価月を変更」をタップするとボトムシートが開く
- **T-E2E-2**: シート内で開始年・終了年・評価月を設定 → ✕ で閉じる → 「計算する」で結果が表示され、`.cagrResultDetail` の表示がトリガーボタンのラベルと一致する
- **T-E2E-3**: 背景タップでシートが閉じる
- **T-E2E-4**: モバイル幅（`mobile-ux.e2e.spec.ts` と同じビューポート）で CAGR セクションに横スクロールが発生しない（R7d の回帰）

### 回帰確認（既存テスト）

- `tests/e2e/range-change.e2e.spec.ts` — `.rangeSheet*` → `.bottomSheet*` 改称と `BottomSheet` 化の影響で落ちないこと
- `tests/e2e/mobile-ux.e2e.spec.ts` — 「表示期間を変更」導線
- `tests/e2e/accessibility.e2e.spec.ts` — `role="dialog"` / `aria-modal` 追加の影響
- `tests/e2e/section-tabs-scroll.e2e.spec.ts` — `section-cagr` へのスクロール（セクション高さが縮むため）

### 検証ゲート（Orchestrator 実行）

`lint` → `type-check` → `test` → `coverage` → `spec-refs` → `smoke-test` / E2E

---

## 仕様書更新（`openspec/specs/nextjstest/spec.md`）

1. **Component Tree**（`spec.md:426-452` 付近）
   - `BottomSheet` を新規エントリとして追加（`— shared bottom-sheet shell (backdrop / header / close / Escape)`）
   - `CagrPanel` の説明を `CAGR trigger button, bottom-sheet settings & result card` に更新
2. **R10b: Range Display and Picker**（`spec.md:300-305`）
   - 「a range sheet opens」の記述を、共通 `BottomSheet` を用いる旨に調整
3. **新要件 `R18: CAGR Settings Bottom Sheet`** を追加（`R17` の直後）

```md
### R18: CAGR Settings Bottom Sheet

The system SHALL collect CAGR start year, end year, and evaluation month through a bottom sheet rather than inline selects.

#### Scenario R18a: Open CAGR Settings

- **WHEN** the user views the CPI 年率 section
- **THEN** a trigger button shows the current setting (e.g. `2000年01月 → 2025年01月 ▾`) and the three selects are not rendered
- **AND WHEN** the trigger is tapped
- **THEN** a bottom sheet opens with start-year / end-year / evaluation-month selects

#### Scenario R18b: Sheet Stays Open While Editing

- **WHEN** the user changes one of the three selects inside the CAGR sheet
- **THEN** the sheet stays open so the remaining values can be set
- **AND** the previously calculated CAGR result is cleared

#### Scenario R18c: Dismissal

- **WHEN** the user taps the backdrop, the ✕ button, or presses Escape
- **THEN** the sheet closes and the trigger button label reflects the new setting
```

---

## リスクと留意点

| リスク                                                   | 対応                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `.rangeSheet*` 改称の取りこぼし                          | CSS Module のため参照元は 2 ファイルのみ。改称後に `grep -rn "rangeSheet" src/ tests/` で残存ゼロを確認 |
| `position: fixed` の基準ずれ                             | `.cagrSection` に `transform` / `filter` / `contain` が無いことは確認済み。実装後に実機幅で目視確認     |
| z-index 競合（`.sectionTabs` の sticky ヘッダー）        | 既存の表示期間シートと同じ `z-index: 100 / 101` を流用するため、挙動は表示期間シートと同一になる        |
| シートを開いたまま背景がスクロールする                   | 現行の表示期間シートと同じ挙動（body スクロールロックなし）。**パリティ維持のため今回は追加しない**     |
| 「計算する」がシート外にあることでユーザーが計算し忘れる | 設定変更で `cagrResult` が `null` になり結果カードが消えるため、未計算状態は視覚的に明示される          |
