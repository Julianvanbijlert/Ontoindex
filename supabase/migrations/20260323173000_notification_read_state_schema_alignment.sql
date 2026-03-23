-- Repair notification read-state schema drift.
-- The inbox expects both is_read and read_at to exist on public.notifications.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  ALTER COLUMN is_read SET DEFAULT false;

UPDATE public.notifications
SET
  is_read = COALESCE(is_read, false),
  read_at = CASE
    WHEN COALESCE(is_read, false) THEN COALESCE(read_at, created_at)
    ELSE NULL
  END;

ALTER TABLE public.notifications
  ALTER COLUMN is_read SET NOT NULL;

COMMENT ON COLUMN public.notifications.is_read IS
  'Persisted read state for notification inbox items.';

COMMENT ON COLUMN public.notifications.read_at IS
  'Timestamp when the notification was marked as read; null while unread.';

NOTIFY pgrst, 'reload schema';
