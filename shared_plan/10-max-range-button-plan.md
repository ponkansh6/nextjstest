# 期間選択UIへの「最大期間」ボタン追加プラン

## 目的

期間選択ボトムシート（`ChartFilters` コンポーネント）において、ユーザーがワンクリックで 2005年 から最新年（`allYears` の最大値）までの最大期間に一括設定できる「最大期間」ボタンを新設する。これにより操作性を大幅に向上させる。

## 対象ファイル

1. **`shared_plan/10-max-range-button-plan.md`**（本プラン文書）
2. **`src/app/components/ChartFilters.tsx`** — 終了年 `<select>` の直右に「最大期間」ボタンを追加
3. **`src/app/components/CpiChart.module.css`** — `.maxRangeButton` クラスを追加し、`select` との高さ・パディング・フォーカス時の整合性を確保
4. **`tests/components/ChartFilters.test.tsx`** — 新規単体テスト（T1〜T3）の追加
5. **`tests/e2e/range-change.e2e.spec.ts`** — E2Eテストの追加（T-E2E-1〜T-E2E-3）
6. **`openspec/specs/nextjstest/spec.md`** — 仕様書に新要件 `R17` および Component Tree の変更を反映

---

## 実装手順

### 1. `ChartFilters.tsx` の変更

- `MIN_DISPLAY_YEAR` を `@/lib/chartConstants` からインポート
- `ChartFiltersProps` に変更はないが、終了年 select の直後に以下を配置:

  ```tsx
  <button
    type="button"
    className={styles.maxRangeButton}
    onClick={() => {
      const maxYear = allYears[allYears.length - 1] ?? MIN_DISPLAY_YEAR;
      setStartYear(MIN_DISPLAY_YEAR);
      setEndYear(maxYear);
    }}
  >
    最大期間
  </button>
  ```

  _(注: CpiChart 側で `handleSetStartYear` / `handleSetEndYear` がボトムシート自動クローズと URL 同期を担うため、親側から渡される setter がそれらであれば同様に機能するが、厳密には `ChartFilters` は setter をそのまま呼ぶ。CpiChart 側でラップした関数を渡す構成に変更するか確認)_
  **確認**: 親 `CpiChart.tsx` は `ChartFilters` に `setStartYear={handleSetStartYear}` / `setEndYear={handleSetEndYear}` を渡している。よって `ChartFilters` 内で独立して両方の setter を呼ぶと、シート閉じる処理が2回走るか、片方しか閉じない可能性がある。
  安全かつ確実な設計として、`ChartFilters` に `onSelectMaxRange?: () => void` を新設するか、あるいは `CpiChart` 側でハンドラーを統合したコールバックを渡す形にする。今回は `ChartFiltersProps` に `onSelectMaxRange?: () => void` を追加し、CpiChart 側で一括設定＋シートクローズを行うのが最もクリーン。

  修正案:
  - `ChartFiltersProps`: `onSelectMaxRange?: () => void` または親側で制御
  - シンプルに `ChartFilters` 内で `setStartYear` と `setEndYear` を両方呼ぶ専用ハンドラー（あるいは親から渡されるコールバック）を利用。CpiChart 側で `handleMaxRange = () => { setStartYear(MIN_DISPLAY_YEAR); setEndYear(latestYear); setRangeSheetOpen(false); }` と定義して `ChartFilters` に `onMaxRange` として渡すのが最も確実。

### 2. `CpiChart.module.css` の追加

```css
.maxRangeButton {
  padding: clamp(0.5rem, 1.39vw - 0.17rem, 1.5rem) clamp(1rem, 2vw, 2rem);
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

.maxRangeButton:hover {
  border-color: var(--blue-500);
  background-color: rgba(59, 130, 246, 0.05);
}

.maxRangeButton:focus-visible {
  outline: 2px solid var(--blue-500);
  outline-offset: 2px;
}
```

### 3. テスト計画

- **ユニット (`tests/components/ChartFilters.test.tsx`)**:
  - T1: 「最大期間」ボタンが正しく描画される
  - T2: クリック時に指定のコールバックが呼ばれる（または各 setter が呼ばれる）
  - T3: 冪等性の検証
- **E2E (`tests/e2e/range-change.e2e.spec.ts`)**:
  - T-E2E-1: 範囲を狭めた後に「最大期間」ボタンをクリックすると 2005〜最新年になる
  - T-E2E-2: ボタンクリックでボトムシートが自動的に閉じる
  - T-E2E-3: URL に `from=2005` と `to=<最新年>` が反映される

### 4. 仕様書更新 (`openspec/specs/nextjstest/spec.md`)

- Component Tree の `ChartFilters` に最大期間ボタンの記述を追記
- 新要件 `R17: Max Period Button` を追加
