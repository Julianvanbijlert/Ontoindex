# Search Context Rollout

This project now supports staged rollout for context-aware search without changing the `/search` UI contract.

## Runtime behavior

- `SearchPage` still owns the existing query, filter, sort, and result UX.
- `search-service.ts` builds context defensively and falls back to context-free retrieval if context collection fails.
- `SearchRetrievalGateway` is the only retrieval entry point.
- Hybrid retrieval remains primary.
- Legacy fallback is still available when the hybrid backend is unavailable.
- If the context pipeline fails but the hybrid backend is healthy, the gateway retries once with `context = null` before falling back to legacy retrieval.

## Feature flags

- `VITE_SEARCH_CONTEXT_ROLLOUT_MODE=off|shadow|light|full`
  - `off`: disable context entirely.
  - `shadow`: collect context but do not apply it to retrieval.
  - `light`: apply scope and trimmed session signals only.
  - `full`: apply the full context-aware pipeline.
- `VITE_SEARCH_ENABLE_CONTEXT_FALLBACK=true|false`
  - Retry baseline hybrid retrieval if context-aware retrieval fails.
- `VITE_SEARCH_CONTEXT_EMBEDDING_MODE=none|concat|session`
  - `concat` is the current production path.
  - `session` is feature-flagged and currently falls back to concat behavior.
- Existing search flags still apply:
  - `VITE_SEARCH_ENABLE_FALLBACK`
  - `VITE_SEARCH_ENABLE_QUERY_REWRITING`
  - `VITE_SEARCH_ENABLE_RERANKING`
  - `VITE_SEARCH_ENABLE_RESPONSE_CACHE`
  - `VITE_SEARCH_ENABLE_EMBEDDING_CACHE`
  - `VITE_SEARCH_DEBOUNCE_MS`

## Observability

Every logged query now captures:

- stage latency: `understandingMs`, `embeddingMs`, `rpcMs`, `rerankMs`, `fallbackMs`, `totalMs`
- retrieval confidence
- fallback usage
- cache hits
- `context.requestedUse`
- `context.effectiveUse`
- `context.rewriteMode`
- `context.driftDetected`
- `context.rolloutMode`
- `context.pipelineFallbackUsed`
- `context.pipelineFailureReason`

These fields are serialized into `search_query_logs` through the existing logging RPC payloads.

## Offline evaluation

The evaluation helpers now support:

- turn-level replay from `search_query_logs`-like rows plus `search_session_events`
- turn MRR and nDCG@5 comparisons for `none`, `light`, and `full`
- session-level aggregation:
  - average turn MRR
  - average turn nDCG@5
  - session success rate

Recommended rollout checks:

1. Run `npm run test:search`.
2. Run `npm test`.
3. Start with `VITE_SEARCH_CONTEXT_ROLLOUT_MODE=shadow` or `light`.
4. Monitor fallback rate, weak evidence rate, and context pipeline fallback rate.
5. Promote to `full` only after replay and live logs show no regression in latency or relevance.

## Fallback policy

The intended degradation path is:

1. Context-aware hybrid retrieval
2. Baseline hybrid retrieval without context
3. Legacy lexical fallback if the hybrid backend is unavailable and fallback is enabled

This prevents silent relevance degradation from context-specific failures while still keeping search available.
