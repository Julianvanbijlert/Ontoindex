import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export interface SearchContextPreferences {
  personalizationEnabled: boolean;
  useProfile: boolean;
  useDeviceLocation: boolean;
}

const DEFAULT_PREFERENCES: SearchContextPreferences = {
  personalizationEnabled: true,
  useProfile: true,
  useDeviceLocation: false,
};

const preferenceKeyMap = {
  context_personalization_enabled: "personalizationEnabled",
  context_use_profile: "useProfile",
  context_use_device_location: "useDeviceLocation",
} as const;

type PreferenceRow = Database["public"]["Tables"]["user_context_preferences"]["Row"];

export function getDefaultSearchContextPreferences(): SearchContextPreferences {
  return {
    ...DEFAULT_PREFERENCES,
  };
}

export async function fetchUserContextPreferences(
  client: AppSupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("user_context_preferences")
    .select("preference_key, enabled")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return (data || []).reduce<SearchContextPreferences>((preferences, row) => {
    const mappedKey = preferenceKeyMap[row.preference_key as keyof typeof preferenceKeyMap];

    if (!mappedKey) {
      return preferences;
    }

    return {
      ...preferences,
      [mappedKey]: row.enabled,
    };
  }, getDefaultSearchContextPreferences());
}

export async function updateUserContextPreferences(
  client: AppSupabaseClient,
  userId: string,
  updates: Partial<SearchContextPreferences>,
) {
  const rows: Array<Database["public"]["Tables"]["user_context_preferences"]["Insert"]> = [];

  if (typeof updates.personalizationEnabled === "boolean") {
    rows.push({
      user_id: userId,
      preference_key: "context_personalization_enabled",
      enabled: updates.personalizationEnabled,
    });
  }

  if (typeof updates.useProfile === "boolean") {
    rows.push({
      user_id: userId,
      preference_key: "context_use_profile",
      enabled: updates.useProfile,
    });
  }

  if (typeof updates.useDeviceLocation === "boolean") {
    rows.push({
      user_id: userId,
      preference_key: "context_use_device_location",
      enabled: updates.useDeviceLocation,
    });
  }

  if (rows.length === 0) {
    return getDefaultSearchContextPreferences();
  }

  const { error } = await client
    .from("user_context_preferences")
    .upsert(rows, {
      onConflict: "user_id,preference_key",
    });

  if (error) {
    throw error;
  }

  return fetchUserContextPreferences(client, userId);
}
