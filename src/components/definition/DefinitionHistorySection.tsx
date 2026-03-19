import { AlertCircle, Clock } from "lucide-react";

import { ActivityTimeline, type TimelineEvent } from "@/components/shared/ActivityTimeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DefinitionHistorySectionProps {
  events: TimelineEvent[];
  loading: boolean;
  error?: string | null;
}

export function DefinitionHistorySection({
  events,
  loading,
  error,
}: DefinitionHistorySectionProps) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <ActivityTimeline events={events} emptyMessage="No history has been recorded for this definition yet." />
        )}
      </CardContent>
    </Card>
  );
}

