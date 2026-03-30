import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, MessageSquare, Plus, Sparkles } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchChatMessages, fetchChatSessions, getDefaultChatSettings, sendChatTurn, type ChatMessageListItem, type ChatSessionListItem } from "@/lib/chat/chat-service";
import { ChatEdgeFunctionError } from "@/lib/chat/chat-api";
import { defaultChatRuntimeSettings, defaultChatSessionSettings, fetchChatRuntimeSettings } from "@/lib/chat-admin-settings-service";
import type { ChatCitation, ChatRuntimeSettings, ChatSessionSettings } from "@/lib/chat/types";
import { fetchRecentFinds, fetchSearchHistory, fetchSearchOptions } from "@/lib/search-service";
import type { SearchHistoryEntry, SearchResultItem } from "@/lib/search-types";
import { EmptyState } from "@/components/shared/EmptyState";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface DisplayChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  citations: ChatCitation[];
  metadata?: Record<string, unknown>;
}

function coerceChatSettings(
  value: unknown,
  fallback = getDefaultChatSettings(),
): ChatSessionSettings {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const source = value as Record<string, unknown>;

  return {
    similarityExpansion: typeof source.similarityExpansion === "boolean"
      ? source.similarityExpansion
      : fallback.similarityExpansion,
    strictCitations: typeof source.strictCitations === "boolean"
      ? source.strictCitations
      : fallback.strictCitations,
    ontologyScopeId: typeof source.ontologyScopeId === "string" ? source.ontologyScopeId : fallback.ontologyScopeId,
    ontologyScopeTitle: typeof source.ontologyScopeTitle === "string" ? source.ontologyScopeTitle : fallback.ontologyScopeTitle,
    allowClarificationQuestions: typeof source.allowClarificationQuestions === "boolean"
      ? source.allowClarificationQuestions
      : fallback.allowClarificationQuestions,
  };
}

function mapPersistedMessage(message: ChatMessageListItem): DisplayChatMessage {
  const metadata = (message.metadata || {}) as Record<string, unknown>;
  const sources = Array.isArray(metadata.sources) ? metadata.sources as ChatCitation[] : [];

  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    createdAt: message.created_at,
    citations: sources,
    metadata,
  };
}

export default function ChatPage() {
  const { user, role, profile, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayChatMessage[]>([]);
  const [displayedSessionId, setDisplayedSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSessionSettings>(getDefaultChatSettings());
  const [runtimeSettings, setRuntimeSettings] = useState<ChatRuntimeSettings | null>(null);
  const [ontologies, setOntologies] = useState<Array<{ id: string; title: string }>>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [recentFinds, setRecentFinds] = useState<SearchResultItem[]>([]);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setMessages([]);
      setDisplayedSessionId(null);
      setActiveSessionId(null);
      setLoadingSessions(false);
      return;
    }

    let active = true;
    setLoadingSessions(true);

    Promise.all([
      fetchChatSessions(supabase, user.id),
      fetchSearchOptions(supabase),
      fetchSearchHistory(supabase, user.id),
      fetchRecentFinds(supabase, user.id),
      fetchChatRuntimeSettings(supabase).catch((loadError) => {
        console.warn("Chat runtime settings unavailable, using defaults.", { loadError });
        return defaultChatRuntimeSettings();
      }),
    ])
      .then(([chatSessions, searchOptions, history, recent, chatRuntime]) => {
        if (!active) {
          return;
        }

        setSessions(chatSessions);
        setOntologies(searchOptions.ontologies);
        setSearchHistory(history);
        setRecentFinds(recent);
        setRuntimeSettings(chatRuntime);

        if (chatSessions.length > 0) {
          setActiveSessionId((current) => current || chatSessions[0].id);
          setSettings(coerceChatSettings(chatSessions[0].settings));
        } else {
          setSettings(defaultChatSessionSettings(chatRuntime));
        }
      })
      .catch((loadError) => {
        if (active) {
          console.error("Chat page failed to load sessions", { loadError });
          setError(loadError instanceof Error ? loadError.message : "Unable to load chat sessions.");
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSessions(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setDisplayedSessionId(null);
      return;
    }

    let active = true;
    setLoadingMessages(true);
    fetchChatMessages(supabase, activeSessionId)
      .then((rows) => {
        if (active) {
          const mappedRows = rows.map(mapPersistedMessage);
          setMessages((current) => {
            if (mappedRows.length === 0 && displayedSessionId === activeSessionId && current.length > 0) {
              return current;
            }

            return mappedRows;
          });
          setDisplayedSessionId(activeSessionId);
        }
      })
      .catch((loadError) => {
        if (active) {
          console.error("Chat page failed to load messages", { loadError });
          setError(loadError instanceof Error ? loadError.message : "Unable to load chat messages.");
        }
      })
      .finally(() => {
        if (active) {
          setLoadingMessages(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeSessionId, displayedSessionId]);

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || null,
    [activeSessionId, sessions],
  );

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setDisplayedSessionId(null);
    setSettings(defaultChatSessionSettings(runtimeSettings || undefined));
    setError(null);
  };

  const handleSend = async () => {
    if (!user || !input.trim()) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const ontologyScopeTitle = settings.ontologyScopeId
        ? ontologies.find((ontology) => ontology.id === settings.ontologyScopeId)?.title || null
        : null;
      const scopedSettings = {
        ...settings,
        ontologyScopeTitle,
      };
      const result = await sendChatTurn(supabase, {
        sessionId: activeSessionId,
        userMessage: input.trim(),
        currentUserId: user.id,
        settings: scopedSettings,
        runtimeSettings: runtimeSettings || undefined,
        experience: {
          query: input.trim(),
          filters: {
            ontologyId: scopedSettings.ontologyScopeId || "all",
            tag: "all",
            status: "all",
            type: "all",
            ownership: "all",
          },
          route: {
            pathname: location.pathname,
            page: "chat",
            ontologyLabel: ontologyScopeTitle,
          },
          authenticatedUser: {
            id: user.id,
            role,
            language: user.user_metadata?.locale || user.user_metadata?.language || undefined,
            preferences: {
              contextualSearchOptIn: true,
              viewPreference: profile?.view_preference || null,
              formatPreference: profile?.format_preference || null,
              sortPreference: profile?.sort_preference || null,
              groupByPreference: profile?.group_by_preference || null,
            },
          },
          sessionId: activeSessionId || (session?.access_token ? `${user.id}:${session.expires_at || "chat"}` : null),
          searchHistory,
          recentFinds,
        },
      });

      const nextMessages: DisplayChatMessage[] = [
        ...messages,
        {
          id: `${result.sessionId}:user:${Date.now()}`,
          role: "user",
          content: result.userMessage.content,
          citations: [],
        },
        {
          id: result.assistantMessage.id || `${result.sessionId}:assistant:${Date.now()}`,
          role: "assistant",
          content: result.assistantMessage.content,
          citations: result.citations,
          metadata: result.assistantMessage.metadata,
        },
      ];

      setMessages(nextMessages);
      setDisplayedSessionId(result.sessionId);
      setActiveSessionId(result.sessionId);
      setInput("");

      const refreshedSessions = await fetchChatSessions(supabase, user.id);
      setSessions(refreshedSessions);
      const matchingSession = refreshedSessions.find((item) => item.id === result.sessionId);
      if (matchingSession) {
        setSettings(coerceChatSettings(matchingSession.settings, scopedSettings));
      }
    } catch (sendError) {
      console.error("Chat page failed to send message", { sendError });
      if (sendError instanceof ChatEdgeFunctionError && sendError.requestId) {
        setError(`${sendError.message} Request ID: ${sendError.requestId}`);
      } else {
        setError(sendError instanceof Error ? sendError.message : "Unable to send the chat message.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Chats</CardTitle>
          <Button size="sm" variant="outline" onClick={handleNewChat}>
            <Plus className="mr-1.5 h-3 w-3" />
            New
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingSessions ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-5 w-5" />}
              title="No chats yet"
              description="Start a grounded conversation over your ontology knowledge base."
            />
          ) : (
            sessions.map((chatSession) => (
              <button
                key={chatSession.id}
                type="button"
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  chatSession.id === activeSessionId
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/50 hover:bg-muted/40"
                }`}
                onClick={() => {
                  setActiveSessionId(chatSession.id);
                  setSettings(coerceChatSettings(chatSession.settings));
                }}
              >
                <p className="text-sm font-medium text-foreground">
                  {chatSession.title || "Untitled chat"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(chatSession.last_active_at).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-border/50">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Grounded Chat</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Answers are grounded in the existing hybrid search stack and only cite retrieved evidence.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
              <span>Similarity expansion</span>
              <Switch
                checked={settings.similarityExpansion}
                onCheckedChange={(checked) => setSettings((current) => ({ ...current, similarityExpansion: checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
              <span>Strict citations</span>
              <Switch
                checked={settings.strictCitations}
                onCheckedChange={(checked) => setSettings((current) => ({ ...current, strictCitations: checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
              <span>Ask clarifying questions</span>
              <Switch
                checked={settings.allowClarificationQuestions}
                onCheckedChange={(checked) => setSettings((current) => ({ ...current, allowClarificationQuestions: checked }))}
              />
            </label>
            <Select
              value={settings.ontologyScopeId || "all"}
              onValueChange={(value) => setSettings((current) => ({
                ...current,
                ontologyScopeId: value === "all" ? null : value,
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ontology scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ontologies</SelectItem>
                {ontologies.map((ontology) => (
                  <SelectItem key={ontology.id} value={ontology.id}>{ontology.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="space-y-4 p-4">
            {loadingMessages ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="h-5 w-5" />}
                title="Start a grounded chat"
                description="Ask about ontology concepts, related definitions, workflow state, or recent changes."
              />
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl border px-4 py-3 ${
                    message.role === "assistant"
                      ? "border-border/50 bg-background"
                      : "border-primary/20 bg-primary/5"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {message.role}
                    </Badge>
                    {message.metadata?.groundingStatus && (
                      <Badge variant="secondary" className="capitalize">
                        {String(message.metadata.groundingStatus)}
                      </Badge>
                    )}
                  </div>
                  {message.role === "assistant" ? (
                    <MarkdownRenderer content={message.content} />
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                  )}
                  {message.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.citations.map((citation) => (
                        <Button
                          key={`${message.id}:${citation.id}`}
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(citation.href)}
                        >
                          {citation.id} {citation.title}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="space-y-3 p-4">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about ontology concepts, definitions, relations, workflows, or recent changes..."
              className="min-h-[120px]"
            />
            {activeSession?.title && (
              <p className="text-xs text-muted-foreground">
                Continuing: {activeSession.title}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Grounded answers cite retrieved evidence and hedge when support is weak.
              </p>
              <Button onClick={handleSend} disabled={sending || !input.trim()}>
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
