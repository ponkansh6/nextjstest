"use client";

import { useSearchParams } from "next/navigation";
import React from "react";

export function useUrlState(defaultStart: number, defaultEnd: number) {
  const searchParams = useSearchParams();

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const hiddenParam = searchParams.get("hidden");
  const advParam = searchParams.get("adv");

  const from = fromParam ? parseInt(fromParam, 10) : defaultStart;
  const to = toParam ? parseInt(toParam, 10) : defaultEnd;
  const hiddenKeys = hiddenParam ? hiddenParam.split(",").filter(Boolean) : [];
  const adv = advParam === "1";

  const updateUrl = React.useCallback(
    (newFrom: number, newTo: number, newHidden: string[], newAdv: boolean) => {
      // router.replace は同一パスでのクエリ変更時に scroll:false でもスクロール位置をリセットする
      // （Next.js App Router の既知の挙動）ため、window.history.replaceState で
      // スクロール位置に影響しないURL同期を行う
      const params = new URLSearchParams(window.location.search);
      if (newFrom !== defaultStart) {
        params.set("from", String(newFrom));
      } else {
        params.delete("from");
      }
      if (newTo !== defaultEnd) {
        params.set("to", String(newTo));
      } else {
        params.delete("to");
      }
      if (newHidden.length > 0) {
        params.set("hidden", newHidden.join(","));
      } else {
        params.delete("hidden");
      }
      if (newAdv) {
        params.set("adv", "1");
      } else {
        params.delete("adv");
      }

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
    adv,
    updateUrl,
  };
}
