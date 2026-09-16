/**
 * Subscription plan catalogue — 5 INR tiers (NEXTJS_REWRITE_PLAN.md §6, from
 * SALES.md). Plans are defined in code; a workspace stores only its current
 * plan name + Razorpay subscription id. Usage (contacts, sends/day, lists,
 * numbers) is metered live (parity with backend/plans.py) elsewhere.
 *
 * `free`/`ai_pro` limits == the old plans.py `free`/`pro`. `starter`/`growth`/
 * `agency` are config-level interpolations (not behavioral code).
 *
 * Pure config module — no `server-only`; the marketing pricing page reads it
 * statically. Razorpay plan ids are read from env (seed-razorpay-plans.ts).
 */

import type { WorkspacePlan } from "@/types/appwrite";

export type PlanId = WorkspacePlan;

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Monthly price in INR (rupees). 0 = free. */
  priceInr: number;
  /** Monthly price in paise (Razorpay `amount`). */
  amountPaise: number;
  maxContacts: number;
  maxSends: number; // per day
  maxLists: number;
  maxNumbers: number;
  /** Env var name holding the Razorpay plan id; null for `free`. */
  razorpayPlanEnv: string | null;
  features: string[];
}

export const DEFAULT_PLAN: PlanId = "free";

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Free",
    priceInr: 0,
    amountPaise: 0,
    maxContacts: 500,
    maxSends: 200,
    maxLists: 5,
    maxNumbers: 1,
    razorpayPlanEnv: null,
    features: [
      "1 WhatsApp number",
      "500 contacts",
      "200 WhatsApp sends/day",
      "AI campaign generation",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceInr: 1_499,
    amountPaise: 149_900,
    maxContacts: 2_500,
    maxSends: 1_000,
    maxLists: 25,
    maxNumbers: 1,
    razorpayPlanEnv: "RZP_PLAN_STARTER",
    features: [
      "1 WhatsApp number",
      "2,500 contacts",
      "1,000 WhatsApp sends/day",
      "25 lists",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceInr: 2_999,
    amountPaise: 299_900,
    maxContacts: 15_000,
    maxSends: 5_000,
    maxLists: 100,
    maxNumbers: 3,
    razorpayPlanEnv: "RZP_PLAN_GROWTH",
    features: [
      "3 WhatsApp numbers",
      "15,000 contacts",
      "5,000 WhatsApp sends/day",
      "100 lists",
    ],
  },
  ai_pro: {
    id: "ai_pro",
    name: "AI Pro",
    priceInr: 6_999,
    amountPaise: 699_900,
    maxContacts: 100_000,
    maxSends: 50_000,
    maxLists: 1_000,
    maxNumbers: 10,
    razorpayPlanEnv: "RZP_PLAN_AI_PRO",
    features: [
      "10 WhatsApp numbers",
      "100k contacts",
      "50k WhatsApp sends/day",
      "Unlimited lists",
    ],
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceInr: 14_999,
    amountPaise: 1_499_900,
    maxContacts: 1_000_000,
    maxSends: 250_000,
    maxLists: 10_000,
    maxNumbers: 50,
    razorpayPlanEnv: "RZP_PLAN_AGENCY",
    features: [
      "50 WhatsApp numbers",
      "1M contacts",
      "250k WhatsApp sends/day",
      "10,000 lists",
    ],
  },
};

/** Ordered tier list (free → agency) for pricing display. */
export const PLAN_ORDER: readonly PlanId[] = [
  "free",
  "starter",
  "growth",
  "ai_pro",
  "agency",
] as const;

export const PLAN_LIST: readonly PlanDef[] = PLAN_ORDER.map((id) => PLANS[id]);

/** Resolve a plan definition (falls back to the default plan). */
export function planDef(planId: PlanId | string | null | undefined): PlanDef {
  if (planId && planId in PLANS) {
    return PLANS[planId as PlanId];
  }
  return PLANS[DEFAULT_PLAN];
}

/**
 * Resolve the Razorpay plan id for a tier from env (seeded by
 * scripts/seed-razorpay-plans.ts). `free` has no Razorpay plan.
 */
export function razorpayPlanId(planId: PlanId): string | null {
  const def = PLANS[planId];
  if (!def.razorpayPlanEnv) return null;
  return process.env[def.razorpayPlanEnv] ?? null;
}

/**
 * Reverse lookup: given a Razorpay plan id (from a webhook / subscription),
 * find the matching tier. Returns null if no env mapping matches.
 */
export function planByRazorpayId(rzpPlanId: string | null | undefined): PlanDef | null {
  if (!rzpPlanId) return null;
  for (const def of PLAN_LIST) {
    if (def.razorpayPlanEnv && process.env[def.razorpayPlanEnv] === rzpPlanId) {
      return def;
    }
  }
  return null;
}

/** True if a tier is a paid plan (has a Razorpay plan). */
export function isPaidPlan(planId: PlanId): boolean {
  return planId !== "free";
}
