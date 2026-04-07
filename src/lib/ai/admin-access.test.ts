import { describe, expect, it, vi } from "vitest";

import {
  AdminAccessError,
  requireDatabaseAdminAccess,
  resolveDatabaseRole,
} from "../../../supabase/functions/_shared/admin-access.ts";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("admin-access", () => {
  it("allows a DB admin even when auth metadata still says viewer", async () => {
    const logger = createLogger();

    const decision = await requireDatabaseAdminAccess({
      getUser: async () => ({
        id: "user-1",
        email: "admin@example.com",
        requestedRole: "viewer",
      }),
      loadProfile: async () => ({
        userId: "user-1",
        email: "admin@example.com",
      }),
      loadRoles: async () => ["admin"],
      logger,
    });

    expect(decision).toMatchObject({
      userId: "user-1",
      email: "admin@example.com",
      role: "admin",
      isAdmin: true,
    });
    expect(logger.info).toHaveBeenCalledWith("admin_access_granted", expect.objectContaining({
      userId: "user-1",
      email: "admin@example.com",
      requestedRole: "viewer",
      resolvedRole: "admin",
    }));
  });

  it("rejects a DB viewer even when authenticated", async () => {
    const logger = createLogger();

    await expect(requireDatabaseAdminAccess({
      getUser: async () => ({
        id: "user-2",
        email: "viewer@example.com",
        requestedRole: "admin",
      }),
      loadProfile: async () => ({
        userId: "user-2",
        email: "viewer@example.com",
      }),
      loadRoles: async () => ["viewer"],
      logger,
    })).rejects.toMatchObject({
      message: "Admin access required",
      status: 403,
    });

    expect(logger.warn).toHaveBeenCalledWith("admin_access_denied", expect.objectContaining({
      userId: "user-2",
      email: "viewer@example.com",
      resolvedRole: "viewer",
    }));
  });

  it("rejects missing profile rows safely", async () => {
    await expect(requireDatabaseAdminAccess({
      getUser: async () => ({
        id: "user-3",
        email: "missing@example.com",
        requestedRole: "viewer",
      }),
      loadProfile: async () => null,
      loadRoles: async () => ["admin"],
      logger: createLogger(),
    })).rejects.toMatchObject({
      message: "Admin access required",
      status: 403,
    });
  });

  it("rejects users without DB role rows safely", async () => {
    await expect(requireDatabaseAdminAccess({
      getUser: async () => ({
        id: "user-4",
        email: "norole@example.com",
        requestedRole: "admin",
      }),
      loadProfile: async () => ({
        userId: "user-4",
        email: "norole@example.com",
      }),
      loadRoles: async () => [],
      logger: createLogger(),
    })).rejects.toMatchObject({
      message: "Admin access required",
      status: 403,
    });
  });

  it("resolves the highest DB role from multiple role rows", () => {
    expect(resolveDatabaseRole(["viewer", "reviewer", "admin"])).toBe("admin");
    expect(resolveDatabaseRole(["viewer", "editor"])).toBe("editor");
    expect(resolveDatabaseRole([])).toBe(null);
  });

  it("uses 401 for missing authenticated users", async () => {
    await expect(requireDatabaseAdminAccess({
      getUser: async () => null,
      loadProfile: async () => null,
      loadRoles: async () => [],
      logger: createLogger(),
    })).rejects.toBeInstanceOf(AdminAccessError);

    await expect(requireDatabaseAdminAccess({
      getUser: async () => null,
      loadProfile: async () => null,
      loadRoles: async () => [],
      logger: createLogger(),
    })).rejects.toMatchObject({
      message: "Unauthorized",
      status: 401,
    });
  });
});
