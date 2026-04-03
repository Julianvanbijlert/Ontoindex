import { useEffect, useMemo, useState } from "react";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Plus, Trash2, Search, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { emitAppDataChanged } from "@/lib/entity-events";
import {
  createRelationshipRecord,
  CUSTOM_RELATION_TYPE,
  deleteRelationshipRecord,
  formatRelationshipType,
  getRelationshipDisplayLabel,
  predefinedRelationshipTypes,
} from "@/lib/relationship-service";
import { canManageRelationships } from "@/lib/authorization";
import { useStandardsRuntimeSettings } from "@/hooks/use-standards-runtime-settings";
import { evaluateRelationshipStandardsCompliance } from "@/lib/standards/compliance";
import { StandardsFindingsPanel } from "@/components/shared/StandardsFindingsPanel";

interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  label?: string | null;
  type: string;
  source?: { id?: string; title: string } | null;
  target?: { id?: string; title: string } | null;
}

interface RelationshipPanelProps {
  entityId: string;
  entityTitle?: string;
  entityMetadata?: Json | null;
  relationships: Relationship[];
  onRefresh: () => void;
  allowCreate?: boolean;
  onRelationClick?: (definitionId: string) => void;
}

function getRelatedDefinition(relationship: Relationship, entityId: string) {
  if (relationship.source_id === entityId) {
    return {
      id: relationship.target_id,
      title: relationship.target?.title || "Unknown definition",
      directionLabel: "Target",
    };
  }

  if (relationship.target_id === entityId) {
    return {
      id: relationship.source_id,
      title: relationship.source?.title || "Unknown definition",
      directionLabel: "Source",
    };
  }

  return {
    id: relationship.target_id,
    title: relationship.target?.title || "Unknown definition",
    directionLabel: "Target",
  };
}

export function RelationshipPanel({
  entityId,
  entityTitle,
  entityMetadata,
  relationships,
  onRefresh,
  allowCreate = true,
  onRelationClick,
}: RelationshipPanelProps) {
  const { user, role } = useAuth();
  const { settings } = useStandardsRuntimeSettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetResults, setTargetResults] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [relType, setRelType] = useState<string>(predefinedRelationshipTypes[0]);
  const [customRelationType, setCustomRelationType] = useState("");
  const [selectedSuggestionMetadata, setSelectedSuggestionMetadata] = useState<Json | null>(null);
  const [creating, setCreating] = useState(false);
  const canMutateRelationships = allowCreate && canManageRelationships(role);
  const relationshipCompliance = useMemo(
    () => {
      if (!settings) {
        return {
          findings: [],
          relationSuggestions: [],
          hasBlockingFindings: false,
          summary: {
            info: 0,
            warning: 0,
            error: 0,
            blocking: 0,
          },
        };
      }

      return evaluateRelationshipStandardsCompliance({
        sourceDefinition: {
          id: entityId,
          title: entityTitle || "Source definition",
          metadata: entityMetadata,
        },
        targetDefinition: selectedTarget
          ? {
              id: selectedTarget.id,
              title: selectedTarget.title,
              metadata: selectedTarget.metadata,
            }
          : null,
        selectedType: relType,
        customType: customRelationType,
        relationshipMetadata: selectedSuggestionMetadata,
        settings,
      });
    },
    [customRelationType, entityId, entityMetadata, entityTitle, relType, selectedSuggestionMetadata, selectedTarget, settings],
  );

  useEffect(() => {
    if (!targetSearch.trim()) { setTargetResults([]); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("definitions")
        .select("id, title, metadata")
        .ilike("title", `%${targetSearch}%`)
        .neq("id", entityId)
        .limit(8);
      setTargetResults(data || []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [targetSearch, entityId]);

  const handleCreate = async () => {
    if (!canMutateRelationships) {
      toast.error("Your current role is read-only.");
      return;
    }

    if (!selectedTarget || !user) return;
    if (relType === CUSTOM_RELATION_TYPE && !customRelationType.trim()) {
      toast.error("Enter a custom relationship type.");
      return;
    }

    setCreating(true);
    try {
      await createRelationshipRecord(supabase, {
        sourceId: entityId,
        targetId: selectedTarget.id,
        selectedType: relType as any,
        customType: customRelationType,
        createdBy: user.id,
        metadata: selectedSuggestionMetadata || undefined,
        standards: {
          sourceDefinition: {
            title: entityTitle,
            metadata: entityMetadata,
          },
          targetDefinition: {
            title: selectedTarget.title,
            metadata: selectedTarget.metadata,
          },
        },
      });
      toast.success("Relationship added");
      setDialogOpen(false);
      setSelectedTarget(null);
      setTargetSearch("");
      setCustomRelationType("");
      setSelectedSuggestionMetadata(null);
      setRelType(predefinedRelationshipTypes[0]);
      emitAppDataChanged({ entityType: "relationship", action: "created", entityId: selectedTarget.id });
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add relationship");
    }
    setCreating(false);
  };

  const handleDelete = async (relId: string) => {
    if (!canMutateRelationships) {
      toast.error("Your current role is read-only.");
      return;
    }

    const relationship = relationships.find((item) => item.id === relId);

    if (!relationship) {
      toast.error("Relationship not found");
      return;
    }

    try {
      await deleteRelationshipRecord(supabase, {
        relationshipId: relId,
        sourceId: relationship.source_id,
        targetId: relationship.target_id,
        type: relationship.type,
        label: relationship.label,
        deletedBy: user?.id,
      });
      emitAppDataChanged({ entityType: "relationship", action: "deleted", entityId: relId });
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove relationship");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{relationships.length} relationship{relationships.length !== 1 ? "s" : ""}</p>
        {canMutateRelationships && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setSelectedSuggestionMetadata(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1.5" />Add Relationship</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Relationship</DialogTitle>
                <DialogDescription>
                  Create a relationship to another definition. Standards suggestions are shown when they are available.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Target Definition</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search definitions..."
                      className="pl-9"
                      value={targetSearch}
                      onChange={e => { setTargetSearch(e.target.value); setSelectedTarget(null); }}
                    />
                  </div>
                  {selectedTarget ? (
                    <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-sm flex items-center justify-between">
                      <span className="font-medium text-foreground">{selectedTarget.title}</span>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTarget(null)} className="h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ) : targetResults.length > 0 && (
                    <div className="border border-border rounded-lg divide-y divide-border/50 max-h-40 overflow-y-auto">
                      {targetResults.map(d => (
                        <button key={d.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-foreground" onClick={() => { setSelectedTarget(d); setTargetSearch(d.title); }}>
                          {d.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Relationship Type</Label>
                  <Select value={relType} onValueChange={(value) => {
                    setRelType(value);
                    setSelectedSuggestionMetadata(null);
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {predefinedRelationshipTypes.map(t => (
                        <SelectItem key={t} value={t}>{formatRelationshipType(t)}</SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_RELATION_TYPE}>Custom type</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Prefer a suggested standards-aligned relation when possible, or switch to a custom type.
                  </p>
                  {relType === CUSTOM_RELATION_TYPE && (
                    <Input
                      placeholder="Enter a custom relation type"
                      value={customRelationType}
                      onChange={e => {
                        setCustomRelationType(e.target.value);
                        setSelectedSuggestionMetadata(null);
                      }}
                    />
                  )}
                </div>
                {relationshipCompliance.relationSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Suggested compliant relations</p>
                      <p className="text-xs text-muted-foreground">
                        Choose a recommended relation or keep the custom option if you need something else.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {relationshipCompliance.relationSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/50"
                          onClick={() => {
                            setRelType(suggestion.selectedType);
                            setCustomRelationType(suggestion.customType || "");
                            setSelectedSuggestionMetadata(suggestion.metadata || null);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{suggestion.label}</p>
                            <Badge variant="outline" className="bg-background/70 text-[10px]">
                              {suggestion.standardId}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{suggestion.explanation}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {relationshipCompliance.findings.length > 0 && (
                  <StandardsFindingsPanel
                    title="Current relationship findings"
                    findings={relationshipCompliance.findings}
                    summary={relationshipCompliance.summary}
                    emptyMessage="No active standards findings for this relationship."
                  />
                )}
                <Button onClick={handleCreate} className="w-full" disabled={!selectedTarget || creating}>
                  Add Relationship
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {relationships.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <GitBranch className="h-6 w-6 mx-auto mb-2 opacity-50" />
          No relationships defined
        </div>
      ) : (
        <div className="space-y-2">
          {relationships.map(r => {
            const relatedDefinition = getRelatedDefinition(r, entityId);
            const isClickable = Boolean(onRelationClick);

            return (
              <Card key={r.id} className="border-border/50">
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
                      onClick={() => onRelationClick?.(relatedDefinition.id)}
                      disabled={!isClickable}
                    >
                      <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{getRelationshipDisplayLabel(r.type, r.label)}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {relatedDefinition.directionLabel}
                          </Badge>
                        </div>
                        <div className="text-sm font-medium text-foreground truncate">
                          {relatedDefinition.title}
                        </div>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    </button>
                    {canMutateRelationships && (
                      <div className="flex items-center pr-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(r.id)}
                          aria-label="Delete relationship"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
