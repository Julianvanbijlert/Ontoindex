import { Badge } from "@/components/ui/badge";
import { Shield, Eye, Edit2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const roleConfig: Record<string, { icon: React.ElementType; className: string }> = {
  admin: { icon: Shield, className: "bg-destructive/10 text-destructive border-destructive/20" },
  reviewer: { icon: UserCheck, className: "bg-warning/10 text-warning border-warning/20" },
  editor: { icon: Edit2, className: "bg-info/10 text-info border-info/20" },
  viewer: { icon: Eye, className: "bg-muted text-muted-foreground border-border" },
};

export function RoleBadge({ role }: { role: string }) {
  const config = roleConfig[role] || roleConfig.viewer;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("text-xs gap-1 capitalize", config.className)}>
      <Icon className="h-3 w-3" />
      {role}
    </Badge>
  );
}
