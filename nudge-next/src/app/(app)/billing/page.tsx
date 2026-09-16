/**
 * Billing — RSC shell (plan §6, §7 Billing screen).
 *
 * Reads the active workspace's live usage (usageSummary) + plan/status on the
 * server, then renders the 5 INR plan cards (from lib/billing/plans) + usage
 * progress bars. The Razorpay Checkout widget + create/change/cancel actions
 * live in the client `BillingClient` island, gated to owner/admin via RoleGate.
 *
 * BUILD-SAFETY: forced dynamic (depends on Clerk auth + per-request usage), so
 * the page is never statically prerendered and the build stays green keyless.
 */

import { getRequestContext } from "@/lib/auth/context";
import { usageSummary } from "@/lib/billing/entitlements";
import { PLAN_LIST } from "@/lib/billing/plans";
import { BillingClient } from "@/components/billing/billing-client";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = await getRequestContext();
  const usage = await usageSummary(ctx);

  const canManageBilling = ctx.perms.has("org:billing:manage");
  const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

  return (
    <BillingClient
      plans={PLAN_LIST.map((p) => ({
        id: p.id,
        name: p.name,
        priceInr: p.priceInr,
        maxContacts: p.maxContacts,
        maxSends: p.maxSends,
        maxLists: p.maxLists,
        maxNumbers: p.maxNumbers,
        features: p.features,
      }))}
      usage={usage}
      canManageBilling={canManageBilling}
      razorpayKeyId={razorpayKeyId}
    />
  );
}
