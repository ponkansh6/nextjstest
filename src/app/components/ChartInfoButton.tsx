"use client";

import {
  startTransition,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
  ViewTransition,
} from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./ChartInfoButton.module.css";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

type PopupPositionElement = Pick<HTMLElement, "getBoundingClientRect">;

export function getChartInfoPopupPosition(
  trigger: PopupPositionElement | null,
  popup: PopupPositionElement | null,
  viewportWidth: number,
  viewportMargin = 16,
): { left: number; top: number } | null {
  if (!trigger || !popup) return null;

  const triggerRect = trigger.getBoundingClientRect();
  const popupWidth = popup.getBoundingClientRect().width;
  const desiredLeft = triggerRect.right - popupWidth;
  const maxLeft = Math.max(viewportMargin, viewportWidth - popupWidth - viewportMargin);

  return {
    left: Math.min(Math.max(desiredLeft, viewportMargin), maxLeft),
    top: triggerRect.bottom + 6,
  };
}

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
  const openRef = useRef(open);
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
      // Keep event handlers based on the latest requested target while React is
      // still rendering an earlier transition.
      openRef.current = nextOpen;
      if (nextOpen) {
        closeReasonRef.current = "trigger";
        outsideFocusTargetRef.current = null;
      } else {
        closeReasonRef.current = restoreTriggerFocus ? "trigger" : "outside";
        if (restoreTriggerFocus) {
          triggerRef.current?.focus({ preventScroll: true });
        }
      }

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const canTransition =
        allowTransition &&
        !reducedMotion &&
        document.visibilityState === "visible" &&
        typeof document.startViewTransition === "function";

      if (canTransition) {
        startTransition(() => setOpen(nextOpen));
      } else {
        // Reduced motion, hidden documents, non-supporting browsers, and
        // pointer dismissals retain a direct, focus-safe state update.
        setOpen(nextOpen);
      }
    },
    [],
  );

  useFocusTrap(popupRef, open, triggerRef, getFocusRestoreTarget);

  // Focus the newly committed popup before paint. React owns the transition
  // lifecycle, while focus remains synchronized with the actual DOM commit.
  useLayoutEffect(() => {
    if (!open) return;
    const popup = popupRef.current;

    const syncPopupPosition = () => {
      const currentPopup = popupRef.current;
      const position = getChartInfoPopupPosition(
        triggerRef.current,
        currentPopup,
        window.innerWidth,
      );
      if (!position) return;
      currentPopup!.style.setProperty("--chart-info-popup-top", `${position.top}px`);
      currentPopup!.style.setProperty("--chart-info-popup-left", `${position.left}px`);
    };

    syncPopupPosition();
    popup
      ?.querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")
      ?.focus({ preventScroll: true });

    window.addEventListener("resize", syncPopupPosition);
    window.addEventListener("scroll", syncPopupPosition, true);
    return () => {
      window.removeEventListener("resize", syncPopupPosition);
      window.removeEventListener("scroll", syncPopupPosition, true);
    };
  }, [open]);

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      // The backdrop is inside the wrapper; the popup is the component's first
      // returned node so it can participate in React enter/exit transitions.
      if (
        wrapperRef.current?.contains(e.target as Node) ||
        popupRef.current?.contains(e.target as Node)
      ) {
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
        // A dismissal is urgent so keyboard users do not wait for an exit
        // snapshot before the dialog is removed and focus is restored.
        updateOpen(false, true, false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, updateOpen]);

  const handleToggle = () => {
    const nextOpen = !openRef.current;
    updateOpen(nextOpen, !nextOpen);
  };

  const handleClose = () => {
    updateOpen(false, true, false);
  };

  const handleBackdropClose = () => {
    updateOpen(false, true, false);
  };

  return (
    <>
      {/* ── Popup panel ── */}
      {open && (
        <ViewTransition enter="auto" exit="auto" default="none">
          <div
            ref={popupRef}
            className={styles.popup}
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
        </ViewTransition>
      )}

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
          <div className={styles.backdrop} aria-hidden="true" onClick={handleBackdropClose} />
        )}
      </span>
    </>
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
