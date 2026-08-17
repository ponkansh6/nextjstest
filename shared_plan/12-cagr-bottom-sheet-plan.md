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
