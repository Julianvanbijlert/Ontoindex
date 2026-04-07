import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatEdgeFunctionError } from "@/lib/chat/chat-api";

const { sendChatTurnMock } = vi.hoisted(() => ({
  sendChatTurnMock: vi.fn(),
}));

const authState = {
  user: {
    id: "user-1",
    user_metadata: {},
  },
  role: "editor",
  profile: {
    view_preference: "medium",
    format_preference: "grid",
    sort_preference: "asc",
    group_by_preference: "name",
  },
  session: {
    access_token: "token",
    expires_at: 123,
  },
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/lib/chat/chat-service", () => ({
  fetchChatSessions: vi.fn().mockResolvedValue([]),
  fetchChatMessages: vi.fn().mockResolvedValue([]),
  getDefaultChatSettings: () => ({
    similarityExpansion: true,
    strictCitations: true,
    ontologyScopeId: null,
    ontologyScopeTitle: null,
    allowClarificationQuestions: true,
  }),
  sendChatTurn: (...args: unknown[]) => sendChatTurnMock(...args),
}));

vi.mock("@/lib/chat-admin-settings-service", () => ({
  defaultChatRuntimeSettings: () => ({
    aiEnabled: true,
    enableSimilarityExpansion: true,
    strictCitationsDefault: true,
    historyMessageLimit: 12,
    maxEvidenceItems: 6,
    answerTemperature: 0.2,
    maxAnswerTokens: 700,
  }),
  defaultChatSessionSettings: () => ({
    similarityExpansion: true,
    strictCitations: true,
    ontologyScopeId: null,
    ontologyScopeTitle: null,
    allowClarificationQuestions: true,
  }),
  fetchChatRuntimeSettings: vi.fn().mockResolvedValue({
    aiEnabled: true,
    enableSimilarityExpansion: true,
    strictCitationsDefault: true,
    historyMessageLimit: 12,
    maxEvidenceItems: 6,
    answerTemperature: 0.2,
    maxAnswerTokens: 700,
  }),
}));

vi.mock("@/lib/search-service", () => ({
  fetchSearchOptions: vi.fn().mockResolvedValue({
    ontologies: [{ id: "ontology-1", title: "HR" }],
    tags: [],
  }),
  fetchSearchHistory: vi.fn().mockResolvedValue([]),
  fetchRecentFinds: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/components/shared/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/shared/EmptyState", () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/select", () => {
  return {
    Select: ({ children }: any) => <div>{children}</div>,
    SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? "Selected"}</span>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ children }: any) => <div>{children}</div>,
  };
});

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (value: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)}>
      {checked ? "On" : "Off"}
    </button>
  ),
}));

describe("ChatPage", () => {
  beforeEach(() => {
    sendChatTurnMock.mockReset();
  });

  async function renderChatPage() {
    const { default: ChatPage } = await import("@/pages/ChatPage");

    return render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    );
  }

  it("renders and sends a grounded chat turn", async () => {
    sendChatTurnMock.mockResolvedValue({
      sessionId: "chat-1",
      title: "Employee",
      userMessage: {
        role: "user",
        content: "What is an employee?",
      },
      assistantMessage: {
        id: "assistant-1",
        role: "assistant",
        content: "Employee is the preferred term. [E1]",
        metadata: {
          groundingStatus: "grounded",
        },
      },
      citations: [
        {
          id: "E1",
          entityId: "definition-employee",
          entityType: "definition",
          title: "Employee",
          href: "/definitions/definition-employee",
        },
      ],
      evidencePack: [],
      retrieval: {},
      groundingStatus: "grounded",
    });

    await renderChatPage();

    expect(await screen.findByText("Grounded Chat")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Ask about ontology concepts/i), {
      target: { value: "What is an employee?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(sendChatTurnMock).toHaveBeenCalled();
    });

    expect(await screen.findByText((content) => content.includes("Employee is the preferred term."))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /E1 Employee/i })).toBeInTheDocument();
  });

  it("shows backend request ids for chat edge-function failures", async () => {
    sendChatTurnMock.mockRejectedValue(
      new ChatEdgeFunctionError("Chat provider chain failed: missing Gemini key", "provider_config_missing", "req-123", 503),
    );

    await renderChatPage();

    expect(await screen.findByText("Grounded Chat")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Ask about ontology concepts/i), {
      target: { value: "What is an employee?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Request ID: req-123/i)).toBeInTheDocument();
  });

  it("disables chat when AI is disabled in runtime settings", async () => {
    const { fetchChatRuntimeSettings } = await import("@/lib/chat-admin-settings-service");
    (fetchChatRuntimeSettings as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      aiEnabled: false,
      enableSimilarityExpansion: true,
      strictCitationsDefault: true,
      historyMessageLimit: 12,
      maxEvidenceItems: 6,
      answerTemperature: 0.2,
      maxAnswerTokens: 700,
    });

    await renderChatPage();

    expect(await screen.findByText("Grounded Chat")).toBeInTheDocument();
    expect(await screen.findByText(/AI features are disabled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
