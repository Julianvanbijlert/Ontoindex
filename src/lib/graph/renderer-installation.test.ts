import { describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/authorization";
import type { GraphRendererManifest } from "@/lib/graph/renderer-registry";
import {
  installGraphRenderer,
  setGraphRendererEnabled,
  type GraphRendererInstallationStore,
} from "@/lib/graph/renderer-installation";

function createManifest(id: string): GraphRendererManifest {
  return {
    id,
    label: id,
    installType: "builtin",
    defaultInstalled: true,
    defaultEnabled: true,
    adapter: {
      id,
      supports: () => true,
      Component: (() => null) as never,
    },
  };
}

function createPluginManifest(id: string): GraphRendererManifest {
  return {
    ...createManifest(id),
    installType: "plugin",
    defaultInstalled: false,
    defaultEnabled: false,
  };
}

function createStore(seed?: Array<{ rendererId: string; installed: boolean; enabled: boolean }>) {
  let data = seed ?? [];
  const store: GraphRendererInstallationStore = {
    load: vi.fn(async () => data),
    save: vi.fn(async (next) => {
      data = next;
    }),
  };

  return {
    store,
    snapshot: () => data,
  };
}

describe("renderer installation service", () => {
  it("allows admins to install an available renderer", async () => {
    const manifests = [createManifest("react-flow"), createPluginManifest("plugin-alpha")];
    const { store, snapshot } = createStore();

    await installGraphRenderer({
      role: "admin",
      rendererId: "plugin-alpha",
      manifests,
      store,
    });

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(snapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rendererId: "plugin-alpha",
        installed: true,
        enabled: true,
      }),
    ]));
  });

  it("rejects non-admin install attempts", async () => {
    const manifests = [createManifest("react-flow"), createManifest("cytoscape")];
    const { store } = createStore();

    await expect(installGraphRenderer({
      role: "editor",
      rendererId: "cytoscape",
      manifests,
      store,
    })).rejects.toThrow("Only admins can install or enable graph renderers.");
  });

  it("allows admins to toggle enabled state on installed renderers", async () => {
    const manifests = [createManifest("react-flow"), createManifest("cytoscape")];
    const { store, snapshot } = createStore([
      { rendererId: "react-flow", installed: true, enabled: true },
      { rendererId: "cytoscape", installed: true, enabled: true },
    ]);

    await setGraphRendererEnabled({
      role: "admin",
      rendererId: "cytoscape",
      enabled: false,
      manifests,
      store,
    });

    expect(snapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rendererId: "cytoscape",
        installed: true,
        enabled: false,
      }),
    ]));
  });

  it("rejects enabling a renderer that is not installed yet", async () => {
    const manifests = [createManifest("react-flow"), createPluginManifest("plugin-alpha")];
    const { store } = createStore();

    await expect(setGraphRendererEnabled({
      role: "admin",
      rendererId: "plugin-alpha",
      enabled: true,
      manifests,
      store,
    })).rejects.toThrow("Renderer \"plugin-alpha\" is not installed.");
  });

  it("rejects non-admin enable/disable attempts", async () => {
    const manifests = [createManifest("react-flow"), createManifest("cytoscape")];
    const { store } = createStore([
      { rendererId: "react-flow", installed: true, enabled: true },
      { rendererId: "cytoscape", installed: true, enabled: true },
    ]);

    await expect(setGraphRendererEnabled({
      role: "viewer" as AppRole,
      rendererId: "cytoscape",
      enabled: false,
      manifests,
      store,
    })).rejects.toThrow("Only admins can install or enable graph renderers.");
  });
});
