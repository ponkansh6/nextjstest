"use client";
import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./CpiChart.module.css";

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  compact?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  open,
  title,
  onClose,
  children,
  compact,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  useFocusTrap(sheetRef, open);

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
      <div
        ref={sheetRef}
        className={`${styles.bottomSheet}${compact ? ` ${styles.bottomSheetCompact}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
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
