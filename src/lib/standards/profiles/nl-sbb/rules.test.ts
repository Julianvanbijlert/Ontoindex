import { describe, expect, it } from "vitest";

import { runStandardsValidation } from "@/lib/standards/engine/run-validation";
import { createStandardsModel } from "@/lib/standards/model";
import { nlSbbStandardsPack } from "@/lib/standards/profiles/nl-sbb/rules";
import { validateStandardsModel } from "@/lib/standards/validation";

describe("nl-sbb standards catalog", () => {
  describe("required family", () => {
    it("defines starter metadata for concept definitions and scheme identifiers", () => {
      expect(nlSbbStandardsPack.rules.find((item) => item.ruleId === "nl_sbb_scheme_identifier_required")).toMatchObject({
        category: "required",
        scope: "conceptScheme",
        defaultSeverity: "warning",
        implementationStatus: "starter",
        rationale: expect.stringMatching(/exchange|identifier/i),
      });
      expect(nlSbbStandardsPack.rules.find((item) => item.ruleId === "nl_sbb_concept_definition_required")).toMatchObject({
        category: "required",
        scope: "concept",
        defaultSeverity: "warning",
        implementationStatus: "starter",
        rationale: expect.stringMatching(/definition|understand/i),
      });
    });

    it("warns when a concept is missing both a definition and a concept identifier", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["nl-sbb"],
          conceptSchemes: [
            {
              id: "scheme-security",
              label: "Security",
              iri: "https://example.com/schemes/security",
            },
          ],
          concepts: [
            {
              id: "concept-policy",
              schemeId: "scheme-security",
              prefLabel: "Policy",
            },
          ],
        }),
        packs: [nlSbbStandardsPack],
        settings: {
          enabledStandards: ["nl-sbb"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "nl_sbb_concept_definition_required",
            path: "concepts[concept-policy].definition",
            effectiveSeverity: "warning",
          }),
          expect.objectContaining({
            ruleId: "nl_sbb_concept_identifier_required",
            path: "concepts[concept-policy].iri",
            effectiveSeverity: "warning",
          }),
        ]),
      );
    });
  });

  describe("consistency family", () => {
    it("warns when alt labels duplicate the preferred label or hierarchy points to itself", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["nl-sbb"],
          conceptSchemes: [
            {
              id: "scheme-security",
              label: "Security",
              iri: "https://example.com/schemes/security",
            },
          ],
          concepts: [
            {
              id: "concept-policy",
              schemeId: "scheme-security",
              prefLabel: "Policy",
              altLabels: ["Policy"],
              iri: "https://example.com/security#Policy",
            },
          ],
          conceptRelations: [
            {
              id: "relation-self",
              sourceConceptId: "concept-policy",
              targetConceptId: "concept-policy",
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
            },
          ],
        }),
        packs: [nlSbbStandardsPack],
        settings: {
          enabledStandards: ["nl-sbb"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "nl_sbb_alt_label_duplicates_pref_label",
            path: "concepts[concept-policy].altLabels",
            effectiveSeverity: "warning",
          }),
          expect.objectContaining({
            ruleId: "nl_sbb_hierarchy_no_self_reference",
            path: "conceptRelations[relation-self]",
            effectiveSeverity: "error",
          }),
        ]),
      );
    });

    it("warns on broader or narrower cycles and preserves helpful explanation text", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["nl-sbb"],
          conceptSchemes: [
            {
              id: "scheme-security",
              label: "Security",
              iri: "https://example.com/schemes/security",
            },
          ],
          concepts: [
            {
              id: "concept-a",
              schemeId: "scheme-security",
              prefLabel: "Concept A",
              iri: "https://example.com/security#a",
              definition: "Definition A",
            },
            {
              id: "concept-b",
              schemeId: "scheme-security",
              prefLabel: "Concept B",
              iri: "https://example.com/security#b",
              definition: "Definition B",
            },
          ],
          conceptRelations: [
            {
              id: "relation-a-b",
              sourceConceptId: "concept-a",
              targetConceptId: "concept-b",
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
            },
            {
              id: "relation-b-a",
              sourceConceptId: "concept-b",
              targetConceptId: "concept-a",
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
            },
          ],
        }),
        packs: [nlSbbStandardsPack],
        settings: {
          enabledStandards: ["nl-sbb"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "nl_sbb_hierarchy_cycle",
            effectiveSeverity: "warning",
            explanation: expect.stringMatching(/hierarch|cycle|break/i),
          }),
        ]),
      );
    });
  });

  describe("publication family", () => {
    it("keeps governance and editorial guidance soft and tied to explicit metadata", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["nl-sbb"],
          conceptSchemes: [
            {
              id: "scheme-security",
              label: "Security",
              iri: "https://example.com/schemes/security",
            },
          ],
          concepts: [
            {
              id: "concept-policy",
              schemeId: "scheme-security",
              prefLabel: "Policy",
              iri: "https://example.com/security#Policy",
              definition: "ABC-12",
              legalBasisRequired: true,
              sourceUrl: "not-a-valid-url",
            },
          ],
        }),
        packs: [nlSbbStandardsPack],
        settings: {
          enabledStandards: ["nl-sbb"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "nl_sbb_source_link_validity",
            path: "concepts[concept-policy].sourceUrl",
            effectiveSeverity: "warning",
          }),
          expect.objectContaining({
            ruleId: "nl_sbb_source_recommended",
            path: "concepts[concept-policy].sourceReference",
            effectiveSeverity: "info",
          }),
          expect.objectContaining({
            ruleId: "nl_sbb_legal_basis_recommended",
            path: "concepts[concept-policy].legalBasis",
            effectiveSeverity: "info",
          }),
          expect.objectContaining({
            ruleId: "nl_sbb_definition_plain_language_recommended",
            path: "concepts[concept-policy].definition",
            effectiveSeverity: "info",
          }),
        ]),
      );
    });

    it("exposes placeholder metadata for reciprocity and richer publication profile checks", () => {
      expect(nlSbbStandardsPack.rules.find((item) => item.ruleId === "nl_sbb_broader_narrower_reciprocity_placeholder")).toMatchObject({
        category: "placeholder",
        scope: "model",
        implementationStatus: "placeholder",
        requiresGlobalContext: true,
      });
      expect(nlSbbStandardsPack.rules.find((item) => item.ruleId === "nl_sbb_publication_language_recommendation_placeholder")).toMatchObject({
        category: "placeholder",
        scope: "publication",
        implementationStatus: "placeholder",
        requiresGlobalContext: false,
      });
      expect(nlSbbStandardsPack.rules.find((item) => item.ruleId === "nl_sbb_governance_metadata_depth_placeholder")).toMatchObject({
        category: "placeholder",
        scope: "publication",
        implementationStatus: "placeholder",
      });
    });

    it("keeps validateStandardsModel compatibility for cross-scheme hierarchy warnings", () => {
      const result = validateStandardsModel(createStandardsModel({
        profiles: ["nl-sbb"],
        conceptSchemes: [
          {
            id: "scheme-a",
            label: "Scheme A",
            iri: "https://example.com/scheme/a",
          },
          {
            id: "scheme-b",
            label: "Scheme B",
            iri: "https://example.com/scheme/b",
          },
        ],
        concepts: [
          {
            id: "concept-a",
            schemeId: "scheme-a",
            prefLabel: "Concept A",
            iri: "https://example.com/a",
            definition: "Definition A",
          },
          {
            id: "concept-b",
            schemeId: "scheme-b",
            prefLabel: "Concept B",
            iri: "https://example.com/b",
            definition: "Definition B",
          },
        ],
        conceptRelations: [
          {
            id: "relation-cross",
            sourceConceptId: "concept-a",
            targetConceptId: "concept-b",
            kind: "broader",
            predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
          },
        ],
      }));

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            profile: "nl-sbb",
            code: "nl_sbb_cross_scheme_relation",
          }),
        ]),
      );
    });
  });
});
