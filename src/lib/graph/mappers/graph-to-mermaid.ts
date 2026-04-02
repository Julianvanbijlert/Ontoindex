import type { GraphEdge, GraphModel, GraphNode } from "@/lib/graph/model";

function sanitizeIdentifier(input: string) {
  const sanitized = input
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) {
    return "Node";
  }

  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `N_${sanitized}`;
}

function escapeLabel(input: string) {
  return input.replace(/"/g, '\\"');
}

function buildNodeAliasMap(nodes: GraphNode[]) {
  const aliasCounts = new Map<string, number>();

  return new Map(
    nodes.map((node) => {
      const base = sanitizeIdentifier(node.label || node.id);
      const count = aliasCounts.get(base) ?? 0;
      aliasCounts.set(base, count + 1);
      const alias = count === 0 ? base : `${base}_${count + 1}`;
      return [node.id, alias];
    }),
  );
}

type MermaidAttribute =
  | string
  | {
      name: string;
      type?: string;
      visibility?: "+" | "-" | "#" | "~";
    };

type MermaidMethod =
  | string
  | {
      name: string;
      returnType?: string;
      visibility?: "+" | "-" | "#" | "~";
      parameters?: string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarProperties(properties: Record<string, unknown> | undefined, excludedKeys: string[]) {
  if (!properties) {
    return [];
  }

  return Object.entries(properties).filter(([key, value]) => {
    if (excludedKeys.includes(key)) {
      return false;
    }

    return ["string", "number", "boolean"].includes(typeof value);
  });
}

function toUmlAttribute(attribute: MermaidAttribute) {
  if (typeof attribute === "string") {
    return attribute;
  }

  const visibility = attribute.visibility || "+";
  const typeSuffix = attribute.type ? `: ${attribute.type}` : "";
  return `${visibility}${attribute.name}${typeSuffix}`;
}

function toUmlMethod(method: MermaidMethod) {
  if (typeof method === "string") {
    return method;
  }

  const visibility = method.visibility || "+";
  const parameters = method.parameters?.join(", ") || "";
  const returnType = method.returnType ? ` ${method.returnType}` : "";
  return `${visibility}${method.name}(${parameters})${returnType}`;
}

function getUmlClassMembers(node: GraphNode) {
  const properties = isRecord(node.properties) ? node.properties : undefined;
  const attributeValues = Array.isArray(properties?.attributes) ? (properties?.attributes as MermaidAttribute[]) : [];
  const methodValues = Array.isArray(properties?.methods) ? (properties?.methods as MermaidMethod[]) : [];

  const attributeLines = attributeValues.map(toUmlAttribute);
  const methodLines = methodValues.map(toUmlMethod);

  if (attributeLines.length > 0 || methodLines.length > 0) {
    return [...attributeLines, ...methodLines];
  }

  return scalarProperties(properties, ["attributes", "methods"]).map(([key, value]) => {
    const type = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
    return `+${key}: ${type}`;
  });
}

function getErAttributes(node: GraphNode) {
  const properties = isRecord(node.properties) ? node.properties : undefined;
  const attributeValues = Array.isArray(properties?.attributes) ? (properties?.attributes as MermaidAttribute[]) : [];

  if (attributeValues.length > 0) {
    return attributeValues.map((attribute) => {
      if (typeof attribute === "string") {
        return attribute;
      }

      const type = attribute.type || "string";
      return `${type} ${attribute.name}`;
    });
  }

  return scalarProperties(properties, ["attributes", "methods"]).map(([key, value]) => {
    const type = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
    return `${type} ${key}`;
  });
}

function getUmlRelation(edge: GraphEdge, aliasMap: Map<string, string>) {
  const source = aliasMap.get(edge.source) || sanitizeIdentifier(edge.source);
  const target = aliasMap.get(edge.target) || sanitizeIdentifier(edge.target);
  const labelSuffix = edge.label ? ` : ${edge.label}` : "";
  const normalizedKind = edge.kind.toLowerCase();

  if (["is_a", "extends", "inheritance", "inherits_from"].includes(normalizedKind)) {
    return `${target} <|-- ${source}${labelSuffix}`;
  }

  if (["composition", "composes"].includes(normalizedKind)) {
    return `${source} *-- ${target}${labelSuffix}`;
  }

  if (["aggregation", "aggregates"].includes(normalizedKind)) {
    return `${source} o-- ${target}${labelSuffix}`;
  }

  if (["dependency", "depends_on"].includes(normalizedKind)) {
    return `${source} ..> ${target}${labelSuffix}`;
  }

  if (edge.semantic?.umlAssociation) {
    return `${source} --> ${target}${labelSuffix}`;
  }

  return `${source} --> ${target}${labelSuffix}`;
}

function parseCardinalitySide(input?: string) {
  if (!input) {
    return "||";
  }

  const normalized = input.trim().toLowerCase();

  if (["1", "1..1", "exactly-one", "one"].includes(normalized)) {
    return "||";
  }

  if (["0..1", "0-1", "optional", "zero-or-one"].includes(normalized)) {
    return "o|";
  }

  if (["1..*", "1-n", "1..n", "one-or-many"].includes(normalized)) {
    return "|{";
  }

  if (["0..*", "0-n", "0..n", "zero-or-many"].includes(normalized)) {
    return "o{";
  }

  if (["n", "*", "many"].includes(normalized)) {
    return "|{";
  }

  return "||";
}

function getEdgeCardinality(edge: GraphEdge) {
  const properties = isRecord(edge.properties) ? edge.properties : undefined;
  const sourceCardinality =
    typeof properties?.sourceCardinality === "string" ? properties.sourceCardinality : undefined;
  const targetCardinality =
    typeof properties?.targetCardinality === "string" ? properties.targetCardinality : undefined;

  if (sourceCardinality || targetCardinality) {
    return {
      source: parseCardinalitySide(sourceCardinality),
      target: parseCardinalitySide(targetCardinality),
    };
  }

  if (edge.cardinality && edge.cardinality.includes(":")) {
    const [left, right] = edge.cardinality.split(":");
    return {
      source: parseCardinalitySide(left),
      target: parseCardinalitySide(right),
    };
  }

  return {
    source: "||",
    target: "||",
  };
}

function toMermaidClassDiagram(model: GraphModel) {
  const aliasMap = buildNodeAliasMap(model.nodes);
  const lines = ["classDiagram"];

  model.nodes.forEach((node) => {
    const alias = aliasMap.get(node.id) || sanitizeIdentifier(node.id);
    lines.push(`class ${alias}["${escapeLabel(node.label)}"] {`);
    const members = getUmlClassMembers(node);
    members.forEach((member) => lines.push(`  ${member}`));
    lines.push("}");
  });

  model.edges.forEach((edge) => {
    lines.push(getUmlRelation(edge, aliasMap));
  });

  return lines.join("\n");
}

function toMermaidErDiagram(model: GraphModel) {
  const aliasMap = buildNodeAliasMap(model.nodes);
  const lines = ["erDiagram"];

  model.nodes.forEach((node) => {
    const alias = aliasMap.get(node.id) || sanitizeIdentifier(node.id);
    lines.push(`  ${alias} {`);
    const attributes = getErAttributes(node);
    attributes.forEach((attribute) => lines.push(`    ${attribute}`));
    lines.push("  }");
  });

  model.edges.forEach((edge) => {
    const source = aliasMap.get(edge.source) || sanitizeIdentifier(edge.source);
    const target = aliasMap.get(edge.target) || sanitizeIdentifier(edge.target);
    const cardinality = getEdgeCardinality(edge);
    const label = edge.label || edge.kind;
    lines.push(`  ${source} ${cardinality.source}--${cardinality.target} ${target} : ${label}`);
  });

  return lines.join("\n");
}

export function graphModelToMermaid(model: GraphModel) {
  if (model.kind === "uml-class") {
    return toMermaidClassDiagram(model);
  }

  if (model.kind === "er") {
    return toMermaidErDiagram(model);
  }

  throw new Error(`Mermaid does not support graph kind "${model.kind}".`);
}
