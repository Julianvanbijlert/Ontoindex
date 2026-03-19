DROP POLICY IF EXISTS "Editors can create ontologies" ON public.ontologies;
DROP POLICY IF EXISTS "Editors can update own ontologies" ON public.ontologies;
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
CREATE POLICY "Editors and admins can update own ontologies"
ON public.ontologies
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = created_by AND public.has_role(auth.uid(), 'editor'))
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Definitions viewable by authenticated" ON public.definitions;
DROP POLICY IF EXISTS "Editors can create definitions" ON public.definitions;
DROP POLICY IF EXISTS "Editors can update definitions" ON public.definitions;
CREATE POLICY "Definitions viewable by authenticated"
ON public.definitions
FOR SELECT
TO authenticated
USING (is_deleted = false);
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
  (auth.uid() = created_by AND public.has_role(auth.uid(), 'editor'))
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Editors can insert relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors can update relationships" ON public.relationships;
DROP POLICY IF EXISTS "Editors can delete relationships" ON public.relationships;
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
  (auth.uid() = created_by AND public.has_role(auth.uid(), 'editor'))
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Editors and admins can delete relationships"
ON public.relationships
FOR DELETE
TO authenticated
USING (
  (auth.uid() = created_by AND public.has_role(auth.uid(), 'editor'))
  OR public.has_role(auth.uid(), 'admin')
);

CREATE OR REPLACE FUNCTION public.update_my_role(_target_role public.app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _target_role NOT IN ('viewer', 'editor', 'admin') THEN
    RAISE EXCEPTION 'Unsupported role selection';
  END IF;

  IF _target_role = 'admin' AND NOT public.has_role(current_user_id, 'admin') THEN
    RAISE EXCEPTION 'Only existing admins can assign the admin role to themselves';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = current_user_id
    AND role IN ('viewer', 'editor', 'admin');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (current_user_id, _target_role);

  RETURN jsonb_build_object('role', _target_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_role(public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_definition_owner_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  definition_owner uuid;
  definition_title text;
BEGIN
  SELECT created_by, title
  INTO definition_owner, definition_title
  FROM public.definitions
  WHERE id = NEW.definition_id;

  IF definition_owner IS NOT NULL AND definition_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
      definition_owner,
      'comment',
      'New comment on your definition',
      format('"%s" received a new comment.', coalesce(definition_title, 'A definition')),
      format('/definitions/%s', NEW.definition_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_definition_owner_on_comment ON public.comments;
CREATE TRIGGER notify_definition_owner_on_comment
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_definition_owner_on_comment();

CREATE OR REPLACE FUNCTION public.notify_definition_favoriters_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF ROW(
    NEW.title,
    NEW.description,
    NEW.content,
    NEW.example,
    NEW.status,
    NEW.priority,
    NEW.tags,
    NEW.version
  ) IS NOT DISTINCT FROM ROW(
    OLD.title,
    OLD.description,
    OLD.content,
    OLD.example,
    OLD.status,
    OLD.priority,
    OLD.tags,
    OLD.version
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link)
  SELECT
    favorites.user_id,
    'update',
    'Definition you liked was updated',
    format('"%s" was updated.', NEW.title),
    format('/definitions/%s', NEW.id)
  FROM public.favorites AS favorites
  WHERE favorites.definition_id = NEW.id
    AND favorites.user_id IS DISTINCT FROM actor_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_definition_favoriters_on_update ON public.definitions;
CREATE TRIGGER notify_definition_favoriters_on_update
AFTER UPDATE ON public.definitions
FOR EACH ROW
EXECUTE FUNCTION public.notify_definition_favoriters_on_update();
