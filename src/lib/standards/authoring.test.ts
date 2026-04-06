import { describe, expect, it } from "vitest";

import {
  getStandardsRelationshipAuthoringOptions,
  getStandardsFirstRelationshipChoices,
  mergeStandardsFirstRelationshipChoices,
} from "@/lib/standards/authoring";

describe("standards authoring helpers", () => {
  it("keeps SKOS and NL-SBB primary relationship guidance distinct in wording", () => {
    const skosChoices = getStandardsFirstRelationshipChoices({
      enabledStandards: ["skos"],
      ruleOverrides: {},
    });
    const nlSbbChoices = getStandardsFirstRelationshipChoices({
      enabledStandards: ["nl-sbb"],
      ruleOverrides: {},
    });

    expect(skosChoices[0]).toMatchObject({
      standardId: "skos",
      explanation: expect.stringMatching(/generic skos|concept-scheme/i),
    });
    expect(nlSbbChoices[0]).toMatchObject({
      standardId: "nl-sbb",
      explanation: expect.stringMatching(/dutch|concept-framework|governance/i),
    });
  });

  it("deduplicates duplicate-looking SKOS and NL-SBB choices while keeping the standards-first path compact", () => {
    const merged = mergeStandardsFirstRelationshipChoices(
      getStandardsFirstRelationshipChoices({
        enabledStandards: ["nl-sbb"],
        ruleOverrides: {},
      }),
      [
        {
          id: "skos-broader",
          standardId: "skos",
          label: "Use broader",
          explanation: "Generic SKOS hierarchy guidance.",
          selectedType: "is_a",
        },
      ],
    );

    expect(merged.filter((item) => item.label === "Use broader")).toHaveLength(1);
    expect(merged[0].standardId).toBe("nl-sbb");
  });

  it("derives only NL-SBB-supported relationship options plus custom when NL-SBB is enabled", () => {
    const options = getStandardsRelationshipAuthoringOptions({
      settings: {
        enabledStandards: ["nl-sbb"],
        ruleOverrides: {},
      },
    });

    expect(options.map((item) => item.label)).toEqual(["broader", "narrower", "related", "Custom"]);
    expect(options.find((item) => item.label === "broader")).toMatchObject({
      standardIds: ["nl-sbb"],
      selectedType: "is_a",
    });
    expect(options.some((item) => item.label === "part of")).toBe(false);
    expect(options.some((item) => item.label === "depends on")).toBe(false);
  });

  it("merges overlapping SKOS and NL-SBB relationship options while keeping supporting standards visible", () => {
    const options = getStandardsRelationshipAuthoringOptions({
      settings: {
        enabledStandards: ["nl-sbb", "skos"],
        ruleOverrides: {},
      },
    });

    expect(options.map((item) => item.label)).toEqual(["broader", "narrower", "related", "Custom"]);
    expect(options.find((item) => item.label === "broader")).toMatchObject({
      standardIds: ["nl-sbb", "skos"],
    });
    expect(options.find((item) => item.label === "narrower")).toMatchObject({
      standardIds: ["nl-sbb", "skos"],
    });
  });

  it("falls back to only custom when enabled standards do not contribute supported relation choices", () => {
    const options = getStandardsRelationshipAuthoringOptions({
      settings: {
        enabledStandards: ["rdf"],
        ruleOverrides: {},
      },
    });

    expect(options).toEqual([
      expect.objectContaining({
        label: "Custom",
        isCustom: true,
      }),
    ]);
  });
});
