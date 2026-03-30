# Chat Admin Settings

## Overview

Chat provider settings and chat runtime defaults are now stored in the database instead of living only in environment variables.

- Non-secret chat settings live in `public.app_settings`
- Secret chat provider credentials live in `public.app_setting_secrets`
- Admins manage both through the Settings page
- Normal users only receive the safe runtime subset through `public.get_chat_runtime_settings()`

## Admin-managed settings

Provider settings:

- `llmProvider`
- `llmModel`
- `llmBaseUrl`
- `llmTemperature`
- `llmMaxTokens`
- `LLM_API_KEY` replacement/clear flow

Runtime defaults:

- similarity expansion
- strict citations default
- history limit
- evidence limit
- runtime temperature
- runtime max tokens

## Runtime resolution order

The `chat-complete` Edge Function resolves chat generation config in this order:

1. database-backed admin settings
2. database-backed secret API key
3. environment fallback

If the admin settings tables are not available yet, the function falls back to env/defaults and logs a warning.

## Troubleshooting

### "Unable to load chat sessions."

This now usually means the chat tables are missing in the target database or the authenticated user cannot read them.

Check:

- latest chat migrations were applied
- `chat_sessions` and `chat_messages` exist
- the signed-in user is authenticated and has matching RLS access

### "Failed to send a request to the Edge Function"

This now maps to a clearer frontend error. Typical causes:

- `chat-complete` is not deployed
- the Edge Function is unavailable from the current Supabase project
- the function throws a provider/config/storage error before returning

Check:

- deploy `supabase/functions/chat-complete`
- ensure `SUPABASE_SERVICE_ROLE_KEY` is present for the function runtime
- ensure the provider config is set either in admin settings or env fallback

## Deployment steps

1. Apply the new migrations.
2. Regenerate Supabase types if needed.
3. Deploy the `chat-complete` Edge Function.
4. Open Settings as an admin and configure the chat provider/runtime.
5. Verify:
   - `/settings` shows the admin chat section for admins only
   - `/chat` loads with an empty state when no sessions exist
   - sending a message returns a grounded response or a clear provider/config error
