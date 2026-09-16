import "server-only";

/**
 * Contact-list reads (tenant-scoped). Lists are named audiences a campaign can
 * target; membership lives in the `contact_list_members` join collection
 * (unique listId+contactId). Member counts are computed per list.
 *
 * Reads require only an active workspace membership (viewers included);
 * mutations live in actions.ts.
 */

import { Query, type Models } from "node-appwrite";

import { getRequestContext } from "@/lib/auth/context";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant, assertOwned } from "@/lib/appwrite/tenant";
import { mapContact } from "@/features/contacts/queries";
import type { Contact } from "@/features/contacts/types";

export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

/** Count members of a single list (tenant-scoped). */
async function memberCount(orgId: string, listId: string): Promise<number> {
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contactListMembers,
    withTenant(orgId, [Query.equal("listId", listId), Query.limit(1)]),
  );
  return res.total;
}

/** List every audience in the active workspace (with member counts). */
export async function listLists(): Promise<ContactList[]> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contactLists,
    withTenant(ctx.orgId, [Query.orderDesc("$createdAt"), Query.limit(200)]),
  );

  return Promise.all(
    res.documents.map(async (doc) => ({
      id: doc.$id,
      name: (doc as Models.Document & { name?: string }).name ?? "",
      description:
        (doc as Models.Document & { description?: string }).description ?? null,
      memberCount: await memberCount(ctx.orgId, doc.$id),
      createdAt: doc.$createdAt,
    })),
  );
}

/** The contacts that are members of a given list (tenant-scoped). */
export async function listMembers(listId: string): Promise<Contact[]> {
  const ctx = await getRequestContext();
  const db = adminDatabases();

  // Verify the list belongs to this workspace before reading members.
  const list = await db.getDocument(
    DATABASE_ID,
    COLLECTION.contactLists,
    listId,
  );
  assertOwned(ctx.orgId, list as Models.Document & { workspaceId?: string });

  const memberDocs = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contactListMembers,
    withTenant(ctx.orgId, [Query.equal("listId", listId), Query.limit(500)]),
  );
  const contactIds = memberDocs.documents
    .map((m) => (m as Models.Document & { contactId?: string }).contactId)
    .filter((id): id is string => !!id);

  if (contactIds.length === 0) return [];

  const contacts = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contacts,
    withTenant(ctx.orgId, [
      Query.equal("$id", contactIds),
      Query.limit(contactIds.length),
    ]),
  );
  return contacts.documents.map(mapContact);
}
