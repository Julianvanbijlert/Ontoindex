import { describe, expect, it } from "vitest";

import {
  canAccessDashboard,
  canAccessOwnSearchFilter,
  canManageUsers,
  canResolveComment,
  getRolePermissions,
  normalizeRole,
} from "@/lib/authorization";

describe("authorization", () => {
  it("normalizes legacy roles into the supported role set", () => {
    expect(normalizeRole("reviewer")).toBe("editor");
    expect(normalizeRole("ADMIN")).toBe("admin");
    expect(normalizeRole("unknown")).toBe("viewer");
    expect(normalizeRole(undefined)).toBe("viewer");
  });

  it("keeps dashboard access editor-only, excluding admins", () => {
    expect(canAccessDashboard("viewer")).toBe(false);
    expect(canAccessDashboard("editor")).toBe(true);
    expect(canAccessDashboard("admin")).toBe(false);
  });

  it("returns the expected centralized permissions for each role", () => {
    expect(getRolePermissions("viewer").comment).toBe(true);
    expect(getRolePermissions("viewer").accessOwnSearchFilter).toBe(false);
    expect(getRolePermissions("viewer").editOntology).toBe(false);
    expect(getRolePermissions("editor").accessOwnSearchFilter).toBe(true);
    expect(getRolePermissions("editor").resolveComment).toBe(true);
    expect(getRolePermissions("admin").manageUsers).toBe(true);
    expect(getRolePermissions("admin").accessDashboard).toBe(false);
  });

  it("limits admin-only capabilities correctly", () => {
    expect(canManageUsers("editor")).toBe(false);
    expect(canManageUsers("admin")).toBe(true);
    expect(canResolveComment("viewer")).toBe(false);
    expect(canAccessOwnSearchFilter("admin")).toBe(false);
  });
});
