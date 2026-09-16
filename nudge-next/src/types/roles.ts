/**
 * Clerk org role identifiers and the RBAC permission catalogue (1:1 with
 * backend/auth/rbac.py). The Clerk org role keys are the canonical internal
 * role identifiers throughout the app.
 */

/** RBAC roles, highest → lowest privilege (Clerk org role keys). */
export type Role =
  | "org:owner"
  | "org:admin"
  | "org:manager"
  | "org:agent"
  | "org:viewer";

export const ROLES: readonly Role[] = [
  "org:owner",
  "org:admin",
  "org:manager",
  "org:agent",
  "org:viewer",
] as const;

/** The 11 granular permissions (Clerk custom permission keys). */
export type Permission =
  | "org:billing:manage"
  | "org:workspace:edit"
  | "org:workspace:delete"
  | "org:team:manage"
  | "org:campaigns:manage"
  | "org:templates:manage"
  | "org:settings:manage"
  | "org:contacts:manage"
  | "org:leads:view_all"
  | "org:leads:assign"
  | "org:reports:view";
