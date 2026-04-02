// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { importAllProjectModules, projectModulePaths } from "@/test/imports.mock";

const supabaseStub = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseStub,
}));

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: createStorageMock(),
});

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: createStorageMock(),
});

const importChunkSize = 6;
const modulePathChunks = Array.from(
  { length: Math.ceil(projectModulePaths.length / importChunkSize) },
  (_, index) => ({
    chunkNumber: index + 1,
    chunkPaths: projectModulePaths.slice(index * importChunkSize, (index + 1) * importChunkSize),
  }),
);

describe("project imports", () => {
  it("discovers source modules to smoke test", () => {
    expect(projectModulePaths.length).toBeGreaterThan(0);
  });

  it.each(modulePathChunks)("imports chunk $chunkNumber without throwing", async ({ chunkPaths }) => {
    await expect(importAllProjectModules(chunkPaths)).resolves.toHaveLength(chunkPaths.length);
  }, 60000);
});
