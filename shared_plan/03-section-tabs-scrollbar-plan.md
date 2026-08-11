# タブバー(SectionTabs)がリロード直後から横スクロールバーを表示している問題を直す

## Context

「タブバーを一切操作していない、リロード直後の状態で横スクロールバーが見えている」
という報告を調査した。結論として**再現するバグ**であり、実装漏れが原因と特定できた。

### 事実確認

`.sectionTabsScroll`(`src/app/components/CpiChart.module.css:511-526`)が
`overflow-x: auto` の横スクロールコンテナで、`SectionTabs.tsx` の8個のタブ
ボタン(CPI主要/費目別/CAGR/消費(名目)/消費(実質)/給与/残差/3種比較)と
`ThemeToggle` を横並びに収めている。この要素は `.sectionTabs`
(`:499-510`, `position: sticky; top: 0`)という**画面上部に常時ピン留めされる
ヘッダー行**の内側にある。

実機構成の Playwright で計測したところ、タブ行のコンテンツ幅は常に
`scrollWidth ≈ 750px` で固定なのに対し、コンテナの `clientWidth` はビュー
ポート幅に応じて縮む:

| viewport width | clientWidth | overflow |
| -------------- | ----------- | -------- |
| 1024px         | 811px       | なし     |
| 820px          | 607px       | **あり** |
| 768px          | 571px       | **あり** |
| 430px          | 233px       | **あり** |
| 375px          | 178px       | **あり** |

つまり**タブレット横幅から一般的なスマートフォンまで、初期表示から常に
コンテンツがコンテナ幅をはみ出す**設計になっている。加えてリポジトリ全体を
`scrollbar` で検索しても `scrollbar-width` / `::-webkit-scrollbar` の類の
指定は**ゼロ件**で、ネイティブのスクロールバーを非表示にする処理が一切ない。

### なぜ「バグ」と判断するか

- overflow が発生した状態で `overflow-x: auto` を使うと、ブラウザは**ユーザーの
  操作を一切必要とせず**ロード直後からスクロールバーを描画する。これは
  「タブ操作後に出る」ものではなく構造的に「常に出ている」。
- 見え方は OS/ブラウザのスクロールバー描画方式に依存する(macOS/iOS/Android の
  多くはオーバーレイ式で目立たないため、開発時に見落とされたと考えられる)。
  Windows の Chrome/Edge、多くの Linux デスクトップ環境、Firefox の既定設定は
  クラシック(常時表示)スクロールバーのため、この環境では常時可視になる。
  つまり**環境依存で顕在化する潜在バグ**であり、今回の報告はその顕在化ケース。
- `.sectionTabs` はスクロール中も画面上部にピン留めされ続けるヘッダーであり、
  かつタブは角丸ピル型の丸みを帯びたデザインで統一されている。その直下(または
  重なる位置)に無地の灰色スクロールバーが常時表示されるのは明らかに意図された
  デザインではない(他の横スクロール要素である `.chartDataTable`
  (`CpiChart.module.css:80-90`, データテーブル)は表形式でスクロールバー表示が
  自然だが、こちらはナビゲーション用のセグメントコントロールであり性質が違う)。

### 副作用として生じる懸念: スクロール可能であることの手がかりの喪失

`.sectionTabsScroll` はコンテナ境界で単純にクリップしており、最後のタブが
中途半端に見切れる、フェード演出がある、といった「まだ続きがある」ことを示す
視覚的な手がかりが**スクロールバー以外に存在しない**(実測でも `clientWidth`
ちょうどで完全にクリップされ、次のボタンの一部すら覗かない)。単純に
スクロールバーを消すだけだと、特に3種比較タブなど右端寄りのタブへ到達する
手段がユーザーから見えなくなる退行を招く。したがって**スクロールバーを隠すのと
同時に、代替のアフォーダンス(右端フェード)を追加する**必要がある。

---

## 変更内容

### 1. ネイティブスクロールバーを非表示にする

`src/app/components/CpiChart.module.css` の `.sectionTabsScroll`(:511-526)に追記:

```css
.sectionTabsScroll {
  ...
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* 念のため(旧Edge) */
}
.sectionTabsScroll::-webkit-scrollbar {
  display: none; /* Chrome / Safari / Chromium系Edge */
}
```

`overflow-x: auto` 自体は変更しない(スクロール機能・`scroll-snap-type`・
既存の `scrollIntoView` 呼び出しはそのまま動作する)。見た目だけを消す。

### 2. 右端フェードでスクロール可能であることを示す

同じく `.sectionTabsScroll` に `mask-image`(WebKit系は `-webkit-mask-image`)
で右端をフェードアウトさせる:

```css
.sectionTabsScroll {
  ...
  mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
}
```

- overflow が発生していない広い画面(1024px以上)では、コンテンツがコンテナ幅
  いっぱいまで届かないため、フェードは何もない背景領域にかかるだけで見た目に
  影響しない。デスクトップ限定でフェードを無効化するような条件分岐は不要。
- 右端のみで十分(左端は常にコンテンツの先頭 = `CPI主要` タブが露出しており、
  「左にもまだある」という誤解を生まないため左端フェードは付けない)。

### 3. 仕様書の更新(AGENTS.md 準拠)

`openspec/specs/nextjstest/spec.md` の `SectionTabs` に関する記述
(`:248` 付近、R7 Responsive Layout 近辺)に、「タブ行は横スクロール可能で
あり、ネイティブスクロールバーは表示せず右端フェードで示す」旨を
WHEN/THEN シナリオとして追記する。

---

## 変更ファイル一覧

| ファイル                                 | 変更                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `src/app/components/CpiChart.module.css` | `.sectionTabsScroll` にスクロールバー非表示 + 右端フェード用 `mask-image` を追加 |
| `openspec/specs/nextjstest/spec.md`      | SectionTabs の横スクロール仕様(スクロールバー非表示・右端フェード)を追記         |

CSS のみの変更で、JS/TS 側のロジック変更は不要。

---

## 検証

### 見た目確認(Playwright スクリーンショット)

- 820px / 768px / 430px / 375px の各幅でリロード直後(タブ未操作)のスクリーン
  ショットを撮り、ネイティブスクロールバーが写り込んでいないことを確認する。
  ※ 今回の調査で使ったヘッドレス Chromium(Linux)はオーバーレイ式スクロール
  バーのため元々可視化されなかった。修正の有無を画像差分で機械的に確認するのは
  難しいため、`getComputedStyle` で `scrollbar-width: none` が適用されている
  ことをアサートする形の検証(下記)で代替する。

### E2E(Playwright)

`tests/e2e/section-tabs-scroll.e2e.spec.ts` に追加:

- リロード直後(タブ未操作)に `.sectionTabsScroll` の
  `getComputedStyle(...).scrollbarWidth === "none"` を確認する。
- `.sectionTabsScroll` の `scrollLeft` を直接操作(またはドラッグ/wheel
  イベント)して実際に横スクロールできること(スクロールバー非表示が
  スクロール機能自体を殺していないことの回帰確認)。
- 右端に `mask-image` が適用されていること(`getComputedStyle` で
  `maskImage` / `webkitMaskImage` が `none` でないことを確認)。

### 既存回帰

- `tests/e2e/mobile-ux.e2e.spec.ts`(375px 幅で横方向にはみ出さない)、
  `tests/e2e/section-tabs-scroll.e2e.spec.ts`(タブ押下時のスクロール)は
  引き続き全件PASSすることを確認する。
- `tsgo --noEmit` / `lint:fast` / `vitest` / `next build`。

### 実機確認

- Windows Chrome/Edge、Linux(GNOME/クラシックスクロールバー設定)での
  リロード直後のスクロールバー非表示を確認する(本プロジェクトの開発環境
  ではエミュレートできないため、可能であれば実施)。
- 実 iOS Safari / Android Chrome で、右端フェードが不自然に見えないこと、
  スワイプでのタブ横スクロールが従来どおり機能することを確認する。
