CREATE TABLE public.search_query_embeddings (
  cache_key text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.search_sessions(id) ON DELETE SET NULL,
  query_text text NOT NULL,
  context_hash text NOT NULL DEFAULT 'none',
  context_mode text NOT NULL DEFAULT 'concat' CHECK (context_mode IN ('none', 'concat', 'session')),
  context_summary text,
  embedding text,
  model text,
  debug_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  hit_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.search_query_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own query embedding cache entries"
  ON public.search_query_embeddings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_search_query_embeddings_updated_at
BEFORE UPDATE ON public.search_query_embeddings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX search_query_embeddings_user_updated_idx
  ON public.search_query_embeddings (user_id, updated_at DESC);

CREATE INDEX search_query_embeddings_expires_idx
  ON public.search_query_embeddings (expires_at ASC);
