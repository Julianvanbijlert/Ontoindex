import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Profile from "@/pages/Profile";

const {
  authState,
  navigate,
  refreshProfile,
  syncCurrentUserRole,
  toastError,
  toastSuccess,
  updateMyRole,
} = vi.hoisted(() => {
  const navigate = vi.fn();
  const refreshProfile = vi.fn().mockResolvedValue(undefined);
  const toastSuccess = vi.fn();
  const toastError = vi.fn();
  const updateMyRole = vi.fn();

  const authState = {
    profile: {
      user_id: "user-1",
      display_name: "Julia",
      email: "julia@example.com",
      bio: "",
      team: "Architecture",
      created_at: "2026-03-19T09:00:00.000Z",
      role: "editor",
    },
    role: "editor",
    roles: ["editor"],
    refreshProfile,
    syncCurrentUserRole: vi.fn().mockImplementation(async (nextRole: "viewer" | "editor" | "admin") => {
      authState.role = nextRole;
      authState.roles = [nextRole];
      authState.profile = {
        ...authState.profile,
        role: nextRole,
      };
    }),
  };

  return {
    authState,
    navigate,
    refreshProfile,
    syncCurrentUserRole: authState.syncCurrentUserRole,
    toastError,
    toastSuccess,
    updateMyRole,
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  },
}));

vi.mock("@/lib/role-service", () => ({
  editableRoles: ["viewer", "editor", "admin"],
  getPrimaryRole: (roles: string[]) => roles[0],
  updateMyRole,
}));

vi.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<(value: string) => void>(() => undefined);

  return {
    Select: ({ onValueChange, children }: any) => (
      <SelectContext.Provider value={onValueChange}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
    SelectValue: () => <span>Selected</span>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const onValueChange = React.useContext(SelectContext);

      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

function renderProfile(initialPath = "/profile") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Profile />
    </MemoryRouter>,
  );
}

describe("Profile", () => {
  beforeEach(() => {
    navigate.mockReset();
    refreshProfile.mockClear();
    syncCurrentUserRole.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    updateMyRole.mockReset().mockImplementation(async (_client, nextRole) => ({
      success: true,
      userId: "user-1",
      role: nextRole,
      message: "Role updated",
    }));
    authState.role = "editor";
    authState.roles = ["editor"];
    authState.profile = {
      user_id: "user-1",
      display_name: "Julia",
      email: "julia@example.com",
      bio: "",
      team: "Architecture",
      created_at: "2026-03-19T09:00:00.000Z",
      role: "editor",
    };
  });

  it.each([
    { from: "viewer", to: "editor" },
    { from: "viewer", to: "admin" },
    { from: "editor", to: "viewer" },
    { from: "editor", to: "admin" },
    { from: "admin", to: "viewer" },
    { from: "admin", to: "editor" },
  ])("persists the current user role from $from to $to", async ({ from, to }) => {
    authState.role = from as any;
    authState.roles = [from as any];
    authState.profile = {
      ...authState.profile,
      role: from as any,
    };

    renderProfile();

    fireEvent.click(await screen.findByText(new RegExp(`^${to.charAt(0).toUpperCase()}${to.slice(1)}$`)));
    fireEvent.click(screen.getByRole("button", { name: /save role/i }));

    await waitFor(() => expect(updateMyRole).toHaveBeenCalledWith(expect.anything(), to));
    expect(syncCurrentUserRole).toHaveBeenCalledWith(to);
    expect(authState.role).toBe(to);
    expect(toastSuccess).toHaveBeenCalledWith("Role updated");
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getAllByText(to).length).toBeGreaterThan(0);
  });

  it("keeps the user on profile after a successful role change", async () => {
    renderProfile();

    fireEvent.click(await screen.findByText("Admin"));
    fireEvent.click(screen.getByRole("button", { name: /save role/i }));

    await waitFor(() => expect(updateMyRole).toHaveBeenCalledWith(expect.anything(), "admin"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the backend error message when the role update fails", async () => {
    updateMyRole.mockRejectedValueOnce(
      new Error("The role update service is not configured in the database."),
    );

    renderProfile();

    fireEvent.click(await screen.findByText("Admin"));
    fireEvent.click(screen.getByRole("button", { name: /save role/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "The role update service is not configured in the database.",
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refreshProfile).toHaveBeenCalled();
  });

  it("shows the role update error when the shared role sync fails", async () => {
    syncCurrentUserRole.mockRejectedValueOnce(new Error("Session refresh failed"));

    renderProfile();

    fireEvent.click(await screen.findByText("Admin"));
    fireEvent.click(screen.getByRole("button", { name: /save role/i }));

    await waitFor(() => expect(updateMyRole).toHaveBeenCalledWith(expect.anything(), "admin"));
    expect(refreshProfile).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Session refresh failed");
  });

  it("does not submit when the selected role has not changed", async () => {
    renderProfile();

    expect(screen.getByRole("button", { name: /save role/i })).toBeDisabled();
    expect(updateMyRole).not.toHaveBeenCalled();
  });

  it("never disables the self-role selector for a signed-in user", async () => {
    renderProfile();

    fireEvent.click(await screen.findByText("Admin"));
    expect(screen.getByRole("button", { name: /save role/i })).toBeEnabled();
  });
});
