# Search Context Storage

This repository now includes database support for context-aware search sessions, session events, and user opt-in preferences.

## Local apply

Apply the new migration set locally with your normal Supabase workflow, for example:

```bash
npx supabase db reset
```

## Remote dry run

Use the database URL from your environment. Do not hardcode secrets.

```bash
npx supabase db push --dry-run --db-url "$SUPABASE_DB_URL"
```

## Remote apply

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

## Regenerate TypeScript types

From the project root:

```bash
npx supabase gen types typescript --local > src/integrations/supabase/types.ts
```

If you need to regenerate against a remote database instead:

```bash
npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/integrations/supabase/types.ts
```

## Schema cache refresh note

If PostgREST keeps serving schema-cache errors after the migration has been applied, refresh the schema cache:

```sql
NOTIFY pgrst, 'reload schema';
```

Use that after the migration is committed if newly added tables, columns, or RPC signatures are not visible yet.
