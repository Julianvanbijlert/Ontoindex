# Search Audit And Target Architecture

## Current Search Flow

### User-facing flow

- The primary global search entry point is `src/pages/SearchPage.tsx`.
- The page calls `searchEntities(...)` from `src/lib/search-service.ts` on query and filter changes.
- Search history and recent finds are separate concerns and already behave well:
  - search history is persisted through the `save_search_history` RPC
  - recent finds are derived from `activity_events`

### Retrieval and ranking today

- `searchEntities(...)` fetches all non-deleted definitions and all ontologies into the browser.
- Filtering happens client-side in `filterAndSortSearchResults(...)`.
- Retrieval is substring-based over a concatenated haystack of:
  - title
  - description
  - content
  - ontology title
  - tags
- Relevance is a hand-tuned heuristic:
  - exact title match
  - title prefix
  - title substring
  - description substring
  - ontology title substring
  - tag substring
- Sorting is then applied in the browser.

### Data and backend state today

- The platform already has normalized source tables for:
  - `definitions`
  - `ontologies`
  - `activity_events`
  - `search_history`
- The database contains a legacy GIN FTS index on `definitions`, but the current search path does not use it.
- There is no dedicated search index, no dense retrieval store, no reranking layer, and no query logging for search quality analysis.

## Current Constraints

- This repository is a Vite/React client backed directly by Supabase.
- There is no dedicated application server today.
- Existing product contracts worth preserving:
  - `SearchPage` filter model and page flow
  - search history behavior
  - recent finds behavior
  - existing entity detail routes and result card shape
- Search currently depends on direct browser access to Supabase, so the cleanest backend boundary is:
  - Supabase SQL RPCs for retrieval and logging
  - optional Supabase Edge Functions for embedding generation and other model-backed tasks
- Writes happen from multiple places:
  - direct inserts in page components
  - service-layer updates
  - import flows
- Search freshness therefore cannot rely on a single frontend code path only.

## Preserve Vs Replace

### Preserve

- `SearchPage` route and its filter semantics.
- `SearchResultItem` as the UI-facing contract, extended only with optional explainability/confidence fields.
- `fetchSearchOptions`, `fetchSearchHistory`, `saveSearchHistory`, and `fetchRecentFinds`.
- Existing authorization and auth model.
- Existing source-of-truth tables for ontologies and definitions.

### Replace

- Full client-side retrieval of all search candidates.
- Browser-only filtering and heuristic relevance as the primary ranking path.
- Search logic that treats lexical matching as the only candidate generation method.

## Target Architecture

### A. Ingestion and indexing

Introduce a dedicated `search_documents` index table as the backend search boundary.

Each row represents a searchable chunk derived from a source entity:

- source entity identity: type + id
- chunk number
- canonical title/body/search text
- metadata:
  - ontology id/title
  - tags
  - status
  - priority
  - creator
  - source updated timestamp
- lexical representation:
  - weighted `tsvector`
  - trigram-indexed text fields
- dense representation:
  - embedding vector
  - embedding model/version metadata
  - embedding refreshed timestamp

Index maintenance strategy:

- database functions rebuild search documents from source entities
- triggers keep lexical search documents in sync on create/update/delete
- content-changing writes clear stale embeddings
- an embedding refresh step repopulates vectors after content changes

This gives us:

- exact-match and phrase strength from lexical indexing
- semantic recall through dense vectors
- a stable search contract independent from the UI

### B. Query understanding

Add a query analysis layer in the client service before retrieval:

- intent classification:
  - navigational
  - informational
  - exploratory
- exact-match sensitivity detection
- ambiguity detection
- conservative rewrite variant generation

This analysis is passed into the retrieval RPC and also logged for failure analysis.

### C. Retrieval

Use a hybrid candidate generation flow:

1. lexical candidates from weighted FTS + trigram similarity
2. dense candidates from vector ANN search
3. entity-level merge using reciprocal rank fusion

Important design decisions:

- lexical and dense retrieval run in parallel conceptually
- exact title and phrase matches are explicitly boosted
- metadata filters are applied inside retrieval, not after the fact
- chunk-level evidence is retained so we can explain why a result matched

### D. Ranking and reranking

Implement a two-stage ranker:

- stage 1:
  high-recall hybrid retrieval over lexical and dense indices
- stage 2:
  entity-level reranking using stronger interaction features, including:
  - exact title match
  - title phrase match
  - token coverage
  - lexical score
  - dense score
  - ontology/tag alignment
  - recency and popularity tie-breaks

Near-term note:

- the repository has no dedicated model-serving backend today, so the implemented reranker is feature-based and deterministic
- the interface is intentionally shaped so a cross-encoder or late-interaction reranker can be added behind the same contract without changing the page layer

### E. LLM-assisted search support

The current product does not require answer synthesis in the main search page, so retrieval quality is the primary implementation target.

The architecture still reserves a clean extension point for model-backed features:

- query rewriting behind strict preservation rules
- evidence-grounded result explanations
- optional future answer synthesis with citations only from retrieved evidence

Generated text must never be treated as retrieval evidence.

### F. Evaluation and observability

Add observability from day one:

- `search_query_logs` table for:
  - raw query
  - normalized query
  - filters
  - query analysis
  - timings
  - result count
  - fallback usage
  - weak-evidence flag
  - failure bucket
- offline metric utilities in application code for:
  - Recall@K
  - Precision@K
  - MRR
  - nDCG
- fixture-based benchmark coverage for:
  - lexical-only baseline
  - hybrid retrieval
  - reranked hybrid retrieval

## Quality / Latency / Scalability / Maintainability Tradeoffs

### Why hybrid retrieval

- BM25/FTS preserves exact-match strength and title precision.
- Dense retrieval recovers semantically related content that lexical-only search misses.
- Reciprocal rank fusion is simple, robust, and easy to iterate on before score calibration work.

### Why Postgres + Supabase first

- It fits the existing platform boundary.
- It avoids introducing a second operational datastore prematurely.
- It keeps auth, RLS, and metadata filtering close to the source of truth.

### Why chunked search documents

- It improves retrieval granularity for longer definitions.
- It makes explanations more faithful.
- It creates a clean path to stronger rerankers later.

### Why feature-based reranking first

- It is deterministic, testable, and deployable inside the current repo.
- It improves precision over single-pass retrieval immediately.
- It does not block future adoption of cross-encoders or late interaction models.

### Why optional edge-function embeddings

- Dense retrieval needs a secure place for provider credentials.
- Edge Functions let us add embeddings without replacing the platform.
- If embeddings are temporarily unavailable, lexical retrieval still works.

## Migration Plan

### Phase 0: Audit and contract stabilization

- document the existing flow and gaps
- preserve the page-level contract
- define result/explainability metadata additions as optional

### Phase 1: Backend search boundary

- add `search_documents`
- add lexical indexes and vector column
- add sync functions/triggers
- add hybrid retrieval RPC
- add search query logging RPC

### Phase 2: Frontend migration

- refactor `search-service.ts` to call the backend search RPC
- keep a graceful legacy fallback path
- add query analysis and result explainability mapping

### Phase 3: Dense freshness

- add an embedding refresh function for changed entities
- invoke it from entity create/update/import paths
- keep lexical indexing trigger-driven so search never goes fully dark

### Phase 4: Evaluation and iteration

- add benchmark fixtures and metrics
- compare lexical-only vs hybrid vs hybrid+rereank
- use query logs to identify weak-evidence and zero-result buckets

## What Success Looks Like

- Search remains compatible with the current product flow.
- Exact names still rank well.
- Semantically related concepts are now discoverable.
- Result ordering is explainable and instrumented.
- Search quality can be improved without rewriting the page again.
