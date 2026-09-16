"use server";

/**
 * Global search — the dynamic side of the ⌘K command menu.
 *
 * `globalSearch(q)` runs a tenant-scoped, RBAC-aware substring search across the
 * three highest-value entities and returns a flat, serializable result list the
 * client palette renders alongside its static nav quick-actions:
 *
 *   - contacts       (name / number / email)        — any member
 *   - leads          (name / phone / intent)         — RBAC-scoped (agents see
 *                                                       only their own/team leads)
 *   - conversations  (customer name / wa id)         — RBAC-scoped (a conversation
 *                                                       is visible iff its lead is)
 *
 * Appwrite has no cross-attribute OR text search without fulltext indexes, so —
 * exactly like `features/contacts/queries.listContacts` — we fetch a
 * tenant-scoped page and substring-filter in memory. This keeps the search
 * build-safe (no schema dependency) and bounded (small page + capped results).
 *
 * It is a Server Action (`"use server"`) rather than a Route Handler because it
 * is a first-party read triggered from our own UI; it enforces tenancy via
 * `getRequestContext()` + `withTenant`/`leadScopeQueries` and never touches
 * Appwrite from the client. Every read is fully isolated to the active org.
 */

import { Query } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant } from "@/lib/appwrite/tenant";
import { getRequestContext } from "@/lib/auth/context";
import { logger } from "@/lib/logger";
import {
  leadScopeQueries,
  isLeadScopeRestricted,
  resolveCallerTeamIds,
} from "@/features/leads/scope";

const log = logger.child({ mod: "search" });

/** How many docs to scan per entity (bounded; in-memory substring filter). */
const SCAN_LIMIT = 200;
/** Max results returned per entity group. */
const PER_GROUP = 5;

export type SearchEntity = "contact" | "lead" | "conversation";

export interface SearchResult {
  entity: SearchEntity;
  id: string;
  title: string;
  subtitle: string | null;
  /** App route the client should navigate to on select. */
  href: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** Search contacts (name / number / email). Tenant-scoped; any member. */
async function searchContacts(
  orgId: string,
  needle: string,
): Promise<SearchResult[]> {
  try {
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.contacts,
      withTenant(orgId, [Query.orderDesc("$createdAt"), Query.limit(SCAN_LIMIT)]),
    );
    return res.documents
      .filter((d) =>
        `${str(d.fullName) ?? ""} ${str(d.whatsappNumber) ?? ""} ${str(d.email) ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, PER_GROUP)
      .map((d) => ({
        entity: "contact" as const,
        id: String(d.$id),
        title: str(d.fullName) ?? str(d.whatsappNumber) ?? "Contact",
        subtitle: str(d.whatsappNumber),
        href: "/contacts",
      }));
  } catch (err) {
    log.warn("contact search failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Search leads (name / phone / intent). RBAC-scoped via leadScopeQueries. */
async function searchLeads(
  ctx: Awaited<ReturnType<typeof getRequestContext>>,
  needle: string,
): Promise<SearchResult[]> {
  try {
    const queries = await leadScopeQueries(ctx);
    queries.push(Query.orderDesc("$createdAt"), Query.limit(SCAN_LIMIT));
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.leads,
      queries,
    );
    return res.documents
      .filter((d) =>
        `${str(d.name) ?? ""} ${str(d.phone) ?? ""} ${str(d.intent) ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, PER_GROUP)
      .map((d) => ({
        entity: "lead" as const,
        id: String(d.$id),
        title: str(d.name) ?? str(d.phone) ?? "Lead",
        subtitle: str(d.intent) ?? str(d.status),
        href: "/leads",
      }));
  } catch (err) {
    log.warn("lead search failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Search conversations (customer name / wa id). A conversation is visible iff
 * its lead is — so a restricted (agent) caller is filtered down to the
 * conversation ids backing their visible leads, mirroring inbox scoping.
 */
async function searchConversations(
  ctx: Awaited<ReturnType<typeof getRequestContext>>,
  needle: string,
): Promise<SearchResult[]> {
  try {
    const restricted = isLeadScopeRestricted(ctx);

    // Build the set of conversation ids the caller may see (restricted only).
    let visibleConvoIds: Set<string> | null = null;
    if (restricted) {
      const teamIds = await resolveCallerTeamIds(ctx);
      const leadQ = await leadScopeQueries(ctx);
      leadQ.push(Query.limit(2000));
      const leads = await adminDatabases().listDocuments(
        DATABASE_ID,
        COLLECTION.leads,
        leadQ,
      );
      visibleConvoIds = new Set(
        leads.documents
          .map((d) => str(d.conversationId))
          .filter((id): id is string => !!id),
      );
      // Keep teamIds referenced (scope resolution side-effect parity).
      void teamIds;
    }

    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.conversations,
      withTenant(ctx.orgId, [
        Query.orderDesc("lastInboundAt"),
        Query.limit(SCAN_LIMIT),
      ]),
    );

    return res.documents
      .filter((d) => {
        if (visibleConvoIds && !visibleConvoIds.has(String(d.$id))) return false;
        return `${str(d.customerName) ?? ""} ${str(d.customerWaId) ?? ""}`
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, PER_GROUP)
      .map((d) => ({
        entity: "conversation" as const,
        id: String(d.$id),
        title: str(d.customerName) ?? str(d.customerWaId) ?? "Conversation",
        subtitle: str(d.customerWaId),
        href: `/inbox/${String(d.$id)}`,
      }));
  } catch (err) {
    log.warn("conversation search failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export interface GlobalSearchResponse {
  query: string;
  results: SearchResult[];
}

/**
 * Tenant-scoped, RBAC-aware global search. Returns up to {@link PER_GROUP}
 * results per entity (contacts + leads + conversations), contacts first. A blank
 * or too-short query short-circuits to an empty list (the palette shows its
 * static quick-actions instead). The three searches run in parallel.
 */
export async function globalSearch(q: string): Promise<GlobalSearchResponse> {
  const query = (q ?? "").trim();
  if (query.length < 2) {
    return { query, results: [] };
  }

  const ctx = await getRequestContext();
  const needle = query.toLowerCase();

  const [contacts, leads, conversations] = await Promise.all([
    searchContacts(ctx.orgId, needle),
    searchLeads(ctx, needle),
    searchConversations(ctx, needle),
  ]);

  return { query, results: [...contacts, ...leads, ...conversations] };
}
