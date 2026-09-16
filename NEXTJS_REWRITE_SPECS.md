# Nudge — Next.js Rewrite: Domain Sub-Specs (appendix)

Six expert specs (Opus·xhigh) that fed the master plan. See NEXTJS_REWRITE_PLAN.md for the reconciled version.



---

# App architecture & scalability (`architecture`)

I now have full ground truth: the data model, the RBAC/permission catalogue, the workspace-switch (`ws` JWT claim) tenancy pattern, the complete route surface, the idempotent inbound pipeline, outbox, sync, and the 12 vertical packs. I have everything needed to write the implementation-ready Next.js architecture spec.

```markdown
# Nudge-Next — Overall Next.js Architecture Spec

> Rewrite of the FastAPI + React/Vite app into **Next.js (App Router, TS, RSC)** on **Appwrite** (Databases/Storage/Functions), **Clerk** (auth + Organizations == workspaces), **Meta WhatsApp Cloud API JS SDK**, **Razorpay** (INR billing), shadcn/ui + Tailwind + framer-motion v3 + next-themes. Target dir: `nudge-next/`.
>
> Ground truth carried over from the existing app (must be preserved):
> - **Tenancy**: every domain row is `workspace_id`-scoped; the *active* workspace is a per-request value (the old `ws` JWT claim, switchable) — here it becomes the **active Clerk Organization**.
> - **RBAC**: roles `owner > admin > manager > agent > viewer` with the granular permission catalogue from `auth/rbac.py` (`billing.manage`, `workspace.edit/delete`, `team.manage`, `campaigns.manage`, `templates.manage`, `settings.manage`, `contacts.manage`, `leads.view_all`, `leads.assign`, `reports.view`). `agent` sees only assigned leads/conversations.
> - **Domain**: workspaces, members, invites, sales_teams(+members), lead_assignments, whatsapp_accounts (routing key = `phone_number_id`), contacts, contact_lists(+members), bots, conversations, inbox_messages, leads (vertical pipeline stages + assignment + `needs_human`), templates, campaigns/segments/variants, **idempotency/durability tables**: `webhook_events` (dedup), `message_outbox` (transactional outbox), `ai_traces`, `sync_runs`.
> - **AI graph**: ONE universal graph (classify → extract → decide → reply/handoff) parameterised by 12 vertical packs (`custom, coaching, clinic, real_estate, salon, ecommerce, b2b, travel, restaurant, gym, automobile, insurance, political_party`) + safety guards (opt-out, no-regression, terminal-stage). Runs inside an **Appwrite Function**, not the Next.js request path.

---

## 1. App Router folder layout

Route groups isolate three trust/layout zones: **`(marketing)`** (public, edge-cacheable), **`(auth)`** (Clerk-hosted flows), **`(app)`** (authenticated, org-scoped dashboard). Each feature gets a colocated folder under `(app)/[feature]/` with its own `page.tsx`, `loading.tsx`, `error.tsx`, and a `_components/` for route-private UI. Cross-cutting domain logic lives in `src/features/<domain>/` (server-only data access + schemas + actions), never inside route folders.

```text
nudge-next/
├─ .env.local                      # see §4
├─ .env.example
├─ next.config.mjs
├─ middleware.ts                   # Clerk authMiddleware + tenant/route guards (§3)
├─ tailwind.config.ts
├─ components.json                 # shadcn/ui generator config
├─ tsconfig.json                   # path alias "@/*" -> src/*
├─ appwrite/
│  ├─ appwrite.json                # Appwrite project/collections/indexes IaC (declarative deploy)
│  ├─ schema/                      # one file per collection: attributes + indexes + permissions
│  │  ├─ workspaces.ts  members.ts  invites.ts  salesTeams.ts  leadAssignments.ts
│  │  ├─ whatsappAccounts.ts  contacts.ts  contactLists.ts  bots.ts
│  │  ├─ conversations.ts  inboxMessages.ts  leads.ts  templates.ts
│  │  ├─ campaigns.ts  segments.ts  variants.ts
│  │  └─ webhookEvents.ts  messageOutbox.ts  aiTraces.ts  syncRuns.ts
│  ├─ migrate.ts                   # idempotent collection/index/permission provisioner (CI step)
│  └─ functions/                   # Appwrite Functions source (deployed separately; §6)
│     ├─ whatsapp-webhook/         # Meta inbound: verify, dedup, enqueue inbound job
│     ├─ inbound-processor/        # the AI graph pipeline (port of services/inbound.py)
│     ├─ outbox-worker/            # drain message_outbox -> Meta send API (retry/backoff)
│     ├─ sync-worker/              # reconciliation (port of services/sync.py); cron
│     ├─ clerk-webhook/            # user/org/membership/invite sync -> Appwrite
│     ├─ razorpay-webhook/         # subscription events -> workspace.plan
│     └─ shared/                   # graph/, packs/, guards/, appwriteAdmin.ts (reused by fns)
├─ public/
└─ src/
   ├─ app/
   │  ├─ layout.tsx                # <html> + ClerkProvider + ThemeProvider + fonts; theme color-scheme
   │  ├─ globals.css               # Tailwind layers + CSS vars for light/dark tokens
   │  ├─ not-found.tsx
   │  ├─ error.tsx                 # root error boundary (client)
   │  │
   │  ├─ (marketing)/
   │  │  ├─ layout.tsx             # marketing chrome (nav/footer), edge runtime
   │  │  ├─ page.tsx               # Landing (port LandingPage.jsx)
   │  │  ├─ pricing/page.tsx       # INR pricing (SALES.md), static
   │  │  ├─ verticals/[slug]/page.tsx  # 12 vertical specialist pages (SSG via generateStaticParams)
   │  │  └─ demo/page.tsx          # public vertical demo selector (port DemoPage.jsx)
   │  │
   │  ├─ (auth)/
   │  │  ├─ layout.tsx
   │  │  ├─ sign-in/[[...sign-in]]/page.tsx
   │  │  ├─ sign-up/[[...sign-up]]/page.tsx
   │  │  └─ accept-invite/[token]/page.tsx   # bridges Clerk org invitation (port AcceptInvitePage)
   │  │
   │  ├─ (app)/
   │  │  ├─ layout.tsx             # auth gate + AppShell (Sidebar/Topbar/OrgSwitcher); RSC
   │  │  ├─ onboarding/page.tsx    # create org / pick vertical (first-run)
   │  │  ├─ page.tsx               # dashboard home (redirect to /inbox or KPI overview)
   │  │  ├─ inbox/
   │  │  │  ├─ page.tsx            # conversation list (server) ; layout with thread slot
   │  │  │  ├─ [conversationId]/page.tsx   # thread (server shell + client realtime pane)
   │  │  │  ├─ loading.tsx error.tsx
   │  │  │  └─ _components/        # ThreadView, Composer, BotToggle, HandoffBanner
   │  │  ├─ leads/                 # board/list (assignment + pipeline stages, RBAC-scoped)
   │  │  │  ├─ page.tsx loading.tsx error.tsx
   │  │  │  └─ _components/        # LeadBoard, AssignDialog, StageColumn
   │  │  ├─ contacts/  ( + import dialog ; CSV via Storage )
   │  │  ├─ lists/
   │  │  ├─ templates/
   │  │  ├─ team/                  # members + invites (Clerk org membership)
   │  │  ├─ sales-teams/
   │  │  ├─ campaigns/
   │  │  │  ├─ page.tsx            # campaign list/dashboard
   │  │  │  ├─ new/page.tsx        # Brief (agentic generation trigger)
   │  │  │  └─ [campaignId]/page.tsx  # Approval/Dashboard (segments/variants/metrics)
   │  │  ├─ settings/              # vertical, bot persona/KB, WhatsApp numbers
   │  │  └─ billing/               # Razorpay plan + usage
   │  │
   │  └─ api/                      # Route Handlers — ONLY for non-form / external contracts (§2)
   │     ├─ webhooks/clerk/route.ts        # thin: re-dispatch to Appwrite clerk-webhook fn (or handle here)
   │     ├─ webhooks/razorpay/route.ts
   │     ├─ webhooks/whatsapp/route.ts     # (optional) if Meta points at Next instead of Appwrite fn
   │     ├─ health/route.ts
   │     └─ inbox/[conversationId]/stream/route.ts   # SSE fallback if not using Appwrite Realtime
   │
   ├─ features/                    # per-domain server logic (the "service layer")
   │  ├─ contacts/  { queries.ts, actions.ts, schema.ts, types.ts }
   │  ├─ leads/     { queries.ts, actions.ts, schema.ts, rbac.ts }
   │  ├─ inbox/     { queries.ts, actions.ts, realtime.ts }
   │  ├─ campaigns/ templates/ lists/ team/ salesTeams/ billing/ whatsapp/ verticals/ workspaces/
   │  └─ ai-graph/  { packs.ts, guards.ts, graph.ts }   # mirrors fns/shared; pure, importable
   │
   ├─ lib/
   │  ├─ appwrite/
   │  │  ├─ server.ts              # createServerClient(): admin + session-scoped clients
   │  │  ├─ admin.ts               # API-key client (server-only; never imported by client comp)
   │  │  ├─ collections.ts         # const COLLECTION ids + DB id (typed)
   │  │  └─ tenant.ts              # withTenant(): inject workspace_id equality into every Query
   │  ├─ auth/
   │  │  ├─ context.ts             # getRequestContext(): { userId, orgId(workspace), role, perms }
   │  │  ├─ rbac.ts                # ROLE_RANK, permission catalogue, has/can* (port of rbac.py)
   │  │  └─ guard.ts               # requirePermission(perm) / requireRole(); throws -> error.tsx
   │  ├─ env.ts                    # zod-validated env (server vs NEXT_PUBLIC); fail-fast at boot
   │  ├─ config.ts                 # plans (INR), limits, feature flags, vertical slug list
   │  ├─ ratelimit.ts              # Upstash/Appwrite token-bucket helper (§5)
   │  ├─ logger.ts                 # structured logger + request id
   │  └─ utils.ts                  # cn(), formatters (port utils.js)
   │
   ├─ components/
   │  ├─ ui/                       # shadcn/ui primitives (generated)
   │  ├─ layout/                   # AppShell, Sidebar, Topbar, OrgSwitcher, RoleGate
   │  ├─ providers/                # ThemeProvider, QueryProvider(optional), AnalyticsProvider
   │  └─ motion/                   # framer-motion v3 wrappers (PageTransition, FadeIn)
   │
   ├─ hooks/                       # client hooks (useRealtime, useOptimisticLead, useDebounce)
   ├─ types/                       # global d.ts, appwrite model types, clerk role types
   └─ styles/                      # theme tokens, design-system css vars (Stitch output lands here)
```

---

## 2. Server vs Client Components · Route Handlers vs Server Actions · data fetching

### Component strategy (RSC-first)
- **Default = Server Component.** All pages, layouts, lists, tables, dashboards, and detail shells render on the server and fetch from Appwrite directly (no client API client, no `axios`). This kills the entire `services/api.js` + JWT-interceptor layer.
- **Client Components (`"use client"`) only for**: interactivity (dialogs, drag-drop lead board, composer, form fields), framer-motion animations, theme toggle, Clerk widgets (`<OrganizationSwitcher/>`, `<UserButton/>`), and **realtime panes** (inbox thread subscribed to Appwrite Realtime). Keep them as leaf islands; pass server-fetched data down as props.
- **`server-only` guard**: `lib/appwrite/admin.ts`, `lib/auth/context.ts`, all `features/*/queries.ts` import `import "server-only"` so a stray client import fails the build (prevents leaking the Appwrite API key / Clerk secret).

### When Route Handlers (`app/api/*`) vs Server Actions

| Use **Server Actions** (`features/*/actions.ts`, `"use server"`) | Use **Route Handlers** (`app/api/*`) |
|---|---|
| All first-party mutations invoked from our own UI: create/update lead, assign, reply, toggle bot, CRUD contacts/lists/templates/teams, rename workspace, change vertical | **Inbound webhooks** with fixed external contracts: Clerk, Razorpay, Meta WhatsApp (signature verification, raw-body) |
| Form submissions (progressive enhancement) + optimistic UI | **Health/readiness** probe |
| Anything that should `revalidatePath`/`revalidateTag` after writing | Long-lived **SSE stream** fallback (if not using Appwrite Realtime) |
|  | Anything called by a non-browser client or needing custom status/headers |

Every Server Action begins with `const ctx = await getRequestContext()` then `requirePermission(...)`, validates input with a **zod** schema, calls the feature query/mutation (tenant-scoped), then `revalidateTag('leads:'+ctx.orgId)`.

### Data-fetching patterns against Appwrite (from the server)
- **One factory, two clients** (`lib/appwrite/server.ts`):
  - **Admin client** (API key) for trusted server reads/writes where we enforce tenancy in code (the common case; fast, no per-user session juggling).
  - **Session/JWT client** for defense-in-depth: mint an Appwrite JWT from the Clerk identity so Appwrite's **document/collection permissions** (`Team:<orgId>` read) act as a second wall. Recommended for any path that returns raw documents to the browser.
- **Tenancy is never optional.** All reads go through `withTenant(ctx, queries)` (`lib/appwrite/tenant.ts`) which **prepends `Query.equal('workspace_id', ctx.orgId)`** to every `databases.listDocuments` call. Feature queries cannot construct a query without it (typed wrapper rejects a missing tenant).
- **No client-side fetching of domain data.** Mutations return updated rows; lists re-fetch via `revalidateTag`. Realtime deltas (new inbox message, lead stage change) come from **Appwrite Realtime** subscriptions in client islands, scoped by a channel that includes `orgId`.
- **Pagination/search** mirror current `?q&limit&offset` semantics using `Query.search`/`Query.limit`/`Query.offset`, returned from RSC as typed page props.

---

## 3. Multi-tenant request lifecycle & middleware

**Workspace = Clerk Organization.** The old switchable `ws` JWT claim becomes Clerk's **active organization** (`auth().orgId`), switched via `<OrganizationSwitcher/>`. Clerk org **role** maps 1:1 to our RBAC via metadata.

### Resolution chain (every request)
1. **`middleware.ts`** runs `clerkMiddleware`:
   - Public matcher: `(marketing)` + `(auth)` + webhook routes pass through.
   - Protected matcher `'/(app)(.*)'`: if unauthenticated → `redirect(sign-in)`.
   - If authed but **no active org** → `redirect('/onboarding')` (forces a workspace, matching "all data is workspace-scoped").
   - Attach a request id header for observability.
2. **`getRequestContext()`** (`lib/auth/context.ts`, server-only, cached per-request via React `cache()`):
   - `const { userId, orgId, orgRole, orgSlug } = await auth();`
   - Map `orgRole` → internal role with `roleFromClerk(orgRole)` (Clerk `org:owner/admin/...` → `owner/admin/manager/agent/viewer`; stored in Clerk **organization membership publicMetadata** as the source of truth, synced both ways by the clerk-webhook fn).
   - Resolve internal `workspace.$id` (== `orgId`; we use the Clerk org id **as** the Appwrite `workspace_id` so no extra lookup/join is needed) and load the lightweight workspace doc (plan, vertical) once, cached.
   - Returns `{ userId, orgId (=workspace_id), role, perms, vertical, plan }`.
3. **Threading to Appwrite**: `orgId` from the context is the only tenancy key; `withTenant(ctx, ...)` injects it into every query. Server Actions and RSC both pull the *same* cached context — there is no token to pass around, eliminating the `ws`-claim staleness class of bugs.
4. **RBAC enforcement**: `requirePermission('leads.assign')` etc. at the top of each action/RSC segment; `agent` role additionally gets an automatic `Query.equal('assigned_to_user_id', ctx.userId)` filter in `features/leads/queries.ts` (mirrors `can_view_all_leads`).

### Middleware design notes
- Keep middleware **thin and edge-safe** (only Clerk + redirects; no Appwrite calls — Appwrite admin SDK is node-only).
- Org-scoping is enforced in the data layer, **not** middleware (middleware can't see DB), so a forged org id still fails because Clerk signs `orgId` and we treat it as the tenant key.
- WhatsApp tenant routing is **server-side by `phone_number_id`** (in the webhook/inbound function, exactly as `_route_workspace_id` does today) — independent of the user request lifecycle.

---

## 4. Env/config, conventions, boundaries, caching

### Env (`lib/env.ts`, zod, fail-fast)
```text
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  CLERK_SECRET_KEY  CLERK_WEBHOOK_SECRET
# Appwrite
NEXT_PUBLIC_APPWRITE_ENDPOINT  NEXT_PUBLIC_APPWRITE_PROJECT_ID
APPWRITE_API_KEY  APPWRITE_DATABASE_ID
# Meta WhatsApp Cloud API
META_APP_SECRET  META_WHATSAPP_TOKEN(or per-WABA system-user tokens)  META_WEBHOOK_VERIFY_TOKEN  META_GRAPH_VERSION
# Razorpay
RAZORPAY_KEY_ID  NEXT_PUBLIC_RAZORPAY_KEY_ID  RAZORPAY_KEY_SECRET  RAZORPAY_WEBHOOK_SECRET
# Misc
UPSTASH_REDIS_REST_URL/TOKEN (ratelimit)  APP_BASE_URL  NODE_ENV
```
- Split **server-only** vs `NEXT_PUBLIC_*` in two zod schemas; importing a server var into a client component is a type error.
- `lib/config.ts` holds non-secret config: **INR plans/limits** (port `plans.py`: free=500 contacts/200 sends-day/1 number; pro=100k/50k/10), vertical slug list, pipeline defaults.

### Conventions
- Path alias `@/*` → `src/*`. Feature folders own their `schema.ts` (zod), `types.ts` (inferred), `queries.ts` (reads), `actions.ts` (mutations). UI never imports `lib/appwrite/*` directly — only through `features/*`.
- Naming: `kebab-case` route segments, `PascalCase` components, `camelCase` functions, collection ids in one typed const.

### Error & loading boundaries
- Per-feature `loading.tsx` (skeletons via shadcn `Skeleton`) + `error.tsx` (client; shows retry, reports to logger). Root `error.tsx` + `not-found.tsx`. Use **`<Suspense>`** to stream slow widgets (e.g., AI traces, metrics) so the shell paints instantly.
- A typed `AppError`/`ForbiddenError`/`NotFoundError` thrown by guards is caught by the nearest `error.tsx`, rendering a role-appropriate message (mirrors the 401/403/404 the FastAPI app raised).

### Caching / revalidation
- Marketing/pricing/vertical pages: **static** (`generateStaticParams`, ISR `revalidate`).
- Dashboard data: **dynamic, tagged**. Reads use `unstable_cache`/`fetch`-less Appwrite calls wrapped with `cacheTag('leads:'+orgId)`, `cacheTag('inbox:'+orgId)`, etc. Mutations call `revalidateTag(...)`. Realtime updates bypass cache for live deltas.
- **Per-tenant cache keys always include `orgId`** so no cross-tenant cache bleed.

---

## 5. Scalability

- **Runtime split**: `(marketing)` + webhook signature pre-checks can run on **edge**; everything touching the Appwrite **node SDK** (admin client, all `(app)` data + Server Actions) runs on **node runtime** (`export const runtime = 'nodejs'`). Default protected segments to node.
- **Background work via Appwrite Functions + queue** (no Python, no in-process threads like today's `_outbox_loop`/`_sync_loop`/`_scheduler_loop`):
  - `whatsapp-webhook` fn: verify Meta signature, **write `webhook_events` for idempotency** (unique `provider+provider_event_id`), then enqueue an `inbound-processor` execution (Appwrite async function execution acts as the queue). Returns 200 fast.
  - `inbound-processor` fn: the full port of `services/inbound.py` + `ai_graph` (classify→extract→decide→reply, guards, lead transition guard, **enqueue reply into `message_outbox`** with `idempotency_key`, write `ai_traces`).
  - `outbox-worker` fn (cron, e.g. every 1–5s via Appwrite scheduled function or triggered on outbox insert): drain `pending` rows, send via **Meta Cloud API JS SDK**, retry/backoff with `attempts/max_attempts/next_attempt_at`, mark `sent|failed|dead`. The `(workspace_id, idempotency_key)` uniqueness guarantees no double-send (preserved exactly).
  - `sync-worker` fn (cron, ~5 min): reconcile stuck sends, lead consistency, campaign stats; writes `sync_runs`.
  - `campaign-scheduler` fn (cron): launch `scheduled` campaigns whose time arrived (replaces `_scheduler_loop`).
- **Rate limiting** (`lib/ratelimit.ts`): token-bucket (Upstash Redis REST, edge-friendly) keyed by `orgId`+route for Server Actions/Route Handlers; per-plan **send caps** enforced in the outbox worker against `lib/config.ts` limits (port of `remaining_sends_today`/`remaining_contact_slots`). Webhooks are deduped, not rate-limited.
- **Multi-tenant isolation at scale**: tenancy enforced in `withTenant` (code) **and** Appwrite collection/document permissions (`Team:<orgId>`) as defense-in-depth; indexes on `workspace_id` (+ compound `workspace_id+status`, `workspace_id+created_at`) on every collection for fast tenant-scoped queries. Unique indexes mirror current constraints (`whatsapp_accounts.phone_number_id` unique global; `contacts (workspace_id, whatsapp_number)`; `message_outbox (workspace_id, idempotency_key)`; `webhook_events (provider, provider_event_id)`).
- **Observability**: structured logs with `requestId`+`orgId`+`userId` (`lib/logger.ts`); function executions logged in Appwrite console; `ai_traces` remain the per-message audit (honest `confidence=null` for deterministic path); optional Sentry for Next + function error capture; `/api/health` for readiness.

---

## 6. Deliverables checklist (this architecture layer)

- [ ] `nudge-next/` scaffolded: Next.js App Router + TS + Tailwind + shadcn/ui (`components.json`) + framer-motion v3 + next-themes (light/dark from first commit).
- [ ] Route groups `(marketing)` / `(auth)` / `(app)` with feature folders, per-feature `loading.tsx`/`error.tsx`, root `error.tsx`/`not-found.tsx`.
- [ ] `middleware.ts`: `clerkMiddleware`, public/protected matchers, no-active-org → `/onboarding`, request-id header.
- [ ] `lib/auth/context.ts` `getRequestContext()` (React-`cache`d) resolving `{ userId, orgId=workspace_id, role, perms, vertical, plan }` from Clerk org.
- [ ] `lib/auth/rbac.ts` + `guard.ts`: full port of the 5-role permission catalogue and `requirePermission`/`requireRole`; agent auto-scoping for leads/conversations.
- [ ] `lib/appwrite/{admin,server,collections,tenant}.ts`: admin + session clients, typed collection ids, `withTenant()` enforcing `workspace_id` on every query; `server-only` guards.
- [ ] `lib/env.ts` (zod, server vs public) + `lib/config.ts` (INR plans/limits, vertical slugs) + `.env.example`.
- [ ] `appwrite/schema/*` + `appwrite/migrate.ts`: all collections, attributes, **indexes**, and **unique constraints** mirroring `db/models.py`; per-tenant permission model documented.
- [ ] `features/*` contract established: `{ schema, types, queries, actions }` pattern, with example `leads` (RBAC-scoped reads + assign action + `revalidateTag`).
- [ ] RSC-vs-Client + Action-vs-Route-Handler conventions documented in repo `README`/`CONTRIBUTING`.
- [ ] Caching policy: per-tenant cache tags + `revalidateTag` on every mutation; ISR for marketing/vertical pages.
- [ ] Appwrite Functions skeletons (`whatsapp-webhook`, `inbound-processor`, `outbox-worker`, `sync-worker`, `campaign-scheduler`, `clerk-webhook`, `razorpay-webhook`) + `functions/shared/{graph,packs,guards}` ported from `ai_graph/*` and `services/*`.
- [ ] Route Handler stubs for the 3 webhooks (signature verification + raw body) and `/api/health`.
- [ ] Runtime annotations (edge vs node) per segment; `lib/ratelimit.ts`; `lib/logger.ts` with request/tenant correlation.
- [ ] AppShell (Sidebar/Topbar/`<OrganizationSwitcher/>`/`<UserButton/>`/theme toggle) + `RoleGate` component for conditional UI by permission.
- [ ] Tenancy isolation test: a request in org A can never read/write org B documents (code-path + Appwrite-permission).

---

### Key ground-truth mappings (existing → nudge-next)
| Existing (FastAPI/React) | nudge-next |
|---|---|
| `ws` JWT claim + `get_auth_context` | Clerk **active org** + `getRequestContext()` |
| `auth/rbac.py` permission catalogue | `lib/auth/rbac.ts` (verbatim semantics) |
| `services/api.js` axios client + interceptors | **deleted** — RSC server reads + Server Actions |
| `services/inbound.py` + `ai_graph/*` (in-process) | `appwrite/functions/inbound-processor` + `functions/shared` |
| `_outbox_loop`/`_sync_loop`/`_scheduler_loop` threads | scheduled/triggered **Appwrite Functions** |
| pywa + local simulator | **Meta WhatsApp Cloud API JS SDK** in webhook + outbox fns |
| `plans.py` mock billing (`/api/billing/*`) | **Razorpay** subscriptions + `razorpay-webhook` fn |
| `whatsapp_accounts.phone_number_id` routing | identical, in `whatsapp-webhook`/`inbound-processor` fns |
| `webhook_events` / `message_outbox` / `ai_traces` / `sync_runs` | same collections, same idempotency/outbox guarantees |
```

Relevant existing files I used as ground truth (all absolute): `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/main.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/db/models.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/auth/deps.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/auth/rbac.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/ai_graph/{graph,packs,guards}.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/services/inbound.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/plans.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/workspaces.py`, `/Users/hasanraza/Desktop/CampaignAgenticAI/frontend/src/services/api.js`, and `/Users/hasanraza/Desktop/CampaignAgenticAI/frontend/src/context/AuthContext.jsx`.


---

# Appwrite data model & tenancy (`appwrite-data`)

I have a complete picture of the schema, scoping patterns, enums, JSONB fields, and idempotency/outbox semantics. Here is the implementation-ready Appwrite spec.

---

# Appwrite Data Architecture Spec — Vertical-Aware AI WhatsApp CRM (Next.js + Clerk rewrite)

Authoritative source read: `backend/db/models.py`, `backend/auth/{rbac,deps}.py`, `backend/plans.py`, `backend/services/inbound.py`, `backend/ai_graph/{packs,guards}.py`, and the `workspace_id ==` scoping pattern across `backend/api/*.py`.

This maps **every** current Postgres table to Appwrite collections, defines tenant isolation against Clerk Organizations, models idempotency + the transactional outbox without Postgres constraints, and ships an idempotent bootstrap script.

---

## 0. Foundational decisions (read first)

| Concern | Decision |
|---|---|
| Tenancy key | A `workspaceId` **string attribute on every tenant-scoped document**, set to the **Clerk Organization ID** (`org_…`). This is the single scoping key, not the Appwrite-internal `$id` of a workspace doc. |
| Auth bridge | Clerk JWT verified in Next.js route handlers / server actions. Appwrite is accessed server-side with an **API key** (admin/server SDK), never directly from the browser. Appwrite is a data plane; Clerk is the identity plane. |
| ID strategy | Let Appwrite generate `$id` (`ID.unique()`) for almost all docs. **Exceptions where the natural key IS the doc id** (gives free O(1) idempotency without a unique-index race): `webhook_events`, `message_outbox`, `workspaces`, `whatsapp_accounts`. See §3. |
| Enums | Appwrite native **Enum attributes** for closed sets (roles, statuses, directions). Open/extensible sets (vertical, intent, pipeline stage) are **String attributes** validated in app code against the vertical pack — because the 12 packs override stages and Appwrite enums can't be per-tenant. See §4. |
| JSONB | Appwrite has no JSON type. Use a **String attribute sized generously (e.g. 100000–1000000)** holding `JSON.stringify(...)`, named `…Json`. Lists of scalars (`tags`, `customerIds`) that you must *query/filter by membership* use a **String array attribute** instead. See §4. |
| Timestamps | Drop most `created_at`/`updated_at` columns — Appwrite gives `$createdAt`/`$updatedAt` free. Keep only **semantic** timestamps the app sorts/filters on (`lastInboundAt`, `nextAttemptAt`, `sentAt`, `optInAt`, `scheduledAt`, `expiresAt`, `processedAt`, `acceptedAt`, `startedAt`, `completedAt`). |
| Relationships | **Do not use Appwrite relationship attributes.** Use plain string FK attributes (`conversationId`, `contactId`, …) + indexes + app-side joins. Relationship attributes don't scope by tenant, complicate permissions, and the current code already joins by id. |

### Why `workspaceId` attribute + query scoping over per-org document permissions

Recommended: **`workspaceId` string attribute scoping as the source of truth**, with Appwrite document permissions as a **defense-in-depth** layer (not the primary gate).

Justification:
- **The data plane is server-only.** All reads/writes go through Next.js server code holding a Clerk session; that server code injects `Query.equal('workspaceId', orgId)` on every query and stamps `workspaceId` on every write. This mirrors the existing `Contact.workspace_id == ws.id` pattern exactly, so migration is mechanical.
- **Document-permission-only isolation breaks worker/system writes.** Webhook/outbox/sync Functions run as a system identity, not as an org member — they must write `ai_traces`, `webhook_events`, `inbox_messages` for a tenant the "user" isn't logged into. An explicit `workspaceId` makes that trivial; a Team/label-permission-only model forces the worker to impersonate.
- **Cross-tenant analytics & dedup need querying, not just access.** `webhook_events` dedup, `sends_today` metering, and reconciliation all *query across* a tenant's rows — an attribute is queryable, a permission label is not.
- **Clerk org membership is the real RBAC.** Roles already live in Clerk org metadata (owner/admin/manager/agent/viewer). We don't need Appwrite Teams to re-encode membership; the server resolves role from Clerk and enforces it before touching Appwrite.

**Defense-in-depth permission model (still applied):** every tenant doc additionally gets a Team-scoped permission where the **Appwrite Team is created per Clerk org** (team id = a deterministic hash of `org_…`, or store the mapping on the `workspaces` doc):

```
Permission.read(Team(<appwriteTeamIdForOrg>))
Permission.update(Team(<appwriteTeamIdForOrg>, 'manager'))   // role-gated team roles mirror RBAC
Permission.delete(Team(<appwriteTeamIdForOrg>, 'admin'))
// system worker writes use the server API key, which bypasses doc perms by design
```
This means even a leaked client token can only ever see its own org's rows, but the **app never relies on it** for correctness — it relies on `workspaceId` query scoping. Best of both.

---

## 1. Database & collection inventory

One database: **`crm`** (`databaseId: "crm"`). Collections below. Legend — R=required, D=default, ⬡=enum, ▢=string-array, ⟦json⟧=stringified JSON.

> Every tenant-scoped collection has: `workspaceId` (String, R, indexed) + the Team permission set from §0. Collections marked **(global)** are not tenant-scoped (routing/identity tables).

### 1.1 Identity & tenancy

#### `workspaces` (global; `$id` = Clerk org id `org_…`)
Maps `Workspace`. Synced from Clerk org webhooks.

| attr | type | notes |
|---|---|---|
| name | String(255) | R |
| plan | Enum⬡ `free,pro` | R, D=`free` |
| planStatus | Enum⬡ `active,canceled,past_due` | R, D=`active` |
| vertical | String(40) | R, D=`custom` — validated vs pack registry |
| clerkOrgId | String(64) | R — duplicated for clarity even though it's `$id` |
| appwriteTeamId | String(64) | the per-org Appwrite Team (defense-in-depth) |
| razorpayCustomerId | String(64) | nullable (billing) |
| razorpaySubscriptionId | String(64) | nullable |

Indexes: `key:plan`, `key:planStatus`.
*Dropped: `created_at` (→ `$createdAt`).*

#### `workspace_members`
Maps `WorkspaceMember`. **Mirror of Clerk org membership** (Clerk is source of truth; this is a synced read-model for fast queries/joins).

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx |
| userId | String(64) | R, idx — Clerk user id `user_…` |
| email | String(320) | denormalized for display |
| role | Enum⬡ `owner,admin,manager,agent,viewer` | R, D=`agent` |
| status | Enum⬡ `active,invited,disabled` | R, D=`active` |

Indexes: **unique `(workspaceId, userId)`** [= `uq_workspace_member`]; `key:(workspaceId, role)`.

#### `workspace_invites`
Maps `WorkspaceInvite`. *Note: Clerk Organizations has native invitations; keep this collection only if you need custom role bands beyond Clerk's. If you adopt Clerk invites fully, this becomes a thin mirror.*

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx |
| email | String(320) | R, idx |
| role | Enum⬡ roles | R, D=`agent` |
| tokenHash | String(128) | R, idx — store hash only (matches current design) |
| invitedByUserId | String(64) | nullable |
| status | Enum⬡ `pending,accepted,revoked,expired` | R, D=`pending` |
| expiresAt | Datetime | nullable |
| acceptedAt | Datetime | nullable |

Indexes: `key:tokenHash`, `key:(workspaceId,status)`, `key:email`.

### 1.2 Sales routing

#### `sales_teams`
Maps `SalesTeam`. Attrs: `workspaceId`(R,idx), `name`(String 120, R), `description`(String 2000). Index: **unique `(workspaceId, name)`** [= `uq_sales_team_name`].

#### `sales_team_members`
Maps `SalesTeamMember`. Attrs: `workspaceId`(R,idx), `teamId`(R,idx), `userId`(R,idx). Index: **unique `(teamId, userId)`** [= `uq_sales_team_member`].

#### `lead_assignments`
Maps `LeadAssignment` (append-only history). Attrs: `workspaceId`(R,idx), `leadId`(R,idx), `assignedToUserId`(idx), `assignedToTeamId`(idx), `assignedByUserId`, `status`(Enum⬡ `active,reassigned,closed`, D=`active`). Index: `key:(workspaceId,leadId,status)`.

### 1.3 Channel & CRM core

#### `whatsapp_accounts` (global; `$id` = `phone_number_id`)
Maps `WhatsAppAccount`. **The `$id` is the Meta `phone_number_id`** — the inbound webhook routing key — so routing is an O(1) `getDocument`, no query, no race. This replaces `unique(phone_number_id)`.

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx (route target) |
| wabaId | String(64) | nullable |
| phoneNumberId | String(64) | R (= `$id`, duplicated for queryability) |
| displayPhoneNumber | String(32) | nullable |
| verifiedName | String(255) | nullable |
| accessTokenRef | String(255) | **reference/secret id**, not the raw token — store the actual token in Appwrite **Function env / a secrets vault**, not a document |
| status | Enum⬡ `connected,disconnected,error` | D=`connected` |

#### `contacts`
Maps `Contact`. The CRM/demographic columns are kept flat (the engagement predictor reads them); arbitrary import columns go to `attributesJson`.

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx |
| fullName | String(255) | |
| whatsappNumber | String(32) | R — E.164 digits |
| email | String(320) | |
| age | Integer | |
| gender | String(32) | |
| city | String(120) | |
| occupationType | String(64) | |
| monthlyIncome | Integer | |
| creditScore | Integer | |
| kycStatus | String(8) | |
| appInstalled | String(8) | |
| existingCustomer | String(8) | |
| socialMediaActive | String(8) | |
| attributesJson | String(100000) | ⟦json⟧ free-form CSV columns |
| tags | String[]▢ (size 64, array) | **array attribute** (filterable by tag) |
| optInStatus | Enum⬡ `opted_in,opted_out,unknown` | R, D=`unknown` |
| optInSource | String(32) | `import,manual,inbound_message` |
| optInAt | Datetime | |

Indexes: **unique `(workspaceId, whatsappNumber)`** [= `uq_workspace_whatsapp`]; `key:(workspaceId, optInStatus)`; `key:tags` (array index, for segment queries).

#### `contact_lists`
Maps `ContactList`. Attrs: `workspaceId`(R,idx), `name`(String 120, R), `description`(String 2000).

#### `contact_list_members`
Maps `ContactListMember`. Attrs: `workspaceId`(R,idx — add for tenant scoping even though original lacked it), `listId`(R,idx), `contactId`(R,idx). Index: **unique `(listId, contactId)`** [= `uq_list_contact`].

#### `templates`
Maps `Template`. Attrs: `workspaceId`(R,idx), `name`(String 200, R), `category`(Enum⬡ `marketing,utility,authentication,service`, D=`marketing`), `language`(String 8, D=`en`), `body`(String 8000, R), `status`(Enum⬡ `draft,pending,approved,rejected`, D=`draft`). Index: **unique `(workspaceId, name)`** [= `uq_template_workspace_name`]. (`updated_at` → `$updatedAt`.)

#### `bots`
Maps `Bot` (one per workspace). Attrs: `workspaceId`(R, **unique** idx — enforces 1:1), `enabled`(Boolean, D=true), `handoffEnabled`(Boolean, D=true), `name`(String 120), `prompt`(String 20000), `knowledge`(String 100000). Index: **unique `(workspaceId)`**.

### 1.4 Conversations & messaging

#### `conversations`
Maps `Conversation`.

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx |
| phoneNumberId | String(64) | R |
| customerWaId | String(32) | R |
| customerName | String(255) | |
| contactId | String(64) | idx |
| status | Enum⬡ `open,closed` | R, D=`open` |
| autoReply | Boolean | R, D=true (false = human takeover) |
| unread | Boolean | R, D=true |
| lastInboundAt | Datetime | drives 24h window |

Indexes: **unique `(workspaceId, phoneNumberId, customerWaId)`** [= `uq_conversation`]; `key:(workspaceId, status, lastInboundAt)` (inbox list, sorted).

#### `inbox_messages`
Maps `InboxMessage`. Attrs: `workspaceId`(R,idx), `conversationId`(R,idx), `direction`(Enum⬡ `inbound,outbound`, R), `sender`(Enum⬡ `customer,bot,agent`, R), `text`(String 8000), `wamid`(String 128). Index: `key:(conversationId, $createdAt)` (thread order); `key:wamid`.

#### `leads`
Maps `Lead`. **`status` = pipeline stage** — a String, not an enum, because the 12 packs override the stage list (e.g. coaching: `new,course_identified,batch_matched,demo_scheduled,…,enrolled,escalated,lost`). Validated in app code against `pack.pipeline_stages`.

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx |
| conversationId | String(64) | idx |
| contactId | String(64) | idx |
| name | String(255) | |
| phone | String(32) | |
| intent | String(40) | |
| details | String(2000) | |
| source | Enum⬡ `bot,agent` | R, D=`bot` |
| status | String(48) | R, D=`new` — **pipeline stage**, pack-validated |
| assignedToUserId | String(64) | idx |
| assignedToTeamId | String(64) | idx |
| needsHuman | Boolean | R, D=false |

Indexes: `key:(workspaceId, status)`; `key:(workspaceId, assignedToUserId)`; `key:(workspaceId, needsHuman)`; `unique:(conversationId)` *(the inbound code does `Lead.filter(conversation_id==convo.id).first()` and creates one lead per conversation — enforce it).*

### 1.5 AI audit, idempotency, outbox, sync

#### `ai_traces`
Maps `AiTrace`. Honest-by-construction: `confidence` is **nullable** (deterministic fallbacks store null, not a fake number).

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx |
| contactId / leadId / conversationId / inboundMessageId | String(64) | conversationId idx |
| vertical | String(40) | |
| intent | String(40) | |
| confidence | Float | **nullable** |
| confidenceSource | Enum⬡ `llm,deterministic,rule,unknown` | |
| extractedFieldsJson | String(20000) | ⟦json⟧ |
| stageBefore / stageAfter | String(48) | |
| tagsAdded | String[]▢ | |
| nextAction | String(64) | |
| handoffRequired | Boolean | R, D=false |
| handoffReason | String(255) | |
| fallbackUsed | Boolean | R, D=false |
| modelUsed | String(64) | |
| graphVersion | String(32) | |
| error | String(2000) | |

Indexes: `key:(workspaceId, $createdAt)`; `key:conversationId`.

#### `webhook_events` (global; **`$id` = deterministic dedup key**)
Maps `WebhookEvent`. **This is the idempotency table — see §3.** `$id = hash("<provider>:<provider_event_id>")`. Creating a doc with an existing `$id` throws `409 Document already exists` → that *is* the dedup, atomic, no unique-index race.

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | idx, set once routed |
| provider | Enum⬡ `whatsapp_cloud,whatsapp_sim` | R |
| providerEventId | String(128) | R |
| messageId | String(128) | |
| payloadJson | String(100000) | ⟦json⟧ raw event |
| status | Enum⬡ `received,processing,processed,failed,ignored_duplicate` | R, D=`received` |
| error | String(2000) | |
| processedAt | Datetime | |

Index: `key:(provider, providerEventId)` (kept as a queryable mirror of the `$id` key); `key:(workspaceId,status)`.

#### `message_outbox` (transactional outbox; **`$id` = `hash(workspaceId:idempotencyKey)`**)
Maps `MessageOutbox`. The `$id`-as-natural-key gives the `unique(workspace_id, idempotency_key)` guarantee atomically — see §3.

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | R, idx |
| contactId / conversationId / inboxMessageId | String(64) | conversationId idx |
| channel | Enum⬡ `whatsapp` | R, D=`whatsapp` |
| payloadJson | String(8000) | ⟦json⟧ `{to,text,sender}` (R) |
| idempotencyKey | String(160) | R (mirror of key, queryable) |
| status | Enum⬡ `pending,sending,sent,failed,dead` | R, D=`pending` |
| attempts | Integer | R, D=0 |
| maxAttempts | Integer | R, D=5 |
| nextAttemptAt | Datetime | claim/backoff cursor |
| providerMessageId | String(128) | the wamid to stamp back |
| lastError | String(2000) | |
| sentAt | Datetime | |

Indexes: `key:(status, nextAttemptAt)` (the worker claim query); `key:(workspaceId, idempotencyKey)`.

#### `sync_runs` (global)
Maps `SyncRun`. Attrs: `workspaceId`(idx), `syncType`(Enum⬡ `message_status,contacts,campaigns,full_workspace`, R), `cursorJson`(String 8000), `status`(Enum⬡ `running,success,failed`, D=`running`), `statsJson`(String 8000), `startedAt`(Datetime), `completedAt`(Datetime), `error`(String 2000). Index: `key:(workspaceId, syncType, $createdAt)`.

### 1.6 Agentic campaign generation

#### `campaigns`
Maps `Campaign`. `status` is a **closed 11-value enum** (CampaignStatus) — safe as a native Enum (it's app-controlled, not per-vertical).

| attr | type | notes |
|---|---|---|
| workspaceId | String(64) | idx |
| name | String(255) | |
| brief | String(8000) | R |
| targetListId | String(64) | nullable (null = all contacts) |
| templateId | String(64) | nullable |
| scheduledAt | Datetime | null = send on approval |
| status | Enum⬡ `profiling,planning,generating,pending_approval,approved,executing,monitoring,optimizing,completed,rejected,scheduled` | R, D=`profiling` |
| stateCheckpointJson | String(1000000) | ⟦json⟧ serialized LangGraph→**equivalent JS graph** state |
| rejectionFeedback | String(2000) | |

Index: `key:(workspaceId, status)`.

#### `customer_profiles`
Maps `CustomerProfile` (per-run materialization). Keep flat demographic columns (predictor reads them); `rawDataJson` + `segmentTags`▢. Attrs: `workspaceId`(idx), `customerId`(String 64, R, idx), `email`, `fullName`, `whatsappNumber`, demographics (`age,gender,maritalStatus,familySize,dependentCount,kidsInHousehold,city`), financial (`occupation,occupationType,monthlyIncome,creditScore,kycStatus,appInstalled,existingCustomer,socialMediaActive`), `rawDataJson`(String 100000), `segmentTags`(String[]▢). Index: `key:(workspaceId, customerId)`.

#### `segments`
Maps `Segment`. Attrs: `workspaceId`(idx — added for scoping), `campaignId`(R,idx), `label`(String 255, R), `criteriaJson`(String 20000), `customerIds`(String[]▢ — **array, queryable membership**), `sendTime`(String 32), `predictedOpenRate`(Float), `predictedClickRate`(Float). Index: `key:campaignId`.

#### `variants`
Maps `Variant`. Attrs: `workspaceId`(idx), `segmentId`(R,idx), `externalCampaignId`(String 64), `subject`(String 200), `body`(String 5000, R), `hasEmoji`(Boolean D=false), `hasUrl`(Boolean D=false), `fontStylesJson`(String 4000), `sentCount`/`openCount`/`clickCount`(Integer D=0). Index: `key:segmentId`; `key:externalCampaignId`.

#### `agent_logs`
Maps `AgentLog`. Attrs: `workspaceId`(idx), `campaignId`(R,idx), `agentName`(String 64, R), `step`(Integer), `inputPayloadJson`(String 100000), `outputPayloadJson`(String 100000), `llmReasoning`(String 20000). Index: `key:campaignId`.

#### `whatsapp_messages`
Maps `WhatsAppMessage` (outbound campaign send + engagement lifecycle). Attrs: `workspaceId`(idx), `broadcastId`(String 64, R, idx), `campaignId`(String 64, idx), `customerId`(String 64, R, idx), `waId`(String 32, idx — campaign reply attribution joins on this), `wamid`(String 128, idx), `tracker`(String 160, R, idx — `"{broadcastId}:{customerId}"`), `status`(Enum⬡ `sent,delivered,read,failed`, D=`sent`), `clicked`(Boolean D=false), `replied`(Boolean D=false). Index: `key:(workspaceId,broadcastId)`, `key:tracker`, `key:waId`.

#### `api_call_logs` (global)
Maps `ApiCallLog` (rate limiter). **`$id` = `hash(endpoint:dateUtc)`** for atomic per-day upsert. Attrs: `endpoint`(String 128, R), `dateUtc`(String 10 `YYYY-MM-DD`, R), `callCount`(Integer D=0). Index: `key:(endpoint,dateUtc)`. *(Better: move rate-limiting to Appwrite Function abuse limits / a KV; this collection is the literal port.)*

---

## 2. Tenant isolation — the runtime contract

A single server-side helper enforces isolation; nothing else touches Appwrite directly.

```ts
// lib/appwrite/scoped.ts  — used by every server action / route handler / RSC
import { auth } from '@clerk/nextjs/server'
import { Databases, Query, ID, Permission, Role } from 'node-appwrite'
import { adminClient } from './client' // holds APPWRITE_API_KEY (server only)

const TENANT_SCOPED = new Set([
  'workspace_members','workspace_invites','sales_teams','sales_team_members',
  'lead_assignments','contacts','contact_lists','contact_list_members','templates',
  'bots','conversations','inbox_messages','leads','ai_traces','campaigns',
  'customer_profiles','segments','variants','agent_logs','whatsapp_messages',
])

export async function scoped(collectionId: string) {
  const { orgId, orgRole } = await auth()          // Clerk org context
  if (!orgId) throw new Error('No active organization')
  const db = new Databases(adminClient)
  const tenant = TENANT_SCOPED.has(collectionId)

  return {
    orgId, orgRole,
    list: (queries: any[] = []) =>
      db.listDocuments('crm', collectionId,
        tenant ? [Query.equal('workspaceId', orgId), ...queries] : queries),
    create: (data: Record<string, any>, perms?: string[]) =>
      db.createDocument('crm', collectionId, ID.unique(),
        tenant ? { ...data, workspaceId: orgId } : data,
        perms ?? teamPerms(orgId)),
    get: async (id: string) => {
      const doc = await db.getDocument('crm', collectionId, id)
      if (tenant && doc.workspaceId !== orgId) throw new Error('404') // belt-and-suspenders
      return doc
    },
    // update/delete identical: getDocument → assert workspaceId === orgId → mutate
  }
}
```

Rules this enforces (matching the FastAPI `require_permission` + `workspace_id ==` filters):
1. **No query without `workspaceId == orgId`** on tenant collections.
2. **No write without stamping `workspaceId = orgId`**.
3. **Read-by-id asserts ownership** (prevents IDOR even if a stale id leaks).
4. **RBAC** (owner/admin/manager/agent/viewer) is enforced *before* `scoped()` is called, by mapping Clerk `orgRole` → the permission catalogue from `rbac.py` (`P_TEAM_MANAGE`, `P_LEADS_VIEW_ALL`, etc.). Agents additionally get `Query.equal('assignedToUserId', userId)` injected on `leads`/`conversations` (they "handle only leads assigned to them").

**Workers** (webhook/outbox/sync Functions) use the **same admin client but skip the Clerk gate** — they receive `workspaceId` from routing (`whatsapp_accounts.$id → workspaceId`) and stamp it explicitly. They bypass document permissions by API key, which is correct: system writes aren't a user session.

---

## 3. Idempotency & transactional outbox without Postgres

Postgres gave us `UniqueConstraint(provider, provider_event_id)` and `UniqueConstraint(workspace_id, idempotency_key)`. Appwrite reproduces both **atomically** via the **document-id-as-natural-key** trick, which is stronger than a unique *index* because `createDocument` with a colliding `$id` fails atomically server-side (no read-then-write race).

### 3.1 Webhook dedup (replaces `uq_webhook_provider_event`)

```ts
import { createHash } from 'crypto'
const dedupId = (provider: string, eventId: string) =>
  createHash('sha256').update(`${provider}:${eventId}`).digest('hex').slice(0, 36) // valid $id

export async function recordEvent(db, provider, eventId, payload) {
  const id = dedupId(provider, eventId)
  try {
    const ev = await db.createDocument('crm', 'webhook_events', id, {
      provider, providerEventId: eventId, payloadJson: JSON.stringify(payload),
      status: 'received',
    })
    return { ev, isDuplicate: false }
  } catch (e: any) {
    if (e.code === 409) {                          // already exists == duplicate delivery
      const ev = await db.getDocument('crm', 'webhook_events', id)
      if (ev.status === 'received')
        await db.updateDocument('crm','webhook_events', id, { status: 'ignored_duplicate' })
      return { ev, isDuplicate: true }
    }
    throw e
  }
}
```
This is a 1:1 port of `inbound._record_event`’s `IntegrityError` branch — the `409` *is* the idempotency, and Meta's at-least-once webhook retries can never create duplicate leads/replies/stage-moves.

> A unique **index** on `(provider, providerEventId)` is also created (for queryability), but the **`$id` collision is the authoritative guard** — it can't race two concurrent deliveries the way "query-then-insert against a unique index" theoretically can.

### 3.2 Transactional outbox (replaces `uq_outbox_idem` + DB transaction)

Postgres did "insert lead/message/trace **and** enqueue outbox in one transaction." Appwrite has **no multi-document transactions**, so we make enqueue **idempotent** instead of transactional, and make the worker tolerant of partial failure:

- **Enqueue** uses `$id = hash(workspaceId + ':' + idempotencyKey)` (e.g. `reply:<wamid>`, `optout:<wamid>`, `clarify:<wamid>` — exactly the keys in `inbound.py`). A retried inbound that re-runs enqueue hits `409` → no duplicate send. This is the `unique(workspace_id, idempotency_key)` guarantee.
- **Ordering for crash-safety:** persist the `inbox_messages` (outbound) row **first**, then enqueue the outbox row keyed by the deterministic idempotency key. If the function crashes between domain writes and enqueue, the *next* webhook redelivery (Meta retries) replays the whole idempotent pipeline and the deterministic ids make every step a no-op-or-complete. Net effect ≈ the original transaction’s exactly-once outcome.

```ts
export async function enqueue(db, { workspaceId, idempotencyKey, payload, ...refs }) {
  const id = createHash('sha256').update(`${workspaceId}:${idempotencyKey}`).digest('hex').slice(0,36)
  try {
    return await db.createDocument('crm','message_outbox', id, {
      workspaceId, idempotencyKey, channel:'whatsapp',
      payloadJson: JSON.stringify(payload), status:'pending',
      attempts:0, maxAttempts:5, nextAttemptAt: new Date().toISOString(), ...refs,
    })
  } catch (e:any) { if (e.code===409) return db.getDocument('crm','message_outbox', id); throw e }
}
```

### 3.3 Outbox worker (Appwrite Function on a 1-min schedule)

Replaces the Python outbox worker. Claim → send via Meta Cloud API → stamp wamid → mark sent; backoff on failure; `dead` after `maxAttempts`.

```ts
// claim a small batch atomically-enough via optimistic status flip
const due = await db.listDocuments('crm','message_outbox', [
  Query.equal('status','pending'),
  Query.lessThanEqual('nextAttemptAt', new Date().toISOString()),
  Query.limit(20),
])
for (const m of due.documents) {
  // optimistic lock: flip pending→sending; if it 409/changed, another worker took it
  try { await db.updateDocument('crm','message_outbox', m.$id, { status:'sending' }) } catch { continue }
  try {
    const { messages } = await metaSend(JSON.parse(m.payloadJson))   // WhatsApp Cloud API JS SDK
    const wamid = messages?.[0]?.id
    await db.updateDocument('crm','message_outbox', m.$id, { status:'sent', providerMessageId:wamid, sentAt:new Date().toISOString() })
    if (m.inboxMessageId) await db.updateDocument('crm','inbox_messages', m.inboxMessageId, { wamid })
  } catch (err:any) {
    const attempts = m.attempts + 1
    const dead = attempts >= m.maxAttempts
    await db.updateDocument('crm','message_outbox', m.$id, {
      status: dead ? 'dead' : 'pending', attempts,
      lastError: String(err).slice(0,2000),
      nextAttemptAt: new Date(Date.now() + Math.min(2**attempts, 64)*60_000).toISOString(), // exp backoff
    })
  }
}
```

> **Concurrency note:** Appwrite lacks `SELECT … FOR UPDATE`. The `pending→sending` optimistic flip + a short `nextAttemptAt` lease is the portable substitute; idempotent `$id` on enqueue means even a double-send claim can only ever produce one *enqueued* row, and Meta’s own message dedup (same `to`+content within a window) is a final backstop. For stricter exactly-once, stamp a `claimToken` and re-read before sending.

---

## 4. Tricky mappings (JSONB, enums, vertical stages)

| Postgres construct | Appwrite mapping | Rationale |
|---|---|---|
| `JSONB` you only read/write whole | `String(size)` named `…Json`, `JSON.stringify` | No JSON type; app (333) (de)serializes. Size set per field (8k → 1M for `state_checkpoint`). |
| `JSONB` list you filter by membership (`contacts.tags`, `segments.customer_ids`, `segment_tags`, `tags_added`) | **String[] array attribute** + array index | Appwrite can `Query.contains('tags', x)` only on array attributes, not inside a JSON string. Tag-based segmentation needs this. |
| `Enum(CampaignStatus)` (app-closed, 11 values) | Native **Enum attribute** | Closed, app-controlled set — safe. |
| Role/status/direction/category enums | Native **Enum attributes** | Closed sets. |
| `leads.status` (= pipeline **stage**) | **String(48)**, validated in code vs `pack.pipeline_stages` | The 12 vertical packs each override the stage list (coaching has `course_identified…enrolled,escalated`; universal has `new…converted,lost`). A native enum can't be per-tenant. Guards (`can_ai_update_stage`, `HARD_TERMINAL`, `REVIVE_INTENTS`) port verbatim into a TS module and run in the inbound Function. |
| `vertical` / `intent` | **String**, validated vs pack registry / `UNIVERSAL_INTENTS` | Extensible; lives in app config (`lib/verticals.ts`), not the DB. |
| `confidence` nullable Float | **Float, not required** | Preserve "honest-by-construction": deterministic path stores `null`, never a fabricated number. |
| Composite `UniqueConstraint` | Appwrite **unique index** on the same attr tuple, OR **`$id`=natural-key** for the dedup/outbox/routing tables (§3) | `$id` route is atomic + race-free; plain unique index for the rest. |
| FK + `relationship()` | Plain string FK attr + index + app-side join | Tenant-safe, matches existing id-based joins; avoids Appwrite relationship-permission pitfalls. |
| `created_at`/`updated_at` | `$createdAt`/`$updatedAt` (free) | Only keep semantic timestamps. |
| `whatsapp_accounts.access_token` raw | `accessTokenRef` → secret stored in **Function env / Appwrite secret**, not a document | Tokens must not sit queryable in a collection. |
| `api_call_logs` per-day upsert | `$id = hash(endpoint:date)` atomic upsert | Replaces `unique(endpoint, date_utc)`; better: native Function abuse limits. |
| Postgres multi-row transaction (inbound) | **Idempotent pipeline + deterministic ids + redelivery replay** (§3.2) | Appwrite has no cross-doc transactions. |

---

## 5. Bootstrap / migration script (idempotent)

`scripts/appwrite-setup.ts` — run with `node-appwrite` + a server API key. Idempotent: each create wrapped in a `409`-tolerant helper, so re-runs are safe (the "migration" story for a schemaless backend).

```ts
import { Client, Databases } from 'node-appwrite'
const db = new Databases(new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT!)
  .setKey(process.env.APPWRITE_API_KEY!))

const ok = async (p: Promise<any>) => { try { return await p } catch (e:any){ if(e.code===409) return; throw e } }
const DB = 'crm'

async function main() {
  await ok(db.create(DB, 'crm'))

  // ---- helper wrappers ----
  const S = (c:string,k:string,size:number,req=false,def?:any,arr=false) => ok(db.createStringAttribute(DB,c,k,size,req,def,arr))
  const E = (c:string,k:string,els:string[],req=false,def?:any) => ok(db.createEnumAttribute(DB,c,k,els,req,def))
  const B = (c:string,k:string,req=false,def?:any) => ok(db.createBooleanAttribute(DB,c,k,req,def))
  const I = (c:string,k:string,req=false,def?:any) => ok(db.createIntegerAttribute(DB,c,k,req,def))
  const F = (c:string,k:string,req=false) => ok(db.createFloatAttribute(DB,c,k,req))
  const D = (c:string,k:string,req=false) => ok(db.createDatetimeAttribute(DB,c,k,req))
  const idx = (c:string,k:string,type:'key'|'unique',attrs:string[],orders?:string[]) =>
    ok(db.createIndex(DB,c,k,type,attrs,orders))
  const coll = (c:string) => ok(db.createCollection(DB,c,c, /*permissions*/ undefined, /*docSecurity*/ true))

  // ---- contacts (example; repeat per collection from §1) ----
  await coll('contacts')
  await S('contacts','workspaceId',64,true)
  await S('contacts','fullName',255); await S('contacts','whatsappNumber',32,true)
  await S('contacts','email',320); await I('contacts','age'); await S('contacts','gender',32)
  await S('contacts','city',120); await S('contacts','occupationType',64); await I('contacts','monthlyIncome')
  await I('contacts','creditScore'); await S('contacts','kycStatus',8); await S('contacts','appInstalled',8)
  await S('contacts','existingCustomer',8); await S('contacts','socialMediaActive',8)
  await S('contacts','attributesJson',100000)
  await S('contacts','tags',64,false,undefined,true)           // array attribute
  await E('contacts','optInStatus',['opted_in','opted_out','unknown'],true,'unknown')
  await S('contacts','optInSource',32); await D('contacts','optInAt')
  await idx('contacts','uq_ws_wa','unique',['workspaceId','whatsappNumber'])
  await idx('contacts','ix_ws_optin','key',['workspaceId','optInStatus'])
  await idx('contacts','ix_tags','key',['tags'])

  // ... webhook_events / message_outbox / whatsapp_accounts / workspaces created with
  //     documentSecurity:true; their natural-key $id is supplied at insert time (§3),
  //     not here. Add the (provider,providerEventId) & (status,nextAttemptAt) indexes.

  // (repeat coll()+attrs+idx() for all 24 collections in §1, attribute-poll between
  //  createAttribute and createIndex since Appwrite builds attributes async)
}
main()
```

Operational notes baked into the script:
- **Attribute readiness:** Appwrite builds attributes asynchronously; the real script polls `getCollection` until `attributes[*].status === 'available'` before creating indexes that reference them.
- **`documentSecurity: true`** on every collection so per-doc Team permissions (§0 defense-in-depth) apply on top of the collection default.
- Re-runnable in CI; `409` = "already provisioned."

---

## 6. Worker & integration topology (Appwrite Functions)

| Function | Trigger | Replaces | Writes |
|---|---|---|---|
| `whatsapp-webhook` | HTTP (Meta webhook) | pywa handler + `inbound.py` | `webhook_events` (dedup §3.1) → conversations/contacts/inbox_messages/leads/ai_traces → `message_outbox` |
| `outbox-worker` | Schedule `* * * * *` | Python outbox worker | sends via Meta Cloud API SDK; stamps `inbox_messages.wamid` (§3.3) |
| `sync-worker` | Schedule (e.g. `*/15 * * * *`) | `sync_runs` jobs | reconciles message status/contacts; writes `sync_runs` |
| `clerk-webhook` | HTTP (Clerk) | n/a (new) | syncs org→`workspaces`, membership→`workspace_members` |
| `razorpay-webhook` | HTTP (Razorpay) | mock `billing.py` | updates `workspaces.plan/planStatus/razorpay*` |

All worker writes go through the **same `workspaceId`-stamping discipline** as §2, using routing-derived `workspaceId` rather than a Clerk session.

---

## 7. Deliverables checklist

- [ ] **Database** `crm` provisioned.
- [ ] **24 collections** created (§1), all tenant-scoped ones carrying `workspaceId` + `documentSecurity:true` + per-org Team permissions: `workspaces`, `workspace_members`, `workspace_invites`, `sales_teams`, `sales_team_members`, `lead_assignments`, `whatsapp_accounts`, `contacts`, `contact_lists`, `contact_list_members`, `templates`, `bots`, `conversations`, `inbox_messages`, `leads`, `ai_traces`, `webhook_events`, `message_outbox`, `sync_runs`, `campaigns`, `customer_profiles`, `segments`, `variants`, `agent_logs`, `whatsapp_messages`, `api_call_logs`.
- [ ] **Natural-key `$id`** wired for `webhook_events`, `message_outbox`, `whatsapp_accounts`, `workspaces`, `api_call_logs`.
- [ ] **Unique indexes** ported: `(workspaceId,userId)`, `(workspaceId,name)`×teams/templates, `(teamId,userId)`, `(workspaceId,whatsappNumber)`, `(listId,contactId)`, `(workspaceId)` on bots, `(workspaceId,phoneNumberId,customerWaId)`, `(conversationId)` on leads.
- [ ] **Array attributes + indexes** for `contacts.tags`, `ai_traces.tagsAdded`, `segments.customerIds`, `customer_profiles.segmentTags`.
- [ ] **Enum vs String** decisions applied (closed→Enum; vertical/intent/stage→String + pack validation in `lib/verticals.ts`).
- [ ] **JSONB→`…Json` String** fields + sizes set (incl. `stateCheckpointJson` 1M).
- [ ] **`lib/appwrite/scoped.ts`** tenant-scoping helper (Clerk org → `workspaceId`) + RBAC mapping from `rbac.py` permission catalogue.
- [ ] **Defense-in-depth:** per-org Appwrite Team created on Clerk-org-create; Team role bands mirror RBAC.
- [ ] **Idempotency** verified: duplicate webhook → `409` → `ignored_duplicate`, no dupe lead/reply (§3.1).
- [ ] **Outbox**: idempotent enqueue (`hash(workspaceId:idempotencyKey)`), worker with optimistic claim + exponential backoff + `dead` after `maxAttempts` (§3.2–3.3).
- [ ] **Inbound guards** (`is_opt_out`, `is_meaningful_text`, `can_ai_update_stage`, `HARD_TERMINAL`, `REVIVE_INTENTS`) ported to TS and invoked in `whatsapp-webhook`.
- [ ] **Functions**: `whatsapp-webhook`, `outbox-worker`, `sync-worker`, `clerk-webhook`, `razorpay-webhook` with env-stored Meta tokens (not in documents).
- [ ] **Bootstrap script** `scripts/appwrite-setup.ts` idempotent (409-tolerant, attribute-readiness polling), CI-runnable.
- [ ] **Plans/metering** (`free`/`pro`, INR via Razorpay) read from `workspaces.plan`; `sends_today`/`contact_count` reimplemented as scoped count queries (§ matches `plans.py`).

**Files referenced (authoritative):** `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/db/models.py`, `/backend/auth/rbac.py`, `/backend/auth/deps.py`, `/backend/plans.py`, `/backend/services/inbound.py`, `/backend/ai_graph/packs.py`, `/backend/ai_graph/guards.py`, `/backend/api/contacts.py`.


---

# Clerk auth, orgs & RBAC (`clerk-auth`)

I now have the complete ground truth. I'll produce the implementation-ready Clerk spec.

# Clerk Spec — Workspaces, RBAC, Invites & Switching (Next.js + Appwrite rewrite)

This maps the existing FastAPI semantics (`backend/auth/rbac.py`, `backend/auth/deps.py`, `backend/api/team.py`, `backend/api/workspaces.py`, plus `backend/api/leads.py`/`inbox.py` for assignment scoping) onto **Clerk Organizations**. Every existing guarantee is preserved and named below.

---

## 1. Domain Mapping

| Existing concept | Clerk concept | Notes |
|---|---|---|
| `Workspace` | **Organization** | One Clerk org per tenant. `org.id` is the tenant key. |
| `WorkspaceMember(role, status)` | **Organization Membership** | `membership.role` + `publicMetadata.status`. |
| `WorkspaceMember.status = disabled` | membership `publicMetadata.status="disabled"` (or removed) | Clerk has no native "disabled member"; modeled in metadata (see §4). |
| `WorkspaceInvite` (token + TTL) | **Organization Invitation** | Clerk handles email, token, 14-day-ish expiry, accept flow. |
| `switch_workspace` → new JWT `ws` claim | **Active Organization** (`setActive({ organization })`) | `auth().orgId` replaces the `ws` JWT claim. |
| `User.workspace_id` (legacy owner fallback) | Personal account / single membership | No legacy fallback needed in greenfield; see §8. |
| `User`, `Workspace` rows in Postgres | Mirrored into Appwrite via webhooks | Clerk is source of truth for identity; Appwrite holds domain data. |
| `SalesTeam` / `SalesTeamMember` / `LeadAssignment` | **Appwrite collections** | Not in Clerk — these are domain data, tenant-scoped by `orgId`. |

**Key inversion:** Authorization decisions (`has_permission`, `can_manage_role`, last-owner guard) move from a Postgres `WorkspaceMember` row read on every request to **Clerk session claims** (`auth().orgRole`, `auth().has()`), evaluated in middleware + server actions. Appwrite is the data store, not the authority for *who you are* — but it remains the authority for *which leads are assigned to you* (§7).

---

## 2. Roles → Clerk Org Roles + Permissions

Clerk org roles are `org:<key>`. Define **5 custom roles** in the Clerk Dashboard (Organizations → Roles) — `owner` and `admin` exist by default; add the rest:

| RBAC role | Clerk role key | Rank (for `can_manage_role`) |
|---|---|---|
| owner | `org:owner` | 4 |
| admin | `org:admin` | 3 |
| manager | `org:manager` | 2 |
| agent | `org:agent` | 1 |
| viewer | `org:viewer` | 0 |

Define **custom permissions** mirroring `rbac.py`'s catalogue. Clerk permission keys are `org:<feature>:<action>`:

| `rbac.py` permission | Clerk permission key |
|---|---|
| `billing.manage` | `org:billing:manage` |
| `workspace.edit` | `org:workspace:edit` |
| `workspace.delete` | `org:workspace:delete` |
| `team.manage` | `org:team:manage` |
| `campaigns.manage` | `org:campaigns:manage` |
| `templates.manage` | `org:templates:manage` |
| `settings.manage` | `org:settings:manage` |
| `contacts.manage` | `org:contacts:manage` |
| `leads.view_all` | `org:leads:view_all` |
| `leads.assign` | `org:leads:assign` |
| `reports.view` | `org:reports:view` |

**Per-role grants (exactly reproduces `ROLE_PERMISSIONS`):**

- `org:owner` → **all** permissions (Clerk: `owner` is special, holds the non-removable `org:sys_*` admin perms; assign every custom perm too so `has()` checks pass uniformly).
- `org:admin` → `team:manage, campaigns:manage, templates:manage, settings:manage, contacts:manage, leads:view_all, leads:assign, reports:view`.
- `org:manager` → `leads:view_all, leads:assign, reports:view, contacts:manage`.
- `org:agent` → **none** of the above (only assigned-lead access, enforced in Appwrite query, §7).
- `org:viewer` → `reports:view` only.

> Note: `org:billing:manage`, `org:workspace:edit`, `org:workspace:delete` are **owner-only** here, matching `has_permission(role, P_BILLING/...)` returning true only for `owner` in the original (none of admin/manager/agent/viewer were granted those in `ROLE_PERMISSIONS`).

---

## 3. `can_manage_role` + Last-Owner Guard (the rules Clerk can't express natively)

Clerk's `has({ permission: 'org:team:manage' })` reproduces the *first* check in `can_manage_role` (must hold `team.manage`). The **rank comparison** and **owner-grant restriction** and the **last-owner guard** are *not* native — they must be enforced in a server-side guard before any Clerk membership mutation. Reimplement `rbac.py` verbatim in `lib/auth/rbac.ts`:

```ts
// lib/auth/rbac.ts — 1:1 port of backend/auth/rbac.py
export const ROLE_RANK = { 'org:owner': 4, 'org:admin': 3, 'org:manager': 2, 'org:agent': 1, 'org:viewer': 0 } as const;
export type OrgRole = keyof typeof ROLE_RANK;
export const ROLES = Object.keys(ROLE_RANK) as OrgRole[];

const ROLE_PERMISSIONS: Record<OrgRole, Set<string>> = {
  'org:owner':   new Set(), // special-cased to "everything"
  'org:admin':   new Set(['org:team:manage','org:campaigns:manage','org:templates:manage','org:settings:manage','org:contacts:manage','org:leads:view_all','org:leads:assign','org:reports:view']),
  'org:manager': new Set(['org:leads:view_all','org:leads:assign','org:reports:view','org:contacts:manage']),
  'org:agent':   new Set(),
  'org:viewer':  new Set(['org:reports:view']),
};

export function hasPermission(role: OrgRole | null, perm: string): boolean {
  if (role === 'org:owner') return true;
  return !!role && ROLE_PERMISSIONS[role]?.has(perm);
}
export const canViewAllLeads = (r: OrgRole | null) => hasPermission(r, 'org:leads:view_all');
export const canAssignLeads  = (r: OrgRole | null) => hasPermission(r, 'org:leads:assign');

// Port of can_manage_role: actor may only manage at-or-below own rank; only owner touches owner.
export function canManageRole(actor: OrgRole | null, target: OrgRole | null): boolean {
  if (!hasPermission(actor, 'org:team:manage')) return false;
  if (target === 'org:owner' && actor !== 'org:owner') return false;
  return (ROLE_RANK[actor!] ?? -1) >= (ROLE_RANK[target!] ?? 99);
}
```

**Last-owner guard** (ports `_active_owner_count` checks in `update_member`/`remove_member`). Clerk *does* protect against removing the last member with the `org:sys_memberships` admin permission, but **not** against demoting/disabling the last *owner* specifically. Enforce it by counting owners via Clerk Backend API before the mutation:

```ts
// lib/auth/guards.ts
import { clerkClient } from '@clerk/nextjs/server';

async function activeOwnerCount(orgId: string, excludeUserId?: string): Promise<number> {
  const cc = await clerkClient();
  let count = 0, offset = 0;
  for (;;) {
    const page = await cc.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100, offset });
    for (const m of page.data) {
      const status = (m.publicMetadata?.status as string) ?? 'active';
      if (m.role === 'org:owner' && status === 'active' && m.publicUserData?.userId !== excludeUserId) count++;
    }
    if (page.data.length < 100) break;
    offset += 100;
  }
  return count;
}

// Throws (-> 400) if the mutation would leave zero active owners. Mirrors team.py.
export async function assertNotLastOwner(orgId: string, targetUserId: string, targetRole: OrgRole) {
  if (targetRole !== 'org:owner') return;
  if ((await activeOwnerCount(orgId, targetUserId)) === 0) {
    throw new GuardError(400, 'A workspace must keep at least one owner.');
  }
}
```

Call `canManageRole` + `assertNotLastOwner` inside the **server actions** that wrap Clerk's `updateOrganizationMembership` / `deleteOrganizationMembership` (§5).

---

## 4. Disabled Members (the `status="disabled"` rule)

Original (`deps.py` lines 65–67): a membership with `status="disabled"` → **403 on every request**, but the row is *kept* (re-enablable, and they still appear in `list_members`). Clerk has no "disabled but present" state, so model it with membership `publicMetadata.status`:

- `PATCH .../members/{id}` with `status: "disabled"` → set `publicMetadata.status = "disabled"` on the Clerk membership (do **not** remove). Run `assertNotLastOwner` first if the target is the last active owner (ports lines 165–166).
- **Enforcement** runs in middleware + `requireAuthContext` (§6): if active org membership `status === "disabled"`, reject with 403 "Your access to this workspace is disabled." This must be checked on **every** protected request because Clerk will otherwise happily authorize a disabled-but-present member.
- Sync to Appwrite (§9): disabled members are mirrored with `status="disabled"` so domain queries (e.g. assignable-agent lists) can exclude them.

> `status="invited"` from the original model is no longer needed — Clerk Invitations own the pending state (§5). Statuses reduce to `active | disabled`.

---

## 5. Invites → Clerk Organization Invitations + Switch → Active Organization

### Invites
Replace `WorkspaceInvite` + raw-token endpoints entirely with **Clerk Organization Invitations** (Clerk sends the email, owns token + expiry + accept page). Preserve the original's *authorization* checks in a server action wrapping `createOrganizationInvitation`:

```ts
// app/team/actions.ts
'use server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { canManageRole, ROLES, type OrgRole } from '@/lib/auth/rbac';

export async function inviteMember(input: { email: string; role: OrgRole }) {
  const { userId, orgId, orgRole, has } = await auth.protect();          // 401 if signed out
  if (!has({ permission: 'org:team:manage' })) throw new GuardError(403, 'No permission.'); // ports require_permission(P_TEAM_MANAGE)

  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new GuardError(400, 'A valid email is required.');
  if (!ROLES.includes(input.role)) throw new GuardError(400, 'Invalid role.');
  // ports can_manage_role: cannot invite at/above your own role
  if (!canManageRole(orgRole as OrgRole, input.role))
    throw new GuardError(403, "You can't invite a member at or above your own role.");

  const cc = await clerkClient();
  // Clerk returns 4xx if the email is already a member -> maps to the original 409.
  return cc.organizations.createOrganizationInvitation({
    organizationId: orgId!, inviterUserId: userId, emailAddress: email, role: input.role,
  });
}
```

- **Accept** is handled by Clerk's hosted `<OrganizationProfile>` / accept flow — no custom `/accept` endpoint. The original's email-match check (`accept_invite` line 123) is enforced by Clerk natively (invitation is bound to the email).
- **Listing pending invites** (`GET /team/invites`, gated on `team.manage`): server-fetch `getOrganizationInvitationList({ status: ['pending'] })` inside a component/loader guarded by `has({ permission: 'org:team:manage' })`.
- **Revoke**: `revokeOrganizationInvitation` behind the same guard.
- *Hybrid option (optional):* if you need self-serve magic links without email infra (the original returned a raw token), generate a Clerk invitation and surface its `url`/ticket to the inviter. Default to Clerk-sends-email.

### Switch
Replace `POST /workspaces/{id}/switch` (which minted a new JWT with a different `ws` claim) with Clerk **active organization**:

```tsx
// client
const { setActive } = useOrganizationList();
await setActive({ organization: orgId }); // Clerk validates membership; refreshes session -> auth().orgId
```

`auth().orgId` now plays the role of the old `ws` claim — but Clerk **server-side verifies membership** before allowing the switch, so the original "403 if not a member" in `_resolve_membership` is automatic. **Workspace create** (`POST /workspaces`) → `createOrganization({ name })`; the creator is `org:owner` automatically (ports `WorkspaceMember(..., role="owner")` on create). Persist `vertical`/`plan` to org `publicMetadata` and mirror to Appwrite via the `organization.created` webhook (§9).

---

## 6. Protected Routes & Server Actions (middleware + `requirePermission`)

### `middleware.ts` — coarse gate (auth + org-selected + disabled check)

```ts
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublic   = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/api/webhooks(.*)', '/accept(.*)']);
const needsOrg   = createRouteMatcher(['/(app)(.*)', '/api/(.*)']); // everything tenant-scoped

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId, orgId, sessionClaims } = await auth();
  if (!userId) return auth().redirectToSignIn();

  if (needsOrg(req)) {
    if (!orgId) return NextResponse.redirect(new URL('/select-workspace', req.url)); // no active org
    // Disabled-member gate (status surfaced into the JWT via a session-token claim, see below).
    if (sessionClaims?.org_status === 'disabled')
      return new NextResponse('Workspace access disabled', { status: 403 });
  }
});

export const config = { matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'] };
```

To make `org_status` available without a Backend-API call per request, add a **session token customization** in Clerk (Dashboard → Sessions → Customize): `{"org_status": "{{org_membership.public_metadata.status}}"}`. Falls back to the `requireAuthContext` Backend-API check if absent.

### `lib/auth/context.ts` — the `AuthContext` equivalent (ports `get_auth_context`)

```ts
// lib/auth/context.ts
import { auth } from '@clerk/nextjs/server';
import type { OrgRole } from './rbac';

export type AuthContext = { userId: string; orgId: string; role: OrgRole; status: 'active' | 'disabled' };

export async function requireAuthContext(): Promise<AuthContext> {
  const { userId, orgId, orgRole, sessionClaims } = await auth();
  if (!userId) throw new GuardError(401, 'Invalid or expired token');
  if (!orgId)  throw new GuardError(401, 'Workspace not found');                 // ~ no ws claim
  const status = (sessionClaims?.org_status as 'active' | 'disabled') ?? 'active';
  if (status === 'disabled') throw new GuardError(403, 'Your access to this workspace is disabled');
  return { userId, orgId, role: orgRole as OrgRole, status };
}
```

### `requirePermission` helper (ports `auth.deps.require_permission`)

```ts
// lib/auth/require.ts
import { requireAuthContext } from './context';
import { hasPermission } from './rbac';

export async function requirePermission(permission: string): Promise<AuthContext> {
  const ctx = await requireAuthContext();
  if (!hasPermission(ctx.role, permission))   // could also use Clerk has({permission}); kept rbac.ts as single source
    throw new GuardError(403, "You don't have permission to perform this action");
  return ctx;
}
```

Usage in a server action / route handler — every mutation calls one guard at the top, exactly like the FastAPI `Depends(require_permission(...))`:

```ts
'use server';
export async function updateWorkspace(input: { name?: string; vertical?: string }) {
  const ctx = await requirePermission('org:workspace:edit');   // ports workspaces.py PUT guard
  // ...validate vertical against VERTICAL_PACKS, write to Appwrite + org publicMetadata...
}
```

For **role/membership mutations** combine all three layers (ports `update_member`/`remove_member` fully):

```ts
'use server';
export async function changeMemberRole(input: { targetUserId: string; role: OrgRole }) {
  const ctx = await requirePermission('org:team:manage');
  const cc  = await clerkClient();
  const target = await getMembership(cc, ctx.orgId, input.targetUserId);
  if (!canManageRole(ctx.role, target.role as OrgRole))                       // rank guard
    throw new GuardError(403, "You can't manage a member at or above your own role.");
  if (!canManageRole(ctx.role, input.role))                                   // target-role guard
    throw new GuardError(403, "You can't assign a role at or above your own.");
  if (target.role === 'org:owner' && input.role !== 'org:owner')
    await assertNotLastOwner(ctx.orgId, input.targetUserId, 'org:owner');     // last-owner guard
  await cc.organizations.updateOrganizationMembership({
    organizationId: ctx.orgId, userId: input.targetUserId, role: input.role });
  // Appwrite sync happens via the organizationMembership.updated webhook (§9).
}
```

---

## 7. Lead-Assignment Authorization (agent sees only assigned)

This is **domain data in Appwrite**, not Clerk — but the *role* that drives it comes from `ctx.role`. Port `leads.py` (lines 89–103) and `inbox.py` (line 76):

- Rule: if **not** `canViewAllLeads(role)` **and** role ≠ `viewer` → scope to `assigned_to_user_id == me` OR `assigned_to_team_id ∈ my_teams`. Viewers see the whole pipeline read-only (dashboard role). owner/admin/manager see all.

Express it as an Appwrite query builder applied on the server (the query itself is the enforcement — never trust the client):

```ts
// lib/leads/scope.ts
import { Query } from 'node-appwrite';
import { canViewAllLeads } from '@/lib/auth/rbac';

export async function leadScopeQueries(ctx: AuthContext): Promise<string[]> {
  const base = [Query.equal('workspace_id', ctx.orgId)];                 // tenant isolation — ALWAYS
  if (canViewAllLeads(ctx.role) || ctx.role === 'org:viewer') return base;
  const teamIds = await teamIdsForUser(ctx.orgId, ctx.userId);          // sales_team_members collection
  base.push(Query.or([
    Query.equal('assigned_to_user_id', ctx.userId),
    ...(teamIds.length ? [Query.equal('assigned_to_team_id', teamIds)] : []),
  ]));
  return base;
}
```

- **Assignment mutations** (`/leads/{id}/assign`, `/unassign`, inbox claim) are gated by `requirePermission('org:leads:assign')` — i.e. owner/admin/manager only. The append-only `LeadAssignment` audit trail becomes an Appwrite collection: on reassign, mark prior active row `reassigned` and insert a new `active` row (ports `leads.py` 148–156).
- `workspace_id == orgId` filter on **every** Appwrite query is the multi-tenant isolation boundary (replaces the implicit `Lead.workspace_id == ctx.workspace.id` everywhere). Enforce with Appwrite document-level permissions keyed to the org **and** the explicit query filter (defense in depth).

---

## 8. Clerk → Appwrite Sync (webhooks)

Clerk is the source of truth for identity/tenancy; Appwrite must always have matching tenant records so domain queries and joins work. Configure a **Clerk webhook endpoint** `POST /api/webhooks/clerk` (Svix-signed) subscribed to:

| Clerk event | Appwrite action (collections: `workspaces`, `users`, `workspace_members`) |
|---|---|
| `user.created` / `user.updated` | upsert `users` doc (id = Clerk `user.id`, email, full_name). |
| `user.deleted` | soft-delete / tombstone `users` doc; null out `assigned_to_user_id` on their leads (ports `sales_teams.py` cleanup pattern). |
| `organization.created` | upsert `workspaces` doc (id = `org.id`, name, `vertical`/`plan` from `publicMetadata`); seed default `Bot` doc. |
| `organization.updated` | update `workspaces` (name, vertical, plan). |
| `organization.deleted` | cascade-delete tenant docs where `workspace_id == org.id`. |
| `organizationMembership.created` | upsert `workspace_members` (workspace_id=org.id, user_id, role, status=`active`). |
| `organizationMembership.updated` | update role + `status` (from `publicMetadata.status`). |
| `organizationMembership.deleted` | delete `workspace_members` row; null assignments on that user's leads. |
| `organizationInvitation.*` | optional: mirror pending invites for an in-app list (Clerk's API is also fine as the source). |

**Idempotency** (required — Svix retries):
1. Verify the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`) with `CLERK_WEBHOOK_SECRET` — reject unsigned.
2. De-dup on `svix-id` using an Appwrite `webhook_events` collection with a **unique index** on `event_id` (mirrors the existing `webhook_events` idempotency table). Insert-or-skip: if the id already exists, ack 200 and no-op.
3. All writes are **upserts keyed by Clerk ids** (`user.id`, `org.id`, membership composite `org.id+user.id`) — so even if de-dup is bypassed, re-applying the same event converges. Unique index on `(workspace_id, user_id)` for `workspace_members` (ports `uq_workspace_member`).
4. Use event ordering tolerance: if a `membership.created` arrives before its `organization.created`, upsert a stub `workspaces` doc first (or queue/retry). Return 2xx only after the Appwrite write commits so Svix stops retrying.

```ts
// app/api/webhooks/clerk/route.ts (sketch)
import { Webhook } from 'svix';
export async function POST(req: Request) {
  const payload = await req.text();
  const evt = new Webhook(process.env.CLERK_WEBHOOK_SECRET!).verify(payload, svixHeaders(req)) as ClerkEvent;
  if (await alreadyProcessed(evt.id /* svix-id */)) return new Response('ok', { status: 200 });
  await applyToAppwrite(evt);          // upsert, keyed by Clerk ids
  await markProcessed(evt.id);
  return new Response('ok', { status: 200 });
}
```

> A heavier `applyToAppwrite` (e.g. cascade deletes) can be offloaded to an **Appwrite Function** triggered by a queue doc, keeping the webhook handler fast and within Clerk's timeout.

---

## 9. Edge Cases Preserved from the Original

- **Legacy owner fallback** (`deps.py` 69–71, `workspaces.py` 48–49): not portable/needed in greenfield (Clerk membership is mandatory). For data migration, backfill a `org:owner` Clerk membership for every legacy `User.workspace_id` so no one relies on the fallback.
- **`create_access_token` convenience token** on workspace create/switch: replaced by `setActive` refreshing the Clerk session — no token minting in app code.
- **`viewer` sees all leads but read-only** (`leads.py` 90–91): preserved — `viewer` bypasses the assigned-only scope but holds only `reports:view`, so all mutating server actions reject it.
- **owner-only billing/workspace-delete**: `org:billing:manage`, `org:workspace:edit`, `org:workspace:delete` granted to owner only — matches `ROLE_PERMISSIONS` exactly.

---

## 10. Deliverables Checklist

**Clerk Dashboard**
- [ ] Enable Organizations; set "force select org" / `<OrganizationSwitcher>` in the app shell.
- [ ] Create roles `org:manager`, `org:agent`, `org:viewer` (owner/admin exist).
- [ ] Create 11 custom permissions (`org:billing:manage` … `org:reports:view`); assign per-role grants per §2.
- [ ] Session token customization: add `org_status` claim from `org_membership.public_metadata.status`.
- [ ] Create webhook endpoint → `/api/webhooks/clerk`; subscribe to user/org/membership/invitation events; copy signing secret.

**Code**
- [ ] `lib/auth/rbac.ts` — 1:1 port of `rbac.py` (`ROLE_RANK`, `ROLE_PERMISSIONS`, `hasPermission`, `canManageRole`, `canViewAllLeads`, `canAssignLeads`).
- [ ] `lib/auth/context.ts` — `requireAuthContext` (disabled-member 403, no-org 401).
- [ ] `lib/auth/require.ts` — `requirePermission(permission)`.
- [ ] `lib/auth/guards.ts` — `activeOwnerCount` + `assertNotLastOwner` (last-owner guard).
- [ ] `middleware.ts` — `clerkMiddleware`: public matcher, org-required redirect, disabled-status gate.
- [ ] `app/team/actions.ts` — server actions: `inviteMember`, `revokeInvite`, `changeMemberRole`, `setMemberStatus` (disable/enable), `removeMember` — each wrapping Clerk Backend API with `requirePermission` + `canManageRole` + `assertNotLastOwner`.
- [ ] `app/workspace/actions.ts` — `createWorkspace` (createOrganization), `updateWorkspace` (`org:workspace:edit`, validate vertical against the 12 packs). Switch is client `setActive`.
- [ ] `lib/leads/scope.ts` — `leadScopeQueries` (agent assigned-only; viewer/all-roles full) + `teamIdsForUser`.
- [ ] `app/api/webhooks/clerk/route.ts` — Svix verify + `webhook_events` idempotency + keyed upserts.
- [ ] Appwrite collections: `users`, `workspaces`, `workspace_members` (unique `workspace_id+user_id`), `sales_teams`, `sales_team_members` (unique `team_id+user_id`), `lead_assignments`, `webhook_events` (unique `event_id`); document-level permissions scoped by org.
- [ ] (Optional) Appwrite Function for heavy cascade syncs triggered from the webhook.

**Tests** (port `backend/tests/test_edge_cases.py` / `test_vertical_transitions.py` intent)
- [ ] `canManageRole`: agent cannot invite/manage at-or-above; non-owner cannot touch owner.
- [ ] Last-owner: demote/disable/remove last active owner → blocked.
- [ ] Disabled member → 403 on protected routes; still listed in members.
- [ ] Agent lead scope: sees only own + team leads; viewer sees all but cannot mutate.
- [ ] Webhook idempotency: same `svix-id` twice → single Appwrite mutation.
- [ ] Switch to non-member org → rejected by Clerk `setActive`.

---

### Files read for ground truth (absolute paths)
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/auth/rbac.py`
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/auth/deps.py`
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/team.py`
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/workspaces.py`
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/leads.py` (lead scope, lines 85–109; assign/unassign 148–195)
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/inbox.py` (restricted scope, line 76)
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/db/models.py` (`WorkspaceMember` 68–80, `WorkspaceInvite` 87–99, `SalesTeam`/`SalesTeamMember` 105–130, `LeadAssignment` 138–147, `Lead` 315–332)


---

# Meta WhatsApp pipeline & AI graph port (`whatsapp`)

Now I have full ground truth. Producing the implementation-ready spec.

```markdown
# WhatsApp + AI Graph — Rewrite Spec (Next.js + Appwrite + Clerk + Meta Cloud API)

This ports `backend/services/inbound.py`, `backend/ai_graph/*`, and `backend/tools/outbox.py` to the target stack with **byte-for-byte behavioral parity** on the deterministic path. The Python is the source of truth; every guard, intent rule, stage map, and idempotency key below is taken verbatim from it.

---

## 1. Inbound Webhook — Next.js Route Handler

### 1.1 File & route

```
app/api/webhooks/whatsapp/route.ts        # GET verify + POST events
lib/whatsapp/verify.ts                    # signature + challenge
lib/whatsapp/parse.ts                     # Meta payload -> normalized event(s)
lib/inbound/process.ts                    # port of process_inbound_message (the heart)
```

Webhook URL registered in Meta: `https://<host>/api/webhooks/whatsapp`. **Node runtime, not Edge** (`export const runtime = "nodejs"`) — we need the raw body for HMAC and the Appwrite node SDK.

### 1.2 GET — verification challenge

Meta sends `?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.

```ts
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" &&
      p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}
```

### 1.3 POST — signature verification (do this BEFORE parsing JSON)

Read the **raw** body once (`await req.text()`), verify Meta's `X-Hub-Signature-256: sha256=<hex>` against `APP_SECRET` with HMAC-SHA256, timing-safe compare. This has no equivalent in the Python (the simulator didn't sign) and is the one genuinely new security requirement.

```ts
import crypto from "crypto";
export function verifyMetaSignature(raw: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  const got = header.slice("sha256=".length);
  const a = Buffer.from(expected), b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### 1.4 POST handler contract — return 200 fast

Meta retries on any non-2xx and disables the webhook after sustained failures. So: verify signature → parse → **enqueue work / process synchronously but always 200** unless the signature itself is bad (then 403). A per-message failure must NOT fail the whole HTTP response (mirrors `inbound.py`, which records the event `failed` and re-raises only inside the worker, never to the provider). Meta batches multiple messages per POST (`entry[].changes[].value.messages[]`), so loop and process each independently.

```ts
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET!))
    return new Response("bad signature", { status: 403 });

  const body = JSON.parse(raw);
  const events = parseInboundEvents(body); // -> NormalizedInboundEvent[]
  for (const ev of events) {
    try { await processInboundMessage(ev); }
    catch (e) { logger.error("inbound failed", { id: ev.providerEventId, e }); }
  }
  return new Response("ok", { status: 200 }); // always 200 to Meta
}
```

### 1.5 Normalized event (provider-agnostic, mirrors `process_inbound_message` kwargs)

```ts
export interface NormalizedInboundEvent {
  provider: "whatsapp_cloud";
  providerEventId: string;      // = WhatsApp message id (wamid). Dedup key.
  phoneNumberId: string | null; // value.metadata.phone_number_id -> tenant routing
  waId: string;                 // contacts[0].wa_id / messages[].from
  name: string | null;          // contacts[0].profile.name
  text: string | null;          // messages[].text.body; null for media/unsupported
  rawPayload: unknown;
}
```

`parseInboundEvents` also drops **status callbacks** (`value.statuses[]` — sent/delivered/read) here, not in the processor; those update outbox/inbox delivery state but are not "inbound messages."

### 1.6 `processInboundMessage` — exact port of `inbound.py`

Appwrite has no SQL transactions or `begin_nested` savepoints. Parity is achieved with **unique-index conflicts as the idempotency primitive** (same role the Python's `IntegrityError`/SAVEPOINT plays) plus careful ordering. Steps, in order, matching the Python 1:1:

| # | Python behavior | Appwrite port |
|---|---|---|
| 1 | `_record_event`: insert `webhook_events(provider, provider_event_id)`; duplicate → return `ignored_duplicate` | `webhook_events` collection with **unique index `(provider, providerEventId)`**. `createDocument` with `documentId = hash(provider+providerEventId)`. On `409 Conflict` → it's a duplicate; if existing status `received` flip to `ignored_duplicate`; return early. **This is the dedup gate — must be first.** |
| 2 | `_route_workspace_id` by `phone_number_id` | Query `whatsapp_accounts` where `phoneNumberId == ev.phoneNumberId`; `tenantId = doc.tenantId`. None → mark event `failed`/`no_workspace`, return. |
| 3 | Upsert conversation + contact; `customer_name`, `last_inbound_at=now`, `unread=true`, `status="open"`; normalize phone (`\D` stripped) for contact match | Query/`create` `conversations` on `(tenantId, phoneNumberId, customerWaId)` (unique index). Contact matched on normalized `whatsappNumber`. `normalizePhone(s)` = `s.replace(/\D/g, "") || s`. |
| 4 | **Opt-out short-circuit**: `is_opt_out(text)` → contact `opted_out`, store inbound + `OPT_OUT_REPLY`, enqueue with key `optout:<id>`, return | Identical. `idempotencyKey = "optout:" + providerEventId`. |
| 4b | Else mark `opted_in` (set `opt_in_source`/`opt_in_at` if unset) | Identical. |
| 5 | **Edge case**: `!is_meaningful_text(text)` → store inbound (`text or "[unsupported message]"`), and **only if** `convo.auto_reply && (bot.enabled ?? true)` enqueue `CLARIFY_REPLY` key `clarify:<id>`, return | Identical. Note the auto_reply+bot gate on the clarify send. |
| 6 | Store inbound text; campaign attribution (`WhatsAppMessage.replied`) | Store `inbox_messages`. Campaign attribution: query latest `campaign_sends` for `waId`, set `replied=true` if unreplied. |
| 7 | Lead capture: get/create `Lead` on `conversation_id`; `stage_before=lead.status`; `lead.intent=intent.lower()`; `details=text[:500]`; compute `proposed=_stage_for(...)`; if `can_ai_update_stage(...)` set it; add tag `intent.lower()` (dedup-ordered) | Identical. Tag dedup = `[...new Set([...tags, tag])]`. |
| 8 | Ownership: `ai_owned = convo.auto_reply && bot_enabled`; `human_owned = !ai_owned` | Identical. |
| 9 | If `ai_owned`: build `history` (all msgs asc), `run_message_graph(...)`; if `extracted_fields` overwrite `details`; if `handoff` → `convo.auto_reply=false`, `lead.needs_human=true`; store outbound (`sender = handoff ? "agent":"bot"`); enqueue key `reply:<id>` | Identical. |
| 10 | **Always** write `ai_trace` (even human-owned; `next_action="human_takeover"`, fields from `extract_lead_fields` fallback) | Identical, into `ai_traces`. |
| 11 | Mark event `processed`/`processed_at`; return result dict | Identical. |

**Idempotency keys (verbatim from Python):** `optout:<id>`, `clarify:<id>`, `reply:<id>`, where `<id> = providerEventId`. These plus the outbox unique index guarantee at-most-once sends across Meta retries.

**Atomicity caveat to document explicitly:** without ACID transactions, a crash mid-`processInboundMessage` can leave partial writes. Mitigations: (a) the step-1 event row is the dedup guard, so a Meta retry re-runs and the get-or-create steps are idempotent on their unique keys; (b) enqueue is idempotent on `idempotencyKey`; (c) write the `ai_trace` and flip event→`processed` **last**. A replay is safe because every create is "get-or-create on a unique key."

---

## 2. AI Graph + 12 Packs + Guards → TypeScript (`lib/ai-graph`)

Pure, dependency-light, deterministic. The LLM is **optional polish only** and every node has the existing deterministic fallback.

### 2.1 Module structure

```
lib/ai-graph/
  index.ts          # runMessageGraph (orchestrator) + re-exports
  intent.ts         # classifyIntent, _INTENT_RULES, _POSITIVE, _hasKeyword
  extract.ts        # extractLeadFields (heuristics + optional LLM)
  decide.ts         # decideAction, stageFor
  respond.ts        # generateResponse (template selection + optional LLM polish)
  guards.ts         # isOptOut, isMeaningfulText, canAiUpdateStage, HARD_TERMINAL, REVIVE_INTENTS
  packs/
    index.ts        # VERTICAL_PACKS, getPack, listVerticals, basePack(), UNIVERSAL_*
    custom.ts coaching.ts clinic.ts realEstate.ts salon.ts ecommerce.ts
    b2b.ts travel.ts politicalParty.ts restaurant.ts gym.ts automobile.ts insurance.ts
  llm/
    client.ts       # provider-agnostic chat() -> string | null (NEVER throws)
  types.ts          # VerticalPack, Intent, GraphResult, etc.
  __tests__/        # port of test_edge_cases / test_vertical_transitions
```

`GRAPH_VERSION = "0.6.1"` (constant, stamped on every trace — keep it in sync when logic changes).

### 2.2 Key types

```ts
export type Intent =
  | "NEW_LEAD" | "FOLLOW_UP_REPLY" | "PRICE_QUERY" | "BOOKING_QUERY"
  | "SUPPORT_QUERY" | "COMPLAINT" | "PAYMENT_QUERY" | "RESCHEDULE"
  | "CANCEL" | "NOT_INTERESTED" | "OPT_OUT" | "HUMAN_REQUEST" | "UNKNOWN";

export type NextAction = "reply" | "handoff" | "stop";

export interface PackRules {
  require_human_for: string[];
  forbidden_claims: string[];
  compliance_notes: string[];
}

export interface VerticalPack {
  vertical: string;
  label: string;
  lead_fields: string[];
  pipeline_stages: string[];
  intents: string[];
  qualification_questions: string[];
  templates: {
    greeting: string; price_reply: string; follow_up: string;
    lost_lead: string; booking_confirmation: string; handoff: string;
  };
  tools: string[];
  rules: PackRules;
  stage_hints: Partial<Record<Intent, string[]>>;
  keyword_stage_hints: Record<string, string[]>;
  analytics: { conversion_event: string; important_metrics: string[]; buyer_kpis?: string[] };
  // optional pack-specific extras carried as-is (typed loosely):
  coaching_catalog?: Record<string, string[]>;
  inclusion_policy?: Record<string, unknown>;
}

export interface GraphResult {
  vertical: string;
  intent: Intent;
  confidence: number | null;          // ALWAYS null — deterministic classifier
  confidence_source: "deterministic";
  extracted_fields: Record<string, string>;
  next_action: NextAction;
  handoff: boolean;
  handoff_reason: string | null;
  stage_hint: string | null;
  tags: string[];
  response: string;
  fallback_used: boolean;             // true when no LLM polish was applied
  model_used: string | null;
  graph_version: string;              // GRAPH_VERSION
}
```

### 2.3 Deterministic behavior to preserve EXACTLY

- **`_hasKeyword`** — the safe matcher. For a keyword matching `/^[a-z0-9]+$/`, use a word-boundary-ish regex `(?<![a-z0-9])kw(?![a-z0-9])` (so `sc`/`st` don't match inside `street`/`worst`); otherwise plain substring. Port byte-for-byte; this is load-bearing for the political_party pack.
- **`classifyIntent`** — iterate `_INTENT_RULES` in order, return first match at `0.75`; else `_POSITIVE` → `NEW_LEAD@0.55`; else `UNKNOWN@0.3`. Note `PAYMENT_QUERY` appears **twice** in the rules (`["payment", ...]` and later `["pay "]`) and the duplicate ordering matters — keep both entries in the same positions.
- **`stageFor`** — order: `keyword_stage_hints` (only stages in `pipeline_stages`) → pack `stage_hints[intent]` substring-against-stage → the hardcoded `wanted` map by intent → `null`.
- **`decideAction`** — `handoff = intent ∈ {COMPLAINT, HUMAN_REQUEST}` OR any `require_human_for` keyword matches via `_hasKeyword`; `next_action = handoff ? "handoff" : intent==="OPT_OUT" ? "stop" : "reply"`; reason strings preserved verbatim.
- **`generateResponse`** — the if/elif ladder selecting the template by intent (handoff → `templates.handoff`; `PRICE_QUERY` → `price_reply`; `BOOKING_QUERY`/`RESCHEDULE` → ``Sure — happy to help with that. ${q[0]}``; `CANCEL`/`PAYMENT_QUERY`/`NOT_INTERESTED`/`FOLLOW_UP_REPLY`/`SUPPORT_QUERY` literals; else `greeting`). SUPPORT_QUERY uses `kb.slice(0,300)` when KB present.
- **`runMessageGraph`** returns `confidence: null`, `confidence_source: "deterministic"` always (the classifier is rule-based and has no calibrated probability — preserve this contract; the trace stores NULL).

### 2.4 Guards (`guards.ts`) — exact port

```ts
export const HARD_TERMINAL = new Set([
  "won","enrolled","converted","closed","booked","ordered","po_received",
  "travelled","served","fulfilled","consulted","visited","resolved",
]);
export const REVIVE_INTENTS = new Set<Intent>([
  "PRICE_QUERY","BOOKING_QUERY","NEW_LEAD","PAYMENT_QUERY","RESCHEDULE",
]);
```

`canAiUpdateStage(current, proposed, pack, { humanOwned, intent })`: blocks no-op/equal, `humanOwned`, `current ∈ HARD_TERMINAL`, `current==="lost"` unless `intent ∈ REVIVE_INTENTS`, and backward regression (`stages.indexOf(proposed) < stages.indexOf(current)` when both in `pipeline_stages`). `isOptOut` and `isMeaningfulText` ported verbatim (incl. `_OPTOUT_EXACT` whole-message set and `_OPTOUT_PHRASES` substring list).

### 2.5 Where the LLM polish goes — and graceful degradation

Two seams only, both already isolated in the Python (`_llm_response`, `_llm_extract`):

1. **`respond.ts`** — after choosing the deterministic `base` template, call `llm.chat(...)` to rewrite it in the vertical persona (system prompt built from `pack.label`, `intent`, the template as style reference, `kb.slice(0,1500)`, `forbidden_claims`, `compliance_notes`, last 6 history turns). On any success → `{response: polished, fallback_used:false, model_used:<MODEL>}`; on `null`/throw/timeout → `{response: base, fallback_used:true, model_used:null}`.
2. **`extract.ts`** — optional JSON field extraction over `pack.lead_fields`, merged onto the regex budget heuristic. Failure → just the heuristic.

**Contract:** `lib/ai-graph/llm/client.ts` exports `async chat(messages): Promise<string|null>` that **never throws** — wrap the provider call in try/catch, enforce a short `AbortController` timeout, return `null` on anything. The Python used Ollama via env (`OLLAMA_MODEL`, `OLLAMA_BASE_URL`); in the rewrite this is a thin provider-agnostic adapter (env-driven base URL/model/key). If `LLM_ENABLED` is unset/false or the call fails, the graph runs **fully deterministic** and identical to today. The graph must be import-safe and runnable with **zero** LLM env configured.

> Provider note: an Anthropic Claude adapter (Messages API) is a drop-in for the polish/extract seams if you later swap off Ollama — same `chat()` contract, set `model_used` to the model id. Keep it behind the same `chat()` so degradation behavior is unchanged.

---

## 3. Outbound Sends + Transactional Outbox (Appwrite Function worker)

### 3.1 Sender — official Meta Cloud API JS SDK

`lib/whatsapp/send.ts` wraps the official WhatsApp Cloud API client: `POST /{PHONE_NUMBER_ID}/messages` with `{messaging_product:"whatsapp", to, type:"text", text:{body}}`, bearer `WHATSAPP_ACCESS_TOKEN`. Returns the provider message id (`messages[0].id`) — the analogue of `wa_provider.send_text`'s `pmid`. The `payload.sender` field carries the `phoneNumberId`, so a multi-tenant worker selects the right WABA sender per row.

### 3.2 Outbox collection (`message_outbox`)

Fields mirror `MessageOutbox`: `tenantId, contactId, conversationId, inboxMessageId, channel, payload{to,text,sender}, idempotencyKey, status(pending|sending|failed|sent|dead), attempts, maxAttempts(default 5), nextAttemptAt, providerMessageId, sentAt, lastError, createdAt`. **Unique index `(tenantId, idempotencyKey)`** = the at-most-once guarantee. `enqueue` (in `lib/outbox/enqueue.ts`, called from the inbound processor) is get-or-create on that key: try `createDocument`, on 409 fetch & return existing (exact port of the `IntegrityError` branch).

### 3.3 Worker — there is no always-on Python process

Implement `process_outbox` as an **Appwrite Function** triggered by a **schedule** (CRON, e.g. every minute) — the replacement for the Python worker loop. Logic ports `process_outbox` exactly:

1. Query due rows: `status ∈ {pending, failed}` AND `attempts < maxAttempts` AND (`nextAttemptAt == null` OR `nextAttemptAt <= now`), ordered `createdAt asc`, `limit 25`.
2. Per row: set `sending`, `attempts += 1`, persist. Call `send.ts`.
3. Success → `status=sent`, `providerMessageId=pmid`, `sentAt=now`, `lastError=null`; backfill `inbox_messages.wamid = pmid` if empty.
4. Failure → if `attempts >= maxAttempts` set `dead` (log); else `failed` with `nextAttemptAt = now + min(300, 2**attempts)s` (exponential backoff capped at `MAX_BACKOFF_SECONDS=300`, verbatim).

**Concurrency claim** (Appwrite functions can overlap; the Python relied on a single loop): make `pending→sending` a guarded update (Appwrite optimistic concurrency / conditional update on current status) so two overlapping runs can't double-send the same row. Keep `limit` small. Idempotency on the send key is the backstop.

```
functions/outbox-worker/      # CRON every 1 min, drains due rows (process_outbox port)
functions/whatsapp-sync/      # optional: reconcile status callbacks -> sent/read (sync_runs port)
```

> Status callbacks (`value.statuses[]`) from §1.5: a small handler (or the same webhook) maps `providerMessageId → inbox_messages` and updates delivery state. Optional for parity but recommended.

---

## 4. Local-Dev Story (replaces the pywa simulator)

Three pieces:

1. **Mock sender.** `WHATSAPP_MOCK_SEND=1` makes `send.ts` skip the real API, log the payload, and return a fake `mock-<uuid>` id. The outbox worker then runs end-to-end with no Meta credentials — same role as the old local simulator's send side.
2. **Inject inbound events.** A dev-only route `app/api/dev/inject/route.ts` (guarded by `NODE_ENV !== "production"` + a `DEV_INJECT_TOKEN`) that accepts `{waId, name, text, phoneNumberId}`, wraps it into a real Meta-shaped payload, **signs it** with the local `APP_SECRET`, and POSTs it to `/api/webhooks/whatsapp`. This exercises the exact production path including signature verification.
3. **Seed + CLI + UI button.** A `scripts/seed-demo.ts` (port of `seed_demo.py`) provisions a tenant, a `whatsapp_accounts` row with a known `phoneNumberId`, a bot, and a vertical. A `pnpm dev:inbound "<text>"` CLI and a Demo-page "Send test message" button both call the inject route. Run the outbox worker locally on demand via `pnpm outbox:drain` (invokes the function handler once) so devs see the mock reply without waiting for CRON.

Optional: `ngrok`/Cloudflare-tunnel recipe in the README to register a real Meta webhook against localhost when testing the genuine signature + challenge.

---

## 5. Deliverables Checklist

**Inbound webhook**
- [ ] `app/api/webhooks/whatsapp/route.ts` — `runtime="nodejs"`; GET challenge (verify_token); POST raw-body read → HMAC-SHA256 signature verify (403 on bad) → parse → per-message process → always 200.
- [ ] `lib/whatsapp/verify.ts` (timing-safe), `lib/whatsapp/parse.ts` (batch messages, drop statuses), `lib/whatsapp/send.ts` (official SDK + mock mode).
- [ ] `lib/inbound/process.ts` — full port of `process_inbound_message`: event dedup, tenant routing by `phoneNumberId`, contact/convo upsert + phone normalize, opt-out short-circuit, opt-in marking, unsupported-message clarify (auto_reply+bot gated), inbound store, campaign attribution, lead capture + `canAiUpdateStage`, ai_owned graph run + handoff, **always-write ai_trace**, event status transitions.
- [ ] Idempotency keys verbatim: `optout:<id>`, `clarify:<id>`, `reply:<id>`.

**AI graph (`lib/ai-graph`)**
- [ ] `intent.ts`, `extract.ts`, `decide.ts`, `respond.ts`, `guards.ts`, `index.ts` — deterministic parity (incl. `_hasKeyword` boundary rule, duplicate PAYMENT_QUERY rule order, `stageFor` precedence, `confidence:null`/`deterministic`).
- [ ] All 12 packs + `custom` ported as typed config (`packs/*`), with `getPack` (unknown → custom + warn) and `listVerticals`.
- [ ] `llm/client.ts` — `chat()` never throws, timeout, env-gated; both LLM seams degrade to deterministic.
- [ ] `GRAPH_VERSION = "0.6.1"`.

**Appwrite schema (collections + indexes)**
- [ ] `webhook_events` unique `(provider, providerEventId)`; `whatsapp_accounts` (phoneNumberId), `conversations` unique `(tenantId, phoneNumberId, customerWaId)`, `contacts`, `inbox_messages`, `leads`, `bots`, `ai_traces`, `message_outbox` unique `(tenantId, idempotencyKey)`, `campaign_sends`, `sync_runs`. All collections tenant-scoped (document permissions / `tenantId` partition for isolation).

**Outbox & sends**
- [ ] `lib/outbox/enqueue.ts` (get-or-create on key).
- [ ] `functions/outbox-worker` — CRON drain; backoff `min(300, 2**attempts)`; `maxAttempts=5`→`dead`; guarded `pending→sending`; wamid backfill.
- [ ] (Optional) status-callback handler / `functions/whatsapp-sync`.

**Local dev**
- [ ] Mock-send flag, signed `app/api/dev/inject` route (dev-only + token), `scripts/seed-demo.ts`, `pnpm dev:inbound` CLI, `pnpm outbox:drain`, Demo-page test button, tunnel README.

**Tests (port existing)**
- [ ] `lib/ai-graph/__tests__` — port of `test_edge_cases.py` & `test_vertical_transitions.py` (intent classification, stage guard no-regression/terminal/lost-revive, opt-out, unsupported message, per-vertical transitions).
- [ ] Inbound integration tests: duplicate-event no-op, no-workspace, opt-out, media-only clarify, handoff sets `needs_human`+`auto_reply=false`, idempotent enqueue under replay.

**Env**
- [ ] `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_MOCK_SEND`, `LLM_ENABLED`, `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY`, `DEV_INJECT_TOKEN`, Appwrite (`APPWRITE_ENDPOINT`/`PROJECT`/`API_KEY`/`DATABASE_ID`), Clerk keys.
```

**Ground-truth source files** (read for this spec, all under `/Users/hasanraza/Desktop/CampaignAgenticAI`):
- `backend/services/inbound.py` — the inbound pipeline ported in §1.6 (idempotency keys, step order, opt-out/clarify/handoff branches).
- `backend/ai_graph/graph.py` — `classifyIntent`, `_hasKeyword`, `stageFor`, `decideAction`, `generateResponse`, `runMessageGraph`, LLM seams; `GRAPH_VERSION = "0.6.1"`.
- `backend/ai_graph/packs.py` — the 12 packs + `custom`, `getPack`/`listVerticals`, `UNIVERSAL_*`.
- `backend/ai_graph/guards.py` — `HARD_TERMINAL`, `REVIVE_INTENTS`, `isOptOut`, `canAiUpdateStage`.
- `backend/tools/outbox.py` — `enqueue_message` (get-or-create) and `process_outbox` (backoff `min(300, 2**attempts)`, `maxAttempts`→`dead`, wamid backfill) ported in §3.

Two behaviors that are NEW in the rewrite (no Python equivalent, called out inline): Meta **HMAC signature verification** (the simulator was unsigned), and **non-transactional atomicity** handling on Appwrite (unique-index get-or-create replaces SQL savepoints/`IntegrityError`).


---

# Razorpay billing (INR) (`razorpay`)

I have full ground truth: the current plan shape (`max_contacts`, `max_sends_per_day`, `max_lists`, `max_numbers`), where enforcement lives (contacts import/seed, list create, whatsapp_accounts connect, campaign sends), the `Workspace.plan` / `plan_status` storage, and the four INR tiers from SALES.md. I have everything needed to produce the spec.

```markdown
# Razorpay Billing Spec — Nudge (Next.js + Appwrite + Clerk + Razorpay)

Implementation-ready spec for replacing the mocked Stripe-style checkout
(`backend/plans.py` + `backend/api/billing.py`) with **Razorpay Subscriptions**
for INR recurring billing, in the Next.js / Appwrite / Clerk rewrite.

Ground truth carried over from the current app:
- Plan shape: `max_contacts`, `max_sends_per_day`, `max_lists`, `max_numbers`, `features` (see `plans.py`).
- Workspace stores only `plan` + `plan_status`; usage is **metered live** from data (`contact_count`, `sends_today`), never stored.
- Enforcement sites today: contact import/seed (`api/contacts.py:164,253,281`), list create (`api/contacts.py:326`), WhatsApp number connect (`api/whatsapp_accounts.py:72`), campaign sends (`remaining_sends_today`).
- Tenant = **Clerk Organization** = Appwrite workspace document.

---

## 1. Plan Catalogue

Single source of truth, code-defined (mirrors `plans.py`), TypeScript so it's
shared by server gating and the pricing UI.

`lib/billing/plans.ts`

```ts
export type PlanId = "free" | "starter" | "growth" | "ai_pro" | "agency";

export interface Plan {
  id: PlanId;
  name: string;
  priceInr: number;            // monthly, INR (display + amount sanity check)
  razorpayPlanId?: string;     // rzp_plan_xxx from env; undefined for "free"
  limits: {
    maxContacts: number;
    maxSendsPerDay: number;
    maxLists: number;
    maxNumbers: number;
  };
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free", name: "Free", priceInr: 0,
    limits: { maxContacts: 500, maxSendsPerDay: 200, maxLists: 5, maxNumbers: 1 },
    features: ["1 WhatsApp number", "500 contacts", "200 sends/day", "AI graph + 12 vertical packs"],
  },
  starter: {
    id: "starter", name: "Starter", priceInr: 1499,
    razorpayPlanId: process.env.RZP_PLAN_STARTER,
    limits: { maxContacts: 2_500, maxSendsPerDay: 1_000, maxLists: 25, maxNumbers: 1 },
    features: ["1 WhatsApp number", "2,500 contacts", "1,000 sends/day", "AI inbox + leads pipeline"],
  },
  growth: {
    id: "growth", name: "Growth", priceInr: 2999,
    razorpayPlanId: process.env.RZP_PLAN_GROWTH,
    limits: { maxContacts: 15_000, maxSendsPerDay: 5_000, maxLists: 100, maxNumbers: 3 },
    features: ["3 WhatsApp numbers", "15,000 contacts", "5,000 sends/day", "Campaigns + sales teams"],
  },
  ai_pro: {
    id: "ai_pro", name: "AI Pro", priceInr: 6999,
    razorpayPlanId: process.env.RZP_PLAN_AI_PRO,
    limits: { maxContacts: 100_000, maxSendsPerDay: 50_000, maxLists: 1_000, maxNumbers: 10 },
    features: ["10 WhatsApp numbers", "100k contacts", "50k sends/day", "Priority AI polish + analytics"],
  },
  agency: {
    id: "agency", name: "Agency", priceInr: 14999,
    razorpayPlanId: process.env.RZP_PLAN_AGENCY,
    limits: { maxContacts: 1_000_000, maxSendsPerDay: 250_000, maxLists: 10_000, maxNumbers: 50 },
    features: ["50 WhatsApp numbers", "1M contacts", "250k sends/day", "Multi-client management"],
  },
};

export const DEFAULT_PLAN: PlanId = "free";
export const planDef = (id?: string): Plan => PLANS[(id as PlanId) ?? DEFAULT_PLAN] ?? PLANS[DEFAULT_PLAN];
export const planByRazorpayId = (rzpId: string): Plan | undefined =>
  Object.values(PLANS).find((p) => p.razorpayPlanId === rzpId);
```

> Limit numbers for the new INR tiers are interpolations between `free` and `pro`
> from `plans.py` (free=500/200/5/1, pro=100k/50k/1000/10). `ai_pro` == the old
> `pro`. Confirm exact numbers with sales before launch; they're config, not code.

### Mapping: old → new

| Old (`plans.py`) | New plan | Razorpay |
| --- | --- | --- |
| `free` | `free` | none (no subscription) |
| — | `starter` ₹1,499 | Plan `rzp_plan` monthly |
| — | `growth` ₹2,999 | Plan `rzp_plan` monthly |
| `pro` ($49) | `ai_pro` ₹6,999 | Plan `rzp_plan` monthly |
| — | `agency` ₹14,999+ | Plan `rzp_plan` monthly (Agency "+" = custom/sales-led; one base plan) |

---

## 2. Razorpay Plans + Subscriptions Model

**One Razorpay Plan per paid tier** (Starter, Growth, AI Pro, Agency), each:
- `period: "monthly"`, `interval: 1`
- `item.amount` in **paise** (₹1,499 → `149900`), `currency: "INR"`
- created **once** via dashboard or a one-off seed script (`scripts/seed-razorpay-plans.ts`), then stored in env as `RZP_PLAN_STARTER` etc.

**One Subscription per workspace** (the tenant). A workspace has at most one
active subscription; upgrading/downgrading = swap the subscription's plan
(`PATCH /subscriptions/:id` with `schedule_change_at: "now"`) rather than
creating a second one.

Trial: SALES.md promises a **14-day free trial**. Use Razorpay subscription
`start_at = now + 14 days` (no charge until then) and set workspace
`plan_status: "trialing"` locally so gating grants the paid limits during trial.

### Appwrite `workspaces` collection — billing fields

Extend the workspace document (the tenant record synced from Clerk org):

```
plan                : enum(free|starter|growth|ai_pro|agency)  default "free"
plan_status         : enum(none|trialing|active|past_due|cancelled|halted)  default "none"
rzp_customer_id     : string  nullable
rzp_subscription_id : string  nullable   // indexed
current_period_end  : datetime nullable  // for grace handling / UI
```

Plus an idempotency collection `billing_webhook_events` (see §4):
`{ event_id (unique), type, processed_at, payload_hash }`.

---

## 3. Checkout Flow (Next.js App Router)

We use **Razorpay Subscriptions Checkout** (hosted JS widget, `subscription_id`
mode), not one-off Orders — recurring INR billing needs a Subscription.

### 3a. Server: create customer + subscription

Server Action (or Route Handler) — auth'd via Clerk, scoped to the **active org**.

`app/(dashboard)/billing/actions.ts`

```ts
"use server";
import Razorpay from "razorpay";
import { auth } from "@clerk/nextjs/server";
import { planDef } from "@/lib/billing/plans";
import { getWorkspaceByOrg, updateWorkspace } from "@/lib/appwrite/workspaces";
import { assertRole } from "@/lib/rbac"; // owner|admin only

const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });

export async function createSubscription(planId: string) {
  const { orgId, orgRole } = await auth();
  if (!orgId) throw new Error("No active workspace.");
  assertRole(orgRole, ["org:owner", "org:admin"]); // billing is owner/admin only

  const plan = planDef(planId);
  if (!plan.razorpayPlanId) throw new Error("Plan is not purchasable.");

  const ws = await getWorkspaceByOrg(orgId);

  // Ensure a Razorpay customer
  let customerId = ws.rzp_customer_id;
  if (!customerId) {
    const customer = await rzp.customers.create({
      name: ws.name, email: ws.billing_email, fail_existing: 0,
      notes: { workspace_id: ws.$id, clerk_org_id: orgId },
    });
    customerId = customer.id;
    await updateWorkspace(ws.$id, { rzp_customer_id: customerId });
  }

  const sub = await rzp.subscriptions.create({
    plan_id: plan.razorpayPlanId,
    customer_id: customerId,
    total_count: 120,                 // 10 yrs of monthly cycles
    customer_notify: 1,
    start_at: Math.floor(Date.now() / 1000) + 14 * 86400, // 14-day trial
    notes: { workspace_id: ws.$id, clerk_org_id: orgId, plan_id: plan.id },
  });

  await updateWorkspace(ws.$id, {
    rzp_subscription_id: sub.id,
    plan: plan.id,
    plan_status: "trialing", // promote optimistically; webhook confirms
  });

  return { subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID! };
}
```

> `workspace_id` is put in **`notes`** on both customer and subscription so the
> webhook can resolve the tenant without a DB lookup by subscription id (defence
> in depth). The Appwrite write keying off subscription id is still primary.

### 3b. Client: open the Razorpay widget

```tsx
"use client";
import Script from "next/script";
import { createSubscription } from "./actions";

export function UpgradeButton({ planId, planName }: { planId: string; planName: string }) {
  async function onUpgrade() {
    const { subscriptionId, keyId } = await createSubscription(planId);
    const rzp = new (window as any).Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: "Nudge",
      description: `${planName} plan`,
      handler: () => { window.location.href = "/billing?status=processing"; },
      theme: { color: "#6d28d9" },
      modal: { ondismiss: () => {/* stay on page; sub stays 'created' until paid */} },
    });
    rzp.open();
  }
  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <button onClick={onUpgrade}>Upgrade to {planName}</button>
    </>
  );
}
```

> The handler callback is **UX only** — never trust it to grant access. Plan
> activation happens exclusively through the webhook (§4). `/billing?status=processing`
> shows "Activating your plan…" until `plan_status` flips to `active`/`trialing`.

### 3c. Downgrade / change plan / cancel

- **Change plan:** `rzp.subscriptions.update(subId, { plan_id, schedule_change_at: "now" })` (immediate, proration-less) or `"cycle_end"` for end-of-period. Update local plan on the `subscription.updated` webhook.
- **Cancel:** Server Action `rzp.subscriptions.cancel(subId, { cancel_at_cycle_end: true })`. Keep paid limits until `current_period_end`; webhook `subscription.cancelled` flips to `free`.

---

## 4. Webhook Route Handler

`app/api/webhooks/razorpay/route.ts` — Node runtime, **raw body required** for
signature verification.

```ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { planByRazorpayId, DEFAULT_PLAN } from "@/lib/billing/plans";
import { updateWorkspaceBySubId, claimEvent } from "@/lib/appwrite/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();                       // RAW body, do not JSON.parse first
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(raw)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const event = JSON.parse(raw);
  const eventId = req.headers.get("x-razorpay-event-id") ?? event.payload?.subscription?.entity?.id;

  // Idempotency: claimEvent inserts {event_id unique}; returns false if already seen.
  if (!(await claimEvent(eventId, event.event))) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const sub = event.payload?.subscription?.entity;
  const subId = sub?.id;

  try {
    switch (event.event) {
      case "subscription.authenticated":   // mandate set up, trial running
        await updateWorkspaceBySubId(subId, { plan_status: "trialing" });
        break;

      case "subscription.activated":       // first successful charge / trial ended & paid
      case "subscription.charged": {       // each successful renewal
        const plan = planByRazorpayId(sub.plan_id);
        await updateWorkspaceBySubId(subId, {
          plan: plan?.id ?? DEFAULT_PLAN,
          plan_status: "active",
          current_period_end: new Date(sub.current_end * 1000).toISOString(),
        });
        break;
      }

      case "subscription.pending":         // a charge failed, Razorpay retrying
        await updateWorkspaceBySubId(subId, { plan_status: "past_due" });
        break;

      case "subscription.halted":          // retries exhausted -> suspend
        await updateWorkspaceBySubId(subId, { plan_status: "halted" });
        break;

      case "subscription.cancelled":
      case "subscription.completed":       // total_count reached
        await updateWorkspaceBySubId(subId, {
          plan: DEFAULT_PLAN, plan_status: "cancelled",
          rzp_subscription_id: null,
        });
        break;
    }
  } catch (err) {
    // Release the idempotency claim so Razorpay's retry can re-process.
    await releaseEvent(eventId);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

### Lifecycle → workspace state machine

| Razorpay event | `plan` | `plan_status` | Effect on gating |
| --- | --- | --- | --- |
| `subscription.authenticated` | paid tier | `trialing` | paid limits (trial) |
| `subscription.activated` | paid tier | `active` | paid limits |
| `subscription.charged` | paid tier | `active` | paid limits (renewed) |
| `subscription.pending` | paid tier | `past_due` | paid limits + in-app banner (grace) |
| `subscription.halted` | paid tier | `halted` | **downgrade to free limits**, block sends |
| `subscription.cancelled` | `free` | `cancelled` | free limits |
| `subscription.completed` | `free` | `cancelled` | free limits |

Idempotency details:
- Razorpay does **not** send a unique event id header on all events historically — key on `x-razorpay-event-id` if present, else a deterministic hash of `event + payment/subscription id + created_at`. Store in `billing_webhook_events` with a **unique index** (Appwrite unique attribute) so a concurrent retry's insert fails and we early-return.
- `claimEvent` = "insert-or-fail" (atomic via the unique constraint). On processing exception, `releaseEvent` deletes the row so the retry re-runs. Mirrors the current `webhook_events` idempotency table for WhatsApp.
- Register the webhook in Razorpay dashboard for events: `subscription.authenticated/activated/charged/pending/halted/cancelled/completed`. Use a dedicated `RAZORPAY_WEBHOOK_SECRET`.

---

## 5. Plan-Based Feature Gating & Usage Limits

Same philosophy as `plans.py`: **limits are config, usage is metered live**,
enforcement is **server-side only** (never trust client). Limits live in
`lib/billing/plans.ts`; usage is computed from Appwrite collections.

### 5a. Effective plan resolver

`lib/billing/entitlements.ts`

```ts
import { planDef, PLANS, DEFAULT_PLAN } from "./plans";

// trialing/active/past_due keep paid limits; halted/cancelled/none -> free.
export function effectivePlan(ws: { plan: string; plan_status: string }) {
  const paidStatuses = ["trialing", "active", "past_due"];
  return paidStatuses.includes(ws.plan_status) ? planDef(ws.plan) : PLANS[DEFAULT_PLAN];
}
```

### 5b. Usage meters (live counts, parity with `plans.py`)

```ts
export async function contactCount(wsId: string)  // count contacts where workspace_id == wsId
export async function listCount(wsId: string)      // count contact_lists
export async function numberCount(wsId: string)    // count whatsapp_accounts
export async function sendsToday(wsId: string)     // count outbound inbox_messages since UTC midnight
```

> Mirror `sends_today`'s windowing: count outbound messages created since UTC
> midnight. In Appwrite, query `inbox_messages` (or `message_outbox` sent rows)
> filtered by `workspace_id`, `direction=out`, `created_at >= startOfUtcDay`.
> Cache the count per workspace/day in a short-TTL store if volume warrants.

### 5c. Central guard helpers (used at every mutation)

```ts
import { effectivePlan } from "./entitlements";

export async function assertCanAddContacts(ws, n = 1) {
  const limit = effectivePlan(ws).limits.maxContacts;
  if ((await contactCount(ws.$id)) + n > limit)
    throw new GatedError(402, `Contact limit reached for the ${effectivePlan(ws).name} plan. Upgrade to add more.`);
}
export async function assertCanCreateList(ws) {
  if ((await listCount(ws.$id)) >= effectivePlan(ws).limits.maxLists)
    throw new GatedError(402, `List limit reached for the ${effectivePlan(ws).name} plan.`);
}
export async function assertCanConnectNumber(ws) {
  if ((await numberCount(ws.$id)) >= effectivePlan(ws).limits.maxNumbers)
    throw new GatedError(402, `Your ${effectivePlan(ws).name} plan allows ${effectivePlan(ws).limits.maxNumbers} number(s). Upgrade to connect more.`);
}
export async function remainingSendsToday(ws) {
  return Math.max(0, effectivePlan(ws).limits.maxSendsPerDay - (await sendsToday(ws.$id)));
}
```

`GatedError(402, …)` → mapped to HTTP 402 in Route Handlers and surfaced as an
"Upgrade" toast in the UI — same 402 semantics the current FastAPI app returns.

### 5d. Enforcement sites (1:1 with the current app)

| Where (Next.js) | Maps to current | Guard |
| --- | --- | --- |
| Contact import / create / demo-seed Server Action | `api/contacts.py:164,253,281` | `assertCanAddContacts(ws, batchSize)` |
| List create Server Action | `api/contacts.py:326` | `assertCanCreateList(ws)` |
| WhatsApp number connect | `api/whatsapp_accounts.py:72` | `assertCanConnectNumber(ws)` |
| Campaign send / **outbox enqueue** (Appwrite Function) | `remaining_sends_today` | cap batch to `remainingSendsToday(ws)`; halt overflow |

> **Critical:** the sends/day cap must be enforced inside the **outbox worker
> Appwrite Function**, not just at campaign-create time, since sends are
> async/queued. The worker reads the workspace's effective plan + today's count
> before dispatching each batch.

### 5e. Read paths

- `GET /api/billing/usage` Route Handler returns `{ plan, plan_name, plan_status, contacts:{used,limit}, sends_today:{used,limit}, lists:{used,limit}, numbers:{used,limit} }` — same shape as `plans.usage()`, extended with lists/numbers.
- Pricing page reads `PLANS` directly (no API needed; it's static config) — replaces `GET /billing/plans`.

---

## 6. RBAC

Billing actions (subscribe/change/cancel) are **owner/admin only**. Map from
Clerk org roles: `org:owner` → owner, `org:admin` → admin. `assertRole` in the
Server Action rejects manager/agent/viewer with 403. Mirrors the current
`auth/rbac.py` role checks.

---

## 7. Test / Sandbox Story

- **Razorpay Test Mode:** use test `key_id`/`key_secret` (separate from live). Create test Plans via the seed script; store test plan ids in `.env.local`.
- **Test cards / UPI:** Razorpay test card `4111 1111 1111 1111` (any future expiry/CVV); test UPI `success@razorpay` / `failure@razorpay` to exercise charged vs failed flows.
- **Webhook delivery locally:** expose the Next dev server via `ngrok`/cloudflared, register the tunnel URL as a test webhook in the Razorpay dashboard with `RAZORPAY_WEBHOOK_SECRET`. Or replay captured payloads with `curl` + a correctly-computed HMAC for unit tests.
- **Trial/renewal acceleration:** Razorpay test subscriptions let you trigger charges from the dashboard ("charge now") to simulate `subscription.charged` without waiting a month; simulate `halted` by using the failure UPI handle across retries.
- **Idempotency test:** POST the same webhook payload twice → second returns `{ deduped: true }`, workspace written once.
- **Signature test:** POST with a tampered body → 400, no state change.
- **Gating unit tests** (port from `backend/tests/test_edge_cases.py`): at-limit contact import → 402; over-cap campaign send → batch truncated to `remainingSendsToday`; `halted` status → free limits applied even though `plan` still names a paid tier.
- **Never** rely on the client `handler` callback in tests for activation — assert activation only via the webhook path.

### Environment variables

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RZP_PLAN_STARTER=
RZP_PLAN_GROWTH=
RZP_PLAN_AI_PRO=
RZP_PLAN_AGENCY=
NEXT_PUBLIC_RAZORPAY_KEY_ID=   # only the public key_id for the widget
```

---

## 8. Deliverables Checklist

**Config / data**
- [ ] `lib/billing/plans.ts` — 5-plan catalogue (free + 4 INR tiers), limits, `razorpayPlanId` from env, `planByRazorpayId`.
- [ ] Appwrite `workspaces` billing attributes: `plan`, `plan_status`, `rzp_customer_id`, `rzp_subscription_id` (indexed), `current_period_end`, `billing_email`.
- [ ] Appwrite `billing_webhook_events` collection with **unique** `event_id` attribute.
- [ ] `scripts/seed-razorpay-plans.ts` — create the 4 Razorpay Plans (test + live), print plan ids for env.

**Checkout**
- [ ] `app/(dashboard)/billing/actions.ts` — `createSubscription`, `changePlan`, `cancelSubscription` Server Actions (owner/admin gated, 14-day trial via `start_at`).
- [ ] `UpgradeButton` client component loading `checkout.js` in `subscription_id` mode.
- [ ] `/billing` page: current plan, usage bars, plan grid (from `PLANS`), `?status=processing` activating state.

**Webhook**
- [ ] `app/api/webhooks/razorpay/route.ts` — Node runtime, raw-body HMAC verify (`timingSafeEqual`), idempotent `claimEvent`/`releaseEvent`, full lifecycle switch.
- [ ] `lib/appwrite/billing.ts` — `updateWorkspaceBySubId`, `claimEvent`, `releaseEvent`.
- [ ] Razorpay dashboard webhook registered (test + live) for all 7 subscription events.

**Gating**
- [ ] `lib/billing/entitlements.ts` — `effectivePlan` (status→limits), live meters (`contactCount`/`listCount`/`numberCount`/`sendsToday`).
- [ ] Guard helpers + 402 `GatedError`, wired into contacts/lists/numbers Server Actions and the **outbox worker Function** (sends/day cap).
- [ ] `GET /api/billing/usage` Route Handler (extended usage shape).

**RBAC + tests**
- [ ] Clerk org-role → billing-permission mapping; billing Server Actions reject non-owner/admin (403).
- [ ] Tests: signature reject, idempotent replay, trial→active→charged→halted→cancelled transitions, every gating limit at-boundary, async send-cap enforcement, role enforcement.

**Docs**
- [ ] Update `SALES.md` pricing note + `LOCAL_DEV.md` with Razorpay test-mode + ngrok webhook setup.
```

Relevant files read (all absolute):
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/plans.py` — plan shape (`max_contacts`/`max_sends_per_day`/`max_lists`/`max_numbers`), live metering (`contact_count`, `sends_today`), `remaining_*` helpers.
- `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/billing.py` — mocked checkout/cancel that just flips `ws.plan`/`ws.plan_status`; the webhook hook to replace.
- `/Users/hasanraza/Desktop/CampaignAgenticAI/SALES.md` — INR tiers Starter ₹1,499 / Growth ₹2,999 / AI Pro ₹6,999 / Agency ₹14,999+, 14-day trial, Meta per-message pass-through.
- Enforcement sites confirmed in `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/contacts.py` (lines 164, 253, 281, 326), `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/api/whatsapp_accounts.py` (line 72), and `Workspace.plan`/`plan_status` in `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/db/models.py` (lines 36–37).


---

# Design system: shadcn + framer v3 + theming (`design`)

I have complete ground truth now: the exact color tokens (light/dark), Plus Jakarta Sans + JetBrains Mono, 0.75rem radius, custom scrollbars, the app shell (collapsible icon sidebar + workspace switcher + ⌘K command menu + theme toggle), framer-motion conventions (layoutId active indicator, MotionConfig reducedMotion="user", AnimatePresence), and domain patterns (AI timeline, lead stages/kanban, assignment, needs_human handoff). I'll now produce the spec.

```markdown
# Nudge — Design System & Frontend Spec (Next.js Rewrite)

Vertical-aware AI WhatsApp CRM. This spec carries the existing brand verbatim (teal/emerald primary, Plus Jakarta Sans + JetBrains Mono, `0.75rem` radius, custom scrollbars, framer-motion polish) into a **Next.js App Router + TypeScript + Clerk + Appwrite + Razorpay** stack with **light + dark from day one**.

---

## 1. shadcn/ui Setup in Next.js

### 1.1 `components.json`
Switch from the existing JS/Vite config (`"tsx": false`, `"rsc": false`, `baseColor: "zinc"`) to TS + RSC. Keep `baseColor: "neutral"` is wrong for our palette — we keep our own CSS variables, so `baseColor` only seeds the generator; use `"zinc"` to match the cool near-black dark surface already in `index.css`.

```jsonc
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",                 // Tailwind v4: tokens live in globals.css, leave empty
    "css": "src/app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "utils": "@/lib/utils",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

> Note: shadcn current generator targets **Tailwind v4** where the theme is expressed in `globals.css` via `@theme inline` rather than `tailwind.config.js`. If you prefer Tailwind v3 (matching the existing repo, `tailwindcss-animate`, `darkMode: ["class"]`), keep `tailwind.config.ts` and set `"config": "tailwind.config.ts"`. **Recommendation: Tailwind v4** for a greenfield rewrite — fewer moving parts, native `@custom-variant dark`. Both token tables below are given.

### 1.2 Color token palette (carry over **exactly**)
These HSL triples are lifted verbatim from the existing `src/index.css` so the brand is pixel-identical. Primary = emerald `160 84% 39%` (light) / `156 66% 52%` (dark); radius `0.75rem`; full sidebar token group preserved.

#### Tailwind v4 — `src/app/globals.css`
```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

@custom-variant dark (&:is(.dark *));

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 160 84% 39%;
  --primary-foreground: 0 0% 100%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 160 84% 39%;
  --radius: 0.75rem;
  --sidebar-background: 160 24% 99%;
  --sidebar-foreground: 170 8% 30%;
  --sidebar-primary: 160 84% 39%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 160 60% 94%;
  --sidebar-accent-foreground: 162 84% 26%;
  --sidebar-border: 160 12% 90%;
  --sidebar-ring: 160 84% 39%;
  /* New: success token (existing badge variant="success" relied on raw emerald) */
  --success: 142 71% 45%;
  --success-foreground: 0 0% 100%;
}

.dark {
  --background: 229 24% 5%;
  --foreground: 210 20% 98%;
  --card: 228 18% 8%;
  --card-foreground: 210 20% 98%;
  --popover: 228 20% 7%;
  --popover-foreground: 210 20% 98%;
  --primary: 156 66% 52%;
  --primary-foreground: 156 90% 8%;
  --secondary: 228 14% 14%;
  --secondary-foreground: 210 20% 98%;
  --muted: 228 14% 13%;
  --muted-foreground: 220 12% 62%;
  --accent: 228 14% 16%;
  --accent-foreground: 210 20% 98%;
  --destructive: 0 72% 55%;
  --destructive-foreground: 0 0% 98%;
  --border: 226 16% 16%;
  --input: 226 16% 17%;
  --ring: 156 66% 52%;
  --sidebar-background: 200 18% 6%;
  --sidebar-foreground: 180 8% 82%;
  --sidebar-primary: 156 66% 52%;
  --sidebar-primary-foreground: 156 90% 8%;
  --sidebar-accent: 158 40% 14%;
  --sidebar-accent-foreground: 156 70% 82%;
  --sidebar-border: 200 14% 14%;
  --sidebar-ring: 156 66% 52%;
  --success: 156 66% 52%;
  --success-foreground: 156 90% 8%;
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-success: hsl(var(--success));
  --color-success-foreground: hsl(var(--success-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-sidebar: hsl(var(--sidebar-background));
  --color-sidebar-foreground: hsl(var(--sidebar-foreground));
  --color-sidebar-primary: hsl(var(--sidebar-primary));
  --color-sidebar-primary-foreground: hsl(var(--sidebar-primary-foreground));
  --color-sidebar-accent: hsl(var(--sidebar-accent));
  --color-sidebar-accent-foreground: hsl(var(--sidebar-accent-foreground));
  --color-sidebar-border: hsl(var(--sidebar-border));
  --color-sidebar-ring: hsl(var(--sidebar-ring));

  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
}
```

> **Prefer `next/font` over the Google Fonts `@import`** for performance (no render-blocking, self-hosted). Load `Plus_Jakarta_Sans` + `JetBrains_Mono` in `app/layout.tsx`, expose as `--font-sans` / `--font-mono`, and drop the `@import` line. Both approaches are listed; ship `next/font`.

```ts
// app/layout.tsx
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400","500","600","700","800"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400","500","600"] });
// <html className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
```

#### Tailwind v3 alternative
If staying on v3: reuse the **existing** `tailwind.config.js` (already correct — `darkMode: ["class"]`, `borderRadius` derived from `--radius`, full `sidebar` color group, `container` at `1400px`, `tailwindcss-animate`). Add only `success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' }` and the `animate-aurora` / `bg-grid` keyframes (below). Rename to `tailwind.config.ts`.

### 1.3 Global utilities to carry over (verbatim from existing `index.css`)
Append after `@theme`/base layer. These are load-bearing — used across the app shell and landing:

```css
@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
    -webkit-font-smoothing: antialiased;
  }
  .tabular-nums { font-variant-numeric: tabular-nums; }
}

/* Custom scrollbars — used on every scroll surface in the app shell */
.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: hsl(var(--border)); border-radius: 9999px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: hsl(var(--muted-foreground) / 0.4); }

/* Reduced-motion kill switch for pure-CSS animation (framer handled via MotionConfig) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}

@layer utilities {
  .lift { transition: transform .18s ease, box-shadow .18s ease; will-change: transform; }
  .lift:hover { transform: translateY(-2px); }
  .glow-primary { box-shadow: 0 0 80px -20px hsl(var(--primary) / 0.45); }
  .glass {
    background-color: hsl(var(--card) / 0.6);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border: 1px solid hsl(var(--border) / 0.6);
  }
  .bg-grid {
    background-image:
      linear-gradient(to right, hsl(var(--border)/.6) 1px, transparent 1px),
      linear-gradient(to bottom, hsl(var(--border)/.6) 1px, transparent 1px);
    background-size: 48px 48px;
  }
  .bg-grid-fade { -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 40%, transparent 100%);
                  mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 40%, transparent 100%); }
  @keyframes aurora { 0%,100%{transform:translate3d(0,0,0) scale(1);opacity:.55} 50%{transform:translate3d(0,-3%,0) scale(1.08);opacity:.8} }
  .animate-aurora { animation: aurora 14s ease-in-out infinite; }
}
```

### 1.4 Theme provider (next-themes, day-one dark)
```tsx
// components/providers/theme-provider.tsx  ("use client")
import { ThemeProvider as NextThemes } from "next-themes";
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
```
Mount inside `app/layout.tsx` with `suppressHydrationWarning` on `<html>`. **Clerk dark mode**: drive `ClerkProvider`'s `appearance.baseTheme` off `useTheme()` (`dark` ⇒ `@clerk/themes` `dark`) and set `variables.colorPrimary` to `#10b981` so Clerk's hosted UI matches the brand.

### 1.5 Base shadcn primitives to generate
Already in the repo (regenerate as `.tsx`): `avatar, badge, breadcrumb, button, card, collapsible, command, dialog, dropdown-menu, input, label, popover, progress, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, table, tabs, textarea, tooltip`.
**Add for the rewrite:** `form` (react-hook-form + zod), `alert`, `alert-dialog`, `calendar` + `date-picker`, `checkbox`, `radio-group`, `hover-card`, `accordion`, `pagination`, `data-table` (TanStack Table wrapper), `chart` (shadcn Recharts wrapper — replaces the bespoke `MetricsChart`), `resizable` (Inbox 3-pane), `toggle-group`, `dropdown` submenus.

---

## 2. framer-motion v3 Conventions

> The existing app pins `framer-motion@12`. "v3" here = our **internal motion-primitive version 3**; install the latest `framer-motion` (now published as `motion` / `framer-motion`). All motion components are **client components** (`"use client"`). In RSC pages, render server data, wrap only the animated leaf in a client primitive.

### 2.1 Global rules
- **One `MotionConfig`** at the root with `reducedMotion="user"` — framer then auto-disables transform/opacity motion for users with the OS setting; the CSS kill-switch in §1.3 covers pure-CSS. Never duplicate this per-page.
- **Animate transform + opacity only** (GPU). Never animate `width`/`height`/`top` outside of `layout` props.
- **Durations:** micro `0.15s`, standard `0.2–0.3s`, page `0.3s`. **Easing:** `[0.16, 1, 0.3, 1]` (the "easeOutExpo" used app-wide).
- **`layoutId`** for shared element transitions — already used for the sidebar active pill (`layoutId="sidebar-active"`); reuse for lead-stage kanban card moves and tab underlines.
- **`AnimatePresence`** for list add/remove (inbox threads, leads, toasts) and route exit. Use `mode="popLayout"` for reordering lists.
- Respect **`prefers-reduced-motion`** everywhere via the global config; do not hand-roll `useReducedMotion` per component unless replacing motion with an instant alternative.

### 2.2 Reusable motion primitives (`components/motion/`)
```tsx
// components/motion/index.tsx  ("use client")
import { motion, type Variants } from "framer-motion";

export const EASE = [0.16, 1, 0.3, 1] as const;

// 1. PageTransition — wrap each route's main content (App Router template.tsx)
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
  exit:   { opacity: 0, y: -8, transition: { duration: 0.2, ease: EASE } },
};

// 2. Stagger — section/list reveal
export const staggerParent: Variants = {
  hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE } },
};

export const FadeIn   = (p) => <motion.div initial="hidden" animate="show" variants={staggerItem} {...p} />;
export const Stagger  = (p) => <motion.div initial="hidden" animate="show" variants={staggerParent} {...p} />;
export const Reveal   = (p) => <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={staggerItem} {...p} />; // scroll-reveal for Landing
```
- **`PageTransition`** lives in `app/(app)/template.tsx` (App Router re-mounts `template.tsx` on navigation, so it animates on every route change without manual `AnimatePresence`).
- **`AnimatedNumber`** primitive (`useSpring` + `useTransform`) for the dashboard/usage counters (keep `tabular-nums`).
- **`AgentOrbitals` / aurora / AIPredictionCard** — port the existing bespoke landing/AI components into `components/marketing/` and `components/ai/`; they already animate transform/opacity only.
- **Sidebar active pill** — keep the `layoutId="sidebar-active"` pattern in the new `app-sidebar`.

---

## 3. Component & Screen Inventory → Next.js Routes

### 3.1 Route map (App Router)
```
app/
├─ (marketing)/                  # public, no app shell, own theme toggle
│  ├─ page.tsx                   → Landing
│  └─ demo/page.tsx              → Demo (vertical selector playground)
├─ (auth)/                       # Clerk-hosted, centered card layout
│  ├─ sign-in/[[...sign-in]]/page.tsx
│  ├─ sign-up/[[...sign-up]]/page.tsx
│  └─ accept-invite/page.tsx     → AcceptInvite (Clerk Organization invitation)
├─ (app)/                        # authed app shell (sidebar + topbar + ⌘K)
│  ├─ layout.tsx                 # AppShell + ClerkProvider org guard
│  ├─ template.tsx               # PageTransition wrapper
│  ├─ page.tsx                   → Campaign Brief (home / "New Campaign")
│  ├─ inbox/page.tsx             → Inbox            (+ inbox/[conversationId] parallel/intercepting route)
│  ├─ leads/page.tsx             → Leads
│  ├─ team/page.tsx              → Team (workspace members)
│  ├─ sales-teams/page.tsx       → Sales Teams
│  ├─ contacts/page.tsx          → Contacts
│  ├─ lists/page.tsx             → Contact Lists
│  ├─ templates/page.tsx         → Templates
│  ├─ campaigns/[id]/
│  │  ├─ approval/page.tsx       → Approval (review variants)
│  │  └─ dashboard/page.tsx      → Dashboard (analytics)
│  ├─ settings/page.tsx          → Settings (vertical, WhatsApp, profile)
│  └─ billing/page.tsx           → Billing (Razorpay)
└─ api/webhooks/                 # route handlers (or Appwrite Functions)
   ├─ clerk/route.ts             # user/org sync → Appwrite
   ├─ whatsapp/route.ts          # Meta Cloud API inbound (GET verify + POST)
   └─ razorpay/route.ts          # subscription events
```
> **Tenant isolation:** `(app)/layout.tsx` reads `auth()` → `orgId` (Clerk Organization = workspace). Every Appwrite query is scoped by `workspaceId == orgId` via document permissions/queries. Clerk org role → RBAC (`org:owner|admin|manager|agent|viewer`) gating server actions. No `orgId` ⇒ redirect to an org-picker/onboarding.

### 3.2 App shell (`components/layout/`)
| Piece | Built from | Notes |
|---|---|---|
| **AppSidebar** | `ui/sidebar` (`collapsible="icon"`), `SidebarGroup/Menu/MenuButton`, `SidebarRail` | Port existing `app-sidebar.jsx` NAV groups: **Campaigns** (New Campaign, Analytics) · **Conversations** (Inbox, Leads) · **Team** (Members, Sales Teams) · **Audience** (Contacts, Lists, Templates) · **Account** (Plan & Billing, Settings). Keep `layoutId` active pill + per-item tooltip on collapse. |
| **WorkspaceSwitcher** | `dropdown-menu` in `SidebarHeader` + Sparkles brand mark | **Replace custom workspace list with Clerk `<OrganizationSwitcher>`** (themed) or a custom dropdown over `useOrganizationList()`. Includes "Create workspace". |
| **TopBar** | `SidebarTrigger`, `Separator`, ⌘K search button, `Bell`, ThemeToggle, Clerk `<UserButton>` | Sticky, `bg-background/80 backdrop-blur-md`. Replace the bespoke avatar dropdown with `<UserButton>`. |
| **CommandMenu** | `ui/command` (`CommandDialog`) | Port existing ⌘K palette; add **dynamic** items (jump to a contact/lead/conversation/template by name via Appwrite search) and quick actions (New campaign, Invite member, Toggle theme). |
| **ThemeToggle** | `button` + Sun/Moon, `next-themes` | Sun/Moon cross-fade exactly as existing `MainLayout`. |
| **PlanUsageWidget** | `card` + `progress` + `badge` | Sidebar footer; sends-today meter, `destructive` when >90%, links to Billing. |
| **Breadcrumbs** | `ui/breadcrumb` | Per-route in `TopBar`. |

### 3.3 Page → components inventory
| Route | Page | Primary shadcn / custom components |
|---|---|---|
| `/` | **Brief** (New Campaign) | `form` (rhf+zod), `textarea`, `select` (vertical), `card`, `button`, `Stagger`, agentic "generating" state (`skeleton` + `AIPredictionCard`), `sonner` |
| `/inbox` | **Inbox** | `resizable` 3-pane (thread list · conversation · AI panel) → on mobile `tabs`/`sheet`; `scroll-area`+`custom-scrollbar`, `avatar`, `badge`, conversation bubbles, `textarea` reply, `switch` (AI auto-reply on/off), **AI Activity Timeline** (`TimelineNode`: intent→fields→stage→tags→reply mode, read-only), `Settings2` per-vertical config `dialog`, assignment `select` (agent/team, gated by role), `needs_human` handoff banner (`alert`) |
| `/leads` | **Leads** | **Kanban** by `pipeline_stages` (per-vertical, framer `layoutId` drag) **or** `data-table`; `StageBadge` (tone per stage), assignment `select` (`u:`/`t:` encoding), `needs_human` flag w/ `tooltip`, filter `toggle-group` (All/Mine/Unassigned), `sheet` lead detail |
| `/team` | **Team** | `data-table` of members, role `badge`, role `select` (RBAC-gated), **Invite** `dialog` → Clerk org invite, `avatar`, `alert-dialog` remove |
| `/sales-teams` | **Sales Teams** | `card` grid of teams, member `avatar` stacks, create/edit `dialog`, member-picker `command`/multiselect, `data-table` |
| `/contacts` | **Contacts** | `data-table` (pagination, search, column filters), import `dialog` (`input type=file` → Appwrite Storage), `badge` tags, bulk-action toolbar, add-to-list `dropdown-menu` |
| `/lists` | **Contact Lists** | `card` grid + `data-table`, create `dialog`, member count `badge`, segment-rule builder |
| `/templates` | **Templates** | `card`/`data-table`, WhatsApp template editor `textarea` + variable chips, status `badge` (approved/pending), preview pane, category `select` |
| `/campaigns/[id]/approval` | **Approval** | `tabs` per variant, `VariantCard` (port), diff/preview, approve/reject `button` + `alert-dialog`, `badge` status, `Stagger` |
| `/campaigns/[id]/dashboard` | **Dashboard** | shadcn `chart` (Recharts) replacing `MetricsChart`, KPI `card`s w/ `AnimatedNumber`, `SegmentTable` (port), `MetricsChart`, date-range `date-picker` |
| `/settings` | **Settings** | `tabs` (Profile · Vertical · WhatsApp · Workspace · Danger), vertical `select` (12 packs), WhatsApp Cloud API connect `card` (phone-number-id, token via Appwrite secret), `switch`es, `form` |
| `/billing` | **Billing** | plan `card`s (Free/Pro, INR), `badge` current, **Razorpay** checkout `button`, usage `progress`, invoices `data-table` |
| `/` marketing | **Landing** | Port hero (`AgentOrbitals`, aurora `animate-aurora`, `bg-grid`/`bg-grid-fade`, `glow-primary`, `glass`), `Reveal` scroll sections, vertical-pack showcase, pricing, `ProductMock` inbox preview, own `next-themes` toggle |
| `/demo` | **Demo** | Vertical `select` (`demoVerticals`), live simulated inbox/lead playground, no auth; reuses Inbox/Leads components with seeded `demoVerticals` data |
| `/accept-invite` | **AcceptInvite** | Clerk `<OrganizationProfile>` invitation accept; centered `card`, handles token, redirects into `(app)` |

---

## 4. Stitch — Rapid Mockups for the 4 Highest-Value Screens

Use Stitch (`create_project` → `create_design_system_from_design_md` to seed our tokens → `generate_screen_from_text`) for the screens with the highest layout ambiguity / brand payoff. Skip Stitch for CRUD tables (Contacts/Lists/Team) — those are mechanical `data-table` derivations.

**Pick these 4:** (1) **Inbox** (3-pane + AI timeline — the product's signature), (2) **Leads Kanban**, (3) **Campaign Dashboard**, (4) **Landing hero**.

**Workflow:**
1. Write a `design.md` capturing the §1.2 palette + Plus Jakarta Sans + `0.75rem` radius, upload via `upload_design_md` / `create_design_system_from_design_md`, then `apply_design_system` so every generated screen is on-brand.
2. `generate_screen_from_text` per screen with the prompts below; `generate_variants` for 2–3 options; `edit_screens` to refine.
3. Translate to code: read the generated layout as a **structural reference only** → rebuild with our shadcn primitives + tokens (Stitch output is not production shadcn). Map regions → `resizable`/`Sidebar`/`card`/`data-table`; never paste Stitch's raw CSS — bind everything to our CSS variables so light/dark both work.

**Prompts (brand-locked):**
- **Inbox:** *"A WhatsApp CRM inbox, 3 resizable columns on emerald/teal brand, Plus Jakarta Sans, 0.75rem rounded cards, light+dark. Left: searchable conversation list with avatars, unread badges, last-message preview, vertical filter. Center: WhatsApp-style chat bubbles, AI auto-reply toggle, message composer. Right: 'AI Activity' panel — a vertical timeline showing Intent detected → Fields extracted → Pipeline stage → Tags → Reply mode, plus an agent/team assignment dropdown and a 'needs human handoff' alert. Subtle, professional, dense but calm."*
- **Leads Kanban:** *"A sales pipeline kanban for an Indian SMB CRM, emerald primary, columns are per-vertical stages (New, Qualified, Won, Lost), draggable lead cards with contact name, stage badge, assignee avatar, and a red 'needs human' flag. Top filter chips: All / Assigned to me / Unassigned. Light and dark."*
- **Campaign Dashboard:** *"An analytics dashboard for WhatsApp campaigns, 4 KPI stat cards with big tabular numbers, an area chart of sends/replies over time, a segment performance table, date-range picker, emerald/teal accents, 0.75rem radius, light+dark."*
- **Landing hero:** *"A SaaS landing hero for an AI WhatsApp CRM for Indian SMBs. Headline about replies becoming CRM updates automatically. Aurora gradient glow in emerald/teal, faint technical grid background, animated orbital 'AI agent' motif, a floating product mock of the inbox, primary CTA + secondary, trust row of 12 business verticals. Dark-first, also light."*

---

## 5. Accessibility & Responsive Notes

**A11y**
- shadcn/Radix gives focus traps, roving tabindex, ARIA roles for free — keep `ring` (`--ring` = brand) visible; never remove focus outlines.
- Contrast: emerald primary on white and `primary-foreground` on primary both pass AA; verify the `muted-foreground` dark value (`220 12% 62%`) against `card` for small text — bump if it fails AA.
- Motion: global `MotionConfig reducedMotion="user"` + the CSS kill-switch (§1.3) → reduced-motion users get no transform/opacity animation.
- `sonner` toasts: `richColors`, `aria-live="polite"`; errors `assertive`.
- Command menu, dialogs, sheets: labelled triggers, `Esc` to close, return focus to trigger.
- Kanban drag must have a keyboard alternative (stage `select` on each card — the existing Leads page already does this for assignment; mirror for stage).
- Icons that convey state (`needs_human`, AI badge) need `aria-label`/`sr-only` text.

**Responsive**
- **Sidebar** `collapsible="icon"` → off-canvas `sheet` under `md`; `SidebarTrigger` in topbar.
- **Inbox** `resizable` 3-pane on `lg+`; on `md` collapse AI panel into a `sheet`; on mobile, list ↔ conversation as stacked views (intercepting route `inbox/[conversationId]`).
- **Leads** kanban horizontal-scroll (`custom-scrollbar`) on desktop → single-column list / `data-table` card view on mobile.
- **Data tables** → stacked card rows under `sm`; sticky header + horizontal scroll otherwise.
- **Landing**: hero clamps font sizes; orbital/aurora `hidden md:block` to protect mobile perf; product mock scales down.
- Container max `1400px` (existing); content gutters `px-4 md:px-6 lg:px-8`.

---

## 6. Deliverables Checklist

- [ ] `app/layout.tsx`: `next/font` (Jakarta + JetBrains Mono), `ThemeProvider`, `ClerkProvider` (themed light/dark), `MotionConfig reducedMotion="user"`, `Toaster`, `suppressHydrationWarning`.
- [ ] `globals.css` with the **exact** light+dark token tables (§1.2) + carried-over utilities (`custom-scrollbar`, `lift`, `glass`, `glow-primary`, `bg-grid`, `animate-aurora`, reduced-motion block) + `--success` token.
- [ ] `components.json` (TS + RSC) and Tailwind config (v4 `@theme inline` **or** v3 `tailwind.config.ts`).
- [ ] Base shadcn primitives regenerated as `.tsx` + new ones (`form, data-table, chart, resizable, calendar, alert(-dialog), checkbox, radio-group, pagination, hover-card, accordion, toggle-group`).
- [ ] `components/motion/` primitives: `pageVariants`, `Stagger`/`staggerItem`, `FadeIn`, `Reveal`, `AnimatedNumber`; `(app)/template.tsx` page transition.
- [ ] App shell: `AppSidebar` (Clerk `OrganizationSwitcher`, `layoutId` pill), `TopBar` (⌘K, `UserButton`, `ThemeToggle`, breadcrumbs), dynamic `CommandMenu`, `PlanUsageWidget`.
- [ ] All 14 routes scaffolded per §3.1 with RSC data fetch + tenant scoping (`orgId`) + RBAC-gated server actions.
- [ ] Ported custom components: `AgentOrbitals`, `AIPredictionCard`, `TimelineNode`/AI timeline, `VariantCard`, `SegmentTable`, `MetricsChart`→shadcn `chart`, `AgentStatusBadge`, `ErrorBoundary`.
- [ ] Clerk org → RBAC role map; Clerk/WhatsApp/Razorpay webhook handlers (`api/webhooks/*` or Appwrite Functions).
- [ ] Stitch: `design.md` + design system applied; 4 hero-screen mockups (Inbox, Leads, Dashboard, Landing) generated, variants reviewed, translated to shadcn.
- [ ] A11y pass (contrast audit on dark `muted-foreground`, focus rings, keyboard kanban, reduced-motion) + responsive pass (sidebar off-canvas, inbox panes, table→card, landing perf).
- [ ] Light/dark verified on every screen including Clerk hosted UI.

---

### Key source references (ground truth)
- Tokens / fonts / radius / utilities: `frontend/src/index.css`
- Tailwind theme: `frontend/src/../tailwind.config.js`
- App shell: `frontend/src/components/MainLayout.jsx`, `frontend/src/components/layout/app-sidebar.jsx`, `frontend/src/components/layout/command-menu.jsx`, `frontend/src/components/ui/sidebar.jsx`
- Domain UI patterns: `frontend/src/pages/InboxPage.jsx` (AI timeline, assignment, vertical config), `frontend/src/pages/LeadsPage.jsx` (stages, `u:`/`t:` assignment, `needs_human`)
- Verticals: `frontend/src/lib/verticals.js`, `frontend/src/lib/demoVerticals.js`
```