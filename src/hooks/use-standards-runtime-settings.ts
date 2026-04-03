import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { StandardsRuntimeSettings } from "@/lib/standards/engine/types";
import { fetchStandardsRuntimeSettings } from "@/lib/standards/settings-service";

export const standardsRuntimeSettingsQueryKey = ["standards-runtime-settings"] as const;

export function useStandardsRuntimeSettings() {
  const query = useQuery<StandardsRuntimeSettings>({
    queryKey: standardsRuntimeSettingsQueryKey,
    queryFn: () => fetchStandardsRuntimeSettings(supabase),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  return {
    settings: query.data ?? null,
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : (query.error ? "Unable to load standards settings." : null),
    refetch: query.refetch,
  };
}
