import "server-only";

/**
 * Entitlements — the effective plan limits + LIVE usage meters for a workspace
 * (NEXTJS_REWRITE_PLAN.md §6; parity with backend/plans.py).
 *
 * Limits are config (lib/billing/plans.ts). Usage is metered LIVE from Appwrite
 * (never stored): contacts, lists, numbers, and sends-today (count of
 * `whatsapp_messages` for the workspace since UTC midnight — the `sends_today`
 * parity). `effectivePlan(ws)` resolves the limit set from the billing status:
 *   - trialing / active / past_due ⇒ the PAID plan limits (trial + grace keep
 *     full access),
 *   - halted / cancelled / none    ⇒ FREE limits (downgrade-on-lapse).
 *
 * The pure parts (`effectivePlan`, `effectivePlanDef`, the limit accessors) take
 * a plain `{ plan, planStatus }` shape so they are unit-testable WITHOUT
 * Appwrite. Only the live meters + `usageSummary` touch the admin SDK.
 */

import { Query } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant } from "@/lib/appwrite/tenant";
import { planDef, DEFAULT_PLAN, type PlanDef, type PlanId } from "@/lib/billing/plans";
import type { RequestContext } from "@/lib/auth/context";
import type { WorkspacePlanStatus } from "@/types/appwrite";

/** The minimal workspace billing shape the entitlement logic reads. */
export interface BillingWorkspace {
  plan: PlanId | string | null | undefined;
  planStatus: WorkspacePlanStatus | string | null | undefined;
}

/**
 * Billing statuses that keep the workspace on its PAID limits. `trialing` (14-day
 * trial) and `past_due` (grace before halt) both retain full access; only
 * `halted` / `cancelled` / `none` fall back to free. Mirrors §6's gating column.
 */
const PAID_STATUSES = new Set<string>(["trialing", "active", "past_due"]);

/**
 * The plan id whose LIMITS apply right now. If the stored plan is a paid tier but
 * the subscription has lapsed (halted/cancelled/none), limits collapse to `free`
 * even though `ws.plan` may still read as the paid tier until the webhook flips
 * it. Pure — safe to unit-test.
 */
export function effectivePlan(ws: BillingWorkspace): PlanId {
  const status = (ws.planStatus ?? "none") as string;
  const planId = planDef(ws.plan).id;
  if (planId === "free") return "free";
  return PAID_STATUSES.has(status) ? planId : DEFAULT_PLAN;
}

/** The effective {@link PlanDef} (limits) for a workspace. Pure. */
export function effectivePlanDef(ws: BillingWorkspace): PlanDef {
  return planDef(effectivePlan(ws));
}

// ── Limit accessors (pure; read from the effective plan) ─────────────────────
export function maxContacts(ws: BillingWorkspace): number {
  return effectivePlanDef(ws).maxContacts;
}
export function maxLists(ws: BillingWorkspace): number {
  return effectivePlanDef(ws).maxLists;
}
export function maxNumbers(ws: BillingWorkspace): number {
  return effectivePlanDef(ws).maxNumbers;
}
export function maxSendsPerDay(ws: BillingWorkspace): number {
  return effectivePlanDef(ws).maxSends;
}

// ── Live meters (Appwrite admin; tenant-scoped counts) ───────────────────────

/** Count documents in a collection for the workspace (uses Appwrite's total). */
async function countForWorkspace(
  orgId: string,
  collectionId: string,
  extra: string[] = [],
): Promise<number> {
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    collectionId,
    withTenant(orgId, [...extra, Query.limit(1)]),
  );
  return res.total;
}

/** Live contact count for a workspace. */
export function contactCount(orgId: string): Promise<number> {
  return countForWorkspace(orgId, COLLECTION.contacts);
}

/** Live contact-list count for a workspace. */
export function listCount(orgId: string): Promise<number> {
  return countForWorkspace(orgId, COLLECTION.contactLists);
}

/** Live connected-WhatsApp-number count for a workspace. */
export function numberCount(orgId: string): Promise<number> {
  return countForWorkspace(orgId, COLLECTION.whatsappAccounts);
}

/** Start of the current day in UTC, as an ISO string (the `sends_today` epoch). */
export function utcMidnightIso(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  return d.toISOString();
}

/**
 * Sends today — count of `whatsapp_messages` for the workspace since UTC
 * midnight (parity with `plans.sends_today`). Filters on `$createdAt >= start`.
 */
export function sendsToday(orgId: string, now: Date = new Date()): Promise<number> {
  const start = utcMidnightIso(now);
  return countForWorkspace(orgId, COLLECTION.whatsappMessages, [
    Query.greaterThanEqual("$createdAt", start),
  ]);
}

// ── Usage summary (page + /api/billing/usage) ────────────────────────────────

export interface UsageMeter {
  used: number;
  limit: number;
}

export interface UsageSummary {
  plan: PlanId;
  /** The stored plan id (may differ from `plan` after a lapse). */
  storedPlan: PlanId;
  planStatus: WorkspacePlanStatus | string;
  contacts: UsageMeter;
  lists: UsageMeter;
  numbers: UsageMeter;
  sendsToday: UsageMeter;
}

/**
 * Build the extended usage shape for the active workspace (contacts / lists /
 * numbers / sends-today vs. the effective-plan limits). The four counts run in
 * parallel. `ctx` provides the org id + the stored plan/status (loaded once by
 * `getRequestContext`); the live meters come from Appwrite.
 */
export async function usageSummary(ctx: RequestContext): Promise<UsageSummary> {
  // getRequestContext only carries `plan`; read planStatus from the workspace doc
  // (tolerant of not-yet-synced workspaces → defaults).
  const ws = await loadBillingWorkspace(ctx.orgId, ctx.plan);
  const def = effectivePlanDef(ws);
  const effective = effectivePlan(ws);

  const [contacts, lists, numbers, sends] = await Promise.all([
    contactCount(ctx.orgId),
    listCount(ctx.orgId),
    numberCount(ctx.orgId),
    sendsToday(ctx.orgId),
  ]);

  return {
    plan: effective,
    storedPlan: planDef(ws.plan).id,
    planStatus: (ws.planStatus ?? "none") as WorkspacePlanStatus,
    contacts: { used: contacts, limit: def.maxContacts },
    lists: { used: lists, limit: def.maxLists },
    numbers: { used: numbers, limit: def.maxNumbers },
    sendsToday: { used: sends, limit: def.maxSends },
  };
}

/**
 * Load the workspace billing shape (plan + planStatus). `getRequestContext`
 * already resolved `plan`, but not `planStatus`, so read the doc; on any failure
 * (404 / unconfigured Appwrite) fall back to the context plan + a `none` status.
 */
export async function loadBillingWorkspace(
  orgId: string,
  fallbackPlan: string = DEFAULT_PLAN,
): Promise<BillingWorkspace> {
  try {
    const doc = await adminDatabases().getDocument(
      DATABASE_ID,
      COLLECTION.workspaces,
      orgId,
    );
    return {
      plan: typeof doc.plan === "string" ? doc.plan : fallbackPlan,
      planStatus: typeof doc.planStatus === "string" ? doc.planStatus : "none",
    };
  } catch {
    return { plan: fallbackPlan, planStatus: "none" };
  }
}
