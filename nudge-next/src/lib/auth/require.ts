import "server-only";

/**
 * Permission/role guards for Server Actions and RSC segments.
 *
 * `requirePermission(perm)` and `requireRole(role)` resolve the request context
 * (via `getRequestContext`, which itself throws 401/403 on no-user/disabled),
 * then assert the additional RBAC condition, throwing {@link ForbiddenError}
 * (403) on denial. They return the {@link RequestContext} so callers can use it
 * without a second `getRequestContext()` round-trip.
 *
 * Mirrors the FastAPI `require_permission(...)` dependency: owner is implicitly
 * granted every permission (handled inside `hasPermission`), and the role-rank
 * comparison matches `ROLE_RANK` from rbac.py.
 */

import { getRequestContext, type RequestContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/lib/auth/errors";
import { hasPermission, ROLE_RANK } from "@/lib/auth/rbac";
import type { Permission, Role } from "@/types/roles";

/**
 * Assert the active member holds `perm`. Owner ⇒ always allowed. Throws
 * {@link ForbiddenError} otherwise. Returns the request context.
 */
export async function requirePermission(
  perm: Permission,
): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!hasPermission(ctx.role, perm)) {
    throw new ForbiddenError(
      `This action requires the "${perm}" permission.`,
    );
  }
  return ctx;
}

/**
 * Assert the active member's role rank is at least that of `role`. Throws
 * {@link ForbiddenError} otherwise. Returns the request context.
 */
export async function requireRole(role: Role): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (ROLE_RANK[ctx.role] < ROLE_RANK[role]) {
    throw new ForbiddenError(
      `This action requires the "${role}" role or higher.`,
    );
  }
  return ctx;
}
