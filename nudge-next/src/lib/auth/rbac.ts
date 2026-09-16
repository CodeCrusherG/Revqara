/**
 * Role-based access control for workspace members.
 *
 * 1:1 TypeScript port of backend/auth/rbac.py. The five roles use the Clerk org
 * role keys (`org:owner` … `org:viewer`) as the canonical internal identifiers,
 * and the eleven permissions use the Clerk custom-permission keys.
 *
 *   org:owner    full control incl. billing, delete workspace, manage admins
 *   org:admin    manage team, campaigns, templates, settings
 *   org:manager  view all leads, assign leads, see reports
 *   org:agent    handle only leads/conversations assigned to them
 *   org:viewer   read-only
 *
 * Pure module — no Appwrite, no Clerk SDK, no `server-only`. Safe to import
 * anywhere (UI RoleGate, Server Actions, Appwrite Functions).
 */

import type { Role, Permission } from "@/types/roles";

export type { Role, Permission };

// Privilege rank — used to stop a member from managing someone above them.
export const ROLE_RANK: Record<Role, number> = {
  "org:owner": 4,
  "org:admin": 3,
  "org:manager": 2,
  "org:agent": 1,
  "org:viewer": 0,
};

export const ROLES = Object.keys(ROLE_RANK) as Role[];

// Permission catalogue (granular capabilities used by endpoints / actions).
export const P_BILLING: Permission = "org:billing:manage";
export const P_WORKSPACE_EDIT: Permission = "org:workspace:edit";
export const P_WORKSPACE_DEL: Permission = "org:workspace:delete";
export const P_TEAM_MANAGE: Permission = "org:team:manage"; // invite/remove members, change roles, sales teams
export const P_CAMPAIGNS: Permission = "org:campaigns:manage";
export const P_TEMPLATES: Permission = "org:templates:manage";
export const P_SETTINGS: Permission = "org:settings:manage"; // vertical, WhatsApp numbers, bot
export const P_CONTACTS: Permission = "org:contacts:manage";
export const P_LEADS_VIEW_ALL: Permission = "org:leads:view_all"; // see every lead in the workspace
export const P_LEADS_ASSIGN: Permission = "org:leads:assign"; // assign/reassign leads
export const P_REPORTS: Permission = "org:reports:view";

/** All eleven permissions, in catalogue order. */
export const PERMISSIONS: readonly Permission[] = [
  P_BILLING,
  P_WORKSPACE_EDIT,
  P_WORKSPACE_DEL,
  P_TEAM_MANAGE,
  P_CAMPAIGNS,
  P_TEMPLATES,
  P_SETTINGS,
  P_CONTACTS,
  P_LEADS_VIEW_ALL,
  P_LEADS_ASSIGN,
  P_REPORTS,
] as const;

// Per-role grants. `org:owner` is handled specially (all permissions).
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  "org:owner": new Set<Permission>(), // special-cased to "everything" in hasPermission
  "org:admin": new Set<Permission>([
    P_TEAM_MANAGE,
    P_CAMPAIGNS,
    P_TEMPLATES,
    P_SETTINGS,
    P_CONTACTS,
    P_LEADS_VIEW_ALL,
    P_LEADS_ASSIGN,
    P_REPORTS,
  ]),
  "org:manager": new Set<Permission>([
    P_LEADS_VIEW_ALL,
    P_LEADS_ASSIGN,
    P_REPORTS,
    P_CONTACTS,
  ]),
  "org:agent": new Set<Permission>(), // only their assigned leads/conversations (no view_all)
  "org:viewer": new Set<Permission>([P_REPORTS]), // read-only dashboards
};

/** True if `role` is granted `permission` (owner has all). */
export function hasPermission(
  role: Role | null | undefined,
  permission: Permission,
): boolean {
  if (role === "org:owner") {
    return true;
  }
  if (!role) {
    return false;
  }
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function canViewAllLeads(role: Role | null | undefined): boolean {
  return hasPermission(role, P_LEADS_VIEW_ALL);
}

export function canAssignLeads(role: Role | null | undefined): boolean {
  return hasPermission(role, P_LEADS_ASSIGN);
}

/**
 * An actor may set/manage a member only at or below their own rank, and only
 * owners may grant or manage the `org:owner` role. Port of can_manage_role.
 */
export function canManageRole(
  actorRole: Role | null | undefined,
  targetRole: Role | null | undefined,
): boolean {
  if (!hasPermission(actorRole, P_TEAM_MANAGE)) {
    return false;
  }
  if (targetRole === "org:owner" && actorRole !== "org:owner") {
    return false;
  }
  const actorRank = actorRole ? ROLE_RANK[actorRole] : -1;
  const targetRank = targetRole ? ROLE_RANK[targetRole] : 99;
  return actorRank >= targetRank;
}

/** Resolve all effective permissions for a role (owner ⇒ the full catalogue). */
export function permissionsForRole(
  role: Role | null | undefined,
): ReadonlySet<Permission> {
  if (role === "org:owner") {
    return new Set<Permission>(PERMISSIONS);
  }
  if (!role) {
    return new Set<Permission>();
  }
  return ROLE_PERMISSIONS[role] ?? new Set<Permission>();
}
