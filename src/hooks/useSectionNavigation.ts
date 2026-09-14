"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Section {
  id: string;
}

interface UseSectionNavigationOptions {
  sections: readonly Section[];
}

interface UseSectionNavigationResult {
  activeId: string;
  handleSelectSection: (id: string) => void;
  isProgrammaticScroll: boolean;
}

const STABLE_FRAMES_THRESHOLD = 30;
const MAX_FRAMES = 180;

/**
 * Section navigation owns activeId and scroll suppression as in-memory React
 * state. It has no URL or localStorage synchronization responsibility.
 */
export function useSectionNavigation({
  sections,
}: UseSectionNavigationOptions): UseSectionNavigationResult {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
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
            setActiveId(sec.id);
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
  }, [sections, endProgrammaticScroll]);

  const handleSelectSection = useCallback(
    (id: string) => {
      setActiveId(id);
      const getTarget = () =>
        document.getElementById(id) ??
        document.querySelector<HTMLElement>(`[data-lazy-section="${id}"]`);
      const target = getTarget();
      if (!target) return;

      isProgrammaticScrollRef.current = true;
      setIsProgrammaticScroll(true);
      target.scrollIntoView({ behavior: "smooth", block: "start" });

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
    [endProgrammaticScroll],
  );

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
