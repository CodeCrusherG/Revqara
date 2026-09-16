/**
 * Pure entitlement logic — effectivePlan across billing statuses + the limit
 * accessors (NEXTJS_REWRITE_PLAN.md §6; parity with backend/plans.py). No
 * Appwrite: these functions take a plain { plan, planStatus } shape.
 */
import { describe, expect, it, vi } from "vitest";

// entitlements.ts / gating.ts start with `import "server-only"` (throws outside
// an RSC bundle). Stub it so the PURE logic is testable under vitest node.
vi.mock("server-only", () => ({}));

import {
  effectivePlan,
  effectivePlanDef,
  maxContacts,
  maxLists,
  maxNumbers,
  maxSendsPerDay,
  utcMidnightIso,
  type BillingWorkspace,
} from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";

const ws = (
  plan: BillingWorkspace["plan"],
  planStatus: BillingWorkspace["planStatus"],
): BillingWorkspace => ({ plan, planStatus });

describe("effectivePlan across statuses", () => {
  it("trialing / active / past_due keep the PAID plan limits", () => {
    for (const status of ["trialing", "active", "past_due"] as const) {
      expect(effectivePlan(ws("ai_pro", status))).toBe("ai_pro");
      expect(effectivePlan(ws("growth", status))).toBe("growth");
    }
  });

  it("halted / cancelled / none fall back to FREE limits", () => {
    for (const status of ["halted", "cancelled", "none"] as const) {
      expect(effectivePlan(ws("ai_pro", status))).toBe("free");
      expect(effectivePlan(ws("agency", status))).toBe("free");
    }
  });

  it("a free plan is always free regardless of status", () => {
    expect(effectivePlan(ws("free", "active"))).toBe("free");
    expect(effectivePlan(ws("free", "trialing"))).toBe("free");
  });

  it("unknown / null plan resolves to free", () => {
    expect(effectivePlan(ws(null, "active"))).toBe("free");
    expect(effectivePlan(ws("nonsense", "active"))).toBe("free");
  });

  it("unknown status is treated as non-paid (free limits)", () => {
    expect(effectivePlan(ws("ai_pro", "weird"))).toBe("free");
  });
});

describe("limit accessors read the effective plan", () => {
  it("active ai_pro exposes ai_pro limits", () => {
    const w = ws("ai_pro", "active");
    expect(maxContacts(w)).toBe(PLANS.ai_pro.maxContacts);
    expect(maxLists(w)).toBe(PLANS.ai_pro.maxLists);
    expect(maxNumbers(w)).toBe(PLANS.ai_pro.maxNumbers);
    expect(maxSendsPerDay(w)).toBe(PLANS.ai_pro.maxSends);
    expect(effectivePlanDef(w).id).toBe("ai_pro");
  });

  it("halted ai_pro collapses to free limits", () => {
    const w = ws("ai_pro", "halted");
    expect(maxContacts(w)).toBe(PLANS.free.maxContacts);
    expect(maxSendsPerDay(w)).toBe(PLANS.free.maxSends);
    expect(maxLists(w)).toBe(PLANS.free.maxLists);
    expect(maxNumbers(w)).toBe(PLANS.free.maxNumbers);
  });
});

describe("utcMidnightIso (sends_today epoch)", () => {
  it("zeroes the time to 00:00:00.000Z of the same UTC day", () => {
    const noon = new Date("2026-06-17T12:34:56.789Z");
    expect(utcMidnightIso(noon)).toBe("2026-06-17T00:00:00.000Z");
  });
  it("uses the UTC calendar day for an early-morning instant", () => {
    const early = new Date("2026-06-17T00:00:00.001Z");
    expect(utcMidnightIso(early)).toBe("2026-06-17T00:00:00.000Z");
  });
});
