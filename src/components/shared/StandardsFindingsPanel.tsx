import { AlertCircle, AlertTriangle, Ban, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StandardsFinding, StandardsSummary } from "@/lib/standards/engine/types";

interface StandardsFindingsPanelProps {
  title?: string;
  findings: StandardsFinding[];
  summary: StandardsSummary;
  emptyMessage?: string;
}

const iconBySeverity = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  blocking: Ban,
} as const;

const toneBySeverity = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  blocking: "border-red-300 bg-red-100 text-red-950",
} as const;

export function StandardsFindingsPanel({
  title = "Standards compliance",
  findings,
  summary,
  emptyMessage = "No standards findings for the current view.",
}: StandardsFindingsPanelProps) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Info: {summary.info}</Badge>
          <Badge variant="outline">Warnings: {summary.warning}</Badge>
          <Badge variant="outline">Errors: {summary.error}</Badge>
          <Badge variant="outline">Blocking: {summary.blocking}</Badge>
        </div>
        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {findings.map((finding) => {
              const Icon = iconBySeverity[finding.effectiveSeverity];
              return (
                <div
                  key={finding.id}
                  className={`rounded-lg border p-3 ${toneBySeverity[finding.effectiveSeverity]}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{finding.message}</p>
                        <Badge variant="outline" className="bg-white/70 capitalize">
                          {finding.effectiveSeverity}
                        </Badge>
                        <Badge variant="outline" className="bg-white/70">
                          {finding.standardId}
                        </Badge>
                      </div>
                      <p className="text-xs">{finding.explanation}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
