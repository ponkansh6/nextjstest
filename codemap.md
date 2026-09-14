# nextjstest/

## Responsibility

Next.js App Router の経済指標ダッシュボード。サーバーでCSV/e-Stat由来データを読み込み、CPI・CTI・給与・GDPの表示用モデルを作り、クライアントで7チャート、凡例、期間、四半期、CAGR、テーマを操作する。

## Design

- `src/app/page.tsx` はデータを組み立てる Server Component、`CpiChart` は表示とクライアント状態を組み立てる Client Component。
- `src/app/components/CpiChartSections.tsx` は7セクション（`section-cpi-major` / `section-stacked` / `section-consumption-nominal` / `section-consumption-real` / `section-earnings` / `section-residual` / `section-new-graph`）の描画を担い、`LazyMount`、tooltip、advanced toggle、data-table link を各セクションへ組み込む。
- データ境界は `server/lib/data-loader` → `server/lib/view-models/` → `CpiChart` → 既存adapter/表示用hook → `charts`/tables。
- URL共有状態は `from` / `to` / `hidden` / `adv`、個人設定は `newGraphShowAdvanced` / `theme`。URL状態の正本はURLで、advancedはURLから初期化しlocalStorageから復元しない。themeはtheme storageと`<html data-theme>`を同期する。
- 四半期表示、CAGR、セクションナビゲーション、凡例表示はReact state/hooksが所有する。公開props、API、データモデル、7チャートは維持する。

## Flow

`page.tsx`（RSC）→ server loader/view-model → `CpiChart` → `useCpiChartDisplayData`・既存adapter・表示用hooks → 7チャート/tooltip/details table/CSV。

URLは`useUrlState`と`src/lib/urlState.ts`で既存queryを保持しながら`history.replaceState`へ同期する。`hidden`はCpiChartの積み上げ系列`stackedHiddenKeys`だけを表し、通常凡例`hiddenKeys`、移動平均凡例`maHiddenKeys`、nominal/real stateはReact所有。advancedの保存は`useAdvancedPreference`が担当し、期間・hidden-key依存でもeffectは再実行されるが保存値はadvanced stateだけ。CAGRは`useCagrState`、セクションは`useSectionNavigation`、テーマとviewport判定は`ThemeToggle`/`useChartTheme`が担当する。storageからURLへの自動書き戻し、popstate対応、新しい不正値厳格化は行わない。

## Integration

サーバーのe-Stat routeは`server/lib/estat.ts`を介してstats-list/meta/dataを提供する。チャート定義は`cpiChartConfig.ts`、表示用派生データは`useCpiChartDisplayData.ts`、URLの純粋変換は`src/lib/urlState.ts`に分離されている。useChartThemeはuseSyncExternalStoreでmatchMediaを購読し、SSR snapshotはmobile/touchとも`false`。layoutのinline scriptはpaint前にtheme storageをdata-themeへ反映する。
