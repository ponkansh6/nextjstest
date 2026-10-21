"use client";

import { useSearchParams } from "next/navigation";
import React from "react";
import { serializeUrlState } from "../lib/urlState";

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
 * URL is the source of the initial shared-state snapshot. CpiChart owns the
 * live React mirrors and sends changes back through updateUrl. This hook does
 * not subscribe to popstate or read localStorage.
 */
export function useUrlState(defaultStart: number, defaultEnd: number) {
  const searchParams = useSearchParams();

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const hiddenParam = searchParams.get("hidden");

  const [from, to] = normalizeRange(fromParam, toParam, defaultStart, defaultEnd);
  const hiddenKeys = React.useMemo(
    () => (hiddenParam ? hiddenParam.split(",").filter(Boolean) : []),
    [hiddenParam],
  );

  React.useEffect(() => {
    // Retire legacy links on the current history entry as soon as the client
    // reads their URL snapshot. The guard keeps this from rewriting the URL
    // again after Next observes the replaceState update.
    if (!searchParams.has("adv")) return;

    const currentUrl = new URL(window.location.href);
    const currentParams = new URLSearchParams(currentUrl.search);
    if (!currentParams.has("adv")) return;

    const params = serializeUrlState(
      currentParams,
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
  }, [defaultEnd, defaultStart, from, hiddenKeys, searchParams, to]);

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
      const url = query ? `?${query}` : window.location.pathname;
      window.history.replaceState(window.history.state, "", url);
    },
    [defaultStart, defaultEnd],
  );

  return {
    from,
    to,
    hiddenKeys,
    updateUrl,
  };
}
