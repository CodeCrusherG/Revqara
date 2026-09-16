import "server-only";

/**
 * Template reads (tenant-scoped). Templates are pre-approved WhatsApp message
 * templates required for business-initiated sends outside the 24h window.
 *
 * Reads require only an active workspace membership; mutations live in
 * actions.ts (gated by `org:templates:manage`).
 */

import { Query, type Models } from "node-appwrite";

import { getRequestContext } from "@/lib/auth/context";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant } from "@/lib/appwrite/tenant";

export type TemplateCategory =
  | "marketing"
  | "utility"
  | "authentication"
  | "service";
export type TemplateStatus = "draft" | "pending" | "approved" | "rejected";

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  body: string;
  status: TemplateStatus;
  createdAt: string;
}

const CATEGORIES: ReadonlySet<string> = new Set([
  "marketing",
  "utility",
  "authentication",
  "service",
]);
const STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "pending",
  "approved",
  "rejected",
]);

export function mapTemplate(doc: Models.Document): Template {
  const d = doc as Models.Document & Record<string, unknown>;
  const cat = typeof d.category === "string" ? d.category : "marketing";
  const status = typeof d.status === "string" ? d.status : "draft";
  return {
    id: doc.$id,
    name: (d.name as string) ?? "",
    category: (CATEGORIES.has(cat) ? cat : "marketing") as TemplateCategory,
    language: (d.language as string) ?? "en",
    body: (d.body as string) ?? "",
    status: (STATUSES.has(status) ? status : "draft") as TemplateStatus,
    createdAt: doc.$createdAt,
  };
}

/** List every template in the active workspace (newest first). */
export async function listTemplates(): Promise<Template[]> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.templates,
    withTenant(ctx.orgId, [Query.orderDesc("$createdAt"), Query.limit(200)]),
  );
  return res.documents.map(mapTemplate);
}
