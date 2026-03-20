import { Badge } from "@/components/ui/badge";
import { Shield, Eye, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeRole, type RoleInput } from "@/lib/authorization";

const roleConfig: Record<"admin" | "editor" | "viewer", { icon: React.ElementType; className: string }> = {
  admin: { icon: Shield, className: "bg-destructive/10 text-destructive border-destructive/20" },
  editor: { icon: Edit2, className: "bg-info/10 text-info border-info/20" },
  viewer: { icon: Eye, className: "bg-muted text-muted-foreground border-border" },
};

export function RoleBadge({ role }: { role: RoleInput }) {
  const normalizedRole = normalizeRole(role);
  const config = roleConfig[normalizedRole];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("text-xs gap-1 capitalize", config.className)}>
      <Icon className="h-3 w-3" />
      {normalizedRole}
    </Badge>
  );
}
