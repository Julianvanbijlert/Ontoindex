import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { editableRoles, getPrimaryRole, type EditableRole, updateMyRole } from "@/lib/role-service";

export default function Profile() {
  const { profile, roles, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [form, setForm] = useState({
    display_name: profile?.display_name || "",
    bio: profile?.bio || "",
    team: profile?.team || "",
  });
  const currentRole = getPrimaryRole(roles);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: form.display_name.trim(),
      bio: form.bio.trim(),
      team: form.team.trim(),
    }).eq("user_id", profile.user_id);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated");
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
  };

  const handleRoleChange = async (nextRole: EditableRole) => {
    setRoleSaving(true);

    try {
      await updateMyRole(supabase, nextRole);
      await refreshProfile();
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update role");
    }

    setRoleSaving(false);
  };

  const initials = profile?.display_name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Profile</h1>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{profile?.display_name}</h2>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <div className="flex gap-1 mt-1">
                {roles.map(r => <Badge key={r} variant="secondary" className="text-xs capitalize">{r}</Badge>)}
              </div>
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input value={form.display_name} onChange={e => setForm(p => ({...p, display_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea value={form.bio} onChange={e => setForm(p => ({...p, bio: e.target.value}))} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Team</Label>
                <Input value={form.team} onChange={e => setForm(p => ({...p, team: e.target.value}))} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Bio</p>
                <p className="text-foreground">{profile?.bio || "No bio yet"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Team</p>
                <p className="text-foreground">{profile?.team || "No team set"}</p>
              </div>
              <Button variant="outline" onClick={() => { setForm({ display_name: profile?.display_name || "", bio: profile?.bio || "", team: profile?.team || "" }); setEditing(true); }}>
                Edit Profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Account Info</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="text-foreground">{profile?.email}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Member since</span><span className="text-foreground">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "-"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Roles</span><span className="text-foreground capitalize">{roles.join(", ") || "none"}</span></div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Role</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Your role</Label>
            <Select value={currentRole} onValueChange={(value) => handleRoleChange(value as EditableRole)} disabled={roleSaving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {editableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Viewer is read-only. Editor can create and edit ontology content. Admin keeps full access, including user management.
          </p>
          {roleSaving && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating role...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
