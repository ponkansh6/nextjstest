export interface UrlStateValues {
  from: number;
  to: number;
  hidden: string[];
}

export function parseSectionId(
  value: string | null,
  validSectionIds: readonly string[],
  defaultSectionId: string,
): string {
  return value && validSectionIds.includes(value) ? value : defaultSectionId;
}

export function serializeSectionUrlState(
  currentParams: URLSearchParams,
  sectionId: string,
  defaultSectionId: string,
): URLSearchParams {
  const params = new URLSearchParams(currentParams);
  if (sectionId === defaultSectionId) {
    params.delete("section");
  } else {
    params.set("section", sectionId);
  }
  return params;
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
  // `adv` was used by the retired NewGraph extension toggle. Remove legacy
  // links while preserving all unrelated query parameters.
  params.delete("adv");

  return params;
}
