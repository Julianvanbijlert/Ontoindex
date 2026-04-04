import { useState } from "react";
import { CircleHelp, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { builtInStandardsPacks } from "@/lib/standards/engine/registry";
import type { StandardsRuntimeSettings, StandardsSeverity } from "@/lib/standards/engine/types";

interface StandardsSettingsPanelProps {
  settings: StandardsRuntimeSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onToggleStandard: (standardId: string, enabled: boolean) => void;
  onUpdateRuleSeverity: (ruleId: string, severity: StandardsSeverity) => void;
  onSave: () => void;
}

const severityOptions: Array<{ value: StandardsSeverity; label: string }> = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "blocking", label: "Blocking" },
];

function SeverityChoiceGroup({
  ruleTitle,
  value,
  onChange,
}: {
  ruleTitle: string;
  value: StandardsSeverity;
  onChange: (value: StandardsSeverity) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`${ruleTitle} severity`}
      className="inline-flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/20 p-1"
    >
      {severityOptions.map((severity) => {
        const checked = severity.value === value;

        return (
          <button
            key={severity.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${ruleTitle} ${severity.label}`}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              checked
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => onChange(severity.value)}
          >
            {severity.label}
          </button>
        );
      })}
    </div>
  );
}

export function StandardsSettingsPanel({
  settings,
  loading,
  saving,
  error,
  onToggleStandard,
  onUpdateRuleSeverity,
  onSave,
}: StandardsSettingsPanelProps) {
  const [severityHelpOpen, setSeverityHelpOpen] = useState(false);

  return (
    <Card className="border-border/50">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Standards Compliance</CardTitle>
          <CardDescription>
            Standards are global for now. Ontology-scoped standards selection is intentionally deferred until the repository has a clean project-scoped settings model.
          </CardDescription>
        </div>
        <TooltipProvider delayDuration={0}>
          <Tooltip open={severityHelpOpen} onOpenChange={setSeverityHelpOpen}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 self-start"
                aria-label="Severity meanings"
                onMouseEnter={() => setSeverityHelpOpen(true)}
                onMouseLeave={() => setSeverityHelpOpen(false)}
                onFocus={() => setSeverityHelpOpen(true)}
                onBlur={() => setSeverityHelpOpen(false)}
              >
                <CircleHelp className="h-4 w-4" />
                Severity meanings
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm space-y-2 p-3">
              <p><span className="font-medium">Info:</span> optional guidance / best-practice hint.</p>
              <p><span className="font-medium">Warning:</span> non-blocking standards issue that should usually be addressed.</p>
              <p><span className="font-medium">Error:</span> more serious standards issue, but still not necessarily blocked unless workflow treats it as such.</p>
              <p><span className="font-medium">Blocking:</span> prevents save/create/export where the compliance flow enforces blocking findings.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading standards settings...
          </div>
        ) : settings ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              {builtInStandardsPacks.map((pack) => {
                const enabled = settings.enabledStandards.includes(pack.standardId);

                return (
                  <Card key={pack.standardId} className="border-border/50">
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-sm">{pack.label}</CardTitle>
                            <Badge variant={enabled ? "default" : "outline"}>
                              {enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                          <CardDescription>{pack.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Enable</span>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(value) => onToggleStandard(pack.standardId, value)}
                            aria-label={`Enable ${pack.label}`}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {pack.rules.map((rule) => {
                        const currentSeverity = settings.ruleOverrides[rule.ruleId] || rule.defaultSeverity;

                        return (
                          <div key={rule.ruleId} className="rounded-lg border border-border/50 p-3">
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">{rule.title}</p>
                                <p className="text-xs text-muted-foreground">{rule.description}</p>
                                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                  <span>Default: {rule.defaultSeverity}</span>
                                  <span>Category: {rule.category}</span>
                                  <span>Scope: {rule.scope}</span>
                                  <span>Status: {rule.implementationStatus}</span>
                                </div>
                              </div>
                              <SeverityChoiceGroup
                                ruleTitle={rule.title}
                                value={currentSeverity}
                                onChange={(severity) => onUpdateRuleSeverity(rule.ruleId, severity)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Standards Settings
            </Button>
          </>
        ) : (
          <p className="text-sm text-destructive">{error || "Unable to load standards settings."}</p>
        )}
      </CardContent>
    </Card>
  );
}
