import type { Json } from "@/integrations/supabase/types";
import { AlertCircle, GitBranch } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { RelationshipPanel } from "@/components/shared/RelationshipPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DefinitionRelationsSectionProps {
  entityId: string;
  entityTitle?: string;
  entityMetadata?: Json | null;
  relationships: any[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  allowCreate?: boolean;
}

export function DefinitionRelationsSection({
  entityId,
  entityTitle,
  entityMetadata,
  relationships,
  loading,
  error,
  onRefresh,
  allowCreate = true,
}: DefinitionRelationsSectionProps) {
  const navigate = useNavigate();

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          Relations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <RelationshipPanel
            entityId={entityId}
            entityTitle={entityTitle}
            entityMetadata={entityMetadata}
            relationships={relationships}
            onRefresh={onRefresh}
            allowCreate={allowCreate}
            onRelationClick={(definitionId) => navigate(`/definitions/${definitionId}`)}
          />
        )}
      </CardContent>
    </Card>
  );
}
