import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivityEvent } from "@/lib/history-service";

type AppSupabaseClient = SupabaseClient<Database>;

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

export async function updateDefinition(client: AppSupabaseClient, input: DefinitionUpdateInput) {
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
