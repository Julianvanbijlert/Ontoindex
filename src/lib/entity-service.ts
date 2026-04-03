import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivityEvent } from "@/lib/history-service";
import {
  evaluateDefinitionStandardsCompliance,
  StandardsBlockingFindingsError,
} from "@/lib/standards/compliance";
import type { StandardsRuntimeSettings } from "@/lib/standards/engine/types";
import { fetchStandardsRuntimeSettings } from "@/lib/standards/settings-service";

type AppSupabaseClient = SupabaseClient<Database>;

interface DefinitionStandardsValidationInput {
  ontologyId?: string | null;
  ontologyTitle?: string | null;
  settings?: StandardsRuntimeSettings;
  status?: string | null;
  metadata?: Database["public"]["Tables"]["definitions"]["Row"]["metadata"];
  relationships?: Array<{
    id: string;
    source_id: string;
    target_id: string;
    type: string;
    label?: string | null;
    metadata?: Database["public"]["Tables"]["relationships"]["Row"]["metadata"];
  }> | null;
}

interface DefinitionCreateInput {
  ontologyId: string;
  ontologyTitle?: string | null;
  createdBy?: string | null;
  definition: {
    title: string;
    description?: string | null;
    content?: string | null;
    example?: string | null;
    priority?: Database["public"]["Enums"]["priority_level"] | null;
    status?: Database["public"]["Enums"]["workflow_status"] | null;
    metadata?: Database["public"]["Tables"]["definitions"]["Row"]["metadata"];
  };
  standards?: DefinitionStandardsValidationInput;
}

interface DefinitionUpdateInput {
  definitionId: string;
  userId?: string | null;
  previous: {
    title: string;
    description?: string | null;
    content?: string | null;
    example?: string | null;
    metadata?: Database["public"]["Tables"]["definitions"]["Row"]["metadata"];
    version?: number | null;
  };
  changes: {
    title: string;
    description?: string | null;
    content?: string | null;
    example?: string | null;
  };
  source?: "detail" | "graph";
  standards?: DefinitionStandardsValidationInput;
}

interface OntologyUpdateInput {
  ontologyId: string;
  userId?: string | null;
  previous: {
    title: string;
    description?: string | null;
    tags?: string[] | null;
  };
  changes: {
    title: string;
    description?: string | null;
    tags?: string[];
  };
}

function buildDefinitionUpdateSummary(input: DefinitionUpdateInput) {
  const changedFields: string[] = [];

  if (input.previous.title !== input.changes.title) {
    changedFields.push("title");
  }

  if ((input.previous.description || "") !== (input.changes.description || "")) {
    changedFields.push("description");
  }

  if ((input.previous.content || "") !== (input.changes.content || "")) {
    changedFields.push("context");
  }

  if ((input.previous.example || "") !== (input.changes.example || "")) {
    changedFields.push("example");
  }

  if (changedFields.length === 0) {
    return `Saved "${input.changes.title}" without content changes.`;
  }

  return `${input.source === "graph" ? "Updated from the graph" : "Updated"} ${changedFields.join(", ")} for "${input.changes.title}".`;
}

function buildOntologyUpdateSummary(input: OntologyUpdateInput) {
  const changedFields: string[] = [];

  if (input.previous.title !== input.changes.title) {
    changedFields.push("title");
  }

  if ((input.previous.description || "") !== (input.changes.description || "")) {
    changedFields.push("description");
  }

  if ((input.previous.tags || []).join("|") !== (input.changes.tags || []).join("|")) {
    changedFields.push("tags");
  }

  return changedFields.length > 0
    ? `Updated ${changedFields.join(", ")} for ontology "${input.changes.title}".`
    : `Saved ontology "${input.changes.title}".`;
}

async function ensureDefinitionSaveAllowed(client: AppSupabaseClient, input: {
  definitionId: string;
  title: string;
  description?: string | null;
  content?: string | null;
  example?: string | null;
  standards?: DefinitionStandardsValidationInput;
}) {
  if (!input.standards) {
    return;
  }

  const settings = await fetchStandardsRuntimeSettings(client);

  const compliance = evaluateDefinitionStandardsCompliance({
    ontologyId: input.standards.ontologyId,
    ontologyTitle: input.standards.ontologyTitle,
    definition: {
      id: input.definitionId,
      title: input.title,
      description: input.description,
      content: input.content,
      example: input.example,
      status: input.standards.status,
      metadata: input.standards.metadata,
      relationships: input.standards.relationships,
    },
    settings,
  });

  if (compliance.hasBlockingFindings) {
    throw new StandardsBlockingFindingsError(
      "Resolve the blocking standards compliance issues before saving this definition.",
      compliance,
    );
  }
}

export async function createDefinition(client: AppSupabaseClient, input: DefinitionCreateInput) {
  await ensureDefinitionSaveAllowed(client, {
    definitionId: `draft:${input.ontologyId}:${input.definition.title.trim().toLowerCase() || "definition"}`,
    title: input.definition.title,
    description: input.definition.description,
    content: input.definition.content,
    example: input.definition.example,
    standards: input.standards
      ? {
          ...input.standards,
          ontologyId: input.standards.ontologyId ?? input.ontologyId,
          ontologyTitle: input.standards.ontologyTitle ?? input.ontologyTitle,
          status: input.standards.status ?? input.definition.status,
          metadata: input.standards.metadata ?? input.definition.metadata,
        }
      : undefined,
  });

  const { data, error } = await client
    .from("definitions")
    .insert({
      title: input.definition.title,
      description: input.definition.description || "",
      content: input.definition.content || "",
      example: input.definition.example || "",
      ontology_id: input.ontologyId,
      priority: input.definition.priority ?? "normal",
      created_by: input.createdBy || null,
      status: input.definition.status ?? "draft",
      metadata: input.definition.metadata || null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await logActivityEvent(client, {
    userId: input.createdBy,
    action: "created",
    entityType: "definition",
    entityId: data.id,
    entityTitle: data.title,
    details: {
      summary: `Created definition "${data.title}".`,
      ontology_id: input.ontologyId,
    },
  });

  return data;
}

export async function updateDefinition(client: AppSupabaseClient, input: DefinitionUpdateInput) {
  await ensureDefinitionSaveAllowed(client, {
    definitionId: input.definitionId,
    title: input.changes.title,
    description: input.changes.description,
    content: input.changes.content,
    example: input.changes.example,
    standards: input.standards
      ? {
          ...input.standards,
          metadata: input.standards.metadata ?? input.previous.metadata,
        }
      : undefined,
  });

  await client.from("version_history").insert({
    definition_id: input.definitionId,
    version: input.previous.version || 1,
    title: input.previous.title,
    description: input.previous.description || "",
    content: input.previous.content || "",
    metadata: input.previous.metadata || {},
    changed_by: input.userId || null,
    change_summary: buildDefinitionUpdateSummary(input),
  });

  const { data, error } = await client
    .from("definitions")
    .update({
      title: input.changes.title,
      description: input.changes.description || "",
      content: input.changes.content || "",
      example: input.changes.example || "",
      version: (input.previous.version || 1) + 1,
    })
    .eq("id", input.definitionId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await logActivityEvent(client, {
    userId: input.userId,
    action: "updated",
    entityType: "definition",
    entityId: input.definitionId,
    entityTitle: input.changes.title,
    details: {
      source: input.source || "detail",
      summary: buildDefinitionUpdateSummary(input),
    },
  });

  return data;
}

export async function updateOntology(client: AppSupabaseClient, input: OntologyUpdateInput) {
  const { data, error } = await client
    .from("ontologies")
    .update({
      title: input.changes.title,
      description: input.changes.description || "",
      tags: input.changes.tags || [],
    })
    .eq("id", input.ontologyId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await logActivityEvent(client, {
    userId: input.userId,
    action: "updated",
    entityType: "ontology",
    entityId: input.ontologyId,
    entityTitle: input.changes.title,
    details: {
      summary: buildOntologyUpdateSummary(input),
    },
  });

  return data;
}

export async function deleteDefinition(client: AppSupabaseClient, definitionId: string) {
  const { data, error } = await client.rpc("delete_definition_cascade", {
    _definition_id: definitionId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteOntology(client: AppSupabaseClient, ontologyId: string) {
  const { data, error } = await client.rpc("delete_ontology_cascade", {
    _ontology_id: ontologyId,
  });

  if (error) {
    throw error;
  }

  return data;
}
