import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260402193000_search_sync_trusted_path_hardening.sql",
);

describe("search index trusted-path migration", () => {
  it("hardens sync functions to trusted execution while keeping direct writes locked down", () => {
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ALTER FUNCTION public.sync_search_index_entity(uuid)");
    expect(sql).toContain("ALTER FUNCTION public.sync_search_index_ontology_subtree(uuid)");
    expect(sql).toContain("ALTER FUNCTION public.handle_definition_search_document_sync()");
    expect(sql).toContain("ALTER FUNCTION public.handle_ontology_search_document_sync()");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.sync_search_index_entity(uuid) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.sync_search_index_ontology_subtree(uuid) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.sync_search_index_entity(uuid) TO service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.sync_search_index_ontology_subtree(uuid) TO service_role;");
  });
});
