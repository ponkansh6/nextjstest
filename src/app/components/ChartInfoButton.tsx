"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import styles from "./ChartInfoButton.module.css";

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
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      // Don't close if clicking inside the wrapper or the popup
      if (
        wrapperRef.current?.contains(e.target as Node) ||
        popupRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };

    // Use a short delay so the same click that opened doesn't close
    const timer = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    });

    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  // ── Close on Escape ──
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // ── Trap focus inside popup when open ──
  useEffect(() => {
    if (!open) return;

    const popup = popupRef.current;
    if (!popup) return;

    const focusable = popup.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    // Focus the first focusable element, or the popup itself
    if (first) {
      first.focus();
    } else {
      popup.focus();
    }

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleClose = () => {
    setOpen(false);
    triggerRef.current?.focus();
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
      {open && <div className={styles.backdrop} aria-hidden="true" onClick={handleClose} />}

      {/* ── Popup panel ── */}
      {open && (
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
