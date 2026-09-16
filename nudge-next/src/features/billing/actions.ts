"use server";

/**
 * Billing Server Actions — Razorpay subscription lifecycle (plan §6; R7).
 *
 * OWNER/ADMIN ONLY: every action requires `org:billing:manage`. Owner holds it
 * implicitly; admin is granted it here (the plan's checkout gate is "owner/admin
 * only"). Non-owner/admin ⇒ ForbiddenError (403).
 *
 * R7 — ACTIVATION IS WEBHOOK-ONLY. These actions create/patch the Razorpay
 * subscription and persist an OPTIMISTIC local state (e.g. plan + trialing) so
 * the UI updates immediately, but the AUTHORITATIVE plan/status transition
 * happens exclusively in `/api/webhooks/razorpay` (HMAC-verified, idempotent).
 * The client Checkout handler is UX only — it never grants entitlements.
 *
 * BUILD-SAFETY: the Razorpay client is constructed lazily inside `razorpay()`;
 * nothing here reads Razorpay env at module load.
 */

import { clerkClient } from "@clerk/nextjs/server";

import { requirePermission } from "@/lib/auth/require";
import { GatedError, ForbiddenError } from "@/lib/auth/errors";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import {
  PLANS,
  planDef,
  razorpayPlanId,
  isPaidPlan,
  type PlanId,
} from "@/lib/billing/plans";
import { razorpay } from "@/lib/billing/razorpay";
import { publicEnv } from "@/lib/env";

const BILLING_PERM = "org:billing:manage" as const;

/** 14-day trial in seconds (the §6 trial window). */
const TRIAL_SECONDS = 14 * 24 * 60 * 60;
/** Razorpay monthly subscription billing cycles (120 ≈ 10 years; §6). */
const TOTAL_COUNT = 120;

/** Checkout params handed to the client Razorpay Checkout widget (UX only). */
export interface CheckoutParams {
  subscriptionId: string;
  /** NEXT_PUBLIC key id for the widget (never the secret). */
  keyId: string;
  planId: PlanId;
  planName: string;
  amountPaise: number;
  currency: "INR";
  /** Workspace billing email (Checkout prefill), if known. */
  email: string | null;
}

function assertPaidPlan(planId: string): asserts planId is PlanId {
  if (!(planId in PLANS)) {
    throw new GatedError(`Unknown plan: ${planId}`);
  }
  if (!isPaidPlan(planId as PlanId)) {
    throw new GatedError("The free plan does not require a subscription.");
  }
}

/** Read the workspace doc's billing fields (rzpCustomerId, rzpSubscriptionId). */
async function loadWorkspaceDoc(orgId: string): Promise<{
  rzpCustomerId: string | null;
  rzpSubscriptionId: string | null;
  billingEmail: string | null;
  name: string;
}> {
  const doc = await adminDatabases().getDocument(
    DATABASE_ID,
    COLLECTION.workspaces,
    orgId,
  );
  return {
    rzpCustomerId:
      typeof doc.rzpCustomerId === "string" ? doc.rzpCustomerId : null,
    rzpSubscriptionId:
      typeof doc.rzpSubscriptionId === "string" ? doc.rzpSubscriptionId : null,
    billingEmail: typeof doc.billingEmail === "string" ? doc.billingEmail : null,
    name: typeof doc.name === "string" ? doc.name : "Workspace",
  };
}

/** Resolve a billing email for the org owner (Checkout prefill / Razorpay customer). */
async function resolveBillingEmail(
  orgId: string,
  fallback: string | null,
): Promise<string | null> {
  if (fallback) return fallback;
  try {
    const client = await clerkClient();
    const memberships =
      await client.organizations.getOrganizationMembershipList({
        organizationId: orgId,
        limit: 50,
      });
    const owner = memberships.data.find((m) => m.role === "org:owner");
    const email =
      owner?.publicUserData?.identifier ?? null;
    return email && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

/**
 * Ensure the workspace has a Razorpay customer, returning its id. Idempotent:
 * reuses `rzpCustomerId` if already stored; otherwise creates one (fail_existing:0
 * reuses an existing Razorpay customer with the same email) and persists it.
 */
async function ensureCustomer(
  orgId: string,
  current: string | null,
  email: string | null,
  name: string,
): Promise<string> {
  if (current) return current;
  const rzp = razorpay();
  const customer = await rzp.customers.create({
    name: name.slice(0, 50),
    email: email ?? undefined,
    fail_existing: 0,
    notes: { workspaceId: orgId, clerkOrgId: orgId },
  });
  await adminDatabases().updateDocument(
    DATABASE_ID,
    COLLECTION.workspaces,
    orgId,
    { rzpCustomerId: customer.id, billingEmail: email },
  );
  return customer.id;
}

/**
 * Create a Razorpay subscription for `planId` with a 14-day trial, ensuring the
 * customer first. Persists `rzpSubscriptionId` + `plan` + `planStatus:'trialing'`
 * OPTIMISTICALLY (R7: the webhook is authoritative). Returns the checkout params
 * for the client widget. Owner/admin only.
 */
export async function createSubscription(
  planId: string,
): Promise<CheckoutParams> {
  const ctx = await requirePermission(BILLING_PERM);
  assertPaidPlan(planId);

  const rzpPlanId = razorpayPlanId(planId);
  if (!rzpPlanId) {
    throw new GatedError(
      `Razorpay plan id for "${planId}" is not configured (set ${planDef(planId).razorpayPlanEnv}).`,
    );
  }

  const ws = await loadWorkspaceDoc(ctx.orgId);
  const email = await resolveBillingEmail(ctx.orgId, ws.billingEmail);
  const customerId = await ensureCustomer(
    ctx.orgId,
    ws.rzpCustomerId,
    email,
    ws.name,
  );

  const rzp = razorpay();
  const startAt = Math.floor(Date.now() / 1000) + TRIAL_SECONDS;
  const subscription = await rzp.subscriptions.create({
    plan_id: rzpPlanId,
    total_count: TOTAL_COUNT,
    customer_id: customerId,
    customer_notify: 1,
    start_at: startAt,
    notes: { workspaceId: ctx.orgId, clerkOrgId: ctx.orgId, planId },
  } as Parameters<typeof rzp.subscriptions.create>[0]);

  // Optimistic local state (UX). The webhook flips to active on the first charge.
  await adminDatabases().updateDocument(
    DATABASE_ID,
    COLLECTION.workspaces,
    ctx.orgId,
    {
      rzpSubscriptionId: subscription.id,
      plan: planId,
      planStatus: "trialing",
    },
  );

  const def = planDef(planId);
  return {
    subscriptionId: subscription.id,
    keyId: publicEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    planId,
    planName: def.name,
    amountPaise: def.amountPaise,
    currency: "INR",
    email,
  };
}

/**
 * Upgrade/downgrade the active subscription to a different paid tier via
 * `PATCH /subscriptions/:id` (§6). `when='now'` applies immediately,
 * `'cycle_end'` at the next renewal. Plan/status remain webhook-authoritative;
 * we optimistically write the target plan id only.
 */
export async function changePlan(
  planId: string,
  when: "now" | "cycle_end" = "now",
): Promise<{ ok: true }> {
  const ctx = await requirePermission(BILLING_PERM);
  assertPaidPlan(planId);

  const rzpPlanId = razorpayPlanId(planId);
  if (!rzpPlanId) {
    throw new GatedError(
      `Razorpay plan id for "${planId}" is not configured.`,
    );
  }

  const ws = await loadWorkspaceDoc(ctx.orgId);
  if (!ws.rzpSubscriptionId) {
    throw new ForbiddenError(
      "No active subscription to change. Start a subscription first.",
    );
  }

  const rzp = razorpay();
  await rzp.subscriptions.update(ws.rzpSubscriptionId, {
    plan_id: rzpPlanId,
    schedule_change_at: when,
  } as Parameters<typeof rzp.subscriptions.update>[1]);

  await adminDatabases().updateDocument(
    DATABASE_ID,
    COLLECTION.workspaces,
    ctx.orgId,
    { plan: planId },
  );
  return { ok: true };
}

/**
 * Cancel the active subscription. `atCycleEnd=true` keeps access until the
 * period ends (the webhook then moves the workspace to free+cancelled);
 * `false` cancels immediately. The local downgrade is webhook-authoritative.
 */
export async function cancelSubscription(
  atCycleEnd = true,
): Promise<{ ok: true }> {
  const ctx = await requirePermission(BILLING_PERM);
  const ws = await loadWorkspaceDoc(ctx.orgId);
  if (!ws.rzpSubscriptionId) {
    throw new ForbiddenError("No active subscription to cancel.");
  }

  const rzp = razorpay();
  await rzp.subscriptions.cancel(ws.rzpSubscriptionId, atCycleEnd);
  // Do NOT flip plan here — the subscription.cancelled webhook is authoritative.
  return { ok: true };
}
