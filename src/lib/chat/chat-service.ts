import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { defaultChatSessionSettings } from "@/lib/chat-admin-settings-service";
import type {
  ChatSessionSettings,
  ChatTurnResult,
} from "@/lib/chat/types";
import { runGroundedChatTurn } from "@/lib/chat/chat-controller";

type AppSupabaseClient = SupabaseClient<Database>;

interface ChatStorageProbeResult {
  ready: boolean;
  missingTables: string[];
}

const CHAT_STORAGE_TABLES = [
  "chat_sessions",
  "chat_messages",
  "chat_context_summaries",
  "chat_logs",
] as const;

type ChatStorageTable = (typeof CHAT_STORAGE_TABLES)[number];

function extractMissingChatTables(error: {
  code?: string;
  message?: string;
}) {
  const message = String(error.message || "").toLowerCase();
  return CHAT_STORAGE_TABLES.filter((table) => message.includes(table));
}

function normalizeChatStorageError(
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
  probe?: ChatStorageProbeResult | null,
) {
  const message = String(error.message || "").toLowerCase();
  const missingTables = probe?.missingTables?.length
    ? probe.missingTables
    : extractMissingChatTables(error);

  if (
    error.code === "42P01"
    || error.code === "PGRST205"
    || missingTables.length > 0
  ) {
    const missingDetail = missingTables.length > 0
      ? ` Missing: ${missingTables.join(", ")}.`
      : "";

    return `Chat storage is not configured in this environment yet. Apply the latest chat migrations.${missingDetail}`;
  }

  if (error.code === "42501") {
    return "You are not allowed to access this chat data.";
  }

  return error.message || "Unable to access chat storage.";
}

export interface ChatSessionListItem {
  id: string;
  title: string | null;
  last_active_at: string;
  created_at: string;
  settings: Database["public"]["Tables"]["chat_sessions"]["Row"]["settings"];
}

export interface ChatMessageListItem {
  id: string;
  role: Database["public"]["Tables"]["chat_messages"]["Row"]["role"];
  content: string;
  created_at: string;
  metadata: Database["public"]["Tables"]["chat_messages"]["Row"]["metadata"];
}

export function getDefaultChatSettings(): ChatSessionSettings {
  return defaultChatSessionSettings();
}

async function probeChatStorageTable(client: AppSupabaseClient, table: ChatStorageTable) {
  const { error } = await client
    .from(table)
    .select("*", { head: true, count: "exact" })
    .limit(1);

  if (error && (error.code === "42P01" || error.code === "PGRST205" || String(error.message || "").toLowerCase().includes(table))) {
    return table;
  }

  return null;
}

export async function probeChatStorage(client: AppSupabaseClient): Promise<ChatStorageProbeResult> {
  const results = await Promise.all(CHAT_STORAGE_TABLES.map((table) => probeChatStorageTable(client, table)));
  const missingTables = results.filter(Boolean) as string[];

  return {
    ready: missingTables.length === 0,
    missingTables,
  };
}

export async function fetchChatSessions(client: AppSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("chat_sessions")
    .select("id, title, last_active_at, created_at, settings")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false });

  if (error) {
    const storageProbe = error.code === "42P01" || error.code === "PGRST205"
      ? await probeChatStorage(client).catch(() => null)
      : null;

    console.error("Failed to load chat sessions", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      storageProbe,
    });
    throw new Error(normalizeChatStorageError(error, storageProbe));
  }

  return (data || []) as ChatSessionListItem[];
}

export async function fetchChatMessages(client: AppSupabaseClient, sessionId: string) {
  const { data, error } = await client
    .from("chat_messages")
    .select("id, role, content, created_at, metadata")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    const storageProbe = error.code === "42P01" || error.code === "PGRST205"
      ? await probeChatStorage(client).catch(() => null)
      : null;

    console.error("Failed to load chat messages", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      storageProbe,
    });
    throw new Error(normalizeChatStorageError(error, storageProbe));
  }

  return (data || []) as ChatMessageListItem[];
}

export async function sendChatTurn(
  client: AppSupabaseClient,
  input: Parameters<typeof runGroundedChatTurn>[1],
): Promise<ChatTurnResult> {
  return runGroundedChatTurn(client, input);
}
