import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Settings from "@/pages/Settings";

const fetchAdminChatSettings = vi.fn();
const updateAdminChatSettings = vi.fn();
const fetchAdminStandardsSettings = vi.fn();
const updateAdminStandardsSettings = vi.fn();
const validateLmStudioSettings = vi.fn();
const alignedReindexState = {
  required: false,
  status: "aligned",
  activeFingerprint: "fp_current",
  selectedFingerprint: "fp_current",
  lastIndexedFingerprint: "fp_current",
  lastIndexedAt: "2026-04-06T12:00:00.000Z",
  activeGenerationId: "gen-current",
  selectedGenerationId: "gen-current",
  pendingGenerationId: null,
  pendingJobId: null,
  pendingJobStatus: null,
  activationPending: false,
  totalDocuments: 24,
  processedDocuments: 24,
  remainingDocuments: 0,
  progressPercent: 100,
  progressStatus: "completed",
  progressLabel: "Completed",
  lastError: null,
  message: null,
};

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

vi.mock("@/lib/chat-admin-settings-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat-admin-settings-service")>("@/lib/chat-admin-settings-service");

  return {
    ...actual,
    fetchAdminChatSettings: (...args: unknown[]) => fetchAdminChatSettings(...args),
    updateAdminChatSettings: (...args: unknown[]) => updateAdminChatSettings(...args),
  };
});

vi.mock("@/lib/ai/lmstudio-validation", () => ({
  validateLmStudioSettings: (...args: unknown[]) => validateLmStudioSettings(...args),
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
  Switch: ({ checked, disabled, onCheckedChange, ...props }: any) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      {...props}
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    authState.role = "viewer";
    fetchAdminChatSettings.mockReset();
    updateAdminChatSettings.mockReset();
    fetchAdminStandardsSettings.mockReset();
    updateAdminStandardsSettings.mockReset();
    validateLmStudioSettings.mockReset();
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
        schemaDimensions: 1536,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        reindexState: alignedReindexState,
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
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
        schemaDimensions: 1536,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        reindexState: alignedReindexState,
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: true, masked: "Configured", updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
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
    validateLmStudioSettings.mockResolvedValue({
      connection: {
        status: "idle",
        message: null,
        modelIds: [],
        baseUrl: "http://localhost:1234/v1",
      },
      chatModel: {
        status: "idle",
        message: null,
      },
      embeddingModel: {
        status: "idle",
        message: null,
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

    expect(await screen.findByRole("tab", { name: /appearance/i })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /standards/i })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: /ai/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /ai/i }));
    expect(await screen.findByText("Admin AI Settings")).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
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

  it("lets admins toggle AI enabled and persists the value", async () => {
    authState.role = "admin";

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText("Admin AI Settings")).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: /ai enabled/i });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /save ai settings/i }));

    await waitFor(() => expect(updateAdminChatSettings).toHaveBeenCalled());
    expect(updateAdminChatSettings).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runtime: expect.objectContaining({
        aiEnabled: false,
      }),
    }));
  });

  it("shows a warning when embedding dimensions do not match schema", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
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
        vectorDimensions: 384,
        schemaDimensions: 1536,
        dimensionCompatibility: {
          status: "padded",
          mismatch: true,
          message: "Embedding model dimensions (384) do not match schema dimensions (1536).",
        },
        reindexState: alignedReindexState,
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText("Admin AI Settings")).toBeInTheDocument();
    expect(await screen.findByText(/do not match schema/i)).toBeInTheDocument();
  });

  it("shows an operability warning when local embeddings are missing model or endpoint settings", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
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
        embeddingProvider: "local",
        embeddingModel: "",
        embeddingBaseUrl: null,
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        reindexState: alignedReindexState,
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText("Admin AI Settings")).toBeInTheDocument();
    expect(await screen.findByText(/local embeddings require both a model and a base url/i)).toBeInTheDocument();
  });

  it("shows a fully local/free status when both chat and embeddings use LM Studio", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
      provider: {
        llmProvider: "lmstudio",
        llmModel: "local-chat-model",
        llmBaseUrl: "http://localhost:1234/v1",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
        apiKeyConfigured: false,
        apiKeyMasked: null,
        apiKeyUpdatedAt: null,
      },
      embeddings: {
        embeddingProvider: "lmstudio",
        embeddingModel: "local-embed-model",
        embeddingBaseUrl: "http://localhost:1234/v1",
        fallbackProvider: null,
        fallbackModel: null,
        fallbackBaseUrl: null,
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "lmstudio",
          embeddingModel: "local-embed-model",
          embeddingBaseUrl: "http://localhost:1234/v1",
          vectorDimensions: 768,
          schemaDimensions: 768,
          generationId: "gen-local",
          fingerprint: "fp-local",
          activatedAt: "2026-04-06T12:00:00.000Z",
        },
        reindexState: {
          ...alignedReindexState,
          selectedFingerprint: "fp-local",
          activeGenerationId: "gen-local",
          selectedGenerationId: "gen-local",
          activationPending: false,
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText(/fully local\/free mode/i)).toBeInTheDocument();
    expect(await screen.findByText(/chat and embeddings are both configured for lm studio/i)).toBeInTheDocument();
  });

  it("renders clearer AI settings sections for status, validation, and retrieval lifecycle", async () => {
    authState.role = "admin";

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText("Admin AI Settings")).toBeInTheDocument();
    expect(screen.getByText(/ai status/i)).toBeInTheDocument();
    expect(screen.getByText(/chat settings/i)).toBeInTheDocument();
    expect(screen.getByText(/embedding settings/i)).toBeInTheDocument();
    expect(screen.getByText(/local\/lm studio validation/i)).toBeInTheDocument();
    expect(screen.getByText(/retrieval \/ index status/i)).toBeInTheDocument();
  });

  it("runs the LM Studio connection test and shows validation results in the validation section", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
      provider: {
        llmProvider: "lmstudio",
        llmModel: "local-chat-model",
        llmBaseUrl: "http://localhost:1234/v1",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
        apiKeyConfigured: false,
        apiKeyMasked: null,
        apiKeyUpdatedAt: null,
      },
      embeddings: {
        embeddingProvider: "lmstudio",
        embeddingModel: "local-embed-model",
        embeddingBaseUrl: "http://localhost:1234/v1",
        fallbackProvider: null,
        fallbackModel: null,
        fallbackBaseUrl: null,
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "lmstudio",
          embeddingModel: "local-embed-model",
          embeddingBaseUrl: "http://localhost:1234/v1",
          vectorDimensions: 768,
          schemaDimensions: 768,
          generationId: "gen-local",
          fingerprint: "fp-local",
          activatedAt: "2026-04-06T12:00:00.000Z",
        },
        reindexState: {
          ...alignedReindexState,
          selectedFingerprint: "fp-local",
          activeGenerationId: "gen-local",
          selectedGenerationId: "gen-local",
          activationPending: false,
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });
    validateLmStudioSettings.mockResolvedValueOnce({
      connection: {
        status: "success",
        message: "Connected to LM Studio. 2 models available.",
        modelIds: ["local-chat-model", "local-embed-model"],
        baseUrl: "http://localhost:1234/v1",
      },
      chatModel: {
        status: "success",
        message: "Chat model is available on LM Studio.",
      },
      embeddingModel: {
        status: "warning",
        message: "Configured embedding model 'local-embed-model' is not available.",
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    fireEvent.click(await screen.findByRole("button", { name: /test lm studio connection/i }));

    await waitFor(() => expect(validateLmStudioSettings).toHaveBeenCalled());
    expect(await screen.findByText(/connected to lm studio/i)).toBeInTheDocument();
    expect(await screen.findByText(/configured embedding model 'local-embed-model' is not available/i)).toBeInTheDocument();
  });

  it("shows a clear validation failure even when static local/free status looks complete", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
      provider: {
        llmProvider: "lmstudio",
        llmModel: "local-chat-model",
        llmBaseUrl: "http://localhost:1234/v1",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
        apiKeyConfigured: false,
        apiKeyMasked: null,
        apiKeyUpdatedAt: null,
      },
      embeddings: {
        embeddingProvider: "lmstudio",
        embeddingModel: "local-embed-model",
        embeddingBaseUrl: "http://localhost:1234/v1",
        fallbackProvider: null,
        fallbackModel: null,
        fallbackBaseUrl: null,
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "lmstudio",
          embeddingModel: "local-embed-model",
          embeddingBaseUrl: "http://localhost:1234/v1",
          vectorDimensions: 768,
          schemaDimensions: 768,
          generationId: "gen-local",
          fingerprint: "fp-local",
          activatedAt: "2026-04-06T12:00:00.000Z",
        },
        reindexState: {
          ...alignedReindexState,
          selectedFingerprint: "fp-local",
          activeGenerationId: "gen-local",
          selectedGenerationId: "gen-local",
          activationPending: false,
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });
    validateLmStudioSettings.mockResolvedValueOnce({
      connection: {
        status: "error",
        message: "LM Studio is unreachable at http://localhost:1234/v1/models.",
        modelIds: [],
        baseUrl: "http://localhost:1234/v1",
      },
      chatModel: {
        status: "error",
        message: "Unable to validate the chat model until LM Studio responds.",
      },
      embeddingModel: {
        status: "error",
        message: "Unable to validate the embedding model until LM Studio responds.",
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText(/fully local\/free mode/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /test lm studio connection/i }));

    await waitFor(() => expect(validateLmStudioSettings).toHaveBeenCalled());
    expect(await screen.findByText(/lm studio is unreachable/i)).toBeInTheDocument();
  });

  it("shows a clear admin-required validation message instead of a raw edge-function error", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
      provider: {
        llmProvider: "lmstudio",
        llmModel: "local-chat-model",
        llmBaseUrl: "http://localhost:1234/v1",
        llmTemperature: 0.2,
        llmMaxTokens: 700,
        apiKeyConfigured: false,
        apiKeyMasked: null,
        apiKeyUpdatedAt: null,
      },
      embeddings: {
        embeddingProvider: "lmstudio",
        embeddingModel: "local-embed-model",
        embeddingBaseUrl: "http://localhost:1234/v1",
        fallbackProvider: null,
        fallbackModel: null,
        fallbackBaseUrl: null,
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "lmstudio",
          embeddingModel: "local-embed-model",
          embeddingBaseUrl: "http://localhost:1234/v1",
          vectorDimensions: 768,
          schemaDimensions: 768,
          generationId: "gen-local",
          fingerprint: "fp-local",
          activatedAt: "2026-04-06T12:00:00.000Z",
        },
        reindexState: alignedReindexState,
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });
    validateLmStudioSettings.mockResolvedValueOnce({
      connection: {
        status: "error",
        message: "Admin access is required to validate LM Studio settings.",
        modelIds: [],
        baseUrl: "http://localhost:1234/v1",
      },
      chatModel: {
        status: "error",
        message: "Unable to validate the chat model until LM Studio responds.",
      },
      embeddingModel: {
        status: "error",
        message: "Unable to validate the embedding model until LM Studio responds.",
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    fireEvent.click(await screen.findByRole("button", { name: /test lm studio connection/i }));

    await waitFor(() => expect(validateLmStudioSettings).toHaveBeenCalled());
    expect(await screen.findByText(/admin access is required to validate lm studio settings/i)).toBeInTheDocument();
    expect(screen.queryByText(/non-2xx/i)).not.toBeInTheDocument();
  });

  it("warns when only one side is configured for LM Studio local mode", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
      provider: {
        llmProvider: "lmstudio",
        llmModel: "local-chat-model",
        llmBaseUrl: "http://localhost:1234/v1",
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
        schemaDimensions: 1536,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "gemini",
          embeddingModel: "gemini-embedding-001",
          embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          vectorDimensions: 1536,
          schemaDimensions: 1536,
          generationId: "gen-active",
          fingerprint: "fp-active",
          activatedAt: "2026-04-06T12:00:00.000Z",
        },
        reindexState: {
          ...alignedReindexState,
          selectedFingerprint: "fp-active",
          activeGenerationId: "gen-active",
          selectedGenerationId: "gen-active",
          activationPending: false,
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText(/partially local mode/i)).toBeInTheDocument();
    expect(await screen.findByText(/chat is local but embeddings are not configured for lm studio/i)).toBeInTheDocument();
  });

  it("shows a reindex warning when embeddings are out of date with the active config", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
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
        embeddingProvider: "local",
        embeddingModel: "nomic-embed-text",
        embeddingBaseUrl: "http://127.0.0.1:11434/v1",
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        reindexState: {
          required: true,
          status: "queued",
          activeFingerprint: "fp_new",
          selectedFingerprint: "fp_new",
          lastIndexedFingerprint: "fp_old",
          lastIndexedAt: "2026-04-05T12:00:00.000Z",
          activeGenerationId: "gen-old",
          selectedGenerationId: "gen-new",
          pendingGenerationId: "gen-new",
          pendingJobId: "job-embed-queued",
          pendingJobStatus: "pending",
          activationPending: false,
          totalDocuments: 40,
          processedDocuments: 0,
          remainingDocuments: 40,
          progressPercent: 0,
          progressStatus: "queued",
          progressLabel: "Queued",
          lastError: null,
          message: "Search embeddings need to be rebuilt for the active embedding configuration.",
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText(/search embeddings need to be rebuilt/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/queued/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/embedding rebuild progress/i)).toBeInTheDocument();
  });

  it("updates the UI after saving settings that require reindex", async () => {
    authState.role = "admin";
    updateAdminChatSettings.mockResolvedValueOnce({
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
        embeddingProvider: "local",
        embeddingModel: "nomic-embed-text",
        embeddingBaseUrl: "http://127.0.0.1:11434/v1",
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        reindexState: {
          required: true,
          status: "queued",
          activeFingerprint: "fp_new",
          selectedFingerprint: "fp_new",
          lastIndexedFingerprint: "fp_old",
          lastIndexedAt: "2026-04-05T12:00:00.000Z",
          activeGenerationId: "gen-old",
          selectedGenerationId: "gen-new",
          pendingGenerationId: "gen-new",
          pendingJobId: "job-embed-queued",
          pendingJobStatus: "pending",
          activationPending: false,
          totalDocuments: 40,
          processedDocuments: 0,
          remainingDocuments: 40,
          progressPercent: 0,
          progressStatus: "queued",
          progressLabel: "Queued",
          lastError: null,
          message: "Search embeddings need to be rebuilt for the active embedding configuration.",
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: true, masked: "Configured", updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    fireEvent.click(screen.getByRole("button", { name: /save ai settings/i }));

    await waitFor(() => expect(updateAdminChatSettings).toHaveBeenCalled());
    expect(await screen.findByText(/search embeddings need to be rebuilt/i)).toBeInTheDocument();
  });

  it("shows selected and active retrieval embedding configs separately during a staged rebuild", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
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
        embeddingProvider: "local",
        embeddingModel: "nomic-embed-text",
        embeddingBaseUrl: "http://127.0.0.1:11434/v1",
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "gemini",
          embeddingModel: "gemini-embedding-001",
          embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          vectorDimensions: 1536,
          schemaDimensions: 1536,
          generationId: "gen-active",
          fingerprint: "fp_active",
          activatedAt: "2026-04-05T10:00:00.000Z",
        },
          reindexState: {
            required: true,
            status: "processing",
            activeFingerprint: "fp_active",
            selectedFingerprint: "fp_selected",
          lastIndexedFingerprint: "fp_active",
          lastIndexedAt: "2026-04-05T10:00:00.000Z",
          activeGenerationId: "gen-active",
          selectedGenerationId: "gen-selected",
            pendingGenerationId: "gen-selected",
            pendingJobId: "job-embed-processing",
            pendingJobStatus: "processing",
            activationPending: true,
            totalDocuments: 20,
            processedDocuments: 12,
            remainingDocuments: 8,
            progressPercent: 60,
            progressStatus: "processing",
            progressLabel: "Rebuilding embeddings",
            lastError: null,
            message: "Search embeddings are rebuilding. Retrieval stays on the active indexed generation until activation completes.",
          },
        },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText("Selected Embedding Config", { selector: "p" })).toBeInTheDocument();
    expect(await screen.findByText("Active Retrieval Config", { selector: "p" })).toBeInTheDocument();
    expect(await screen.findByText(/nomic-embed-text/i)).toBeInTheDocument();
    expect(await screen.findByText(/gemini-embedding-001/i)).toBeInTheDocument();
    expect(await screen.findByText(/retrieval stays on the active indexed generation/i)).toBeInTheDocument();
  });

  it("renders a progress bar and processing copy while embeddings are rebuilding", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
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
        embeddingProvider: "local",
        embeddingModel: "nomic-embed-text",
        embeddingBaseUrl: "http://127.0.0.1:11434/v1",
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "gemini",
          embeddingModel: "gemini-embedding-001",
          embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          vectorDimensions: 1536,
          schemaDimensions: 1536,
          generationId: "gen-active",
          fingerprint: "fp_active",
          activatedAt: "2026-04-05T10:00:00.000Z",
        },
        reindexState: {
          required: true,
          status: "processing",
          activeFingerprint: "fp_active",
          selectedFingerprint: "fp_selected",
          lastIndexedFingerprint: "fp_active",
          lastIndexedAt: "2026-04-05T10:00:00.000Z",
          activeGenerationId: "gen-active",
          selectedGenerationId: "gen-selected",
          pendingGenerationId: "gen-selected",
          pendingJobId: "job-embed-processing",
          pendingJobStatus: "processing",
          activationPending: false,
          totalDocuments: 20,
          processedDocuments: 15,
          remainingDocuments: 5,
          progressPercent: 75,
          progressStatus: "processing",
          progressLabel: "Rebuilding embeddings",
          lastError: null,
          message: "Search embeddings are rebuilding.",
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText(/embedding rebuild progress/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /embedding rebuild progress/i })).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getAllByText(/rebuilding embeddings/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/15 of 20 documents/i)).toBeInTheDocument();
  });

  it("shows a failed rebuild state clearly when the backend reports an indexing failure", async () => {
    authState.role = "admin";
    fetchAdminChatSettings.mockResolvedValueOnce({
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
        embeddingProvider: "lmstudio",
        embeddingModel: "local-embed-model",
        embeddingBaseUrl: "http://localhost:1234/v1",
        fallbackProvider: "huggingface",
        fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
        fallbackBaseUrl: "https://api-inference.huggingface.co/models",
        vectorDimensions: 768,
        schemaDimensions: 768,
        dimensionCompatibility: {
          status: "match",
          mismatch: false,
          message: null,
        },
        activeRetrieval: {
          embeddingProvider: "gemini",
          embeddingModel: "gemini-embedding-001",
          embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
          vectorDimensions: 1536,
          schemaDimensions: 1536,
          generationId: "gen-active",
          fingerprint: "fp_active",
          activatedAt: "2026-04-05T10:00:00.000Z",
        },
        reindexState: {
          required: true,
          status: "failed",
          activeFingerprint: "fp_active",
          selectedFingerprint: "fp_selected",
          lastIndexedFingerprint: "fp_active",
          lastIndexedAt: "2026-04-05T10:00:00.000Z",
          activeGenerationId: "gen-active",
          selectedGenerationId: "gen-selected",
          pendingGenerationId: "gen-selected",
          pendingJobId: "job-embed-failed",
          pendingJobStatus: "failed",
          activationPending: false,
          totalDocuments: 20,
          processedDocuments: 6,
          remainingDocuments: 14,
          progressPercent: 30,
          progressStatus: "failed",
          progressLabel: "Failed",
          lastError: "Embedding provider not configured",
          message: "Embedding rebuild failed.",
        },
      },
      providerKeys: {
        deepseek: { configured: false, masked: null, updatedAt: null },
        gemini: { configured: false, masked: null, updatedAt: null },
        huggingface: { configured: false, masked: null, updatedAt: null },
      },
      runtime: {
        aiEnabled: true,
        enableSimilarityExpansion: true,
        strictCitationsDefault: true,
        historyLimit: 12,
        maxEvidenceItems: 6,
        temperature: 0.2,
        maxTokens: 700,
      },
    });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText(/embedding rebuild progress/i)).toBeInTheDocument();
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/embedding provider not configured/i)).toBeInTheDocument();
  });

  it("refreshes rebuild progress while a staged embedding generation is still processing", async () => {
    authState.role = "admin";
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation(((callback: TimerHandler) => {
      window.setTimeout(() => {
        if (typeof callback === "function") {
          callback();
        }
      }, 0);
      return 1 as unknown as number;
    }) as typeof window.setInterval);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);
    fetchAdminChatSettings.mockReset();
    fetchAdminChatSettings
      .mockResolvedValueOnce({
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
          embeddingProvider: "local",
          embeddingModel: "nomic-embed-text",
          embeddingBaseUrl: "http://127.0.0.1:11434/v1",
          fallbackProvider: "huggingface",
          fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
          fallbackBaseUrl: "https://api-inference.huggingface.co/models",
          vectorDimensions: 768,
          schemaDimensions: 768,
          dimensionCompatibility: {
            status: "match",
            mismatch: false,
            message: null,
          },
          activeRetrieval: {
            embeddingProvider: "gemini",
            embeddingModel: "gemini-embedding-001",
            embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
            vectorDimensions: 1536,
            schemaDimensions: 1536,
            generationId: "gen-active",
            fingerprint: "fp_active",
            activatedAt: "2026-04-05T10:00:00.000Z",
          },
          reindexState: {
            required: true,
            status: "processing",
            activeFingerprint: "fp_active",
            selectedFingerprint: "fp_selected",
            lastIndexedFingerprint: "fp_active",
            lastIndexedAt: "2026-04-05T10:00:00.000Z",
            activeGenerationId: "gen-active",
            selectedGenerationId: "gen-selected",
            pendingGenerationId: "gen-selected",
            pendingJobId: "job-embed-processing",
            pendingJobStatus: "processing",
            activationPending: false,
            totalDocuments: 20,
            processedDocuments: 5,
            remainingDocuments: 15,
            progressPercent: 25,
            progressStatus: "processing",
            progressLabel: "Rebuilding embeddings",
            lastError: null,
            message: "Search embeddings are rebuilding.",
          },
        },
        providerKeys: {
          deepseek: { configured: false, masked: null, updatedAt: null },
          gemini: { configured: false, masked: null, updatedAt: null },
          huggingface: { configured: false, masked: null, updatedAt: null },
        },
        runtime: {
          aiEnabled: true,
          enableSimilarityExpansion: true,
          strictCitationsDefault: true,
          historyLimit: 12,
          maxEvidenceItems: 6,
          temperature: 0.2,
          maxTokens: 700,
        },
      })
      .mockResolvedValueOnce({
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
          embeddingProvider: "local",
          embeddingModel: "nomic-embed-text",
          embeddingBaseUrl: "http://127.0.0.1:11434/v1",
          fallbackProvider: "huggingface",
          fallbackModel: "sentence-transformers/all-MiniLM-L6-v2",
          fallbackBaseUrl: "https://api-inference.huggingface.co/models",
          vectorDimensions: 768,
          schemaDimensions: 768,
          dimensionCompatibility: {
            status: "match",
            mismatch: false,
            message: null,
          },
          activeRetrieval: {
            embeddingProvider: "gemini",
            embeddingModel: "gemini-embedding-001",
            embeddingBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
            vectorDimensions: 1536,
            schemaDimensions: 1536,
            generationId: "gen-active",
            fingerprint: "fp_active",
            activatedAt: "2026-04-05T10:00:00.000Z",
          },
          reindexState: {
            required: true,
            status: "processing",
            activeFingerprint: "fp_active",
            selectedFingerprint: "fp_selected",
            lastIndexedFingerprint: "fp_active",
            lastIndexedAt: "2026-04-05T10:00:00.000Z",
            activeGenerationId: "gen-active",
            selectedGenerationId: "gen-selected",
            pendingGenerationId: "gen-selected",
            pendingJobId: "job-embed-processing",
            pendingJobStatus: "processing",
            activationPending: false,
            totalDocuments: 20,
            processedDocuments: 10,
            remainingDocuments: 10,
            progressPercent: 50,
            progressStatus: "processing",
            progressLabel: "Rebuilding embeddings",
            lastError: null,
            message: "Search embeddings are rebuilding.",
          },
        },
        providerKeys: {
          deepseek: { configured: false, masked: null, updatedAt: null },
          gemini: { configured: false, masked: null, updatedAt: null },
          huggingface: { configured: false, masked: null, updatedAt: null },
        },
        runtime: {
          aiEnabled: true,
          enableSimilarityExpansion: true,
          strictCitationsDefault: true,
          historyLimit: 12,
          maxEvidenceItems: 6,
          temperature: 0.2,
          maxTokens: 700,
        },
      });

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /ai/i }));
    expect(await screen.findByText(/5 of 20 documents/i)).toBeInTheDocument();

    await waitFor(() => expect(fetchAdminChatSettings).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/10 of 20 documents/i)).toBeInTheDocument();
    expect(setIntervalSpy).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("renders the standards tab as one module per standard with severity help and exclusive rule controls", async () => {
    authState.role = "admin";

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /standards/i }));
    expect(await screen.findByText("Standards Compliance")).toBeInTheDocument();

    expect(screen.getByText("MIM")).toBeInTheDocument();
    expect(screen.getByText("NL-SBB")).toBeInTheDocument();
    expect(screen.getByText("RDF")).toBeInTheDocument();
    expect(screen.getByText("SKOS")).toBeInTheDocument();
    expect(screen.getByText(/generic concept-scheme semantics/i)).toBeInTheDocument();
    expect(screen.getAllByText(/dutch concept-framework guidance/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/enable skos only for generic labeling and hierarchy checks/i)).toBeInTheDocument();
    expect(screen.getByText(/enable both when you want generic skos semantics plus dutch nl-sbb guidance/i)).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole("button", { name: /severity meanings/i }));
    expect((await screen.findAllByText(/optional guidance \/ best-practice hint/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/prevents save\/create\/export/i).length).toBeGreaterThan(0);

    expect(screen.getByRole("radiogroup", { name: /mim class label recommended in starter catalog severity/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /mim class label recommended in starter catalog info/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /mim class label recommended in starter catalog warning/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /mim class label recommended in starter catalog error/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /mim class label recommended in starter catalog blocking/i })).toBeInTheDocument();
  });

  it("lets admins enable standards and change per-rule severity overrides", async () => {
    authState.role = "admin";

    render(<Settings />);

    fireEvent.click(await screen.findByRole("tab", { name: /standards/i }));
    expect(await screen.findByText("Standards Compliance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /enable rdf/i }));
    fireEvent.click(screen.getByRole("radio", { name: /mim class label recommended in starter catalog blocking/i }));
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
