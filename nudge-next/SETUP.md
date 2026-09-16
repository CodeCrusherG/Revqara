# Revqara — go-live runbook (`SETUP.md`)

A complete, copy-pasteable runbook to take `revqara-next` from a fresh clone to a
working deployment. It pairs with [`NEXTJS_REWRITE_PLAN.md`](../NEXTJS_REWRITE_PLAN.md)
§4 (Clerk), §3 (Appwrite), §5 (WhatsApp), §6 (Razorpay), and §9 (env). Every env
var below maps to the §9 contract and the `.env.local` checklist at the end.

> Convention: `APP_BASE_URL` is your public origin — `http://localhost:3000` in
> dev, `https://app.yourdomain.com` in prod. Replace it everywhere.

---

## (a) Prerequisites

- **Node.js ≥ 18.18** and **npm** (the repo uses `npm`; `npx tsx` runs the
  TypeScript dev scripts with no global install).
- Accounts: **Clerk**, **Appwrite** (Cloud or self-hosted), **Meta for
  Developers** (WhatsApp Cloud API + a test/real WABA), **Razorpay**.
- For exposing local webhooks to Meta/Clerk/Razorpay: **ngrok** (or cloudflared).

```bash
npm install
cp .env.example .env.local     # fill in as you go through (b)–(f)
```

---

## (b) Clerk (identity, tenancy, RBAC)

1. **Create an application** at dashboard.clerk.com. Copy
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env.local`.

2. **Enable Organizations**: *Configure → Organizations → Enable*. Turn on
   "Allow members to create organizations" (a new signup becomes an org owner).

3. **Create the 5 organization roles** (*Configure → Roles*). Use these EXACT
   keys (they are the internal role identifiers in `lib/auth/rbac.ts`):

   | Key | Name | Rank |
   |---|---|---|
   | `org:owner` | Owner | 4 |
   | `org:admin` | Admin | 3 |
   | `org:manager` | Manager | 2 |
   | `org:agent` | Agent | 1 |
   | `org:viewer` | Viewer | 0 |

4. **Create the 11 custom permissions** (*Configure → Permissions*), exact keys:

   ```
   org:billing:manage      org:workspace:edit       org:workspace:delete
   org:team:manage         org:campaigns:manage     org:templates:manage
   org:settings:manage     org:contacts:manage      org:leads:view_all
   org:leads:assign        org:reports:view
   ```

5. **Assign permissions to roles** (verbatim from `ROLE_PERMISSIONS`):
   - **owner** → all 11 (owner is also special-cased to "everything" in code;
     `billing:manage`, `workspace:edit`, `workspace:delete` are owner-only).
   - **admin** → `team:manage`, `campaigns:manage`, `templates:manage`,
     `settings:manage`, `contacts:manage`, `leads:view_all`, `leads:assign`,
     `reports:view`.
   - **manager** → `leads:view_all`, `leads:assign`, `reports:view`,
     `contacts:manage`.
   - **agent** → none (assigned-only; enforced in the Appwrite query).
   - **viewer** → `reports:view` only.

6. **Add the `org_status` session claim** (*Configure → Sessions → Customize
   session token*). This surfaces the disabled-member flag to middleware:

   ```json
   { "org_status": "{{org_membership.public_metadata.status}}" }
   ```

   (Disabling a member sets their membership `publicMetadata.status = "disabled"`;
   middleware + `getRequestContext` 403 on `org_status === "disabled"`.)

7. **Webhook endpoint** (*Configure → Webhooks → Add Endpoint*):
   - URL: `${APP_BASE_URL}/api/webhooks/clerk`
   - Subscribe to: `user.created`, `user.updated`, `organization.created`,
     `organization.updated`, `organization.deleted`,
     `organizationMembership.created`, `organizationMembership.updated`,
     `organizationMembership.deleted`.
   - Copy the **Signing Secret** → `CLERK_WEBHOOK_SECRET` (Svix-verified).

8. Set sign-in/up URLs (already defaulted): `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
   `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`.

---

## (c) Appwrite (data plane)

1. **Create a project** (cloud.appwrite.io or self-hosted). Copy:
   - `NEXT_PUBLIC_APPWRITE_ENDPOINT` = `https://<region>.cloud.appwrite.io/v1`
   - `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
   - `APPWRITE_DATABASE_ID=crm` (the migrate script creates the `crm` database).

2. **Create a server API key** (*Overview → Integrations → API Keys*) with these
   scopes (server-only admin key, never exposed to the client):
   `databases.read`, `databases.write`, `collections.read`, `collections.write`,
   `attributes.read`, `attributes.write`, `indexes.read`, `indexes.write`,
   `documents.read`, `documents.write`, plus `teams.read`, `teams.write` (per-org
   Appwrite Teams for defense-in-depth doc permissions). Copy → `APPWRITE_API_KEY`.

3. **Provision the schema** (idempotent — re-run = no-op):

   ```bash
   npm run appwrite:setup          # tsx appwrite/migrate.ts
   ```

   This creates the `crm` database, all 24 domain collections +
   `billing_webhook_events`, every attribute, and all indexes/unique constraints
   (it polls attribute readiness before creating dependent indexes).
   `documentSecurity: true` on every collection.

4. **(Optional) seed demo data** — 12 vertical workspaces, each with a known
   `whatsapp_accounts.$id` (phoneNumberId) so the dev injector can target it:

   ```bash
   npm run seed:demo               # tsx scripts/seed-demo.ts
   ```

---

## (d) Meta WhatsApp Cloud API

1. **Create an app** at developers.facebook.com (type: *Business*), add the
   **WhatsApp** product, and attach a WABA + a test phone number.

2. From *WhatsApp → API Setup*, copy the **Phone Number ID** and a
   (system-user or temporary) **access token** → `WHATSAPP_ACCESS_TOKEN`. Pin
   the Graph version: `META_GRAPH_VERSION=v21.0`.

3. From *App settings → Basic*, copy the **App Secret** → `WHATSAPP_APP_SECRET`
   (used to verify Meta's `X-Hub-Signature-256` HMAC on inbound — timing-safe).

4. Choose any string for `WHATSAPP_VERIFY_TOKEN` (the GET webhook challenge).

5. **Configure the webhook** (*WhatsApp → Configuration → Webhook*):
   - Callback URL: `${APP_BASE_URL}/api/webhooks/whatsapp`
     (expose localhost with `ngrok http 3000` and use the https URL).
   - Verify token: your `WHATSAPP_VERIFY_TOKEN`.
   - Subscribe to the `messages` field.
   - The GET handshake echoes `hub.challenge`; POSTs are HMAC-verified (403 on a
     bad signature) and always return 200 otherwise (per-message failures are
     logged, never failing the HTTP response — keeps Meta from disabling it).

6. **Local dev without real sends**: set `WHATSAPP_MOCK_SEND=1` (the send path
   logs and returns `mock-<uuid>` instead of calling Meta) and
   `DEV_INJECT_TOKEN=<any>` (guards `/api/dev/inject`, the dev-only signed
   injector that POSTs a real Meta-shaped, HMAC-signed payload through the full
   webhook path).

> The inbound processor + outbox/sync workers are designed to live in **Appwrite
> Functions** (plan §5). In dev / a single-region deploy you can instead use the
> Next route handler + `scripts/outbox-drain.ts` (or the `/api/cron/outbox` route
> below) — same idempotent logic.

---

## (e) Razorpay (billing)

1. **Get keys** (Dashboard → *Settings → API Keys*, use Test mode first):
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and
   `NEXT_PUBLIC_RAZORPAY_KEY_ID` (= the key id, used by the checkout widget).

2. **Create the 4 paid plans** (free has no Razorpay plan):

   ```bash
   npx tsx scripts/seed-razorpay-plans.ts     # needs RAZORPAY_KEY_ID/SECRET
   ```

   It prints `RZP_PLAN_STARTER / RZP_PLAN_GROWTH / RZP_PLAN_AI_PRO /
   RZP_PLAN_AGENCY` plan ids — paste them into `.env.local`. (Razorpay has no
   upsert, so run this ONCE per environment and store the ids.)

3. **Webhook** (Dashboard → *Settings → Webhooks → Add*):
   - URL: `${APP_BASE_URL}/api/webhooks/razorpay`
   - Active events: `subscription.authenticated`, `subscription.activated`,
     `subscription.charged`, `subscription.pending`, `subscription.halted`,
     `subscription.cancelled`, `subscription.completed`.
   - Set a secret → `RAZORPAY_WEBHOOK_SECRET` (HMAC-SHA256 verified, idempotent
     via `billing_webhook_events`). **Activation is webhook-only** — the client
     checkout handler is UX-only (plan R7).

The 5 tiers (₹/mo): `free` 0 · `starter` 1,499 · `growth` 2,999 · `ai_pro`
6,999 · `agency` 14,999, with the limit table in `lib/billing/plans.ts`. Trial =
14 days (`planStatus: trialing` keeps full paid limits; `past_due` keeps them
with a grace banner; `halted`/`cancelled` collapse to free limits).

---

## (f) `.env.local` checklist (maps 1:1 to plan §9)

```bash
# ── Clerk ──────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...              # Svix signing secret (step b7)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# ── Appwrite ───────────────────────────────────────────
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://<region>.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=...
APPWRITE_API_KEY=...                        # server-only admin key (step c2)
APPWRITE_DATABASE_ID=crm

# ── Meta WhatsApp Cloud API ────────────────────────────
WHATSAPP_VERIFY_TOKEN=...                   # GET challenge (any string)
WHATSAPP_APP_SECRET=...                     # HMAC X-Hub-Signature-256
WHATSAPP_ACCESS_TOKEN=...                   # send token
META_GRAPH_VERSION=v21.0
WHATSAPP_MOCK_SEND=                         # "1" in local dev to skip real sends
DEV_INJECT_TOKEN=                           # guards /api/dev/inject (dev only)

# ── LLM (optional polish; deterministic graph if unset) ─
LLM_ENABLED=                                # unset/false ⇒ fully deterministic
LLM_BASE_URL=
LLM_MODEL=
LLM_API_KEY=

# ── Razorpay ───────────────────────────────────────────
RAZORPAY_KEY_ID=rzp_test_...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...    # public key for checkout widget
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RZP_PLAN_STARTER=plan_...                   # from seed-razorpay-plans.ts
RZP_PLAN_GROWTH=plan_...
RZP_PLAN_AI_PRO=plan_...
RZP_PLAN_AGENCY=plan_...

# ── Misc ───────────────────────────────────────────────
APP_BASE_URL=http://localhost:3000
NODE_ENV=development
CRON_SECRET=                                # protects /api/cron/outbox (prod)
UPSTASH_REDIS_REST_URL=                     # optional distributed rate-limit
UPSTASH_REDIS_REST_TOKEN=                   #   (in-memory fallback if unset)
SENTRY_DSN=                                 # optional error capture (no-op if unset)
NEXT_PUBLIC_BUILD_ID=                        # optional; surfaced by /api/health
```

`lib/env.ts` validates two zod schemas (server vs `NEXT_PUBLIC_*`) and fails
fast on missing required vars. `UPSTASH_*` and `SENTRY_DSN` are optional drop-ins
(see README "No `@upstash/*`…"): rate-limiting uses an in-memory token bucket
until `UPSTASH_REDIS_REST_URL` is set AND `@upstash/ratelimit` + `@upstash/redis`
are installed; the logger's `captureError` no-ops until `SENTRY_DSN` is set AND a
`globalThis.__SENTRY_CAPTURE__` fn is registered.

---

## (g) Run commands

```bash
# Dev
npm run dev                                  # http://localhost:3000

# Provision / seed
npm run appwrite:setup                       # idempotent collection migrate
npm run seed:demo                            # 12 vertical demo workspaces
npx tsx scripts/seed-razorpay-plans.ts       # create paid plans, print RZP_PLAN_* ids

# Inbound (local, full signed path through the webhook):
curl -s "$APP_BASE_URL/api/dev/inject" \
  -H "x-dev-inject-token: $DEV_INJECT_TOKEN" -H 'content-type: application/json' \
  -d '{"phoneNumberId":"20000000000000","from":"919999000001","text":"book a demo"}'

# Inbound (local, direct — bypasses HTTP/signature):
npx tsx scripts/dev-inbound.ts "book a demo" [phoneNumberId] [from] [name]

# Outbox worker (one drain pass; mock-sends when WHATSAPP_MOCK_SEND=1):
npx tsx scripts/outbox-drain.ts [limit]

# Outbox cron in prod (every minute) — protect with CRON_SECRET:
#   Vercel Cron → GET ${APP_BASE_URL}/api/cron/outbox
#   header  x-cron-secret: $CRON_SECRET   (or Authorization: Bearer $CRON_SECRET)

# Build / serve / verify
npm run build                                # green even without keys ((app) is force-dynamic)
npm run start
npm run test                                 # 167 tests
curl -s "$APP_BASE_URL/api/health"           # {"ok":true,"ts":...,"build"?:...}
```

### End-to-end smoke (dev)
1. `npm run appwrite:setup && npm run seed:demo`
2. `WHATSAPP_MOCK_SEND=1 npm run dev`
3. Inject an inbound (curl above) → the AI graph classifies + replies →
   a lead is captured → an outbound is enqueued to `message_outbox`.
4. `npx tsx scripts/outbox-drain.ts` → the reply mock-sends and a `mock-<uuid>`
   wamid is backfilled.
5. Visit `/inbox` and `/leads` (after creating an org so `orgId` is set).
