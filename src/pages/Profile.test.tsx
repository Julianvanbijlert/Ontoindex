import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Profile from "@/pages/Profile";

const refreshProfile = vi.fn().mockResolvedValue(undefined);
const updateMyRole = vi.fn().mockResolvedValue({ role: "admin" });

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: {
      user_id: "user-1",
      display_name: "Julia",
      email: "julia@example.com",
      bio: "",
      team: "Architecture",
      created_at: "2026-03-19T09:00:00.000Z",
    },
    roles: ["editor"],
    refreshProfile,
  }),
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
  getPrimaryRole: () => "editor",
  updateMyRole: (...args: unknown[]) => updateMyRole(...args),
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

describe("Profile", () => {
  it("lets the current user switch roles and refresh the profile", async () => {
    render(<Profile />);

    fireEvent.click(await screen.findByText("Admin"));

    await waitFor(() => expect(updateMyRole).toHaveBeenCalled());
    expect(refreshProfile).toHaveBeenCalled();
  });
});
