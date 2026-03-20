import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Search, Users, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { canManageUsers, type AppRole } from "@/lib/authorization";
import { canAccessPath, getDefaultRouteForRole } from "@/lib/app-access";
import { fetchPrimaryRolesForUsers, updateUserRoleAsAdmin } from "@/lib/role-service";

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  team: string | null;
  created_at: string;
  role: AppRole;
}

export default function AdminUsers() {
  const { role, user, syncCurrentUserRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [pendingRoles, setPendingRoles] = useState<Record<string, AppRole>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const canManageUserRoles = canManageUsers(role);

  const fetchUsers = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, display_name, email, team, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const profiles = (data || []) as Array<Omit<UserProfile, "role">>;
    let rolesByUserId: Record<string, AppRole>;

    try {
      rolesByUserId = await fetchPrimaryRolesForUsers(
        supabase,
        profiles.map((profile) => profile.user_id),
      );
    } catch (roleError) {
      toast.error(roleError instanceof Error ? roleError.message : "Unable to load user roles");
      setLoading(false);
      return;
    }

    const loadedUsers = profiles.map((profile) => ({
      ...profile,
      role: rolesByUserId[profile.user_id] || "viewer",
    })) as UserProfile[];
    setUsers(loadedUsers);
    setPendingRoles(
      Object.fromEntries(loadedUsers.map((user) => [user.user_id, user.role])) as Record<string, AppRole>,
    );
    setLoading(false);
  };

  useEffect(() => {
    if (!canManageUserRoles) {
      setLoading(false);
      return;
    }

    fetchUsers();
  }, [canManageUserRoles]);

  const filteredUsers = users.filter((user) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();

      if (
        !user.display_name.toLowerCase().includes(query) &&
        !(user.email || "").toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    if (roleFilter !== "all" && user.role !== roleFilter) {
      return false;
    }

    return true;
  });

  const handleSave = async (targetUser: UserProfile) => {
    const nextRole = pendingRoles[targetUser.user_id] || targetUser.role;

    if (nextRole === targetUser.role) {
      toast.success("User role already up to date");
      return;
    }

    setSavingUserId(targetUser.user_id);

    try {
      const result = await updateUserRoleAsAdmin(supabase, targetUser.user_id, nextRole);

      if (result.userId === user?.id) {
        await syncCurrentUserRole(result.role);
      }

      toast.success(result.message);
      await fetchUsers();

      if (result.userId === user?.id && !canAccessPath(result.role, location.pathname)) {
        navigate(getDefaultRouteForRole(result.role), { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the user role");
      setSavingUserId(null);
      return;
    }

    setSavingUserId(null);
  };

  if (!canManageUserRoles) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState
          icon={<Shield className="w-6 h-6" />}
          title="Access Denied"
          description="You need admin privileges to access user management"
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="User Role Management" description="Admin-only role management for all users" />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="pl-9"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "all" | AppRole)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="No users found"
          description="No users match your search criteria"
        />
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-muted">
                            {user.display_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.display_name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground">{user.email || "-"}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <RoleBadge role={user.role} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={pendingRoles[user.user_id] || user.role}
                          onValueChange={(value) =>
                            setPendingRoles((current) => ({
                              ...current,
                              [user.user_id]: value as AppRole,
                            }))
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          onClick={() => handleSave(user)}
                          disabled={savingUserId === user.user_id || (pendingRoles[user.user_id] || user.role) === user.role}
                        >
                          {savingUserId === user.user_id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
