import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const profilesSingle = vi.fn();
const profilesEq = vi.fn().mockReturnValue({ single: profilesSingle });
const profilesSelect = vi.fn().mockReturnValue({ eq: profilesEq });

const userRolesIn = vi.fn();
const userRolesSelect = vi.fn().mockReturnValue({ in: userRolesIn });

const getSession = vi.fn();
const onAuthStateChange = vi.fn(() => ({
  data: {
    subscription: {
      unsubscribe: vi.fn(),
    },
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChange(...args),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: profilesSelect,
        };
      }

      if (table === "user_roles") {
        return {
          select: userRolesSelect,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

function AuthStateProbe() {
  const { profile, role, syncCurrentUserRole } = useAuth();

  return (
    <div>
      <div data-testid="display-name">{profile?.display_name || "missing"}</div>
      <div data-testid="role">{role}</div>
      <button type="button" onClick={() => syncCurrentUserRole("admin")}>
        Switch to admin
      </button>
    </div>
  );
}

describe("AuthContext", () => {
  it("loads the profile without requesting profiles.role", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });
    profilesSingle.mockResolvedValue({
      data: {
        id: "profile-1",
        user_id: "user-1",
        display_name: "Julia",
        email: "julia@example.com",
        avatar_url: null,
        created_at: "2026-03-20T08:00:00.000Z",
        bio: "",
        team: "Architecture",
        dark_mode: false,
        view_preference: "medium",
        format_preference: "grid",
        sort_preference: "asc",
        group_by_preference: "name",
      },
      error: null,
    });
    userRolesIn.mockResolvedValue({
      data: [{ user_id: "user-1", role: "editor" }],
      error: null,
    });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("display-name")).toHaveTextContent("Julia"));
    expect(screen.getByTestId("role")).toHaveTextContent("editor");
    expect(profilesSelect).toHaveBeenCalledWith(
      "id, user_id, display_name, email, avatar_url, created_at, bio, team, dark_mode, view_preference, format_preference, sort_preference, group_by_preference",
    );
    expect(userRolesSelect).toHaveBeenCalledWith("user_id, role");
    expect(userRolesIn).toHaveBeenCalledWith("user_id", ["user-1"]);
  });

  it("refreshes the current user role from user_roles after a role change", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });
    profilesSingle.mockResolvedValue({
      data: {
        id: "profile-1",
        user_id: "user-1",
        display_name: "Julia",
        email: "julia@example.com",
        avatar_url: null,
        created_at: "2026-03-20T08:00:00.000Z",
        bio: "",
        team: "Architecture",
        dark_mode: false,
        view_preference: "medium",
        format_preference: "grid",
        sort_preference: "asc",
        group_by_preference: "name",
      },
      error: null,
    });
    userRolesIn
      .mockResolvedValueOnce({
        data: [{ user_id: "user-1", role: "editor" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ user_id: "user-1", role: "admin" }],
        error: null,
      });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("editor"));

    screen.getByRole("button", { name: /switch to admin/i }).click();

    await waitFor(() => expect(screen.getByTestId("role")).toHaveTextContent("admin"));
    expect(userRolesIn).toHaveBeenNthCalledWith(2, "user_id", ["user-1"]);
  });
});
