import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { ProtectedRoute } from "@/components/routing/RouteGuards";

const authState = {
  user: { id: "user-1" },
  loading: false,
  role: "viewer",
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

function LocationDisplay() {
  const location = useLocation();

  return <div data-testid="location">{location.pathname}</div>;
}

function renderRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationDisplay />
      <Routes>
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects viewers away from the dashboard", () => {
    authState.role = "viewer";

    renderRoute("/dashboard");

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
  });

  it("redirects admins away from the dashboard", () => {
    authState.role = "admin";

    renderRoute("/dashboard");

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
  });

  it("allows editors to access the dashboard", () => {
    authState.role = "editor";

    renderRoute("/dashboard");

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects immediately when a role change removes access to the current route", () => {
    authState.role = "editor";

    const { rerender } = renderRoute("/dashboard");

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();

    authState.role = "admin";

    rerender(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <LocationDisplay />
        <Routes>
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
  });

  it("redirects viewers away from workflow", () => {
    authState.role = "viewer";

    renderRoute("/workflow");

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
  });

  it("redirects immediately when a role change removes workflow access", () => {
    authState.role = "admin";

    const { rerender } = renderRoute("/workflow");

    expect(screen.getByTestId("location")).toHaveTextContent("/workflow");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();

    authState.role = "viewer";

    rerender(
      <MemoryRouter initialEntries={["/workflow"]}>
        <LocationDisplay />
        <Routes>
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
  });

  it("allows admins on workflow", () => {
    authState.role = "admin";

    renderRoute("/workflow");

    expect(screen.getByTestId("location")).toHaveTextContent("/workflow");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("allows editors on workflow", () => {
    authState.role = "editor";

    renderRoute("/workflow");

    expect(screen.getByTestId("location")).toHaveTextContent("/workflow");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("blocks non-admin access to user management", () => {
    authState.role = "editor";

    renderRoute("/admin/users");

    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });

  it("redirects immediately when a role change removes admin user management access", () => {
    authState.role = "admin";

    const { rerender } = renderRoute("/admin/users");

    expect(screen.getByTestId("location")).toHaveTextContent("/admin/users");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();

    authState.role = "viewer";

    rerender(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <LocationDisplay />
        <Routes>
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
  });

  it.each([
    "viewer",
    "editor",
    "admin",
  ])("allows %s users on personal routes", (role) => {
    authState.role = role;

    const personalRoutes = ["/notifications", "/favorites", "/settings", "/recent"];

    for (const route of personalRoutes) {
      const { unmount } = renderRoute(route);
      expect(screen.getByTestId("location")).toHaveTextContent(route);
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps users on allowed routes when their role changes", () => {
    authState.role = "viewer";

    const { rerender } = renderRoute("/search");

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();

    authState.role = "admin";

    rerender(
      <MemoryRouter initialEntries={["/search"]}>
        <LocationDisplay />
        <Routes>
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("location")).toHaveTextContent("/search");
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });
});
