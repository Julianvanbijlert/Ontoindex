import type { Json } from "@/integrations/supabase/types";
import { builtInStandardsPacks } from "@/lib/standards/engine/registry";
import { runStandardsValidation } from "@/lib/standards/engine/run-validation";
import type {
  RunStandardsValidationResult,
  StandardsRuntimeSettings,
} from "@/lib/standards/engine/types";
import type { StandardsModel } from "@/lib/standards/model";
import {
  mapOntologyToStandardsModel,
  type OntologyStandardsDefinition,
} from "@/lib/standards/mappers/ontology-to-standards";

interface DefinitionComplianceInput {
  ontologyId?: string | null;
  ontologyTitle?: string | null;
  definition: {
    id: string;
    title: string;
    description?: string | null;
    content?: string | null;
    example?: string | null;
    status?: string | null;
    metadata?: Json | null;
    relationships?: OntologyStandardsDefinition["relationships"];
  };
  settings: StandardsRuntimeSettings;
}

interface RelationshipComplianceInput {
  ontologyId?: string | null;
  ontologyTitle?: string | null;
  sourceDefinition: {
    id: string;
    title: string;
    metadata?: Json | null;
  };
  targetDefinition?: {
    id: string;
    title: string;
    metadata?: Json | null;
  } | null;
  selectedType?: string;
  customType?: string;
  relationshipMetadata?: Json | null;
  settings: StandardsRuntimeSettings;
}

interface OntologyComplianceInput {
  ontologyId?: string | null;
  ontologyTitle?: string | null;
  definitions: OntologyStandardsDefinition[];
  settings: StandardsRuntimeSettings;
}

function buildRelationshipMetadata(input: Pick<RelationshipComplianceInput, "selectedType" | "customType">): Json | undefined {
  const normalizedType = input.selectedType?.trim();

  if (!normalizedType) {
    return undefined;
  }

  return {
    standards: {
      relation: {
        kind: normalizedType === "is_a"
          ? "broader"
          : normalizedType === "related_to"
            ? "related"
            : normalizedType === "__custom__" && input.customType?.trim().toLowerCase() === "narrower"
              ? "narrower"
              : "custom",
        predicateKey: normalizedType === "__custom__" ? (input.customType?.trim() || "custom") : normalizedType,
      },
    },
  };
}

function isRecord(value: Json | null | undefined): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeJsonObjects(base?: Json | null, override?: Json | null): Json | undefined {
  if (!isRecord(base) && !isRecord(override)) {
    return override ?? base ?? undefined;
  }

  const merged: Record<string, Json> = {
    ...(isRecord(base) ? base : {}),
  };

  if (isRecord(override)) {
    for (const [key, value] of Object.entries(override)) {
      const existing = merged[key];

      if (isRecord(existing) && isRecord(value)) {
        merged[key] = mergeJsonObjects(existing, value) as Json;
      } else {
        merged[key] = value as Json;
      }
    }
  }

  return merged;
}

export function buildPersistedRelationshipMetadata(input: Pick<RelationshipComplianceInput, "selectedType" | "customType" | "relationshipMetadata">) {
  return mergeJsonObjects(
    buildRelationshipMetadata(input),
    input.relationshipMetadata,
  );
}

export class StandardsBlockingFindingsError extends Error {
  compliance: RunStandardsValidationResult;

  constructor(message: string, compliance: RunStandardsValidationResult) {
    super(message);
    this.name = "StandardsBlockingFindingsError";
    this.compliance = compliance;
  }
}

export function isStandardsBlockingFindingsError(error: unknown): error is StandardsBlockingFindingsError {
  return error instanceof StandardsBlockingFindingsError;
}

function evaluateModel(
  model: StandardsModel,
  settings: StandardsRuntimeSettings,
  relationshipDraft?: {
    sourceDefinitionId?: string;
    sourceTitle?: string;
    targetDefinitionId?: string;
    targetTitle?: string;
    selectedType?: string;
    customType?: string;
  },
) {
  return runStandardsValidation({
    model,
    packs: builtInStandardsPacks,
    settings,
    context: {
      relationshipDraft: relationshipDraft as never,
    },
  });
}

export function evaluateDefinitionStandardsCompliance(input: DefinitionComplianceInput): RunStandardsValidationResult {
  const model = mapOntologyToStandardsModel({
    ontologyId: input.ontologyId || undefined,
    ontologyTitle: input.ontologyTitle || undefined,
    definitions: [
      {
        id: input.definition.id,
        title: input.definition.title,
        description: input.definition.description,
        content: input.definition.content,
        example: input.definition.example,
        status: input.definition.status,
        metadata: input.definition.metadata || undefined,
        relationships: input.definition.relationships || [],
      },
    ],
  });

  return evaluateModel(model, input.settings);
}

export function evaluateRelationshipStandardsCompliance(input: RelationshipComplianceInput): RunStandardsValidationResult {
  const definitions: OntologyStandardsDefinition[] = [
    {
      id: input.sourceDefinition.id,
      title: input.sourceDefinition.title,
      metadata: input.sourceDefinition.metadata || undefined,
      relationships: input.targetDefinition
        ? [{
            id: "relationship-draft",
            source_id: input.sourceDefinition.id,
            target_id: input.targetDefinition.id,
            type: input.selectedType === "__custom__"
              ? (input.customType?.trim() || "custom")
              : (input.selectedType || "related_to"),
            label: input.selectedType === "__custom__" ? (input.customType?.trim() || null) : null,
            metadata: buildPersistedRelationshipMetadata(input),
          }]
        : [],
    },
  ];

  if (input.targetDefinition) {
    definitions.push({
      id: input.targetDefinition.id,
      title: input.targetDefinition.title,
      metadata: input.targetDefinition.metadata || undefined,
      relationships: [],
    });
  }

  const model = mapOntologyToStandardsModel({
    ontologyId: input.ontologyId || undefined,
    ontologyTitle: input.ontologyTitle || undefined,
    definitions,
  });

  const result = evaluateModel(model, input.settings, {
    sourceDefinitionId: input.sourceDefinition.id,
    sourceTitle: input.sourceDefinition.title,
    targetDefinitionId: input.targetDefinition?.id,
    targetTitle: input.targetDefinition?.title,
    selectedType: input.selectedType,
    customType: input.customType,
  });

  if (
    input.selectedType === "__custom__"
    && input.customType?.trim()
    && !["broader", "narrower", "related"].includes(input.customType.trim().toLowerCase())
    && input.settings.enabledStandards.includes("nl-sbb")
    && !result.findings.some((finding) => finding.ruleId === "nl_sbb_unmapped_relation_semantics")
  ) {
    const effectiveSeverity = input.settings.ruleOverrides.nl_sbb_unmapped_relation_semantics || "warning";
    result.findings.unshift({
      id: "relationship-draft:nl-sbb:custom",
      standardId: "nl-sbb",
      ruleId: "nl_sbb_unmapped_relation_semantics",
      severity: "warning",
      effectiveSeverity,
      blocking: effectiveSeverity === "blocking",
      message: "Using a standards-mapped relation is recommended for this link.",
      explanation: "The initial NL-SBB pack prefers a broader, narrower, or related semantic mapping before falling back to a custom relation label.",
      path: "relationshipDraft.type",
      entityKind: "relationshipDraft",
      entityId: "relationship-draft",
      field: "type",
      profile: "nl-sbb",
      code: "nl_sbb_unmapped_relation_semantics",
    });
    result.summary[effectiveSeverity] += 1;
  }

  result.hasBlockingFindings = result.findings.some((finding) => finding.blocking);
  return result;
}

export function evaluateOntologyStandardsCompliance(input: OntologyComplianceInput): RunStandardsValidationResult {
  const model = mapOntologyToStandardsModel({
    ontologyId: input.ontologyId || undefined,
    ontologyTitle: input.ontologyTitle || undefined,
    definitions: input.definitions,
  });

  return evaluateModel(model, input.settings);
}

export function evaluateStandardsModelCompliance(model: StandardsModel, settings: StandardsRuntimeSettings) {
  return evaluateModel(model, settings);
}

export function formatStandardsFindingsAsWarnings(result: RunStandardsValidationResult) {
  if (result.findings.length === 0) {
    return [];
  }

  const summary = `Standards validation: ${result.summary.error + result.summary.blocking} error-level issue(s), ${result.summary.warning} warning(s), ${result.summary.info} info item(s).`;
  const details = result.findings.slice(0, 5).map((finding) => (
    `[${finding.standardId}/${finding.effectiveSeverity}] ${finding.ruleId}: ${finding.message}`
  ));
  const omittedCount = Math.max(0, result.findings.length - details.length);

  return omittedCount > 0
    ? [summary, ...details, `...and ${omittedCount} more standards issue(s).`]
    : [summary, ...details];
}
