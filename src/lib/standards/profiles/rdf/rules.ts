import type {
  StandardsFindingInput,
  StandardsPackDefinition,
} from "@/lib/standards/engine/types";
import type { StandardsResourceTerm, StandardsTriple } from "@/lib/standards/model";
import {
  createFinding,
  isAbsoluteIri,
  isValidBlankNodeId,
} from "@/lib/standards/profiles/shared";
import { getRdfRelationSuggestions } from "@/lib/standards/profiles/rdf/suggestions";

function validateResourceTerm(
  term: StandardsResourceTerm,
  path: string,
  tripleId: string,
  findings: StandardsFindingInput[],
  invalidIriMessage: string,
  invalidIriField: string,
) {
  if (term.termType === "blank-node") {
    if (!isValidBlankNodeId(term.value)) {
      findings.push(createFinding({
        message: `Blank node at "${path}" must start with "_:" and contain a stable identifier.`,
        path,
        entityKind: "triple",
        entityId: tripleId,
        field: `${invalidIriField}.blankNode`,
      }));
    }

    return;
  }

  if (!isAbsoluteIri(term.value)) {
    findings.push(createFinding({
      message: invalidIriMessage,
      path,
      entityKind: "triple",
      entityId: tripleId,
      field: invalidIriField,
    }));
  }
}

function validateRdfTriple(triple: StandardsTriple) {
  const findings: StandardsFindingInput[] = [];

  validateResourceTerm(
    triple.subject,
    `triples[${triple.id}].subject`,
    triple.id,
    findings,
    `Triple "${triple.id}" has an invalid subject IRI.`,
    "subject",
  );

  if (!isAbsoluteIri(triple.predicate.value)) {
    findings.push(createFinding({
      message: `Triple "${triple.id}" has an invalid predicate IRI.`,
      path: `triples[${triple.id}].predicate`,
      entityKind: "triple",
      entityId: triple.id,
      field: "predicate",
    }));
  }

  if (triple.object.termType === "literal") {
    if (triple.object.datatypeIri && !isAbsoluteIri(triple.object.datatypeIri)) {
      findings.push(createFinding({
        message: `Triple "${triple.id}" literal object has an invalid datatype IRI.`,
        path: `triples[${triple.id}].object.datatypeIri`,
        entityKind: "triple",
        entityId: triple.id,
        field: "object.datatypeIri",
      }));
    }

    if (triple.object.datatypeIri && triple.object.language) {
      findings.push(createFinding({
        message: `Triple "${triple.id}" literal object cannot declare both a datatype IRI and a language tag.`,
        path: `triples[${triple.id}].object`,
        entityKind: "triple",
        entityId: triple.id,
        field: "object.conflict",
      }));
    }
  } else {
    validateResourceTerm(
      triple.object,
      `triples[${triple.id}].object`,
      triple.id,
      findings,
      `Triple "${triple.id}" has an invalid object IRI.`,
      "object",
    );
  }

  if (triple.graph) {
    validateResourceTerm(
      triple.graph,
      `triples[${triple.id}].graph`,
      triple.id,
      findings,
      `Triple "${triple.id}" has an invalid graph IRI.`,
      "graph",
    );
  }

  return findings;
}

export const rdfStandardsPack: StandardsPackDefinition = {
  standardId: "rdf",
  label: "RDF",
  description: "Initial RDF structural pack with triple hygiene checks and generic relation suggestions.",
  getRelationSuggestions: getRdfRelationSuggestions,
  rules: [
    {
      ruleId: "rdf_invalid_subject_iri",
      title: "RDF invalid subject IRI",
      description: "Triple subjects should be valid IRIs or blank nodes.",
      explanation: "Invalid RDF subjects break downstream linked-data serializations immediately.",
      defaultSeverity: "error",
      validate: ({ model }) => model.triples.flatMap((triple) => validateRdfTriple(triple).filter((finding) => finding.field === "subject")),
    },
    {
      ruleId: "rdf_invalid_predicate_iri",
      title: "RDF invalid predicate IRI",
      description: "Triple predicates should be absolute IRIs.",
      explanation: "Predicates must be absolute IRIs for RDF exports to remain interoperable.",
      defaultSeverity: "error",
      validate: ({ model }) => model.triples.flatMap((triple) => validateRdfTriple(triple).filter((finding) => finding.field === "predicate")),
    },
    {
      ruleId: "rdf_invalid_object_iri",
      title: "RDF invalid object IRI",
      description: "Resource objects should be valid IRIs or blank nodes.",
      explanation: "Invalid resource objects create broken links in RDF graphs.",
      defaultSeverity: "error",
      validate: ({ model }) => model.triples.flatMap((triple) => validateRdfTriple(triple).filter((finding) => finding.field === "object")),
    },
    {
      ruleId: "rdf_invalid_blank_node",
      title: "RDF invalid blank node",
      description: "Blank node identifiers should use the canonical '_:' form.",
      explanation: "Stable blank-node identifiers prevent malformed RDF serializations.",
      defaultSeverity: "error",
      validate: ({ model }) => model.triples.flatMap((triple) => validateRdfTriple(triple).filter((finding) => finding.field?.endsWith(".blankNode"))),
    },
    {
      ruleId: "rdf_invalid_literal_datatype_iri",
      title: "RDF invalid literal datatype IRI",
      description: "Literal datatype IRIs should be absolute when present.",
      explanation: "Absolute datatype IRIs are required for unambiguous typed literals.",
      defaultSeverity: "error",
      validate: ({ model }) => model.triples.flatMap((triple) => validateRdfTriple(triple).filter((finding) => finding.field === "object.datatypeIri")),
    },
    {
      ruleId: "rdf_literal_datatype_language_conflict",
      title: "RDF literal datatype/language conflict",
      description: "A literal should not declare both a datatype and a language tag.",
      explanation: "Typed literals and language-tagged literals are mutually exclusive in RDF.",
      defaultSeverity: "error",
      validate: ({ model }) => model.triples.flatMap((triple) => validateRdfTriple(triple).filter((finding) => finding.field === "object.conflict")),
    },
    {
      ruleId: "rdf_invalid_graph_iri",
      title: "RDF invalid graph IRI",
      description: "Named graph identifiers should be valid IRIs or blank nodes.",
      explanation: "Invalid graph identifiers can break named-graph exports and imports.",
      defaultSeverity: "error",
      validate: ({ model }) => model.triples.flatMap((triple) => validateRdfTriple(triple).filter((finding) => finding.field === "graph")),
    },
  ],
};
