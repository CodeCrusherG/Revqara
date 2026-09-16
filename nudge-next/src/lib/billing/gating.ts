import "server-only";

/**
 * Usage gating — the enforcement boundary (NEXTJS_REWRITE_PLAN.md §6 table;
 * parity with backend/plans.py + the contacts/whatsapp_accounts gate sites).
 *
 * Each `assertCan*` reads the LIVE meter, compares against the EFFECTIVE-plan
 * limit (see entitlements.effectivePlan: halted/cancelled ⇒ free limits), and
 * throws {@link GatedError} (402) when the action would exceed it. The pure
 * predicate/math helpers (`exceedsContacts`, `remainingSends`, …) take counts as
 * plain numbers so they unit-test WITHOUT Appwrite.
 *
 * Sites:
 *   - contacts create/import/seed  → assertCanAddContacts(ctx, n)
 *   - contact-list create          → assertCanCreateList(ctx)
 *   - WhatsApp number connect       → assertCanConnectNumber(ctx)
 *   - outbox-worker send batch      → remainingSendsToday(ws) caps the drain
 */

import { GatedError } from "@/lib/auth/errors";
import type { RequestContext } from "@/lib/auth/context";
import {
  type BillingWorkspace,
  effectivePlanDef,
  maxContacts,
  maxLists,
  maxNumbers,
  maxSendsPerDay,
  contactCount,
  listCount,
  numberCount,
  sendsToday,
  loadBillingWorkspace,
} from "@/lib/billing/entitlements";

// ── Pure predicates / math (counts in, decision out) ─────────────────────────

/** Adding `n` contacts to a current count of `current` exceeds `limit`. */
export function exceedsContacts(
  current: number,
  add: number,
  limit: number,
): boolean {
  return current + Math.max(0, add) > limit;
}

/** Creating one more list exceeds `limit`. */
export function exceedsLists(current: number, limit: number): boolean {
  return current + 1 > limit;
}

/** Connecting one more number exceeds `limit`. */
export function exceedsNumbers(current: number, limit: number): boolean {
  return current + 1 > limit;
}

/** Remaining contact slots (never negative) — parity with remaining_contact_slots. */
export function remainingContactSlots(current: number, limit: number): number {
  return Math.max(0, limit - current);
}

/** Remaining sends today (never negative) — parity with remaining_sends_today. */
export function remainingSends(sentToday: number, limit: number): number {
  return Math.max(0, limit - sentToday);
}

// ── Boundary asserts (read live meters; throw GatedError at the limit) ───────

/**
 * Resolve the workspace billing shape for the active request. `getRequestContext`
 * only carries `plan`, so this reads the doc for `planStatus` (entitlements
 * tolerates a not-yet-synced workspace).
 */
async function billingFor(ctx: RequestContext): Promise<BillingWorkspace> {
  return loadBillingWorkspace(ctx.orgId, ctx.plan);
}

/**
 * Assert the workspace can add `n` more contacts. Reads the live contact count
 * and the effective-plan limit; throws 402 if `current + n` would exceed it.
 * Mirrors contacts.py:164/253/281.
 */
export async function assertCanAddContacts(
  ctx: RequestContext,
  n: number,
): Promise<void> {
  const ws = await billingFor(ctx);
  const limit = maxContacts(ws);
  const current = await contactCount(ctx.orgId);
  if (exceedsContacts(current, n, limit)) {
    const remaining = remainingContactSlots(current, limit);
    throw new GatedError(
      `Contact limit reached for the ${effectivePlanDef(ws).name} plan ` +
        `(${current}/${limit} used, ${remaining} remaining). Upgrade to add more.`,
    );
  }
}

/**
 * Assert the workspace can create one more list. Mirrors contacts.py:326.
 */
export async function assertCanCreateList(ctx: RequestContext): Promise<void> {
  const ws = await billingFor(ctx);
  const limit = maxLists(ws);
  const current = await listCount(ctx.orgId);
  if (exceedsLists(current, limit)) {
    throw new GatedError(
      `List limit reached for the ${effectivePlanDef(ws).name} plan ` +
        `(${current}/${limit}). Upgrade to create more lists.`,
    );
  }
}

/**
 * Assert the workspace can connect one more WhatsApp number. Mirrors
 * whatsapp_accounts.py:72.
 */
export async function assertCanConnectNumber(
  ctx: RequestContext,
): Promise<void> {
  const ws = await billingFor(ctx);
  const limit = maxNumbers(ws);
  const current = await numberCount(ctx.orgId);
  if (exceedsNumbers(current, limit)) {
    throw new GatedError(
      `WhatsApp number limit reached for the ${effectivePlanDef(ws).name} plan ` +
        `(${current}/${limit}). Upgrade to connect more numbers.`,
    );
  }
}

/**
 * How many more sends the workspace may make today. Reads the live `sendsToday`
 * meter against the effective-plan per-day limit. Used to CAP the outbox-worker
 * batch (the sends/day enforcement happens in the async worker — §6 'critical').
 * Returns 0 when the cap is reached (worker claims nothing).
 */
export async function remainingSendsToday(
  ws: BillingWorkspace,
  orgId: string,
  now: Date = new Date(),
): Promise<number> {
  const limit = maxSendsPerDay(ws);
  const sent = await sendsToday(orgId, now);
  return remainingSends(sent, limit);
}
