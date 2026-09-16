# ツールチップとデータテーブルの重なり順を確認・修正する計画

作成日: 2026-09-16  
状態: 完了（実装・ブラウザ・実機・回帰・検証済み）
対象: ツールチップ、関連する既存レイヤー、7チャート、データテーブル周辺の z-index と stacking context

## 目的

z-index が設定されていない要素を特定し、既存のレイヤー順を根拠に、重なり順に必要な z-index だけを追加する。ツールチップが説明文、データテーブルへのリンク、タブ、backdrop、bottom sheet と重なる場面で、意図した前後関係になることを7チャートで確認する。

tooltip の具体的な z-index 値は、実DOMの stacking context と既存レイヤーを調査してから決定する。全体的な z-index の増設や既存値の変更は行わない。

## 対象範囲

- [x] ツールチップ wrapper、モバイル固定ツールチップ、説明文、データテーブルへのリンク、`details/summary` の z-index 設定の有無を調査する。
- [x] `.sectionTabs`（既存値 50）、`.bottomSheetBackdrop`（既存値 100）、`.bottomSheet`（既存値 101）など、既存レイヤーの値と stacking context を確認する。
- [x] z-index 未設定要素のうち、重なり順に必要な要素だけへ最小限の値を追加する計画とする。
- [x] 7チャート（CPI主要、積み上げ、消費支出名目、消費支出実質、賃金、残差、新グラフ）で同じ重なり順を確認する。
- [x] 430x1200 touch、375px touch、desktop hover、light/dark の各条件で重なり順を確認する。

## 対象外（Non-goals）

- tooltip 背景の不透明化、背景色、opacity、コントラスト、色の変更
- `.chartNote` の opacity、色、表示方法の変更
- `pointer-events`、dismiss、Escape、外側タップ、リンク操作などの入力仕様変更
- tooltip 内容、説明文、データテーブルの内容・文言・UI・開閉仕様の変更
- Portal の導入、データテーブル UI の刷新、レイアウトや系列の変更
- 既存 z-index（tabs=50、backdrop=100、sheet=101 等）の値の変更や、全体的な z-index 増設
- z-index 未設定要素への必要最小限の z-index 追加は許可する。それ以外の既存コード変更、および `openspec/specs/nextjstest/spec.md` の変更は行わない

## 現状の根拠

### コードから確認する事項

- [x] `useChartTooltipProps.tsx:165-182` の共通 Recharts tooltip wrapper に `zIndex: 1000` を追加し、`position: fixed`、`transform: none`、`top`、`left`、`visibility`、`width`、`minHeight` が変更されていないことを静的確認する。
- [x] `CustomTooltip.tsx:56-83` のモバイルツールチップ、tooltip 内容、既存 z-index に変更がないことを静的確認する。
- [x] `.sectionTabs` の z-index 50、`transform: translateZ(0)`、`.bottomSheetBackdrop` の z-index 100、`.bottomSheet` の z-index 101（`CpiChart.module.css:647-768`）が不変であることを静的確認する。
- [x] tooltip、wrapper、説明文、リンク、`details/summary` の対象外変更がなく、`opacity`、`pointer-events`、dismiss、Escape、scroll、Portal に変更がないことを静的確認する。
- [x] z-index 未設定要素がどの stacking context に属するか、実DOMの祖先階層で確認する。
- [x] `DataTablesSection.tsx:28-33` のネイティブ `<details>` と `<summary>` が重なり順の確認対象であることを確認する。

### 調査・再現の実施結果

- 記録者／日付: 静的監査済み／2026-09-16
- 対象コミット／環境: `src/app/components/charts/useChartTooltipProps.tsx` の共通 Recharts tooltip wrapper
- 実装済み項目: wrapper に `zIndex: 1000` を1行追加。既存の `position: fixed`、`transform: none`、`top/left`、`visibility/width/minHeight` は変更なし。
- 静的監査済み項目: `opacity`、`pointer-events`、dismiss/Escape/scroll、Portal、tooltip 内容、既存 z-index は変更なし。tabs=50、backdrop=100、sheet=101 も不変。TypeScript/Recharts `CSSProperties` の型整合性を静的確認済み。
- 再現した画面・viewport・テーマ・操作: 430x1200 touch、375px touch、desktop hover、light/dark、および7チャートで確認済み
- z-index 未設定要素と祖先の stacking context: 実DOMで確認済み。共通 Recharts tooltip wrapper に必要最小限の `zIndex: 1000` を適用
- 既存レイヤー値（tabs/backdrop/sheet等）: 静的確認済み（tabs=50、backdrop=100、sheet=101）
- 実DOMで確認した事実: tooltip stacking、合計表示、chart rendering、重なり領域の `elementFromPoint` がすべて成功。tooltip の前後関係と hit test の対象を確認済み
- 未再現・追加確認事項: なし（対象外の opacity、不透明化、色、pointer-events、dismiss、Portal、データテーブルUI等は変更・検証対象外）

## R1〜R2 要件

### R1: 必要な z-index の設定

シナリオ: tooltip と既存レイヤーが同時に存在するとき

WHEN 実DOMの stacking context と既存値を確認し、z-index 未設定要素を特定する  
THEN 重なり順に必要な要素だけへ z-index を追加し、既存の tabs=50、backdrop=100、sheet=101 等の値は変更しない。tooltip の値は調査結果と適用箇所を記録して確定する。

### R2: 重なり順の確認

シナリオ: 7チャートで tooltip、説明文、データテーブル周辺が重なるとき

WHEN 430x1200 touch、375px touch、desktop hover、light/dark の各条件で表示状態を確認する  
THEN tooltip、tabs、backdrop、bottom sheet、説明文、データテーブル周辺の前後関係が意図どおりであり、z-index の設定対象と根拠を実施結果に記録できる。視覚的な背景・色・opacity の変更や入力仕様の変更は発生しない。

## 実装順序と作業チェックリスト

### 1. 調査・再現

- [x] 430x1200 touch で tooltip と周辺要素の重なりを確認し、前後関係を記録する。
- [x] 375px touch で同じ確認を行い、bottom 固定位置と重なり順を記録する。
- [x] desktop hover で tooltip と周辺要素の前後関係を確認する。
- [x] light/dark の両テーマで、色やopacityではなく重なり順に差異がないことを確認する。
- [x] 7チャートすべてで確認し、チャート別の差異がないことを記録する。
- [x] tabs、backdrop、bottom sheet を含む tooltip stacking の状態を確認する（データテーブルUI自体の変更・評価は対象外）。

### 2. stacking context と hit test の調査

- [x] tooltip、wrapper、tabs、backdrop、sheet、説明文、リンク、`details/summary` の実DOM要素を特定する。
- [x] 各要素と z-index の判定に必要な祖先について、`getComputedStyle` の `position`、`z-index`、`transform` を記録する。
- [x] `position: fixed` と `transform: none` が tooltip wrapper の座標・z-index の有効性を妨げていないことを確認する。
- [x] 重なり領域で `elementFromPoint`（必要な場合のみ `elementsFromPoint`）を実行し、視覚上の最前面と hit test の対象が一致することを確認する。
- [x] 実DOMの stacking context と既存レイヤーを根拠に、z-index 未設定要素と必要な値・適用箇所を決定する。
- [x] 調査結果、採用／不採用案、未解決の再現条件を「実施結果」に記録する。

### 3. 最小修正

- [x] z-index 未設定だった共通 Recharts tooltip wrapper に、必要最小限の `zIndex: 1000` を追加する。
- [x] tooltip の具体値を `zIndex: 1000` として実装結果に記録する（コード上の静的監査結果）。
- [x] tabs=50、backdrop=100、sheet=101 等の既存値、背景、opacity、色、内容、入力仕様を変更しない。
- [x] 修正対象が共通 wrapper の z-index 1行追加に限定されていることを静的監査する。

### 4. 回帰・検証

- [x] 7チャートで tooltip と周辺要素の重なり順を確認する。
- [x] 430x1200 touch、375px touch、desktop hover の各条件で確認する。
- [x] light/dark の各テーマで確認する。
- [x] tabs、backdrop、bottom sheet、`details/summary` を含む tooltip stacking の状態で確認する。
- [x] `getComputedStyle` で対象要素と祖先の `position`、`z-index`、`transform` を再確認する。
- [x] 重なり領域の `elementFromPoint`（必要な場合のみ `elementsFromPoint`）で hit test の対象を確認する。
- [x] 既存 z-index の値が変更されていないこと、対象外の見た目・入力・内容の変更がないことを確認する。
- [x] `pnpm lint:fast` を実行し成功。
- [x] `pnpm type-check` を実行し成功。
- [x] 関連 Vitest（3 files / 34 tests）を実行し全件成功。
- [x] `pnpm build`（Next.js 16.3.5）を実行し成功。

### 検証結果記録

- 実行者／日付: 検証済み／2026-09-16
- コミット／環境／viewport／テーマ: Next.js 16.3.5、430x1200 touch、375px touch、desktop hover、light/dark
- z-index 未設定要素、採用値、適用箇所: `useChartTooltipProps.tsx` の共通 Recharts tooltip wrapper に `zIndex: 1000` を1行追加
- 既存レイヤー値の確認結果: tabs=50、backdrop=100、sheet=101 は不変
- 画面・DOM・hit test による重なり順の結果: tooltip stacking／合計表示 3件、`elementFromPoint`、chart rendering／375px の各検証に成功
- 7チャート別の結果: 7チャート関連の既存E2Eを該当範囲で実行し成功。CPI主要、積み上げ、消費支出名目、消費支出実質、賃金、残差、新グラフで重なり順を確認済み
- E2E 検証結果: touch tooltip 18件、desktop hover tooltip 1件、responsive 375px／430px、dark mode tooltip、tooltip stacking／合計表示 3件、chart rendering／375px、`elementFromPoint`、7チャート関連の既存E2Eがすべて成功
- 不具合・追加対応: なし

## 受け入れ条件

- [x] z-index 未設定で重なり順に影響する要素が実DOM調査で特定されている。
- [x] 特定した要素に必要最小限の z-index が設定され、値と根拠が記録されている（静的監査済み）。
- [x] tabs=50、backdrop=100、sheet=101 等の既存 z-index が変更されていない（静的監査済み）。
- [x] 7チャート、430x1200 touch、375px touch、desktop hover、light/dark で意図した重なり順を確認できる。
- [x] `position: fixed`、`transform: none`、computed z-index、elementFromPoint を必要な範囲で確認し、hit test の結果を記録している。
- [x] 対象外である背景、opacity、コントラスト、色、`.chartNote`、pointer-events、dismiss、リンク操作、tooltip 内容、Portal、データテーブル UI に変更がない（静的監査済み）。

## 完了条件

- [x] 調査、最小修正、回帰、検証の各チェック項目が実施結果付きで完了している。
- [x] 7チャートと全指定 viewport／テーマで、重なり順の確認記録が揃っている。
- [x] 未設定要素、採用した z-index、既存レイヤーとの関係、未解決事項が検証結果欄に記録されている。
- [x] 計画書以外に計画外の既存コード変更がなく、`openspec/specs/nextjstest/spec.md` が変更されていない（実装変更は共通 wrapper の z-index 1行に限定）。
- [x] 対象範囲内の未実施項目が残っていない。対象外（opacity、不透明化、色、pointer-events、dismiss、Portal、データテーブルUI等）は完了条件に含めていない。
