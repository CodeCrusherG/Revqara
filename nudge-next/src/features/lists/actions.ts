"use server";

/**
 * Contact-list mutations (port of the list endpoints in backend/api/contacts.py).
 *
 * Lists are part of the audience/contacts domain, so all mutations require
 * `org:contacts:manage` (owner/admin/manager). Membership writes enforce the
 * unique (listId,contactId) constraint via get-or-create. After each write we
 * `revalidatePath('/lists')`.
 *
 * PLAN GATING (Phase 7): `createList` calls `assertCanCreateList(ctx)` before
 * writing, throwing GatedError(402) when the effective-plan list limit would be
 * exceeded (parity with backend/plans.py + contacts.py:326).
 */

import { revalidatePath } from "next/cache";
import { Query, AppwriteException, type Models } from "node-appwrite";

import { requirePermission } from "@/lib/auth/require";
import { ForbiddenError } from "@/lib/auth/errors";
import { assertCanCreateList } from "@/lib/billing/gating";
import { adminDatabases, ID } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant, assertOwned } from "@/lib/appwrite/tenant";

const PERM = "org:contacts:manage" as const;

/**
 * Read the contact ids that are members of a list (tenant-scoped). Exposed as a
 * server action so the client "Manage contacts" dialog — which already holds the
 * full contact list — can resolve membership without re-fetching contacts.
 * Readable by any member (no mutate permission required).
 */
export async function loadListMemberIds(listId: string): Promise<string[]> {
  const { getRequestContext } = await import("@/lib/auth/context");
  const ctx = await getRequestContext();
  await assertListOwned(ctx.orgId, listId);
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contactListMembers,
    withTenant(ctx.orgId, [Query.equal("listId", listId), Query.limit(500)]),
  );
  return res.documents
    .map((m) => (m as Models.Document & { contactId?: string }).contactId)
    .filter((id): id is string => !!id);
}

export interface ContactListSummary {
  id: string;
  name: string;
  description: string | null;
}

async function assertListOwned(orgId: string, listId: string): Promise<void> {
  const db = adminDatabases();
  const list = await db.getDocument(
    DATABASE_ID,
    COLLECTION.contactLists,
    listId,
  );
  assertOwned(orgId, list as Models.Document & { workspaceId?: string });
}

async function assertContactOwned(
  orgId: string,
  contactId: string,
): Promise<void> {
  const db = adminDatabases();
  const contact = await db.getDocument(
    DATABASE_ID,
    COLLECTION.contacts,
    contactId,
  );
  assertOwned(orgId, contact as Models.Document & { workspaceId?: string });
}

/** Create a named audience. */
export async function createList(input: {
  name: string;
  description?: string | null;
}): Promise<ContactListSummary> {
  const ctx = await requirePermission(PERM);
  const name = (input.name ?? "").trim();
  if (!name) {
    throw new ForbiddenError("A list name is required.");
  }

  // Plan gate: creating one more list must not exceed the effective-plan limit.
  await assertCanCreateList(ctx);

  const db = adminDatabases();
  try {
    const doc = await db.createDocument(
      DATABASE_ID,
      COLLECTION.contactLists,
      ID.unique(),
      {
        workspaceId: ctx.orgId,
        name,
        description: input.description?.trim() || null,
      },
    );
    revalidatePath("/lists");
    return {
      id: doc.$id,
      name,
      description:
        (doc as Models.Document & { description?: string }).description ?? null,
    };
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) {
      throw new ForbiddenError("A list with this name already exists.");
    }
    throw err;
  }
}

/** Delete a list and all its membership rows (tenant-checked). */
export async function deleteList(listId: string): Promise<{ ok: true }> {
  const ctx = await requirePermission(PERM);
  await assertListOwned(ctx.orgId, listId);

  const db = adminDatabases();
  // Remove membership rows first (best-effort; the list delete is the contract).
  const members = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contactListMembers,
    withTenant(ctx.orgId, [Query.equal("listId", listId), Query.limit(500)]),
  );
  await Promise.all(
    members.documents.map((m) =>
      db
        .deleteDocument(DATABASE_ID, COLLECTION.contactListMembers, m.$id)
        .catch(() => undefined),
    ),
  );

  await db.deleteDocument(DATABASE_ID, COLLECTION.contactLists, listId);
  revalidatePath("/lists");
  return { ok: true };
}

/**
 * Add contacts to a list (get-or-create per membership, so re-adding is a
 * no-op). Returns the number of newly-added members.
 */
export async function addListMembers(
  listId: string,
  contactIds: string[],
): Promise<{ added: number }> {
  const ctx = await requirePermission(PERM);
  await assertListOwned(ctx.orgId, listId);

  const db = adminDatabases();
  const ids = Array.from(new Set((contactIds ?? []).filter(Boolean)));
  let added = 0;

  for (const contactId of ids) {
    try {
      await assertContactOwned(ctx.orgId, contactId);
      await db.createDocument(
        DATABASE_ID,
        COLLECTION.contactListMembers,
        ID.unique(),
        { workspaceId: ctx.orgId, listId, contactId },
      );
      added++;
    } catch (err) {
      // 409 ⇒ already a member (unique listId+contactId) → skip silently.
      if (err instanceof AppwriteException && err.code === 409) continue;
      // Cross-tenant / missing contact → skip that one, keep the batch going.
      if (err instanceof AppwriteException) continue;
      throw err;
    }
  }

  revalidatePath("/lists");
  return { added };
}

/** Remove a single contact from a list (tenant-checked). */
export async function removeListMember(
  listId: string,
  contactId: string,
): Promise<{ ok: true }> {
  const ctx = await requirePermission(PERM);
  await assertListOwned(ctx.orgId, listId);

  const db = adminDatabases();
  const existing = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contactListMembers,
    withTenant(ctx.orgId, [
      Query.equal("listId", listId),
      Query.equal("contactId", contactId),
      Query.limit(1),
    ]),
  );
  const doc = existing.documents[0];
  if (doc) {
    await db.deleteDocument(
      DATABASE_ID,
      COLLECTION.contactListMembers,
      doc.$id,
    );
  }
  revalidatePath("/lists");
  return { ok: true };
}
