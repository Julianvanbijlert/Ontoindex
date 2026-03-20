import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/AppSidebar";

const navigate = vi.fn();
const authState = {
  profile: { display_name: "Julia Reviewer" },
  role: "editor",
  signOut: vi.fn(),
};

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
  it("shows workflow navigation for admins and hides dashboard for them", () => {
    authState.role = "admin";

    render(<AppSidebar />);

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Workflow")).toBeInTheDocument();
    expect(screen.getByText("User Management")).toBeInTheDocument();
  });

  it("hides workflow navigation for viewers", () => {
    authState.role = "viewer";

    render(<AppSidebar />);

    expect(screen.queryByText("Workflow")).not.toBeInTheDocument();
  });

  it("updates navigation visibility when the current role changes", () => {
    authState.role = "editor";

    const { rerender } = render(<AppSidebar />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Workflow")).toBeInTheDocument();
    expect(screen.queryByText("User Management")).not.toBeInTheDocument();

    authState.role = "admin";
    rerender(<AppSidebar />);

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Workflow")).toBeInTheDocument();
    expect(screen.getByText("User Management")).toBeInTheDocument();

    authState.role = "viewer";
    rerender(<AppSidebar />);

    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Workflow")).not.toBeInTheDocument();
    expect(screen.queryByText("User Management")).not.toBeInTheDocument();
  });

  it.each(["viewer", "editor", "admin"])("shows personal navigation for %s users", (role) => {
    authState.role = role;

    render(<AppSidebar />);

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("navigates to the profile page when the account footer is clicked", () => {
    authState.role = "editor";

    render(<AppSidebar />);

    fireEvent.click(screen.getByRole("button", { name: /julia reviewer/i }));

    expect(navigate).toHaveBeenCalledWith("/profile");
  });
});
