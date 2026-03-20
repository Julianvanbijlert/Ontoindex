export const APP_ROLES = ["viewer", "editor", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type RoleInput = AppRole | string | null | undefined;

export type PermissionKey =
  | "accessSearch"
  | "accessOwnSearchFilter"
  | "accessDashboard"
  | "accessOntologies"
  | "accessDefinitions"
  | "accessWorkflow"
  | "accessNotifications"
  | "accessFavorites"
  | "accessSettings"
  | "accessRecentActivity"
  | "editOntology"
  | "deleteOntology"
  | "importOntology"
  | "exportOntology"
  | "editGraph"
  | "createDefinition"
  | "editDefinition"
  | "deleteDefinition"
  | "comment"
  | "deleteOwnComment"
  | "deleteOthersComment"
  | "resolveComment"
  | "manageRelationships"
  | "manageUsers";

export type RolePermissions = Record<PermissionKey, boolean>;

const LEGACY_ROLE_MAP: Record<string, AppRole> = {
  admin: "admin",
  editor: "editor",
  reviewer: "editor",
  viewer: "viewer",
};

const EDITOR_AND_ADMIN = ["editor", "admin"] as const;

const permissionMatrix: Record<PermissionKey, readonly AppRole[]> = {
  accessSearch: APP_ROLES,
  accessOwnSearchFilter: ["editor"],
  accessDashboard: ["editor"],
  accessOntologies: APP_ROLES,
  accessDefinitions: APP_ROLES,
  accessWorkflow: EDITOR_AND_ADMIN,
  accessNotifications: APP_ROLES,
  accessFavorites: APP_ROLES,
  accessSettings: APP_ROLES,
  accessRecentActivity: APP_ROLES,
  editOntology: EDITOR_AND_ADMIN,
  deleteOntology: EDITOR_AND_ADMIN,
  importOntology: EDITOR_AND_ADMIN,
  exportOntology: EDITOR_AND_ADMIN,
  editGraph: EDITOR_AND_ADMIN,
  createDefinition: EDITOR_AND_ADMIN,
  editDefinition: EDITOR_AND_ADMIN,
  deleteDefinition: EDITOR_AND_ADMIN,
  comment: APP_ROLES,
  deleteOwnComment: APP_ROLES,
  deleteOthersComment: EDITOR_AND_ADMIN,
  resolveComment: EDITOR_AND_ADMIN,
  manageRelationships: EDITOR_AND_ADMIN,
  manageUsers: ["admin"],
};

export function isAppRole(role: RoleInput): role is AppRole {
  return typeof role === "string" && APP_ROLES.includes(role as AppRole);
}

export function normalizeRole(role: RoleInput): AppRole {
  if (typeof role !== "string") {
    return "viewer";
  }

  return LEGACY_ROLE_MAP[role.trim().toLowerCase()] ?? "viewer";
}

export function hasPermission(role: RoleInput, permission: PermissionKey) {
  return permissionMatrix[permission].includes(normalizeRole(role));
}

export function getRolePermissions(role: RoleInput): RolePermissions {
  return {
    accessSearch: hasPermission(role, "accessSearch"),
    accessOwnSearchFilter: hasPermission(role, "accessOwnSearchFilter"),
    accessDashboard: hasPermission(role, "accessDashboard"),
    accessOntologies: hasPermission(role, "accessOntologies"),
    accessDefinitions: hasPermission(role, "accessDefinitions"),
    accessWorkflow: hasPermission(role, "accessWorkflow"),
    accessNotifications: hasPermission(role, "accessNotifications"),
    accessFavorites: hasPermission(role, "accessFavorites"),
    accessSettings: hasPermission(role, "accessSettings"),
    accessRecentActivity: hasPermission(role, "accessRecentActivity"),
    editOntology: hasPermission(role, "editOntology"),
    deleteOntology: hasPermission(role, "deleteOntology"),
    importOntology: hasPermission(role, "importOntology"),
    exportOntology: hasPermission(role, "exportOntology"),
    editGraph: hasPermission(role, "editGraph"),
    createDefinition: hasPermission(role, "createDefinition"),
    editDefinition: hasPermission(role, "editDefinition"),
    deleteDefinition: hasPermission(role, "deleteDefinition"),
    comment: hasPermission(role, "comment"),
    deleteOwnComment: hasPermission(role, "deleteOwnComment"),
    deleteOthersComment: hasPermission(role, "deleteOthersComment"),
    resolveComment: hasPermission(role, "resolveComment"),
    manageRelationships: hasPermission(role, "manageRelationships"),
    manageUsers: hasPermission(role, "manageUsers"),
  };
}

export function pickHighestRole(roles: RoleInput[]) {
  if (roles.some((role) => normalizeRole(role) === "admin")) {
    return "admin" satisfies AppRole;
  }

  if (roles.some((role) => normalizeRole(role) === "editor")) {
    return "editor" satisfies AppRole;
  }

  return "viewer" satisfies AppRole;
}

export function canAccessSearch(role: RoleInput) {
  return hasPermission(role, "accessSearch");
}

export function canAccessOwnSearchFilter(role: RoleInput) {
  return hasPermission(role, "accessOwnSearchFilter");
}

export function canAccessDashboard(role: RoleInput) {
  return hasPermission(role, "accessDashboard");
}

export function canAccessOntologies(role: RoleInput) {
  return hasPermission(role, "accessOntologies");
}

export function canAccessDefinitions(role: RoleInput) {
  return hasPermission(role, "accessDefinitions");
}

export function canAccessWorkflow(role: RoleInput) {
  return hasPermission(role, "accessWorkflow");
}

export function canAccessNotifications(role: RoleInput) {
  return hasPermission(role, "accessNotifications");
}

export function canAccessFavorites(role: RoleInput) {
  return hasPermission(role, "accessFavorites");
}

export function canAccessSettings(role: RoleInput) {
  return hasPermission(role, "accessSettings");
}

export function canAccessRecentActivity(role: RoleInput) {
  return hasPermission(role, "accessRecentActivity");
}

export function canEditOntology(role: RoleInput) {
  return hasPermission(role, "editOntology");
}

export function canDeleteOntology(role: RoleInput) {
  return hasPermission(role, "deleteOntology");
}

export function canImportOntology(role: RoleInput) {
  return hasPermission(role, "importOntology");
}

export function canExportOntology(role: RoleInput) {
  return hasPermission(role, "exportOntology");
}

export function canEditGraph(role: RoleInput) {
  return hasPermission(role, "editGraph");
}

export function canCreateDefinition(role: RoleInput) {
  return hasPermission(role, "createDefinition");
}

export function canEditDefinition(role: RoleInput) {
  return hasPermission(role, "editDefinition");
}

export function canDeleteDefinition(role: RoleInput) {
  return hasPermission(role, "deleteDefinition");
}

export function canComment(role: RoleInput) {
  return hasPermission(role, "comment");
}

export function canDeleteOwnComment(role: RoleInput) {
  return hasPermission(role, "deleteOwnComment");
}

export function canDeleteOthersComment(role: RoleInput) {
  return hasPermission(role, "deleteOthersComment");
}

export function canResolveComment(role: RoleInput) {
  return hasPermission(role, "resolveComment");
}

export function canManageRelationships(role: RoleInput) {
  return hasPermission(role, "manageRelationships");
}

export function canManageUsers(role: RoleInput) {
  return hasPermission(role, "manageUsers");
}
