
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own chat sessions"
  ON public.chat_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own chat sessions"
  ON public.chat_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own chat sessions"
  ON public.chat_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own chat sessions"
  ON public.chat_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages chat sessions"
  ON public.chat_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX chat_sessions_user_last_active_idx
  ON public.chat_sessions (user_id, last_active_at DESC);

CREATE INDEX chat_sessions_created_at_idx
  ON public.chat_sessions (created_at DESC);

CREATE INDEX chat_sessions_settings_idx
  ON public.chat_sessions USING gin(settings);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_call JSONB,
  retrieval_reference JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_role_check CHECK (role IN ('system', 'user', 'assistant', 'tool'))
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own chat messages"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own chat messages"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own chat messages"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own chat messages"
  ON public.chat_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages chat messages"
  ON public.chat_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX chat_messages_session_created_idx
  ON public.chat_messages (session_id, created_at ASC);

CREATE INDEX chat_messages_role_created_idx
  ON public.chat_messages (role, created_at DESC);

CREATE INDEX chat_messages_metadata_idx
  ON public.chat_messages USING gin(metadata);

CREATE TABLE public.chat_context_summaries (
  session_id UUID PRIMARY KEY REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  rolling_summary TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_context_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own chat summaries"
  ON public.chat_context_summaries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own chat summaries"
  ON public.chat_context_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own chat summaries"
  ON public.chat_context_summaries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own chat summaries"
  ON public.chat_context_summaries
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_sessions
      WHERE chat_sessions.id = session_id
        AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages chat summaries"
  ON public.chat_context_summaries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX chat_context_summaries_updated_idx
  ON public.chat_context_summaries (updated_at DESC);

CREATE TABLE public.chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  assistant_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  user_message_text TEXT NOT NULL DEFAULT '',
  retrieval_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  expansions_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  stage_latencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_name TEXT,
  model_name TEXT,
  grounding_status TEXT NOT NULL DEFAULT 'unknown',
  citation_count INTEGER NOT NULL DEFAULT 0,
  invalid_citation_count INTEGER NOT NULL DEFAULT 0,
  refusal BOOLEAN NOT NULL DEFAULT false,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own chat logs"
  ON public.chat_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own chat logs"
  ON public.chat_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own chat logs"
  ON public.chat_logs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own chat logs"
  ON public.chat_logs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages chat logs"
  ON public.chat_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX chat_logs_session_created_idx
  ON public.chat_logs (session_id, created_at DESC);

CREATE INDEX chat_logs_user_created_idx
  ON public.chat_logs (user_id, created_at DESC);

CREATE INDEX chat_logs_metadata_idx
  ON public.chat_logs USING gin(metadata);

CREATE OR REPLACE FUNCTION public.touch_chat_session_last_active()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_sessions
  SET last_active_at = now()
  WHERE id = NEW.session_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_chat_context_summary_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_chat_session_last_active ON public.chat_messages;
CREATE TRIGGER touch_chat_session_last_active
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_chat_session_last_active();

DROP TRIGGER IF EXISTS touch_chat_context_summary_updated_at ON public.chat_context_summaries;
CREATE TRIGGER touch_chat_context_summary_updated_at
BEFORE UPDATE ON public.chat_context_summaries
FOR EACH ROW EXECUTE FUNCTION public.touch_chat_context_summary_updated_at();
