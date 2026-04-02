import { canManageUsers, type RoleInput } from "@/lib/authorization";
import {
  getDefaultGraphRendererInstallations,
  type GraphRendererInstallation,
  type GraphRendererManifest,
} from "@/lib/graph/renderer-registry";
import type { MaybePromise } from "@/lib/graph/preferences/types";

export interface GraphRendererInstallationStore {
  load: () => MaybePromise<GraphRendererInstallation[] | null>;
  save: (installations: GraphRendererInstallation[]) => MaybePromise<void>;
}

function ensureAdmin(role: RoleInput) {
  if (!canManageUsers(role)) {
    throw new Error("Only admins can install or enable graph renderers.");
  }
}

function findManifest(manifests: GraphRendererManifest[], rendererId: string) {
  const manifest = manifests.find((item) => item.id === rendererId);

  if (!manifest) {
    throw new Error(`Renderer "${rendererId}" is not registered.`);
  }

  return manifest;
}

function mergeInstallations(
  manifests: GraphRendererManifest[],
  loaded: GraphRendererInstallation[] | null,
) {
  const defaults = getDefaultGraphRendererInstallations(manifests);
  const loadedById = new Map((loaded ?? []).map((item) => [item.rendererId, item]));

  return defaults.map((item) => {
    const override = loadedById.get(item.rendererId);

    if (!override) {
      return item;
    }

    return {
      rendererId: item.rendererId,
      installed: override.installed,
      enabled: override.installed ? override.enabled : false,
      updatedAt: override.updatedAt,
    } satisfies GraphRendererInstallation;
  });
}

async function loadMergedInstallations(
  manifests: GraphRendererManifest[],
  store: GraphRendererInstallationStore,
) {
  const loaded = await Promise.resolve(store.load());
  return mergeInstallations(manifests, loaded);
}

export async function installGraphRenderer(input: {
  role: RoleInput;
  rendererId: string;
  manifests: GraphRendererManifest[];
  store: GraphRendererInstallationStore;
}) {
  ensureAdmin(input.role);
  findManifest(input.manifests, input.rendererId);
  const current = await loadMergedInstallations(input.manifests, input.store);
  const next = current.map((item) =>
    item.rendererId === input.rendererId
      ? {
          ...item,
          installed: true,
          enabled: true,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );

  await Promise.resolve(input.store.save(next));
  return next;
}

export async function setGraphRendererEnabled(input: {
  role: RoleInput;
  rendererId: string;
  enabled: boolean;
  manifests: GraphRendererManifest[];
  store: GraphRendererInstallationStore;
}) {
  ensureAdmin(input.role);
  findManifest(input.manifests, input.rendererId);
  const current = await loadMergedInstallations(input.manifests, input.store);
  const currentItem = current.find((item) => item.rendererId === input.rendererId);

  if (!currentItem || !currentItem.installed) {
    throw new Error(`Renderer "${input.rendererId}" is not installed.`);
  }

  const next = current.map((item) =>
    item.rendererId === input.rendererId
      ? {
          ...item,
          enabled: input.enabled,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );

  await Promise.resolve(input.store.save(next));
  return next;
}
