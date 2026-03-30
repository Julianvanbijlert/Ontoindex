REVOKE EXECUTE ON FUNCTION public.enqueue_search_index_job(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_search_index_entity(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_search_index_ontology_subtree(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_search_index_job(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_search_index_job(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_stale_search_documents(integer) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_search_index_job(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_search_index_entity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_search_index_ontology_subtree(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_search_index_job(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_search_index_job(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_stale_search_documents(integer) TO service_role;
