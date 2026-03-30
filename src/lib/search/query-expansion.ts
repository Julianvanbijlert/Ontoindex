import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { normalizeSearchText } from "@/lib/search-normalization";

type AppSupabaseClient = SupabaseClient<Database>;

interface QueryExpansionEdgeResponse {
  expansions?: string[];
  providerConfigured?: boolean;
  provider?: string | null;
  model?: string | null;
}

function dedupeExpansions(query: string, expansions: string[]) {
  const normalizedQuery = normalizeSearchText(query);
  const deduped = new Map<string, string>();

  expansions.forEach((value) => {
    const normalized = normalizeSearchText(value);

    if (!normalized || normalized === normalizedQuery) {
      return;
    }

    if (!deduped.has(normalized)) {
      deduped.set(normalized, value.trim().replace(/\s+/g, " "));
    }
  });

  return [...deduped.values()].slice(0, 6);
}

export async function expandQueryWithLLM(
  client: AppSupabaseClient,
  query: string,
): Promise<string[]> {
  if (!client.functions?.invoke || !query.trim()) {
    return [];
  }

  try {
    const { data, error } = await client.functions.invoke<QueryExpansionEdgeResponse>("search-query-expand", {
      body: {
        query,
      },
    });

    if (error) {
      console.warn("search_query_expansion_unavailable", { error });
      return [];
    }

    if (!data?.providerConfigured || !Array.isArray(data.expansions)) {
      return [];
    }

    return dedupeExpansions(query, data.expansions);
  } catch (error) {
    console.warn("search_query_expansion_failed", { error });
    return [];
  }
}
