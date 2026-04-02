import type { GraphRendererInstallationStore } from "@/lib/graph/renderer-installation";
import type { GraphRendererInstallation } from "@/lib/graph/renderer-registry";

const STORAGE_KEY = "ontoindex:graph-renderer-installations";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInstallation(value: unknown): value is GraphRendererInstallation {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rendererId === "string"
    && typeof value.installed === "boolean"
    && typeof value.enabled === "boolean"
    && (typeof value.updatedAt === "undefined" || typeof value.updatedAt === "string")
  );
}

export const localStorageGraphRendererInstallationStore: GraphRendererInstallationStore = {
  load() {
    const storage = getStorage();

    if (!storage) {
      return null;
    }

    const raw = storage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return null;
      }

      return parsed.filter(isInstallation);
    } catch {
      return null;
    }
  },
  save(installations) {
    const storage = getStorage();

    if (!storage) {
      return;
    }

    const normalized = installations
      .map((item) => ({
        rendererId: item.rendererId,
        installed: item.installed,
        enabled: item.enabled,
        updatedAt: item.updatedAt,
      }))
      .sort((left, right) => left.rendererId.localeCompare(right.rendererId));

    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  },
};
