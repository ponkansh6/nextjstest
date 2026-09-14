# nextjstest/src/app/components/

## Responsibility

クライアント側の経済指標ダッシュボードを構成するチャート、フィルター、ナビゲーション、tooltip、データテーブルの表示コンポーネント群。`CpiChart` を composition root として、サーバーから渡された表示用データを7チャートへ接続する。

## Design

- `CpiChart.tsx` は composition root。表示範囲、URL/advanced、凡例、四半期、CAGR、セクションナビゲーションの状態と hooks、表示用の派生データ、navigation、filter、dataTables生成を保持する。
- `CpiChartSections.tsx` は7セクション（`section-cpi-major` / `section-stacked` / `section-consumption-nominal` / `section-consumption-real` / `section-earnings` / `section-residual` / `section-new-graph`）の描画を担当する。消費支出・給与・残差・新グラフは `LazyMount` と dynamic import で遅延表示する。
- Recharts系のチャートへ共通のテーマ、凡例操作、tooltip controllerをpropsで渡し、表示用hooksと設定・定数を組み合わせる。

## Flow

`page.tsx` → `CpiChart` → `useCpiChartDisplayData` などで派生・filterしたデータ → `CpiChartSections` → 7チャート。`CpiChart` は `SectionTabs`/`ChartFilters` で navigation と期間を制御し、各チャートの下に `DataTablesSection` へ渡す dataTables を生成する。各 section の tooltip は共通 controller から bind し、チャートの data-table link と advanced toggle も section 側で描画する。

## Integration

`src/app/page.tsx` から CPI、四半期消費支出、給与の view-model を受け取り、`src/hooks/` の状態・派生データ hooks、`src/lib/chartConstants.ts` / `cpiChartConfig.ts`、`src/lib/chartInfoContent.ts` と連携する。チャート本体は `MajorIndicesChart`、`StackedAreaChart`、`SpendingBarChart`、`EarningsBreakdownChart`、`ResidualAreaChart`、`NewGraph` が担当し、`LazyMount`、`DataTablesSection`、`ThemeToggle` などの共通UIと接続する。
