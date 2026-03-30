export function normalizeSearchText(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeSearchLookupText(value: string | null | undefined) {
  return normalizeSearchText(value).replace(/[^a-z0-9_\-\s]/g, "");
}

export function includesNormalizedText(
  haystack: string | null | undefined,
  needle: string | null | undefined,
) {
  const normalizedNeedle = normalizeSearchText(needle);

  if (!normalizedNeedle) {
    return false;
  }

  return normalizeSearchText(haystack).includes(normalizedNeedle);
}
