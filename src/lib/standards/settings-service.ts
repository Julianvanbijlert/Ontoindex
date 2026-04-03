import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { builtInStandardsPacks, listStandardsRuleCatalog } from "@/lib/standards/engine/registry";
import type { StandardsRuntimeSettings, StandardsSeverity } from "@/lib/standards/engine/types";

type AppSupabaseClient = SupabaseClient<Database>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSchemaMissingError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

  return (
    code === "42P01"
    || code === "42703"
    || code === "42883"
    || code === "PGRST205"
    || message.includes("schema cache")
    || message.includes("could not find the function")
    || message.includes("does not exist")
    || message.includes("column")
  );
}

function isUnauthorizedError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";

  return code === "42501" || message.includes("admin access required") || message.includes("permission denied");
}

function isSeverity(value: unknown): value is StandardsSeverity {
  return value === "info" || value === "warning" || value === "error" || value === "blocking";
}

function createDefaultRuleOverrides() {
  const dangerousRules = new Set([
    "mim_unknown_package",
    "mim_unknown_datatype",
    "mim_unknown_superclass",
    "mim_unknown_association_source",
    "mim_unknown_association_target",
    "nl_sbb_unknown_scheme",
    "nl_sbb_unknown_relation_source",
    "nl_sbb_unknown_relation_target",
    "nl_sbb_cross_scheme_relation",
    "rdf_invalid_subject_iri",
    "rdf_invalid_predicate_iri",
    "rdf_invalid_object_iri",
    "rdf_invalid_blank_node",
    "rdf_literal_datatype_language_conflict",
  ]);

  return Object.fromEntries(
    listStandardsRuleCatalog().map((rule) => [
      rule.ruleId,
      dangerousRules.has(rule.ruleId) ? "error" : "warning",
    ]),
  ) as Record<string, StandardsSeverity>;
}

export function createDefaultStandardsSettings(): StandardsRuntimeSettings {
  return {
    enabledStandards: builtInStandardsPacks.map((pack) => pack.standardId),
    ruleOverrides: createDefaultRuleOverrides(),
  };
}

export function parseStandardsSettings(payload: Json | null | undefined): StandardsRuntimeSettings {
  const defaults = createDefaultStandardsSettings();
  if (!isRecord(payload)) {
    return defaults;
  }

  const source = payload;
  const hasEnabledStandards = Array.isArray(source.enabledStandards);
  const hasRuleOverrides = isRecord(source.ruleOverrides);

  if (!hasEnabledStandards && !hasRuleOverrides) {
    return defaults;
  }

  const enabledStandards = hasEnabledStandards
    ? source.enabledStandards.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : defaults.enabledStandards;
  const rawOverrides = hasRuleOverrides ? source.ruleOverrides : {};
  const parsedOverrides = Object.entries(rawOverrides).reduce<Record<string, StandardsSeverity>>((accumulator, [key, value]) => {
    if (isSeverity(value)) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});

  return {
    enabledStandards,
    ruleOverrides: {
      ...defaults.ruleOverrides,
      ...parsedOverrides,
    },
  };
}

async function loadSettingsFromTables(client: AppSupabaseClient) {
  const response = await client
    .from("app_settings")
    .select("id, standards_settings")
    .eq("id", 1)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  return parseStandardsSettings((response.data as { standards_settings?: Json | null } | null)?.standards_settings || null);
}

async function updateSettingsThroughTables(client: AppSupabaseClient, settings: StandardsRuntimeSettings) {
  const { error } = await client
    .from("app_settings")
    .upsert({
      id: 1,
      standards_settings: settings as unknown as Json,
    }, { onConflict: "id" });

  if (error) {
    throw error;
  }

  return loadSettingsFromTables(client);
}

export async function fetchStandardsRuntimeSettings(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("get_standards_runtime_settings");

  if (error) {
    if (isSchemaMissingError(error)) {
      try {
        return await loadSettingsFromTables(client);
      } catch (fallbackError) {
        if (!isSchemaMissingError(fallbackError) && !isUnauthorizedError(fallbackError)) {
          throw fallbackError;
        }
      }

      return createDefaultStandardsSettings();
    }

    throw error;
  }

  return parseStandardsSettings(data);
}

export async function fetchAdminStandardsSettings(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("get_admin_standards_settings");

  if (error) {
    if (isUnauthorizedError(error)) {
      throw new Error("Admin access required");
    }

    if (isSchemaMissingError(error)) {
      try {
        return await loadSettingsFromTables(client);
      } catch (fallbackError) {
        if (isUnauthorizedError(fallbackError)) {
          throw new Error("Admin access required");
        }

        if (!isSchemaMissingError(fallbackError)) {
          throw fallbackError;
        }

        return createDefaultStandardsSettings();
      }
    }

    throw error;
  }

  return parseStandardsSettings(data);
}

export async function updateAdminStandardsSettings(
  client: AppSupabaseClient,
  input: StandardsRuntimeSettings,
) {
  const settings = parseStandardsSettings(input as unknown as Json);
  const { data, error } = await client.rpc("update_admin_standards_settings", {
    _settings: settings as unknown as Json,
  });

  if (error) {
    if (isUnauthorizedError(error)) {
      throw new Error("Admin access required");
    }

    if (isSchemaMissingError(error)) {
      return updateSettingsThroughTables(client, settings);
    }

    throw error;
  }

  return parseStandardsSettings(data);
}
