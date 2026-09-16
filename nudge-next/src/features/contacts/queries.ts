import "server-only";

/**
 * Contact reads (tenant-scoped). Every query goes through `withTenant` so the
 * admin client (which bypasses Appwrite ACLs) can never read across tenants.
 *
 * Reads require no special permission beyond an active workspace membership —
 * viewers can list/search contacts read-only; mutations live in actions.ts and
 * are gated by `org:contacts:manage`.
 */

import { Query, type Models } from "node-appwrite";

import { getRequestContext } from "@/lib/auth/context";
import { adminDatabases, ID } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant, assertOwned } from "@/lib/appwrite/tenant";
import type { Contact, ContactListResult, OptInStatus } from "./types";

const VALID_OPT_IN: ReadonlySet<string> = new Set([
  "opted_in",
  "opted_out",
  "unknown",
]);

/** Map a raw Appwrite document to the serializable {@link Contact} shape. */
export function mapContact(doc: Models.Document): Contact {
  const d = doc as Models.Document & Record<string, unknown>;
  const rawStatus = typeof d.optInStatus === "string" ? d.optInStatus : "unknown";
  const optInStatus: OptInStatus = VALID_OPT_IN.has(rawStatus)
    ? (rawStatus as OptInStatus)
    : "unknown";
  return {
    id: doc.$id,
    fullName: (d.fullName as string) ?? null,
    whatsappNumber: (d.whatsappNumber as string) ?? "",
    email: (d.email as string) ?? null,
    city: (d.city as string) ?? null,
    gender: (d.gender as string) ?? null,
    age: typeof d.age === "number" ? d.age : null,
    occupationType: (d.occupationType as string) ?? null,
    monthlyIncome: typeof d.monthlyIncome === "number" ? d.monthlyIncome : null,
    existingCustomer: (d.existingCustomer as string) ?? null,
    tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
    optInStatus,
    optInSource: (d.optInSource as string) ?? null,
    optInAt: (d.optInAt as string) ?? null,
    createdAt: doc.$createdAt,
  };
}

export interface ListContactsParams {
  /** Free-text search across name / number / email. */
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * List (and optionally search) the active workspace's contacts. Appwrite has no
 * cross-attribute OR text search without fulltext indexes, so for a search term
 * we fetch a tenant-scoped page and filter in memory across name/number/email —
 * matching the simple substring search of the old ContactsPage.
 */
export async function listContacts(
  params: ListContactsParams = {},
): Promise<ContactListResult> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = (params.search ?? "").trim().toLowerCase();

  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contacts,
    withTenant(ctx.orgId, [
      Query.orderDesc("$createdAt"),
      Query.limit(search ? 500 : limit),
      Query.offset(search ? 0 : offset),
    ]),
  );

  let contacts = res.documents.map(mapContact);
  let total = res.total;

  if (search) {
    contacts = contacts.filter((c) =>
      `${c.fullName ?? ""} ${c.whatsappNumber} ${c.email ?? ""}`
        .toLowerCase()
        .includes(search),
    );
    total = contacts.length;
    contacts = contacts.slice(0, limit);
  }

  return { contacts, total };
}

/** Total contact count in the active workspace (for plan/usage display). */
export async function countContacts(): Promise<number> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contacts,
    withTenant(ctx.orgId, [Query.limit(1)]),
  );
  return res.total;
}

/** Fetch a single contact by id, asserting tenant ownership. */
export async function getContact(id: string): Promise<Contact> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  const doc = await db.getDocument(DATABASE_ID, COLLECTION.contacts, id);
  return mapContact(assertOwned(ctx.orgId, doc as Models.Document & { workspaceId?: string }));
}

/**
 * Find an existing contact by normalized WhatsApp number within the tenant.
 * Used by create/import to enforce the unique (workspaceId,whatsappNumber).
 */
export async function findContactByNumber(
  orgId: string,
  whatsappNumber: string,
): Promise<Models.Document | null> {
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contacts,
    withTenant(orgId, [
      Query.equal("whatsappNumber", whatsappNumber),
      Query.limit(1),
    ]),
  );
  return res.documents[0] ?? null;
}

export { ID };
