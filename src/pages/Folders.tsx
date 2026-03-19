import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { FolderOpen, Plus, Loader2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function Folders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    const { data } = await supabase.from("folders").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setFolders(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setCreating(true);
    const { error } = await supabase.from("folders").insert({ user_id: user.id, name: name.trim() });
    if (error) toast.error(error.message);
    else { toast.success("Folder created"); setDialogOpen(false); setName(""); fetchData(); }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("folders").delete().eq("id", id);
    toast.success("Folder deleted");
    fetchData();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Folders</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />New Folder</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Folder</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <Input placeholder="Folder name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} />
              <Button onClick={handleCreate} className="w-full" disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : folders.length === 0 ? (
        <EmptyState icon={<FolderOpen className="w-6 h-6" />} title="No folders" description="Create folders to organize your saved items" action={{ label: "Create Folder", onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {folders.map(f => (
            <Card key={f.id} className="border-border/50 hover:border-border transition-colors group">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FolderOpen className="h-5 w-5 text-warning" />
                  <span className="font-medium text-foreground">{f.name}</span>
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(f.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
