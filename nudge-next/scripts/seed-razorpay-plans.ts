/**
 * seed-razorpay-plans.ts — create the 4 paid Razorpay Plans (monthly, INR,
 * amounts in PAISE) from lib/billing/plans.ts and print the RZP_PLAN_* ids to
 * paste into env (NEXTJS_REWRITE_PLAN.md §6).
 *
 * One Razorpay Plan per paid tier (period:monthly, interval:1, currency:INR).
 * Idempotent-ish: re-running creates NEW plan ids (Razorpay has no upsert), so
 * run this ONCE per environment and store the printed ids. The free tier has no
 * Razorpay plan.
 *
 * Run:  npx tsx scripts/seed-razorpay-plans.ts
 * Requires: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
 */
import { loadEnv } from "./_env";
loadEnv();

import Razorpay from "razorpay";

import { PLAN_LIST } from "@/lib/billing/plans";

function requireClient(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      "Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET — set them in .env.local.",
    );
  }
  return new Razorpay({ key_id, key_secret });
}

async function main(): Promise<void> {
  const rzp = requireClient();
  const paid = PLAN_LIST.filter((p) => p.razorpayPlanEnv && p.amountPaise > 0);

  console.log(`Creating ${paid.length} Razorpay plans (INR, monthly)…\n`);

  const out: Record<string, string> = {};
  for (const plan of paid) {
    const created = await rzp.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: `Revqara ${plan.name}`,
        amount: plan.amountPaise, // paise
        currency: "INR",
        description: `Revqara ${plan.name} plan — ₹${plan.priceInr}/mo`,
      },
      notes: { tier: plan.id },
    } as Parameters<typeof rzp.plans.create>[0]);

    out[plan.razorpayPlanEnv as string] = created.id;
    console.log(
      `  • ${plan.name.padEnd(8)} ${plan.razorpayPlanEnv}=${created.id}  (₹${plan.priceInr}/mo)`,
    );
  }

  console.log("\nAdd these to your .env.local:\n");
  for (const [envVar, id] of Object.entries(out)) {
    console.log(`${envVar}=${id}`);
  }
  console.log("\n✓ Razorpay plan seed complete.");
}

main().catch((err) => {
  console.error("\n✗ Razorpay plan seed failed:", err);
  process.exit(1);
});
