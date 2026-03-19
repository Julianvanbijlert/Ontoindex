import { Clock, Edit2, GitPullRequest, MessageSquare, Heart, GitBranch, Plus, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  id: string;
  action: string;
  actor?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

const actionConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  created: { icon: Plus, color: "bg-success/10 text-success", label: "Created" },
  updated: { icon: Edit2, color: "bg-info/10 text-info", label: "Edited" },
  status_changed: { icon: GitPullRequest, color: "bg-warning/10 text-warning", label: "Status changed" },
  comment_added: { icon: MessageSquare, color: "bg-primary/10 text-primary", label: "Comment added" },
  relationship_added: { icon: GitBranch, color: "bg-accent/10 text-accent", label: "Relationship added" },
  relationship_removed: { icon: GitBranch, color: "bg-destructive/10 text-destructive", label: "Relationship removed" },
  requested_review: { icon: GitPullRequest, color: "bg-warning/10 text-warning", label: "Approval requested" },
  accepted_review: { icon: GitPullRequest, color: "bg-success/10 text-success", label: "Approval accepted" },
  rejected_review: { icon: GitPullRequest, color: "bg-destructive/10 text-destructive", label: "Approval rejected" },
  viewed: { icon: Search, color: "bg-muted text-muted-foreground", label: "Viewed" },
  imported: { icon: Plus, color: "bg-info/10 text-info", label: "Imported" },
  liked: { icon: Heart, color: "bg-destructive/10 text-destructive", label: "Liked" },
  favorited: { icon: Heart, color: "bg-destructive/10 text-destructive", label: "Favorited" },
};

export function ActivityTimeline({ events, emptyMessage = "No activity yet" }: { events: TimelineEvent[]; emptyMessage?: string }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-6 w-6 mb-2 opacity-50" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />
      {events.map((event, i) => {
        const config = actionConfig[event.action] || actionConfig.updated;
        const Icon = config.icon;
        return (
          <div key={event.id} className="relative flex gap-3 py-3">
            <div className={cn("z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center", config.color)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{config.label}</span>
                {event.actor && (
                  <span className="text-xs text-muted-foreground">by {event.actor}</span>
                )}
              </div>
              {event.metadata?.summary && (
                <p className="text-xs text-muted-foreground mt-0.5">{event.metadata.summary}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(event.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
