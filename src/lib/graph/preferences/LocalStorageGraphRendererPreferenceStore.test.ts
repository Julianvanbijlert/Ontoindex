import { beforeEach, describe, expect, it } from "vitest";

import {
  buildGraphRendererPreferenceStorageKey,
  localStorageGraphRendererPreferenceStore,
} from "@/lib/graph/preferences/LocalStorageGraphRendererPreferenceStore";

describe("localStorageGraphRendererPreferenceStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores and restores interactive renderer preferences", () => {
    localStorageGraphRendererPreferenceStore.set("interactive", "cytoscape");

    expect(window.localStorage.getItem(buildGraphRendererPreferenceStorageKey("interactive"))).toBe("cytoscape");
    expect(localStorageGraphRendererPreferenceStore.get("interactive")).toBe("cytoscape");
  });

  it("returns null for missing or invalid stored values", () => {
    expect(localStorageGraphRendererPreferenceStore.get("interactive")).toBeNull();

    window.localStorage.setItem(buildGraphRendererPreferenceStorageKey("interactive"), "");
    expect(localStorageGraphRendererPreferenceStore.get("interactive")).toBeNull();
  });

  it("can clear a stored preference", () => {
    localStorageGraphRendererPreferenceStore.set("interactive", "react-flow");

    localStorageGraphRendererPreferenceStore.clear?.("interactive");

    expect(localStorageGraphRendererPreferenceStore.get("interactive")).toBeNull();
  });
});
