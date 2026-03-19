import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getWorkflowStatusMeta } from "@/lib/workflow-status";

export function StatusBadge({ status }: { status: string }) {
  const meta = getWorkflowStatusMeta(status);

  return (
    <Badge variant="outline" className={cn("text-xs font-medium", meta.badgeClass)}>
      {meta.label}
    </Badge>
  );
}

const priorityStyles: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-info/10 text-info border-info/20",
  high: "bg-warning/10 text-warning border-warning/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", priorityStyles[priority] || "")}>
      {priority}
    </Badge>
  );
}
