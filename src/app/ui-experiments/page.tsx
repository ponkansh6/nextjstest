"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import MotionDemo from "./MotionDemo";
import styles from "./page.module.css";

type DemoView = "overview" | "details";

export default function UIExperimentsPage() {
  const [containerWidth, setContainerWidth] = useState<"wide" | "narrow">("wide");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [motionFinished, setMotionFinished] = useState(false);
  const [view, setView] = useState<DemoView>("overview");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current!;
    if (dialogOpen && !dialog.open) dialog.showModal();
  }, [dialogOpen]);

  function closeDrawer() {
    const dialog = dialogRef.current!;
    if (dialog.open) dialog.close();
  }

  function switchView() {
    const nextView = view === "overview" ? "details" : "overview";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTransition = document.startViewTransition;

    if (reducedMotion || typeof startTransition !== "function") {
      setView(nextView);
      return;
    }

    startTransition.call(document, () => flushSync(() => setView(nextView)));
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>INTERACTION LAB / 06</p>
        <h1>モダンなUI/UX技術を試す</h1>
        <p className={styles.intro}>
          このページは導入候補を個別に試すためのPoCです。通常のダッシュボードには影響せず、幅や操作を変えて挙動を比べられます。
        </p>
      </header>

      <div className={styles.experiments}>
        <section
          className={`${styles.panel} ${styles.containerPanel}`}
          aria-labelledby="container-title"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.index}>01</span>
              <h2 id="container-title">Container Queries</h2>
            </div>
            <span className={styles.badge}>幅を変えて比較</span>
          </div>
          <p className={styles.description}>
            画面幅ではなく、カードを囲む領域の幅に応じてカード内の配置が切り替わります。
          </p>
          <div className={styles.buttonRow} role="group" aria-label="カード領域の幅">
            <button
              type="button"
              className={containerWidth === "wide" ? styles.selectedButton : styles.secondaryButton}
              aria-pressed={containerWidth === "wide"}
              onClick={() => setContainerWidth("wide")}
            >
              広い領域
            </button>
            <button
              type="button"
              className={
                containerWidth === "narrow" ? styles.selectedButton : styles.secondaryButton
              }
              aria-pressed={containerWidth === "narrow"}
              onClick={() => setContainerWidth("narrow")}
            >
              狭い領域
            </button>
          </div>
          <div
            className={`${styles.containerStage} ${containerWidth === "narrow" ? styles.stageNarrow : ""}`}
          >
            <article className={styles.queryCard}>
              <div className={styles.queryMark} aria-hidden="true">
                CQ
              </div>
              <div className={styles.queryCopy}>
                <strong>カード内のレイアウト</strong>
                <span>親コンテナのサイズで並び方が変わります。</span>
              </div>
              <span className={styles.queryValue}>
                <span className={styles.queryWide}>横並び</span>
                <span className={styles.queryNarrow}>縦並び</span>
              </span>
            </article>
          </div>
          <p className={styles.note}>
            Container
            Queries未対応時はカード内の折返し配置を使い、幅480px以下ではviewport基準のmedia
            queryでも同じ配置にします。
          </p>
        </section>

        <section className={styles.panel} aria-labelledby="tokens-title">
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.index}>02</span>
              <h2 id="tokens-title">CSS Custom Properties</h2>
            </div>
            <span className={styles.badge}>ページ内で共有</span>
          </div>
          <p className={styles.description}>
            同じスペーシング、角丸、最小タップ領域の値を、このPoC内の複数UIで共有しています。
          </p>
          <div className={styles.tokenDemo}>
            <div className={styles.tokenCard}>
              <span className={styles.tokenLabel}>SPACING</span>
              <strong>16 px</strong>
              <code>--space-4</code>
            </div>
            <div className={styles.tokenCard}>
              <span className={styles.tokenLabel}>CORNER</span>
              <strong>16 px</strong>
              <code>--radius-card</code>
            </div>
            <button
              type="button"
              className={styles.targetButton}
              aria-label="44ピクセルのタップターゲットを試す"
            >
              タップ
            </button>
            <div className={styles.tokenCard}>
              <span className={styles.tokenLabel}>TARGET</span>
              <strong>44 px</strong>
              <code>--target-min</code>
            </div>
          </div>
          <p className={styles.note}>
            ボタンの外枠が最小44 × 44 pxです。キーボードでもフォーカスできます。
          </p>
        </section>

        <section className={styles.panel} aria-labelledby="snap-title">
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.index}>03</span>
              <h2 id="snap-title">CSS Scroll Snap</h2>
            </div>
            <span className={styles.badge}>横にスクロール</span>
          </div>
          <p className={styles.description}>
            タッチ、トラックパッド、または左右キーで移動すると、カード付近で自然に止まります。
          </p>
          <div
            className={styles.snapTrack}
            tabIndex={0}
            aria-label="横スクロールできるスナップカード"
          >
            {["ひとつめ", "ふたつめ", "みっつめ", "よっつめ"].map((label, index) => (
              <article className={styles.snapCard} key={label}>
                <span className={styles.snapNumber}>0{index + 1}</span>
                <strong>{label}</strong>
                <span>カードが先頭位置に揃います</span>
              </article>
            ))}
          </div>
          <p className={styles.note}>横スクロール領域にフォーカスして左右キーを使えます。</p>
        </section>

        <section className={styles.panel} aria-labelledby="dialog-title">
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.index}>04</span>
              <h2 id="dialog-title">Native dialog drawer</h2>
            </div>
            <span className={styles.badge}>Escape / 背景タップ</span>
          </div>
          <p className={styles.description}>
            ブラウザー標準のdialogで、モーダル表示、背景クリック、Escape、フォーカス復帰を試せます。
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setDialogOpen(true)}
          >
            ドロワーを開く
          </button>
          <dialog
            className={styles.drawer}
            ref={dialogRef}
            aria-labelledby="drawer-heading"
            onCancel={(event) => {
              event.preventDefault();
              closeDrawer();
            }}
            onClose={() => setDialogOpen(false)}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeDrawer();
            }}
          >
            <div className={styles.drawerContent}>
              <div className={styles.drawerHandle} aria-hidden="true" />
              <p className={styles.eyebrow}>NATIVE MODAL</p>
              <h3 id="drawer-heading">フォーカスをここに移動しました</h3>
              <p>
                Escapeキーまたは背景を選んで閉じてください。閉じると、起動ボタンにフォーカスが戻ります。
              </p>
              <button type="button" className={styles.secondaryButton} onClick={closeDrawer}>
                閉じる
              </button>
            </div>
          </dialog>
          <p className={styles.note}>
            ネイティブdialogのモーダル動作とフォーカス管理を使用します。
          </p>
        </section>

        <section className={styles.panel} aria-labelledby="motion-title">
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.index}>05</span>
              <h2 id="motion-title">Motion</h2>
            </div>
            <span className={styles.badge}>操作フィードバック</span>
          </div>
          <p className={styles.description}>
            ボタン操作に対する小さなアニメーションを試せます。システムの動きを減らす設定にも対応します。
          </p>
          <MotionDemo onFinishedChange={setMotionFinished} />
          <p className={styles.statusLine} aria-live="polite">
            状態: {motionFinished ? "完了" : "待機中"}
          </p>
        </section>

        <section className={styles.panel} aria-labelledby="transition-title">
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.index}>06</span>
              <h2 id="transition-title">View Transitions</h2>
            </div>
            <span className={styles.badge}>同じ画面内で切替</span>
          </div>
          <p className={styles.description}>
            機能対応時は表示の切替をつなぎます。非対応環境や「視差効果を減らす」設定では即時に切り替わります。
          </p>
          <div className={styles.transitionDemo}>
            <div
              className={`${styles.transitionContent} ${styles.viewTransitionTarget}`}
              key={view}
            >
              <span className={styles.transitionIcon} aria-hidden="true">
                {view === "overview" ? "◌" : "✳"}
              </span>
              <div>
                <strong>{view === "overview" ? "概要" : "詳細"}</strong>
                <span>
                  {view === "overview"
                    ? "同じ領域の内容を切り替えるデモ"
                    : "画面遷移せずに内容だけが変わります"}
                </span>
              </div>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={switchView}>
              表示を切り替える
            </button>
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        各セクションは独立したPoCです。操作はこのページ内だけに反映されます。
      </footer>
    </main>
  );
}
