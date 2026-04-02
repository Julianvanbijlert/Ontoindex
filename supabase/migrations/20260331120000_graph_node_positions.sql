CREATE TABLE IF NOT EXISTS public.graph_node_positions (
  graph_key TEXT NOT NULL,
  node_id TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (graph_key, node_id)
);

ALTER TABLE public.graph_node_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Graph node positions viewable by authenticated" ON public.graph_node_positions;
CREATE POLICY "Graph node positions viewable by authenticated"
ON public.graph_node_positions
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Editors and admins can manage graph node positions" ON public.graph_node_positions;
CREATE POLICY "Editors and admins can manage graph node positions"
ON public.graph_node_positions
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

DROP TRIGGER IF EXISTS update_graph_node_positions_updated_at ON public.graph_node_positions;
CREATE TRIGGER update_graph_node_positions_updated_at
BEFORE UPDATE ON public.graph_node_positions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_graph_node_positions_graph_key
ON public.graph_node_positions (graph_key);
