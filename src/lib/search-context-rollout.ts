import { searchRuntimeConfig } from "@/lib/search-config";
import type { SearchContext } from "@/lib/search/context/types";

export type SearchContextRolloutMode = "off" | "shadow" | "light" | "full";

export interface SearchContextResolution {
  context: SearchContext | null;
  rolloutMode: SearchContextRolloutMode;
  requestedContextUse: SearchContext["retrievalPlan"]["contextUse"];
  effectiveContextUse: SearchContext["retrievalPlan"]["contextUse"];
}

function downgradeToLightContext(context: SearchContext): SearchContext {
  if (context.retrievalPlan.contextUse !== "full") {
    return context;
  }

  return {
    ...context,
    session: {
      ...context.session,
      recentQueries: context.session.recentQueries.slice(0, 1),
      recentEntities: context.session.recentEntities.slice(0, 1),
    },
    retrievalPlan: {
      ...context.retrievalPlan,
      contextUse: "light",
      reason: "staged_rollout_light_mode",
    },
    debug: {
      ...context.debug,
      sourceCounts: {
        recentQueryCount: Math.min(context.debug.sourceCounts.recentQueryCount, 1),
        recentEntityCount: Math.min(context.debug.sourceCounts.recentEntityCount, 1),
      },
    },
  };
}

export function resolveSearchContextRollout(
  context: SearchContext | null | undefined,
): SearchContextResolution {
  const rolloutMode = searchRuntimeConfig.contextRolloutMode;
  const requestedContextUse = context?.retrievalPlan.contextUse || "none";

  if (!context || rolloutMode === "off" || rolloutMode === "shadow") {
    return {
      context: null,
      rolloutMode,
      requestedContextUse,
      effectiveContextUse: "none",
    };
  }

  if (rolloutMode === "light") {
    const downgradedContext = downgradeToLightContext(context);

    return {
      context: downgradedContext,
      rolloutMode,
      requestedContextUse,
      effectiveContextUse: downgradedContext.retrievalPlan.contextUse,
    };
  }

  return {
    context,
    rolloutMode,
    requestedContextUse,
    effectiveContextUse: context.retrievalPlan.contextUse,
  };
}
