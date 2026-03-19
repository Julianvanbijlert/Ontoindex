import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Search, Users, Shield, Edit2, Eye, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  team: string | null;
  created_at: string;
  roles: string[];
}

export default function AdminUsers() {
  const { hasRole } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    const roleMap = new Map<string, string[]>();
    (rolesRes.data || []).forEach((r: any) => {
      if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
      roleMap.get(r.user_id)!.push(r.role);
    });

    const mapped: UserProfile[] = (profilesRes.data || []).map((p: any) => ({
      ...p,
      roles: roleMap.get(p.user_id) || ["viewer"],
    }));
    setUsers(mapped);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const filteredUsers = users.filter(u => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!u.display_name.toLowerCase().includes(q) && !(u.email || "").toLowerCase().includes(q)) return false;
    }
    if (roleFilter !== "all" && !u.roles.includes(roleFilter)) return false;
    return true;
  });

  const handleSave = async () => {
    if (!editUser) return;
    setSaving(true);
    // Update team
    await supabase.from("profiles").update({ team: editTeam }).eq("user_id", editUser.user_id);
    // Update role
    if (editRole && editRole !== editUser.roles[0]) {
      await supabase.from("user_roles").delete().eq("user_id", editUser.user_id);
      await supabase.from("user_roles").insert({ user_id: editUser.user_id, role: editRole as any });
    }
    toast.success("User updated");
    setEditUser(null);
    fetchUsers();
    setSaving(false);
  };

  if (!hasRole("admin")) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState icon={<Shield className="w-6 h-6" />} title="Access Denied" description="You need admin privileges to access user management" />
      </div>
    );
  }

  const adminCount = users.filter(u => u.roles.includes("admin")).length;
  const editorCount = users.filter(u => u.roles.includes("editor")).length;
  const viewerCount = users.filter(u => u.roles.includes("viewer")).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader title="User Management" description="Manage users, roles, and teams" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Admins" value={adminCount} icon={Shield} color="text-destructive" loading={loading} />
        <StatCard label="Editors" value={editorCount} icon={Edit2} color="text-info" loading={loading} />
        <StatCard label="Viewers" value={viewerCount} icon={Eye} color="text-muted-foreground" loading={loading} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="reviewer">Reviewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title="No users found" description="No users match your search criteria" />
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-muted">{u.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{u.display_name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">{u.roles.map(r => <RoleBadge key={r} role={r} />)}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.team || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setEditUser(u); setEditRole(u.roles[0] || "viewer"); setEditTeam(u.team || ""); }}>
                        <Edit2 className="h-3 w-3 mr-1" />Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editUser} onOpenChange={v => { if (!v) setEditUser(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-muted">{editUser.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">{editUser.display_name}</p>
                  <p className="text-xs text-muted-foreground">{editUser.email}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Team</Label>
                <Input value={editTeam} onChange={e => setEditTeam(e.target.value)} placeholder="Team name" />
              </div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
