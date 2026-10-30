"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { serializeSectionUrlState } from "../lib/urlState";

interface Section {
  id: string;
}

interface UseSectionNavigationOptions {
  sections: readonly Section[];
  initialActiveId?: string;
  popStateVersion?: number;
}

interface UseSectionNavigationResult {
  activeId: string;
  handleSelectSection: (id: string) => void;
  isProgrammaticScroll: boolean;
}

const STABLE_FRAMES_THRESHOLD = 30;
const MAX_FRAMES = 180;

/**
 * Section navigation owns activeId, section URL history, and scroll
 * restoration/suppression. Period and series filters remain in useUrlState.
 */
export function useSectionNavigation({
  sections,
  initialActiveId = "",
  popStateVersion = 0,
}: UseSectionNavigationOptions): UseSectionNavigationResult {
  const defaultSectionId = sections[0]?.id ?? "";
  const resolvedInitialActiveId = initialActiveId || defaultSectionId;
  const [activeId, setActiveId] = useState(resolvedInitialActiveId);
  const activeIdRef = useRef(activeId);
  const isProgrammaticScrollRef = useRef(false);
  const [isProgrammaticScroll, setIsProgrammaticScroll] = useState(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameIdsRef = useRef<Set<number>>(new Set());

  const endProgrammaticScroll = useCallback(() => {
    isProgrammaticScrollRef.current = false;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
    programmaticScrollTimerRef.current = setTimeout(() => {
      setIsProgrammaticScroll(false);
    }, 150);
  }, []);

  const writeSectionToUrl = useCallback(
    (id: string, mode: "push" | "replace") => {
      const currentUrl = new URL(window.location.href);
      const params = serializeSectionUrlState(currentUrl.searchParams, id, defaultSectionId);
      const query = params.toString();
      currentUrl.search = query ? `?${query}` : "";
      const url = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      if (mode === "push") {
        window.history.pushState(window.history.state, "", url);
      } else {
        window.history.replaceState(window.history.state, "", url);
      }
    },
    [defaultSectionId],
  );

  useEffect(() => {
    const history = window.history;
    let previousScrollRestoration: ScrollRestoration;
    try {
      previousScrollRestoration = history.scrollRestoration;
      history.scrollRestoration = "manual";
    } catch {
      return;
    }
    return () => {
      try {
        history.scrollRestoration = previousScrollRestoration;
      } catch {
        // The browser may revoke history access during navigation/unload.
      }
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const scrollPos = window.scrollY + window.innerHeight * 0.4;
      for (const sec of sections) {
        const el = document.getElementById(sec.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            if (activeIdRef.current !== sec.id) {
              activeIdRef.current = sec.id;
              setActiveId(sec.id);
              writeSectionToUrl(sec.id, "replace");
            }
            break;
          }
        }
      }
    };
    const handleScrollEnd = () => {
      endProgrammaticScroll();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scrollend", handleScrollEnd);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [sections, endProgrammaticScroll, writeSectionToUrl]);

  const handleSelectSection = useCallback(
    (id: string, historyMode: "push" | "none" = "push", behavior: ScrollBehavior = "smooth") => {
      if (historyMode !== "none" && (historyMode !== "push" || activeIdRef.current !== id)) {
        writeSectionToUrl(id, historyMode);
      }
      activeIdRef.current = id;
      setActiveId(id);
      const getTarget = () =>
        document.getElementById(id) ??
        document.querySelector<HTMLElement>(`[data-lazy-section="${id}"]`);
      const target = getTarget();
      if (!target) return;

      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const scrollBehavior = prefersReducedMotion && behavior === "smooth" ? "auto" : behavior;
      isProgrammaticScrollRef.current = true;
      setIsProgrammaticScroll(true);
      target.scrollIntoView({ behavior: scrollBehavior, block: "start" });

      let lastTop = target.getBoundingClientRect().top;
      let stableFrames = 0;
      let framesElapsed = 0;
      const scheduleChase = () => {
        const frameId = window.requestAnimationFrame(() => {
          animationFrameIdsRef.current.delete(frameId);
          chase();
        });
        animationFrameIdsRef.current.add(frameId);
      };
      const chase = () => {
        framesElapsed++;
        const current = getTarget();
        if (!current) {
          scheduleChase();
          return;
        }
        const top = current.getBoundingClientRect().top;
        if (Math.abs(top - lastTop) > 1) {
          lastTop = top;
          stableFrames = 0;
          if (Math.abs(top) > 2) current.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          stableFrames++;
        }
        if (stableFrames >= STABLE_FRAMES_THRESHOLD || framesElapsed > MAX_FRAMES) {
          endProgrammaticScroll();
          return;
        }
        scheduleChase();
      };
      scheduleChase();
    },
    [endProgrammaticScroll, writeSectionToUrl],
  );

  const didInitialRestoreRef = useRef(false);
  useEffect(() => {
    if (didInitialRestoreRef.current) return;
    didInitialRestoreRef.current = true;
    if (resolvedInitialActiveId === defaultSectionId) return;
    const frame = window.requestAnimationFrame(() =>
      handleSelectSection(resolvedInitialActiveId, "none", "auto"),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [defaultSectionId, handleSelectSection, resolvedInitialActiveId]);

  useEffect(() => {
    if (popStateVersion === 0) return;
    const id = resolvedInitialActiveId;
    activeIdRef.current = id;
    setActiveId(id);
    const frame = window.requestAnimationFrame(() => {
      animationFrameIdsRef.current.delete(frame);
      handleSelectSection(id, "none", "auto");
    });
    animationFrameIdsRef.current.add(frame);
  }, [defaultSectionId, handleSelectSection, popStateVersion, resolvedInitialActiveId]);

  useEffect(() => {
    const animationFrameIds = animationFrameIdsRef.current;
    return () => {
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      for (const frameId of animationFrameIds) {
        window.cancelAnimationFrame(frameId);
      }
      animationFrameIds.clear();
    };
  }, []);

  return { activeId, handleSelectSection, isProgrammaticScroll };
}
