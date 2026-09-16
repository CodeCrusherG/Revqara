"use server";

/**
 * Template mutations (port of backend/api/templates.py).
 *
 * All mutations require `org:templates:manage` (owner/admin). New templates are
 * created as `draft`; `submitTemplate` moves draft/rejected → `pending` (the
 * Meta/approval step is a later concern — here it just flips status). Unique
 * (workspaceId,name) is enforced by the collection. After each write we
 * `revalidatePath('/templates')`.
 */

import { revalidatePath } from "next/cache";
import { AppwriteException, type Models } from "node-appwrite";

import { requirePermission } from "@/lib/auth/require";
import { ForbiddenError } from "@/lib/auth/errors";
import { adminDatabases, ID } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { assertOwned } from "@/lib/appwrite/tenant";
import { mapTemplate, type Template, type TemplateCategory } from "./queries";

const PERM = "org:templates:manage" as const;

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "marketing",
  "utility",
  "authentication",
  "service",
]);

export interface CreateTemplateInput {
  name: string;
  category?: string;
  language?: string;
  body: string;
}

/** Create a draft template. */
export async function createTemplate(
  input: CreateTemplateInput,
): Promise<Template> {
  const ctx = await requirePermission(PERM);
  const name = (input.name ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!name) throw new ForbiddenError("A template name is required.");
  if (!body) throw new ForbiddenError("A message body is required.");

  const category =
    input.category && VALID_CATEGORIES.has(input.category)
      ? input.category
      : "marketing";

  const db = adminDatabases();
  try {
    const doc = await db.createDocument(
      DATABASE_ID,
      COLLECTION.templates,
      ID.unique(),
      {
        workspaceId: ctx.orgId,
        name,
        category,
        language: (input.language ?? "en").trim() || "en",
        body,
        status: "draft",
      },
    );
    revalidatePath("/templates");
    return mapTemplate(doc);
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) {
      throw new ForbiddenError("A template with this name already exists.");
    }
    throw err;
  }
}

/** Submit a draft/rejected template for approval (→ pending). */
export async function submitTemplate(id: string): Promise<Template> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();

  const current = await db.getDocument(DATABASE_ID, COLLECTION.templates, id);
  assertOwned(ctx.orgId, current as Models.Document & { workspaceId?: string });
  const status = (current as Models.Document & { status?: string }).status;
  if (status === "approved") {
    throw new ForbiddenError("This template is already approved.");
  }

  const doc = await db.updateDocument(DATABASE_ID, COLLECTION.templates, id, {
    status: "pending",
  });
  revalidatePath("/templates");
  return mapTemplate(doc);
}

export interface UpdateTemplateInput {
  name?: string;
  category?: string;
  language?: string;
  body?: string;
}

/** Update an editable template's fields. */
export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<Template> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();
  const current = await db.getDocument(DATABASE_ID, COLLECTION.templates, id);
  assertOwned(ctx.orgId, current as Models.Document & { workspaceId?: string });

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ForbiddenError("Template name cannot be empty.");
    patch.name = name;
  }
  if (input.category !== undefined && VALID_CATEGORIES.has(input.category)) {
    patch.category = input.category as TemplateCategory;
  }
  if (input.language !== undefined) {
    patch.language = input.language.trim() || "en";
  }
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) throw new ForbiddenError("Message body cannot be empty.");
    patch.body = body;
  }

  const doc = await db.updateDocument(
    DATABASE_ID,
    COLLECTION.templates,
    id,
    patch,
  );
  revalidatePath("/templates");
  return mapTemplate(doc);
}

/** Delete a template (tenant-checked). */
export async function deleteTemplate(id: string): Promise<{ ok: true }> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();
  const current = await db.getDocument(DATABASE_ID, COLLECTION.templates, id);
  assertOwned(ctx.orgId, current as Models.Document & { workspaceId?: string });
  await db.deleteDocument(DATABASE_ID, COLLECTION.templates, id);
  revalidatePath("/templates");
  return { ok: true };
}
