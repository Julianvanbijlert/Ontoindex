import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  getRolePermissions,
  hasPermission,
  pickHighestRole,
  type AppRole,
  type PermissionKey,
  type RolePermissions,
} from "@/lib/authorization";
import { fetchPrimaryRoleForUser } from "@/lib/role-service";

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  bio: string;
  team: string;
  dark_mode: boolean;
  view_preference: string;
  format_preference: string;
  sort_preference: string;
  group_by_preference: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole;
  roles: AppRole[];
  permissions: RolePermissions;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: (options?: { fallbackRole?: AppRole; preserveExistingOnError?: boolean }) => Promise<void>;
  refreshAuthState: (options?: { fallbackRole?: AppRole; preserveExistingOnError?: boolean }) => Promise<void>;
  setCurrentRole: (role: AppRole) => void;
  syncCurrentUserRole: (role: AppRole) => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  can: (permission: PermissionKey) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole>("viewer");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const applyProfileState = (nextProfile: Profile | null, nextRoles: AppRole[] = []) => {
    setProfile(nextProfile);
    const normalizedRoles = nextProfile
      ? Array.from(new Set((nextRoles.length > 0 ? nextRoles : ["viewer"]) as AppRole[]))
      : [];
    setRoles(normalizedRoles);
    setRole(nextProfile ? pickHighestRole(normalizedRoles) : "viewer");
  };

  const fetchProfile = async (
    userId: string,
    options: { fallbackRole?: AppRole; preserveExistingOnError?: boolean } = {},
  ) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, display_name, email, avatar_url, created_at, bio, team, dark_mode, view_preference, format_preference, sort_preference, group_by_preference")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      if (error) {
        console.error("Failed to load the current user profile", {
          userId,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          path: "AuthContext.fetchProfile",
        });
      }

      if (!options.preserveExistingOnError) {
        applyProfileState(null);
      }

      throw new Error("Unable to load the current user profile.");
    }

    try {
      const nextRole = await fetchPrimaryRoleForUser(supabase, userId);
      applyProfileState(data as Profile, [nextRole]);
    } catch (roleError) {
      const fallbackRole = options.fallbackRole ?? (userId === user?.id ? role : "viewer");
      console.error("Failed to load the current user role", {
        userId,
        path: "AuthContext.fetchProfile.role",
        error: roleError,
        fallbackRole,
      });
      applyProfileState(data as Profile, [fallbackRole]);
      throw new Error("Unable to load the current user role.");
    }
  };

  const refreshProfile = async (options: { fallbackRole?: AppRole; preserveExistingOnError?: boolean } = {}) => {
    if (user) {
      await fetchProfile(user.id, options);
    }
  };

  const refreshAuthState = async (options: { fallbackRole?: AppRole; preserveExistingOnError?: boolean } = {}) => {
    const { data: { session: nextSession } } = await supabase.auth.getSession();

    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (nextSession?.user) {
      await fetchProfile(nextSession.user.id, options);
      return;
    }

    applyProfileState(null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id).catch(() => undefined);
          }, 0);
        } else {
          applyProfileState(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).catch(() => undefined);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (profile?.dark_mode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [profile?.dark_mode]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    applyProfileState(null);
  };

  const setCurrentRole = (nextRole: AppRole) => {
    setRole(nextRole);
    setRoles([nextRole]);
  };

  const syncCurrentUserRole = async (nextRole: AppRole) => {
    setCurrentRole(nextRole);

    const currentUserId = user?.id || session?.user?.id;

    if (!currentUserId) {
      return;
    }

    try {
      await refreshAuthState({
        fallbackRole: nextRole,
        preserveExistingOnError: true,
      });
    } catch (error) {
      console.error("Failed to refresh auth state after updating the current user role", {
        nextRole,
        error,
      });

      try {
        await refreshProfile({
          fallbackRole: nextRole,
          preserveExistingOnError: true,
        });
      } catch (profileError) {
        console.error("Failed to refresh the current user profile after a role update", {
          nextRole,
          profileError,
        });
      }
    }
  };
  const permissions = getRolePermissions(role);
  const hasRole = (targetRole: AppRole) => role === targetRole;
  const can = (permission: PermissionKey) => hasPermission(role, permission);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        roles,
        permissions,
        loading,
        signOut,
        refreshProfile,
        refreshAuthState,
        setCurrentRole,
        syncCurrentUserRole,
        hasRole,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
