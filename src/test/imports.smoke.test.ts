import { describe, expect, it } from "vitest";

import { importAllProjectModules, projectModulePaths } from "@/test/imports.mock";

describe("project imports", () => {
  it("discovers source modules to smoke test", () => {
    expect(projectModulePaths.length).toBeGreaterThan(0);
  });

  it("imports every source module without throwing", async () => {
    await expect(importAllProjectModules()).resolves.toHaveLength(projectModulePaths.length);
  }, 15000);
});
