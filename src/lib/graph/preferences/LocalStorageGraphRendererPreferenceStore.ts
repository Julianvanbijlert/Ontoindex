import type {
  GraphRendererPreferenceScope,
  GraphRendererPreferenceStore,
} from "@/lib/graph/preferences/types";
import { isInteractiveGraphRendererId } from "@/lib/graph/preferences/types";

const STORAGE_PREFIX = "ontoindex:graph-renderer-preference:";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

export function buildGraphRendererPreferenceStorageKey(scope: GraphRendererPreferenceScope) {
  return `${STORAGE_PREFIX}${scope}`;
}

export const localStorageGraphRendererPreferenceStore: GraphRendererPreferenceStore = {
  get(scope) {
    const storage = getStorage();

    if (!storage) {
      return null;
    }

    const value = storage.getItem(buildGraphRendererPreferenceStorageKey(scope));
    return value && isInteractiveGraphRendererId(value) ? value : null;
  },
  set(scope, rendererId) {
    const storage = getStorage();

    if (!storage) {
      return;
    }

    storage.setItem(buildGraphRendererPreferenceStorageKey(scope), rendererId);
  },
  clear(scope) {
    const storage = getStorage();

    if (!storage) {
      return;
    }

    storage.removeItem(buildGraphRendererPreferenceStorageKey(scope));
  },
};
