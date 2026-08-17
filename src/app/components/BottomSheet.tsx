"use client";
import React, { useEffect } from "react";
import styles from "./CpiChart.module.css";

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ open, title, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.bottomSheetBackdrop} onClick={onClose} />
      <div className={styles.bottomSheet} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.bottomSheetHeader}>
          <span className={styles.bottomSheetTitle}>{title}</span>
          <button
            type="button"
            className={styles.bottomSheetClose}
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
};
