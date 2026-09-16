# Insurance / Financial Advisor Specialist

## Positioning

Nudge CoverOps is a compliance-first WhatsApp lead layer for insurance agencies
and financial advisors. It assesses cover needs, shares indicative quotes,
recommends plans, tracks documents, and nudges renewals — while routing claims,
surrenders, mis-selling disputes, and tax advice to a licensed advisor.

This is not an auto-advice or guaranteed-returns engine. Production use is
bound by IRDAI conduct rules: the assistant never promises guaranteed or
assured returns and discloses that market-linked products carry risk.

## Operating Plan

1. Needs assessment
   Capture `insurance_type`, who is to be covered, sum assured, term, and
   premium budget. Term/health/motor/investment queries move to `needs_assessed`.

2. Quoting
   Premium / sum-assured / illustration queries move to `quote_shared`. Quotes
   are indicative; the insurer confirms the final premium after underwriting.

3. Plan recommendation
   "Which plan / best plan / term vs ULIP" queries move to `plan_recommended`,
   with risk and product type disclosed honestly.

4. Documents and issuance
   KYC/Aadhaar/PAN/medical-test/proposal-form topics move to
   `documents_pending`, then `policy_issued` on completion.

5. Renewals
   Renewal/lapse/reactivation queries move to `renewal_due`.

6. Risk controls
   Claims, settlements, rejected/disputed claims, surrender, mis-selling,
   ombudsman, legal, death claims, refunds, and tax advice escalate to a
   licensed advisor. Any request for guaranteed/assured returns is escalated,
   never promised.

## Compliance Surface

- IRDAI conduct: no guaranteed/assured/risk-free return claims; ULIP and
  market-linked risk must be disclosed.
- Quotes are indicative pending insurer underwriting.
- Personalised tax/investment advice requires disclosure and a licensed advisor.
- Claims, surrender, and mis-selling are human-review topics by default.

## Buyer Impact

- Qualified leads: each lead already has cover type, sum assured, and budget.
- Faster quoting: indicative premiums are captured with the right inputs.
- Fewer lapses: renewal-due policies surface for follow-up.
- Compliance safety: claims and guaranteed-return requests reach a licensed advisor.
- Advisor focus: advisors spend time on serious buyers, not cold WhatsApp chats.

## Demo Story

1. Open `/demo` and choose `Insurance / financial advisor`.
2. Send: `I need a term insurance plan for my family` → `needs_assessed`.
3. Send: `What's the premium for 1 crore health cover?` → `quote_shared`.
4. Send: `Can you recommend the best plan: term vs ULIP?` → `plan_recommended`.
5. Send: `My health claim was rejected and I want to file a dispute` →
   `escalated` and hands off to a licensed advisor.
6. Send: `Can you promise me guaranteed returns?` → `escalated` (never promised).

## Implemented Surface

- Backend vertical: `insurance`
- Signup option: `Insurance / financial advisor`
- Demo login: `insurance@demo.nudge / demo1234`
- Seed workspace: `SecureLife Advisors`
- Pipeline: `new -> needs_assessed -> quote_shared -> plan_recommended
  -> documents_pending -> policy_issued -> renewal_due -> escalated -> lost`
- Core fields: `insurance_type`, `coverage_amount`, `policy_term`,
  `sum_assured`, `premium_budget`, `age`, `annual_income`, `existing_policy`,
  `nominee`, `health_condition`, `vehicle_details`, `policy_number`,
  `renewal_date`, `advisor_owner`.
- Buyer KPIs: needs assessed, quotes shared, plan recommendations,
  documents-pending backlog, policies issued, renewal backlog, claim/surrender escalations.
- Tests: needs/quote/plan/renewal stage routing, claim-dispute and
  guaranteed-return escalation.
