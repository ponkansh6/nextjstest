export interface UrlStateValues {
  from: number;
  to: number;
  hidden: string[];
  adv: boolean;
}

/**
 * Applies the existing URL state contract to a copy of the current query.
 * This intentionally does not read from or write to browser globals.
 */
export function serializeUrlState(
  currentParams: URLSearchParams,
  values: UrlStateValues,
  defaultStart: number,
  defaultEnd: number,
): URLSearchParams {
  const params = new URLSearchParams(currentParams);

  if (values.from !== defaultStart) {
    params.set("from", String(values.from));
  } else {
    params.delete("from");
  }
  if (values.to !== defaultEnd) {
    params.set("to", String(values.to));
  } else {
    params.delete("to");
  }
  if (values.hidden.length > 0) {
    params.set("hidden", values.hidden.join(","));
  } else {
    params.delete("hidden");
  }
  if (values.adv) {
    params.set("adv", "1");
  } else {
    params.delete("adv");
  }

  return params;
}
