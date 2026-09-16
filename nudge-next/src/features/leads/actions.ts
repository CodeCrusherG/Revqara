"use server";

/**
 * Lead mutations. Port of backend/api/leads.py `update_lead` (stage),
 * `assign_lead`, `unassign_lead`, including `_apply_assignment` (supersede the
 * prior active assignment, append an audit row, clear needsHuman on assign).
 *
 * RBAC:
 *   - setLeadStatus: any member who can SEE the lead may move it (matches the
 *     FastAPI `get_current_workspace` gate); viewers are blocked (read-only).
 *   - assignLead / unassignLead: require `org:leads:assign`.
 *
 * Tenancy: every read/write asserts the lead belongs to `ctx.orgId` (getDocument
 * by id skips the scoped query filter, so we re-check via assertOwned).
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { ID, Query, AppwriteException } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { getRequestContext } from "@/lib/auth/context";
import { requirePermission } from "@/lib/auth/require";
import { ForbiddenError } from "@/lib/auth/errors";
import { assertOwned } from "@/lib/appwrite/tenant";
import { getPack } from "@/features/ai-graph/packs";

import { LEADS_TAG, INBOX_TAG } from "./tags";

/** Generic statuses accepted in addition to the vertical pipeline (STATUSES). */
const GENERIC_STATUSES = ["new", "qualified", "won", "lost"] as const;

type LeadDoc = Record<string, unknown> & {
  $id: string;
  workspaceId?: string | null;
};

async function loadOwnedLead(orgId: string, leadId: string): Promise<LeadDoc> {
  try {
    const doc = (await adminDatabases().getDocument(
      DATABASE_ID,
      COLLECTION.leads,
      leadId,
    )) as LeadDoc;
    return assertOwned(orgId, doc);
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      throw new ForbiddenError("Lead not found.");
    }
    throw err;
  }
}

function revalidateLeadSurfaces(): void {
  revalidateTag(LEADS_TAG);
  revalidateTag(INBOX_TAG);
  revalidatePath("/leads");
  revalidatePath("/inbox");
}

export interface SetLeadStatusInput {
  leadId: string;
  status: string;
}

/**
 * Move a lead to a new pipeline stage. The status must be one of the generic
 * statuses OR a stage in the workspace vertical's pipeline (parity with
 * `update_lead`). Viewers (read-only) are rejected.
 */
export async function setLeadStatus(
  input: SetLeadStatusInput,
): Promise<{ ok: true; status: string }> {
  const ctx = await getRequestContext();
  if (ctx.role === "org:viewer") {
    throw new ForbiddenError("Viewers cannot modify leads.");
  }

  const pack = getPack(ctx.vertical);
  const allowed = new Set<string>([
    ...GENERIC_STATUSES,
    ...pack.pipeline_stages,
  ]);
  if (!allowed.has(input.status)) {
    throw new ForbiddenError(
      `status must be one of ${[...allowed].sort().join(", ")}`,
    );
  }

  await loadOwnedLead(ctx.orgId, input.leadId);
  await adminDatabases().updateDocument(
    DATABASE_ID,
    COLLECTION.leads,
    input.leadId,
    { status: input.status },
  );

  revalidateLeadSurfaces();
  return { ok: true, status: input.status };
}

/**
 * Supersede any active `lead_assignments` row for this lead, set the new
 * assignee on the lead, clear `needsHuman`, and append a fresh audit row. Port
 * of `_apply_assignment`. Caller has already been permission-checked.
 */
async function applyAssignment(
  orgId: string,
  leadId: string,
  opts: {
    userId: string | null;
    teamId: string | null;
    actorId: string;
    /** "reassigned" on assign, "closed" on full unassign. */
    superseaseStatus: "reassigned" | "closed";
  },
): Promise<void> {
  const db = adminDatabases();

  // Supersede the current active assignment (if any).
  try {
    const active = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.leadAssignments,
      [
        Query.equal("workspaceId", orgId),
        Query.equal("leadId", leadId),
        Query.equal("status", "active"),
        Query.limit(100),
      ],
    );
    await Promise.all(
      active.documents.map((d) =>
        db.updateDocument(DATABASE_ID, COLLECTION.leadAssignments, d.$id, {
          status: opts.superseaseStatus,
        }),
      ),
    );
  } catch {
    /* audit collection is best-effort */
  }

  const hasOwner = !!(opts.userId || opts.teamId);
  await db.updateDocument(DATABASE_ID, COLLECTION.leads, leadId, {
    assignedToUserId: opts.userId,
    assignedToTeamId: opts.teamId,
    // A human / team now owns it → clear the handoff flag (parity with backend).
    ...(hasOwner ? { needsHuman: false } : {}),
  });

  if (hasOwner) {
    try {
      await db.createDocument(
        DATABASE_ID,
        COLLECTION.leadAssignments,
        ID.unique(),
        {
          workspaceId: orgId,
          leadId,
          assignedToUserId: opts.userId,
          assignedToTeamId: opts.teamId,
          assignedByUserId: opts.actorId,
          status: "active",
        },
      );
    } catch {
      /* audit append is best-effort */
    }
  }
}

export interface AssignLeadInput {
  leadId: string;
  userId?: string | null;
  teamId?: string | null;
}

/**
 * Assign a lead to a member and/or a sales team. Requires `org:leads:assign`.
 * Validates that the user is an active member and the team exists in the
 * workspace (parity with `assign_lead`).
 */
export async function assignLead(
  input: AssignLeadInput,
): Promise<{ ok: true }> {
  const ctx = await requirePermission("org:leads:assign");

  const userId = input.userId ?? null;
  const teamId = input.teamId ?? null;
  if (!userId && !teamId) {
    throw new ForbiddenError("Provide a user and/or team to assign.");
  }

  await loadOwnedLead(ctx.orgId, input.leadId);
  const db = adminDatabases();

  if (userId) {
    const ok = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.workspaceMembers,
      [
        Query.equal("workspaceId", ctx.orgId),
        Query.equal("userId", userId),
        Query.notEqual("status", "disabled"),
        Query.limit(1),
      ],
    );
    if (ok.documents.length === 0) {
      throw new ForbiddenError(
        "That user is not an active member of this workspace.",
      );
    }
  }
  if (teamId) {
    try {
      const team = (await db.getDocument(
        DATABASE_ID,
        COLLECTION.salesTeams,
        teamId,
      )) as { workspaceId?: string | null };
      assertOwned(ctx.orgId, team);
    } catch {
      throw new ForbiddenError(
        "That sales team does not exist in this workspace.",
      );
    }
  }

  await applyAssignment(ctx.orgId, input.leadId, {
    userId,
    teamId,
    actorId: ctx.userId,
    superseaseStatus: "reassigned",
  });

  revalidateLeadSurfaces();
  return { ok: true };
}

export interface UnassignLeadInput {
  leadId: string;
}

/**
 * Clear a lead's owner and close the active assignment audit row. Requires
 * `org:leads:assign`. Port of `unassign_lead`.
 */
export async function unassignLead(
  input: UnassignLeadInput,
): Promise<{ ok: true }> {
  const ctx = await requirePermission("org:leads:assign");
  await loadOwnedLead(ctx.orgId, input.leadId);

  await applyAssignment(ctx.orgId, input.leadId, {
    userId: null,
    teamId: null,
    actorId: ctx.userId,
    superseaseStatus: "closed",
  });

  revalidateLeadSurfaces();
  return { ok: true };
}
