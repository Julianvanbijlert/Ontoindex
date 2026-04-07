export type DatabaseAppRole = "admin" | "reviewer" | "editor" | "viewer";

export interface AdminAccessIdentity {
  id: string;
  email: string | null;
  requestedRole?: string | null;
}

export interface AdminAccessProfile {
  userId: string;
  email: string | null;
}

export interface AdminAccessLogger {
  info(message: string, payload?: Record<string, unknown>): void;
  warn(message: string, payload?: Record<string, unknown>): void;
  error(message: string, payload?: Record<string, unknown>): void;
}

export interface DatabaseAdminAccessDependencies {
  getUser(): Promise<AdminAccessIdentity | null>;
  loadProfile(userId: string): Promise<AdminAccessProfile | null>;
  loadRoles(userId: string): Promise<string[]>;
  logger?: AdminAccessLogger;
}

export interface DatabaseAdminAccessDecision {
  userId: string;
  email: string | null;
  role: DatabaseAppRole;
  isAdmin: boolean;
}

const ROLE_PRIORITY: DatabaseAppRole[] = ["admin", "editor", "reviewer", "viewer"];

function isDatabaseRole(value: string | null | undefined): value is DatabaseAppRole {
  return value === "admin" || value === "reviewer" || value === "editor" || value === "viewer";
}

function normalizeDatabaseRole(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isDatabaseRole(normalized) ? normalized : null;
}

export function resolveDatabaseRole(roles: string[]): DatabaseAppRole | null {
  const normalizedRoles = new Set(
    roles
      .map((role) => normalizeDatabaseRole(role))
      .filter((role): role is DatabaseAppRole => role !== null),
  );

  for (const role of ROLE_PRIORITY) {
    if (normalizedRoles.has(role)) {
      return role;
    }
  }

  return null;
}

export class AdminAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AdminAccessError";
  }
}

function getLogger(logger?: AdminAccessLogger) {
  return logger ?? console;
}

export async function requireDatabaseAdminAccess(
  dependencies: DatabaseAdminAccessDependencies,
): Promise<DatabaseAdminAccessDecision> {
  const logger = getLogger(dependencies.logger);
  const user = await dependencies.getUser();

  if (!user) {
    logger.warn("admin_access_denied", {
      userId: null,
      email: null,
      resolvedRole: null,
      decision: "unauthorized",
    });
    throw new AdminAccessError("Unauthorized", 401);
  }

  const profile = await dependencies.loadProfile(user.id);
  const roles = await dependencies.loadRoles(user.id);
  const resolvedRole = profile ? resolveDatabaseRole(roles) : null;

  if (!profile || resolvedRole !== "admin") {
    logger.warn("admin_access_denied", {
      userId: user.id,
      email: user.email,
      requestedRole: user.requestedRole ?? null,
      resolvedRole,
      decision: "denied",
    });
    throw new AdminAccessError("Admin access required", 403);
  }

  logger.info("admin_access_granted", {
    userId: user.id,
    email: profile.email || user.email,
    requestedRole: user.requestedRole ?? null,
    resolvedRole,
    decision: "allowed",
  });

  return {
    userId: user.id,
    email: profile.email || user.email,
    role: resolvedRole,
    isAdmin: true,
  };
}
