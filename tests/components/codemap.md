# nextjstest/tests/components/

## Responsibility

Clientチャートと操作UIの描画・操作契約を検証する。`BottomSheet`、`CagrPanel`、`ChartFilters`、`ChartInfoButton`、`CustomTooltip`、`SpendingBarChart`、`ThemeToggle`およびCpiChartの表示回帰を対象とする。`ThemeToggle`では型アサーション後の不正legacy値の現行表示、storage read例外のthrow、write例外の吸収を確認する。

## Design

Testing LibraryとVitestでDOM、props、ユーザー操作、tooltip・凡例・期間表示を検証し、`minimal.test.tsx`、`all.test.tsx`、`plan24-rendering-fixture.test.tsx`は軽量/統合的な描画fixtureを提供する。`real-consumption-support-series.test.tsx`と`chart-y-axis-domain.test.tsx`は消費系列固有の境界を固定する。

## Flow

`tests/utils/logic-setup.tsx`等の環境・Recharts mock → component render → 操作イベント/props/表示DOM → 回帰アサーション。実データを必要とするテストはfixtureまたはloader経由で、コンポーネント内部の状態だけに依存しない。

## Integration

Phase 1で`CpiChart`から分離された`CpiChartSections`、`cpiChartConfig`、`useCpiChartDisplayData`、`useCagrState`、`useSectionNavigation`、`useUrlState`の接続を、既存の7セクション・表示順・URL同期・CAGR・advanced系列の契約として間接的に保護する。公開propsとServer→Clientデータ境界は変更しない。
