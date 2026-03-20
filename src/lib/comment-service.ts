import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export async function createCommentRecord(
  client: AppSupabaseClient,
  input: {
    definitionId: string;
    userId: string;
    content: string;
    parentId?: string | null;
  },
) {
  const { data, error } = await client
    .from("comments")
    .insert({
      definition_id: input.definitionId,
      user_id: input.userId,
      content: input.content,
      parent_id: input.parentId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateCommentRecord(
  client: AppSupabaseClient,
  input: {
    commentId: string;
    content: string;
  },
) {
  const { data, error } = await client
    .from("comments")
    .update({
      content: input.content,
    })
    .eq("id", input.commentId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteCommentRecord(client: AppSupabaseClient, commentId: string) {
  const { data, error } = await client.rpc("delete_comment", {
    _comment_id: commentId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function setCommentResolved(
  client: AppSupabaseClient,
  input: {
    commentId: string;
    resolved: boolean;
  },
) {
  const { data, error } = await client.rpc("set_comment_resolved", {
    _comment_id: input.commentId,
    _resolved: input.resolved,
  });

  if (error) {
    throw error;
  }

  return data;
}
