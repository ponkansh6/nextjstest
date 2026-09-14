# nextjstest/src/hooks/

## Responsibility

表示用派生データと、Reactが所有するinteractive state、URL/storage/theme/scrollのブラウザ境界を提供する。

## Design

- `useCpiChartDisplayData`: 年範囲filter、四半期除外、既存`mergeChartData`を組み合わせる表示adapter。
- `useCagrState`: CAGR入力・結果・error・resetと既存計算呼び出しを所有。
- `useUrlState`: URLの`from`/`to`/`hidden`/`adv`を初期共有状態として読み、`history.replaceState`で同期。純粋なquery変換は`src/lib/urlState.ts`。popstate再同期とlocalStorage読取は行わない。
- `useAdvancedPreference`: CpiChartのReact stateから`newGraphShowAdvanced`だけを既存effect timingで`1`/`0`保存する一方向境界。`showAdvanced`だけでなく`startYear`、`endYear`、hidden-key依存値の変更でもeffectは再実行されるが、保存値はadvanced stateのみ。`setItem`例外は無視し、storageは初期復元に使わず、URLも更新しない。指定unit testでは、URL `adv=1`相当のReact入力と保存値`0`の組合せでReact stateが維持されURLが不変であること、unmount/remountで保存値を復元しないことを確認対象としている。
- `useSectionNavigation`: active section、scroll/scrollend、smooth scroll、LazyMount fallback、programmatic scroll抑制とcleanupを所有し、URL/storageには同期しない。
- `useChartTheme`: `matchMedia`を`useSyncExternalStore`で購読し、SSR snapshotはmobile/touchともfalse。themeの保存・DOM反映は`ThemeToggle`とlayoutのinline scriptが担当し、ThemeToggleの`setItem`/`removeItem` write failureはDOM・React state更新を妨げない。
- `useCpiChartData`/`useToggleSet`: 四半期・凡例のReact stateを所有。

## Flow

CpiChart props + URL → useUrlState → CpiChart React state → filtered/merged display data and chart components。変更はCpiChart React state → useUrlState.updateUrl → URLへ流れるが、URLの`hidden`は積み上げ系列`stackedHiddenKeys`だけを表し、通常凡例`hiddenKeys`、移動平均凡例`maHiddenKeys`、nominal/real stateはReact所有。advanced保存だけはReact state → useAdvancedPreference → localStorageへ流れる。advanced effectは期間・hidden-key依存でも再実行されるが保存するのはadvanced stateだけで、`setItem`例外は無視する。四半期/CAGR/section stateもReact所有。themeは`ThemeToggle`が`theme`へ`light`/`dark`を保存し、systemで削除して`data-theme`を更新し、切替時のstorage write failureはDOM・React state更新を妨げず、layoutのinline scriptがpaint前に保存値を適用する。theme用URL keyは使わない。確認済みのadvanced固有テストでは保存値によるReact state上書き・URL書換えがなく、remountでも保存値を復元しない。これは一般的なURLとlocalStorageの優先順位、実リロード、`popstate`契約を確定するものではない。

## Integration

hookは公開props/API/データモデルを変更しない。`popstate`対応、URL/localStorage競合の新優先順位、storageからURLへの自動書き戻し、不正値の新たな厳格化は追加していない。
