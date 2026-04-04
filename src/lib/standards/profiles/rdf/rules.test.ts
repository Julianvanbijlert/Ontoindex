import { describe, expect, it } from "vitest";

import { runStandardsValidation } from "@/lib/standards/engine/run-validation";
import { createStandardsModel } from "@/lib/standards/model";
import { rdfStandardsPack } from "@/lib/standards/profiles/rdf/rules";

describe("rdf standards catalog", () => {
  describe("publication hygiene family", () => {
    it("defines metadata for triple-hygiene rules", () => {
      const rule = rdfStandardsPack.rules.find((item) => item.ruleId === "rdf_invalid_subject_iri");

      expect(rule).toMatchObject({
        category: "publication",
        scope: "triple",
        defaultSeverity: "error",
        implementationStatus: "starter",
        requiresGlobalContext: false,
        rationale: expect.stringMatching(/serialization|linked-data|interoperable/i),
      });
    });

    it("keeps blank-node, predicate, datatype, and graph checks focused on RDF publication hygiene", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["rdf"],
          triples: [
            {
              id: "triple-1",
              subject: {
                termType: "blank-node",
                value: "badBlankNode",
              },
              predicate: {
                termType: "iri",
                value: "prefLabel",
              },
              object: {
                termType: "literal",
                value: "Policy",
                datatypeIri: "not-a-valid-iri",
                language: "en",
              },
              graph: {
                termType: "iri",
                value: "not-a-valid-iri",
              },
            },
          ],
        }),
        packs: [rdfStandardsPack],
        settings: {
          enabledStandards: ["rdf"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "rdf_invalid_blank_node", effectiveSeverity: "error" }),
          expect.objectContaining({ ruleId: "rdf_invalid_predicate_iri", effectiveSeverity: "error" }),
          expect.objectContaining({ ruleId: "rdf_invalid_literal_datatype_iri", effectiveSeverity: "error" }),
          expect.objectContaining({ ruleId: "rdf_literal_datatype_language_conflict", effectiveSeverity: "error" }),
          expect.objectContaining({ ruleId: "rdf_invalid_graph_iri", effectiveSeverity: "error" }),
        ]),
      );
    });

    it("includes actionable explanation text for malformed RDF terms", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
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
                value: "http://www.w3.org/2000/01/rdf-schema#label",
              },
              object: {
                termType: "literal",
                value: "Label",
              },
            },
          ],
        }),
        packs: [rdfStandardsPack],
        settings: {
          enabledStandards: ["rdf"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "rdf_invalid_subject_iri",
            explanation: expect.stringMatching(/absolute iri|blank node|correct the subject/i),
          }),
        ]),
      );
    });

    it("does not emit semantic relation suggestions from the RDF hygiene pack", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["rdf"],
          triples: [],
        }),
        packs: [rdfStandardsPack],
        settings: {
          enabledStandards: ["rdf"],
          ruleOverrides: {},
        },
        context: {
          relationshipDraft: {
            sourceDefinitionId: "def-1",
            targetDefinitionId: "def-2",
          },
        },
      });

      expect(result.relationSuggestions).toEqual([]);
      expect(rdfStandardsPack.rules.find((item) => item.ruleId === "rdf_publication_profile_completeness_placeholder")).toMatchObject({
        category: "placeholder",
        implementationStatus: "placeholder",
        scope: "publication",
      });
    });
  });
});
