import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Settings from "@/pages/Settings";

const fetchAdminChatSettings = vi.fn();
const updateAdminChatSettings = vi.fn();
const fetchAdminStandardsSettings = vi.fn();
const updateAdminStandardsSettings = vi.fn();

const authState = {
  profile: {
    user_id: "user-1",
    dark_mode: false,
    view_preference: "medium",
    format_preference: "grid",
    sort_preference: "asc",
    group_by_preference: "name",
  },
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  role: "viewer",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

vi.mock("@/lib/chat-admin-settings-service", () => ({
  fetchAdminChatSettings: (...args: unknown[]) => fetchAdminChatSettings(...args),
  updateAdminChatSettings: (...args: unknown[]) => updateAdminChatSettings(...args),
}));

vi.mock("@/lib/standards/settings-service", () => ({
  fetchAdminStandardsSettings: (...args: unknown[]) => fetchAdminStandardsSettings(...args),
  updateAdminStandardsSettings: (...args: unknown[]) => updateAdminStandardsSettings(...args),
  createDefaultStandardsSettings: () => ({
    enabledStandards: ["mim", "nl-sbb", "rdf"],
    ruleOverrides: {},
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, disabled, onCheckedChange }: any) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      {checked ? "On" : "Off"}
    </button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
  SelectValue: () => <span>Selected</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <button type="button">{children}</button>,
}));

describe("Settings", () => {
  beforeEach(() => {
    authState.role = "viewer";
    fetchAdminChatSettings.mockReset();
    updateAdminChatSettings.mockReset();
    fetchAdminStandardsSettings.mockReset();
    updateAdminStandardsSettings.mockReset();
    fetchAdminChatSettings.mockResolvedValue({
      provider: {
        llmProvider: "gemini",
        llmModel: "gemini-2.0-flash",
        llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
        apiKeyConfigured: false,
        apiKeyMasked: null,
        apiKeyUpdatedAt: null,
      },
      embeddings: {
        embeddingProvider: "gemini",
        embeddingModel: "gemini-embedding-001",
        embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 1536,
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });
    updateAdminChatSettings.mockResolvedValue({
      provider: {
        llmProvider: "gemini",
        llmModel: "gemini-2.0-flash",
        llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
        apiKeyConfigured: true,
        apiKeyMasked: "Configured",
        apiKeyUpdatedAt: null,
      },
      embeddings: {
        embeddingProvider: "gemini",
        embeddingModel: "gemini-embedding-001",
        embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 1536,
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: true, masked: "Configured", updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });
    fetchAdminStandardsSettings.mockResolvedValue({
      enabledStandards: ["mim", "nl-sbb", "rdf"],
      ruleOverrides: {
        mim_missing_class_label: "warning",
      },
    });
    updateAdminStandardsSettings.mockResolvedValue({
      enabledStandards: ["mim", "rdf"],
      ruleOverrides: {
        mim_missing_class_label: "blocking",
      },
    });
  });

  it("shows the appearance settings for non-admin users without any role-policy UI", () => {
    render(<Settings />);

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.queryByText("Standards Compliance")).not.toBeInTheDocument();
    expect(screen.queryByText("Role Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Allow users to change their own role")).not.toBeInTheDocument();
  });

  it("shows admin chat settings for admins", async () => {
    authState.role = "admin";

    render(<Settings />);

    expect(await screen.findByText("Appearance")).toBeInTheDocument();
    expect(await screen.findByText("Admin AI Settings")).toBeInTheDocument();
    expect(await screen.findByText("Standards Compliance")).toBeInTheDocument();
    expect((await screen.findAllByText("Gemini")).length).toBeGreaterThan(0);
    expect(fetchAdminChatSettings).toHaveBeenCalled();
    expect(fetchAdminStandardsSettings).toHaveBeenCalled();
  });

  it("saves appearance settings normally", async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(authState.refreshProfile).toHaveBeenCalled());
  });

  it("lets admins save chat settings without exposing the stored API key", async () => {
    authState.role = "admin";

    render(<Settings />);

    expect(await screen.findByText("Admin AI Settings")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Set Gemini key"), {
      target: { value: "secret-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save ai settings/i }));

    await waitFor(() => expect(updateAdminChatSettings).toHaveBeenCalled());
    expect(updateAdminChatSettings).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      providerKeys: expect.objectContaining({
        geminiApiKey: "secret-key",
      }),
    }));
  });

  it("lets admins enable standards and change per-rule severity overrides", async () => {
    authState.role = "admin";

    render(<Settings />);

    expect(await screen.findByText("Standards Compliance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /enable rdf/i }));
    fireEvent.click(screen.getByRole("button", { name: /mim missing class label severity/i }));
    fireEvent.click(screen.getByRole("button", { name: /^blocking$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save standards settings/i }));

    await waitFor(() => expect(updateAdminStandardsSettings).toHaveBeenCalled());
    expect(updateAdminStandardsSettings).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      enabledStandards: expect.not.arrayContaining(["rdf"]),
      ruleOverrides: expect.objectContaining({
        mim_missing_class_label: "blocking",
      }),
    }));
  });
});
