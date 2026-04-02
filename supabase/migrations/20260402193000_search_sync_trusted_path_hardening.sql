-- Harden search-index write paths so ontology/definition/import writes can trigger
-- trusted sync logic without allowing direct client execution of those sync RPCs.

ALTER FUNCTION public.sync_search_index_entity(uuid)
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION public.sync_search_index_ontology_subtree(uuid)
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION public.handle_definition_search_document_sync()
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION public.handle_ontology_search_document_sync()
  SECURITY DEFINER
  SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.sync_search_index_entity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_search_index_ontology_subtree(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_search_index_entity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_search_index_ontology_subtree(uuid) TO service_role;
