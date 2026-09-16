"use server";

/**
 * Contact mutations (port of backend/api/contacts.py).
 *
 * All mutations require `org:contacts:manage` (owner/admin/manager grant it;
 * agent/viewer do not) and are tenant-scoped via `withTenant` / ownership
 * assertions. After each write we `revalidatePath('/contacts')` so the RSC list
 * re-reads.
 *
 * PLAN GATING (Phase 7): `createContact` and `importContactsCsv` call
 * `assertCanAddContacts(ctx, n)` BEFORE writing, throwing GatedError(402) at the
 * boundary when the workspace's effective-plan contact limit would be exceeded
 * (parity with backend/plans.py + contacts.py:164/253/281).
 */

import { revalidatePath } from "next/cache";
import { Query, AppwriteException, type Models } from "node-appwrite";

import { requirePermission } from "@/lib/auth/require";
import { GatedError, ForbiddenError } from "@/lib/auth/errors";
import { assertCanAddContacts } from "@/lib/billing/gating";
import { adminDatabases, ID } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant, assertOwned } from "@/lib/appwrite/tenant";
import { mapContact, findContactByNumber } from "./queries";
import type {
  Contact,
  CreateContactInput,
  UpdateContactInput,
  CsvImportResult,
} from "./types";

const PERM = "org:contacts:manage" as const;

/** WhatsApp number normalizer (mirrors inbound.normalizePhone: digits-only). */
function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits || (raw ?? "").trim();
}

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function cleanInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/** Build the create payload from validated input. */
function buildContactDoc(orgId: string, input: CreateContactInput) {
  return {
    workspaceId: orgId,
    fullName: cleanString(input.fullName),
    whatsappNumber: normalizePhone(input.whatsappNumber),
    email: cleanString(input.email),
    city: cleanString(input.city),
    gender: cleanString(input.gender),
    age: cleanInt(input.age),
    occupationType: cleanString(input.occupationType),
    monthlyIncome: cleanInt(input.monthlyIncome),
    existingCustomer: cleanString(input.existingCustomer),
    tags: Array.isArray(input.tags) ? input.tags.filter(Boolean) : [],
    optInStatus: "unknown" as const,
    optInSource: null,
    optInAt: null,
  };
}

/** Create a single contact. Unique (workspaceId,whatsappNumber). */
export async function createContact(
  input: CreateContactInput,
): Promise<Contact> {
  const ctx = await requirePermission(PERM);
  const number = normalizePhone(input.whatsappNumber);
  if (!number) {
    throw new ForbiddenError("A WhatsApp number is required.");
  }

  // Plan gate: adding 1 contact must not exceed the effective-plan limit.
  await assertCanAddContacts(ctx, 1);

  const db = adminDatabases();
  const existing = await findContactByNumber(ctx.orgId, number);
  if (existing) {
    throw new GatedError("A contact with this WhatsApp number already exists.");
  }

  const doc = await db.createDocument(
    DATABASE_ID,
    COLLECTION.contacts,
    ID.unique(),
    buildContactDoc(ctx.orgId, { ...input, whatsappNumber: number }),
  );
  revalidatePath("/contacts");
  return mapContact(doc);
}

/** Update a contact's editable fields. */
export async function updateContact(
  id: string,
  input: UpdateContactInput,
): Promise<Contact> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();

  const current = await db.getDocument(DATABASE_ID, COLLECTION.contacts, id);
  assertOwned(ctx.orgId, current as Models.Document & { workspaceId?: string });

  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.fullName = cleanString(input.fullName);
  if (input.email !== undefined) patch.email = cleanString(input.email);
  if (input.city !== undefined) patch.city = cleanString(input.city);
  if (input.monthlyIncome !== undefined)
    patch.monthlyIncome = cleanInt(input.monthlyIncome);
  if (input.existingCustomer !== undefined)
    patch.existingCustomer = cleanString(input.existingCustomer);
  if (input.tags !== undefined)
    patch.tags = Array.isArray(input.tags) ? input.tags.filter(Boolean) : [];

  const doc = await db.updateDocument(
    DATABASE_ID,
    COLLECTION.contacts,
    id,
    patch,
  );
  revalidatePath("/contacts");
  return mapContact(doc);
}

/** Delete a contact (tenant-checked). */
export async function deleteContact(id: string): Promise<{ ok: true }> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();
  const current = await db.getDocument(DATABASE_ID, COLLECTION.contacts, id);
  assertOwned(ctx.orgId, current as Models.Document & { workspaceId?: string });
  await db.deleteDocument(DATABASE_ID, COLLECTION.contacts, id);
  revalidatePath("/contacts");
  return { ok: true };
}

/** Replace a contact's tag set (deduped). */
export async function setContactTags(
  id: string,
  tags: string[],
): Promise<Contact> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();
  const current = await db.getDocument(DATABASE_ID, COLLECTION.contacts, id);
  assertOwned(ctx.orgId, current as Models.Document & { workspaceId?: string });

  const next = Array.from(
    new Set((tags ?? []).map((t) => t.trim()).filter(Boolean)),
  );
  const doc = await db.updateDocument(DATABASE_ID, COLLECTION.contacts, id, {
    tags: next,
  });
  revalidatePath("/contacts");
  return mapContact(doc);
}

/** Mark a contact opted in (manual consent). */
export async function optInContact(id: string): Promise<Contact> {
  return setOptIn(id, "opted_in");
}

/** Mark a contact opted out (suppresses marketing sends). */
export async function optOutContact(id: string): Promise<Contact> {
  return setOptIn(id, "opted_out");
}

async function setOptIn(
  id: string,
  status: "opted_in" | "opted_out",
): Promise<Contact> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();
  const current = await db.getDocument(DATABASE_ID, COLLECTION.contacts, id);
  assertOwned(ctx.orgId, current as Models.Document & { workspaceId?: string });

  const doc = await db.updateDocument(DATABASE_ID, COLLECTION.contacts, id, {
    optInStatus: status,
    optInSource: "manual",
    optInAt: status === "opted_in" ? new Date().toISOString() : null,
  });
  revalidatePath("/contacts");
  return mapContact(doc);
}

/**
 * Parse a minimal RFC-4180-ish CSV (quoted fields, commas, CRLF) into rows of
 * `{ header: value }`. Header row is required. Kept dependency-free.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow; handled by the following \n (or EOF)
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}

const HEADER_ALIASES: Record<string, keyof CreateContactInput> = {
  whatsapp_number: "whatsappNumber",
  whatsapp: "whatsappNumber",
  phone: "whatsappNumber",
  number: "whatsappNumber",
  full_name: "fullName",
  name: "fullName",
  email: "email",
  city: "city",
  gender: "gender",
  age: "age",
  occupation_type: "occupationType",
  occupation: "occupationType",
  monthly_income: "monthlyIncome",
  income: "monthlyIncome",
  existing_customer: "existingCustomer",
};

/**
 * Import contacts from a CSV string (get-or-create on whatsappNumber). Returns
 * created/updated/skipped counts, mirroring contacts.py import semantics. Plan
 * gating is deferred to Phase 7.
 */
export async function importContactsCsv(
  csvText: string,
): Promise<CsvImportResult> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();
  const rows = parseCsv(csvText);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of rows) {
    const mapped: Partial<CreateContactInput> = {};
    for (const [key, val] of Object.entries(raw)) {
      const field = HEADER_ALIASES[key];
      if (!field) continue;
      if (field === "age" || field === "monthlyIncome") {
        (mapped as Record<string, unknown>)[field] = cleanInt(val);
      } else {
        (mapped as Record<string, unknown>)[field] = val;
      }
    }

    const number = normalizePhone(String(mapped.whatsappNumber ?? ""));
    if (!number) {
      skipped++;
      continue;
    }

    try {
      const existing = await findContactByNumber(ctx.orgId, number);
      if (existing) {
        const patch: Record<string, unknown> = {};
        if (mapped.fullName) patch.fullName = cleanString(mapped.fullName);
        if (mapped.email) patch.email = cleanString(mapped.email);
        if (mapped.city) patch.city = cleanString(mapped.city);
        if (mapped.monthlyIncome !== undefined && mapped.monthlyIncome !== null)
          patch.monthlyIncome = mapped.monthlyIncome;
        if (Object.keys(patch).length > 0) {
          await db.updateDocument(
            DATABASE_ID,
            COLLECTION.contacts,
            existing.$id,
            patch,
          );
        }
        updated++;
      } else {
        // Plan gate per NEW contact: re-checks the live count so the limit is
        // enforced exactly at the boundary even mid-batch. GatedError(402)
        // aborts the import (callers surface "limit reached, N imported").
        await assertCanAddContacts(ctx, 1);
        await db.createDocument(
          DATABASE_ID,
          COLLECTION.contacts,
          ID.unique(),
          buildContactDoc(ctx.orgId, {
            ...mapped,
            whatsappNumber: number,
          } as CreateContactInput),
        );
        created++;
      }
    } catch (err) {
      // Unique-collision race or malformed row → skip, don't abort the batch.
      if (err instanceof AppwriteException) {
        skipped++;
        continue;
      }
      throw err;
    }
  }

  revalidatePath("/contacts");
  return { created, updated, skipped };
}

/**
 * Convenience for the import dialog: accepts a browser File via FormData.
 * Reads the file text server-side and delegates to importContactsCsv.
 */
export async function importContactsFromForm(
  formData: FormData,
): Promise<CsvImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new ForbiddenError("A CSV file is required.");
  }
  const text = await file.text();
  return importContactsCsv(text);
}

// Re-export tenant query helper so callers that need contact counts can build
// scoped queries without importing the appwrite layer directly.
export { Query };
