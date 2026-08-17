import { useEffect, useRef } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Trap focus inside a container when open and restore it on close.
 *
 * @param containerRef - ref to the container element (the dialog/panel)
 * @param open         - whether the container is currently visible
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save & restore focus around open/close
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    if (!container) return;

    // Focus the first focusable element inside the container
    const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = focusable[0];
    if (first) {
      first.focus();
    } else {
      container.focus();
    }

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open, containerRef]);

  // Trap Tab / Shift+Tab inside the container
  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

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

    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, [open, containerRef]);
}
