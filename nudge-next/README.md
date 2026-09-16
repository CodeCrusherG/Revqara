# Revqara — Next.js rewrite (`revqara-next`)

**Vertical-aware AI WhatsApp CRM.** Customers message your WhatsApp number; one
universal, deterministic AI graph — parameterized by 12 vertical "packs"
(coaching, clinic, real-estate, salon, e-commerce, B2B, travel, restaurant, gym,
automobile, insurance, political party) + `custom` — classifies intent, extracts
fields, advances a per-vertical pipeline, replies on-brand, and hands off to a
human on risk. Leads, an inbox, contacts, lists, templates, agentic campaigns,
team RBAC, and metered Razorpay billing sit on top.

This is the App-Router / RSC rewrite of the original **FastAPI + React/Vite**
app one level up, which remains the **behavioral ground truth**. Built
phase-by-phase against [`../NEXTJS_REWRITE_PLAN.md`](../NEXTJS_REWRITE_PLAN.md)
(the authoritative master plan — read it for the data model §3, RBAC §4, the
WhatsApp/AI pipeline §5, billing §6, and the env contract §9).

## Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 14** (App Router, React Server Components, Server Actions) + TypeScript (strict) |
| Identity / tenancy / RBAC | **Clerk** — the active Organization **is** the workspace (`orgId === workspaceId`); 5 org roles + 11 permissions |
| Data plane | **Appwrite** (`node-appwrite` admin SDK, server-only, API-key) — 24 domain collections + 1 billing-idempotency collection |
| Messaging | **Meta WhatsApp Cloud API** (inbound webhook → idempotent processor → outbox worker → send) |
| Billing | **Razorpay** subscriptions (5 INR tiers, 14-day trial), webhook-driven activation |
| UI | **shadcn/ui** (new-york, hand-authored primitives — `cmdk` and a few others are intentionally dependency-free) + **Tailwind** + **framer-motion** + **next-themes** (light/dark) |
| Tests | **vitest** (167 tests: AI graph, inbound pipeline, RBAC, billing) |

> No `@upstash/*` or `@sentry/*` dependency is required: rate-limiting falls back
> to an in-memory token bucket, and the logger's error-capture seam no-ops unless
> `SENTRY_DSN` + a registered capture fn are present. Both are documented drop-ins.

## Architecture

Three planes (see §1 of the plan for the full ASCII diagram):

- **Clerk** — identity / tenancy / RBAC authority. The active org id is the
  `workspaceId`; the org role maps to our internal role; a custom `org_status`
  session claim carries the disabled-member flag.
- **Appwrite** — the data plane, accessed **server-only** through the admin SDK.
  Every tenant document carries `workspaceId`; reads are query-injected with
  `Query.equal('workspaceId', orgId)` (`lib/appwrite/tenant.ts` `withTenant`).
- **Next.js** — render (RSC) + first-party mutations (Server Actions). Webhooks
  and workers (inbound processor, outbox, sync, schedulers) belong in **Appwrite
  Functions**, off the request path; the `src/app/api/*` route handlers cover the
  external contracts (Clerk/Razorpay/Meta webhooks, health, dev injector, usage,
  the cron drain) and the no-auth marketing `/api/demo`.

Directory map (abridged — full tree in plan §2):

```
appwrite/            migrate.ts (idempotent provisioner) · schema/* (24 collections) · functions/
scripts/             seed-demo · seed-razorpay-plans · dev-inbound · outbox-drain (npx tsx)
src/app/
  (marketing)/       public, static/SSG: landing · pricing · verticals/[slug] · demo
  (auth)/            Clerk hosted sign-in/up · accept-invite
  (app)/             force-dynamic RSC shell: inbox · leads · contacts · lists · templates · team · billing …
  api/               webhooks/{clerk,razorpay,whatsapp} · billing/usage · cron/outbox · dev/inject · demo · health
src/features/        per-domain SERVICE LAYER: {queries,actions,scope,...}.ts — UI talks ONLY to this
  ai-graph/          intent · extract · decide · respond · guards · packs/* (GRAPH_VERSION 0.6.1)
  whatsapp/          inbound · outbox · send · parse · verify · repo (appwrite + in-memory)
  search/            globalSearch Server Action (⌘K dynamic search)
src/lib/             appwrite/* · auth/* · billing/* · env · config · ratelimit · logger · utils
src/components/      ui/* (shadcn) · layout/* (shell, sidebar, top-bar, command-menu, plan-usage-widget) · motion/* · marketing/* · inbox/* · leads/* · campaigns/* …
```

## Quick start (local dev)

```bash
# 1. Install (one-time, network required)
npm install

# 2. Configure env — fill Clerk / Appwrite / Meta / Razorpay (see SETUP.md)
cp .env.example .env.local

# 3. Provision Appwrite collections (idempotent — re-run = no-op)
npm run appwrite:setup

# 4. (Optional) seed 12 vertical demo workspaces + a known phoneNumberId per vertical
npm run seed:demo

# 5. Run
npm run dev                 # http://localhost:3000
```

For local WhatsApp testing with **no real Meta account**, set
`WHATSAPP_MOCK_SEND=1` and `DEV_INJECT_TOKEN=<any>`, then:

```bash
# Inject a fully-signed inbound through the real webhook path (HMAC verified):
curl -s localhost:3000/api/dev/inject \
  -H "x-dev-inject-token: $DEV_INJECT_TOKEN" -H 'content-type: application/json' \
  -d '{"phoneNumberId":"20000000000000","from":"919999000001","text":"I want to book a demo"}'

# Or drive the processor directly (bypasses HTTP/signature), then drain the outbox:
npx tsx scripts/dev-inbound.ts "I want to book a demo"
npx tsx scripts/outbox-drain.ts
```

The full go-live runbook (Clerk roles/permissions, Appwrite scopes, Meta
webhook, Razorpay plans, the complete `.env.local` checklist) is in
[`SETUP.md`](./SETUP.md).

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next dev server (http://localhost:3000) |
| `npm run build` | Production build (env validates fail-fast) |
| `npm run start` | Serve the production build |
| `npm run lint` | Next / ESLint |
| `npm run test` | Vitest, run once (167 tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run appwrite:setup` | `tsx appwrite/migrate.ts` — idempotent collection provisioner |
| `npm run seed:demo` | `tsx scripts/seed-demo.ts` — 12 vertical demo workspaces |
| `npx tsx scripts/seed-razorpay-plans.ts` | Create the 4 paid Razorpay plans; prints `RZP_PLAN_*` ids |
| `npx tsx scripts/dev-inbound.ts "<text>" [pnid] [from] [name]` | Inject one inbound straight into the pipeline |
| `npx tsx scripts/outbox-drain.ts [limit]` | One outbox worker pass (mock send if `WHATSAPP_MOCK_SEND=1`) |

> `seed:razorpay`, `dev:inbound`, and `outbox:drain` are run with `npx tsx`
> (the scripts exist under `scripts/`); they are not yet `package.json` aliases.

## Conventions

### RSC vs. Client Components
- **Default to Server Components.** Pages and layouts are RSC; they read data
  through `features/*/queries.ts` (each starts with `import "server-only"`).
- **Client Components** (`"use client"`) are **leaf islands only**: anything
  using hooks, browser APIs, framer-motion, next-themes, or event handlers —
  e.g. `components/motion/*`, `components/providers/*`, the inbox realtime pane,
  the leads kanban, the command menu, the plan-usage widget.
- **UI never imports `lib/appwrite/*` directly** — only through `features/*`.
- `lib/env.ts` exports two zod schemas; importing `serverEnv` on the client is a
  type error. Use `publicEnv` / `NEXT_PUBLIC_*` in client code.

### Server Action vs. Route Handler
- **Server Actions** (`features/*/actions.ts`, `"use server"`) are the default
  for **first-party mutations and reads triggered from our own UI** (forms,
  buttons, the ⌘K `globalSearch`). They run on the server, enforce
  `requirePermission(...)` / tenant scope, and `revalidateTag` / `revalidatePath`.
- **Route Handlers** (`src/app/api/*/route.ts`) are for **external contracts
  only**: third-party webhooks (Clerk Svix, Razorpay/Meta raw-body HMAC), the
  health probe, the dev injector, the usage JSON, the cron drain, and the
  no-auth marketing `/api/demo`. They are never used for in-app mutations.

### Runtime annotations
- `(marketing)` — pure/static; landing, pricing, `verticals/[slug]` (SSG via
  `generateStaticParams`) and `demo` prerender as static HTML. No `server-only`
  imports, so they are edge-deployable; we keep them on the default runtime since
  they are already statically rendered.
- `(app)`, `(auth)` — `(app)/layout.tsx` is `export const dynamic = "force-dynamic"`
  (per-request Clerk `auth()` + Appwrite), so the build stays green without keys.
- **API route handlers** all set `export const runtime = "nodejs"` +
  `dynamic = "force-dynamic"` (they use Appwrite / Clerk / `node:crypto`).

### Theming & motion
Emerald primary (`160 84% 39%` light / `156 66% 52%` dark), `--radius: 0.75rem`,
full `--sidebar-*` group + a `--success` token. Tokens + utilities (`.glass`,
`.glow-primary`, `.bg-grid`, `.lift`, `.custom-scrollbar`, `animate-aurora`, the
reduced-motion kill-switch) live in `src/app/globals.css`. One
`MotionConfig reducedMotion="user"` at the root; animate transform/opacity only
with `EASE = [0.16, 1, 0.3, 1]`. Verified a11y: dark `muted-foreground` is
6.6:1 on `card` (WCAG AA), focus-visible rings on every interactive primitive,
keyboard nav on the leads kanban stage select and the ⌘K command menu.

## Phase status

The rewrite ships in 10 phases (plan §8). **All complete (0–9).**

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold & theming (tokens, motion, env, config) | ✅ |
| 1 | Appwrite data model (24+1 collections, idempotent migrate) | ✅ |
| 2 | Auth & RBAC (Clerk orgs/roles/permissions, middleware, webhook sync) | ✅ |
| 3 | AI graph + packs + guards (pure TS, `GRAPH_VERSION 0.6.1`) | ✅ |
| 4 | WhatsApp inbound pipeline + outbox (+ local-dev kit) | ✅ |
| 5 | Inbox & Leads UI (RBAC-scoped, realtime, kanban) | ✅ |
| 6 | CRM CRUD (contacts, lists, templates, teams) | ✅ |
| 7 | Razorpay billing (plans, entitlements, gating, webhook) | ✅ |
| 8 | Campaigns (agentic) + marketing/demo pages | ✅ |
| 9 | Polish: rate-limit, live plan-usage widget, ⌘K dynamic search, a11y, Sentry seam, health, docs | ✅ |

**Tests:** `npm run test` → 167 passing · `tsc --noEmit` clean · `npm run build`
green with no Clerk/Appwrite keys (the `(app)` group is force-dynamic).
