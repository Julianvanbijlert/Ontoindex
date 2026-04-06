import { describe, expect, it } from "vitest";

import { runStandardsValidation } from "@/lib/standards/engine/run-validation";
import { createStandardsModel } from "@/lib/standards/model";
import { skosStandardsPack } from "@/lib/standards/profiles/skos/rules";

describe("skos standards catalog", () => {
  describe("required family", () => {
    it("defines metadata for starter SKOS scheme and concept rules", () => {
      const rule = skosStandardsPack.rules.find((item) => item.ruleId === "skos_missing_pref_label");

      expect(rule).toMatchObject({
        category: "required",
        scope: "concept",
        defaultSeverity: "warning",
        implementationStatus: "starter",
        requiresGlobalContext: false,
        rationale: expect.stringMatching(/preferred label|concept/i),
      });
    });

    it("flags missing scheme and preferred label basics without pretending to be deeper governance logic", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["skos"],
          concepts: [
            {
              id: "concept-policy",
              schemeId: "scheme-missing",
              prefLabel: "",
            },
          ],
        }),
        packs: [skosStandardsPack],
        settings: {
          enabledStandards: ["skos"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "skos_scheme_exists", effectiveSeverity: "error" }),
          expect.objectContaining({ ruleId: "skos_unknown_scheme", effectiveSeverity: "error" }),
          expect.objectContaining({ ruleId: "skos_missing_pref_label", effectiveSeverity: "warning" }),
        ]),
      );
    });
  });

  describe("consistency family", () => {
    it("catches altLabel conflicts, hierarchy self-reference, and starter hierarchy cycles", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["skos"],
          conceptSchemes: [
            {
              id: "scheme-security",
              label: "Security",
              iri: "https://example.com/scheme/security",
            },
          ],
          concepts: [
            {
              id: "concept-a",
              schemeId: "scheme-security",
              prefLabel: "Policy",
              altLabels: ["Policy"],
              iri: "https://example.com/concepts/policy",
            },
            {
              id: "concept-b",
              schemeId: "scheme-security",
              prefLabel: "Control",
              iri: "https://example.com/concepts/control",
            },
          ],
          conceptRelations: [
            {
              id: "relation-self",
              sourceConceptId: "concept-a",
              targetConceptId: "concept-a",
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
            },
            {
              id: "relation-cycle-a",
              sourceConceptId: "concept-a",
              targetConceptId: "concept-b",
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
            },
            {
              id: "relation-cycle-b",
              sourceConceptId: "concept-b",
              targetConceptId: "concept-a",
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
            },
          ],
        }),
        packs: [skosStandardsPack],
        settings: {
          enabledStandards: ["skos"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "skos_alt_label_duplicates_pref_label" }),
          expect.objectContaining({ ruleId: "skos_hierarchy_no_self_reference", effectiveSeverity: "error" }),
          expect.objectContaining({ ruleId: "skos_hierarchy_cycle", effectiveSeverity: "warning" }),
        ]),
      );
    });

    it("checks explicit related reverse links for starter symmetry without requiring inferred reverse relations", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["skos"],
          conceptSchemes: [
            {
              id: "scheme-security",
              label: "Security",
              iri: "https://example.com/scheme/security",
            },
          ],
          concepts: [
            {
              id: "concept-a",
              schemeId: "scheme-security",
              prefLabel: "Policy",
              iri: "https://example.com/concepts/policy",
            },
            {
              id: "concept-b",
              schemeId: "scheme-security",
              prefLabel: "Control",
              iri: "https://example.com/concepts/control",
            },
          ],
          conceptRelations: [
            {
              id: "relation-related",
              sourceConceptId: "concept-a",
              targetConceptId: "concept-b",
              kind: "related",
              predicateIri: "http://www.w3.org/2004/02/skos/core#related",
              predicateKey: "related",
            },
            {
              id: "relation-reverse-broader",
              sourceConceptId: "concept-b",
              targetConceptId: "concept-a",
              kind: "broader",
              predicateIri: "http://www.w3.org/2004/02/skos/core#broader",
              predicateKey: "broader",
            },
          ],
        }),
        packs: [skosStandardsPack],
        settings: {
          enabledStandards: ["skos"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "skos_related_symmetry",
            effectiveSeverity: "warning",
            explanation: expect.stringMatching(/both directions|related/i),
          }),
        ]),
      );
    });

    it("adds starter mapping-property checks without pretending to implement a deeper mapping engine", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["skos"],
          conceptSchemes: [
            {
              id: "scheme-security",
              label: "Security",
              iri: "https://example.com/scheme/security",
            },
            {
              id: "scheme-reference",
              label: "Reference",
              iri: "https://example.com/scheme/reference",
            },
          ],
          concepts: [
            {
              id: "concept-a",
              schemeId: "scheme-security",
              prefLabel: "Policy",
              iri: "https://example.com/concepts/policy",
            },
            {
              id: "concept-b",
              schemeId: "scheme-reference",
              prefLabel: "Rule",
              iri: "https://example.com/concepts/rule",
            },
          ],
          conceptRelations: [
            {
              id: "relation-mapping-mismatch",
              sourceConceptId: "concept-a",
              targetConceptId: "concept-b",
              kind: "custom",
              predicateKey: "exactMatch",
              predicateIri: "http://www.w3.org/2004/02/skos/core#closeMatch",
            },
            {
              id: "relation-mapping-unknown",
              sourceConceptId: "concept-a",
              targetConceptId: "concept-b",
              kind: "custom",
              predicateKey: "semanticMatch",
              predicateIri: "http://www.w3.org/2004/02/skos/core#semanticMatch",
            },
          ],
        }),
        packs: [skosStandardsPack],
        settings: {
          enabledStandards: ["skos"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "skos_mapping_predicate_consistency",
            effectiveSeverity: "warning",
          }),
          expect.objectContaining({
            ruleId: "skos_mapping_predicate_recognition",
            effectiveSeverity: "warning",
          }),
        ]),
      );
    });
  });

  describe("suggestions and placeholders", () => {
    it("offers SKOS-shaped relation suggestions when authoring a concept relationship", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["skos"],
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
        }),
        packs: [skosStandardsPack],
        settings: {
          enabledStandards: ["skos"],
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
          expect.objectContaining({ standardId: "skos", label: "Use broader" }),
          expect.objectContaining({ standardId: "skos", label: "Use narrower" }),
          expect.objectContaining({ standardId: "skos", label: "Use related" }),
        ]),
      );
    });

    it("keeps deeper mapping and hidden-label semantics explicit as placeholders", () => {
      expect(skosStandardsPack.rules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "skos_hidden_label_quality_placeholder",
            category: "placeholder",
            implementationStatus: "placeholder",
          }),
          expect.objectContaining({
            ruleId: "skos_mapping_properties_placeholder",
            category: "placeholder",
            implementationStatus: "placeholder",
          }),
        ]),
      );
    });
  });
});
