"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import styles from "./page.module.css";

type MotionDemoProps = {
  onFinishedChange: (finished: boolean) => void;
};

export default function MotionDemo({ onFinishedChange }: MotionDemoProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const showDemo = () => {
    setIsVisible(true);
    setReplayKey((key) => key + 1);
    onFinishedChange(prefersReducedMotion !== false);
  };

  return (
    <MotionConfig reducedMotion="user">
      <section className={styles.panel} aria-labelledby="motion-demo-title">
        <h3 id="motion-demo-title">Motionのアニメーション</h3>
        <p className={styles.description}>
          表示ボタンを押して、内容が現れる動きを試します。
          {prefersReducedMotion ? " 動きを減らす設定が有効なため、静的に表示します。" : ""}
        </p>
        <button className={styles.primaryButton} type="button" onClick={showDemo}>
          {isVisible ? "もう一度表示する" : "表示する"}
        </button>
        <div
          aria-live="polite"
          style={{ minHeight: 72, display: "grid", alignItems: "center", marginTop: 12 }}
        >
          {isVisible &&
            (prefersReducedMotion === true ? (
              <div className={styles.statusLine}>Motionのデモを表示しました。</div>
            ) : (
              <motion.div
                key={replayKey}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: prefersReducedMotion === false ? 0.32 : 0,
                  ease: "easeOut",
                }}
                onAnimationComplete={() => onFinishedChange(true)}
                className={styles.transitionContent}
              >
                Motionのデモを表示しました。
              </motion.div>
            ))}
        </div>
      </section>
    </MotionConfig>
  );
}
