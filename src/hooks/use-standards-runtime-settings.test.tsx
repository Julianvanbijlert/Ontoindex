import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useStandardsRuntimeSettings } from "@/hooks/use-standards-runtime-settings";

const fetchStandardsRuntimeSettings = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { __brand: "supabase-client" },
}));

vi.mock("@/lib/standards/settings-service", () => ({
  fetchStandardsRuntimeSettings: (...args: unknown[]) => fetchStandardsRuntimeSettings(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("use-standards-runtime-settings", () => {
  it("does not expose shipped defaults before runtime settings load", async () => {
    let resolveSettings: ((value: unknown) => void) | null = null;
    fetchStandardsRuntimeSettings.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSettings = resolve;
    }));

    const { result } = renderHook(() => useStandardsRuntimeSettings(), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBeNull();

    resolveSettings?.({
      enabledStandards: [],
      ruleOverrides: {},
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual({
      enabledStandards: [],
      ruleOverrides: {},
    });
  });
});
