import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MoreHorizontal, Reply, Trash2, Edit2, Check, X, CheckCircle2, Send } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  canComment,
  canDeleteOthersComment,
  canDeleteOwnComment,
  canResolveComment,
} from "@/lib/authorization";
import {
  createCommentRecord,
  deleteCommentRecord,
  setCommentResolved,
  updateCommentRecord,
} from "@/lib/comment-service";

export interface Comment {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  is_resolved: boolean;
  parent_id: string | null;
  profiles?: { display_name: string } | null;
  replies?: Comment[];
}

interface CommentThreadProps {
  comments: Comment[];
  entityId: string;
  entityType: "definition" | "ontology";
  onRefresh: () => void;
}

function CommentItem({ comment, entityId, entityType, onRefresh, depth = 0 }: {
  comment: Comment;
  entityId: string;
  entityType: string;
  onRefresh: () => void;
  depth?: number;
}) {
  const { user, role } = useAuth();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editText, setEditText] = useState(comment.content);
  const [loading, setLoading] = useState(false);

  const isOwner = user?.id === comment.user_id;
  const canReplyToComment = canComment(role);
  const canEditThisComment = isOwner;
  const canDeleteThisComment = isOwner
    ? canDeleteOwnComment(role)
    : canDeleteOthersComment(role);
  const canResolveThisComment = canResolveComment(role);
  const canShowActions = canEditThisComment || canDeleteThisComment || canResolveThisComment;
  const initials = (comment.profiles?.display_name || "U").slice(0, 2).toUpperCase();

  const handleReply = async () => {
    if (!replyText.trim() || !user || !canReplyToComment) return;
    setLoading(true);
    try {
      await createCommentRecord(supabase, {
        definitionId: entityId,
        userId: user.id,
        content: replyText.trim(),
        parentId: comment.id,
      });
      setReplyText("");
      setReplying(false);
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reply to comment");
    }
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!editText.trim() || !canEditThisComment) return;
    setLoading(true);
    try {
      await updateCommentRecord(supabase, {
        commentId: comment.id,
        content: editText.trim(),
      });
      setEditing(false);
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update comment");
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!canDeleteThisComment) {
      toast.error("You do not have permission to delete this comment.");
      return;
    }

    try {
      await deleteCommentRecord(supabase, comment.id);
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete comment");
    }
  };

  const handleResolve = async () => {
    if (!canResolveThisComment) {
      toast.error("You do not have permission to resolve this comment.");
      return;
    }

    try {
      await setCommentResolved(supabase, {
        commentId: comment.id,
        resolved: !comment.is_resolved,
      });
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update comment status");
    }
  };

  return (
    <div className={cn("group", depth > 0 && "ml-8 border-l-2 border-border/50 pl-4")}>
      <div className="flex gap-3 py-3">
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">{comment.profiles?.display_name || "User"}</span>
            <span className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</span>
            {comment.is_resolved && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">Resolved</Badge>}
          </div>
          {editing ? (
            <div className="space-y-2">
              <Textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleEdit} disabled={loading}><Check className="h-3 w-3 mr-1" />Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3 w-3 mr-1" />Cancel</Button>
              </div>
            </div>
          ) : (
            <MarkdownRenderer content={comment.content} className="text-sm" />
          )}
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canReplyToComment && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setReplying(true)}>
                <Reply className="h-3 w-3 mr-1" />Reply
              </Button>
            )}
            {canShowActions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    aria-label="Comment actions"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {canEditThisComment && (
                    <DropdownMenuItem onClick={() => { setEditText(comment.content); setEditing(true); }}>
                      <Edit2 className="h-3 w-3 mr-2" />Edit
                    </DropdownMenuItem>
                  )}
                  {canResolveThisComment && (
                    <DropdownMenuItem onClick={handleResolve}>
                      <CheckCircle2 className="h-3 w-3 mr-2" />{comment.is_resolved ? "Unresolve" : "Resolve"}
                    </DropdownMenuItem>
                  )}
                  {canDeleteThisComment && (
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                      <Trash2 className="h-3 w-3 mr-2" />Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {replying && canReplyToComment && (
            <div className="mt-2 space-y-2">
              <Textarea placeholder="Write a reply (markdown supported)..." value={replyText} onChange={e => setReplyText(e.target.value)} rows={2} className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleReply} disabled={loading || !replyText.trim()}>
                  <Send className="h-3 w-3 mr-1" />Reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {comment.replies?.map(reply => (
        <CommentItem key={reply.id} comment={reply} entityId={entityId} entityType={entityType} onRefresh={onRefresh} depth={depth + 1} />
      ))}
    </div>
  );
}

export function CommentThread({ comments, entityId, entityType, onRefresh }: CommentThreadProps) {
  const { user, role } = useAuth();
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const canPostComments = canComment(role);

  // Build threaded structure
  const commentMap = new Map<string, Comment>();
  comments.forEach(c => commentMap.set(c.id, { ...c, replies: [] }));
  const rootComments: Comment[] = [];
  commentMap.forEach(c => {
    if (c.parent_id && commentMap.has(c.parent_id)) {
      commentMap.get(c.parent_id)!.replies!.push(c);
    } else {
      rootComments.push(c);
    }
  });

  const handlePost = async () => {
    if (!newComment.trim() || !user || !canPostComments) return;
    setPosting(true);
    try {
      await createCommentRecord(supabase, {
        definitionId: entityId,
        userId: user.id,
        content: newComment.trim(),
      });
      setNewComment("");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to post comment");
    }
    setPosting(false);
  };

  return (
    <div className="space-y-4">
      {canPostComments && (
        <div className="space-y-2">
          <Textarea
            placeholder="Write a comment (markdown supported)..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handlePost} disabled={posting || !newComment.trim()}>
              <Send className="h-3 w-3 mr-1.5" />Post Comment
            </Button>
          </div>
        </div>
      )}
      {rootComments.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">No comments yet. Start the conversation!</div>
      ) : (
        <div className="divide-y divide-border/50">
          {rootComments.map(c => (
            <CommentItem key={c.id} comment={c} entityId={entityId} entityType={entityType} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
