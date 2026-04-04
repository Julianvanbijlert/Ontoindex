import { describe, expect, it } from "vitest";

import { createStandardsModel } from "@/lib/standards/model";
import { builtInStandardsPacks } from "@/lib/standards/engine/registry";
import { runStandardsValidation } from "@/lib/standards/engine/run-validation";

describe("runStandardsValidation", () => {
  it("only executes enabled standards packs", () => {
    const model = createStandardsModel({
      profiles: ["mim", "nl-sbb"],
      classes: [
        {
          id: "class-policy",
          label: "",
        },
      ],
      conceptSchemes: [
        {
          id: "scheme-security",
          label: "Security",
        },
      ],
      concepts: [
        {
          id: "concept-policy",
          schemeId: "scheme-security",
          prefLabel: "",
        },
      ],
    });

    const result = runStandardsValidation({
      model,
      packs: builtInStandardsPacks,
      settings: {
        enabledStandards: ["nl-sbb"],
        ruleOverrides: {},
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "nl-sbb",
          ruleId: "nl_sbb_missing_pref_label",
        }),
      ]),
    );
    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "mim",
          ruleId: "mim_missing_class_label",
        }),
      ]),
    );
  });

  it("applies severity overrides and derives blocking from effective severity", () => {
    const model = createStandardsModel({
      profiles: ["mim"],
      classes: [
        {
          id: "class-policy",
          label: "",
        },
      ],
    });

    const result = runStandardsValidation({
      model,
      packs: builtInStandardsPacks,
      settings: {
        enabledStandards: ["mim"],
        ruleOverrides: {
          mim_missing_class_label: "blocking",
        },
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "mim",
          ruleId: "mim_missing_class_label",
          severity: "warning",
          effectiveSeverity: "blocking",
          blocking: true,
        }),
      ]),
    );
    expect(result.summary.blocking).toBe(1);
    expect(result.hasBlockingFindings).toBe(true);
  });

  it("preserves compatibility fields for legacy consumers", () => {
    const model = createStandardsModel({
      profiles: ["rdf"],
      triples: [
        {
          id: "triple-1",
          subject: {
            termType: "iri",
            value: "not-a-valid-iri",
          },
          predicate: {
            termType: "iri",
            value: "http://www.w3.org/2004/02/skos/core#prefLabel",
          },
          object: {
            termType: "literal",
            value: "Access policy",
          },
        },
      ],
    });

    const result = runStandardsValidation({
      model,
      packs: builtInStandardsPacks,
      settings: {
        enabledStandards: ["rdf"],
        ruleOverrides: {},
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "rdf",
          ruleId: "rdf_invalid_subject_iri",
          category: "publication",
          scope: "triple",
          implementationStatus: "starter",
          profile: "rdf",
          code: "rdf_invalid_subject_iri",
          path: "triples[triple-1].subject",
        }),
      ]),
    );
  });

  it("aggregates compliant relation suggestions from enabled packs while keeping explanations", () => {
    const model = createStandardsModel({
      profiles: ["mim", "nl-sbb"],
      conceptSchemes: [
        {
          id: "scheme-security",
          label: "Security",
        },
      ],
      concepts: [
        {
          id: "concept-source",
          schemeId: "scheme-security",
          prefLabel: "Source",
        },
        {
          id: "concept-target",
          schemeId: "scheme-security",
          prefLabel: "Target",
        },
      ],
    });

    const result = runStandardsValidation({
      model,
      packs: builtInStandardsPacks,
      settings: {
        enabledStandards: ["mim", "nl-sbb"],
        ruleOverrides: {},
      },
      context: {
        relationshipDraft: {
          sourceDefinitionId: "concept-source",
          targetDefinitionId: "concept-target",
        },
      },
    });

    expect(result.relationSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standardId: "nl-sbb",
          selectedType: "is_a",
          explanation: expect.stringMatching(/hierarch/i),
        }),
        expect.objectContaining({
          standardId: "mim",
          selectedType: "part_of",
        }),
      ]),
    );
  });
});
