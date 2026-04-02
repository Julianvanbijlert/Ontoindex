import type { GraphPositionStore, PersistedGraphPositions } from "@/lib/graph/persistence/types";

const STORAGE_PREFIX = "ontoindex:graph-positions:";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

export function buildGraphPositionStorageKey(graphKey: string) {
  return `${STORAGE_PREFIX}${graphKey}`;
}

function isPersistedGraphPositions(value: unknown): value is PersistedGraphPositions {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as PersistedGraphPositions;
  return (
    typeof candidate.graphKey === "string"
    && Array.isArray(candidate.nodes)
    && candidate.nodes.every(
      (node) =>
        typeof node?.id === "string"
        && typeof node?.x === "number"
        && typeof node?.y === "number",
    )
  );
}

export const localStorageGraphPositionStore: GraphPositionStore = {
  load(graphKey) {
    const storage = getStorage();

    if (!storage) {
      return null;
    }

    const raw = storage.getItem(buildGraphPositionStorageKey(graphKey));

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return isPersistedGraphPositions(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  save(positions) {
    const storage = getStorage();

    if (!storage) {
      return;
    }

    storage.setItem(buildGraphPositionStorageKey(positions.graphKey), JSON.stringify(positions));
  },
  clear(graphKey) {
    const storage = getStorage();

    if (!storage) {
      return;
    }

    storage.removeItem(buildGraphPositionStorageKey(graphKey));
  },
};
