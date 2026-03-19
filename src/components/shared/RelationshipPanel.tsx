import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Plus, Trash2, Search, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";

interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  source?: { title: string } | null;
  target?: { title: string } | null;
}

interface RelationshipPanelProps {
  entityId: string;
  relationships: Relationship[];
  onRefresh: () => void;
}

const relationshipTypes = Constants.public.Enums.relationship_type;

export function RelationshipPanel({ entityId, relationships, onRefresh }: RelationshipPanelProps) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetSearch, setTargetSearch] = useState("");
  const [targetResults, setTargetResults] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [relType, setRelType] = useState<string>(relationshipTypes[0]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!targetSearch.trim()) { setTargetResults([]); return; }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("definitions")
        .select("id, title")
        .ilike("title", `%${targetSearch}%`)
        .neq("id", entityId)
        .limit(8);
      setTargetResults(data || []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [targetSearch, entityId]);

  const handleCreate = async () => {
    if (!selectedTarget || !user) return;
    setCreating(true);
    const { error } = await supabase.from("relationships").insert({
      source_id: entityId,
      target_id: selectedTarget.id,
      type: relType as any,
      created_by: user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Relationship added");
      setDialogOpen(false);
      setSelectedTarget(null);
      setTargetSearch("");
      onRefresh();
    }
    setCreating(false);
  };

  const handleDelete = async (relId: string) => {
    const { error } = await supabase.from("relationships").delete().eq("id", relId);
    if (error) toast.error(error.message);
    else onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{relationships.length} relationship{relationships.length !== 1 ? "s" : ""}</p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1.5" />Add Relationship</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add Relationship</DialogTitle></DialogHeader>
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
                <Select value={relType} onValueChange={setRelType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {relationshipTypes.map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={!selectedTarget || creating}>
                Add Relationship
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {relationships.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <GitBranch className="h-6 w-6 mx-auto mb-2 opacity-50" />
          No relationships defined
        </div>
      ) : (
        <div className="space-y-2">
          {relationships.map(r => (
            <Card key={r.id} className="border-border/50">
              <CardContent className="p-3 flex items-center gap-3">
                <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{r.source?.title || "This"}</span>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">{r.type.replace(/_/g, " ")}</Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{r.target?.title || "Unknown"}</span>
                <div className="ml-auto flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
