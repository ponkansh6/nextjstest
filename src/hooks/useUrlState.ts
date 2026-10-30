"use client";

import { useSearchParams } from "next/navigation";
import React from "react";
import { parseSectionId, serializeSectionUrlState, serializeUrlState } from "../lib/urlState";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function parseYearParam(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  // parseInt accepts prefixes such as "2024tail" and silently produces a
  // misleading year. URL years are decimal integer values in their entirety.
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeRange(
  fromParam: string | null,
  toParam: string | null,
  defaultStart: number,
  defaultEnd: number,
): [number, number] {
  const parsedFrom = parseYearParam(fromParam, defaultStart);
  const parsedTo = parseYearParam(toParam, defaultEnd);
  if (parsedFrom === null || parsedTo === null) return [defaultStart, defaultEnd];

  const minYear = Math.min(defaultStart, defaultEnd);
  const maxYear = Math.max(defaultStart, defaultEnd);
  const from = Math.min(maxYear, Math.max(minYear, parsedFrom));
  const to = Math.min(maxYear, Math.max(minYear, parsedTo));
  return from <= to ? [from, to] : [defaultStart, defaultEnd];
}

/**
 * URL is the source of the shared-state snapshot. CpiChart owns the live React
 * mirrors; this hook exposes popstate changes so those mirrors can be restored.
 */
export function useUrlState(
  defaultStart: number,
  defaultEnd: number,
  sectionIds: readonly string[] = [],
) {
  const searchParams = useSearchParams();
  const frameworkSearchParamsString = searchParams.toString();
  const searchParamsString =
    frameworkSearchParamsString === "[object Object]"
      ? typeof window === "undefined"
        ? ""
        : window.location.search.replace(/^\?/, "")
      : frameworkSearchParamsString;
  const [popStateSnapshot, setPopStateSnapshot] = React.useState<{
    version: number;
    pathname: string;
    search: string;
  } | null>(null);
  const popStateVersionRef = React.useRef(0);
  const didNormalizeInitialSectionRef = React.useRef(false);
  const currentPathname = typeof window === "undefined" ? "" : window.location.pathname;
  const currentSearch = typeof window === "undefined" ? "" : window.location.search;

  useIsomorphicLayoutEffect(() => {
    const handlePopState = () => {
      popStateVersionRef.current += 1;
      setPopStateSnapshot({
        version: popStateVersionRef.current,
        pathname: window.location.pathname,
        search: window.location.search,
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (didNormalizeInitialSectionRef.current) return;
    didNormalizeInitialSectionRef.current = true;
    if (popStateVersionRef.current > 0) return;

    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const sectionParam = params.get("section");
    if (sectionParam === null || sectionIds.includes(sectionParam)) return;

    const defaultSectionId = sectionIds[0] ?? "";
    const normalizedParams = serializeSectionUrlState(params, defaultSectionId, defaultSectionId);
    const query = normalizedParams.toString();
    url.search = query ? `?${query}` : "";
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [sectionIds]);

  React.useEffect(() => {
    if (!popStateSnapshot) return;
    const snapshotSearch = popStateSnapshot.search.replace(/^\?/, "");
    if (
      currentPathname !== popStateSnapshot.pathname ||
      currentSearch !== popStateSnapshot.search ||
      searchParamsString === snapshotSearch
    ) {
      setPopStateSnapshot(null);
    }
  }, [currentPathname, currentSearch, popStateSnapshot, searchParamsString]);

  const currentParams = React.useMemo(() => {
    if (
      popStateSnapshot &&
      popStateSnapshot.pathname === currentPathname &&
      popStateSnapshot.search === currentSearch
    ) {
      return new URLSearchParams(popStateSnapshot.search);
    }
    return new URLSearchParams(searchParamsString);
  }, [currentPathname, currentSearch, popStateSnapshot, searchParamsString]);

  const fromParam = currentParams.get("from");
  const toParam = currentParams.get("to");
  const hiddenParam = currentParams.get("hidden");
  const section = parseSectionId(currentParams.get("section"), sectionIds, sectionIds[0] ?? "");

  const [from, to] = normalizeRange(fromParam, toParam, defaultStart, defaultEnd);
  const hiddenKeys = React.useMemo(
    () => (hiddenParam ? hiddenParam.split(",").filter(Boolean) : []),
    [hiddenParam],
  );

  React.useEffect(() => {
    // Retire legacy links on the current history entry as soon as the client
    // reads their URL snapshot. The guard keeps this from rewriting the URL
    // again after Next observes the replaceState update.
    if (!currentParams.has("adv")) return;

    const currentUrl = new URL(window.location.href);
    const urlParams = new URLSearchParams(currentUrl.search);
    if (!urlParams.has("adv")) return;

    const params = serializeUrlState(
      urlParams,
      { from, to, hidden: hiddenKeys },
      defaultStart,
      defaultEnd,
    );
    const query = params.toString();
    currentUrl.search = query ? `?${query}` : "";
    window.history.replaceState(
      window.history.state,
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
  }, [currentParams, defaultEnd, defaultStart, from, hiddenKeys, to]);

  const updateUrl = React.useCallback(
    (newFrom: number, newTo: number, newHidden: string[]) => {
      // router.replace は同一パスでのクエリ変更時に scroll:false でもスクロール位置をリセットする
      // （Next.js App Router の既知の挙動）ため、window.history.replaceState で
      // スクロール位置に影響しないURL同期を行う
      const params = serializeUrlState(
        new URLSearchParams(window.location.search),
        { from: newFrom, to: newTo, hidden: newHidden },
        defaultStart,
        defaultEnd,
      );

      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", url);
    },
    [defaultStart, defaultEnd],
  );

  return {
    from,
    to,
    hiddenKeys,
    section,
    popStateVersion: popStateSnapshot?.version ?? popStateVersionRef.current,
    updateUrl,
  };
}
