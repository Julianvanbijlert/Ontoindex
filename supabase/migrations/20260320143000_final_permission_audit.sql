DROP POLICY IF EXISTS "Editors can create ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Editors can update own ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Admins can delete ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Editors and admins can create ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Editors and admins can update ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Editors and admins can delete ontologies" ON public.ontologies;

CREATE POLICY "Editors and admins can create ontologies"
ON public.ontologies
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Editors and admins can update ontologies"
ON public.ontologies
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can delete ontologies"
ON public.ontologies
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Editors can create definitions" ON public.definitions;
DROP POLICY IF EXISTS "Editors can update definitions" ON public.definitions;
DROP POLICY IF EXISTS "Admins can delete definitions" ON public.definitions;
DROP POLICY IF EXISTS "Editors and admins can create definitions" ON public.definitions;
DROP POLICY IF EXISTS "Editors and admins can update definitions" ON public.definitions;
DROP POLICY IF EXISTS "Editors and admins can delete definitions" ON public.definitions;

CREATE POLICY "Editors and admins can create definitions"
ON public.definitions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Editors and admins can update definitions"
ON public.definitions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can delete definitions"
ON public.definitions
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Editors can insert relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors can update relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors can delete relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors and admins can insert relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors and admins can update relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors and admins can delete relationships" ON public.relationships;

CREATE POLICY "Editors and admins can insert relationships"
ON public.relationships
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Editors and admins can update relationships"
ON public.relationships
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Editors and admins can delete relationships"
ON public.relationships
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'editor')
  OR public.has_role(auth.uid(), 'admin')
);
