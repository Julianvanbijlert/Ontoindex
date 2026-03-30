CREATE OR REPLACE FUNCTION public.search_entities_hybrid(
  _query text,
  _filters jsonb DEFAULT '{}'::jsonb,
  _sort_by text DEFAULT 'relevance',
  _analysis jsonb DEFAULT '{}'::jsonb,
  _query_embedding text DEFAULT NULL,
  _candidate_limit integer DEFAULT 40,
  _context_json jsonb DEFAULT '{}'::jsonb,
  _session_id uuid DEFAULT NULL
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
  context_boost_score double precision,
  applied_filters jsonb,
  applied_boosts jsonb,
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
  WITH raw_params AS (
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
      coalesce(_filters ->> 'ontologyId', 'all') AS ontology_filter_raw,
      coalesce(_filters ->> 'tag', 'all') AS tag_filter_raw,
      coalesce(_filters ->> 'status', 'all') AS status_filter_raw,
      coalesce(_filters ->> 'type', 'all') AS type_filter_raw,
      coalesce(_filters ->> 'ownership', 'all') AS ownership_filter_raw,
      CASE
        WHEN public.normalize_search_text(_query) = '' THEN ARRAY[]::text[]
        ELSE regexp_split_to_array(public.normalize_search_text(_query), '\s+')
      END AS query_terms,
      public.normalize_search_text(_query) <> '' AS has_query,
      coalesce(_context_json, '{}'::jsonb) AS context_json,
      coalesce(_analysis, '{}'::jsonb) AS analysis_json,
      coalesce(nullif(_context_json #>> '{retrievalPlan,contextUse}', ''), 'none') AS context_use,
      CASE
        WHEN coalesce(_context_json #>> '{scope,ontologyId}', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (_context_json #>> '{scope,ontologyId}')::uuid
        ELSE NULL::uuid
      END AS context_ontology_id,
      CASE
        WHEN coalesce(_context_json #>> '{scope,entityType}', '') IN ('definition', 'ontology')
          THEN _context_json #>> '{scope,entityType}'
        ELSE NULL
      END AS context_entity_type,
      NULLIF(public.normalize_search_text(_context_json #>> '{scope,tag}'), '') AS context_tag,
      coalesce((_context_json #>> '{user,preferences,contextualSearchOptIn}')::boolean, false) AS context_opt_in,
      coalesce(
        _session_id,
        CASE
          WHEN coalesce(_context_json #>> '{session,sessionId}', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (_context_json #>> '{session,sessionId}')::uuid
          ELSE NULL::uuid
        END
      ) AS context_session_id,
      auth.uid() AS current_user_id,
      greatest(coalesce(_candidate_limit, 40), 1) AS candidate_limit
  ),
  params AS (
    SELECT
      raw.*,
      CASE
        WHEN raw.ontology_filter_raw <> 'all'
          AND raw.ontology_filter_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN raw.ontology_filter_raw::uuid
        WHEN raw.context_use <> 'none' THEN raw.context_ontology_id
        ELSE NULL::uuid
      END AS effective_ontology_id,
      CASE
        WHEN raw.type_filter_raw <> 'all' THEN raw.type_filter_raw
        WHEN raw.context_use <> 'none' THEN raw.context_entity_type
        ELSE NULL
      END AS effective_type_filter,
      CASE
        WHEN raw.tag_filter_raw <> 'all' THEN raw.tag_filter_raw
        WHEN raw.context_use <> 'none' THEN raw.context_tag
        ELSE NULL
      END AS effective_tag_filter,
      CASE
        WHEN raw.context_use = 'full'
          AND raw.context_opt_in
          AND raw.current_user_id IS NOT NULL
          AND raw.ownership_filter_raw <> 'mine'
          THEN true
        ELSE false
      END AS allow_author_boost,
      CASE
        WHEN raw.ontology_filter_raw <> 'all' THEN 'ui:ontology_filter'
        WHEN raw.context_use <> 'none' AND raw.context_ontology_id IS NOT NULL THEN 'context:ontology_scope'
        ELSE NULL
      END AS ontology_filter_reason,
      CASE
        WHEN raw.type_filter_raw <> 'all' THEN 'ui:type_filter'
        WHEN raw.context_use <> 'none' AND raw.context_entity_type IS NOT NULL THEN 'context:entity_type_scope'
        ELSE NULL
      END AS type_filter_reason,
      CASE
        WHEN raw.tag_filter_raw <> 'all' THEN 'ui:tag_filter'
        WHEN raw.context_use <> 'none' AND raw.context_tag IS NOT NULL THEN 'context:tag_scope'
        ELSE NULL
      END AS tag_filter_reason,
      CASE
        WHEN raw.ownership_filter_raw = 'mine' THEN 'ui:ownership_mine'
        ELSE NULL
      END AS ownership_filter_reason
    FROM raw_params raw
  ),
  query_variants_raw AS (
    SELECT 1 AS variant_priority, 'original'::text AS variant_source, params.normalized_query AS variant_query
    FROM params

    UNION ALL

    SELECT
      10 + row_number() OVER () AS variant_priority,
      CASE
        WHEN coalesce(variant ->> 'source', '') IN ('synonym_graph', 'query_subset', 'heuristic_rewrite')
          THEN variant ->> 'source'
        ELSE 'heuristic_rewrite'
      END AS variant_source,
      public.normalize_search_text(term.value) AS variant_query
    FROM params
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(params.analysis_json #> '{retrievalVariants,similaritySignals}', '[]'::jsonb)) AS variant
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(variant -> 'expandedTerms', '[]'::jsonb)) AS term(value)

    UNION ALL

    SELECT
      20 + row_number() OVER () AS variant_priority,
      CASE
        WHEN value.value = params.normalized_query THEN 'original'
        ELSE 'heuristic_rewrite'
      END AS variant_source,
      public.normalize_search_text(value.value) AS variant_query
    FROM params
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(params.analysis_json #> '{retrievalVariants,queryVariants}', '[]'::jsonb)) AS value(value)
  ),
  query_variants AS (
    SELECT
      row_number() OVER (ORDER BY variant_priority ASC, length(variant_query) DESC, variant_query ASC) AS variant_rank,
      variant_source,
      variant_query,
      CASE
        WHEN variant_query = '' THEN NULL
        ELSE websearch_to_tsquery('english', variant_query)
      END AS ts_query,
      CASE
        WHEN cardinality(variant_terms) = 0 THEN NULL
        ELSE to_tsquery('english', array_to_string(
          ARRAY(
            SELECT term
            FROM unnest(variant_terms) AS term
          ),
          ' | '
        ))
      END AS or_ts_query,
      CASE
        WHEN cardinality(variant_terms) = 0 THEN NULL
        ELSE to_tsquery('english', array_to_string(
          ARRAY(
            SELECT term || ':*'
            FROM unnest(variant_terms) AS term
          ),
          ' | '
        ))
      END AS prefix_ts_query,
      variant_terms
    FROM (
      SELECT DISTINCT ON (variant_query)
        variant_priority,
        variant_source,
        variant_query,
        COALESCE(
          ARRAY(
            SELECT DISTINCT term
            FROM unnest(regexp_split_to_array(regexp_replace(variant_query, '[^a-z0-9_\\s]+', ' ', 'g'), '\s+')) AS term
            WHERE length(term) >= 2
          ),
          ARRAY[]::text[]
        ) AS variant_terms
      FROM query_variants_raw
      WHERE variant_query <> ''
      ORDER BY variant_query, variant_priority ASC
    ) deduped
  ),
  base_documents AS (
    SELECT d.*
    FROM public.search_documents d
    CROSS JOIN params p
    WHERE (p.status_filter_raw = 'all' OR d.status::text = p.status_filter_raw)
      AND (p.effective_type_filter IS NULL OR d.source_type = p.effective_type_filter)
      AND (
        p.effective_ontology_id IS NULL
        OR d.ontology_id = p.effective_ontology_id
        OR (d.source_type = 'ontology' AND d.source_id = p.effective_ontology_id)
      )
      AND (
        p.effective_tag_filter IS NULL
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(d.tags, ARRAY[]::text[])) AS tag
          WHERE public.normalize_search_text(tag) = public.normalize_search_text(p.effective_tag_filter)
        )
      )
      AND (
        p.ownership_filter_raw <> 'mine'
        OR (p.current_user_id IS NOT NULL AND d.created_by = p.current_user_id)
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
      d.created_by,
      d.view_count,
      d.source_updated_at,
      left(d.body, 320) AS match_text,
      false AS exact_title_match,
      false AS title_match,
      0::double precision AS lexical_score,
      0::double precision AS dense_score,
      0::double precision AS fusion_component,
      NULL::text AS variant_source
    FROM base_documents d
    CROSS JOIN params p
    WHERE p.has_query = false
    ORDER BY d.source_type, d.source_id, d.chunk_number
  ),
  lexical_variant_matches AS (
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
      d.created_by,
      d.view_count,
      d.source_updated_at,
      left(d.body, 320) AS match_text,
      CASE
        WHEN qv.variant_rank = 1 THEN public.normalize_search_text(d.title) = qv.variant_query
        ELSE false
      END AS exact_title_match,
      CASE
        WHEN qv.variant_rank = 1 THEN public.normalize_search_text(d.title) LIKE '%' || qv.variant_query || '%'
        ELSE false
      END AS title_match,
      qv.variant_source,
      (
        (coalesce(ts_rank_cd(d.fts_document, qv.ts_query, 32), 0) * 1.3)
        + (coalesce(ts_rank_cd(d.fts_document, qv.or_ts_query, 32), 0) * 0.95)
        + (coalesce(ts_rank_cd(d.fts_document, qv.prefix_ts_query, 32), 0) * 0.7)
        + (greatest(
            similarity(public.normalize_search_text(d.title), qv.variant_query),
            word_similarity(public.normalize_search_text(d.title), qv.variant_query),
            0
          ) * 1.25)
        + (greatest(
            similarity(d.search_text, qv.variant_query),
            word_similarity(d.search_text, qv.variant_query),
            0
          ) * 0.7)
        + (CASE WHEN public.normalize_search_text(d.title) LIKE qv.variant_query || '%' THEN 0.18 ELSE 0 END)
        + (CASE WHEN public.normalize_search_text(d.title) LIKE '%' || qv.variant_query || '%' THEN 0.08 ELSE 0 END)
        + (
          coalesce((
            SELECT avg(
              CASE
                WHEN term = '' THEN 0
                WHEN position(term IN public.normalize_search_text(concat_ws(' ', d.title, d.description, d.body, coalesce(d.ontology_title, ''), array_to_string(d.tags, ' ')))) > 0 THEN 1
                ELSE 0
              END
            )
            FROM unnest(qv.variant_terms) AS term
          ), 0) * 0.34
        )
        - least(0.12, greatest(qv.variant_rank - 1, 0) * 0.04)
      )::double precision AS lexical_score
    FROM base_documents d
    CROSS JOIN params p
    JOIN query_variants qv ON p.has_query = true
    WHERE (
      (qv.ts_query IS NOT NULL AND d.fts_document @@ qv.ts_query)
      OR (qv.or_ts_query IS NOT NULL AND d.fts_document @@ qv.or_ts_query)
      OR (qv.prefix_ts_query IS NOT NULL AND d.fts_document @@ qv.prefix_ts_query)
      OR similarity(public.normalize_search_text(d.title), qv.variant_query) >= 0.2
      OR word_similarity(public.normalize_search_text(d.title), qv.variant_query) >= 0.35
      OR similarity(d.search_text, qv.variant_query) >= 0.08
      OR word_similarity(d.search_text, qv.variant_query) >= 0.18
      OR public.normalize_search_text(d.title) = qv.variant_query
      OR public.normalize_search_text(d.title) LIKE qv.variant_query || '%'
      OR public.normalize_search_text(d.title) LIKE '%' || qv.variant_query || '%'
    )
  ),
  lexical_candidates AS (
    SELECT DISTINCT ON (candidate.document_id)
      candidate.document_id,
      candidate.source_id,
      candidate.source_type,
      candidate.title,
      candidate.description,
      candidate.status,
      candidate.priority,
      candidate.tags,
      candidate.ontology_id,
      candidate.ontology_title,
      candidate.created_by,
      candidate.view_count,
      candidate.source_updated_at,
      candidate.match_text,
      candidate.exact_title_match,
      candidate.title_match,
      candidate.variant_source,
      candidate.lexical_score
    FROM lexical_variant_matches candidate
    ORDER BY
      candidate.document_id,
      candidate.exact_title_match DESC,
      candidate.title_match DESC,
      candidate.lexical_score DESC,
      candidate.source_updated_at DESC
    LIMIT (SELECT candidate_limit FROM params) * 6
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
      d.created_by,
      d.view_count,
      d.source_updated_at,
      left(d.body, 320) AS match_text,
      false AS exact_title_match,
      false AS title_match,
      NULL::text AS variant_source,
      greatest(1 - (d.embedding <=> p.query_embedding), 0)::double precision AS dense_score
    FROM base_documents d
    CROSS JOIN params p
    WHERE p.has_query = true
      AND p.query_embedding IS NOT NULL
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> p.query_embedding ASC, d.source_updated_at DESC
    LIMIT (SELECT candidate_limit FROM params) * 6
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
      created_by,
      view_count,
      source_updated_at,
      match_text,
      exact_title_match,
      title_match,
      lexical_score,
      0::double precision AS dense_score,
      (1.0 / (50 + candidate_rank))::double precision AS fusion_component,
      variant_source
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
      created_by,
      view_count,
      source_updated_at,
      match_text,
      exact_title_match,
      title_match,
      0::double precision AS lexical_score,
      dense_score,
      (1.0 / (50 + candidate_rank))::double precision AS fusion_component,
      variant_source
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
      created_by,
      view_count,
      source_updated_at,
      match_text,
      exact_title_match,
      title_match,
      lexical_score,
      dense_score,
      fusion_component,
      variant_source
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
      (array_agg(created_by ORDER BY source_updated_at DESC, document_id DESC) FILTER (WHERE created_by IS NOT NULL))[1] AS created_by,
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
      (array_agg(match_text ORDER BY exact_title_match DESC, title_match DESC, lexical_score DESC, dense_score DESC, fusion_component DESC))[1] AS match_text,
      bool_or(exact_title_match) AS exact_title_match,
      bool_or(title_match) AS title_match,
      (array_agg(variant_source ORDER BY lexical_score DESC NULLS LAST, dense_score DESC NULLS LAST, fusion_component DESC NULLS LAST))[1] AS best_variant_source
    FROM candidate_documents
    GROUP BY source_id, source_type
  ),
  recent_activity AS (
    SELECT
      event.entity_id,
      event.entity_type,
      least(0.12::double precision, sum(event.event_weight)) AS recent_activity_boost
    FROM (
      SELECT
        sse.entity_id,
        sse.entity_type,
        (
          CASE sse.event_type
            WHEN 'click' THEN 0.05
            WHEN 'save' THEN 0.06
            WHEN 'like' THEN 0.06
            WHEN 'comment' THEN 0.04
            WHEN 'review_assign' THEN 0.04
            ELSE 0.03
          END
          * greatest(0.35, exp(-extract(epoch FROM (now() - sse.created_at)) / 1209600.0))
        )::double precision AS event_weight
      FROM public.search_session_events sse
      CROSS JOIN params p
      WHERE p.context_use <> 'none'
        AND p.context_opt_in
        AND sse.entity_id IS NOT NULL
        AND sse.entity_type IN ('definition', 'ontology')
        AND sse.created_at >= now() - interval '30 days'
        AND (
          (p.context_session_id IS NOT NULL AND sse.session_id = p.context_session_id)
          OR (p.current_user_id IS NOT NULL AND sse.user_id = p.current_user_id)
        )

      UNION ALL

      SELECT
        ae.entity_id,
        ae.entity_type,
        (
          CASE coalesce(nullif(ae.event_type, ''), public.normalize_search_text(ae.action))
            WHEN 'click' THEN 0.04
            WHEN 'save' THEN 0.05
            WHEN 'like' THEN 0.05
            WHEN 'comment' THEN 0.03
            WHEN 'review_assign' THEN 0.03
            ELSE 0.02
          END
          * greatest(0.35, exp(-extract(epoch FROM (now() - ae.created_at)) / 1209600.0))
        )::double precision AS event_weight
      FROM public.activity_events ae
      CROSS JOIN params p
      WHERE p.context_use <> 'none'
        AND p.context_opt_in
        AND ae.entity_id IS NOT NULL
        AND ae.entity_type IN ('definition', 'ontology')
        AND ae.created_at >= now() - interval '30 days'
        AND (
          (p.context_session_id IS NOT NULL AND ae.session_id = p.context_session_id)
          OR (p.current_user_id IS NOT NULL AND ae.user_id = p.current_user_id)
        )
    ) AS event
    GROUP BY event.entity_id, event.entity_type
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
  base_ranked_entities AS (
    SELECT
      entity.*,
      least(
        1.0,
        greatest(
          0.0,
          (CASE WHEN entity.exact_title_match THEN 0.56 WHEN entity.title_match THEN 0.26 ELSE 0 END)
          + least(0.22, coalesce(entity.fusion_score, 0) * 11)
          + least(0.16, greatest(coalesce(entity.lexical_score, 0), 0) * 0.2)
          + least(0.16, greatest(coalesce(entity.dense_score, 0), 0) * 0.14)
          + (coalesce(entity.token_coverage, 0) * 0.14)
          + (CASE
              WHEN entity.best_variant_source = 'synonym_graph' THEN 0.04
              WHEN entity.best_variant_source = 'query_subset' THEN 0.03
              WHEN entity.best_variant_source = 'heuristic_rewrite' THEN 0.02
              ELSE 0
            END)
          + (CASE WHEN params.exact_match_sensitive AND entity.exact_title_match = false AND entity.title_match = false THEN -0.08 ELSE 0 END)
          + (CASE WHEN params.has_query = false THEN 0.2 ELSE 0 END)
        )
      )::double precision AS base_rerank_score
    FROM scored_entities AS entity
    CROSS JOIN params
  ),
  contextualized_entities AS (
    SELECT
      entity.*,
      coalesce(activity.recent_activity_boost, 0)::double precision AS recent_activity_boost,
      CASE
        WHEN params.context_use <> 'none'
          AND params.context_ontology_id IS NOT NULL
          AND (
            (entity.entity_type = 'ontology' AND entity.entity_id = params.context_ontology_id)
            OR entity.ontology_id = params.context_ontology_id
          )
          THEN 0.05::double precision
        ELSE 0::double precision
      END AS ontology_scope_boost,
      CASE
        WHEN params.allow_author_boost
          AND entity.created_by = params.current_user_id
          THEN 0.04::double precision
        ELSE 0::double precision
      END AS author_boost,
      to_jsonb(array_remove(ARRAY[
        params.ontology_filter_reason,
        params.type_filter_reason,
        params.tag_filter_reason,
        params.ownership_filter_reason
      ]::text[], NULL)) AS applied_filters
    FROM base_ranked_entities AS entity
    CROSS JOIN params
    LEFT JOIN recent_activity AS activity
      ON activity.entity_id = entity.entity_id
     AND activity.entity_type = entity.entity_type
  ),
  ranked_entities AS (
    SELECT
      entity.*,
      least(
        0.18,
        coalesce(entity.recent_activity_boost, 0)
        + coalesce(entity.ontology_scope_boost, 0)
        + coalesce(entity.author_boost, 0)
      )::double precision AS context_boost_score,
      to_jsonb(array_remove(ARRAY[
        CASE WHEN coalesce(entity.recent_activity_boost, 0) > 0 THEN 'context:recent_session_activity' END,
        CASE WHEN coalesce(entity.ontology_scope_boost, 0) > 0 THEN 'context:ontology_scope' END,
        CASE WHEN coalesce(entity.author_boost, 0) > 0 THEN 'context:authored_by_user' END,
        CASE WHEN entity.best_variant_source = 'synonym_graph' THEN 'similarity:synonym_graph' END,
        CASE WHEN entity.best_variant_source = 'query_subset' THEN 'similarity:subset_query' END,
        CASE WHEN entity.best_variant_source = 'heuristic_rewrite' THEN 'rewrite:heuristic_variant' END
      ]::text[], NULL)) AS applied_boosts
    FROM contextualized_entities AS entity
  ),
  final_entities AS (
    SELECT
      entity.*,
      least(
        1.0,
        greatest(0.0, entity.base_rerank_score + entity.context_boost_score)
      )::double precision AS rerank_score,
      CASE
        WHEN entity.exact_title_match
          OR least(
            1.0,
            greatest(0.0, entity.base_rerank_score + entity.context_boost_score)
          ) >= 0.72
          THEN 'strong'
        WHEN coalesce(entity.fusion_score, 0) >= 0.02
          OR coalesce(entity.token_coverage, 0) >= 0.35
          OR coalesce(entity.dense_score, 0) >= 0.48
          OR entity.context_boost_score >= 0.08
          THEN 'medium'
        ELSE 'weak'
      END AS retrieval_confidence
    FROM ranked_entities AS entity
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
    context_boost_score,
    applied_filters,
    applied_boosts,
    match_text,
    exact_title_match,
    title_match,
    token_coverage,
    retrieval_confidence
  FROM final_entities
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
  LIMIT (SELECT candidate_limit FROM params);
$$;
