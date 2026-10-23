# モバイル使いやすさ改善計画

- 作成日: 2026-10-23
- 状態: 計画のみ / 未着手
- 対象: 7つのCPIチャートセクションを使うモバイル利用体験
- 計画の保存先: `shared_plan/60-mobile-usability-improvement-plan.md`

## 目的

スマートフォンで、利用者がセクションを移動し、期間を変え、複数系列を比較し、共有URLまたはブラウザーの戻る・進む操作から元の状態へ戻れるようにする。狭い画面での誤タップ、チャート操作とページ縦スクロールの競合、凡例やダイアログの操作しづらさを実機・画面幅ごとに測り、根拠が確認できた箇所を改善する。

モバイルの課題検証に加え、現代的なUI表現と技術導入による体験向上も検討する。デザイン方向は、CSS tokensで色/余白/角丸/チャート色を整え、見出しと数値のタイポグラフィ階層、読みやすい余白、カード内の情報階層、選択状態が明確なchip、タップ後の控えめな操作feedbackを試作候補とする。P0で現状と既存体系を確認し、改善効果のある範囲に限って段階適用する。

優先ユーザーフロー:

1. CPI主要、CPI費目別、消費名目、消費実質、給与、給与物価差、3種比較の7セクション間を移動する。
2. セクションの期間を変更して、意図した期間のチャートを表示する。
3. 凡例や系列コントロールで系列を比較し、必要な説明を確認する。
4. URLを共有するかブラウザーの戻る・進むを使い、表示セクションと期間を意図した状態に復帰する。

## 先行計画との関係

- [01-uiux-improvement-plan.md](./01-uiux-improvement-plan.md) は以前のUI/UX改善計画であり、モバイル幅375–430pxや主要操作44pxを扱っている。タブ、期間プリセット、凡例、遅延マウント等の既対応項目を再実装せず、今回の実測と残課題の判定に使う。
- [58-project-readiness-improvement-plan.md](./58-project-readiness-improvement-plan.md) は完了済みの実行準備・データ契約等の計画。今回のモバイル操作改善とは直接の変更対象を共有しない。
- `59-unused-code-cleanup-plan.md` と監査記録は完了済みだが、59番の番号は複数成果物で使われている。新規計画は未使用の60番にする。

## 現状の確認済み事実

コードと既存計画を確認して分かった範囲を記す。端末上の実寸、画面の見え方、ユーザビリティの良し悪しをコードだけから断定しない。

| 確認済み事実                                                                                                                                                                         | 根拠                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7セクションの定義はチャート設定にまとまり、ページからチャート本体、セクション構成へつながる。                                                                                        | [cpiChartConfig.ts](../src/app/components/cpiChartConfig.ts)、[page.tsx](../src/app/page.tsx)、[CpiChart.tsx](../src/app/components/CpiChart.tsx)、[CpiChartSections.tsx](../src/app/components/CpiChartSections.tsx) |
| セクションタブは44px高で横スクロールし、期間ボタンはその横スクロール領域の外に固定される。                                                                                           | [CpiChart.module.css](../src/app/components/CpiChart.module.css)、[SectionTabs.tsx](../src/app/components/SectionTabs.tsx)                                                                                            |
| タブタップ時は横方向の即時スクロールを使い、iOS/WebKitで横方向の `scrollIntoView(smooth)` とページの縦スクロールが競合する既知の問題を避ける処理がある。                             | [SectionTabs.tsx](../src/app/components/SectionTabs.tsx)、[useSectionNavigation.ts](../src/hooks/useSectionNavigation.ts)                                                                                             |
| CSSにはセレクト/期間操作の44px指定がある一方、モバイルの凡例を44px未満に圧縮する意図を記したコメントもある。別箇所には凡例を折りたたむ要約表示と、モバイル時の折りたたみ制御がある。 | [CpiChart.module.css](../src/app/components/CpiChart.module.css)、[CpiChartSections.tsx](../src/app/components/CpiChartSections.tsx)、[SpendingBarChart.tsx](../src/app/components/SpendingBarChart.tsx)              |
| ボトムシートにはEscape、背景タップ、閉じる操作、フォーカス制御があり、CSSで通常/compact/横向きの高さを切り替えている。                                                               | [BottomSheet.tsx](../src/app/components/BottomSheet.tsx)、[CpiChart.module.css](../src/app/components/CpiChart.module.css)                                                                                            |
| 下方セクションの遅延マウントと、レイアウト変化後のスクロール位置調整がある。                                                                                                         | [LazyMount.tsx](../src/app/components/LazyMount.tsx)、[useSectionNavigation.ts](../src/hooks/useSectionNavigation.ts)                                                                                                 |
| 期間状態はURLと連動するフックが担当する。戻る/進むを含めた実機上の復帰品質は、この確認だけでは分からない。                                                                           | [useUrlState.ts](../src/hooks/useUrlState.ts)、[ChartFilters.tsx](../src/app/components/ChartFilters.tsx)                                                                                                             |
| 既存実装の主要操作44px目標と、WCAG 2.2 AAの最小ターゲットサイズ基準は同じ値ではない。                                                                                                | [WCAG 2.2 SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)                                                                                                                             |

## 未確認の仮説と実装前に解決する事項

以下は現時点で欠陥と判定していない。P0で計測し、実機または操作確認の記録を残してから採否を決める。

- 凡例の圧縮CSSが実際に適用される画面幅・状態で、操作対象の実寸が44pxを下回るか。CSSの44px要件と適用範囲が衝突するか、余白や隣接ターゲットの間隔で使いやすさが確保されるか。
- iOS Safariでセクション移動後の縦位置、横タブの可視位置、戻る操作が安定するか。既存のSafari向けスクロール制御は保護対象とし、再現確認なしに置き換えない。
- 320 CSS px、文字拡大、長い日本語ラベル、ダークモード、横向きで横はみ出しやラベル切れが起きるか。
- チャートの初回表示や遅延マウントで空白、レイアウトシフト、操作待ちが見えるか。現行環境での値は未測定であり、時間・Lighthouseスコアの既成値を置かない。
- シートの開閉、画面回転、ブラウザーUI表示時に高さとスクロールロックが適切か。ネイティブselectのピッカーやフォーカス復帰を含め端末で確認する。
- 共有URLと戻る/進むでセクション、期間、系列表示がどの範囲まで復帰するのが現在の仕様か。現行URLモデルと仕様書を実装前に照合する。
- 実機検証端末が利用可能か。iOS Safari/Android Chrome実機を用意できない場合、その範囲は未検証と明記する。

## 対象範囲

画面の主要な7セクション、上部のセクションタブと期間操作、チャートの凡例/系列切り替え、説明シート、期間フィルター、URLとブラウザー履歴による状態復帰を対象にする。既存のチャート種別・データ計算の変更は、モバイルで読める代替表現に必要な場合に限り、その必要性と仕様影響を先に記録する。

## 実施計画

タスクは小さく分け、実測結果に応じて範囲を確定する。各完了条件を満たしたら記録を残し、段階を進める。

### P0 — 現状を実測する

**対象パス:** `src/app/page.tsx`、`src/app/components/CpiChart.tsx`、`src/app/components/CpiChartSections.tsx`、`src/app/components/CpiChart.module.css`、`src/app/components/SectionTabs.tsx`、`src/app/components/BottomSheet.tsx`、`src/hooks/useUrlState.ts`、`src/hooks/useSectionNavigation.ts`、`shared_plan/01-uiux-improvement-plan.md`。

**実施内容:**

- 320、375、390、430 CSS pxで7セクションを確認し、横向きも含めてページ幅、主要操作の実寸、ターゲット間隔、折返し、固定要素の重なりを記録する。
- 凡例の各状態（折りたたみ/展開、系列数の違い）で、44px未満へ圧縮される要素が実際に操作ターゲットか、どのCSSが適用されるかを測り、既存44px目標との関係を整理する。
- iOS SafariとAndroid Chromeの実機で、セクション移動→期間変更→系列比較→元の状態への復帰/URL共有を通しで行う。実機がなければOS・ブラウザーと未検証範囲を記録する。
- 誤タップ、タスク完了率、ユーザー操作手数、初回表示の体感時間、レイアウトシフトをベースラインとして測定する。母数・手順・条件を添え、実測前に達成値を仮定しない。
- 01計画との重複、すでに存在する保護実装、未解決の差分を照合する。

**完了条件:** 画面幅・OS/ブラウザーごとの計測表と再現手順があり、確認済みの問題、問題でない箇所、端末制約による未検証項目が区別されている。凡例の実寸と適用CSSが記録され、44px目標との関係を説明できる。

**依存:** なし。P1以降はP0の所見を受けて実施範囲を決める。

### P1 — 移動導線、期間、シート、凡例

**対象パス候補:** `src/app/components/SectionTabs.tsx`、`src/app/components/CpiChart.module.css`、`src/app/components/BottomSheet.tsx`、凡例/系列コントロール各コンポーネント、`src/app/components/ChartFilters.tsx`、`src/hooks/useSectionNavigation.ts`、`src/hooks/useUrlState.ts`。

**実施内容:**

- P0で問題が再現した操作に絞って、押しやすさ、視認性、状態の分かりやすさを改善する。タブ横スクロール領域と独立した期間操作、およびSafariで縦スクロールと競合しない既存処理を保つ。
- シートは必要な場合、safe area、`dvh`等のビューポート単位、横向き高さ、内部スクロール、背景ページのスクロールロックを見直す。開閉後にフォーカスを起点へ戻し、キーボード操作時のフォーカストラップとEscapeを確認する。
- 凡例の圧縮は実測で操作性への影響が確認された場合のみ修正する。省略や折りたたみを使う場合も、系列名と状態を利用者が認識できるようにする。長い日本語ラベル、`select`のネイティブピッカー、読み上げを確認する。
- URL同期の変更が必要なときは、既存URL形式と戻る/進むの意味を維持して、表示状態の保存対象を明確にする。

**完了条件:** P0で確認した導線上の問題が再現手順で解消し、全7セクションで期間変更・シート開閉・凡例操作が利用可能。履歴/URLの復帰仕様が確認され、直接URL表示と戻る/進むの結果が記録されている。

**依存:** P0の計測記録と対象を確定した受入条件。

### P2 — チャート可読性と触らず読める代替

**対象パス候補:** `src/app/components/StackedAreaChart.tsx`、`src/app/components/SpendingBarChart.tsx`、`src/app/components/EarningsBreakdownChart.tsx`、`src/app/components/ResidualAreaChart.tsx`、`src/app/components/NewGraph.tsx`、該当するチャートCSS。

**実施内容:**

- 狭幅で軸、目盛り、単位、凡例、注釈が読めるかをセクションごとに確認する。必要なら表示密度、ラベル間隔、系列の見分け方を見直し、色だけを頼りにしない。
- タップやホバーがないとデータ値を読めない箇所が確認された場合、読み上げ可能なデータ要約、表または同等の非ジェスチャー操作を検討する。既存の仕様とデータ契約を調べ、選んだ代替をWHEN/THEN要件にする。
- 画面回転・リサイズ後にチャート幅が更新されること、遅延マウント後に幅計測が0や古い値にならないことを確認する。

**完了条件:** 各対象セクションで軸・単位・系列の意味を識別できる。必要な代替表示はキーボードとスクリーンリーダーで到達でき、同じデータ値を確認できる。不要と判断した変更は、P0の証拠に基づく理由を記録する。

**依存:** P0の可読性/操作計測、P1で発生したチャート領域への影響。

### P3 — 回帰、アクセシビリティ、性能の確認

**対象パス:** 変更したコンポーネントとCSS、関連テスト、`openspec/specs/nextjstest/spec.md`。

**実施内容:**

- 320/375/390/430 CSS px、横向き、デスクトップで回帰を行い、iOS Safari/Android Chrome実機の可用性を記録する。ダークモード、拡大、キーボード、スクリーンリーダーも確認する。
- 変更後のユーザータスク所要手数、誤タップ、完了率、初回表示/レイアウトシフトをP0と同条件で比較する。Lighthouse mobileも同条件で前後比較し、測定値と環境を記録する。実測前の数値目標は作らない。
- 初回描画、遅延マウント、ResponsiveContainerのサイズ確定を確認する。対応端末で縦スクロールを奪わないことと操作応答性を確認する。
- 変更がデータソース、データフロー、コンポーネントツリー、要件に影響する場合、実装と並行して仕様書の該当セクションを更新する。要件にはWHEN/THENシナリオを追加する。

**完了条件:** 変更前後の比較表と端末カバレッジがあり、未検証が明示されている。影響する仕様セクションとWHEN/THENが実装と一致し、回帰確認で既存の7セクション、URL復帰、デスクトップ表示が維持されている。

**依存:** P1/P2実装とP0のベースライン。

## テクニカルキーポイント

- **Next.jsと描画境界:** 実装に着手する前に、このリポジトリのNext.jsのローカルガイドを読み、現行バージョン固有のAPI・非推奨事項を確認する。`window`、`matchMedia`、ResizeObserver、ビューポート幅に依存する処理はClient Component境界に置き、Server/Client間のpropsをシリアライズ可能にする。初期HTMLとhydration後の表示が端末幅で食い違わないようにし、幅依存の構造変更が必要ならCSS優先で表現する。
- **URLとReact state:** URLを共有可能な状態の正本として扱う範囲と、開閉状態など一時的なstateの範囲を分ける。`pushState`/`replaceState`の使い分け、`popstate`反映、戻る/進む、直接アクセス、無効なパラメーターを確認する。URLとstateの二重管理やhydration後の上書きを避ける。
- **Rechartsとレイアウト:** ResponsiveContainerが測定できる親幅・高さを確保する。遅延mountやタブ移動後にコンテナが可視化/リサイズされた場合の再計測と、チャート高さ確定前のCLSを調べる。回転・アドレスバーの伸縮、`dvh`/safe area、横向き高さを実機で確認する。
- **タッチと縦スクロール:** 操作ターゲットはプロジェクト目標44×44 CSS px以上を基本とし、圧縮がある場合は実寸と間隔、WCAG例外の適用可否を記録する。横スワイプ可能領域やチャート操作がページの縦スクロールを妨げないか、Safari向けの即時スクロール制御を含め検証する。
- **シートとフォーカス:** ダイアログの内部スクロール、背景スクロールロック、Escape、フォーカストラップ、閉じた後のフォーカス復帰を確認する。画面下端のsafe area、ブラウザーUIによる高さ変化、回転時の再計算も含める。
- **入力・文字・支援技術:** 期間選択のネイティブselect/picker、長い日本語ラベル、文字拡大、キーボードフォーカス、スクリーンリーダー名と状態を確認する。新規依存は必要性、標準APIでの代替、保守負担を調べたうえで採否を決める。
- **表示設定:** `prefers-reduced-motion`時は不要なスムーズスクロールやアニメーションを抑える。ダークモード時にチャート系列、境界、フォーカス表示のコントラストを確認する。
- **仕様同期:** 仕様正本は `openspec/specs/nextjstest/spec.md`。実装時に影響範囲に応じてData Sources、Data Flow、Component Tree、Requirementsを同期し、新要件はWHEN/THEN形式にする。今回の計画作成では仕様正本を変更しない。

## 検証基準とマトリクス

### 画面/環境

| 環境                   | 確認内容                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| 320 CSS px             | 横はみ出し、文字切れ、ターゲット間隔、reflow                       |
| 375 / 390 / 430 CSS px | 7セクションの導線、期間、凡例、シート、グラフ幅                    |
| 横向き                 | シート高さ、セーフエリア、チャート再計測、フォーカス可視性         |
| iOS Safari実機         | タブ横移動と縦スクロール、シート、ネイティブpicker、戻る/進む      |
| Android Chrome実機     | 同一ユーザーフロー、タッチと縦スクロール、シート、戻る/進む        |
| デスクトップ           | 既存レイアウト、タブ/期間/URL、キーボードとチャート回帰            |
| 全環境の表示設定       | ダークモード、拡大、キーボード、スクリーンリーダー、reduced motion |

実機を使えないOS/ブラウザーは未検証として残す。DevToolsエミュレーション結果を実機結果として扱わない。

### アクセシビリティの確認基準

- 44px以上はこのプロジェクトの主要操作に対する目標とし、WCAG適合値とは区別する。
- WCAG 2.2 AAのSC 2.5.8は原則24×24 CSS px以上で、間隔等の例外を含む基準である。[Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- 320 CSS px相当の幅で、二次元レイアウトが本質的な場合等の例外を除いて、情報/機能を失わず縦方向にreflowできることを確認する。[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- 通常テキスト4.5:1、大きな文字3:1をコントラスト確認の基準として扱う。[Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- キーボードで全機能を使え、フォーカスが見え、固定UI等に完全に隠れないか確認する。[Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)、[Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)、[Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- 以上は計画上の確認項目であり、AA全体への適合を宣言するものではない。

### 比較方法

P0で同じタスク、画面幅、端末、期間、計測方法のベースラインを取る。P3で同条件を再実施し、タスク完了率、操作手数、誤タップ、初回表示/CLS、Lighthouse mobile値を並べる。参加者数、試行数、端末、ビルド、測定手順を併記し、測れなかった項目は「未測定」とする。事前に根拠のない一律の改善率やスコアを受入条件にしない。

## 実装時の検証コマンド

この計画の作成時点でpackage scriptsとして確認できている候補は `lint:fast`、`type-check`、`test`、`test:coverage`、`test:hook-smoke`、`test:browser:component:jev`、`test:browser:routes:jev`、`lighthouse:mobile`、統合ゲートの `test:full`。実装開始時に `package.json` を再確認し、変更箇所に必要なscriptのみを選ぶ。`test:browser:all` はbuildを含む全scope向け。専用 `test:e2e` と `spec-refs` scriptは存在しないため、仕様参照は仕様書とコードを照合する。テスト実装は実装担当が行い、実行・検証はOrchestratorが行う。JEV判定をlint、型チェック、テストの代替にしない。

## 対象外

- 今回は計画の作成と保存のみ。UIコード、仕様正本、既存計画は変更しない。
- CPIデータ/APIや算出ロジックの変更は対象外。モダン技術の部分導入を検討し、サイト全体のデザイン刷新は必須としない。
- 新しい依存ライブラリは即決せず、候補比較と小範囲PoCの後に採否を決める。
- Lighthouseや実機に関する結果を事前に仮定・捏造しない。

## モダンなUI/UX技術の導入候補

既存の技術やCSS体系をpackage/CSSで確認し、新規導入と既存活用を区別する。PoCは不具合の再現を必須条件にせず、操作体験の向上を目的に実施できる。採用前に対象範囲、保守コスト、性能、アクセシビリティ、フォールバックを比較する。

| 候補                                                                    | 利点 / コスト                                                                                                                   | PoC・採用条件・フォールバック                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CSS container queries（高い価値 / 低コスト）                            | 親幅に合わせた部品単位の調整。CSS Modulesと併用できる。                                                                         | 1カードで試し、効果があれば拡張。media queryへ戻せる形にする。[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)                                                                                                                                                                                                                                                                           |
| CSS custom properties（高い価値 / 低コスト）                            | 色、余白、角丸、44pxタップ目標、チャート色を一貫管理できる。                                                                    | 既存トークン体系があれば差分だけ整理し、重複定義の解消に使う。[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties)                                                                                                                                                                                                                                                             |
| CSS scroll snap（中程度の価値 / 低コスト）                              | 横タブ等の停止位置を整えられる。                                                                                                | 横方向の限定領域でproximityをPoC。ページ縦スクロールとSafari向け既存制御を壊さず、既存の通常scrollへ戻せること。[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap)                                                                                                                                                                                                                                           |
| native dialog / Radix Dialog / shadcn Drawer（中程度の価値 / 中コスト） | 現BottomSheetと比較し、native `showModal()`のtop layer/inert、Radixのfocus管理、shadcnのRadix(Vaul)/Base UI両flavorを評価する。 | P1で現状実装と比較するPoC。drag操作は別機能として評価し、flavor、依存、CSS整合、iOS挙動を比較してから選ぶ。[MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)、[Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)、[shadcn Radix Drawer](https://ui.shadcn.com/docs/components/radix/drawer)、[shadcn Base Drawer](https://ui.shadcn.com/docs/components/base/drawer) |
| Motion（低〜中程度の価値 / 中コスト）                                   | 状態更新のフィードバックやシートの小さな演出。                                                                                  | CSSだけで不足する場合に小範囲PoC。reduced motionと性能を測り、CSSまたは即時表示へ戻せること。[Motion for React](https://motion.dev/docs/react)、[useReducedMotion](https://motion.dev/docs/react-use-reduced-motion)                                                                                                                                                                                                                 |
| View Transitions（低い価値 / 中コスト）                                 | セクション遷移の視覚的な連続性。                                                                                                | 任意の実験PoC。`document.startViewTransition`はfeature detectionし即時更新にfallback。React版はReact 19.2での安定性を実装時に再確認し、実験用途に留める。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition)、[React](https://react.dev/reference/react/ViewTransition)                                                                                                                             |

候補は全面置換の前提にせず、効果が見込める小範囲に段階導入する。PoCごとに対象、比較結果、bundle/性能影響、a11y確認、依存追加理由とfallbackを記録する。P2のチャート代替表/要約は上記候補と別に、タッチやホバーなしで値を読めないという所見がある場合に試作する。
