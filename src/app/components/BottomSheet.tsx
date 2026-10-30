"use client";
import React, { useEffect, useRef, useState } from "react";
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
  const [isMountedForExit, setIsMountedForExit] = useState(open);
  const [isClosingState, setIsClosingState] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isClosing = !open || isClosingState;
  const swipeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  useFocusTrap(sheetRef, open);

  useEffect(() => {
    if (open) {
      setIsMountedForExit(true);
      setIsClosingState(false);
      setIsExpanded(false);
      return;
    }
    if (!isMountedForExit) return;

    setIsClosingState(true);
    const timeoutId = window.setTimeout(() => {
      setIsMountedForExit(false);
      setIsClosingState(false);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [isMountedForExit, open]);

  const handleSwipeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!open || (event.pointerType !== "touch" && event.pointerType !== "pen")) return;
    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      swipeRef.current = null;
    }
  };

  const clearSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const activeSwipe = swipeRef.current;
    if (!activeSwipe || activeSwipe.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may already have released capture while cancelling a gesture.
    }
  };

  const handleSwipeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const activeSwipe = swipeRef.current;
    if (!activeSwipe || activeSwipe.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - activeSwipe.startX;
    const deltaY = event.clientY - activeSwipe.startY;
    const isVerticalSwipe = Math.abs(deltaY) >= 48 && Math.abs(deltaY) > Math.abs(deltaX) * 1.25;
    const isAtTop = (sheetRef.current?.scrollTop ?? 0) <= 0;
    clearSwipe(event);

    if (!isVerticalSwipe || !isAtTop) return;
    if (deltaY < 0 && compact && !isExpanded) {
      setIsExpanded(true);
      return;
    }
    if (deltaY > 0) {
      if (compact && isExpanded) {
        setIsExpanded(false);
      } else {
        onClose();
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Keep the sheet mounted for its short exit animation. It becomes inert and
  // leaves the accessibility tree as soon as the controlled `open` prop closes.
  if (!open && !isMountedForExit) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className={`${styles.bottomSheetBackdrop}${isClosing ? ` ${styles.bottomSheetBackdropClosing}` : ""}`}
        onClick={open ? onClose : undefined}
      />
      <div
        ref={sheetRef}
        className={`${styles.bottomSheet}${compact ? ` ${styles.bottomSheetCompact}` : ""}${compact && isExpanded ? ` ${styles.bottomSheetExpanded}` : ""}${isClosing ? ` ${styles.bottomSheetClosing}` : ""}`}
        role="dialog"
        aria-modal={open}
        aria-hidden={isClosing || undefined}
        inert={isClosing}
        aria-label={title}
        tabIndex={open ? -1 : undefined}
      >
        <div
          className={styles.bottomSheetDragHandle}
          aria-hidden="true"
          onPointerDown={handleSwipeStart}
          onPointerUp={handleSwipeEnd}
          onPointerCancel={clearSwipe}
          onLostPointerCapture={clearSwipe}
        />
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
