import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommentThread, type Comment } from "./CommentThread";
import { ActivityTimeline, type TimelineEvent } from "./ActivityTimeline";
import { RelationshipPanel } from "./RelationshipPanel";
import { MessageSquare, Clock, GitBranch } from "lucide-react";

interface EntityActivityPanelProps {
  entityId: string;
  entityType: "definition" | "ontology";
  comments: Comment[];
  timelineEvents: TimelineEvent[];
  relationships: any[];
  onRefresh: () => void;
  allowRelationshipCreate?: boolean;
}

export function EntityActivityPanel({
  entityId,
  entityType,
  comments,
  timelineEvents,
  relationships,
  onRefresh,
  allowRelationshipCreate = true,
}: EntityActivityPanelProps) {
  return (
    <Tabs defaultValue="comments" className="w-full">
      <TabsList className="w-full grid grid-cols-3">
        <TabsTrigger value="comments" className="gap-1.5 text-xs sm:text-sm">
          <MessageSquare className="h-3.5 w-3.5" />
          Comments ({comments.length})
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
          <Clock className="h-3.5 w-3.5" />
          History ({timelineEvents.length})
        </TabsTrigger>
        <TabsTrigger value="relationships" className="gap-1.5 text-xs sm:text-sm">
          <GitBranch className="h-3.5 w-3.5" />
          Relations ({relationships.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="comments" className="mt-4">
        <CommentThread
          comments={comments}
          entityId={entityId}
          entityType={entityType}
          onRefresh={onRefresh}
        />
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        <ActivityTimeline events={timelineEvents} />
      </TabsContent>

      <TabsContent value="relationships" className="mt-4">
        <RelationshipPanel
          entityId={entityId}
          relationships={relationships}
          onRefresh={onRefresh}
          allowCreate={allowRelationshipCreate}
        />
      </TabsContent>
    </Tabs>
  );
}
