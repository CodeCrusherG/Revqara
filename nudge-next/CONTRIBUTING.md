# Contributing to `revqara-next`

Short guide to working in this codebase. For the why, read
[`../NEXTJS_REWRITE_PLAN.md`](../NEXTJS_REWRITE_PLAN.md); for setup, see
[`SETUP.md`](./SETUP.md).

## Project structure

```
appwrite/      migrate.ts (idempotent provisioner) · schema/* (one file per collection) · functions/
scripts/       seed-demo · seed-razorpay-plans · dev-inbound · outbox-drain (run via `npx tsx`)
src/app/       (marketing) static · (auth) Clerk · (app) force-dynamic RSC · api/* route handlers
src/features/  per-domain SERVICE LAYER — queries.ts (reads) · actions.ts (mutations) · scope.ts (RBAC)
src/lib/       appwrite/* · auth/* (rbac, context, guards) · billing/* · env · config · ratelimit · logger
src/components/ ui/* (shadcn primitives) · layout/* · motion/* · marketing/* · feature components
src/types/     appwrite model types · roles
```

## The service-layer rule (non-negotiable)

**UI never imports `lib/appwrite/*` directly.** All data access goes through the
`features/*` service layer:

- **Reads** live in `features/<domain>/queries.ts` — each starts with
  `import "server-only"`, calls `getRequestContext()` for tenancy/RBAC, and scopes
  every query with `withTenant(orgId, …)` (or `leadScopeQueries(ctx)` for the
  agent-sees-assigned rule). RSC pages call these directly.
- **Mutations** live in `features/<domain>/actions.ts` — `"use server"`, enforce
  `requirePermission(...)`, write through the admin SDK, then `revalidateTag` /
  `revalidatePath`. UI buttons/forms call these.
- A read/mutation triggered from our own UI is a **Server Action**, not a Route
  Handler. Route Handlers (`src/app/api/*`) are for **external contracts only**
  (webhooks, health, dev injector, usage JSON, cron). See the README for the
  full RSC-vs-Client and Action-vs-Route-Handler conventions.

Client components are leaf islands (`"use client"`): hooks, framer-motion,
event handlers. They receive serializable props from RSC parents and call Server
Actions — they must not import `server-only` modules.

## Testing

```bash
npm run test            # vitest, run once (167 tests)
npm run test:watch      # watch mode
npx tsc --noEmit        # strict typecheck
npm run build           # must stay green WITHOUT Clerk/Appwrite keys
```

Tests live next to their feature in `__tests__/`. The pure, deterministic cores
are the most important to cover and keep green:
- **AI graph** (`features/ai-graph/__tests__/*`) — intent classification,
  `_hasKeyword` boundary behaviour, `stageFor` precedence, the stage guards,
  per-vertical transitions. `GRAPH_VERSION` is `0.6.1`; the graph must run
  identically with **zero LLM env** (`confidence: null`).
- **Inbound pipeline** (`features/whatsapp/__tests__/*`) — dedup, opt-out,
  clarify, handoff, idempotent enqueue, mock-send drain.
- **RBAC** (`features/team/__tests__/*`) and **billing**
  (`lib/billing/__tests__/*`) — boundary/limit and idempotency cases.

When changing graph behaviour, port/extend the corresponding Python test in the
parent repo (`backend/tests/*`) so parity is provable.

## Adding a collection

1. Add a schema file under `appwrite/schema/<name>.ts` (attributes + indexes +
   unique constraints + `documentSecurity: true`) and register it in
   `appwrite/schema/index.ts`.
2. Add its id to `src/lib/appwrite/collections.ts` (`COLLECTION`).
3. Add the row type to `src/types/appwrite.ts`.
4. `npm run appwrite:setup` (idempotent — only the new collection is created).
5. Access it ONLY through a new/existing `features/<domain>/{queries,actions}.ts`
   (tenant-scoped + RBAC-gated). Never query it from the UI.

## Adding a vertical pack

1. Add the pack to `src/features/ai-graph/packs/data.ts` (label, tagline,
   `pipeline_stages`, `lead_fields`, intent→stage hints, `require_human_for`,
   persona prompt, KB). `getPack(unknown)` falls back to `custom`.
2. Add marketing copy in `src/lib/marketing/verticals.ts` (drives the SSG
   `verticals/[slug]` page and the `/demo` playground).
3. Add a transition test in
   `src/features/ai-graph/__tests__/vertical-transitions.spec.ts`.
4. (Optional) extend `scripts/seed-demo.ts` to seed a demo workspace for it.

## The phase model

The rewrite is sequenced into 10 independently-verifiable phases (plan §8), all
complete (0–9). New work should slot into the relevant feature/service module and
keep three invariants green: **167 tests pass**, **`tsc` clean**, and **`build`
green with no keys** (the `(app)` route group is `force-dynamic`). Don't add npm
dependencies without discussion — optional infra (Upstash rate-limiting, Sentry
capture) is wired behind no-dependency fallbacks.

## Commits

Branch off `master`; keep commits scoped. Run `npm run test` and `npx tsc
--noEmit` before pushing.
