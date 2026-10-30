"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./ChartInfoButton.module.css";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

interface ChartInfoButtonProps {
  /** Label for the trigger button's aria-label */
  ariaLabel?: string;
  /** Optional className for the wrapper */
  className?: string;
  /** Content rendered inside the popup panel */
  children: ReactNode;
}

export default function ChartInfoButton({
  ariaLabel = "データソースの説明を表示",
  className,
  children,
}: ChartInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const [viewTransitionEnabled, setViewTransitionEnabled] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeReasonRef = useRef<"trigger" | "outside">("trigger");
  const outsideFocusTargetRef = useRef<HTMLElement | null>(null);

  const getFocusRestoreTarget = useCallback(() => {
    if (closeReasonRef.current === "outside") {
      const clickedTarget = outsideFocusTargetRef.current;
      return clickedTarget?.isConnected ? clickedTarget : triggerRef.current;
    }
    return triggerRef.current;
  }, []);

  const updateOpen = useCallback(
    (nextOpen: boolean, restoreTriggerFocus: boolean, allowTransition = true) => {
      if (nextOpen) {
        closeReasonRef.current = "trigger";
        outsideFocusTargetRef.current = null;
      } else {
        closeReasonRef.current = restoreTriggerFocus ? "trigger" : "outside";
      }

      const startViewTransition = document.startViewTransition;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const canTransition =
        allowTransition &&
        !reducedMotion &&
        document.visibilityState === "visible" &&
        typeof startViewTransition === "function";

      let didCommit = false;
      const commit = () => {
        if (didCommit) return;
        didCommit = true;
        flushSync(() => {
          setViewTransitionEnabled(canTransition);
          setOpen(nextOpen);
        });

        // Move focus with the DOM update so the transition never delays dialog
        // access. useFocusTrap keeps its normal focus trap and close restoration.
        if (nextOpen) {
          popupRef.current
            ?.querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")
            ?.focus({ preventScroll: true });
        } else if (restoreTriggerFocus) {
          triggerRef.current?.focus({ preventScroll: true });
        }
      };

      if (canTransition && startViewTransition) {
        const rootClass = "chart-info-view-transition-active";
        const clearRootClass = () => document.documentElement.classList.remove(rootClass);
        document.documentElement.classList.add(rootClass);
        try {
          const transition = startViewTransition.call(document, commit) as {
            finished?: Promise<unknown>;
          };
          if (transition.finished) {
            void transition.finished.then(clearRootClass, clearRootClass);
          } else {
            requestAnimationFrame(() => requestAnimationFrame(clearRootClass));
          }
          return;
        } catch {
          clearRootClass();
          // A transition can be rejected by a browser while another transition
          // is active. Keep the interaction available with the normal update.
        }
      }

      commit();
    },
    [],
  );

  useFocusTrap(popupRef, open, triggerRef, getFocusRestoreTarget);

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      // The backdrop and popup are descendants of the wrapper span returned below,
      // so this contains check already covers every internal pointer target.
      if (wrapperRef.current?.contains(e.target as Node)) {
        return;
      }
      outsideFocusTargetRef.current =
        e.target instanceof Element ? e.target.closest<HTMLElement>(FOCUSABLE_SELECTOR) : null;
      // Keep an outside click on its original target immediately actionable.
      updateOpen(false, false, false);
    };

    // Use a short delay so the same click that opened doesn't close
    const timer = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    });

    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, updateOpen]);

  // ── Close on Escape ──
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        updateOpen(false, true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, updateOpen]);

  const handleToggle = () => {
    updateOpen(!open, open);
  };

  const handleClose = () => {
    updateOpen(false, true);
  };

  const handleBackdropClose = () => {
    updateOpen(false, true, false);
  };

  return (
    <span ref={wrapperRef} className={`${styles.wrapper}${className ? ` ${className}` : ""}`}>
      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <text
            x="8"
            y="11.5"
            textAnchor="middle"
            fill="currentColor"
            fontSize="11"
            fontWeight="700"
            fontFamily="inherit"
          >
            i
          </text>
        </svg>
      </button>

      {/* ── Mobile backdrop ── */}
      {open && (
        <div
          className={`${styles.backdrop}${viewTransitionEnabled ? ` ${styles.viewTransitionBackdrop}` : ""}`}
          aria-hidden="true"
          onClick={handleBackdropClose}
        />
      )}

      {/* ── Popup panel ── */}
      {open && (
        <div
          ref={popupRef}
          className={`${styles.popup}${viewTransitionEnabled ? ` ${styles.viewTransitionPopup}` : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
        >
          {/* Close button */}
          <button
            type="button"
            className={styles.closeButton}
            aria-label="閉じる"
            onClick={handleClose}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M1 1l10 10M11 1L1 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Content */}
          {children}
        </div>
      )}
    </span>
  );
}

// ── Convenience sub-components for structured content ──

interface SectionHeadingProps {
  children: ReactNode;
}

export function ChartInfoSectionHeading({ children }: SectionHeadingProps) {
  return <p className={styles.heading}>{children}</p>;
}

interface ListProps {
  children: ReactNode;
}

export function ChartInfoList({ children }: ListProps) {
  return <ul className={styles.list}>{children}</ul>;
}

interface ListItemProps {
  children: ReactNode;
}

export function ChartInfoListItem({ children }: ListItemProps) {
  return <li className={styles.listItem}>{children}</li>;
}

interface SourceProps {
  children: ReactNode;
}

export function ChartInfoSource({ children }: SourceProps) {
  return <p className={styles.source}>{children}</p>;
}

interface UrlProps {
  href: string;
  children: ReactNode;
}

export function ChartInfoUrl({ href, children }: UrlProps) {
  return (
    <a className={styles.url} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
