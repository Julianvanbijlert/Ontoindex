import { canAccessDashboard, hasPermission, type PermissionKey, type RoleInput } from "@/lib/authorization";

const routePermissionMatchers: Array<{ permission: PermissionKey; matches: (pathname: string) => boolean }> = [
  { permission: "accessDashboard", matches: (pathname) => pathname === "/dashboard" },
  { permission: "accessWorkflow", matches: (pathname) => pathname === "/workflow" },
  { permission: "manageUsers", matches: (pathname) => pathname.startsWith("/admin/users") },
];

export function getRequiredPermissionForPath(pathname: string) {
  return routePermissionMatchers.find((route) => route.matches(pathname))?.permission ?? null;
}

export function canAccessPath(role: RoleInput, pathname: string) {
  const permission = getRequiredPermissionForPath(pathname);

  if (!permission) {
    return true;
  }

  return hasPermission(role, permission);
}

export function getDefaultRouteForRole(role: RoleInput) {
  return canAccessDashboard(role) ? "/dashboard" : "/search";
}
