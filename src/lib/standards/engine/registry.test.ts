import { describe, expect, it } from "vitest";

import { builtInStandardsPacks, listStandardsRuleCatalog } from "@/lib/standards/engine/registry";

describe("standards registry", () => {
  it("registers SKOS as a built-in standards pack", () => {
    expect(builtInStandardsPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "skos",
          label: "SKOS",
        }),
      ]),
    );
  });

  it("includes SKOS rules in the catalog listing", () => {
    expect(listStandardsRuleCatalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "skos",
          ruleId: "skos_scheme_exists",
        }),
      ]),
    );
  });
});
