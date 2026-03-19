import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

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
