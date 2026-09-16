import "server-only";

/**
 * Tenancy enforcement (defense-in-depth, primary scoping layer).
 *
 * Every domain document carries `workspaceId` == the active Clerk org id. The
 * admin client bypasses Appwrite ACLs, so cross-tenant isolation is guaranteed
 * by ALWAYS prepending `Query.equal('workspaceId', orgId)` to reads and by
 * asserting ownership on reads-by-id.
 *
 * Usage:
 *   const q = withTenant(orgId, [Query.equal('status', 'open'), Query.limit(25)]);
 *   const res = await databases.listDocuments(DATABASE_ID, COLLECTION.leads, q);
 *
 *   const lead = assertOwned(orgId, await databases.getDocument(...));
 *
 * Server-only. Throws on a missing/blank org id so a bug can never widen scope.
 */

import { Query, Permission, Role as AppwriteRole } from "node-appwrite";

/** Error thrown when a fetched doc is not owned by the active workspace. */
export class TenantOwnershipError extends Error {
  readonly status = 404; // surface as 404, never leak existence cross-tenant
  constructor(message = "Resource not found in this workspace") {
    super(message);
    this.name = "TenantOwnershipError";
  }
}

function requireOrgId(orgId: string | null | undefined): string {
  if (!orgId || typeof orgId !== "string" || orgId.trim() === "") {
    throw new Error(
      "withTenant: a non-empty workspace (Clerk org) id is required.",
    );
  }
  return orgId;
}

/**
 * Inject `Query.equal('workspaceId', orgId)` ahead of any extra query clauses.
 * The tenant filter is ALWAYS first and cannot be overridden by callers.
 */
export function withTenant(
  orgId: string | null | undefined,
  queries: string[] = [],
): string[] {
  const id = requireOrgId(orgId);
  return [Query.equal("workspaceId", id), ...queries];
}

/**
 * Assert a fetched document belongs to the active workspace. Use after any
 * read-by-id (`getDocument`) since `$id` lookups skip the tenant query filter.
 * Returns the doc (typed) for fluent use.
 */
export function assertOwned<T extends { workspaceId?: string | null }>(
  orgId: string | null | undefined,
  doc: T | null | undefined,
): T {
  const id = requireOrgId(orgId);
  if (!doc || doc.workspaceId !== id) {
    throw new TenantOwnershipError();
  }
  return doc;
}

/**
 * Per-document permissions for defense-in-depth: read by the whole org team,
 * update by manager+, delete by admin+. Attach at write time; combined with
 * `documentSecurity: true`, this means even a leaked session client (non-API-
 * key) can only touch its own tenant's docs.
 *
 * `teamId` is the per-org Appwrite Team id (workspaces.appwriteTeamId), created
 * on `organization.created`.
 */
export function tenantDocPermissions(teamId: string): string[] {
  return [
    Permission.read(AppwriteRole.team(teamId)),
    Permission.update(AppwriteRole.team(teamId, "manager")),
    Permission.delete(AppwriteRole.team(teamId, "admin")),
  ];
}

/** True if a doc is owned by the given workspace (non-throwing variant). */
export function isOwned(
  orgId: string | null | undefined,
  doc: { workspaceId?: string | null } | null | undefined,
): boolean {
  return !!doc && !!orgId && doc.workspaceId === orgId;
}
