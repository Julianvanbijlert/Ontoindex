import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { requestChatCompletion } from "@/lib/chat/chat-api";
import { buildChatEvidencePack } from "@/lib/chat/evidence-pack-builder";
import { resolveChatSynonymExpansion } from "@/lib/chat/synonym-expansion";
import type {
  ChatRuntimeSettings,
  ChatSessionSettings,
  ChatTurnResult,
} from "@/lib/chat/types";
import { buildSearchContextFromExperience, type SearchExperienceAdapterInput } from "@/lib/search/context/search-experience-adapter";
import { analyzeSearchQuery } from "@/lib/search-query-understanding";
import { searchWithRetrievalGateway } from "@/lib/search-retrieval-gateway";
import type { SearchFilters } from "@/lib/search-types";

type AppSupabaseClient = SupabaseClient<Database>;

function toSearchFilters(settings: ChatSessionSettings): SearchFilters {
  return {
    ontologyId: settings.ontologyScopeId || "all",
    tag: "all",
    status: "all",
    type: "all",
    ownership: "all",
  };
}

function buildGroundingConfidence(
  retrievalResponse: Awaited<ReturnType<typeof searchWithRetrievalGateway>>,
): ChatTurnResult["retrieval"]["retrievalConfidence"] {
  if (retrievalResponse.results.length === 0) {
    return "weak" as const;
  }

  return retrievalResponse.results[0]?.confidence || "unknown";
}

export async function runGroundedChatTurn(
  client: AppSupabaseClient,
  input: {
    sessionId?: string | null;
    userMessage: string;
    currentUserId?: string | null;
    settings: ChatSessionSettings;
    runtimeSettings?: ChatRuntimeSettings;
    experience: SearchExperienceAdapterInput;
    signal?: AbortSignal;
  },
): Promise<ChatTurnResult> {
  const context = buildSearchContextFromExperience(input.experience);
  const initialAnalysis = analyzeSearchQuery(input.userMessage, { context });
  const synonymExpansion = await resolveChatSynonymExpansion(client, {
    query: input.userMessage,
    analysis: initialAnalysis,
    settings: input.settings,
  });
  const effectiveQuery = synonymExpansion.expandedQuery;

  const retrievalResponse = await searchWithRetrievalGateway(
    client,
    effectiveQuery,
    toSearchFilters(input.settings),
    "relevance",
    input.currentUserId,
    {
      context,
      signal: input.signal,
    },
  );

  const { evidencePack } = await buildChatEvidencePack(client, {
    retrieval: retrievalResponse,
    synonymSignals: synonymExpansion.signals,
    maxItems: input.runtimeSettings?.maxEvidenceItems,
  });

  const retrievalSummary: ChatTurnResult["retrieval"] = {
    originalQuery: input.userMessage,
    effectiveQuery,
    normalizedQuery: retrievalResponse.analysis.normalizedQuery,
    contextUse: retrievalResponse.analysis.retrievalPlan.contextUse,
    rewriteMode: retrievalResponse.analysis.retrievalPlan.rewriteMode,
    denseRetrievalGate: retrievalResponse.analysis.retrievalPlan.denseRetrievalGate,
    retrievalConfidence: buildGroundingConfidence(retrievalResponse),
    ambiguityFlags: retrievalResponse.analysis.ambiguityFlags,
    expansionsUsed: synonymExpansion.signals,
    stageTimings: retrievalResponse.diagnostics.stageTimings,
  };

  const backendResponse = await requestChatCompletion(client, {
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    evidencePack,
    retrieval: retrievalSummary,
    settings: input.settings,
  });

  return {
    sessionId: backendResponse.sessionId,
    title: backendResponse.title,
    userMessage: {
      role: "user",
      content: input.userMessage,
    },
    assistantMessage: {
      role: "assistant",
      content: backendResponse.answer,
      citations: backendResponse.citations.map((citation) => citation.id),
      metadata: {
        groundingStatus: backendResponse.groundingStatus,
        clarificationQuestion: backendResponse.clarificationQuestion || null,
        refusalReason: backendResponse.refusalReason || null,
        provider: backendResponse.provider.name,
      },
    },
    citations: backendResponse.citations,
    evidencePack,
    retrieval: retrievalSummary,
    groundingStatus: backendResponse.groundingStatus,
    clarificationQuestion: backendResponse.clarificationQuestion || null,
    refusalReason: backendResponse.refusalReason || null,
  };
}
