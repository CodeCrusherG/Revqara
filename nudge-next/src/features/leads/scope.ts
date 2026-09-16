import "server-only";

/**
 * Lead/conversation RBAC scoping (the "agent-sees-assigned" rule).
 *
 * 1:1 port of backend/api/leads.py `list_leads` role scoping + `_team_ids_for_user`:
 *
 *   - Every read ALWAYS carries `Query.equal('workspaceId', ctx.orgId)` (tenancy;
 *     it is also the first clause, never overridable).
 *   - `org:owner / org:admin / org:manager` (i.e. `canViewAllLeads`) see EVERY
 *     lead in the workspace.
 *   - `org:viewer` is read-only but a dashboard role — sees the whole pipeline
 *     too (bypasses the assignment filter; mutations reject viewer elsewhere).
 *   - Everyone else (`org:agent`) is restricted to leads assigned to THEM or to a
 *     sales team they belong to:
 *         OR( assignedToUserId == userId, assignedToTeamId ∈ myTeamIds )
 *
 * The same filter is applied to inbox conversations (a conversation is visible
 * iff its lead is visible) — see features/inbox/queries.ts.
 *
 * Server-only: loads the caller's `sales_team_members` rows via the admin SDK.
 */

import { Query } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { canViewAllLeads } from "@/lib/auth/rbac";
import type { RequestContext } from "@/lib/auth/context";

/**
 * The sales-team ids the caller belongs to in the active workspace. Port of
 * `_team_ids_for_user`. Tenant-scoped (workspaceId + userId). Returns [] on any
 * error so a transient failure can only NARROW scope, never widen it.
 */
export async function resolveCallerTeamIds(
  ctx: Pick<RequestContext, "orgId" | "userId">,
): Promise<string[]> {
  try {
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.salesTeamMembers,
      [
        Query.equal("workspaceId", ctx.orgId),
        Query.equal("userId", ctx.userId),
        Query.limit(100),
      ],
    );
    return res.documents
      .map((d) => (typeof d.teamId === "string" ? d.teamId : null))
      .filter((id): id is string => !!id);
  } catch {
    return [];
  }
}

/**
 * True when the caller's reads must be narrowed to their own / their teams'
 * leads. Managers+ and viewers see everything; only agents are scoped.
 */
export function isLeadScopeRestricted(
  ctx: Pick<RequestContext, "role">,
): boolean {
  return !canViewAllLeads(ctx.role) && ctx.role !== "org:viewer";
}

/**
 * Build the RBAC-scoped query clauses for the `leads` collection.
 *
 * ALWAYS starts with the tenant filter; for a restricted (agent) caller it
 * appends the assignment OR-clause. Pass the result straight to
 * `listDocuments` (append your own filters/order/limit after).
 */
export async function leadScopeQueries(
  ctx: Pick<RequestContext, "orgId" | "userId" | "role">,
): Promise<string[]> {
  const queries: string[] = [Query.equal("workspaceId", ctx.orgId)];

  if (isLeadScopeRestricted(ctx)) {
    const teamIds = await resolveCallerTeamIds(ctx);
    const conds = [Query.equal("assignedToUserId", ctx.userId)];
    if (teamIds.length > 0) {
      conds.push(Query.equal("assignedToTeamId", teamIds));
    }
    queries.push(Query.or(conds));
  }

  return queries;
}

/**
 * Non-throwing predicate: can this caller SEE this lead? Used to gate inbox
 * conversations (whose visibility derives from their lead) and to assert
 * ownership after a `getDocument` by id (which skips the scoped query filter).
 */
export function canSeeLead(
  ctx: Pick<RequestContext, "orgId" | "userId" | "role">,
  lead: {
    workspaceId?: string | null;
    assignedToUserId?: string | null;
    assignedToTeamId?: string | null;
  } | null | undefined,
  callerTeamIds: string[] = [],
): boolean {
  if (!lead || lead.workspaceId !== ctx.orgId) return false;
  if (!isLeadScopeRestricted(ctx)) return true;
  if (lead.assignedToUserId && lead.assignedToUserId === ctx.userId) return true;
  if (lead.assignedToTeamId && callerTeamIds.includes(lead.assignedToTeamId)) {
    return true;
  }
  return false;
}
