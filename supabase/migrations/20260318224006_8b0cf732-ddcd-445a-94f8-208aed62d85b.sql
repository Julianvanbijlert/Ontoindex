
-- Fix overly permissive policies
-- Categories: restrict insert/update to editors and admins
DROP POLICY "Editors can insert categories" ON public.categories;
DROP POLICY "Editors can update categories" ON public.categories;
CREATE POLICY "Editors can insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));
CREATE POLICY "Editors can update categories" ON public.categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));

-- Relationships: restrict insert to editors
DROP POLICY "Editors can insert relationships" ON public.relationships;
CREATE POLICY "Editors can insert relationships" ON public.relationships FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- Version history: restrict insert
DROP POLICY "System can insert versions" ON public.version_history;
CREATE POLICY "Users can insert versions" ON public.version_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = changed_by);

-- Activity events: keep permissive insert since all users log activity but restrict to own
DROP POLICY "System can log activity" ON public.activity_events;
CREATE POLICY "Users can log own activity" ON public.activity_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Notifications: restrict insert to own notifications or system
DROP POLICY "System can create notifications" ON public.notifications;
CREATE POLICY "Users can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
