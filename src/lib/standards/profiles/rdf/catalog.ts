import type { StandardsFindingInput, StandardsPackDefinition, StandardsRuleDefinition } from "@/lib/standards/engine/types";
import type { StandardsResourceTerm, StandardsTriple } from "@/lib/standards/model";
import { createFinding, createPlaceholderRule, createRuleDefinition, isAbsoluteIri, isValidBlankNodeId } from "@/lib/standards/profiles/shared";

const createRule = (input: StandardsRuleDefinition) => createRuleDefinition({ ...input, implementationStatus: "starter" });

function validateResourceTerm(term: StandardsResourceTerm, path: string, tripleId: string, findings: StandardsFindingInput[], invalidIriMessage: string, invalidIriField: string) {
  if (term.termType === "blank-node") {
    if (!isValidBlankNodeId(term.value)) findings.push(createFinding({ message: `Blank node at "${path}" must start with "_:" and contain a stable identifier.`, path, entityKind: "triple", entityId: tripleId, field: `${invalidIriField}.blankNode` }));
    return;
  }
  if (!isAbsoluteIri(term.value)) findings.push(createFinding({ message: invalidIriMessage, path, entityKind: "triple", entityId: tripleId, field: invalidIriField }));
}

function validateTriple(triple: StandardsTriple) {
  const findings: StandardsFindingInput[] = [];
  validateResourceTerm(triple.subject, `triples[${triple.id}].subject`, triple.id, findings, `Triple "${triple.id}" has an invalid subject IRI.`, "subject");
  if (!isAbsoluteIri(triple.predicate.value)) findings.push(createFinding({ message: `Triple "${triple.id}" has an invalid predicate IRI.`, path: `triples[${triple.id}].predicate`, entityKind: "triple", entityId: triple.id, field: "predicate" }));
  if (triple.object.termType === "literal") {
    if (triple.object.datatypeIri && !isAbsoluteIri(triple.object.datatypeIri)) findings.push(createFinding({ message: `Triple "${triple.id}" literal object has an invalid datatype IRI.`, path: `triples[${triple.id}].object.datatypeIri`, entityKind: "triple", entityId: triple.id, field: "object.datatypeIri" }));
    if (triple.object.datatypeIri && triple.object.language) findings.push(createFinding({ message: `Triple "${triple.id}" literal object cannot declare both a datatype IRI and a language tag.`, path: `triples[${triple.id}].object`, entityKind: "triple", entityId: triple.id, field: "object.conflict" }));
  } else {
    validateResourceTerm(triple.object, `triples[${triple.id}].object`, triple.id, findings, `Triple "${triple.id}" has an invalid object IRI.`, "object");
  }
  if (triple.graph) validateResourceTerm(triple.graph, `triples[${triple.id}].graph`, triple.id, findings, `Triple "${triple.id}" has an invalid graph IRI.`, "graph");
  return findings;
}

const publicationRules = [
  createRule({ ruleId: "rdf_invalid_subject_iri", title: "RDF subject must be a valid IRI or blank node", description: "Triple subjects should be valid IRIs or blank nodes.", rationale: "Invalid RDF subjects break linked-data serialization and publication immediately.", explanation: "Correct the subject so it uses an absolute IRI or a valid blank node identifier.", defaultSeverity: "error", category: "publication", scope: "triple", requiresGlobalContext: false, validate: ({ model }) => model.triples.flatMap((triple) => validateTriple(triple).filter((finding) => finding.field === "subject")) }),
  createRule({ ruleId: "rdf_invalid_predicate_iri", title: "RDF predicate must be an absolute IRI", description: "Triple predicates should be absolute IRIs.", rationale: "Predicates must be absolute IRIs for RDF graphs to remain interoperable.", explanation: "Replace the predicate with an absolute IRI so RDF consumers can interpret the relation correctly.", defaultSeverity: "error", category: "publication", scope: "triple", requiresGlobalContext: false, validate: ({ model }) => model.triples.flatMap((triple) => validateTriple(triple).filter((finding) => finding.field === "predicate")) }),
  createRule({ ruleId: "rdf_invalid_object_iri", title: "RDF resource object must be a valid IRI or blank node", description: "Resource objects should be valid IRIs or blank nodes.", rationale: "Invalid resource objects create broken links in RDF graphs.", explanation: "Correct the resource object so it uses an absolute IRI or a valid blank node identifier.", defaultSeverity: "error", category: "publication", scope: "triple", requiresGlobalContext: false, validate: ({ model }) => model.triples.flatMap((triple) => validateTriple(triple).filter((finding) => finding.field === "object")) }),
  createRule({ ruleId: "rdf_invalid_blank_node", title: "RDF blank node identifier must be canonical", description: "Blank node identifiers should use the canonical '_:' form.", rationale: "Stable blank-node identifiers prevent malformed RDF serializations.", explanation: "Rewrite the blank node identifier so it starts with '_:' and contains a stable local identifier.", defaultSeverity: "error", category: "publication", scope: "triple", requiresGlobalContext: false, validate: ({ model }) => model.triples.flatMap((triple) => validateTriple(triple).filter((finding) => finding.field?.endsWith(".blankNode"))) }),
  createRule({ ruleId: "rdf_invalid_literal_datatype_iri", title: "RDF literal datatype IRI must be absolute", description: "Literal datatype IRIs should be absolute when present.", rationale: "Absolute datatype IRIs are required for unambiguous typed literals.", explanation: "Replace the datatype with an absolute IRI so the literal can be interpreted unambiguously.", defaultSeverity: "error", category: "publication", scope: "triple", requiresGlobalContext: false, validate: ({ model }) => model.triples.flatMap((triple) => validateTriple(triple).filter((finding) => finding.field === "object.datatypeIri")) }),
  createRule({ ruleId: "rdf_literal_datatype_language_conflict", title: "RDF literal cannot mix datatype and language", description: "A literal should not declare both a datatype and a language tag.", rationale: "Typed literals and language-tagged literals are mutually exclusive in RDF.", explanation: "Choose either a datatype IRI or a language tag so the literal matches RDF literal rules.", defaultSeverity: "error", category: "publication", scope: "triple", requiresGlobalContext: false, validate: ({ model }) => model.triples.flatMap((triple) => validateTriple(triple).filter((finding) => finding.field === "object.conflict")) }),
  createRule({ ruleId: "rdf_invalid_graph_iri", title: "RDF graph identifier must be valid", description: "Named graph identifiers should be valid IRIs or blank nodes.", rationale: "Invalid graph identifiers can break named-graph exports and imports.", explanation: "Correct the graph identifier so it uses an absolute IRI or a valid blank node identifier.", defaultSeverity: "error", category: "publication", scope: "triple", requiresGlobalContext: false, validate: ({ model }) => model.triples.flatMap((triple) => validateTriple(triple).filter((finding) => finding.field === "graph")) }),
] satisfies StandardsRuleDefinition[];

const placeholderRules = [
  createPlaceholderRule({
    ruleId: "rdf_publication_profile_completeness_placeholder",
    title: "RDF publication profile completeness placeholder",
    description: "Starter placeholder for richer publication-profile completeness checks beyond triple hygiene.",
    rationale: "The current RDF pack is intentionally limited to triple hygiene and does not yet encode broader publication profile completeness semantics.",
    explanation: "This placeholder reserves space for future RDF publication-profile completeness checks without overclaiming support today.",
    scope: "publication",
    requiresGlobalContext: false,
  }),
] satisfies StandardsRuleDefinition[];

export const rdfStandardsPack: StandardsPackDefinition = {
  standardId: "rdf",
  label: "RDF",
  description: "Focused RDF publication and triple-hygiene catalog.",
  rules: [...publicationRules, ...placeholderRules],
};
