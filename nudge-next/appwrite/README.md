# `appwrite/` (Phase 1 / Phase 4)

Appwrite IaC + deployed Functions.

- `schema/` — one file per collection (attributes, indexes, perms). 24 domain
  collections + `billing_webhook_events`.
- `migrate.ts` — idempotent provisioner (409-tolerant, polls attribute
  readiness before creating indexes). Run via `npm run appwrite:setup`.
- `functions/` — deployed separately: `whatsapp-webhook`, `inbound-processor`,
  `outbox-worker`, `sync-worker`, `campaign-scheduler`, `clerk-webhook`,
  `razorpay-webhook`, and `shared/` (graph/packs/guards/outbox reused by fns).
