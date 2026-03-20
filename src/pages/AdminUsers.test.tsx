import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import AdminUsers from "@/pages/AdminUsers";

const navigate = vi.fn();
const authState = {
  user: { id: "user-1" },
  role: "admin",
  syncCurrentUserRole: vi.fn().mockResolvedValue(undefined),
};

const profilesOrder = vi.fn();
const profilesSelect = vi.fn();
const fetchPrimaryRolesForUsers = vi.fn();
const updateUserRoleAsAdmin = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: "/admin/users" }),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: profilesSelect,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  },
}));

vi.mock("@/lib/role-service", () => ({
  fetchPrimaryRolesForUsers: (...args: unknown[]) => fetchPrimaryRolesForUsers(...args),
  updateUserRoleAsAdmin: (...args: unknown[]) => updateUserRoleAsAdmin(...args),
}));

vi.mock("@/components/ui/select", () => {
  const React = require("react");
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

describe("AdminUsers", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
    authState.role = "admin";
    authState.syncCurrentUserRole.mockClear();
    navigate.mockReset();
    fetchPrimaryRolesForUsers.mockReset().mockResolvedValue({
      "user-1": "editor",
      "user-2": "viewer",
    });
    updateUserRoleAsAdmin.mockReset().mockResolvedValue({
      success: true,
      userId: "user-2",
      role: "admin",
      message: "User role updated",
    });
    profilesOrder.mockReset().mockResolvedValue({
      data: [
        {
          id: "profile-1",
          user_id: "user-1",
          display_name: "Alice Editor",
          email: "alice@example.com",
          team: "Platform",
          created_at: "2026-03-19T08:00:00.000Z",
        },
        {
          id: "profile-2",
          user_id: "user-2",
          display_name: "Victor Viewer",
          email: "victor@example.com",
          team: null,
          created_at: "2026-03-18T08:00:00.000Z",
        },
      ],
      error: null,
    });
    profilesSelect.mockReset().mockReturnValue({
      order: profilesOrder,
    });
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("blocks non-admin users from the page", () => {
    authState.role = "editor";

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );

    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByText("User Role Management")).not.toBeInTheDocument();
    expect(updateUserRoleAsAdmin).not.toHaveBeenCalled();
  });

  it("lists users and lets admins update a role", async () => {
    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Alice Editor")).toBeInTheDocument();
    expect(screen.getByText("victor@example.com")).toBeInTheDocument();
    expect(profilesSelect).toHaveBeenCalledWith("id, user_id, display_name, email, team, created_at");
    expect(fetchPrimaryRolesForUsers).toHaveBeenCalledWith(expect.anything(), ["user-1", "user-2"]);

    const victorRow = screen.getByText("Victor Viewer").closest("tr");
    expect(victorRow).not.toBeNull();

    fireEvent.click(within(victorRow!).getByRole("button", { name: "Admin" }));
    fireEvent.click(within(victorRow!).getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateUserRoleAsAdmin).toHaveBeenCalledWith(expect.anything(), "user-2", "admin"),
    );
    expect(toast.success).toHaveBeenCalledWith("User role updated");
    expect(authState.syncCurrentUserRole).not.toHaveBeenCalled();
  });

  it("refreshes auth state and redirects if the admin changes their own role to one without access", async () => {
    updateUserRoleAsAdmin.mockReset().mockResolvedValueOnce({
      success: true,
      userId: "user-1",
      role: "viewer",
      message: "User role updated",
    });

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );

    const aliceRow = (await screen.findByText("Alice Editor")).closest("tr");
    expect(aliceRow).not.toBeNull();

    fireEvent.click(within(aliceRow!).getByRole("button", { name: "Viewer" }));
    fireEvent.click(within(aliceRow!).getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(updateUserRoleAsAdmin).toHaveBeenCalledWith(expect.anything(), "user-1", "viewer"),
    );
    expect(authState.syncCurrentUserRole).toHaveBeenCalledWith("viewer");
    expect(navigate).toHaveBeenCalledWith("/search", { replace: true });
  });

  it("shows the backend error when the admin role update endpoint fails", async () => {
    updateUserRoleAsAdmin.mockReset().mockRejectedValueOnce(
      new Error("Only admins can change another user's role."),
    );

    render(
      <MemoryRouter>
        <AdminUsers />
      </MemoryRouter>,
    );

    const victorRow = (await screen.findByText("Victor Viewer")).closest("tr");
    expect(victorRow).not.toBeNull();

    fireEvent.click(within(victorRow!).getByRole("button", { name: "Admin" }));
    fireEvent.click(within(victorRow!).getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only admins can change another user's role."),
    );
  });
});
