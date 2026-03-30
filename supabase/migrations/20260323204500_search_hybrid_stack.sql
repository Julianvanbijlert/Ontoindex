CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('definition', 'ontology')),
  source_id UUID NOT NULL,
  chunk_number INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  status public.workflow_status,
  priority public.priority_level,
  tags TEXT[] NOT NULL DEFAULT '{}',
  ontology_id UUID REFERENCES public.ontologies(id) ON DELETE CASCADE,
  ontology_title TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT NOT NULL DEFAULT '',
  embedding VECTOR(1536),
  embedding_model TEXT,
  embedding_updated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fts_document tsvector NOT NULL DEFAULT ''::tsvector,
  UNIQUE (source_type, source_id, chunk_number)
);

ALTER TABLE public.search_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Search documents viewable by authenticated"
  ON public.search_documents
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_search_documents_updated_at
BEFORE UPDATE ON public.search_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_search_document_fts_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.fts_document :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.ontology_title, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(coalesce(NEW.tags, '{}'::text[]), ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'C');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_search_documents_fts_document ON public.search_documents;

CREATE TRIGGER update_search_documents_fts_document
BEFORE INSERT OR UPDATE OF title, description, ontology_title, tags, body
ON public.search_documents
FOR EACH ROW EXECUTE FUNCTION public.update_search_document_fts_document();

CREATE INDEX search_documents_source_idx
  ON public.search_documents (source_type, source_id);

CREATE INDEX search_documents_filter_idx
  ON public.search_documents (source_type, status, ontology_id, created_by, source_updated_at DESC);

CREATE INDEX search_documents_tags_idx
  ON public.search_documents USING gin(tags);

CREATE INDEX search_documents_fts_idx
  ON public.search_documents USING gin(fts_document);

CREATE INDEX search_documents_title_trgm_idx
  ON public.search_documents USING gin(title gin_trgm_ops);

CREATE INDEX search_documents_search_text_trgm_idx
  ON public.search_documents USING gin(search_text gin_trgm_ops);

UPDATE public.search_documents
SET fts_document =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(ontology_title, '')), 'B') ||
  setweight(to_tsvector('english', array_to_string(coalesce(tags, '{}'::text[]), ' ')), 'B') ||
  setweight(to_tsvector('english', coalesce(body, '')), 'C')
WHERE fts_document = ''::tsvector;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_am WHERE amname = 'hnsw') THEN
    EXECUTE 'CREATE INDEX search_documents_embedding_ann_idx ON public.search_documents USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL';
  ELSE
    EXECUTE 'CREATE INDEX search_documents_embedding_ann_idx ON public.search_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 64) WHERE embedding IS NOT NULL';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END;
$$;

CREATE TABLE public.search_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  strategy TEXT NOT NULL DEFAULT 'hybrid',
  result_count INTEGER NOT NULL DEFAULT 0,
  top_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  stage_timings JSONB NOT NULL DEFAULT '{}'::jsonb,
  weak_evidence BOOLEAN NOT NULL DEFAULT false,
  failure_bucket TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.search_query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own search query logs"
  ON public.search_query_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX search_query_logs_user_created_idx
  ON public.search_query_logs (user_id, created_at DESC);

CREATE INDEX search_query_logs_failure_bucket_idx
  ON public.search_query_logs (failure_bucket, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_search_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(_value, '')), '[[:space:]]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.search_chunk_text(
  _title text,
  _body text,
  _target_words integer DEFAULT 160,
  _overlap_words integer DEFAULT 32
)
RETURNS TABLE (
  chunk_number integer,
  chunk_text text
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  normalized_title text := nullif(btrim(coalesce(_title, '')), '');
  normalized_body text := public.normalize_search_text(_body);
  tokens text[];
  total_words integer;
  start_index integer := 1;
  end_index integer;
  current_chunk integer := 0;
  body_slice text;
BEGIN
  IF normalized_body = '' THEN
    chunk_number := 0;
    chunk_text := coalesce(normalized_title, '');
    RETURN NEXT;
    RETURN;
  END IF;

  tokens := regexp_split_to_array(normalized_body, '\s+');
  total_words := coalesce(array_length(tokens, 1), 0);

  IF total_words = 0 OR total_words <= greatest(_target_words, 1) THEN
    chunk_number := 0;
    chunk_text := trim(concat_ws(E'\n\n', normalized_title, normalized_body));
    RETURN NEXT;
    RETURN;
  END IF;

  WHILE start_index <= total_words LOOP
    end_index := least(total_words, start_index + greatest(_target_words, 1) - 1);
    body_slice := array_to_string(tokens[start_index:end_index], ' ');

    chunk_number := current_chunk;
    chunk_text := trim(concat_ws(E'\n\n', normalized_title, body_slice));
    RETURN NEXT;

    EXIT WHEN end_index = total_words;

    start_index := greatest(start_index + greatest(_target_words - _overlap_words, 1), start_index + 1);
    current_chunk := current_chunk + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_search_documents_for_entity(
  _entity_type text,
  _entity_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  DELETE FROM public.search_documents
  WHERE source_type = _entity_type
    AND source_id = _entity_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_search_documents_for_definition(
  _definition_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  definition_row record;
  inserted_count integer := 0;
  search_body text;
  search_description text;
  search_tags text[];
BEGIN
  DELETE FROM public.search_documents
  WHERE source_type = 'definition'
    AND source_id = _definition_id;

  SELECT
    d.id,
    d.title,
    d.description,
    d.content,
    d.example,
    d.ontology_id,
    d.created_by,
    d.status,
    d.priority,
    coalesce(d.tags, '{}'::text[]) AS tags,
    coalesce(d.view_count, 0) AS view_count,
    d.updated_at,
    d.version,
    o.title AS ontology_title
  INTO definition_row
  FROM public.definitions d
  LEFT JOIN public.ontologies o ON o.id = d.ontology_id
  WHERE d.id = _definition_id
    AND coalesce(d.is_deleted, false) = false;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  search_tags := coalesce(definition_row.tags, '{}'::text[]);
  search_description := coalesce(nullif(definition_row.description, ''), nullif(definition_row.content, ''), nullif(definition_row.example, ''), '');
  search_body := trim(concat_ws(
    E'\n\n',
    nullif(definition_row.description, ''),
    nullif(definition_row.content, ''),
    nullif(definition_row.example, ''),
    CASE
      WHEN definition_row.ontology_title IS NOT NULL AND definition_row.ontology_title <> '' THEN 'Ontology: ' || definition_row.ontology_title
      ELSE NULL
    END
  ));

  INSERT INTO public.search_documents (
    source_type,
    source_id,
    chunk_number,
    title,
    description,
    body,
    search_text,
    status,
    priority,
    tags,
    ontology_id,
    ontology_title,
    created_by,
    view_count,
    source_updated_at,
    content_hash,
    metadata
  )
  SELECT
    'definition',
    definition_row.id,
    chunk.chunk_number,
    definition_row.title,
    search_description,
    chunk.chunk_text,
    trim(concat_ws(E'\n\n', chunk.chunk_text, array_to_string(search_tags, ' '), coalesce(definition_row.ontology_title, ''))),
    definition_row.status,
    definition_row.priority,
    search_tags,
    definition_row.ontology_id,
    definition_row.ontology_title,
    definition_row.created_by,
    definition_row.view_count,
    definition_row.updated_at,
    md5(trim(concat_ws(E'\n\n', definition_row.title, search_description, chunk.chunk_text, array_to_string(search_tags, ' '), coalesce(definition_row.ontology_title, '')))),
    jsonb_build_object(
      'entityType', 'definition',
      'version', coalesce(definition_row.version, 1)
    )
  FROM public.search_chunk_text(definition_row.title, search_body) AS chunk;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_search_documents_for_ontology(
  _ontology_id uuid,
  _include_definitions boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ontology_row record;
  child_row record;
  child_titles text := '';
  inserted_count integer := 0;
  search_body text;
  search_tags text[];
BEGIN
  DELETE FROM public.search_documents
  WHERE source_type = 'ontology'
    AND source_id = _ontology_id;

  SELECT
    o.id,
    o.title,
    o.description,
    coalesce(o.tags, '{}'::text[]) AS tags,
    o.status,
    o.priority,
    o.created_by,
    coalesce(o.view_count, 0) AS view_count,
    o.updated_at
  INTO ontology_row
  FROM public.ontologies o
  WHERE o.id = _ontology_id;

  IF FOUND THEN
    SELECT string_agg(child.title, ' ' ORDER BY child.updated_at DESC)
    INTO child_titles
    FROM (
      SELECT d.title, d.updated_at
      FROM public.definitions d
      WHERE d.ontology_id = _ontology_id
        AND coalesce(d.is_deleted, false) = false
      ORDER BY d.updated_at DESC
      LIMIT 25
    ) AS child;

    search_tags := coalesce(ontology_row.tags, '{}'::text[]);
    search_body := trim(concat_ws(
      E'\n\n',
      nullif(ontology_row.description, ''),
      CASE
        WHEN child_titles IS NOT NULL AND child_titles <> '' THEN 'Definitions: ' || child_titles
        ELSE NULL
      END
    ));

    INSERT INTO public.search_documents (
      source_type,
      source_id,
      chunk_number,
      title,
      description,
      body,
      search_text,
      status,
      priority,
      tags,
      ontology_id,
      ontology_title,
      created_by,
      view_count,
      source_updated_at,
      content_hash,
      metadata
    )
    SELECT
      'ontology',
      ontology_row.id,
      chunk.chunk_number,
      ontology_row.title,
      coalesce(ontology_row.description, ''),
      chunk.chunk_text,
      trim(concat_ws(E'\n\n', chunk.chunk_text, array_to_string(search_tags, ' '))),
      ontology_row.status,
      ontology_row.priority,
      search_tags,
      ontology_row.id,
      ontology_row.title,
      ontology_row.created_by,
      ontology_row.view_count,
      ontology_row.updated_at,
      md5(trim(concat_ws(E'\n\n', ontology_row.title, ontology_row.description, chunk.chunk_text, array_to_string(search_tags, ' ')))),
      jsonb_build_object('entityType', 'ontology')
    FROM public.search_chunk_text(ontology_row.title, search_body) AS chunk;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
  END IF;

  IF _include_definitions THEN
    FOR child_row IN
      SELECT d.id
      FROM public.definitions d
      WHERE d.ontology_id = _ontology_id
        AND coalesce(d.is_deleted, false) = false
    LOOP
      PERFORM public.sync_search_documents_for_definition(child_row.id);
    END LOOP;
  END IF;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_search_documents_for_entity(
  _entity_type text,
  _entity_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF _entity_type = 'definition' THEN
    RETURN public.sync_search_documents_for_definition(_entity_id);
  ELSIF _entity_type = 'ontology' THEN
    RETURN public.sync_search_documents_for_ontology(_entity_id, true);
  END IF;

  RAISE EXCEPTION 'Unsupported search entity type: %', _entity_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_definition_search_document_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_search_documents_for_entity('definition', OLD.id);

    IF OLD.ontology_id IS NOT NULL THEN
      PERFORM public.sync_search_documents_for_ontology(OLD.ontology_id, false);
    END IF;

    RETURN OLD;
  END IF;

  IF coalesce(NEW.is_deleted, false) = true THEN
    PERFORM public.delete_search_documents_for_entity('definition', NEW.id);
  ELSE
    PERFORM public.sync_search_documents_for_definition(NEW.id);
  END IF;

  IF NEW.ontology_id IS NOT NULL THEN
    PERFORM public.sync_search_documents_for_ontology(NEW.ontology_id, false);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.ontology_id IS DISTINCT FROM NEW.ontology_id AND OLD.ontology_id IS NOT NULL THEN
    PERFORM public.sync_search_documents_for_ontology(OLD.ontology_id, false);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ontology_search_document_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.delete_search_documents_for_entity('ontology', OLD.id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_search_documents_for_ontology(
    NEW.id,
    TG_OP = 'INSERT' OR coalesce(OLD.title, '') IS DISTINCT FROM coalesce(NEW.title, '')
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_definition_search_documents_after_write
AFTER INSERT OR UPDATE OF title, description, content, example, ontology_id, status, priority, tags, is_deleted, created_by
ON public.definitions
FOR EACH ROW EXECUTE FUNCTION public.handle_definition_search_document_sync();

CREATE TRIGGER sync_definition_search_documents_after_delete
AFTER DELETE ON public.definitions
FOR EACH ROW EXECUTE FUNCTION public.handle_definition_search_document_sync();

CREATE TRIGGER sync_ontology_search_documents_after_write
AFTER INSERT OR UPDATE OF title, description, status, priority, tags, created_by
ON public.ontologies
FOR EACH ROW EXECUTE FUNCTION public.handle_ontology_search_document_sync();

CREATE TRIGGER sync_ontology_search_documents_after_delete
AFTER DELETE ON public.ontologies
FOR EACH ROW EXECUTE FUNCTION public.handle_ontology_search_document_sync();

CREATE OR REPLACE FUNCTION public.search_entities_hybrid(
  _query text,
  _filters jsonb DEFAULT '{}'::jsonb,
  _sort_by text DEFAULT 'relevance',
  _analysis jsonb DEFAULT '{}'::jsonb,
  _query_embedding text DEFAULT NULL,
  _candidate_limit integer DEFAULT 40
)
RETURNS TABLE (
  entity_id uuid,
  entity_type text,
  title text,
  description text,
  status text,
  updated_at timestamptz,
  view_count integer,
  tags text[],
  ontology_id uuid,
  ontology_title text,
  priority text,
  lexical_score double precision,
  dense_score double precision,
  fusion_score double precision,
  rerank_score double precision,
  match_text text,
  exact_title_match boolean,
  title_match boolean,
  token_coverage double precision,
  retrieval_confidence text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      public.normalize_search_text(_query) AS normalized_query,
      CASE
        WHEN public.normalize_search_text(_query) = '' THEN NULL
        ELSE websearch_to_tsquery('english', public.normalize_search_text(_query))
      END AS ts_query,
      CASE
        WHEN nullif(btrim(coalesce(_query_embedding, '')), '') IS NULL THEN NULL::vector(1536)
        ELSE _query_embedding::vector(1536)
      END AS query_embedding,
      CASE
        WHEN lower(coalesce(nullif(_sort_by, ''), 'relevance')) IN ('relevance', 'recent', 'views', 'title')
          THEN lower(coalesce(nullif(_sort_by, ''), 'relevance'))
        ELSE 'relevance'
      END AS sort_by,
      coalesce((_analysis ->> 'exactMatchSensitive')::boolean, false) AS exact_match_sensitive,
      coalesce(_filters ->> 'ontologyId', 'all') AS ontology_filter,
      coalesce(_filters ->> 'tag', 'all') AS tag_filter,
      coalesce(_filters ->> 'status', 'all') AS status_filter,
      coalesce(_filters ->> 'type', 'all') AS type_filter,
      coalesce(_filters ->> 'ownership', 'all') AS ownership_filter,
      CASE
        WHEN public.normalize_search_text(_query) = '' THEN ARRAY[]::text[]
        ELSE regexp_split_to_array(public.normalize_search_text(_query), '\s+')
      END AS query_terms,
      public.normalize_search_text(_query) <> '' AS has_query
  ),
  base_documents AS (
    SELECT d.*
    FROM public.search_documents d
    CROSS JOIN params p
    WHERE (p.type_filter = 'all' OR d.source_type = p.type_filter)
      AND (p.status_filter = 'all' OR d.status::text = p.status_filter)
      AND (p.ontology_filter = 'all' OR d.ontology_id = p.ontology_filter::uuid)
      AND (p.tag_filter = 'all' OR p.tag_filter = ANY(d.tags))
      AND (
        p.ownership_filter <> 'mine'
        OR (auth.uid() IS NOT NULL AND d.created_by = auth.uid())
      )
  ),
  browse_documents AS (
    SELECT DISTINCT ON (d.source_type, d.source_id)
      d.id AS document_id,
      d.source_id,
      d.source_type,
      d.title,
      d.description,
      d.status,
      d.priority,
      d.tags,
      d.ontology_id,
      d.ontology_title,
      d.view_count,
      d.source_updated_at,
      left(d.body, 320) AS match_text,
      false AS exact_title_match,
      false AS title_match,
      0::double precision AS lexical_score,
      0::double precision AS dense_score,
      0::double precision AS fusion_component
    FROM base_documents d
    CROSS JOIN params p
    WHERE p.has_query = false
    ORDER BY d.source_type, d.source_id, d.chunk_number
  ),
  lexical_candidates AS (
    SELECT
      d.id AS document_id,
      d.source_id,
      d.source_type,
      d.title,
      d.description,
      d.status,
      d.priority,
      d.tags,
      d.ontology_id,
      d.ontology_title,
      d.view_count,
      d.source_updated_at,
      left(d.body, 320) AS match_text,
      public.normalize_search_text(d.title) = p.normalized_query AS exact_title_match,
      public.normalize_search_text(d.title) LIKE '%' || p.normalized_query || '%' AS title_match,
      (
        (ts_rank_cd(d.fts_document, p.ts_query, 32) * 1.8)
        + greatest(similarity(d.title, p.normalized_query), 0)
        + (similarity(d.search_text, p.normalized_query) * 0.6)
      )::double precision AS lexical_score
    FROM base_documents d
    CROSS JOIN params p
    WHERE p.has_query = true
      AND (
        (p.ts_query IS NOT NULL AND d.fts_document @@ p.ts_query)
        OR similarity(d.title, p.normalized_query) >= 0.25
        OR similarity(d.search_text, p.normalized_query) >= 0.12
        OR public.normalize_search_text(d.title) = p.normalized_query
        OR public.normalize_search_text(d.title) LIKE p.normalized_query || '%'
      )
    ORDER BY
      public.normalize_search_text(d.title) = p.normalized_query DESC,
      public.normalize_search_text(d.title) LIKE p.normalized_query || '%' DESC,
      lexical_score DESC,
      d.source_updated_at DESC
    LIMIT greatest(_candidate_limit, 1) * 4
  ),
  lexical_ranked AS (
    SELECT
      candidate.*,
      row_number() OVER (
        ORDER BY
          candidate.exact_title_match DESC,
          candidate.title_match DESC,
          candidate.lexical_score DESC,
          candidate.source_updated_at DESC
      ) AS candidate_rank
    FROM lexical_candidates AS candidate
  ),
  dense_candidates AS (
    SELECT
      d.id AS document_id,
      d.source_id,
      d.source_type,
      d.title,
      d.description,
      d.status,
      d.priority,
      d.tags,
      d.ontology_id,
      d.ontology_title,
      d.view_count,
      d.source_updated_at,
      left(d.body, 320) AS match_text,
      false AS exact_title_match,
      false AS title_match,
      greatest(1 - (d.embedding <=> p.query_embedding), 0)::double precision AS dense_score
    FROM base_documents d
    CROSS JOIN params p
    WHERE p.has_query = true
      AND p.query_embedding IS NOT NULL
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> p.query_embedding ASC, d.source_updated_at DESC
    LIMIT greatest(_candidate_limit, 1) * 4
  ),
  dense_ranked AS (
    SELECT
      candidate.*,
      row_number() OVER (ORDER BY candidate.dense_score DESC, candidate.source_updated_at DESC) AS candidate_rank
    FROM dense_candidates AS candidate
  ),
  candidate_documents AS (
    SELECT
      document_id,
      source_id,
      source_type,
      title,
      description,
      status,
      priority,
      tags,
      ontology_id,
      ontology_title,
      view_count,
      source_updated_at,
      match_text,
      exact_title_match,
      title_match,
      lexical_score,
      0::double precision AS dense_score,
      (1.0 / (60 + candidate_rank))::double precision AS fusion_component
    FROM lexical_ranked

    UNION ALL

    SELECT
      document_id,
      source_id,
      source_type,
      title,
      description,
      status,
      priority,
      tags,
      ontology_id,
      ontology_title,
      view_count,
      source_updated_at,
      match_text,
      exact_title_match,
      title_match,
      0::double precision AS lexical_score,
      dense_score,
      (1.0 / (60 + candidate_rank))::double precision AS fusion_component
    FROM dense_ranked

    UNION ALL

    SELECT
      document_id,
      source_id,
      source_type,
      title,
      description,
      status,
      priority,
      tags,
      ontology_id,
      ontology_title,
      view_count,
      source_updated_at,
      match_text,
      exact_title_match,
      title_match,
      lexical_score,
      dense_score,
      fusion_component
    FROM browse_documents
  ),
  entity_candidates AS (
    SELECT
      source_id AS entity_id,
      source_type AS entity_type,
      (array_agg(title ORDER BY source_updated_at DESC, document_id DESC))[1] AS title,
      (array_agg(description ORDER BY source_updated_at DESC, document_id DESC))[1] AS description,
      ((array_agg(status ORDER BY source_updated_at DESC, document_id DESC) FILTER (WHERE status IS NOT NULL))[1])::text AS status,
      max(source_updated_at) AS updated_at,
      max(view_count) AS view_count,
      coalesce(
        array(
          select jsonb_array_elements_text(
            (array_agg(to_jsonb(tags) ORDER BY source_updated_at DESC, document_id DESC))[1]
          )
        ),
        array[]::text[]
      ) AS tags,
      (array_agg(ontology_id ORDER BY source_updated_at DESC, document_id DESC) FILTER (WHERE ontology_id IS NOT NULL))[1] AS ontology_id,
      (array_agg(ontology_title ORDER BY source_updated_at DESC, document_id DESC) FILTER (WHERE ontology_title IS NOT NULL))[1] AS ontology_title,
      ((array_agg(priority ORDER BY source_updated_at DESC, document_id DESC) FILTER (WHERE priority IS NOT NULL))[1])::text AS priority,
      max(lexical_score) AS lexical_score,
      max(dense_score) AS dense_score,
      sum(fusion_component) AS fusion_score,
      (array_agg(match_text ORDER BY exact_title_match DESC, title_match DESC, fusion_component DESC, dense_score DESC, lexical_score DESC))[1] AS match_text,
      bool_or(exact_title_match) AS exact_title_match,
      bool_or(title_match) AS title_match
    FROM candidate_documents
    GROUP BY source_id, source_type
  ),
  scored_entities AS (
    SELECT
      entity.*,
      coalesce((
        SELECT avg(
          CASE
            WHEN term = '' THEN 0
            WHEN position(term IN public.normalize_search_text(concat_ws(' ', entity.title, entity.description, entity.match_text, coalesce(entity.ontology_title, ''), array_to_string(entity.tags::text[], ' ')))) > 0 THEN 1
            ELSE 0
          END
        )
        FROM unnest(params.query_terms) AS term
      ), 0)::double precision AS token_coverage
    FROM entity_candidates AS entity
    CROSS JOIN params
  ),
  ranked_entities AS (
    SELECT
      entity.*,
      least(
        1.0,
        greatest(
          0.0,
          (CASE WHEN entity.exact_title_match THEN 0.55 WHEN entity.title_match THEN 0.25 ELSE 0 END)
          + least(0.2, coalesce(entity.fusion_score, 0) * 12)
          + least(0.12, greatest(coalesce(entity.lexical_score, 0), 0) * 0.18)
          + least(0.12, greatest(coalesce(entity.dense_score, 0), 0) * 0.12)
          + (coalesce(entity.token_coverage, 0) * 0.16)
          + (CASE WHEN params.exact_match_sensitive AND entity.exact_title_match = false AND entity.title_match = false THEN -0.08 ELSE 0 END)
          + (CASE WHEN params.has_query = false THEN 0.2 ELSE 0 END)
        )
      )::double precision AS rerank_score,
      CASE
        WHEN entity.exact_title_match
          OR least(
            1.0,
            greatest(
              0.0,
              (CASE WHEN entity.exact_title_match THEN 0.55 WHEN entity.title_match THEN 0.25 ELSE 0 END)
              + least(0.2, coalesce(entity.fusion_score, 0) * 12)
              + least(0.12, greatest(coalesce(entity.lexical_score, 0), 0) * 0.18)
              + least(0.12, greatest(coalesce(entity.dense_score, 0), 0) * 0.12)
              + (coalesce(entity.token_coverage, 0) * 0.16)
              + (CASE WHEN params.exact_match_sensitive AND entity.exact_title_match = false AND entity.title_match = false THEN -0.08 ELSE 0 END)
              + (CASE WHEN params.has_query = false THEN 0.2 ELSE 0 END)
            )
          ) >= 0.72
          THEN 'strong'
        WHEN coalesce(entity.fusion_score, 0) >= 0.02
          OR coalesce(entity.token_coverage, 0) >= 0.45
          OR coalesce(entity.dense_score, 0) >= 0.55
          THEN 'medium'
        ELSE 'weak'
      END AS retrieval_confidence
    FROM scored_entities AS entity
    CROSS JOIN params
  )
  SELECT
    entity_id,
    entity_type,
    title,
    coalesce(nullif(description, ''), coalesce(match_text, '')) AS description,
    status,
    updated_at,
    view_count,
    tags,
    ontology_id,
    ontology_title,
    priority,
    lexical_score,
    dense_score,
    fusion_score,
    rerank_score,
    match_text,
    exact_title_match,
    title_match,
    token_coverage,
    retrieval_confidence
  FROM ranked_entities
  CROSS JOIN params
  ORDER BY
    CASE
      WHEN params.sort_by = 'title' THEN title
      ELSE NULL
    END ASC NULLS LAST,
    CASE
      WHEN params.sort_by = 'views' THEN view_count
      ELSE NULL
    END DESC NULLS LAST,
    CASE
      WHEN params.sort_by = 'recent' OR (params.sort_by = 'relevance' AND params.has_query = false) THEN updated_at
      ELSE NULL
    END DESC NULLS LAST,
    CASE
      WHEN params.sort_by = 'relevance' AND params.has_query = true THEN rerank_score
      ELSE NULL
    END DESC NULLS LAST,
    CASE
      WHEN params.sort_by = 'relevance' AND params.has_query = true THEN updated_at
      ELSE NULL
    END DESC NULLS LAST,
    title ASC
  LIMIT greatest(_candidate_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.log_search_query(
  _query text,
  _filters jsonb DEFAULT '{}'::jsonb,
  _analysis jsonb DEFAULT '{}'::jsonb,
  _strategy text DEFAULT 'hybrid',
  _result_count integer DEFAULT 0,
  _top_results jsonb DEFAULT '[]'::jsonb,
  _stage_timings jsonb DEFAULT '{}'::jsonb,
  _weak_evidence boolean DEFAULT false,
  _failure_bucket text DEFAULT NULL,
  _fallback_used boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.search_query_logs (
    user_id,
    query,
    normalized_query,
    filters,
    analysis,
    strategy,
    result_count,
    top_results,
    stage_timings,
    weak_evidence,
    failure_bucket,
    fallback_used
  )
  VALUES (
    auth.uid(),
    coalesce(_query, ''),
    public.normalize_search_text(_query),
    coalesce(_filters, '{}'::jsonb),
    coalesce(_analysis, '{}'::jsonb),
    coalesce(nullif(_strategy, ''), 'hybrid'),
    greatest(coalesce(_result_count, 0), 0),
    coalesce(_top_results, '[]'::jsonb),
    coalesce(_stage_timings, '{}'::jsonb),
    coalesce(_weak_evidence, false),
    _failure_bucket,
    coalesce(_fallback_used, false)
  )
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_entities_hybrid(text, jsonb, text, jsonb, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_search_query(text, jsonb, jsonb, text, integer, jsonb, jsonb, boolean, text, boolean) TO authenticated;

DO $$
DECLARE
  ontology_record record;
  definition_record record;
BEGIN
  FOR ontology_record IN
    SELECT id
    FROM public.ontologies
  LOOP
    PERFORM public.sync_search_documents_for_ontology(ontology_record.id, false);
  END LOOP;

  FOR definition_record IN
    SELECT id
    FROM public.definitions
    WHERE coalesce(is_deleted, false) = false
  LOOP
    PERFORM public.sync_search_documents_for_definition(definition_record.id);
  END LOOP;
END;
$$;
