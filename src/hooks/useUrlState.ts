"use client";

import { useSearchParams, useRouter } from "next/navigation";
import React from "react";

export function useUrlState(defaultStart: number, defaultEnd: number) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const hiddenParam = searchParams.get("hidden");

  const from = fromParam ? parseInt(fromParam, 10) : defaultStart;
  const to = toParam ? parseInt(toParam, 10) : defaultEnd;
  const hiddenKeys = hiddenParam ? hiddenParam.split(",").filter(Boolean) : [];

  const updateUrl = React.useCallback(
    (newFrom: number, newTo: number, newHidden: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
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

      const query = params.toString();
      const url = query ? `?${query}` : window.location.pathname;
      router.replace(url, { scroll: false });
    },
    [searchParams, router, defaultStart, defaultEnd]
  );

  return {
    from,
    to,
    hiddenKeys,
    updateUrl,
  };
}
