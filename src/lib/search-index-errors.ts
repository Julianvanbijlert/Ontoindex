export const SEARCH_INDEX_SYNC_BLOCKED_SUFFIX =
  "search index synchronization was blocked by database security policy. Ask an admin to apply the latest search-index backend migration.";

export function extractErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return null;
}

export function isSearchDocumentsRlsError(message: string) {
  return /search_documents/i.test(message) && /row-level security policy/i.test(message);
}

export function normalizeSearchSyncErrorMessage(
  error: unknown,
  operationLabel: string,
  fallbackMessage: string,
) {
  const message = extractErrorMessage(error);

  if (message && isSearchDocumentsRlsError(message)) {
    return `${operationLabel} failed because ${SEARCH_INDEX_SYNC_BLOCKED_SUFFIX}`;
  }

  return message || fallbackMessage;
}
