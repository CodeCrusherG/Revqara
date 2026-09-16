/**
 * Gating — pure boundary math + the assert* guards throwing GatedError(402) at
 * the limit (NEXTJS_REWRITE_PLAN.md §6; parity with backend/plans.py). The
 * assert* functions read live meters from entitlements, which we mock so the
 * test stays pure (no Appwrite).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock the live meters + workspace loader used by the assert* guards.
vi.mock("@/lib/billing/entitlements", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/billing/entitlements")
  >("@/lib/billing/entitlements");
  return {
    ...actual,
    loadBillingWorkspace: vi.fn(),
    contactCount: vi.fn(),
    listCount: vi.fn(),
    numberCount: vi.fn(),
    sendsToday: vi.fn(),
  };
});

import {
  exceedsContacts,
  exceedsLists,
  exceedsNumbers,
  remainingContactSlots,
  remainingSends,
  assertCanAddContacts,
  assertCanCreateList,
  assertCanConnectNumber,
  remainingSendsToday,
} from "@/lib/billing/gating";
import {
  loadBillingWorkspace,
  contactCount,
  listCount,
  numberCount,
  sendsToday,
  type BillingWorkspace,
} from "@/lib/billing/entitlements";
import { GatedError } from "@/lib/auth/errors";
import { PLANS } from "@/lib/billing/plans";

const FREE = PLANS.free;
const ctx = { orgId: "org_test", plan: "free" } as unknown as Parameters<
  typeof assertCanAddContacts
>[0];

// Free workspace (active) ⇒ free limits apply.
const freeWs: BillingWorkspace = { plan: "free", planStatus: "active" };

beforeEach(() => {
  vi.mocked(loadBillingWorkspace).mockResolvedValue(freeWs);
  vi.mocked(contactCount).mockReset();
  vi.mocked(listCount).mockReset();
  vi.mocked(numberCount).mockReset();
  vi.mocked(sendsToday).mockReset();
});

describe("pure boundary predicates", () => {
  it("exceedsContacts: at the limit is allowed, one over is not", () => {
    expect(exceedsContacts(499, 1, 500)).toBe(false); // fills exactly
    expect(exceedsContacts(500, 1, 500)).toBe(true); // one past
    expect(exceedsContacts(0, 500, 500)).toBe(false);
    expect(exceedsContacts(0, 501, 500)).toBe(true);
  });

  it("exceedsLists / exceedsNumbers: one more past the limit", () => {
    expect(exceedsLists(4, 5)).toBe(false);
    expect(exceedsLists(5, 5)).toBe(true);
    expect(exceedsNumbers(0, 1)).toBe(false);
    expect(exceedsNumbers(1, 1)).toBe(true);
  });

  it("remaining slots/sends never go negative", () => {
    expect(remainingContactSlots(500, 500)).toBe(0);
    expect(remainingContactSlots(600, 500)).toBe(0);
    expect(remainingContactSlots(450, 500)).toBe(50);
    expect(remainingSends(200, 200)).toBe(0);
    expect(remainingSends(250, 200)).toBe(0);
    expect(remainingSends(120, 200)).toBe(80);
  });
});

describe("assertCanAddContacts at the free boundary", () => {
  it("allows adding up to the limit", async () => {
    vi.mocked(contactCount).mockResolvedValue(FREE.maxContacts - 1);
    await expect(assertCanAddContacts(ctx, 1)).resolves.toBeUndefined();
  });

  it("throws GatedError(402) exactly at the boundary", async () => {
    vi.mocked(contactCount).mockResolvedValue(FREE.maxContacts);
    await expect(assertCanAddContacts(ctx, 1)).rejects.toBeInstanceOf(
      GatedError,
    );
    try {
      await assertCanAddContacts(ctx, 1);
    } catch (err) {
      expect((err as GatedError).status).toBe(402);
    }
  });
});

describe("assertCanCreateList at the free boundary", () => {
  it("allows creating the Nth list, blocks the (N+1)th", async () => {
    vi.mocked(listCount).mockResolvedValue(FREE.maxLists - 1);
    await expect(assertCanCreateList(ctx)).resolves.toBeUndefined();

    vi.mocked(listCount).mockResolvedValue(FREE.maxLists);
    await expect(assertCanCreateList(ctx)).rejects.toBeInstanceOf(GatedError);
  });
});

describe("assertCanConnectNumber at the free boundary", () => {
  it("blocks connecting a number past the limit", async () => {
    vi.mocked(numberCount).mockResolvedValue(FREE.maxNumbers - 1);
    await expect(assertCanConnectNumber(ctx)).resolves.toBeUndefined();

    vi.mocked(numberCount).mockResolvedValue(FREE.maxNumbers);
    await expect(assertCanConnectNumber(ctx)).rejects.toBeInstanceOf(GatedError);
  });
});

describe("remainingSendsToday math", () => {
  it("returns limit - sent (never negative), using the effective plan", async () => {
    vi.mocked(sendsToday).mockResolvedValue(50);
    await expect(remainingSendsToday(freeWs, "org_test")).resolves.toBe(
      FREE.maxSends - 50,
    );

    vi.mocked(sendsToday).mockResolvedValue(FREE.maxSends + 10);
    await expect(remainingSendsToday(freeWs, "org_test")).resolves.toBe(0);
  });

  it("a halted paid plan caps at the FREE send limit", async () => {
    const halted: BillingWorkspace = { plan: "ai_pro", planStatus: "halted" };
    vi.mocked(sendsToday).mockResolvedValue(0);
    await expect(remainingSendsToday(halted, "org_test")).resolves.toBe(
      FREE.maxSends,
    );
  });
});
