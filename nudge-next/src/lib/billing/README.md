# `lib/billing/` (Phase 7)

Razorpay plan catalogue + entitlements/gating.

- `plans.ts` — 5 INR tiers (free/starter/growth/ai_pro/agency), `planDef`,
  `planByRazorpayId`, `DEFAULT_PLAN='free'`.
- `entitlements.ts` — `effectivePlan(ws)`, live usage meters (contacts, lists,
  numbers, sendsToday).
- `gating.ts` — `assertCanAddContacts` / `assertCanCreateList` /
  `assertCanConnectNumber` / `remainingSendsToday`. Throws `GatedError(402)`.
