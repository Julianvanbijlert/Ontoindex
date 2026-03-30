# Search Indexing Lifecycle

## Ownership

Search indexing is backend-owned.

- Source-of-truth writes happen in `definitions` and `ontologies`.
- Database triggers rebuild lexical `search_documents` records immediately.
- The same trigger path enqueues a singleton `embed_stale_documents` job in `search_index_jobs`.
- The `search-index-sync` Edge Function processes that queue and updates dense embeddings asynchronously.
- Frontend code does not trigger search indexing or embedding refreshes.

## Contract

The backend indexing contract is:

- `syncEntity(entityId)`
- `syncOntologySubtree(ontologyId)`
- `embedStaleDocuments()`

These are exposed through:

- SQL functions in [20260324093000_search_index_backend_ownership.sql](/C:/Users/julia/OneDrive/Documenten/Ontoindex/supabase/migrations/20260324093000_search_index_backend_ownership.sql)
- backend-only function grants in [20260324174500_search_index_backend_api_lockdown.sql](/C:/Users/julia/OneDrive/Documenten/Ontoindex/supabase/migrations/20260324174500_search_index_backend_api_lockdown.sql)
- The worker entry point in [search-index-sync/index.ts](/C:/Users/julia/OneDrive/Documenten/Ontoindex/supabase/functions/search-index-sync/index.ts)
- Shared worker logic in [search-index-maintenance.ts](/C:/Users/julia/OneDrive/Documenten/Ontoindex/supabase/functions/_shared/search-index-maintenance.ts)

## Lifecycle

1. A definition or ontology is inserted, updated, moved, soft-deleted, or deleted.
2. Post-write triggers call `sync_search_index_entity(...)` or `sync_search_index_ontology_subtree(...)`.
3. Lexical chunks in `search_documents` are rebuilt immediately.
4. A single pending embedding job is enqueued if one is not already pending or processing.
5. The indexing worker claims the job, fetches stale documents, and writes embeddings in batches.
6. Hybrid retrieval can use lexical results immediately and dense recall catches up once embedding sync completes.

## Operational Notes

- Eventual consistency is intentional: lexical freshness is immediate, dense freshness is asynchronous.
- Queue coalescing prevents a burst of writes from creating duplicate embedding work.
- If embedding credentials are missing, lexical search still functions and the job is marked failed for visibility.
- To keep embeddings current, run the `search-index-sync` function with `action: "embedStaleDocuments"` from a scheduler or backend worker loop.
- The `search-index-sync` function is backend-only and should be invoked with the service-role bearer token from secure infrastructure, not from the browser.

## Frontend Responsibility

None.

The following files no longer own search index refreshes:

- [entity-service.ts](/C:/Users/julia/OneDrive/Documenten/Ontoindex/src/lib/entity-service.ts)
- [import-service.ts](/C:/Users/julia/OneDrive/Documenten/Ontoindex/src/lib/import-service.ts)
- [Ontologies.tsx](/C:/Users/julia/OneDrive/Documenten/Ontoindex/src/pages/Ontologies.tsx)
- [OntologyDetail.tsx](/C:/Users/julia/OneDrive/Documenten/Ontoindex/src/pages/OntologyDetail.tsx)
