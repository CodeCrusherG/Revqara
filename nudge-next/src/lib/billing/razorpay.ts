import "server-only";

/**
 * Razorpay integration primitives (NEXTJS_REWRITE_PLAN.md §6; R7).
 *
 * BUILD-SAFETY: the Razorpay client is constructed LAZILY inside `razorpay()` —
 * never at module load — and env is read at call time, so `next build` stays
 * green with no Razorpay env. Importing this module has no side effects.
 *
 * Contains:
 *   - razorpay(): lazy, memoised Razorpay client factory (throws if unconfigured)
 *   - verifyRazorpaySignature(): timing-safe HMAC-SHA256 of the RAW webhook body
 *     against RAZORPAY_WEBHOOK_SECRET (the webhook's `x-razorpay-signature`)
 *   - the subscription lifecycle → workspace state map (§6 table)
 *
 * The signature verifier is pure (node:crypto only) — unit-testable, never
 * throws, returns false on any bad/missing input.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

import type { WorkspacePlan, WorkspacePlanStatus } from "@/types/appwrite";

let _client: Razorpay | null = null;

/**
 * Lazy, memoised Razorpay client. Reads `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
 * at CALL time (not import time) so the module is safe to import during a
 * keyless build. Throws a readable error if invoked without credentials.
 */
export function razorpay(): Razorpay {
  if (_client) return _client;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      "Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    );
  }
  _client = new Razorpay({ key_id, key_secret });
  return _client;
}

/**
 * Timing-safe HMAC-SHA256 verification of a Razorpay webhook. The signature is
 * computed over the EXACT raw request body with `secret` (the dashboard webhook
 * secret) and compared to the `x-razorpay-signature` header (a hex digest).
 *
 * Returns false (never throws) on any missing input or length mismatch — the
 * route maps a false to HTTP 400.
 */
export function verifyRazorpaySignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!signature || !secret) return false;

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expectedHex = createHmac("sha256", secret).update(body).digest("hex");

  let provided: Buffer;
  let expected: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length || provided.length === 0) return false;

  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

// ── Subscription lifecycle → workspace state (§6 table) ──────────────────────

export interface LifecycleOutcome {
  /** The plan attribute to write. `keep` ⇒ leave the stored paid tier as-is. */
  plan: WorkspacePlan | "keep";
  planStatus: WorkspacePlanStatus;
}

/**
 * Map a Razorpay subscription event name to the workspace plan/planStatus per
 * §6. `keep` means "retain the resolved paid tier" (set by the caller from the
 * subscription's plan_id); cancelled/completed collapse to `free`.
 *
 *   subscription.authenticated        → trialing  (paid, trial)
 *   subscription.activated / .charged → active    (paid)
 *   subscription.pending              → past_due  (paid + grace)
 *   subscription.halted               → halted    (free limits, block sends)
 *   subscription.cancelled / .completed → free + cancelled
 *
 * Unknown events return null (caller dedupes/acks without mutating state).
 */
export function lifecycleForEvent(event: string): LifecycleOutcome | null {
  switch (event) {
    case "subscription.authenticated":
      return { plan: "keep", planStatus: "trialing" };
    case "subscription.activated":
    case "subscription.charged":
      return { plan: "keep", planStatus: "active" };
    case "subscription.pending":
      return { plan: "keep", planStatus: "past_due" };
    case "subscription.halted":
      return { plan: "keep", planStatus: "halted" };
    case "subscription.cancelled":
    case "subscription.completed":
      return { plan: "free", planStatus: "cancelled" };
    default:
      return null;
  }
}
