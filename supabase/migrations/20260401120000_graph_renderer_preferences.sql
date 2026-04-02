CREATE TABLE IF NOT EXISTS public.graph_renderer_preferences (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  renderer_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope),
  CONSTRAINT graph_renderer_preferences_scope_check CHECK (scope = 'interactive'),
  CONSTRAINT graph_renderer_preferences_renderer_id_check CHECK (renderer_id IN ('react-flow', 'cytoscape'))
);

ALTER TABLE public.graph_renderer_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their graph renderer preferences" ON public.graph_renderer_preferences;
CREATE POLICY "Users can view their graph renderer preferences"
ON public.graph_renderer_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their graph renderer preferences" ON public.graph_renderer_preferences;
CREATE POLICY "Users can manage their graph renderer preferences"
ON public.graph_renderer_preferences
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_graph_renderer_preferences_updated_at ON public.graph_renderer_preferences;
CREATE TRIGGER update_graph_renderer_preferences_updated_at
BEFORE UPDATE ON public.graph_renderer_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_graph_renderer_preferences_user_id
ON public.graph_renderer_preferences (user_id);
