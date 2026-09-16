import "server-only";

/**
 * Per-request auth context (Clerk identity/tenancy/RBAC → app shape).
 *
 * The Clerk active Organization IS the workspace: `orgId === workspaceId` (no
 * lookup). `getRequestContext()` reads `auth()`, maps the Clerk org role to our
 * internal {@link AuthRole}, derives the permission set from `lib/auth/rbac`,
 * and loads a lightweight `workspaces` doc (plan + vertical) once via the
 * Appwrite admin client. It is wrapped in React `cache()` so repeated calls
 * within one request/render hit the work exactly once.
 *
 * Throws (per the SHARED CONTRACT):
 *   - 401 UnauthorizedError → no authenticated user, or no active organization
 *   - 403 ForbiddenError    → membership is disabled (`org_status === "disabled"`)
 *
 * Disabled-member enforcement is defense-in-depth: middleware already 403s on
 * the `org_status` session claim, but a disabled-but-present member would
 * otherwise be authorized by Clerk on any path the matcher missed, so we
 * re-check here on every protected request.
 */

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";

import { permissionsForRole } from "@/lib/auth/rbac";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { DEFAULT_VERTICAL } from "@/lib/config";
import { DEFAULT_PLAN } from "@/lib/billing/plans";
import type { Role, Permission } from "@/types/roles";
import { ROLES } from "@/types/roles";

/** Internal role keys (== Clerk org role keys). Alias of the rbac `Role`. */
export type AuthRole = Role;

export interface RequestContext {
  userId: string;
  /** The active Clerk organization id, used directly as the workspaceId. */
  orgId: string;
  role: AuthRole;
  perms: Set<string>;
  vertical: string;
  plan: string;
  status: "active" | "disabled";
}

const ROLE_SET = new Set<string>(ROLES);

/** Map a Clerk `orgRole` to an internal {@link AuthRole}; unknown → viewer. */
function toAuthRole(orgRole: string | null | undefined): AuthRole {
  if (orgRole && ROLE_SET.has(orgRole)) {
    return orgRole as AuthRole;
  }
  return "org:viewer";
}

/** Read the `org_status` custom session claim (defaults to "active"). */
function readOrgStatus(
  sessionClaims: Record<string, unknown> | null | undefined,
): "active" | "disabled" {
  const raw = sessionClaims?.org_status;
  return raw === "disabled" ? "disabled" : "active";
}

/**
 * Resolve the active request's auth context. React-`cache()`d: one Clerk
 * `auth()` read + one Appwrite workspace fetch per request, regardless of how
 * many callers invoke it.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const { userId, orgId, orgRole, sessionClaims } = await auth();

  if (!userId) {
    throw new UnauthorizedError("You must be signed in.");
  }
  if (!orgId) {
    // Authenticated but no active workspace — caller should send to /onboarding.
    throw new UnauthorizedError("No active workspace selected.");
  }

  const status = readOrgStatus(
    sessionClaims as Record<string, unknown> | null | undefined,
  );
  if (status === "disabled") {
    throw new ForbiddenError("Your access to this workspace is disabled.");
  }

  const role = toAuthRole(orgRole);
  const perms = new Set<string>(permissionsForRole(role));

  // Lightweight workspace doc (plan + vertical). Tolerate not-found (the Clerk
  // webhook may not have synced the workspaces doc yet) → safe defaults.
  let plan: string = DEFAULT_PLAN;
  let vertical: string = DEFAULT_VERTICAL;
  try {
    const ws = await adminDatabases().getDocument(
      DATABASE_ID,
      COLLECTION.workspaces,
      orgId,
    );
    if (typeof ws.plan === "string" && ws.plan) plan = ws.plan;
    if (typeof ws.vertical === "string" && ws.vertical) vertical = ws.vertical;
  } catch {
    // 404 (not yet synced) or Appwrite not configured in this environment →
    // fall back to defaults. Auth/RBAC remain authoritative via Clerk.
  }

  return { userId, orgId, role, perms, vertical, plan, status };
});

/** Alias used by Server Actions (identical semantics). */
export const requireAuthContext = getRequestContext;

export type { Role, Permission };
