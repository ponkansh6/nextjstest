"use client";

import { Dialog } from "radix-ui";
import {
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerRoot,
  DrawerTitle,
  DrawerTrigger,
} from "./BaseDrawer";
import styles from "./dialog-options.module.css";

export default function DialogOptionsDemo() {
  return (
    <section className={styles.section} aria-labelledby="dialog-options-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.index}>04+</span>
          <h2 id="dialog-options-title">Dialogの実装方式を比較</h2>
        </div>
        <span className={styles.badge}>それぞれ開いて操作</span>
      </div>
      <p className={styles.intro}>
        ひとつ上のNative dialogと、Radix Dialog、shadcn/ui Drawer（Base
        UI版）を比べます。各デモでEscape、背景操作、閉じるボタン、フォーカスの戻り方を試せます。
      </p>

      <div className={styles.comparison} role="group" aria-label="3方式の比較">
        <div className={styles.comparisonItem}>
          <span className={styles.comparisonNumber}>01</span>
          <div>
            <strong>Native dialog</strong>
            <span>ブラウザー標準のモーダル</span>
          </div>
          <span className={styles.current}>上のデモ</span>
        </div>
        <div className={styles.comparisonItem}>
          <span className={styles.comparisonNumber}>02</span>
          <div>
            <strong>Radix Dialog</strong>
            <span>汎用モーダルのプリミティブ</span>
          </div>
          <span className={styles.current}>下で試す</span>
        </div>
        <div className={styles.comparisonItem}>
          <span className={styles.comparisonNumber}>03</span>
          <div>
            <strong>shadcn/ui Drawer</strong>
            <span>Base UI版・スワイプ対応</span>
          </div>
          <span className={styles.current}>下で試す</span>
        </div>
      </div>

      <div className={styles.demos}>
        <article className={styles.demoCard}>
          <div className={styles.demoHeading}>
            <span className={styles.demoIcon} aria-hidden="true">
              R
            </span>
            <div>
              <h3>Radix Dialog</h3>
              <p>中央に開く汎用ダイアログ</p>
            </div>
          </div>
          <p className={styles.demoDescription}>
            Escapeまたは背景を選ぶと閉じます。フォーカス移動と復帰はプリミティブに任せています。
          </p>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button className={styles.openButton} type="button">
                Radixを開く
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className={styles.dialogOverlay} />
              <Dialog.Content className={styles.dialogContent}>
                <Dialog.Close className={styles.iconClose} aria-label="閉じる">
                  <span aria-hidden="true">×</span>
                </Dialog.Close>
                <span className={styles.modalEyebrow}>RADIX DIALOG</span>
                <Dialog.Title className={styles.modalTitle}>汎用ダイアログ</Dialog.Title>
                <Dialog.Description className={styles.modalDescription}>
                  Escape、背景、右上の閉じるボタンで閉じられます。閉じた後は起動ボタンにフォーカスが戻ります。
                </Dialog.Description>
                <Dialog.Close asChild>
                  <button className={styles.closeButton} type="button">
                    閉じる
                  </button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </article>

        <article className={styles.demoCard}>
          <div className={styles.demoHeading}>
            <span className={`${styles.demoIcon} ${styles.drawerIcon}`} aria-hidden="true">
              B
            </span>
            <div>
              <h3>shadcn/ui Drawer</h3>
              <p>Base UI版のローカルコピー</p>
            </div>
          </div>
          <p className={styles.demoDescription}>
            現行shadcn/ui Base UI版の構成をCSS Modulesで試すローカルPoCです（shadcn
            CLI生成コードではありません）。下端から開き、下方向へのスワイプ、Escape、背景、閉じるボタンで閉じられます。
          </p>
          <DrawerRoot>
            <DrawerTrigger render={<button className={styles.openButton} type="button" />}>
              Drawerを開く
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHandle />
              <div className={styles.drawerBody}>
                <span className={styles.modalEyebrow}>SHADCN / BASE UI DRAWER</span>
                <DrawerTitle className={styles.modalTitle}>シート型のドロワー</DrawerTitle>
                <DrawerDescription className={styles.modalDescription}>
                  Base
                  UI標準のフォーカス移動と復帰を使います。Escape、背景、閉じるボタン、または下方向へのスワイプで閉じられます。
                </DrawerDescription>
                <DrawerClose render={<button className={styles.closeButton} type="button" />}>
                  閉じる
                </DrawerClose>
              </div>
            </DrawerContent>
          </DrawerRoot>
        </article>
      </div>
      <p className={styles.note}>
        どちらも標準のフォーカス管理を使い、独自のフォーカストラップは追加していません。動きを減らす設定ではアニメーションを抑えます。
      </p>
      <p className={styles.note}>
        iOS Safariでスクロール後に開く場合は、背景を画面全体へ重ねるためbodyに{" "}
        <code>position: relative;</code> を指定します。
      </p>
    </section>
  );
}
