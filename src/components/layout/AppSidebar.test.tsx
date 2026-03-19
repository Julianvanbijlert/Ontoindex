import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/AppSidebar";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { display_name: "Julia Reviewer" },
    roles: ["editor"],
    signOut: vi.fn(),
    hasRole: () => false,
  }),
}));

vi.mock("@/components/NavLink", () => ({
  NavLink: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: any) => <div>{children}</div>,
  SidebarContent: ({ children }: any) => <div>{children}</div>,
  SidebarGroup: ({ children }: any) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: any) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: any) => <div>{children}</div>,
  SidebarMenu: ({ children }: any) => <div>{children}</div>,
  SidebarMenuButton: ({ children }: any) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: any) => <div>{children}</div>,
  SidebarFooter: ({ children }: any) => <div>{children}</div>,
  useSidebar: () => ({ state: "expanded" }),
}));

describe("AppSidebar", () => {
  it("navigates to the profile page when the account footer is clicked", () => {
    render(<AppSidebar />);

    fireEvent.click(screen.getByRole("button", { name: /julia reviewer/i }));

    expect(navigate).toHaveBeenCalledWith("/profile");
  });
});
