import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import {
  verifyRazorpaySignature,
  lifecycleForEvent,
} from "@/lib/billing/razorpay";
import {
  claimEvent,
  releaseEvent,
  appwriteBillingEventStore,
} from "@/lib/billing/webhook-events";
import { planByRazorpayId, type PlanId } from "@/lib/billing/plans";

/**
 * Razorpay subscription webhook (plan §6; R7 — activation is webhook-only).
 *
 * node runtime + RAW body. Flow:
 *   1. timing-safe HMAC-SHA256 verify (RAZORPAY_WEBHOOK_SECRET) → 400 on bad.
 *   2. idempotent claimEvent (insert billing_webhook_events $id=eventId). A
 *      duplicate delivery ⇒ ack 200 {deduped} without mutating state.
 *   3. map the subscription event → workspace plan/planStatus (§6 table) and
 *      patch the `workspaces` doc (resolved by notes.workspaceId, else by
 *      rzpSubscriptionId).
 *   4. on a processing FAILURE, releaseEvent (delete the row) so Razorpay's
 *      retry re-runs, then 500.
 *
 * BUILD-SAFETY: routes dynamic; no module-level Razorpay/env reads.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RazorpaySubscriptionEntity {
  id?: string;
  plan_id?: string;
  current_end?: number | null;
  notes?: Record<string, unknown> | null;
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscriptionEntity };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (
    !verifyRazorpaySignature(
      rawBody,
      signature,
      process.env.RAZORPAY_WEBHOOK_SECRET,
    )
  ) {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    // Validly-signed but malformed — ack so Razorpay stops retrying.
    return NextResponse.json({ ok: true, ignored: "invalid json" });
  }

  const event = body.event ?? "";
  // Razorpay does not put a stable top-level event id in the body for all
  // accounts; derive a deterministic id from the subscription + event + a hash
  // of the raw body so retries of the SAME delivery dedupe but distinct events
  // do not collide.
  const sub = body.payload?.subscription?.entity;
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const eventId =
    (req.headers.get("x-razorpay-event-id") ||
      `${sub?.id ?? "nosub"}:${event}:${bodyHash.slice(0, 16)}`).slice(0, 200);

  const store = await appwriteBillingEventStore();
  const { claimed } = await claimEvent(store, {
    eventId,
    type: event,
    payloadHash: bodyHash,
  });
  if (!claimed) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    const outcome = lifecycleForEvent(event);
    if (!outcome) {
      // Unmapped event (e.g. payment.captured) — claimed + acked, no mutation.
      return NextResponse.json({ ok: true, ignored: event });
    }

    const workspaceId = resolveWorkspaceId(sub);
    if (!workspaceId) {
      logger.error("[razorpay] no workspace for event", { event, eventId });
      // Nothing to mutate; keep the claim so we don't reprocess endlessly.
      return NextResponse.json({ ok: true, ignored: "no workspace" });
    }

    // Resolve the paid tier from the subscription's plan_id (for `keep`).
    const tier = planByRazorpayId(sub?.plan_id)?.id ?? null;
    const patch = buildWorkspacePatch(outcome.plan, outcome.planStatus, tier, sub);

    await adminDatabases().updateDocument(
      DATABASE_ID,
      COLLECTION.workspaces,
      workspaceId,
      patch,
    );

    return NextResponse.json({ ok: true, event, workspaceId });
  } catch (err) {
    // Processing failed AFTER the claim → release so the retry re-runs.
    await releaseEvent(store, eventId).catch(() => undefined);
    logger.error("[razorpay] processing failed", {
      event,
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "processing failed" },
      { status: 500 },
    );
  }
}

/** Workspace id from subscription notes (primary), else null (caller logs). */
function resolveWorkspaceId(
  sub: RazorpaySubscriptionEntity | undefined,
): string | null {
  const note = sub?.notes?.workspaceId ?? sub?.notes?.clerkOrgId;
  return typeof note === "string" && note ? note : null;
}

/** Build the workspace patch for the lifecycle outcome (§6 table). */
function buildWorkspacePatch(
  planOut: PlanId | "keep",
  planStatus: string,
  tier: PlanId | null,
  sub: RazorpaySubscriptionEntity | undefined,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { planStatus };

  if (planOut === "free") {
    patch.plan = "free";
  } else if (tier) {
    // `keep` ⇒ pin to the subscription's resolved paid tier.
    patch.plan = tier;
  }

  if (sub?.current_end) {
    patch.currentPeriodEnd = new Date(sub.current_end * 1000).toISOString();
  }
  if (sub?.id) {
    patch.rzpSubscriptionId = sub.id;
  }
  return patch;
}
