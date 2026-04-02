-- Ensure search-index trigger work runs with trusted function privileges.
-- This keeps search_documents locked down by RLS for direct user writes while
-- allowing definition/ontology write triggers to sync index rows safely.

ALTER FUNCTION public.handle_definition_search_document_sync()
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION public.handle_ontology_search_document_sync()
  SECURITY DEFINER
  SET search_path = public;
