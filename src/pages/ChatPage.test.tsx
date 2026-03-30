import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatEdgeFunctionError } from "@/lib/chat/chat-api";
import ChatPage from "@/pages/ChatPage";

const sendChatTurnMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
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
  }),
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

describe("ChatPage", () => {
  beforeEach(() => {
    sendChatTurnMock.mockReset();
  });

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

    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    );

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

    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Grounded Chat")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Ask about ontology concepts/i), {
      target: { value: "What is an employee?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Request ID: req-123/i)).toBeInTheDocument();
  });
});
