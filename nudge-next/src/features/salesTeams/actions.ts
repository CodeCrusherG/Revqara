"use server";

/**
 * Sales-team mutations (port of backend/api/sales_teams.py).
 *
 * Sales teams are part of the team-routing domain, so all mutations require
 * `org:team:manage` (owner/admin). Membership writes enforce the unique
 * (teamId,userId) constraint via get-or-create. After each write we
 * `revalidatePath('/sales-teams')`.
 *
 * Team MEMBER identity comes from Clerk (features/team/actions.listMembers);
 * this module only manages the Appwrite sales-team grouping, not memberships.
 */

import { revalidatePath } from "next/cache";
import { Query, AppwriteException, type Models } from "node-appwrite";

import { requirePermission } from "@/lib/auth/require";
import { ForbiddenError } from "@/lib/auth/errors";
import { adminDatabases, ID } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant, assertOwned } from "@/lib/appwrite/tenant";

const PERM = "org:team:manage" as const;

export interface SalesTeamSummary {
  id: string;
  name: string;
  description: string | null;
}

async function assertTeamOwned(orgId: string, teamId: string): Promise<void> {
  const db = adminDatabases();
  const team = await db.getDocument(DATABASE_ID, COLLECTION.salesTeams, teamId);
  assertOwned(orgId, team as Models.Document & { workspaceId?: string });
}

/** Create a sales team. Unique (workspaceId,name). */
export async function createSalesTeam(input: {
  name: string;
  description?: string | null;
}): Promise<SalesTeamSummary> {
  const ctx = await requirePermission(PERM);
  const name = (input.name ?? "").trim();
  if (!name) throw new ForbiddenError("A team name is required.");

  const db = adminDatabases();
  try {
    const doc = await db.createDocument(
      DATABASE_ID,
      COLLECTION.salesTeams,
      ID.unique(),
      {
        workspaceId: ctx.orgId,
        name,
        description: input.description?.trim() || null,
      },
    );
    revalidatePath("/sales-teams");
    return {
      id: doc.$id,
      name,
      description:
        (doc as Models.Document & { description?: string }).description ?? null,
    };
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) {
      throw new ForbiddenError("A team with this name already exists.");
    }
    throw err;
  }
}

/** Rename / re-describe a sales team. */
export async function updateSalesTeam(
  teamId: string,
  input: { name?: string; description?: string | null },
): Promise<SalesTeamSummary> {
  const ctx = await requirePermission(PERM);
  await assertTeamOwned(ctx.orgId, teamId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ForbiddenError("Team name cannot be empty.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }

  const db = adminDatabases();
  try {
    const doc = await db.updateDocument(
      DATABASE_ID,
      COLLECTION.salesTeams,
      teamId,
      patch,
    );
    revalidatePath("/sales-teams");
    return {
      id: doc.$id,
      name: (doc as Models.Document & { name?: string }).name ?? "",
      description:
        (doc as Models.Document & { description?: string }).description ?? null,
    };
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) {
      throw new ForbiddenError("A team with this name already exists.");
    }
    throw err;
  }
}

/** Delete a sales team and all its membership rows (tenant-checked). */
export async function deleteSalesTeam(teamId: string): Promise<{ ok: true }> {
  const ctx = await requirePermission(PERM);
  await assertTeamOwned(ctx.orgId, teamId);

  const db = adminDatabases();
  const members = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.salesTeamMembers,
    withTenant(ctx.orgId, [Query.equal("teamId", teamId), Query.limit(200)]),
  );
  await Promise.all(
    members.documents.map((m) =>
      db
        .deleteDocument(DATABASE_ID, COLLECTION.salesTeamMembers, m.$id)
        .catch(() => undefined),
    ),
  );

  await db.deleteDocument(DATABASE_ID, COLLECTION.salesTeams, teamId);
  revalidatePath("/sales-teams");
  return { ok: true };
}

/** Add a user to a sales team (get-or-create; unique teamId+userId). */
export async function addSalesTeamMember(
  teamId: string,
  userId: string,
): Promise<{ ok: true }> {
  const ctx = await requirePermission(PERM);
  await assertTeamOwned(ctx.orgId, teamId);

  const uid = (userId ?? "").trim();
  if (!uid) throw new ForbiddenError("A user is required.");

  const db = adminDatabases();
  try {
    await db.createDocument(
      DATABASE_ID,
      COLLECTION.salesTeamMembers,
      ID.unique(),
      { workspaceId: ctx.orgId, teamId, userId: uid },
    );
  } catch (err) {
    // 409 ⇒ already a member → idempotent no-op.
    if (!(err instanceof AppwriteException && err.code === 409)) throw err;
  }
  revalidatePath("/sales-teams");
  return { ok: true };
}

/** Remove a user from a sales team (tenant-checked). */
export async function removeSalesTeamMember(
  teamId: string,
  userId: string,
): Promise<{ ok: true }> {
  const ctx = await requirePermission(PERM);
  await assertTeamOwned(ctx.orgId, teamId);

  const db = adminDatabases();
  const existing = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.salesTeamMembers,
    withTenant(ctx.orgId, [
      Query.equal("teamId", teamId),
      Query.equal("userId", userId),
      Query.limit(1),
    ]),
  );
  const doc = existing.documents[0];
  if (doc) {
    await db.deleteDocument(DATABASE_ID, COLLECTION.salesTeamMembers, doc.$id);
  }
  revalidatePath("/sales-teams");
  return { ok: true };
}
