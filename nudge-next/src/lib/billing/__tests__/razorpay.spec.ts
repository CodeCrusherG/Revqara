/**
 * Razorpay primitives — verifyRazorpaySignature accept/reject (timing-safe
 * HMAC-SHA256), the lifecycle→state map, and planByRazorpayId reverse mapping
 * (NEXTJS_REWRITE_PLAN.md §6; R7). Pure: no client construction, no network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  verifyRazorpaySignature,
  lifecycleForEvent,
} from "@/lib/billing/razorpay";
import { planByRazorpayId, PLANS } from "@/lib/billing/plans";

const SECRET = "whsec_test_secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyRazorpaySignature", () => {
  const body = JSON.stringify({ event: "subscription.charged", x: 1 });

  it("accepts a correct HMAC-SHA256 signature", () => {
    expect(verifyRazorpaySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(verifyRazorpaySignature(body, sign(body, "other"), SECRET)).toBe(
      false,
    );
  });

  it("rejects a tampered body", () => {
    const sig = sign(body);
    expect(verifyRazorpaySignature(body + " ", sig, SECRET)).toBe(false);
  });

  it("rejects missing signature or secret", () => {
    expect(verifyRazorpaySignature(body, null, SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, sign(body), null)).toBe(false);
    expect(verifyRazorpaySignature(body, "", SECRET)).toBe(false);
  });

  it("rejects a malformed (non-hex / wrong-length) signature without throwing", () => {
    expect(verifyRazorpaySignature(body, "zzzz", SECRET)).toBe(false);
    expect(verifyRazorpaySignature(body, "ab", SECRET)).toBe(false);
  });

  it("works over a Buffer raw body identically", () => {
    expect(
      verifyRazorpaySignature(Buffer.from(body, "utf8"), sign(body), SECRET),
    ).toBe(true);
  });
});

describe("lifecycleForEvent (§6 table)", () => {
  it("maps each subscription event to the right plan/status", () => {
    expect(lifecycleForEvent("subscription.authenticated")).toEqual({
      plan: "keep",
      planStatus: "trialing",
    });
    expect(lifecycleForEvent("subscription.activated")).toEqual({
      plan: "keep",
      planStatus: "active",
    });
    expect(lifecycleForEvent("subscription.charged")).toEqual({
      plan: "keep",
      planStatus: "active",
    });
    expect(lifecycleForEvent("subscription.pending")).toEqual({
      plan: "keep",
      planStatus: "past_due",
    });
    expect(lifecycleForEvent("subscription.halted")).toEqual({
      plan: "keep",
      planStatus: "halted",
    });
    expect(lifecycleForEvent("subscription.cancelled")).toEqual({
      plan: "free",
      planStatus: "cancelled",
    });
    expect(lifecycleForEvent("subscription.completed")).toEqual({
      plan: "free",
      planStatus: "cancelled",
    });
  });

  it("returns null for unmapped events", () => {
    expect(lifecycleForEvent("payment.captured")).toBeNull();
    expect(lifecycleForEvent("")).toBeNull();
  });
});

describe("planByRazorpayId reverse mapping", () => {
  const ENVS = [
    "RZP_PLAN_STARTER",
    "RZP_PLAN_GROWTH",
    "RZP_PLAN_AI_PRO",
    "RZP_PLAN_AGENCY",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const e of ENVS) {
      if (saved[e] === undefined) delete process.env[e];
      else process.env[e] = saved[e];
    }
  });

  it("resolves a Razorpay plan id back to its tier via env", () => {
    for (const e of ENVS) saved[e] = process.env[e];
    process.env.RZP_PLAN_STARTER = "plan_STARTER";
    process.env.RZP_PLAN_GROWTH = "plan_GROWTH";
    process.env.RZP_PLAN_AI_PRO = "plan_AIPRO";
    process.env.RZP_PLAN_AGENCY = "plan_AGENCY";

    expect(planByRazorpayId("plan_STARTER")?.id).toBe("starter");
    expect(planByRazorpayId("plan_GROWTH")?.id).toBe("growth");
    expect(planByRazorpayId("plan_AIPRO")?.id).toBe(PLANS.ai_pro.id);
    expect(planByRazorpayId("plan_AGENCY")?.id).toBe("agency");
  });

  it("returns null for an unknown / unset plan id", () => {
    for (const e of ENVS) {
      saved[e] = process.env[e];
      delete process.env[e];
    }
    expect(planByRazorpayId("plan_unknown")).toBeNull();
    expect(planByRazorpayId(null)).toBeNull();
    expect(planByRazorpayId(undefined)).toBeNull();
  });
});
