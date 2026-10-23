# shadcn/ui Base UI Drawer によるチャートツールチップ代替の検討計画

- 作成日: 2026-10-23
- 更新日: 2026-10-23
- 状態: 実装とfocused gatesを検証済み。type-check、lint:fast、build、hook smoke、focused browser/component suitesはpass。component Browser Mode 24 filesは低負荷の分割実行で96 passed / 6 skipped。route Browser Modeはphase6-b01〜b09が20 passed、b10で2 passed / 1 failedを再現。b11〜b14とaggregate 22 files、coverage、全体採否、実機検証は未完了
- 対象: チャート上の `CustomTooltip` をBase UI Drawerで表示する案
- 計画の保存先: `shared_plan/61-shadcn-base-ui-drawer-adoption-plan.md`

## Purpose

技術的には置き換え可能で、連続して点を選ぶ必要がないため、選択した1点の詳細をmodal Drawerに表示する案を実装し、focused browser/component testsで検証した。Area/Lineのzero-movement tapはpointerdown/up後の同gestureのchart clickからindexを得る。直近focused browser runはChartTooltipDrawerとCpiChart-range-closeの2 files / 22 tests passで、synthetic swipe、stale captured close callback、programmatic range-change invalidation、data prop invalidation、unmountを含む。CpiChart component testは1 file / 6 tests passし、7つのCpiChartSections binding（Spending nominal/realを含む）から実resolverを呼び、period/keys/source row/valuesを照合する。以前のfocused browser 5 files / 32 tests、related component unit 4 files / 64 tests、CpiChart-renderable-bars 1/1もpassした。最終type-check、lint:fast、build、hook smoke、`git diff --check`もpass。coverageと全Browser Mode suiteは未完了である。R-T1のfocused evidenceは確認済みだが、R-T2はSpending実CSVの深い表示契約に限り、R-T3〜R-T7と計画全体の採否はpartialとして扱う。

本計画はチャートの `CustomTooltip` に限定する。モバイルで点を明示選択し、その点の詳細を読み、閉じた後に別の点を選べる体験を評価する。ドラッグしながら次々と値を選ぶ操作は要件にしない。

関連する [モバイル使いやすさ改善計画](./60-mobile-usability-improvement-plan.md) のチャート実測項目を再利用する。60番はチャートのモバイル操作全体、本計画はツールチップ表示をDrawerへ置き換える技術評価を扱う。60番のファイルは変更しない。

## 対象外

- CAGR、期間選択、BottomSheet、ChartInfoButton、およびそれらの操作。
- チャート点の連続scrubや、Drawerを開いたまま別の点・別チャートを選ぶ操作。
- Tailwind CSS、Radix UI全体、`components.json` の導入を前提にすること。
- 今回の計画書更新でのコード、依存、OpenSpec仕様の変更。採否後の実装時に必要な仕様変更は別工程とする。

## 現状と対象範囲

| 項目                   | 確認済み事項                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 構成                   | Next.js 16.4.2、React 19.2、CSS Modules、`@base-ui/react` 1.9.0、Recharts 3.10.1。Tailwind CSSと`components.json`はない。 [`package.json`](../package.json)                                                                                                                                                                                                                                                                               |
| tooltipの流れ          | [`useChartTooltipProps.tsx`](../src/app/components/charts/useChartTooltipProps.tsx) のcontrollerを [`CpiChart.tsx`](../src/app/components/CpiChart.tsx) が所有する。controllerは`activeChartId`とチャート別`activeIndices`を管理し、共通Tooltipから`CustomTooltip(active, label, payload[])`を描画する。                                                                                                                                  |
| 対象チャート           | `NewGraph`、`StackedAreaChart`、`EarningsBreakdownChart`、`SpendingBarChart`、`MajorIndicesChart`、`ResidualAreaChart`。種類は6つで、画面上のinstancesは複数。個別の描画dataはfiltered/range arrayで異なる。                                                                                                                                                                                                                              |
| payload                | Recharts entryの`name`、`value`、`color`、`dataKey`、`payload`を使い、`seriesMeta`、許可key、formatter、表示順、null処理、合計などへ結び付ける。選択indexと現在のchart dataを同時に扱う必要がある。                                                                                                                                                                                                                                       |
| 現行操作               | 実際に観測した`PointerEvent.pointerType`が最終入力modeを決め、touchはtap、mouse/penはhoverを使う。`pointer: coarse`はまだpointer eventがない初期状態のfallbackである。bar targetは描画shapeの`data-index`を使い、Area/Lineを含むtapはpointerdown/upで候補を保持した後、同gestureのRecharts chart clickが計算する`activeTooltipIndex`を使う。過去のhover/move indexは流用しない。CPIのprogrammatic scroll中はselection/tooltipを抑制する。 |
| 現行dismiss            | 縦優勢8px gesture、Escape、document pointerdown captureでのoutside dismiss、tooltip内touch処理、ページscroll 40pxでdismissする処理がある。guide/dotも選択に同期する。幅によるmobile判定と`pointer: coarse`判定は別であり、全touch端末が狭幅とは限らない。                                                                                                                                                                                 |
| 既存tooltip            | [`CustomTooltip`](../src/app/components/CustomTooltip.tsx) はARIA TooltipやDrawer primitiveではなく通常のdiv。touch向けclose button、狭幅での高さ制限と内部scrollがある。tooltip経路全体にはcontroller側のcapture listenerとCustomTooltip側のtouch処理があり、単純にDrawerで包むとPortalのoutside判定や既存dismissと競合しうる。                                                                                                          |
| 既存PoC                | [`BaseDrawer.tsx`](../src/app/ui-experiments/BaseDrawer.tsx) はCSS Modulesによる独自shadcn-style wrapperで、公式CLI生成物ではない。Drawer primitiveの比較材料にはなる。                                                                                                                                                                                                                                                                   |
| Recharts accessibility | アプリ側chart wrapperには`role="img"`、`aria-label`、`tabIndex=0`があり、controllerのEnter/Space handlerがchart centerを選択する。Drawerの`finalFocus`は選択chart内の`[role="img"]`へ戻す。keyboard/Tab/focusのbrowser regressionはfocused suiteに含むが、物理端末・支援技術での実機挙動は未確認。                                                                                                                                        |

## 維持するデータ契約と意図する変更

- 選択点に対応する期間、series、値、表示順、formatter、色、凡例、合計を現行表示と一致させる。R21の契約では0は`0.00`、null/undefined/missingは`—`、有限値だけを合計し、許可外・hidden系列を除外する。給与チャートの6系列、合計、375/430pxでの表示も確認する。
- 選択点とguide/dotを同期する。filter、range変更、chart切替、unmountで古いpayloadを表示し続けない。
- 一度に一つの選択点だけをDrawerへ固定表示する。閉じた後に別点を選び直す。Drawerを開いたまま別点へ移る互換性は求めない。
- modal中の背景操作抑止、focus管理、scroll lockを新しい表示モデルとして確認する。旧R15a-lのすべてのinteractionをそのまま保持することは採用条件にしない。
- modal中は旧ページscroll-dismissやglobal outside listenerがDrawerのclose経路と競合しないよう責務を整理する。既存tooltip表示時の40px scroll dismissは新しい要件にしない。

## 候補と暫定方針

採用した設計は **PC fine pointerでは既存hover tooltipを維持し、touch/coarse側では明示選択した点のsnapshotを独立hostの`modal=true` Drawerに表示する案**。point snapshotは同じtap/keyboard selectionが確定したchart data indexから、各chartのrange/filter済みrowと描画中seriesをRecharts-compatible entriesへ浅く変換して作る。Rechartsのclick payloadがそのgestureに紐づく場合は使えるが、Recharts click payloadがない、または過去のhover由来payloadしかないときにそれを流用しない。系列metadata、許可key、formatter、total条件などprojection settingsを保持し、独立hostのDrawer render時に既存`CustomTooltip` projectionを適用する。Tooltip内hostはactiveがfalseになった時点でTooltip contentと同時にunmountし、Drawer exit中の内容寿命とclose lifecycleを結合してしまうため採用しない。独立hostはexit完了までpayload snapshotを保持し、Base UIの完了通知で解放する。hoverの`active=true`だけではDrawerを開かず、有効tap/keyboard selectionと同じdata indexのsource row解決を同じcommitで行う。

| 案                                 | 内容                                                                                                                                                                                                                      | 検討点                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Tooltip content内でDrawerを描画 | Recharts TooltipのcontentからDrawerへpayloadを渡す。                                                                                                                                                                      | 既存payloadを利用しやすい。active=false、Tooltip unmount、Portalへのoutside判定、exit中の寿命と競合しないか。                                                                                                                                                                 |
| B: 独立host + 選択snapshot         | chart選択イベントで確定payloadを保持し、Tooltip lifecycleから独立したhostにDrawerを描く。                                                                                                                                 | 開閉寿命を制御しやすい。snapshotと既存projectionの境界、古いchart data、range変更やguide/dotとの同期を確認する。全表示データの再構成が必要とは決めつけない。                                                                                                                  |
| 採用: 入力方式に応じた表示         | PCのfine pointerは既存hover tooltip、touch/coarse側はmodal Drawerを使う。`pointer: coarse`はまだpointer eventがない初期状態のfallbackにし、観測後は最後の`event.pointerType`（mouse/pen=hover、touch=Drawer）を優先する。 | media queryとeventが食い違う物理端末は未検証。effective input modeが変わったpointer handlerで既存snapshotを同期的に無効化する。mode refも同じhandlerで更新し、後続React effectの重複dismissをskipして、新しいtouch selectionと同じbatchでcommitしたfresh snapshotを保持する。 |

### 採用判断の根拠（P0/P1）

- 独立hostを選択した。tooltip-local hostはRechartsのactive/Tooltip unmountに紐付き、close animation中に表示dataまで失う恐れがある。controller所有の浅いpayload copyとprojection settingsをDrawer hostへ渡し、render時に既存`CustomTooltip` projectionを適用する。Drawer exitが完了する`onOpenChangeComplete(false)`でpayload snapshotを破棄する。Base UI 1.9.0のRoot型とローカル実装でこの完了通知を確認した。
- 入力判定はCSSのcoarse判定を初期状態にだけ使い、最初のpointer event以後はその`pointerType`を優先する簡易policyを採用した。pointerdownで開かず、touchのpointerup時に移動閾値未満であることを確認し、そのgestureの選択indexからchart-specific source row/visible series payloadを作ってsnapshotとopenをcommitする。keyboard Enter/Spaceはfine/coarse両方で独立した明示選択経路を持つ。物理hybrid端末でのmouse/touch交互入力は未検証。
- Drawer表示中は旧outside/Escape/scroll document listenerを停止し、Base UI modalをclose主担当にする。閉じる要求はcontrollerのdismiss経由に集約し、`onOpenChangeComplete(false)`のみでsnapshotを解放する。`finalFocus`はchart section id内のfocusable `[role="img"]` wrapperへ戻す。
- Hybrid互換eventの`pointerleave`は入力mode切替の証拠に使わず、touch後に発生するcompatibility mouseleave/moveでDrawer snapshotや選択を消さない。実`PointerEvent.pointerType`によるmouse/pen/touch eventは切替として扱う。focused browserでhybridのmouse hover契約を確認したが、物理hybrid端末の交互入力は未検証。
- P0/P1の決定証拠: `BaseDrawer`のBase UI Root APIで`onOpenChangeComplete(false)`によるclose完了を確認し、host lifetimeをTooltip content lifecycleから切り離した。Rechartsのinstalled click middlewareはclick座標から`activeTooltipIndex`を算出してchart-level click handlerへ渡すため、Area/Line tapは同gesture clickから行indexを得る。Tooltip effect payloadの出現だけではgesture/index一致の証拠としない。

PCはhoverを維持する。Drawerを使う側は画面幅ではなく実際の入力方式で決める。既存の`pointer: coarse`判定と各eventの`pointerType`が常に一致するとは限らず、wide touch、hybrid、外付けmouse、小さいfine-pointer画面を確認する。現アプリがこの切替をすでに正しく扱うとは仮定せず、境界と必要な変更をPoCで定義する。非modal Drawerや`disablePointerDismissal`は主候補に含めず、modalが成立しない場合の比較案に限る。

## Technical key points

- **選択確定の境界:** `active`はhoverでもtrueになるためDrawerの`open`へ直結しない。coarse操作ではpointerdown後の縦scrollやgesture誤認を避ける。bar targetでは実際のshape hitの`data-index`からsource rowを解決する。Area/Lineなど直接のbar indexを持たないchartではpointerupがtap intentを保持し、同gesture後続のRecharts chart clickが計算した`activeTooltipIndex`を使う。過去のhover/move indexやTooltip effect payloadをtapに転用しない。CPIのprogrammatic-scroll suppressionを維持する。
- **入力mode遷移の順序:** 最初のpointer eventまでは`pointer: coarse`をfallbackに使い、その後は実際の`PointerEvent.pointerType`で最終入力mode（touch=Drawer、mouse/pen=fine hover）を決める。pointer handlerは新しいmodeをReact stateへ記録する前に、既存snapshotがありeffective modeが変わる場合は同期的に無効化する。さらに前回入力mode refを同じhandler内で更新し、後続effectが同じ遷移を重ねてdismissしないようにする。これにより旧modeのDrawerを閉じてから新しいtouch選択へ進み、mode更新effectの遅延dismissで新しい選択snapshotを消さない。
- **状態と表示寿命:** 選択されたchart pointのデータとDrawerのvisible lifecycleの責務を分ける。複数の由来不明なopen stateを作らない。Base UI `Drawer.Root`はcontrolled `open`/`onOpenChange(nextOpen, eventDetails)`を持ち、`eventDetails.reason`や`cancel()`を使える。閉じる主体を定めて二重dismissを防ぐ。
- **focusの入口と出口:** 全chart wrapperの`tabIndex=0`とEnter/Space handlerが明示選択入口になり、chart centerから同じselection resolverを使う。modal Drawer内のTab/Shift+TabをBase UIへ委ね、`finalFocus`で選択chartの`[role="img"]`へ戻す。focused regression suiteはpassしたが、物理端末・支援技術利用時の実動作は未確認とする。
- **modalと既存listener:** modalは背景interactionを抑止しscroll lockとfocus管理を行う。現行document captureのoutside listenerはPortalを外部と誤認したり、二重closeしたりしうる。modal modeではdismissの主責務をBase UIへ寄せ、旧listenerを停止または再設計する。PCで旧hover tooltipを残す場合はモードごとに分岐する。
- **snapshotとデータ整合:** source rowはchartごとのfiltered/range dataとvisible series registryに依存する。controller bindは同じindexのrow/seriesからRecharts-compatible entriesを構築し、既存`CustomTooltip`へprojectionを委ねる。選択後にdataが変わった場合のsnapshot扱いを決め、range/filter切替、activeChartId変更、unmount、exit animationの間にstaleな値を描かない。render中のstate更新はせず、イベントまたは適切なbridgeで選択確定する。
- **hostとkeepMounted:** 独立hostはTooltipのactive/unmountから寿命を切り離しやすい仮説がある。shadcn `DrawerContent`はPortalを内部生成するため、`keepMounted`はContentではなくPortalに渡すpropである。導入済みBase UI 1.9.0の`Drawer.Root`型とローカル実装を確認し、exit完了の`onOpenChangeComplete(false)`でsnapshotを解放する。
- **gesture・画面・読みやすさ:** 点tapと縦ページscrollの競合、swipe時の背面chart移動、背景リンク誤発火、内部scroll、close button 44px以上を確認する。mobile幅固定配置とcoarse pointer判定を混同しない。safe area、画面下部の高さ、375/430px、横向き、reduced motionを実機で測る。
- **表示内容:** 行数の多いtooltip（例: `SpendingBarChart`）でDrawerを評価する。系列名と値、単位、formatter、0/null/missing、hidden除外、有限値合計、最大高さ、内部scrollを保持する。模擬dataだけで全チャートに一般化しない。
- **shadcnとrepoの境界:** 公式recipeはTailwind、`cn`、shadcn tokenへ依存するため、CSS Modulesへの翻案は公式CLI生成物と区別する。既存Base primitive PoC改善とrecipe移植も比較する。全体Tailwind/Radix移行を既定にしない。CLIは`add drawer --dry-run`を将来の隔離環境でversion pinして調査する選択肢であり、現repoで`init`は実行しない。
- **Next.js:** コード着手前に`node_modules/next/dist/docs/`の関連ガイドを確認し、Next.js 16固有のAPIと非推奨事項に従う。

#### Technical Key Point status crosswalk

| Key point                           | Status   | Evidence and remaining gap                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Selection boundary               | Partial  | Bar hit-index and same-gesture Recharts click paths have focused tests; device input behavior remains unverified.                                                                                                                                                                                                                                                                    |
| 2. Input-mode transitions           | Partial  | Simple `pointerType` policy and compatibility-event guards have focused automated coverage; physical hybrid switching remains pending.                                                                                                                                                                                                                                               |
| 3. Snapshot/data lifecycle          | Partial  | Independent snapshot and epoch handling are implemented; a regression captures the real `onOpenChangeComplete` callback from closed selection A, selects B, then calls stale `false` and verifies the Drawer remains on 2018Q2. Programmatic range/data changes and unmount are also covered; Base UI's timer-driven callback emission and other stale-exit cases remain unverified. |
| 4. Focus entry/return               | Partial  | Browser keyboard and focus paths are covered; assistive-technology and device behavior remain pending.                                                                                                                                                                                                                                                                               |
| 5. Modal/listener ownership         | Partial  | Modal listener gating, dismiss paths, and synthetic swipe regression are covered; native background interaction behavior remains pending.                                                                                                                                                                                                                                            |
| 6. Snapshot/data consistency        | Partial  | Replacement `data` prop invalidation, programmatic range-change invalidation (with modal hit-testing explicitly bypassed), and unmount are tested; filter changes, user-hit-tested range changes, and guide/dot synchronization coverage remain pending.                                                                                                                             |
| 7. Host and exit lifecycle          | Partial  | Independent controlled host and close-complete snapshot release are implemented; the captured stale callback race is covered, but Base UI's timer-driven emission and full exit lifecycle remain unverified.                                                                                                                                                                         |
| 8. Gesture and layout               | Partial  | Scroll, 375/430px layout, CSS, and synthetic swipe cases have focused coverage; safe area, orientation, reduced motion, and native device gestures remain pending.                                                                                                                                                                                                                   |
| 9. Displayed data contract          | Partial  | Spending real-CSV rows, ordering, filtering, totals, and formatting are covered. A component table invokes the actual resolver for seven CpiChartSections bindings and checks period/keys/source row/values, but visible Drawer rendering and full metadata/formatting coverage across those bindings remain unverified.                                                             |
| 10. Base UI and repository boundary | Achieved | The production Drawer uses the existing Base UI wrapper and CSS Modules without requiring a repo-wide Tailwind/Radix migration.                                                                                                                                                                                                                                                      |
| 11. Local Next.js guidance          | Achieved | Relevant local Next.js guides were consulted before implementation; this is a procedural record rather than a runtime test.                                                                                                                                                                                                                                                          |

## Requirements（採否後の受入条件）

### R-T1: 明示選択で開く

- **WHEN** touch/coarse pointerの利用者がチャート点をtapし、選択が確定したとき
- **THEN** 選択した1点のmodal Drawerが開き、hover、pointerdownだけ、縦scrollやswipe途中では開かない。barはhit shapeの`data-index`を使い、Area/Lineは同gestureのRecharts chart clickが算出する`activeTooltipIndex`を使う。以前のhover indexは再利用しない。
- **WHEN** chartへfocusした利用者がEnterまたはSpaceを押す
- **THEN** chart bindingの同じselection resolverが選択点を解決し、その点のDrawerを開く。

### R-T2: tooltipデータとの一致

- **WHEN** 対象チャートで選択点のDrawerを表示したとき
- **THEN** 同じchart-data indexの現在のfiltered/range rowとvisible-seriesから構築するpayloadにより、期間、series、値、色、順序、formatter、許可/hidden系列、合計が既存CustomTooltipの契約と一致する。0/null/missing/finite値の処理を含める。旧hover payloadをtapへ流用しない。

### R-T3: 1点表示と再選択

- **WHEN** Drawerを表示しているとき
- **THEN** 選択内容は固定され、背景から別点や別chartを選べない。close後は別点を選択できる。連続scrubは不要。

### R-T4: closeとfocus

- **WHEN** close button、overlay、Escape、対応するswipeで閉じたとき
- **THEN** closeは一度だけ確定し、modal内のTab/Shift+Tabでfocusを維持し、close後は選択したchartのfocusable `[role="img"]` elementへ戻す。focus復帰でhoverが再発してもtouch Drawerは自動再openしない。keyboard起動経路とTab移動も確認する。

### R-T5: desktopと混合入力

- **WHEN** fine pointerまたはhybrid端末で対象チャートを使うとき
- **THEN** PCのfine pointerでは既存hover tooltipが維持され、touch/coarse側ではmodal Drawerが使われる。画面幅だけでPC/touchを分類せず、実PointerEventの`pointerType`を最終入力modeに使い、`pointer: coarse`はpointer event前の初期fallbackとする。effective Drawer/hover modeが変わるpointer handler内で古いDrawer snapshotを同期的に無効化してから次の選択へ進み、mode tracking refを更新して後続React effectの重複dismissをskipする。`pointerleave`とtouch後のcompatibility mouse eventだけではmodeを切り替えない。wide touch、外付けmouse、小さいfine-pointer画面での物理端末切替は未確認として記録する。

### R-T6: data変更とexit

- **WHEN** Drawerの開閉中にfilter/range変更、chart切替、resize、unmountが起きたとき
- **THEN** 選択snapshotとguide/dot/active indexが同期し、stale payloadや意図しない再openが残らない。
- **WHEN** Drawer表示中にpointer eventがeffective input modeを切り替え、同じ入力操作で次のtouch selectionが確定するとき
- **THEN** pointer handlerで旧modeのsnapshotを先に無効化し、更新済みmode refが後続のReact effectによる重複dismissを抑止するため、新しい選択のsnapshotは維持される。
- **WHEN** CpiChartが新しい`data` propを受け取り、Drawerが開いているとき
- **THEN** 古いsnapshot/Drawerを無効化し、後の再選択は新しいdata rowからpayloadを作る。focused browser regressionでこのprops update→close→reselectionを確認した。

### R-T7: 操作とviewport

- **WHEN** 利用者がDrawer内をscroll/swipeし、375/430px、横向き、safe area、reduced motionを含む条件で使うとき
- **THEN** swipe中に背面chartが動かず、close buttonが44px以上で、背面リンクが誤発火しない。表示高さと内部scrollを記録する。

### R-T8: 仕様同期

- **WHEN** 実装採用後にcomponent、データ流れ、操作契約を変更するとき
- **THEN** [`openspec/config.yaml`](../openspec/config.yaml) の`rules.spec`に従い、[`openspec/specs/nextjstest/spec.md`](../openspec/specs/nextjstest/spec.md) のData Sources / Data Flow / Component Tree / Requirementsを実装と同期し、変更するR15/R21要件にWHEN/THENを書く。

### 受入状況（2026-10-23）

- R-T1: **focused verified / overall partial**。Spending、Area/Line zero-movement tap、scroll誤openとpointerdown-onlyなどfocused regressionsはpass。物理入力での確認は未実施。
- R-T2: **partial**。実CSVのSpending tap/reselectionでrow・series projectionを照合した。全6 familyのformatter/metadata/allowed/hidden/total契約を同じ深さで検証したとは扱わない。
- R-T3〜R-T4: **partial**。reselection、Escape/overlay、focus lifecycleのfocused coverageはある。Drawer handle上のsynthetic touch/pointer eventで閉じ、chart tooltipを開かないfocused swipe regressionも1件passした。native browser gestureとしてのswipe・実機およびscreen-reader/keyboard device behaviorは未確認。
- R-T5: **focused policy verified / physical validation pending**。simple `pointerType` policyとcompatibility `pointerleave` guardは実装・focused test済み。physical hybrid input switchingは未実施。
- R-T6: **partial**。resize/mode、programmatic range-change（modal hit-testing bypassを明示）、CpiChart data prop更新中のclose→再選択、unmountをfocused testで確認した。filter change、user-hit-tested range change、close animationのtimer駆動、guide/dotの全条件は未確認。
- R-T7: **partial**。複数viewportのDrawer scroll/browser casesはfocused runに含むが、横向き/safe area/reduced motion/実機swipeの完全確認は残る。
- R-T8: **documentation synchronized / focused gates pass**。この更新でSharedPlanと正準specのWHEN/THENを実装経路へ合わせた。coverageは未完了。全Browser Mode suiteは試行したが結果不明で未完了。

## 実施段階

### P0 — 対象と基準を確定

- chartのfine/coarse操作、選択index、guide/dot、tooltip内容、dismiss listenerを実測する。対象6種類から行数とpayload差が大きい`SpendingBarChart`を先行PoC候補にする。
- PCではhover tooltipを維持し、touch/coarse側はmodal Drawerを評価する。
- `pointer: coarse`、eventの`pointerType`、画面幅、実際の入力器具が食い違うhybrid条件を記録し、表示切替の判定責務を定める。
- **完了条件:** 現行契約、選択点の入口、必要な実端末、PC hoverの回帰条件と入力切替範囲を記録。

### P1 — state、projection、hostの設計

- A/B host案を、payload取得、snapshot、state ownership、close/exit時の寿命、listener、focus復帰で比較する。
- modal化時に置き換える旧interaction（ページscroll dismiss、outside capture、連続点選択）と保持するデータ契約を対応づける。
- **完了条件:** active hoverから独立した選択確定経路と、stale dataを避けるhost/lifecycle案が説明できる。

### P2 — 1種類でPoC

- 実際の`SpendingBarChart` chart data row resolverを利用し、coarse tap index→同じsource row snapshot→modal Drawer→close→別点選択を試す。Tooltip effect由来の未対応payloadやdummy rowだけの確認で完了にしない。
- fine pointerでは既存hoverを維持する。同一画面のhybrid入力、外付けmouse利用、close後のfocus復帰でhoverが発火する条件をbrowser regressionで確認する。物理端末でのwide-touch/外付けmouse交互入力は別途未確認として残す。
- 内容一致、縦scroll誤open、overlay/escape/swipe close、focus、背面操作抑止、exit中のsnapshot、range変更、guide/dot同期を確認する。
- **focused完了条件:** 実CSVを使う`SpendingBarChart`でtap→同じindexのsource row snapshot→Drawer→close→再選択、fine mouse hover、keyboard経路、dismiss、mode変更などの対象browser/component contractsが通る。最新browser command `pnpm exec vitest run --maxWorkers=1 --config tests/config/browser/vitest.browser.config.ts tests/browser-mode/ChartTooltipDrawer.browser.test.tsx tests/browser-mode/CpiChart-range-close.browser.test.tsx` は2 files / 22 tests passし、synthetic swipe、stale captured callback、programmatic range invalidation（modal hit-testを明示的にbypass）、data prop invalidation、unmountを含む。`pnpm exec vitest run tests/components/CpiChart.test.tsx` も1 file / 6 tests passし、7 bindingsのactual resolverがperiod/keys/source row/valuesを返すことを検証したが、全7 bindingのvisible Drawer renderingは未確認。前段でbrowser 5 files / 32 tests、related component unit 4 files / 64 tests、CpiChart-renderable-bars 1/1もpass。fixture typing fix後の最終type-check、lint:fast、build、hook smoke、`git diff --check`もpass。物理hybrid/モバイル端末を含むR-T1〜R-T7の全面確認は未完了。
- **追加focused swipe regression:** `pnpm exec vitest run --maxWorkers=1 --config tests/config/browser/vitest.browser.config.ts tests/browser-mode/ChartTooltipDrawer.browser.test.tsx -t 'closes on touch swipe without chart tooltip'` は1 passed / 15 skipped（対象1 test）。Drawer handleへのsynthetic touch/pointer eventsでDrawerを閉じ、chart tooltipを開かないことを確認した。native browser gestureおよびphysical-device swipeは未検証。
- **追加focused stale-exit regression:** `pnpm exec vitest run --maxWorkers=1 --config tests/config/browser/vitest.browser.config.ts tests/browser-mode/ChartTooltipDrawer.browser.test.tsx -t 'keeps a new selection after the previous Drawer exit completes'` は1 passed / 16 skipped（対象1 test）。閉じた選択Aのrenderが持つ実際の`onOpenChangeComplete` callbackをcaptureし、B（2018Q2）を選択した後に古いcallback(false)を呼んでも、新しいDrawer selectionが開いたままBを表示する。production callback closureを直接通すテストだが、Base UIのtimer-driven emission自体は検証していない。

#### 実装反映メモ（2026-10-23）

- 初回の実データPoC対象は、系列・行数・合計・allowed-key条件が多い`SpendingBarChart`とする。実際のtapではRecharts click payloadが空の場合があるため、fixtureとproduction bindは同じchart-data index resolverから選択rowと描画中series entriesを構築し、Drawer snapshotの2018Q1/Q2一致を確認する。Tooltip effect payloadのlabel/件数だけではtapとの対応を証明しない。
- 6種類は共通`useChartTooltipController`と`CustomTooltip` projectionを使うため、PoC後の展開は同一host/lifecycleへ集約する。`CpiChartSections`の各`bind`で`drawerEnabled: true`を指定する。個別rollbackは該当bindの値を`false`にして旧Recharts tooltip経路へ戻す。
- 実CSV row resolverの初回tap・close後再選択は`ChartTooltipDrawer.browser.test.tsx`で検証済み。Area/Line zero-movement tapはpointerdown/up後の同座標Recharts clickからindexを解決し、テストhelperのmousemove注入なしでfocused browser coverageに含む。物理端末によるhybrid確認は未実施とする。

### P3 — 採否と全種類への展開計画

- 採用時は6種類それぞれのpayload/formatter/series条件を棚卸しし、共有projectionが使える範囲と差分を示す。fine pointerのhover表示が保たれることを展開計画へ含める。
- 見送り時は既存CustomTooltipのdismiss/操作改善など代替を記す。採用時は段階導入と利用chartごとのrollback境界を定める。
- **完了条件:** チャート種ごとのデータ契約を確認でき、全種類へ広げる計画と採否理由がある。**現状: partial**。6 familyのresolver/payload inventoryと共通配線はある。Spending実CSVの契約はfocused coverageがあるが、他familyのpayload projectionを同程度に検証したとはせず、広域browser/coverage gateも未完了。build gateはpass済み。

#### 実装反映: chart-family inventory / staged adoption

| Chart family               | Recharts data / series                                                    | Existing projection differences                                                                                            | Shared Drawer projection coverage                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MajorIndicesChart`        | filtered monthly CPI rows; target index keys                              | hidden-key projection; CPI labels/colors from the target index registry                                                    | The bound resolver selects one filtered row and currently drawn keys; shared renderer applies tooltip formatting.                                       |
| `StackedAreaChart`         | filtered monthly CPI rows; stacked keys                                   | hidden stacked series, CPI measurement notes, labels, total formatter                                                      | Resolver takes visible `stackedTooltipMeta`; shared renderer applies note and total projection.                                                         |
| `EarningsBreakdownChart`   | earnings rows; earnings registry                                          | visible `EARNINGS_SERIES_REGISTRY` keys; earnings labels, units, grouped total                                             | Resolver uses the filtered earnings metadata; shared renderer retains total/group formatting.                                                           |
| `SpendingBarChart` nominal | quarterly public nominal rows; canonical public nominal keys              | presentation order/labels, hidden and period allowed-key filtering, finite-value total; derived support total is not a bar | Resolver uses same-index quarterly source row and rendered nominal keys; support series is excluded, while allowed keys/metadata/total stay bind-owned. |
| `SpendingBarChart` real    | quarterly public real rows; real category keys plus derived support total | real hidden keys, period filtering and total contract; support total is not a bar                                          | Resolver uses same-index real row and allowed real keys; support-total exclusions remain bind-owned.                                                    |
| `ResidualAreaChart`        | filtered merged CPI/residual rows; residual key                           | residual/derived-series metadata, measurement notes and allowed visible keys                                               | Resolver uses same-index merged row and residual key; shared renderer handles missing values/metadata.                                                  |
| `NewGraph`                 | range-filtered rows; comparison/new-series keys                           | range changes alter data length/index; quarter-aware allowed keys and comparison metadata                                  | Resolver uses same-index merged row and label-specific visible metadata; range and series registry remain chart-owned.                                  |

The rollout uses `SpendingBarChart` first because its larger public series set exercises ordering, hidden/allowed keys, missing values and totals together. The common controller and `CustomTooltip` projection then cover the other families without replacing their data registries or formatter contracts. The six chart families are wired behind explicit per-bind `drawerEnabled` flags; a staged release can enable one family at a time, and rollback sets only that family's flag to `false` to restore its prior Recharts tooltip host and touch dismiss affordance. Do not remove the existing tooltip projection until each family's source-row resolver contract and regression suite pass. This inventory is implementation evidence, not a claim that each chart has already been browser-verified.

### P4 — 仕様同期と実装検証

- 実装に進む場合、[`openspec/specs/nextjstest/spec.md`](../openspec/specs/nextjstest/spec.md) のR15a-lとR21（R21dを含む）を読み、modal化により変わる既存操作要件を更新する。R21のtooltip表示データ契約は保持する。R8eはBottomSheet/ChartInfoButton向けで、本検討の中心要件ではない。
- `Data Sources`、`Data Flow`、`Component Tree`、`Requirements`を実装と同期する。Next.jsローカルガイドをコード変更前に読む。
- **完了条件:** 採用した表示・操作契約と実装、仕様、検証結果が一致しrollback手順がある。広域ゲートまたは実機確認が未実施の場合はP4完了とは扱わず、その範囲を明記する。

## 検証計画（将来の実装工程）

- 現在確認できている検証script: `pnpm run lint:fast`、`pnpm run type-check`、`pnpm run test:all`、`pnpm run test:coverage`、`pnpm run test:browser:component:all`、`pnpm run build`。変更範囲に応じて選ぶ。`test:hook-smoke`はUI smokeの代わりにしない。
- 確認済みの関連テスト: [`useChartTooltipController.test.tsx`](../tests/components/useChartTooltipController.test.tsx)、[`CustomTooltip.test.tsx`](../tests/components/CustomTooltip.test.tsx)、[`SpendingBarChart-tooltip-dismiss.browser.test.tsx`](../tests/browser-mode/SpendingBarChart-tooltip-dismiss.browser.test.tsx)、[`SpendingBarChart-tooltip-rehover.browser.test.tsx`](../tests/browser-mode/SpendingBarChart-tooltip-rehover.browser.test.tsx)、[`SpendingBarChart-tooltip-scroll.browser.test.tsx`](../tests/browser-mode/SpendingBarChart-tooltip-scroll.browser.test.tsx)、[`SpendingBarChart-mobile.browser.test.tsx`](../tests/browser-mode/SpendingBarChart-mobile.browser.test.tsx)、[`SpendingBarChart-tooltip-total.browser.test.tsx`](../tests/browser-mode/SpendingBarChart-tooltip-total.browser.test.tsx)、[`CpiChart-range-change.browser.test.tsx`](../tests/browser-mode/CpiChart-range-change.browser.test.tsx)、[`phase6-b10-tooltip-dismiss.browser.test.ts`](../tests/browser-mode/phase6-b10-tooltip-dismiss.browser.test.ts)。これらは既存hover/mobile/range/total表示を確認するが、Drawerのlifecycleとの連動までは確認しない。
- 実payloadで6系列・合計・ラベル、0/null/missing、hidden系列、行数、formatterを照合する。filter/range変更、resize、chart切替、unmount、close animation中のstale表示を確認する。
- 375/430px、横向き、safe area、iOS Safari、Android Chrome、desktop、hybrid端末とkeyboard操作を可能な範囲で確認し、未実施は明記する。
- 実装時のテスト作成はfixerへ委譲し、テスト実行と検証ゲートはOrchestratorが行う。JEVはlint/type-check/testの代替ではない。spec-refs専用scriptは存在しないため、既存要件IDの参照を確認する。
- **今回の実施記録:** `SpendingBarChart`の実データPoC後、共通`createChartTooltipSelectionResolver`を6 chart familyの全bindへ配線した。Drawer snapshotは同gestureのselection indexとfiltered/range row、rendered/allowed seriesから作る。Spendingはbar hit `data-index`、Area/Lineなどはpointerup pending後に同gesture Recharts clickの`activeTooltipIndex`を使う。zero-movement Area/Line browser casesはpointerdown/up後にsame-coordinate clickを送り、テストhelperのmousemove注入なしで検証する。Spending実CSVの2018Q1/Q2 tap/reselectionでは表示順、hidden/allowed keys、finite total、formattingをassertする。Focused browser command `pnpm exec vitest run --maxWorkers=1 --config tests/config/browser/vitest.browser.config.ts tests/browser-mode/ChartTooltipDrawer.browser.test.tsx tests/browser-mode/CpiChart-range-close.browser.test.tsx` は2 files / 22 tests pass（synthetic swipe、stale captured `onOpenChangeComplete(false)`、programmatic range-change invalidation、data prop invalidation、unmountを含む）; component command `pnpm exec vitest run tests/components/CpiChart.test.tsx` は1 file / 6 tests pass（7 CpiChartSections bindingsのactual resolverによるperiod/keys/source row/values確認。ただし視覚的なDrawer表示は未確認）; earlier focused browser 5 files / 32 tests, related component unit 4 files / 64 tests, CpiChart-renderable-bars 1/1 pass. Fixture typing fix後のfinal `pnpm run type-check`と`pnpm run lint:fast`、`pnpm run build`, `pnpm run test:hook-smoke`, `git diff --check` pass. R-T2 remains partial beyond the Spending real-CSV display contract.
- **mobile tooltip suite migration:** `B3m-responsive-mobile.browser.test.tsx` と`SpendingBarChart-tooltip-scroll.browser.test.tsx` / `SpendingBarChart-tooltip-dismiss.browser.test.tsx`のwidth-only inline-close前提を更新し、touch pointerdown/upからDrawer表示、dismiss、scrollを確認する。fine mouse hoverではinline tooltipを維持し、touch close buttonは要求しない。Browser Mode touch fixturesは実indexed SVG pathとnonzero ResponsiveContainer geometryを使う。
- **未完了の広域検証:** `pnpm run test:coverage`はruntime-validator 5件とCPI adapter 1件で、`server/lib/data-loader/earnings.ts`の期待hash pin mismatchを報告した。さらに`test:browser:next-route-poc:prepush:built`がexit 23後にJSON parse failureとなり、coverage runnerはCtrl-C終了で全体coverageは未完了。Full component browser suiteの前回runは24 files / 79 pass / 5 fail / 6 skippedで、その後の関連helperは一部個別修正・focused再検証した。全Browser Mode run `pnpm exec vitest run --maxWorkers=1 --config tests/config/browser/vitest.browser.config.ts tests/browser-mode` は5分超でtest summaryを出さず、read-only process inspectionではVitest/Playwright/Chromium processが見つからなかったため、rootがresource解放のためstale sessionをexit 130で中断した。従ってこの全suite試行はpass/failいずれの結果も得ておらず、inconclusive / incompleteとして扱う。直近のfocused maxWorkers=1 browser runは別途2 files / 22 tests passで、component resolver tableは1 file / 6 tests pass。Drawerを開いた状態でのfilter update、user-hit-tested range change、timer-driven close completion、guide/dot同期の全条件、実swipeの背面移動、全7 bindingの視覚的Drawer表示、全6 familyの完全なデータ契約網羅は未確認。coverageは失敗を含み未完了、この一括suite試行は結果不明で未完了。後続の低負荷実行ではcomponent Browser Mode 24 filesを`--maxWorkers=1 --no-file-parallelism`、API port 63320、外側timeout 60秒で小分けにし、合計96 passed / 6 skipped（Chromium実行でWebKit対象項目をskip）を確認した。focused Drawer + Cpi range-closeは2 files / 22 tests、26.57秒でpassした。これは24 component filesの分割実行結果であり、単一invocationやroute aggregate 22 filesの完了を示さない。route aggregateを含む全Browser Mode suiteは未完了。
- **Browser Mode startup bottleneck investigation:** 現在のrecursive Vitest globでcomponent Browser Modeは24個の`.browser.test.tsx` filesを含み、route aggregateは別configで22個の`.browser.test.ts` filesを含む。従前このcomponent inventoryを22個とした記録は古い誤集計である。全component suite command `pnpm exec vitest run --maxWorkers=1 --config tests/config/browser/vitest.browser.config.ts tests/browser-mode` は5分超summaryなしでexit 130にて中断し、5-file chunkも`Port 63315 is in use, trying another one...`後にsummary前で中断した。ThemeToggle単体とminimal DOM smokeの過去試行もtimeout/interruptionとなったが、これら停止は後続の成功した再試行では再現せず、原因は特定されていない。以前のCLI `--browser.api.port` / `--browser.api.strictPort` / `--browser.connectTimeout` は試行した指定として記録する。これらは設定に適用されたと確認できず、インストール済みVitest 4.1.11ではbrowser config再読込時にCLI overrideが無視されることを確認した。Browser APIとbrowser Viteは同じserverであり、旧試行の`connectTimeout`が停止に影響したかも立証されていない。browser client websocket timeoutは60秒で固定されている。別agentが取ったport/process/resource snapshotはroot test process namespaceに帰属すると確認できないため、root runの残留状態、実行時負荷、停止原因の証拠には使わない。通常の`CpiChart.test.tsx` unit testは約2秒で完了した。
- **Browser Mode startup diagnostic successful retries:** Browser API portを63320に直接設定したtrace-off smokeは1/1 pass・2.28s、同portでbase traceを有効にしたsmokeは1/1 pass・3.48s。CLI port 63320/strict指定だけの試行はBrowser configへの直接指定がない場合に実効port 63315・`strictPort=false`となったが1/1 pass・4.61s。元のconfigを用いたThemeToggleは1/1 pass・8.57sだった。これらによりBrowser Mode起動は現時点で再現可能に成功しており、過去の停止原因は未解決の履歴として残す。focused browser 2 files / 22 tests passも独立した検証結果として維持する。component Browser Mode 24 filesは後続の小分けrunでpassしたが、単一invocationやroute aggregateを含む全Browser Mode suiteの完了を意味しない。
- **Browser Mode API port fix and final startup verification:** component Browser configは`VITEST_BROWSER_API_PORT`を読み、未指定時は63315を使う。指定値は整数1〜65535に限り、`browser.api`へ`{ port, strictPort: true }`を直接設定する。env 63320でbase traceを有効にしたapp-free smokeは1/1 pass・2.45s、同じenvでのThemeToggleは1/1 pass・7.72s、`ChartTooltipDrawer`と`CpiChart-range-close`のfocused Browser Mode runは`--maxWorkers=1 --no-file-parallelism`で22/22 pass・26.57sだった。別プロセスがwildcard addressで保持するephemeral portをenvに渡したcollision probeでは、fallbackせず`Port <held> is already in use`で83ms・exit 1となった。`VITEST_BROWSER_API_PORT=0`ではVitest startup前の`vitest list`がconfig validation errorとなった。従ってport override、invalid port rejection、collision fail-fastの挙動は確認済みである。以前の直接port設定trace-off smoke (1/1・2.28s)、base trace smoke (1/1・3.48s)、CLI port flagsのみで実効port 63315 / `strictPort=false`ながらpassしたsmoke (1/1・4.61s)、overrideなしThemeToggle (1/1・8.57s)も履歴として保持する。CLI overrideがsecondary browser configに適用されなかった事実は修正前の過去停止原因を証明しない。別agentのPID/resource snapshotはroot test namespaceに帰属すると確認できず、過去hangの原因は未再現・未特定である。診断用一時ファイルは削除済み。componentおよびroute Browser Modeの広域suite、coverage、実機検証は未完了であり、このstartup fixをもってPlan 61全体やphase/requirementをcompleteとはしない。
- **Route Browser Mode 分割実行（2026-10-23）:** `pnpm run build`はNext 16.4.2 webpack build、TypeScript、static generationを含め約31秒で成功した。production server上で`node scripts/run-next-route-poc.mjs --only=phase6-b01`から`--only=phase6-b09`を各1 worker・逐次実行し、全て成功した（b01 11.22s/2 tests、b02 7.75s/2、b03 21.88s/3、b04 10.83s/3、b05 7.91s/2、b06 8.80s/1、b07 7.92s/3、b08 11.60s/3、b09 5.38s/1。合計20 passed）。b10は3 tests中2 passed / 1 failed、phase elapsed 21.69s。失敗はtest #188の`heading.tap`が5秒でtimeoutとなるもので、`--selection-file`で同テストのみを再実行しても1 failed / 2 skipped（config elapsed 11.53s）で再現した。原因は未特定であり、application source bug、selector、viewport、timingのいずれにも帰属させない。b11〜b14は未実行。aggregate Chromium configの22-file一括実行も未実行である。component Browser Mode 24 filesの分割結果は96 passed / 6 skippedのまま別に記録し、routeの部分成功をもって受入基準またはTKPを全達成とはしない。
- **未実施の端末確認:** iOS Safari、Android Chrome、wide-touchと外付けmouseの物理hybrid切替、横向き、safe-area、reduced-motion、実機swipe時の背面抑止、keyboard/Tab/close後focus復帰の実機挙動。

## rollback方針

実装時は既存CustomTooltipの表示経路を残し、chart単位で表示host/modeを切り替えられる境界を置く。実payloadで全対象chartと回帰契約を確認する前に、既存projectionやtooltipデータ契約を削除しない。問題時はDrawer経路を止めて既存表示へ戻し、listener/stateの後始末を確認する。

## 未決事項

- coarse media fallbackと最後に観測した`event.pointerType`の組み合わせは実装方針として採用済み。snapshotは`isTouch`変化またはeffective Drawer/hover mode変化で無効化し、同一Drawer mode内の初回fallback→touch観測では選択直後のpayloadを保つ。wide-touch、mouse/penとtouchの物理hybrid切替、viewportが入力方式と食い違う実機検証は未完了。
- touch幅での高さ、最大行数、内部scroll、横向きとsafe area。実チャートと実機で決める。
- shadcn recipe翻案、既存Base UI PoC改善、Base UI primitive直接利用のどれを採るか。CSS Modulesとの保守差分を比較する。

## 参照資料

公式資料は2026-10-23に確認。mutableなregistry sourceを実装判断に使う場合、P1で参照commit SHAを固定する。

- [shadcn/ui Base UI Drawer](https://ui.shadcn.com/docs/components/base/drawer)
- [Base UI Drawer API](https://base-ui.com/react/components/drawer)
- [shadcn/ui Base Drawer registry source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/drawer.tsx)
- [Base UI Tooltip API](https://base-ui.com/react/components/tooltip)
- [WAI-ARIA Dialog Modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WAI-ARIA Tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
- [WCAG: Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)（PCのhover表示）
- [shadcn CLI](https://ui.shadcn.com/docs/cli)
- [shadcn components.json](https://ui.shadcn.com/docs/components-json)
