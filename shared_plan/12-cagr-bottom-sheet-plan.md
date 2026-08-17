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

---

# 検証結果（2026-08-17 実施 / 対象コミット `5e32275`）

## 総合判定

**実装はプランどおり完了しており、全検証ゲートを通過した。** 機能上のブロッカーは無い。
ただし後述の **A-1（`aria-modal` とフォーカス管理の不整合）** はアクセシビリティ上の実害があるため、追加対応を推奨する。

## 検証ゲートの実行結果

| ゲート                   | コマンド                                         | 結果                                                                     |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------ |
| type-check               | `pnpm type-check` (`tsc --noEmit`)               | ✅ エラー 0                                                              |
| lint                     | `pnpm lint` (`eslint --cache`)                   | ✅ エラー 0 / 警告 5（**全て変更前から存在する既存警告**、新規増加なし） |
| ユニット・コンポーネント | `pnpm test` (`vitest run`)                       | ✅ 31 ファイル / **243 テスト全 pass**（9.44s）                          |
| build                    | `pnpm build`                                     | ✅ 成功（静的 4 ページ生成）                                             |
| E2E（全体）              | `pnpm test:e2e`                                  | ✅ **81 passed / 22 skipped / 0 failed**（1.3m）                         |
| E2E（新規のみ）          | `pnpm test:e2e tests/e2e/cagr-sheet.e2e.spec.ts` | ✅ **T-E2E-1〜T-E2E-4 の 4 件すべて pass**（7.9s）                       |

> 既存 lint 警告の内訳（すべて本変更と無関係）: `lint-staged.config.js:1`（anonymous default export）、`server/lib/data-loader/earnings.ts:19,20,31`（未使用 `_`）、`src/app/components/CpiChart.tsx:81`（未使用 `_maxCpiDate`）。

### 回帰確認（プラン 183-188 行に挙げた既存テスト）

| 対象                              | 結果                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `range-change.e2e.spec.ts`        | ✅ pass。「最大期間ボタンで 2005 年から最新年に一括設定され、シートが閉じ、URL に反映される」も含めて通過   |
| `mobile-ux.e2e.spec.ts`           | ✅ pass。タップターゲット 44px、375px 横はみ出しなし、開始年/終了年 select 幅一致（diff 0px）、3 要素横並び |
| `accessibility.e2e.spec.ts`       | ✅ pass（`role="dialog"` / `aria-modal` 追加による破壊なし）。ただし後述 A-2 参照                           |
| `section-tabs-scroll.e2e.spec.ts` | ✅ pass（chromium / webkit-tabs-regression 両プロジェクト）。「CPI年率」タブジャンプも到達                  |

### プラン記載事項との突合

| プラン項目                                                          | 実装状況                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `BottomSheet.tsx` 新設（`open` / `title` / `onClose` / `children`） | ✅ `src/app/components/BottomSheet.tsx:5-10` プラン記載の props と完全一致                                                         |
| `open === false` で `null` を返す                                   | ✅ `BottomSheet.tsx:22`                                                                                                            |
| `role="dialog"` / `aria-modal` / `aria-label={title}`               | ✅ `BottomSheet.tsx:27`                                                                                                            |
| Escape キーで close                                                 | ✅ `BottomSheet.tsx:13-20`                                                                                                         |
| フォーカストラップはスコープ外                                      | ✅ 実装されていない（プランどおり）— ただし A-1 参照                                                                               |
| `.rangeSheet*` → `.bottomSheet*` 改称（値は不変）                   | ✅ 差分は識別子のみ。`grep -rn "rangeSheet" src/ tests/ openspec/` の残存は state 名 `rangeSheetOpen` のみ（プランで意図的に維持） |
| `.cagrRangeButton` / `.cagrSheetControls` 追加                      | ✅ `CpiChart.module.css:731-761` プラン記載の CSS と一致                                                                           |
| `CagrPanel` の Props 変更なし・内部 `useState` で開閉               | ✅ `CagrPanel.tsx:6-18, 39`                                                                                                        |
| トリガーの `aria-label="CAGRの期間・評価月を変更"`                  | ✅ `CagrPanel.tsx:51`                                                                                                              |
| select 変更で自動クローズしない                                     | ✅ `CagrPanel.tsx:93,109,125` は setter のみ呼ぶ。T4 / T-E2E-2 で担保                                                              |
| `<option disabled>` 条件・`MIN_DISPLAY_YEAR` フィルタ維持           | ✅ `CagrPanel.tsx:40,97,113`                                                                                                       |
| 「計算する」はシート外・`disabled` 条件維持                         | ✅ `CagrPanel.tsx:55-61`                                                                                                           |
| `CpiChart.tsx` の表示期間シートを `BottomSheet` へ置換              | ✅ `CpiChart.tsx:519-529`。`handleSetStartYear` / `handleSetEndYear` の自動クローズは維持                                          |
| spec.md（R10b 調整 / R18 追加 / Component Tree）                    | ✅ `spec.md:305, 393-414, 455, 457, 461`                                                                                           |

### プランからの差異（いずれも許容）

1. **`.cagrControls` のシート内再利用を取りやめ**
   プラン 111 行では「シート内でも `.cagrControls` を再利用し `.cagrSheetControls` で上書き」としたが、実装はシート内で `.cagrSheetControls` **のみ**を使用（`CagrPanel.tsx:87`）。上書きの重ね掛けが無くなり CSS の見通しが良いため、**この差異は実装側が優れている**。既存の `@media (max-width: 768px)` 内 `.cagrControls { flex-direction: column }`（`CpiChart.module.css:510-513`）はパネル本体（トリガー + 計算するの 2 ボタン）にのみ効き、`align-items: stretch` で両ボタンが全幅化する。意図どおり。
2. **T6 が T6 / T6b の 2 ケースに分割**（enabled 側の検証を追加）。カバレッジ増につき問題なし。
3. **T-E2E-2 の最終アサーションが緩い**
   プラン 179 行は「`.cagrResultDetail` の表示がトリガーボタンのラベルと一致する」だが、実装は `getByText(/年率上昇率|データが見つかりません/)` と OR 条件（`cagr-sheet.e2e.spec.ts:61`）。「年率上昇率」は `<h2>` にも存在するため、**計算が失敗しても pass しうる**。→ 後述 B-1 で改善提案。

---

## 変更提案

### A-1【推奨・アクセシビリティ】`aria-modal="true"` とフォーカス管理の不整合

**問題**: `BottomSheet.tsx:27` は `aria-modal="true"` を宣言しているが、フォーカストラップも初期フォーカス移動も無い。支援技術には「背後は不活性」と伝わる一方、実際には Tab で背後のチャート・凡例・タブバーへ抜けられる。さらに ✕ ボタンで閉じるとフォーカス先の要素が DOM から消え、**フォーカスが `<body>` に落ちてページ先頭へ戻る**。キーボード / スクリーンリーダー利用者にとっては実害のある挙動で、`aria-modal` は現状「嘘の宣言」になっている。

`ChartInfoButton.tsx:66-101` に既にフォーカストラップの実装があるため、パターンを流用できる。

**変更プラン（いずれかを選択。A 案を推奨）**

- **A 案（推奨）**: `BottomSheet` にフォーカス管理を追加する。
  1. `open` になった瞬間、シート内の最初のフォーカス可能要素（実質 ✕ ボタン）へ `focus()` する。
  2. `Tab` / `Shift+Tab` をシート内で循環させる（`ChartInfoButton.tsx:73-95` と同じ `querySelectorAll` ベースの実装）。
  3. `open` が `true` → `false` に変わる際、直前にフォーカスされていた要素（トリガーボタン）へ `focus()` を戻す。`useRef<HTMLElement | null>` に `document.activeElement` を退避する。
  4. 実装が重複するため、`ChartInfoButton` と共有できる `useFocusTrap(ref, open)` フックを `src/hooks/` に切り出すのが望ましい。
  - テスト追加（`tests/components/BottomSheet.test.tsx`）:
    - **T10**: `open` になると ✕ ボタンにフォーカスが当たる
    - **T11**: シート内最後の要素で `Tab` を押すと最初の要素へ戻る
    - **T12**: `open` → `close` でトリガー要素へフォーカスが戻る
  - E2E 追加（`tests/e2e/accessibility.e2e.spec.ts`）: シートを開いた状態で `Tab` を 10 回押しても `document.activeElement` が `[role="dialog"]` の内側に留まること
- **B 案（最小対応）**: `aria-modal="true"` を削除し、宣言を実態に合わせる。実害（フォーカスが body に落ちる）は残るため非推奨。

**影響範囲**: `src/app/components/BottomSheet.tsx`、（切り出す場合）`src/hooks/useFocusTrap.ts`、`src/app/components/ChartInfoButton.tsx`、`tests/components/BottomSheet.test.tsx`、`tests/e2e/accessibility.e2e.spec.ts`、spec.md（R18c にフォーカス復帰を追記）。

### A-2【推奨・アクセシビリティ】トリガーの `aria-label` が現在値を隠している

**問題**: `CagrPanel.tsx:51` の `aria-label="CAGRの期間・評価月を変更"` は、可視テキスト `2000年01月 → 2025年01月 ▾` を**上書きする**。spec.md の Scenario R18a は「a trigger button shows the current setting」と規定しているが、スクリーンリーダー利用者には現在の設定値が一切読み上げられない。`SectionTabs.tsx:56` の `.sectionRange`（`aria-label="表示期間を変更"` / 可視テキスト `2005–2026 ▾`）も同じ問題を抱えており、本変更でパターンが 2 箇所に増えた。

**変更プラン**:

```tsx
aria-label={`CAGRの期間・評価月を変更（現在: ${cagrStartYear}年${mm}月から${cagrEndYear}年${mm}月）`}
```

- E2E は `getByRole("button", { name: "CAGRの期間・評価月を変更" })` の完全一致で引いているため、`{ name: /CAGRの期間・評価月を変更/ }` の正規表現へ変更する必要がある（`cagr-sheet.e2e.spec.ts:24,42,54,68`）。ユニットテスト T2〜T5 も同様（`CagrPanel.test.tsx:42,49,57,66`）。
- 同じ修正を `SectionTabs.tsx` の `.sectionRange` にも適用するかは別判断。適用する場合は `mobile-ux.e2e.spec.ts:71,102,132` と `range-change.e2e.spec.ts:41,81,226` のセレクタも正規表現化が必要。**まず `CagrPanel` のみ対応し、`SectionTabs` は別コミットに分けることを推奨**（回帰面が広いため）。

### B-1【推奨・テスト品質】T-E2E-2 のアサーションが計算失敗を検知できない

**問題**: `cagr-sheet.e2e.spec.ts:61` の `getByText(/年率上昇率|データが見つかりません/)` は、セクション見出し `<h2>年率上昇率（CAGR）</h2>` に常時マッチする。`.first()` を取っているため、**「計算する」が全く機能しなくてもこのテストは pass する**。結果としてプラン 179 行の意図（結果表示の検証）を満たしていない。

**変更プラン**: 結果カード内の値要素を直接検証する。

```ts
// CagrPanel.tsx:73 の .cagrResultValue（例: "1.23%"）を検証
const resultValue = page.locator(`[class*="cagrResultValue"]`);
await expect(resultValue).toBeVisible({ timeout: 5000 });
await expect(resultValue).toHaveText(/^-?\d+\.\d{2}%$/);

// プラン 179 行の意図どおり、詳細表示がトリガーのラベルと整合することを検証
const resultDetail = page.locator(`[class*="cagrResultDetail"]`);
await expect(resultDetail).toHaveText("2015年01月 → 2025年01月");
```

**影響範囲**: `tests/e2e/cagr-sheet.e2e.spec.ts` のみ。

### B-2【推奨・保守性】`formatCagrRange(...).replace(" ▾", "")` の逆変換を排除

**問題**: `CagrPanel.tsx:75` は、フォーマッタが埋め込んだ `▾` を文字列置換で剥がしている。`formatCagrRange` の書式（例: 全角スペース化、`▾` を別記号に変更）をいじると結果カードの表示だけが静かに壊れる。`replace` は文字列が一致しなければ黙って何もしないため、テストでも検知しづらい。

**変更プラン**: 装飾記号を呼び出し側の責務にする。

```tsx
const formatCagrRange = (startYear: number, endYear: number, month: number) => {
  const mm = String(month).padStart(2, "0");
  return `${startYear}年${mm}月 → ${endYear}年${mm}月`;
};
```

- トリガー: `{formatCagrRange(...)} ▾`（JSX 側で付与）
- 結果カード: `{formatCagrRange(...)}`（`.replace()` を削除）

**影響範囲**: `src/app/components/CagrPanel.tsx` のみ。既存テストは `toContain("2000年01月")` 等の部分一致なので変更不要。

### C-1【低優先・仕様書】Test Requirements に新規 E2E ファイルが未記載

**問題**: `spec.md:552-563` の E2E ファイル一覧に `cagr-sheet.e2e.spec.ts` が無い。

**変更プラン**: 一覧に 1 行追加する。

```md
- `cagr-sheet.e2e.spec.ts` — CAGR 設定ボトムシートの開閉と計算導線（R18）
```

なお同一覧には `section-tabs-scroll` / `tooltip-dismiss` / `tooltip-stack-total` / `spending-filter` / `legend-color-sync` / `advanced-series` / `cpi-chart-categories` も未記載（本変更以前からの積み残し）。また「across three projects」の記述は現在 4 プロジェクト（`webkit-tabs-regression` を含む）に増えており実態とずれている。**まとめて是正するのが望ましいが、本タスクのスコープ外として別途対応する。**

### C-2【低優先・軽微】`BottomSheet` 未使用時の子要素評価

`CpiChart.tsx:519-529` は `{rangeSheetOpen && ...}` によるショートサーキットを廃したため、シートが閉じていても毎レンダーで `allYears.filter((y) => y >= MIN_DISPLAY_YEAR)` が実行され `<ChartFilters>` の React element が生成される（マウントはされない）。実測に現れない規模のため**対応不要**。気になる場合は `allYears` のフィルタ結果を `useMemo` 化する。

### C-3【低優先・軽微】`"use client"` ディレクティブの有無が不揃い

`BottomSheet.tsx:1` には `"use client"` があるが `CagrPanel.tsx` には無い（親 `CpiChart` 経由で client 境界に入るため動作上は問題なく、build も通過）。既存の `ChartFilters.tsx` にも無く、リポジトリ全体で不揃いなため**本タスクでの対応は不要**。

---

## 推奨する対応順序

1. **A-1**（フォーカス管理）— アクセシビリティの実害。`useFocusTrap` フック切り出しを含むため最も工数が大きい
2. **B-1**（E2E アサーション強化）— 現状テストが実質的に無効なため、A-1 より先に入れてもよい
3. **B-2**（`replace` 排除）— 小さく安全
4. **A-2**（`aria-label` に現在値）— `CagrPanel` のみ先行
5. **C-1**（spec.md 追記）— 他の積み残しとまとめて

**未実施の検証**: プラン 63 行の「実機幅での `position: fixed` 表示位置の目視確認」は E2E（T-E2E-1 / T-E2E-3 でシートの可視性・背景タップは検証済み）では代替できないため、実機またはブラウザのデバイスエミュレーションでの目視確認が残っている。

---

# 追加対応の検証結果（2026-08-17 実施 / 対象コミット `375308c`）

## 総合判定

**A-1 / A-2 / B-1 / B-2 / C-1 の 5 件すべてが実装され、全検証ゲートを通過した。**

ただし **A-1 のフォーカス復帰実装が `ChartInfoButton` に新たなスクロールジャンプ回帰を持ち込んでいる**ことを実測で確認した。後述 **D-1** として修正を要する（優先度: 高）。

## 検証ゲートの実行結果

| ゲート                  | 結果                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm type-check`       | ✅ エラー 0                                                               |
| `pnpm lint`             | ✅ エラー 0 / 警告 5（**前回と同一の既存警告**、新規増加なし）            |
| `pnpm test`             | ✅ 31 ファイル / **246 テスト全 pass**（前回 243 → T10/T11/T12 の +3 件） |
| `pnpm build`            | ✅ 成功                                                                   |
| `pnpm test:e2e`（全体） | ✅ **81 passed / 22 skipped / 0 failed**                                  |

`ChartInfoButton.test.tsx` を含む既存コンポーネントテストも全 pass。`useFocusTrap` への切り出しでユニットテスト層の回帰は発生していない。

## 対応項目ごとの突合

| 項目    | 実装状況                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-1** | ✅ `src/hooks/useFocusTrap.ts` を新設（69 行）。初期フォーカス（`useFocusTrap.ts:24-30`）・Tab 循環（`38-68`）・クローズ時のフォーカス復帰（`32-34`）の 3 点すべて実装。`BottomSheet.tsx:16` と `ChartInfoButton.tsx:26` の両方が利用し、`ChartInfoButton` 側の重複実装 44 行を削除。`BottomSheet.tsx:38` に `tabIndex={-1}` を追加してフォールバックの `container.focus()` を機能させている点も正しい。テスト T10/T11/T12 追加済み |
| **A-2** | ✅ `CagrPanel.tsx:51` の `aria-label` に現在値を埋め込み。セレクタは提案どおりユニット（`CagrPanel.test.tsx:42,49,57,66`）・E2E（`cagr-sheet.e2e.spec.ts:24,42,54,68`）の 8 箇所すべて正規表現化済み。`SectionTabs` は提案どおり手を付けず（別コミット判断は妥当）                                                                                                                                                                  |
| **B-1** | ✅ `cagr-sheet.e2e.spec.ts:56-63` を `[class*='cagrResultValue']` の `toHaveText(/^-?\d+\.\d{2}%$/)` と `[class*='cagrResultDetail']` の `toContainText` に差し替え。**見出しへの誤マッチが解消され、計算が動かなければ落ちるテストになった**ことを確認                                                                                                                                                                             |
| **B-2** | ✅ `CagrPanel.tsx:22` から `▾` を除去し、`:53` の JSX 側で付与。`:75` の `.replace(" ▾", "")` は削除済み                                                                                                                                                                                                                                                                                                                            |
| **C-1** | ✅ `spec.md:562` に `cagr-sheet.e2e.spec.ts — CAGR 設定ボトムシートの開閉と計算導線（R18）` を追記                                                                                                                                                                                                                                                                                                                                  |

A-1 で提案した「E2E（`accessibility.e2e.spec.ts`）でのフォーカストラップ検証追加」のみ未実施。ユニット T10〜T12 で機能自体は担保されているため必須ではないが、下記 D-1 の回帰はユニット層では捕まらなかったため、E2E 層の追加は依然として有意である。

## BottomSheet 側のフォーカス復帰の影響（実測・問題なし）

一時 Playwright スペックで、フォーカス復帰による `Element.focus()` のスクロール副作用を実測した。

| シナリオ                                                       | スクロール差分 |
| -------------------------------------------------------------- | -------------- |
| CAGR シートを開いたまま下方向へスクロール → 背景タップで閉じる | **0px** ✅     |
| 表示期間シートを開き `#startYear` を変更して自動クローズ       | **0px** ✅     |

いずれも復帰先のトリガー（`.cagrRangeButton` / sticky な `.sectionRange`）が視界内に留まるため副作用が出ない。**本プランのスコープである `BottomSheet` 2 経路は健全。**

---

## D-1【要修正・優先度 高】`useFocusTrap` が `ChartInfoButton` の外側クリック時にページ最上部までスクロールを巻き戻す

### 症状（実測で確認）

info（ⓘ）ポップアップを開いたままページ下方へスクロールし、ポップアップ外をクリックして閉じると、**スクロール位置が info ボタンの位置まで一気に戻る**。

一時 Playwright スペックによる A/B 実測:

| 対象コミット                       | 外側クリック前 `scrollY` | クリック後 `scrollY` | 差分           |
| ---------------------------------- | ------------------------ | -------------------- | -------------- |
| `5e32275`（`useFocusTrap` 導入前） | 3000                     | 3000                 | **0px** ✅     |
| `375308c`（`useFocusTrap` 導入後） | 3000                     | 134                  | **-2866px** ❌ |

> 検証方法: `ChartInfoButton.tsx` のみを `5e32275` の内容へ差し替えて再ビルドし、同一スペックで比較。検証後に作業ツリーは元に戻してある（`git status` clean）。

### 原因

1. `useFocusTrap.ts:32-34` のクリーンアップは、**閉じ方を問わず無条件に** `previousFocusRef.current?.focus()` を実行する。
2. `Element.focus()` は既定でその要素を視界内へスクロールする（`preventScroll` 未指定）。
3. 変更前の `ChartInfoButton` は、外側 `pointerdown` 経路（`ChartInfoButton.tsx:29-52`）では `setOpen(false)` のみでフォーカスを動かしていなかった。`triggerRef.current?.focus()` は ✕ / backdrop（`handleClose`）と Escape の**キーボード／明示クローズ経路に限定**されていた。共通フック化でこの区別が失われ、外側クリック経路にもフォーカス復帰が適用された。

`BottomSheet` 側で問題が出ないのはトリガーが視界内に留まる配置だからであり、`ChartInfoButton` はページ全体に散在する（`ChartInfoContentRenderer` 経由で各チャート見出しに配置）ため影響が顕在化する。**モバイルでは「ⓘ を閉じたら画面が飛ぶ」という体感的に大きな不具合になる。**

### 変更プラン（E 案を推奨）

- **E 案（推奨・最小かつ確実）**: `useFocusTrap.ts:33` を `preventScroll` 付きに変更する。

  ```ts
  return () => {
    previousFocusRef.current?.focus({ preventScroll: true });
  };
  ```

  フォーカス復帰（アクセシビリティ上の要件）は維持したまま、スクロール副作用のみを打ち消す。`ChartInfoButton` の `handleClose` / Escape 経路にある既存の `triggerRef.current?.focus()`（`ChartInfoButton.tsx:61,75`）はスクロール込みの `focus()` だが、これらは元から存在する挙動なので変更しない。
  - 影響範囲: `src/hooks/useFocusTrap.ts` の 1 行のみ。

- **F 案（併用推奨・重複解消）**: E 案の適用後、`ChartInfoButton.tsx:61` と `:75` の `triggerRef.current?.focus()` は `useFocusTrap` のクリーンアップと二重にフォーカス復帰を行うため冗長になる。`triggerRef` を `focus` 用途で使っているのはこの 2 箇所だけなので、削除してフックに一任するとフォーカス制御の責務が 1 箇所に集約される。
  - ただし削除するとこの 2 経路もスクロールしなくなる（＝挙動変更）。**先に E 案のみを入れて回帰を止め、F 案は別途判断するのが安全。**

### テスト追加（回帰の再発防止）

ユニット層（jsdom）では `focus()` のスクロール副作用が再現しないため、**E2E で押さえる必要がある**。`tests/e2e/accessibility.e2e.spec.ts` に追加する:

```ts
fixtureTest(
  "info ポップアップを外側クリックで閉じてもスクロール位置が保持される",
  async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: /データソース/ })
      .first()
      .click();
    await expect(page.getByRole("dialog").first()).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 3000));
    const before = await page.evaluate(() => window.scrollY);

    await page.mouse.click(200, 400); // ポップアップ外
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(50);
  },
);
```

あわせて A-1 で未実施だったフォーカストラップの E2E も同ファイルに追加する:

```ts
fixtureTest("ボトムシートを開いた状態で Tab がシート内に留まる", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "表示期間を変更" }).click();

  for (let i = 0; i < 10; i++) await page.keyboard.press("Tab");

  const inside = await page.evaluate(() =>
    document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  );
  expect(inside).toBe(true);
});
```

**影響範囲**: `src/hooks/useFocusTrap.ts`（1 行）、`tests/e2e/accessibility.e2e.spec.ts`（2 テスト追加）、spec.md の Test Requirements の `accessibility.e2e.spec.ts` 行にフォーカス管理の記述を追記。

---

## D-2【低優先】T-E2E-2 の期待値に終了年 `2026` がハードコードされている

`cagr-sheet.e2e.spec.ts:63` は `toContainText("2015年01月 → 2026年01月")` と終了年を直書きしている。`cagrEndYear` の既定値は `initialEndYear`（データの最新年）由来（`CpiChart.tsx:198`）なので、**CSV データが 2027 年分まで伸びた時点でこのテストが落ちる**。時刻依存ではなくデータ依存だが、ETL 更新のたびに手直しが必要になる。

**変更プラン**: トリガーのラベルから期待値を導出して自己整合にする。

```ts
const triggerLabel = (await trigger.textContent())?.replace(" ▾", "").trim();
await expect(resultDetail).toContainText(triggerLabel!);
```

**影響範囲**: `tests/e2e/cagr-sheet.e2e.spec.ts` のみ。

## D-3【低優先・体裁】テストコメントに中国語が混入

`tests/components/BottomSheet.test.tsx:96` のコメント `// Tab → 最後なので循环回 ✕ ボタン` に簡体字（`循环回`）が混じっている。`// Tab → 最後なので ✕ ボタンへ循環する` 等に修正する。**影響範囲**: コメントのみ。

---

## 推奨する対応順序（追加分）

1. **D-1 / E 案**（`preventScroll: true` の 1 行）+ E2E 2 件追加 — 実測済みの回帰であり、最優先
2. **D-2**（E2E 期待値の自己整合化）
3. **D-3**（コメント修正）
4. **F 案**（`ChartInfoButton` の重複フォーカス復帰の整理）— D-1 が落ち着いた後に別コミットで

**引き続き未実施**: 実機幅での `position: fixed` 表示位置の目視確認（前回検証から変わらず）。

---

# 現在のブロッカー状況メモ（2026-08-17）

## コミット状態

| コミット   | 内容                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `5e32275`  | 共通実装（BottomSheet / CagrPanel ボトムシート化 / テスト / E2E / spec.md）                              |
| `375308c`  | A-1〜C-1 修正（useFocusTrap 共通化 / aria-label 現在値 / E2E アサーション強化 / formatCagrRange ▾ 分離） |
| 未コミット | D-1〜D-3 / F 案 の変更（useFocusTrap restoreRef / E2E スクロール保持テスト追加 / 動的年 / コメント修正） |

## ユニットテスト / 型チェック

- `pnpm type-check` → 0 エラー
- `pnpm test -- --run` → 246/246 パス

## E2E ブロッカー

> **⚠️ 以下の「ブロッカー」は実在しない。**
> Orchestrator が 2026-08-17 に再検証したところ、**現在の未コミット変更で当該テストは pass する**。
> 詳細は末尾の「# ブロッカー再検証の結果」を参照。以下の根本原因分析（項目 4・5）と
> 「試した対策と結果」の表、および G / H / I 案はいずれも**誤った前提に基づくため破棄する**。

**失敗テスト**: `accessibility.e2e.spec.ts:172` — "info ポップアップを外側クリックで閉じてもスクロール位置が保持される"
**失敗内容**: scrollY が 3000 → 134 にジャンプ（差分 2866px、許容 < 50）

### 根本原因分析（※項目 4・5 は誤り）

1. **デスクトップ（≥769px）では `.backdrop` が `display: none`**
   - CSS: `ChartInfoButton.module.css:301` → `@media (max-width: 768px)` のみで `.backdrop { display: block }`
   - E2E は Chromium デフォルトビューポート（1280×720）で実行 → backdrop が DOM 上に存在するが不可視

2. **クリック（200, 400）がバックドップに届かない**
   - backdrop は `position: fixed; inset: 0` だが `display: none` → ヒットテスト対象外
   - クリックはページ本文の要素にヒット
   - `handlePointerDown` の `wrapperRef/popupRef.contains()` が false → `setOpen(false)` 呼出

3. **`setOpen(false)` → popup の条件付きレンダリング除去 `{open && ...}`**
   - React の reconciler が popup ノードを DOM から除去
   - `useFocusTrap` の cleanup 効果が実行 → `triggerRef.current?.focus({ preventScroll: true })`

4. **`preventScroll: true` がスクロールを防止できない**
   - triggerRef（(i) ボタン）はページ上部のチャートセクション内に存在
   - scrollY=3000 の状態で triggerRef をフォーカス → ブラウザがトリガーボタンの位置までスクロール
   - Chromium 127 で `preventScroll: true` は **フォーカス移動時のスクロール** を防ぐが、**React の DOM 削除に伴うレイアウト変化によるスクロール** は防げない可能性がある

5. **React の DOM 削除サイクルの問題**
   - React は cleanup 効果を実行する前に DOM の変更（popup 削除）をコミット済み
   - popup 削除によりブラウザがスクロール位置を再計算 → layout shift → scroll jump
   - `preventScroll` はその後の `focus()` にしか効かず、DOM 削除時のブラウザ動作は制御できない

### 試した対策と結果

| 対策                              | 結果                          |
| --------------------------------- | ----------------------------- |
| `preventScroll: true` のみ        | ✗ 2866px ジャンプ（変化なし） |
| `restoreRef` で triggerRef を明示 | ✗ 2866px ジャンプ（変化なし） |
| F 案: 重複 focus 呼び出し削除     | ✗ 2866px ジャンプ（変化なし） |

### 残る選択肢

**G 案**: `ChartInfoButton` の `useFocusTrap` を **フォーカス復帰なし** で利用する。

- `useFocusTrap` に `restoreRef` オプション「restore なし」を追加（例: `restoreFocus: false`）
- info ポップアップはトリガーボタンがページ上部に固定配置（スクロール連動）ではないため、フォーカス復帰の実用性が低い
- フォーカスは DOM 削除後にブラウザが body へ戻す（= 自然挙動）
- E2E テストの期待値を `scrollY` 保持から「フォーカスが body に移動し、エラーが発生しない」ことへ変更

**H 案**: ポップアップの `display: none` パターンを活用。

- `open=false` 時に `display: none` で非表示にし、DOM には残す（条件付きレンダリング `{open && ...}` を廃止）
- React が DOM を除去しない → layout shift が起きない → `preventScroll` が効く
- メモリコスト（ポップアップ DOM が常時存在）は軽微

**I 案**: `useFocusTrap` の cleanup を `requestAnimationFrame` で遅延。

- React の DOM 削除後に `focus()` を実行 → DOM 安定後にフォーカス復帰
- ただし `preventScroll` が効く保証はなく、タイミング依存

### 現時点の推奨

**G 案** が最もシンプルで確実。

- ChartInfoButton の useFocusTrap は「フォーカス トラップ（Tab 循環）」と「開いたときの初期フォーカス」のためだけに使う
- 閉じるときのフォーカス復帰は不要（トリガーボタンがスクロール連動で動くため、復帰先が不定）
- フックに `restoreRef` を渡さない（= 現行の `BottomSheet` と同じパス）→ `previousFocusRef` が `body` を指す → `target` が body → 何もしない（= 自然挙動）

> **【破棄】** 上記 G 案は不要。D-1 は既存の未コミット変更（`preventScroll: true` + `restoreRef`）で
> 解決済みであることを実測で確認した。フォーカス復帰を諦める必要はない。

---

# ブロッカー再検証の結果（2026-08-17 / 未コミット変更を対象）

## 結論: **ブロッカーは存在しない。全ゲートが pass する。**

`pnpm build` を実行してから E2E を走らせたところ、「失敗する」とされたテストを含め全件が通った。

| ゲート                                | 結果                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm type-check`                     | ✅ エラー 0                                                                                              |
| `pnpm test`                           | ✅ 31 ファイル / **246 テスト全 pass**                                                                   |
| `pnpm lint`                           | ⚠️ エラー 0 / **警告 6**（既存 5 + **新規 1 件** → 下記 J-1）                                            |
| `pnpm build`                          | ✅ 成功                                                                                                  |
| `pnpm test:e2e`（全体）               | ✅ **85 passed / 22 skipped / 0 failed**（前回 81 → 新規 2 テスト × 2 プロジェクト）                     |
| 当該 `accessibility.e2e.spec.ts` 単体 | ✅ `:172`（スクロール保持）・`:189`（Tab 循環）とも **chromium / chromium-dark の両プロジェクトで pass** |

## 「失敗した」原因の推定: **stale な `.next` を検証していた**

ブラウザ内で `HTMLElement.prototype.focus` をフックして実測した結果、外側クリック時に発生する
`focus()` 呼び出しは **1 回だけ**で、`preventScroll: true` が渡り、`scrollY` は 3000 のまま動かなかった。

```
[DIAG] before: 3000 after: 3000 delta: 0
[DIAG] focusLog: [{ tag: "BUTTON", cls: "...trigger",
                    label: "消費者物価指数のデータソースを表示",
                    preventScroll: true, scrollYBefore: 3000, scrollYAfter: 3000 }]
```

つまり `preventScroll: true` は正しく効いている。「試した対策 3 つすべてが 2866px で変化なし」という
**症状がまったく変わらない**のは、ソースを直しても検証対象のバンドルが変わっていなかったことを強く示唆する。

`pnpm test:e2e`（Playwright の `webServer` は `pnpm start`）は **`.next` を再ビルドしない**。
`.husky/pre-push` 自身が次のようにこの罠を警告している:

> `.next` が古ければ古いビルドを黙って検証してしまう（push するコードを見ていない）

**教訓**: `src/` を変更した後に E2E を走らせるときは必ず `pnpm build && pnpm test:e2e` の順で実行する。

## 根本原因分析の誤りについて

破棄した分析の項目 4・5 は「React の DOM 削除に伴う layout shift でスクロールする」「`preventScroll`
では防げない」と述べているが、これは誤り。**根拠**: `375308c` 時点（`preventScroll` なし）と
`5e32275` 時点（フォーカス復帰なし）の A/B 実測で、React の DOM 削除は両者で同一に起きているのに
`5e32275` では差分 0px だった。したがってスクロールの原因は DOM 削除ではなく `focus()` 呼び出しであり、
`preventScroll: true` はそれを正しく打ち消す。

## D-1〜D-3 / F 案の実装確認

| 項目     | 実装状況                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-1**  | ✅ `useFocusTrap.ts:41` で `target.focus({ preventScroll: true })`。加えて `restoreRef` 引数（第 3 引数）を新設し、`ChartInfoButton.tsx:26` が `triggerRef` を明示的に渡す形にした。提案（E 案）より堅牢 |
| **D-2**  | ✅ `cagr-sheet.e2e.spec.ts:65-68` でトリガーラベルから期待値を導出。終了年 `2026` のハードコードを排除                                                                                                   |
| **D-3**  | ✅ `BottomSheet.test.tsx:96` の簡体字コメントを修正                                                                                                                                                      |
| **F 案** | ✅ 適用済み。`ChartInfoButton` の `handleClose`（旧 `:75`）と Escape ハンドラー（旧 `:61`）から重複する `triggerRef.current?.focus()` を削除し、フォーカス制御を `useFocusTrap` に一元化                 |
| E2E 追加 | ✅ `accessibility.e2e.spec.ts:171-200` に「アクセシビリティ - フォーカス管理」describe を新設し、提案どおり 2 件を追加                                                                                   |

---

# 未解決の項目

## J-1【要対応】新規の lint 警告 1 件（警告 5 → 6 に増加）

```
src/hooks/useFocusTrap.ts
  41:34  warning  The ref value 'restoreRef.current' will likely have changed by the time
                  this effect cleanup function runs. If this ref points to a node rendered
                  by React, copy 'restoreRef.current' to a variable inside the effect,
                  and use that variable in the cleanup function
                  react-hooks/exhaustive-deps
```

これまで「警告 5 件（すべて本変更と無関係な既存分）」を維持できていたが、**本変更で初めて 1 件増えた**。
`restoreRef.current`（= ⓘ トリガーボタン）はポップアップの開閉をまたいでマウントされ続けるため
実害は無いが、警告を残すと以降の「新規警告ゼロ」の判定が効かなくなる。

**変更プラン**: エフェクト内でローカル変数へ退避し、クリーンアップではそれを使う。

```ts
useEffect(() => {
  if (!open) return;
  previousFocusRef.current = document.activeElement as HTMLElement | null;

  const container = containerRef.current;
  if (!container) return;

  // lint 対策 & 意図の明示: cleanup 時点で ref を読まずエフェクト実行時の値を使う
  const restoreTarget = restoreRef?.current ?? previousFocusRef.current;

  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
  const first = focusable[0];
  if (first) first.focus();
  else container.focus();

  return () => {
    restoreTarget?.focus({ preventScroll: true });
  };
}, [open, containerRef, restoreRef]);
```

**影響範囲**: `src/hooks/useFocusTrap.ts` のみ。挙動は不変（トリガーは開閉をまたいで同一ノード）。

## J-2【要対応】F 案の挙動変更にコンポーネント側のテストが無い

F 案で `ChartInfoButton` の `handleClose` / Escape から `triggerRef.current?.focus()` を削除し、
フォーカス復帰を `useFocusTrap` のクリーンアップ 1 箇所に委ねた。しかし
`tests/components/ChartInfoButton.test.tsx` には**✕ / Escape で閉じた後にトリガーへフォーカスが戻ることを
検証するテストが無い**（`grep` で確認: `focus` に関するアサーションはゼロ）。
`BottomSheet.test.tsx` の T12 はフック自体を間接的に守るが、`restoreRef` を渡す経路は
`ChartInfoButton` だけであり、その経路は未テストである。

**変更プラン**: `tests/components/ChartInfoButton.test.tsx` に 2 件追加する。

- **T13**: ⓘ トリガーをクリックして開き、✕ をクリックして閉じると `document.activeElement` がトリガーへ戻る
- **T14**: Escape で閉じた場合も同様にトリガーへ戻る

**影響範囲**: `tests/components/ChartInfoButton.test.tsx` のみ。

## J-3【要対応】spec.md がフォーカス管理の要件・テストを反映していない

D-1 の変更プランで挙げた spec.md 更新が未実施。`grep` の結果、spec.md にフォーカストラップ／
フォーカス復帰に関する記述は無く（`:284-285` の `:focus-visible` と `:561` の記述のみ）、
新設した「アクセシビリティ - フォーカス管理」の 2 テストもどこにも登録されていない。
AGENTS.md の「コンポーネントの追加・アーキテクチャ変更は仕様書に反映する」に照らすと、
`useFocusTrap` という新規共通フックが未記載である点も漏れである。

**変更プラン**:

1. **R8（Accessibility）に新シナリオを追加**

   ```md
   #### Scenario R8e: Modal Focus Management

   - **WHEN** a `BottomSheet` or `ChartInfoButton` popup opens
   - **THEN** focus moves to the first focusable element inside it and `Tab` / `Shift+Tab` cycle within it (`useFocusTrap`)
   - **AND WHEN** it closes
   - **THEN** focus returns to the trigger via `focus({ preventScroll: true })` so the scroll position is preserved
   ```

2. **Test Requirements の `accessibility.e2e.spec.ts` の行にフォーカス管理を追記**

   ```md
   - `accessibility.e2e.spec.ts` — dark-mode legend contrast (P0-3 / P1-2 regression),
     `:focus-visible` rings (P4-1), keyboard-only operation (P4-1), `prefers-reduced-motion` (P4-2),
     and modal focus management — scroll preservation on dismiss & `Tab` containment (R8e)
   ```

3. **Client Modules / `src/hooks/` の節に `useFocusTrap` を追記**

   ```md
   - `useFocusTrap.ts` — initial focus, `Tab` containment, and scroll-preserving focus restore for modal surfaces (R8e)
   ```

**影響範囲**: `openspec/specs/nextjstest/spec.md` のみ。

## J-4【要対応】変更が未コミット

D-1〜D-3 / F 案の変更（`src/hooks/useFocusTrap.ts`, `src/app/components/ChartInfoButton.tsx`,
`tests/components/BottomSheet.test.tsx`, `tests/e2e/accessibility.e2e.spec.ts`,
`tests/e2e/cagr-sheet.e2e.spec.ts`）はすべて作業ツリー上のみに存在する。
J-1〜J-3 を反映してからコミットするのが望ましい。

## J-5【低優先・継続】実機幅での目視確認

前回・前々回から変わらず未実施。`position: fixed` のボトムシート表示位置を、実機または
ブラウザのデバイスエミュレーションで目視確認する項目が残っている（プラン 63 行）。

---

# 対応順序（未解決分）

1. **J-1**（lint 警告の解消）— エフェクト内でのローカル変数退避。1 箇所
2. **J-2**（`ChartInfoButton` のフォーカス復帰テスト T13/T14）
3. **J-3**（spec.md に R8e・テスト一覧・`useFocusTrap` を追記）
4. **J-4**（`pnpm build && pnpm test:e2e` まで通してからコミット）
5. **J-5**（実機目視確認）
