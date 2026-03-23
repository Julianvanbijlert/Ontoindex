# Notification Inbox

The notification inbox is database-driven so notification creation stays consistent across the app's existing Supabase-triggered workflows.

Core pieces:
- `public.notifications`: persisted inbox records with actor, entity, parent context, read state, metadata, and dedupe keys.
- `public.notification_type_catalog`: stable notification type registry with category and defaults.
- `public.notification_preferences`: per-user overrides for each notification type.
- Inbox RPCs: `fetch_my_notifications`, `fetch_my_notification_unread_count`, `set_my_notification_read_state`, `mark_all_my_notifications_read`, `fetch_my_notification_preferences`, `set_my_notification_preference`.

Generation rules:
- History change notifications fan out from `activity_events` inserts.
- Comment reply and comment resolution notifications come from `comments` triggers.
- Review assignment notifications come from `approval_request_assignments` inserts.
- Review incorporation notifications come from `approval_requests.status` transitions to `approved`.

Extension points:
- Add a new notification type in `notification_type_catalog`.
- Add a trigger or workflow hook that calls `public.create_notification(...)`.
- Add frontend display metadata in `src/lib/notification-service.ts`.
