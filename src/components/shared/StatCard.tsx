import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color?: string;
  loading?: boolean;
  onClick?: () => void;
}

export function StatCard({ label, value, icon: Icon, color = "text-primary", loading, onClick }: StatCardProps) {
  return (
    <Card
      className={cn("border-border/50 hover:border-border transition-colors", onClick && "cursor-pointer")}
      onClick={onClick}
    >
      <CardContent className="p-5">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
            </div>
            <div className={cn("w-10 h-10 rounded-lg bg-muted flex items-center justify-center", color)}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
