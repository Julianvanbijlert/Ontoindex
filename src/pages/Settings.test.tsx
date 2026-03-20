import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Settings from "@/pages/Settings";

const authState = {
  profile: {
    user_id: "user-1",
    dark_mode: false,
    view_preference: "medium",
    format_preference: "grid",
    sort_preference: "asc",
    group_by_preference: "name",
  },
  refreshProfile: vi.fn().mockResolvedValue(undefined),
  role: "viewer",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, disabled, onCheckedChange }: any) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      {checked ? "On" : "Off"}
    </button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
  SelectValue: () => <span>Selected</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <button type="button">{children}</button>,
}));

describe("Settings", () => {
  beforeEach(() => {
    authState.role = "viewer";
  });

  it("shows the appearance settings for non-admin users without any role-policy UI", () => {
    render(<Settings />);

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.queryByText("Role Management")).not.toBeInTheDocument();
    expect(screen.queryByText("Allow users to change their own role")).not.toBeInTheDocument();
  });

  it("also omits role-policy UI for admins", async () => {
    authState.role = "admin";

    render(<Settings />);

    expect(await screen.findByText("Appearance")).toBeInTheDocument();
    expect(screen.queryByText("Role Management")).not.toBeInTheDocument();
  });

  it("saves appearance settings normally", async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(authState.refreshProfile).toHaveBeenCalled());
  });
});
