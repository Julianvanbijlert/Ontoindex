import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  actions?: ReactNode;
  badges?: ReactNode;
}

export function PageHeader({ title, description, backTo, actions, badges }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {backTo && (
          <Button variant="ghost" size="icon" className="flex-shrink-0 mt-0.5" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
          {badges && <div className="flex items-center gap-2 mt-1 flex-wrap">{badges}</div>}
          {description && <p className="text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
