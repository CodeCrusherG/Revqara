# Nudge — Next.js Rewrite Master Plan

> Authoritative, implementation-ready plan to rewrite the existing **FastAPI + React/Vite** vertical-aware AI WhatsApp CRM as **Next.js (App Router, TypeScript, RSC) + Appwrite + Clerk + Meta WhatsApp Cloud API JS SDK + Razorpay**, with **shadcn/ui + Tailwind + framer-motion + next-themes (light/dark)**. Target directory: `nudge-next/`. Ground truth verified against `backend/db/models.py` (24 tables), `backend/auth/rbac.py`, `backend/plans.py`, `backend/services/inbound.py`, `backend/ai_graph/{graph,packs,guards}.py` (GRAPH_VERSION `0.6.1`), `backend/tools/outbox.py`, and `SALES.md` (INR pricing).

---

## 1. Executive Summary & Target Architecture

### What we're preserving (non-negotiable behavioral parity)
- **Tenancy**: every domain row is `workspaceId`-scoped. The old switchable `ws` JWT claim becomes the **active Clerk Organization** (`auth().orgId`). The Clerk org id **is** the `workspaceId` (no extra join).
- **RBAC**: roles `owner > admin > manager > agent > viewer` with the verbatim 11-permission catalogue from `rbac.py`. Agents see only assigned leads/conversations; viewers see all but read-only.
- **AI graph**: ONE universal deterministic graph (classify → extract → decide → reply/handoff) parameterized by **12 vertical packs + `custom`**, with safety guards (opt-out, no-regression, terminal-stage). LLM is optional polish only; deterministic path is the contract (`confidence=null`, `confidence_source="deterministic"`, `graph_version="0.6.1"`).
- **Durability**: `webhook_events` (dedup), `message_outbox` (transactional outbox), `ai_traces`, `sync_runs` — same idempotency keys (`optout:<id>`, `clarify:<id>`, `reply:<id>`) and at-most-once guarantees.

### What changes
| Existing | nudge-next |
|---|---|
| `ws` JWT claim + `get_auth_context` | Clerk active org + `getRequestContext()` (React-`cache`d) |
| `services/api.js` axios + interceptors | **deleted** — RSC server reads + Server Actions |
| `services/inbound.py` + in-process `ai_graph` | Appwrite Function `inbound-processor` + `functions/shared` |
| `_outbox_loop`/`_sync_loop`/`_scheduler_loop` threads | scheduled/triggered **Appwrite Functions** |
| pywa + local simulator | **Meta WhatsApp Cloud API JS SDK** |
| `plans.py` mock billing | **Razorpay** subscriptions + webhook (5 INR tiers) |
| Postgres ACID transactions / unique constraints | **`$id`-as-natural-key** (atomic dedup) + idempotent get-or-create |

### Target architecture (ASCII)

```
                          ┌─────────────────────────────────────────────────┐
   Meta WhatsApp ───────▶ │  Appwrite Function: whatsapp-webhook (HTTP)      │
   (Cloud API)            │   verify HMAC → webhook_events dedup ($id) →     │
                          │   enqueue inbound-processor execution → 200 fast │
                          └───────────────┬─────────────────────────────────┘
                                          ▼
                          ┌─────────────────────────────────────────────────┐
   ┌── Clerk (identity) ─▶│  Appwrite Function: inbound-processor (async)    │
   │   Orgs == workspaces │   route by phone_number_id → upsert convo/contact│
   │   roles == RBAC      │   guards (opt-out/meaningful) → ai-graph (shared)│
   │                      │   → leads + ai_traces → enqueue message_outbox   │
   │                      └───────────────┬─────────────────────────────────┘
   │                                      ▼
   │   webhooks            ┌──────────────────────────┐   ┌──────────────────┐
   │  ┌─────────────────┐  │ Function: outbox-worker  │──▶│ Meta Cloud API   │
   │  │ clerk-webhook   │  │  (CRON 1m) claim→send→   │   │  JS SDK (send)   │
   │  │ razorpay-webhook│  │  backoff→dead; wamid back│   └──────────────────┘
   │  │ (HTTP fns)      │  │ Function: sync-worker    │
   │  └────────┬────────┘  │ Function: campaign-sched │
   │           │           └──────────────┬───────────┘
   │           ▼                          ▼
   │   ┌───────────────────────────────────────────────────────────────────┐
   │   │              Appwrite Databases  (database id: "crm")              │
   └──▶│  24 collections, all tenant docs carry workspaceId + Team perms    │
       │  workspaces · workspace_members · contacts · conversations ·       │
       │  inbox_messages · leads · ai_traces · message_outbox · ... + Storage│
       └───────────────────────────▲───────────────────────────────────────┘
                                    │ node-appwrite admin SDK (server-only)
       ┌────────────────────────────┴──────────────────────────────────────┐
       │                  Next.js App Router (Vercel/node)                  │
       │  middleware.ts (clerkMiddleware: auth + active-org + disabled gate)│
       │  (marketing) edge SSG  │  (auth) Clerk  │  (app) RSC + Server Actions│
       │  features/* service layer · lib/{auth,appwrite,billing} · withTenant│
       │  shadcn/ui + framer-motion + next-themes (light/dark)              │
       └───────────────────────────────────────────────────────────────────┘
```

**Three planes**: Clerk = identity/tenancy/RBAC authority. Appwrite = data plane (server-only, API-key access). Next.js = render + first-party mutations (RSC + Server Actions); webhooks/workers live in Appwrite Functions, not the request path.

---

## 2. Definitive File/Folder Tree (`nudge-next/`)

```text
nudge-next/
├─ .env.local / .env.example          # §9
├─ next.config.mjs
├─ middleware.ts                       # clerkMiddleware: auth + active-org redirect + disabled gate + req-id
├─ tailwind.config.ts                  # (optional; Tailwind v4 keeps tokens in globals.css)
├─ components.json                     # shadcn: style=new-york, rsc=true, tsx=true, baseColor=zinc
├─ tsconfig.json                       # path alias @/* -> src/*
├─ package.json                        # scripts: dev, appwrite:setup, dev:inbound, outbox:drain, seed:demo
├─ vitest.config.ts
├─ appwrite/
│  ├─ appwrite.json                    # project/collections/indexes IaC (declarative)
│  ├─ schema/                          # one file per collection: attributes + indexes + perms
│  │  ├─ workspaces.ts workspaceMembers.ts workspaceInvites.ts
│  │  ├─ salesTeams.ts salesTeamMembers.ts leadAssignments.ts
│  │  ├─ whatsappAccounts.ts contacts.ts contactLists.ts contactListMembers.ts
│  │  ├─ templates.ts bots.ts conversations.ts inboxMessages.ts leads.ts
│  │  ├─ aiTraces.ts webhookEvents.ts messageOutbox.ts syncRuns.ts
│  │  ├─ campaigns.ts customerProfiles.ts segments.ts variants.ts agentLogs.ts
│  │  └─ whatsappMessages.ts billingWebhookEvents.ts
│  ├─ migrate.ts                       # idempotent provisioner (409-tolerant, polls attr readiness)
│  └─ functions/                       # deployed separately
│     ├─ whatsapp-webhook/             # Meta inbound: GET verify + POST HMAC verify, dedup, enqueue
│     ├─ inbound-processor/            # port of services/inbound.py (the heart)
│     ├─ outbox-worker/                # CRON 1m: drain message_outbox -> Meta send (backoff/dead)
│     ├─ sync-worker/                  # CRON 15m: reconcile statuses; writes sync_runs
│     ├─ campaign-scheduler/           # CRON: launch scheduled campaigns (replaces _scheduler_loop)
│     ├─ clerk-webhook/                # user/org/membership sync -> Appwrite
│     ├─ razorpay-webhook/             # subscription events -> workspace plan
│     └─ shared/                       # graph/ packs/ guards/ outbox/ appwriteAdmin.ts (reused by fns)
├─ scripts/
│  ├─ seed-demo.ts                     # port seed_demo.py (12 vertical demo workspaces)
│  └─ seed-razorpay-plans.ts           # create 4 Razorpay plans -> print plan ids for env
├─ public/
└─ src/
   ├─ app/
   │  ├─ layout.tsx                    # <html suppressHydrationWarning> + next/font + ClerkProvider
   │  │                                #   (themed) + ThemeProvider + MotionConfig + Toaster
   │  ├─ globals.css                   # Tailwind layers + light/dark CSS vars + utilities (§7)
   │  ├─ not-found.tsx · error.tsx     # root boundaries
   │  ├─ (marketing)/                  # public, edge, SSG/ISR, own theme toggle
   │  │  ├─ layout.tsx · page.tsx      # Landing
   │  │  ├─ pricing/page.tsx           # INR pricing (static from PLANS)
   │  │  ├─ verticals/[slug]/page.tsx  # 12 specialist pages (generateStaticParams)
   │  │  └─ demo/page.tsx              # public vertical demo playground (no auth)
   │  ├─ (auth)/
   │  │  ├─ sign-in/[[...sign-in]]/page.tsx · sign-up/[[...sign-up]]/page.tsx
   │  │  └─ accept-invite/page.tsx     # Clerk org invitation accept
   │  ├─ (app)/
   │  │  ├─ layout.tsx                 # auth gate + AppShell; redirects no-org -> /onboarding
   │  │  ├─ template.tsx               # PageTransition (framer)
   │  │  ├─ onboarding/page.tsx        # create org / pick vertical (first-run)
   │  │  ├─ page.tsx                   # Brief (New Campaign) — home
   │  │  ├─ inbox/page.tsx             # conversation list (3-pane resizable)
   │  │  │  └─ [conversationId]/page.tsx  # thread (server shell + client realtime pane)
   │  │  ├─ leads/page.tsx             # kanban by pipeline_stages (RBAC-scoped)
   │  │  ├─ contacts/page.tsx · lists/page.tsx · templates/page.tsx
   │  │  ├─ team/page.tsx · sales-teams/page.tsx
   │  │  ├─ campaigns/[id]/approval/page.tsx · campaigns/[id]/dashboard/page.tsx
   │  │  ├─ settings/page.tsx          # vertical, bot persona/KB, WhatsApp numbers
   │  │  └─ billing/page.tsx           # Razorpay plan + usage
   │  └─ api/                          # Route Handlers — external contracts only
   │     ├─ webhooks/clerk/route.ts    # thin re-dispatch OR handle (Svix verify)
   │     ├─ webhooks/razorpay/route.ts # HMAC verify + idempotent lifecycle
   │     ├─ webhooks/whatsapp/route.ts # OPTIONAL if Meta points at Next, not the fn
   │     ├─ billing/usage/route.ts     # usage meters JSON
   │     ├─ dev/inject/route.ts        # DEV-ONLY signed inbound injector
   │     └─ health/route.ts
   ├─ features/                        # per-domain server logic ("service layer")
   │  ├─ contacts/  { queries.ts, actions.ts, schema.ts, types.ts }
   │  ├─ leads/     { queries.ts, actions.ts, schema.ts, scope.ts }   # scope.ts = RBAC lead filter
   │  ├─ inbox/     { queries.ts, actions.ts, realtime.ts }
   │  ├─ campaigns/ templates/ lists/ team/ salesTeams/ billing/ whatsapp/ workspaces/
   │  └─ ai-graph/  { graph.ts, packs/, guards.ts, intent.ts, extract.ts, decide.ts, respond.ts, llm/ }
   ├─ lib/
   │  ├─ appwrite/
   │  │  ├─ admin.ts                   # API-key client (server-only)
   │  │  ├─ server.ts                  # createServerClient(): admin + JWT-session clients
   │  │  ├─ collections.ts             # typed COLLECTION ids + DB id
   │  │  └─ tenant.ts                  # withTenant(): inject workspaceId into every Query
   │  ├─ auth/
   │  │  ├─ context.ts                 # getRequestContext()/requireAuthContext()
   │  │  ├─ rbac.ts                    # ROLE_RANK, perms, hasPermission, canManageRole (port rbac.py)
   │  │  ├─ require.ts                 # requirePermission/requireRole
   │  │  └─ guards.ts                  # activeOwnerCount, assertNotLastOwner
   │  ├─ billing/  { plans.ts, entitlements.ts, gating.ts }
   │  ├─ env.ts                        # zod server vs NEXT_PUBLIC, fail-fast
   │  ├─ config.ts                     # vertical slugs, pipeline defaults, feature flags
   │  ├─ ratelimit.ts · logger.ts · utils.ts (cn)
   ├─ components/
   │  ├─ ui/                           # shadcn primitives (generated .tsx)
   │  ├─ layout/                       # AppShell, AppSidebar, TopBar, CommandMenu, RoleGate, PlanUsageWidget
   │  ├─ providers/                    # ThemeProvider, (QueryProvider)
   │  ├─ motion/                       # pageVariants, Stagger, FadeIn, Reveal, AnimatedNumber
   │  ├─ marketing/                    # AgentOrbitals, aurora, ProductMock
   │  └─ ai/                           # AIPredictionCard, TimelineNode (AI activity)
   ├─ hooks/                           # useRealtime, useOptimisticLead, useDebounce
   ├─ types/                           # appwrite model types, clerk role types
   └─ styles/                          # Stitch design-token output lands here
```

**Conventions**: `kebab-case` routes, `PascalCase` components, `camelCase` functions. UI never imports `lib/appwrite/*` directly — only through `features/*`. Every `features/*/queries.ts` and `lib/appwrite/admin.ts` starts with `import "server-only"`.

---

## 3. Appwrite Data Model

Single database `crm` (`databaseId: "crm"`). **24 domain collections + 1 billing-idempotency collection.** Legend: R=required, D=default, ⬡=enum, ▢=string-array, ⟦json⟧=stringified JSON (`…Json`).

### Foundational decisions
| Concern | Decision |
|---|---|
| Tenancy key | `workspaceId` **string attribute** (= Clerk org id `org_…`) on every tenant doc. Primary scoping is **query-injected** `Query.equal('workspaceId', orgId)`, not document permissions. |
| Defense-in-depth | Per-org **Appwrite Team** (created on `organization.created`); tenant docs also carry `Permission.read(Team(<teamId>))`, `update(Team(...,'manager'))`, `delete(Team(...,'admin'))`. `documentSecurity:true`. Workers use the API key (bypass perms by design). |
| ID strategy | `ID.unique()` for most. **Natural-key `$id`** (atomic, race-free idempotency) for: `webhook_events` (`sha256(provider:eventId)`), `message_outbox` (`sha256(workspaceId:idempotencyKey)`), `whatsapp_accounts` (`= phoneNumberId`), `workspaces` (`= org_…`), `billing_webhook_events` (`= eventId`). |
| Enums vs strings | Native Enum for closed app-controlled sets (roles, statuses, directions, `CampaignStatus`). **String + app-validation** for per-vertical/extensible sets: `leads.status` (pipeline stage — packs override it), `vertical`, `intent`. |
| JSONB | No JSON type → `String(size)` named `…Json` (8k…1M). Lists you **filter by membership** (`contacts.tags`, `segments.customerIds`, `ai_traces.tagsAdded`, `customer_profiles.segmentTags`) → **String[] array attribute** + array index. |
| Timestamps | Drop generic `created_at/updated_at` → use `$createdAt/$updatedAt`. Keep semantic ones (`lastInboundAt`, `nextAttemptAt`, `sentAt`, `optInAt`, `scheduledAt`, `processedAt`, `currentPeriodEnd`, etc.). |
| Relationships | **No Appwrite relationship attributes** — plain string FK + index + app-side join (tenant-safe, mirrors current id joins). |
| Secrets | `whatsapp_accounts.access_token` → `accessTokenRef` only; real token in Function env / Appwrite secret, never queryable in a doc. |

### Collection inventory (mapped 1:1 to `models.py`)

**Identity & tenancy**
- **`workspaces`** *(global, `$id`=org id)*: `name`(R), `plan`⬡`free,starter,growth,ai_pro,agency`(D`free`), `planStatus`⬡`none,trialing,active,past_due,cancelled,halted`(D`none`), `vertical`(D`custom`), `appwriteTeamId`, `rzpCustomerId`, `rzpSubscriptionId`(idx), `currentPeriodEnd`, `billingEmail`. Indexes: `plan`, `planStatus`, `rzpSubscriptionId`.
- **`workspace_members`** *(mirror of Clerk membership)*: `workspaceId`(R,idx), `userId`(R,idx), `email`, `role`⬡roles(D`agent`), `status`⬡`active,disabled`(D`active`). **Unique `(workspaceId,userId)`** [=`uq_workspace_member`]; `key(workspaceId,role)`.
- **`workspace_invites`** *(optional — Clerk Invitations are primary; keep as thin mirror for in-app list)*: `workspaceId`, `email`, `role`⬡, `status`⬡`pending,accepted,revoked,expired`, `expiresAt`, `acceptedAt`.

**Sales routing**
- **`sales_teams`**: `workspaceId`(R,idx), `name`(R), `description`. **Unique `(workspaceId,name)`**.
- **`sales_team_members`**: `workspaceId`(R,idx), `teamId`(R,idx), `userId`(R,idx). **Unique `(teamId,userId)`**.
- **`lead_assignments`** *(append-only)*: `workspaceId`(R,idx), `leadId`(R,idx), `assignedToUserId`(idx), `assignedToTeamId`(idx), `assignedByUserId`, `status`⬡`active,reassigned,closed`(D`active`). `key(workspaceId,leadId,status)`.

**Channel & CRM core**
- **`whatsapp_accounts`** *(global, `$id`=`phoneNumberId`)*: `workspaceId`(R,idx), `wabaId`, `phoneNumberId`(R), `displayPhoneNumber`, `verifiedName`, `accessTokenRef`, `status`⬡`connected,disconnected,error`(D`connected`). O(1) routing via `getDocument(phoneNumberId)`.
- **`contacts`**: `workspaceId`(R,idx), `fullName`, `whatsappNumber`(R), `email`, demographic columns flat (`age,gender,city,occupationType,monthlyIncome,creditScore,kycStatus,appInstalled,existingCustomer,socialMediaActive`), `attributesJson`⟦json⟧, `tags`▢, `optInStatus`⬡`opted_in,opted_out,unknown`(D`unknown`), `optInSource`, `optInAt`. **Unique `(workspaceId,whatsappNumber)`**; `key(workspaceId,optInStatus)`; `key(tags)`.
- **`contact_lists`**: `workspaceId`(R,idx), `name`(R), `description`.
- **`contact_list_members`**: `workspaceId`(R,idx, *added for scoping*), `listId`(R,idx), `contactId`(R,idx). **Unique `(listId,contactId)`**.
- **`templates`**: `workspaceId`(R,idx), `name`(R), `category`⬡`marketing,utility,authentication,service`, `language`(D`en`), `body`(R), `status`⬡`draft,pending,approved,rejected`. **Unique `(workspaceId,name)`**.
- **`bots`** *(1:1 per workspace)*: `workspaceId`(R, **unique**), `enabled`(D`true`), `handoffEnabled`(D`true`), `name`, `prompt`, `knowledge`.
- **`conversations`**: `workspaceId`(R,idx), `phoneNumberId`(R), `customerWaId`(R), `customerName`, `contactId`(idx), `status`⬡`open,closed`(D`open`), `autoReply`(D`true`), `unread`(D`true`), `lastInboundAt`. **Unique `(workspaceId,phoneNumberId,customerWaId)`**; `key(workspaceId,status,lastInboundAt)`.
- **`inbox_messages`**: `workspaceId`(R,idx), `conversationId`(R,idx), `direction`⬡`inbound,outbound`(R), `sender`⬡`customer,bot,agent`(R), `text`, `wamid`. `key(conversationId,$createdAt)`; `key(wamid)`.
- **`leads`**: `workspaceId`(R,idx), `conversationId`(idx), `contactId`(idx), `name`, `phone`, `intent`, `details`, `source`⬡`bot,agent`(D`bot`), `status`String(48)(D`new` — **pipeline stage**, pack-validated), `assignedToUserId`(idx), `assignedToTeamId`(idx), `needsHuman`(D`false`). `key(workspaceId,status)`; `key(workspaceId,assignedToUserId)`; `key(workspaceId,needsHuman)`; **unique `(conversationId)`** (one lead per conversation).

**AI audit, idempotency, outbox, sync**
- **`ai_traces`**: `workspaceId`(R,idx), `contactId/leadId/conversationId(idx)/inboundMessageId`, `vertical`, `intent`, `confidence`Float(**nullable**), `confidenceSource`⬡`llm,deterministic,rule,unknown`, `extractedFieldsJson`⟦json⟧, `stageBefore/stageAfter`, `tagsAdded`▢, `nextAction`, `handoffRequired`(D`false`), `handoffReason`, `fallbackUsed`(D`false`), `modelUsed`, `graphVersion`, `error`. `key(workspaceId,$createdAt)`; `key(conversationId)`.
- **`webhook_events`** *(global, `$id`=`sha256(provider:eventId)`)*: `workspaceId`(idx), `provider`⬡`whatsapp_cloud,whatsapp_sim`(R), `providerEventId`(R), `messageId`, `payloadJson`⟦json⟧, `status`⬡`received,processing,processed,failed,ignored_duplicate`(D`received`), `error`, `processedAt`. `key(provider,providerEventId)`; `key(workspaceId,status)`.
- **`message_outbox`** *(`$id`=`sha256(workspaceId:idempotencyKey)`)*: `workspaceId`(R,idx), `contactId/conversationId(idx)/inboxMessageId`, `channel`⬡`whatsapp`(D`whatsapp`), `payloadJson`⟦json⟧`{to,text,sender}`(R), `idempotencyKey`(R), `status`⬡`pending,sending,sent,failed,dead`(D`pending`), `attempts`(D0), `maxAttempts`(D5), `nextAttemptAt`, `providerMessageId`, `lastError`, `sentAt`. `key(status,nextAttemptAt)` (worker claim); `key(workspaceId,idempotencyKey)`.
- **`sync_runs`** *(global)*: `workspaceId`(idx), `syncType`⬡`message_status,contacts,campaigns,full_workspace`(R), `cursorJson`, `status`⬡`running,success,failed`(D`running`), `statsJson`, `startedAt`, `completedAt`, `error`. `key(workspaceId,syncType,$createdAt)`.

**Agentic campaigns**
- **`campaigns`**: `workspaceId`(idx), `name`, `brief`(R), `targetListId`, `templateId`, `scheduledAt`, `status`⬡(11-value `CampaignStatus`: `profiling…scheduled`), `stateCheckpointJson`⟦json,1M⟧, `rejectionFeedback`. `key(workspaceId,status)`.
- **`customer_profiles`**: `workspaceId`(idx), `customerId`(R,idx), flat demographics, `rawDataJson`, `segmentTags`▢.
- **`segments`**: `workspaceId`(idx), `campaignId`(R,idx), `label`(R), `criteriaJson`, `customerIds`▢, `sendTime`, `predictedOpenRate`F, `predictedClickRate`F.
- **`variants`**: `workspaceId`(idx), `segmentId`(R,idx), `externalCampaignId`, `subject`, `body`(R), `hasEmoji/hasUrl`, `fontStylesJson`, `sentCount/openCount/clickCount`(D0).
- **`agent_logs`**: `workspaceId`(idx), `campaignId`(R,idx), `agentName`(R), `step`, `inputPayloadJson`, `outputPayloadJson`, `llmReasoning`.
- **`whatsapp_messages`** *(campaign send + engagement; drives `sends_today` metering)*: `workspaceId`(idx), `broadcastId`(R,idx), `campaignId`(idx), `customerId`(R,idx), `waId`(idx), `wamid`(idx), `tracker`(R,idx `"{broadcastId}:{customerId}"`), `status`⬡`sent,delivered,read,failed`(D`sent`), `clicked/replied`(D`false`). `key(workspaceId,broadcastId)`; `key(tracker)`; `key(waId)`.

**Billing idempotency**
- **`billing_webhook_events`** *(`$id`=`eventId`)*: `type`, `processedAt`, `payloadHash`. (Razorpay retry dedup, §6.)

> `api_call_logs` from the old model is **dropped** — rate-limiting moves to `lib/ratelimit.ts` (Upstash token-bucket) / Appwrite Function abuse limits.

### Bootstrap (`appwrite/migrate.ts`)
Idempotent provisioner using `node-appwrite` + server API key. Every create wrapped in a `409`-tolerant `ok()` helper. **Polls `getCollection` until `attributes[*].status==='available'`** before creating indexes that reference them. `documentSecurity:true` on all collections. CI-runnable; `409` = "already provisioned." Run via `pnpm appwrite:setup`.

---

## 4. Auth & RBAC with Clerk

**Workspace = Clerk Organization.** The Clerk org id is used directly as `workspaceId` (no lookup). Clerk is the authority for identity/tenancy/role; Appwrite mirrors it for joins.

### Roles & permissions (Clerk Dashboard)
Create 5 org roles: `org:owner`(rank 4), `org:admin`(3), `org:manager`(2), `org:agent`(1), `org:viewer`(0). Create 11 custom permissions mirroring `rbac.py`: `org:billing:manage`, `org:workspace:edit`, `org:workspace:delete`, `org:team:manage`, `org:campaigns:manage`, `org:templates:manage`, `org:settings:manage`, `org:contacts:manage`, `org:leads:view_all`, `org:leads:assign`, `org:reports:view`.

Per-role grants (verbatim from `ROLE_PERMISSIONS`):
- `owner` → **all** (special-cased; `billing:manage`, `workspace:edit/delete` are owner-only).
- `admin` → team, campaigns, templates, settings, contacts, leads:view_all, leads:assign, reports.
- `manager` → leads:view_all, leads:assign, reports, contacts.
- `agent` → none (assigned-only, enforced in Appwrite query).
- `viewer` → reports only.

### `lib/auth/rbac.ts` — 1:1 port
```ts
export const ROLE_RANK = { 'org:owner':4,'org:admin':3,'org:manager':2,'org:agent':1,'org:viewer':0 } as const;
// hasPermission(role,perm): owner⇒true else ROLE_PERMISSIONS[role].has(perm)
// canViewAllLeads / canAssignLeads = hasPermission(r, 'org:leads:view_all' | ':assign')
export function canManageRole(actor, target) {        // port of can_manage_role
  if (!hasPermission(actor, 'org:team:manage')) return false;
  if (target === 'org:owner' && actor !== 'org:owner') return false;
  return ROLE_RANK[actor] >= ROLE_RANK[target];
}
```

### The four rules Clerk can't express natively
1. **`can_manage_role`** (rank comparison + owner-grant restriction): enforced in every membership-mutation Server Action — `canManageRole(actorRole, targetRole)` **and** `canManageRole(actorRole, newRole)`.
2. **Last-owner guard** (`assertNotLastOwner`): count active owners via Clerk Backend API (`getOrganizationMembershipList`, paginate, exclude target, require `role==='org:owner' && publicMetadata.status==='active'`); block demote/disable/remove if it would hit zero. Ports `_active_owner_count` in `team.py`.
3. **Disabled member** (`status="disabled"` kept, not removed): set membership `publicMetadata.status='disabled'`. **Enforced on every protected request** — Clerk would otherwise authorize a disabled-but-present member. Surfaced into the session token via a custom claim `org_status = {{org_membership.public_metadata.status}}` and checked in middleware + `requireAuthContext` (403). Disabled members still appear in `list_members`.
4. **Agent-sees-assigned**: `features/leads/scope.ts` `leadScopeQueries(ctx)` always prepends `Query.equal('workspaceId', orgId)`; if **not** `canViewAllLeads` and role ≠ viewer, adds `Query.or([equal('assignedToUserId',userId), equal('assignedToTeamId', myTeamIds)])`. Viewer bypasses the filter (sees all) but all mutating actions reject viewer. Same filter applied to inbox conversations.

### Request lifecycle
1. **`middleware.ts`** (`clerkMiddleware`, edge-safe, no Appwrite): public matcher (`(marketing)`, `(auth)`, `/api/webhooks(*)`) passes; protected `(app)`/`api` → unauthenticated `redirectToSignIn()`; authed but **no active org** → `redirect('/onboarding')`; `sessionClaims.org_status==='disabled'` → 403; attach request-id header.
2. **`getRequestContext()`** (`lib/auth/context.ts`, React-`cache()`d, server-only): `const {userId,orgId,orgRole,sessionClaims}=await auth()` → map `orgRole`→internal role → load lightweight workspace doc (plan, vertical) once → returns `{ userId, orgId(=workspaceId), role, perms, vertical, plan, status }`. Throws `401` (no user/org) / `403` (disabled).
3. **`requirePermission(perm)`** at the top of every Server Action/RSC segment → throws `ForbiddenError` caught by nearest `error.tsx` (maps to 401/403/404 the FastAPI app raised).

### Clerk → Appwrite sync (`/api/webhooks/clerk` or `clerk-webhook` fn)
Svix-signed (`CLERK_WEBHOOK_SECRET`), idempotent (dedup on `svix-id` in `webhook_events`), keyed upserts:
| Clerk event | Appwrite action |
|---|---|
| `user.created/updated` | upsert member email/name across their workspace_members rows |
| `organization.created` | upsert `workspaces` doc (`$id`=org id, vertical/plan from publicMetadata); create per-org **Appwrite Team**; seed default `bots` doc |
| `organization.updated/deleted` | update / cascade-delete tenant docs where `workspaceId==org.id` |
| `organizationMembership.created/updated/deleted` | upsert/update/delete `workspace_members` (role + status); null `assignedToUserId` on that user's leads on delete |

Out-of-order tolerance: if membership arrives before org, upsert a stub workspace first. Return 2xx only after the Appwrite write commits. Heavy cascades offloaded to a queued Appwrite Function.

**Invites & switch**: replace `WorkspaceInvite` + raw-token flow with **Clerk Organization Invitations** (`createOrganizationInvitation`, gated by `requirePermission('org:team:manage')` + `canManageRole`); accept via Clerk hosted flow. Replace `POST /workspaces/{id}/switch` with client `setActive({ organization })` (Clerk server-verifies membership — the old "403 if not a member" is automatic). Create workspace = `createOrganization` (creator auto `org:owner`).

---

## 5. WhatsApp Pipeline + AI-Graph TS Port

### Inbound webhook (`whatsapp-webhook` Appwrite Function, or `/api/webhooks/whatsapp` route — node runtime)
- **GET**: verify challenge against `WHATSAPP_VERIFY_TOKEN` → echo `hub.challenge`.
- **POST**: read **raw** body, verify Meta `X-Hub-Signature-256` HMAC-SHA256 against `WHATSAPP_APP_SECRET` (timing-safe) → 403 on bad signature (the one genuinely new security step; the old simulator was unsigned). Parse → loop `entry[].changes[].value.messages[]`, drop `value.statuses[]`, process each → **always 200** (per-message failures logged, never fail the HTTP response, mirroring `inbound.py`). Returns fast; enqueues an `inbound-processor` execution.

### `inbound-processor` — exact port of `process_inbound_message`
Appwrite has no ACID transactions; parity comes from **`$id`-collision-as-idempotency-primitive** + careful ordering. Steps verbatim:
1. **`webhook_events` dedup first** — `createDocument` with `$id=sha256(provider:eventId)`; `409`⇒duplicate⇒flip `received`→`ignored_duplicate`, return early.
2. **Route by `phone_number_id`** — `getDocument('whatsapp_accounts', phoneNumberId)` → `workspaceId`; none ⇒ mark event `failed`/`no workspace`, return.
3. **Upsert conversation + contact** on `(workspaceId,phoneNumberId,customerWaId)`; `lastInboundAt=now`, `unread=true`, `status=open`; contact matched on `normalizePhone(s)=s.replace(/\D/g,'')||s`.
4. **Opt-out short-circuit** (`isOptOut`) → contact `opted_out`, store inbound + `OPT_OUT_REPLY`, enqueue key `optout:<id>`, return. Else mark `opted_in`.
5. **Unsupported text** (`!isMeaningfulText`) → store inbound (`text||"[unsupported message]"`), and **only if** `convo.autoReply && (bot.enabled??true)` enqueue `CLARIFY_REPLY` key `clarify:<id>`, return.
6. Store inbound text; campaign attribution (`whatsapp_messages.replied=true` for latest send to `waId`).
7. **Lead capture**: get/create lead on `conversationId`; `stageBefore=lead.status`; `intent=intent.toLowerCase()`; `details=text.slice(0,500)`; `proposed=stageFor(...)`; if `canAiUpdateStage(...)` set it; add tag (`[...new Set([...tags, intent.toLowerCase()])]`).
8. Ownership: `aiOwned = autoReply && botEnabled`; `humanOwned = !aiOwned`.
9. If `aiOwned`: build history (msgs asc), `runMessageGraph(...)`; if extracted fields overwrite details; if handoff → `autoReply=false`, `needsHuman=true`; store outbound (`sender = handoff ? 'agent':'bot'`); enqueue key `reply:<id>`.
10. **Always** write `ai_traces` (even human-owned; `nextAction='human_takeover'`).
11. Mark event `processed`/`processedAt` **last**.

**Idempotency keys verbatim**: `optout:<id>`, `clarify:<id>`, `reply:<id>` (`<id>`=`providerEventId`=wamid). Enqueue is get-or-create on `$id=sha256(workspaceId:idempotencyKey)` (the `uq_outbox_idem` guarantee, atomic). Crash-safety: domain writes then enqueue; Meta redelivery replays the whole deterministic pipeline (every create is get-or-create) ≈ exactly-once.

### AI-graph TS port (`features/ai-graph/` ⇄ `functions/shared/`)
Pure, dependency-light, deterministic. `GRAPH_VERSION="0.6.1"`. Modules: `intent.ts` (`classifyIntent`, `_INTENT_RULES`, `_hasKeyword`), `extract.ts`, `decide.ts` (`decideAction`, `stageFor`), `respond.ts` (`generateResponse`), `guards.ts`, `packs/` (12 packs + `custom`, `getPack` unknown→custom+warn, `listVerticals`), `llm/client.ts`.

**Behaviors preserved byte-for-byte**:
- `_hasKeyword`: for `/^[a-z0-9]+$/` keywords use boundary regex `(?<![a-z0-9])kw(?![a-z0-9])` (so `sc`/`st` don't match inside `street`); else substring. Load-bearing for `political_party`.
- `classifyIntent`: iterate rules in order, first match `@0.75`; else `_POSITIVE`→`NEW_LEAD@0.55`; else `UNKNOWN@0.3`. Keep duplicate `PAYMENT_QUERY` rule positions.
- `stageFor`: `keyword_stage_hints` (∈ `pipeline_stages`) → pack `stage_hints[intent]` substring → hardcoded `wanted` map → null.
- `decideAction`: `handoff = intent∈{COMPLAINT,HUMAN_REQUEST}` OR any `require_human_for` keyword via `_hasKeyword`.
- `generateResponse`: the exact if/elif template ladder; `SUPPORT_QUERY` uses `kb.slice(0,300)`.
- `runMessageGraph` returns `confidence:null`, `confidence_source:"deterministic"` always.
- **Guards** (`guards.ts`): `HARD_TERMINAL` set (13 stages), `REVIVE_INTENTS` set, `isOptOut`/`isMeaningfulText`/`canAiUpdateStage` verbatim (blocks no-op/equal, humanOwned, terminal, lost-without-revive, backward regression).

**LLM** (`llm/client.ts`): `chat(messages): Promise<string|null>` **never throws** (try/catch + `AbortController` timeout). Two seams — `respond.ts` (persona polish; success⇒`fallback_used:false,model_used:<id>`, fail⇒base template `fallback_used:true`) and `extract.ts` (optional field extraction). `LLM_ENABLED` unset/false ⇒ fully deterministic, identical to today. Provider-agnostic adapter (env-driven base URL/model/key; Ollama or Anthropic Messages API drop-in).

### Outbound + outbox worker
- **`lib/whatsapp/send.ts`**: official Meta Cloud API JS SDK, `POST /{PHONE_NUMBER_ID}/messages` `{messaging_product,to,type:'text',text:{body}}`, bearer token; returns `messages[0].id` (wamid). `WHATSAPP_MOCK_SEND=1` ⇒ logs + returns `mock-<uuid>` (replaces pywa simulator send side).
- **`outbox-worker`** (CRON every 1 min): claim due rows (`status∈{pending,failed}`, `attempts<maxAttempts`, `nextAttemptAt<=now`, `limit 25`); optimistic `pending→sending` flip (Appwrite has no `SELECT FOR UPDATE`); send; success⇒`sent`+`providerMessageId`+`sentAt`, backfill `inbox_messages.wamid`; failure⇒`attempts++`, `dead` at `maxAttempts` else `failed` with `nextAttemptAt = now + min(300, 2**attempts)s` (cap 300, verbatim). Idempotent `$id` + Meta dedup are the double-send backstops.

### Local dev
Mock-send flag · `/api/dev/inject` (dev-only + `DEV_INJECT_TOKEN`, builds a real Meta-shaped payload, **signs with local `WHATSAPP_APP_SECRET`**, POSTs to the webhook — exercises the full prod path incl. signature) · `scripts/seed-demo.ts` (12 vertical workspaces + `whatsapp_accounts` with known `phoneNumberId` + bot) · `pnpm dev:inbound "<text>"` CLI · `pnpm outbox:drain` (one worker pass) · Demo-page "Send test message" button · ngrok recipe for real Meta webhook.

---

## 6. Razorpay Billing

### Plan catalogue (`lib/billing/plans.ts`) — 5 tiers from SALES.md
| Plan | INR/mo | maxContacts | maxSends/day | maxLists | maxNumbers | Razorpay |
|---|---|---|---|---|---|---|
| `free` | 0 | 500 | 200 | 5 | 1 | none |
| `starter` | 1,499 | 2,500 | 1,000 | 25 | 1 | `RZP_PLAN_STARTER` |
| `growth` | 2,999 | 15,000 | 5,000 | 100 | 3 | `RZP_PLAN_GROWTH` |
| `ai_pro` | 6,999 | 100,000 | 50,000 | 1,000 | 10 | `RZP_PLAN_AI_PRO` |
| `agency` | 14,999 | 1,000,000 | 250,000 | 10,000 | 50 | `RZP_PLAN_AGENCY` |

> `free`/`ai_pro` limits = the old `plans.py` `free`/`pro`. `starter`/`growth`/`agency` interpolations — config, not code; confirm with sales pre-launch. Helpers: `planDef(id)`, `planByRazorpayId(rzpId)`, `DEFAULT_PLAN='free'`.

### Model
One Razorpay **Plan per paid tier** (`period:monthly`, `amount` in paise, `currency:INR`), seeded once via `scripts/seed-razorpay-plans.ts`, stored in env. **One Subscription per workspace**; upgrade/downgrade = `PATCH /subscriptions/:id` (`schedule_change_at:'now'|'cycle_end'`). 14-day trial via `start_at = now + 14d` + local `planStatus='trialing'`.

### Checkout
`createSubscription(planId)` Server Action (auth'd, **owner/admin only** via `assertRole`): ensure Razorpay customer (`rzpCustomerId` on workspace), create subscription (`total_count:120`, `start_at` trial, `notes:{workspaceId,clerkOrgId,planId}`), persist `rzpSubscriptionId`+`plan`+`planStatus:'trialing'` optimistically. Client opens `checkout.js` in `subscription_id` mode; handler is **UX only** — activation happens **exclusively via webhook**.

### Webhook (`/api/webhooks/razorpay` — node runtime, raw body)
HMAC-SHA256 verify (`RAZORPAY_WEBHOOK_SECRET`, `timingSafeEqual`) → 400 on bad. Idempotent `claimEvent` (insert `billing_webhook_events` `$id=eventId`; if exists ⇒ `{deduped:true}`); `releaseEvent` on processing failure so retries re-run. Lifecycle → workspace state:
| Event | plan | planStatus | Gating |
|---|---|---|---|
| `subscription.authenticated` | paid | `trialing` | paid (trial) |
| `subscription.activated`/`charged` | paid | `active` | paid |
| `subscription.pending` | paid | `past_due` | paid + grace banner |
| `subscription.halted` | paid | `halted` | **free limits, block sends** |
| `subscription.cancelled`/`completed` | `free` | `cancelled` | free |

### Usage gating (`lib/billing/{entitlements,gating}.ts`)
Limits are config; **usage metered live** (parity with `plans.py`). `effectivePlan(ws)`: `trialing/active/past_due`⇒paid limits, else free. Live meters: `contactCount`, `listCount`, `numberCount`, `sendsToday` (count `whatsapp_messages` for workspace since UTC midnight — matches `sends_today`). Guards throw `GatedError(402)`:
| Site (Server Action / fn) | Maps to | Guard |
|---|---|---|
| Contact import/create/seed | `contacts.py:164,253,281` | `assertCanAddContacts(ws, n)` |
| List create | `contacts.py:326` | `assertCanCreateList(ws)` |
| WhatsApp number connect | `whatsapp_accounts.py:72` | `assertCanConnectNumber(ws)` |
| Campaign send / **outbox enqueue (in the worker fn)** | `remaining_sends_today` | cap batch to `remainingSendsToday(ws)` |

**Critical**: the sends/day cap is enforced **inside the outbox-worker Function** (sends are async/queued), not just at campaign-create. `GET /api/billing/usage` returns the extended usage shape (contacts/sends/lists/numbers). Pricing page reads `PLANS` statically.

---

## 7. Design System

### shadcn setup
`components.json`: `style:new-york`, `rsc:true`, `tsx:true`, `baseColor:zinc`, `iconLibrary:lucide`, aliases `@/components|ui|lib|hooks`. **Tailwind v4** recommended (tokens in `globals.css` via `@theme inline`, `@custom-variant dark`); v3 alternative supported (reuse existing `tailwind.config.js`, add `success` token). **`next/font`** (self-hosted Plus Jakarta Sans + JetBrains Mono) over Google `@import`.

### Theme tokens (carried **verbatim** from `frontend/src/index.css`)
Primary = emerald `160 84% 39%` (light) / `156 66% 52%` (dark); `--radius:0.75rem`; full `--sidebar-*` token group; **new `--success`** token. Both light/dark tables ship from day one. Utilities carried over: `.custom-scrollbar`, `.lift`, `.glass`, `.glow-primary`, `.bg-grid`/`.bg-grid-fade`, `.animate-aurora`, the reduced-motion kill-switch, `tabular-nums`. `next-themes` `attribute="class" defaultTheme="system" enableSystem`; Clerk `appearance.baseTheme` driven off `useTheme()` + `variables.colorPrimary:#10b981`.

### framer-motion conventions
- **One `MotionConfig reducedMotion="user"`** at root (never per-page). Animate **transform + opacity only**. Durations: micro `0.15s`, standard `0.2–0.3s`. Easing `[0.16,1,0.3,1]` (`EASE`).
- `components/motion/`: `pageVariants` (in `(app)/template.tsx` — re-mounts per nav), `staggerParent/staggerItem`, `FadeIn`, `Stagger`, `Reveal` (scroll), `AnimatedNumber` (`useSpring`, tabular-nums).
- `layoutId="sidebar-active"` (active pill) reused for kanban card moves + tab underlines. `AnimatePresence mode="popLayout"` for reordering lists (inbox threads, leads). All motion = client leaf islands.

### Screen → route → component inventory
| Route | Screen | Key components |
|---|---|---|
| `(marketing)/` | Landing | AgentOrbitals, aurora, bg-grid, glass, Reveal, ProductMock, INR pricing |
| `(marketing)/demo` | Demo | vertical `select`, simulated Inbox/Leads (seeded `demoVerticals`), no auth |
| `(auth)/*` | Sign-in/up, Accept-invite | Clerk hosted + `<OrganizationProfile>` |
| `(app)/` | Brief (New Campaign) | `form`(rhf+zod), vertical `select`, generating skeleton, AIPredictionCard |
| `(app)/inbox` | Inbox | `resizable` 3-pane→`sheet` on mobile, chat bubbles, AI auto-reply `switch`, **AI Activity Timeline** (TimelineNode), assignment `select` (role-gated), `needs_human` `alert` |
| `(app)/leads` | Leads | kanban by `pipeline_stages` (framer `layoutId`), StageBadge, `u:`/`t:` assignment `select`, filter `toggle-group`, keyboard stage `select` (a11y) |
| `(app)/team` | Team | members `data-table`, role `select` (RBAC-gated), Invite `dialog`→Clerk |
| `(app)/sales-teams` | Sales Teams | team `card` grid, member-picker `command`, `data-table` |
| `(app)/contacts` · `lists` · `templates` | CRUD | `data-table`, import `dialog`→Storage, tag `badge`, template editor |
| `(app)/campaigns/[id]/approval` · `dashboard` | Approval / Analytics | VariantCard, `tabs`, shadcn `chart`(Recharts), KPI cards + AnimatedNumber, SegmentTable, `date-picker` |
| `(app)/settings` · `billing` | Settings / Billing | `tabs` (Vertical/WhatsApp/Workspace/Danger), Razorpay checkout, usage `progress` |

**App shell** (`components/layout/`): `AppSidebar` (`collapsible="icon"`, Clerk `<OrganizationSwitcher>`, `layoutId` pill, NAV groups Campaigns/Conversations/Team/Audience/Account), `TopBar` (`SidebarTrigger`, ⌘K, `<UserButton>`, ThemeToggle, breadcrumbs), `CommandMenu` (dynamic Appwrite search + quick actions), `PlanUsageWidget` (sends-today meter, `destructive` >90%), `RoleGate` (conditional UI by permission).

Base primitives (regenerate as `.tsx`) + add: `form, data-table, chart, resizable, calendar/date-picker, alert(-dialog), checkbox, radio-group, pagination, hover-card, accordion, toggle-group`.

### Stitch usage
Mock the **4 highest-ambiguity/brand-payoff screens only**: **Inbox** (3-pane + AI timeline), **Leads Kanban**, **Campaign Dashboard**, **Landing hero**. Workflow: `create_project` → `upload_design_md`/`create_design_system_from_design_md` (seed the §7 palette + fonts + 0.75rem radius) → `apply_design_system` → `generate_screen_from_text` (brand-locked prompts) → `generate_variants` → translate as **structural reference only**, rebuild with our shadcn primitives bound to CSS variables (never paste Stitch CSS; keep light/dark working). Skip Stitch for CRUD tables.

### A11y & responsive
Keep `--ring` focus outlines; verify dark `muted-foreground` (`220 12% 62%`) contrast on `card` (bump if <AA). Kanban needs keyboard stage `select`. Sidebar `collapsible="icon"`→off-canvas `sheet` <md; inbox 3-pane→`sheet` <md→stacked intercepting route on mobile; tables→stacked cards <sm; landing orbital/aurora `hidden md:block`. Container max `1400px`, gutters `px-4 md:px-6 lg:px-8`.

---

## 8. Phased Execution Roadmap

Each phase is independently verifiable and sequenced for an ultracode build. **DoD = Definition of Done.**

**Phase 0 — Scaffold & theming** · *deps: none*
Deliverables: `nudge-next/` (Next App Router + TS + Tailwind + shadcn `components.json` + framer-motion + next-themes), route groups `(marketing)/(auth)/(app)`, `globals.css` with exact light/dark tokens + utilities + `--success`, `next/font`, `MotionConfig`+`Toaster` in root layout, `lib/env.ts` (zod), `lib/config.ts`, `.env.example`, base shadcn primitives, `components/motion/*`, `lib/logger.ts`, `lib/utils.ts`.
**DoD**: `pnpm dev` renders a themed marketing landing in light+dark; `pnpm build` passes; env validation fails fast on missing vars.

**Phase 1 — Appwrite data model** · *deps: 0*
Deliverables: `appwrite/schema/*` (24 collections + `billing_webhook_events`), `appwrite/migrate.ts` (idempotent, attr-readiness polling), all indexes + unique constraints + natural-key `$id` strategy, `lib/appwrite/{admin,server,collections,tenant}.ts`, `documentSecurity:true` + per-org Team permission helper.
**DoD**: `pnpm appwrite:setup` provisions all collections idempotently (re-run = no-op); a scripted write+read round-trips through `withTenant`; tenancy isolation test (org A cannot read org B docs) passes.

**Phase 2 — Auth & RBAC (Clerk)** · *deps: 0,1*
Deliverables: Clerk Dashboard (Orgs on, 5 roles, 11 permissions, per-role grants, `org_status` session claim, webhook endpoint), `middleware.ts`, `lib/auth/{context,rbac,require,guards}.ts`, `(app)/layout.tsx` AppShell + `<OrganizationSwitcher>`/`<UserButton>`, `/onboarding`, `clerk-webhook` (Svix verify + idempotent keyed upserts + Team creation), `features/team/actions.ts` (invite/changeRole/setStatus/remove with all guards), `features/workspaces/actions.ts`.
**DoD**: tests pass — `canManageRole` (agent can't manage at/above; non-owner can't touch owner), last-owner blocked, disabled member 403 (still listed), switch-to-non-member rejected, webhook idempotency (same `svix-id` ⇒ one mutation), Clerk org→Appwrite workspace doc synced.

**Phase 3 — AI graph + packs + guards (pure TS)** · *deps: 0*
Deliverables: `features/ai-graph/{intent,extract,decide,respond,guards}.ts` + `packs/*` (12 + custom) + `llm/client.ts`, `GRAPH_VERSION="0.6.1"`, mirrored into `functions/shared/`.
**DoD**: ported `__tests__` (from `test_edge_cases.py` + `test_vertical_transitions.py`) all green — intent classification, `_hasKeyword` boundary, duplicate PAYMENT_QUERY order, `stageFor` precedence, stage guard (no-regression/terminal/lost-revive), opt-out, per-vertical transitions; graph runs identically with zero LLM env (`confidence:null`).

**Phase 4 — WhatsApp inbound pipeline + outbox** · *deps: 1,3*
Deliverables: `functions/whatsapp-webhook` (GET verify + POST HMAC + dedup + enqueue), `functions/inbound-processor` (full `process_inbound_message` port), `functions/shared/outbox` (enqueue get-or-create), `functions/outbox-worker` (CRON, backoff, dead, wamid backfill), `lib/whatsapp/{verify,parse,send}.ts` (+ mock mode), `functions/sync-worker`, local-dev kit (`/api/dev/inject`, `pnpm dev:inbound`, `pnpm outbox:drain`, `scripts/seed-demo.ts`).
**DoD**: integration tests pass — duplicate event no-op, no-workspace handled, opt-out, media-only clarify (auto_reply+bot gated), handoff sets `needsHuman`+`autoReply=false`, idempotent enqueue under replay, mock send drains end-to-end; signed dev-inject produces a bot reply.

**Phase 5 — Inbox & Leads UI** · *deps: 2,4*
Deliverables: `(app)/inbox` (3-pane resizable, bubbles, auto-reply switch, AI Activity Timeline, assignment, handoff banner, Appwrite Realtime client island), `(app)/leads` (kanban by `pipeline_stages`, StageBadge, `u:`/`t:` assignment, `needs_human`, filters, keyboard a11y), `features/{inbox,leads}/{queries,actions,scope}.ts` (RBAC-scoped reads, `revalidateTag`).
**DoD**: agent sees only assigned leads/conversations; viewer sees all read-only; manager+ see all; new inbound message appears live; lead stage/assignment mutations revalidate; reply enqueues to outbox.

**Phase 6 — CRM CRUD (contacts, lists, templates, teams)** · *deps: 2,5*
Deliverables: `(app)/{contacts,lists,templates,team,sales-teams}` with `data-table`, import dialog→Storage, CRUD Server Actions (tenant-scoped + RBAC-gated), CSV import.
**DoD**: full CRUD per feature with permission gates; CSV import writes contacts; all reads tenant-isolated; pagination/search work.

**Phase 7 — Razorpay billing** · *deps: 1,2,6*
Deliverables: `lib/billing/{plans,entitlements,gating}.ts`, `workspaces` billing attributes, `billing_webhook_events`, `scripts/seed-razorpay-plans.ts`, `features/billing/actions.ts` (createSubscription/changePlan/cancel, owner-admin gated), `(app)/billing` page, `/api/webhooks/razorpay`, gating wired into contacts/lists/numbers actions **and the outbox-worker send cap**, `/api/billing/usage`.
**DoD**: tests pass — signature reject, idempotent replay, trial→active→charged→halted→cancelled transitions, every limit at-boundary 402, async send-cap enforced in worker, billing actions reject non-owner/admin.

**Phase 8 — Campaigns (agentic) + marketing/demo** · *deps: 5,6,7*
Deliverables: `(app)/` Brief, `campaigns/[id]/{approval,dashboard}`, `features/campaigns/*` (port LangGraph state → JS graph in `campaign-scheduler` fn), `(marketing)` Landing + `pricing` + `verticals/[slug]` SSG + `demo` playground, ported AgentOrbitals/AIPredictionCard/VariantCard/SegmentTable/MetricsChart→shadcn `chart`.
**DoD**: brief generates segments/variants; approval/reject flows; dashboard renders metrics; demo playground runs seeded verticals with no auth; marketing pages SSG/ISR.

**Phase 9 — Polish, Stitch, a11y, hardening** · *deps: all*
Deliverables: Stitch mockups for 4 hero screens reconciled into shadcn, a11y pass (contrast/focus/keyboard kanban/reduced-motion), responsive pass, `CommandMenu` dynamic search, `PlanUsageWidget`, Sentry + `/api/health`, `lib/ratelimit.ts`, runtime annotations (edge `(marketing)`, node `(app)`), README/CONTRIBUTING (RSC-vs-Client, Action-vs-Route-Handler), `SALES.md`/`LOCAL_DEV.md` updates.
**DoD**: light/dark verified on every screen incl. Clerk hosted UI; reduced-motion honored; rate limits active; health endpoint green; end-to-end smoke (inbound→AI reply→lead→campaign→billing) passes.

---

## 9. Complete `.env` / Config Variables

```bash
# ── Clerk ──────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=                  # Svix signing secret for /api/webhooks/clerk
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# ── Appwrite ───────────────────────────────────────────
NEXT_PUBLIC_APPWRITE_ENDPOINT=         # https://<region>.cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=                      # server-only admin key
APPWRITE_DATABASE_ID=crm

# ── Meta WhatsApp Cloud API ────────────────────────────
WHATSAPP_VERIFY_TOKEN=                 # GET webhook challenge
WHATSAPP_APP_SECRET=                   # HMAC X-Hub-Signature-256
WHATSAPP_ACCESS_TOKEN=                 # system-user / per-WABA token (or per-account in secret store)
META_GRAPH_VERSION=v21.0
WHATSAPP_MOCK_SEND=                    # "1" in local dev to skip real sends
DEV_INJECT_TOKEN=                      # guards /api/dev/inject (dev only)

# ── LLM (optional polish; deterministic if unset) ──────
LLM_ENABLED=                           # unset/false ⇒ fully deterministic graph
LLM_BASE_URL=
LLM_MODEL=
LLM_API_KEY=

# ── Razorpay ───────────────────────────────────────────
RAZORPAY_KEY_ID=
NEXT_PUBLIC_RAZORPAY_KEY_ID=           # public key for checkout widget
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RZP_PLAN_STARTER=                      # rzp_plan_… ids from seed-razorpay-plans.ts
RZP_PLAN_GROWTH=
RZP_PLAN_AI_PRO=
RZP_PLAN_AGENCY=

# ── Misc ───────────────────────────────────────────────
APP_BASE_URL=
NODE_ENV=
UPSTASH_REDIS_REST_URL=                # lib/ratelimit.ts (optional)
UPSTASH_REDIS_REST_TOKEN=
SENTRY_DSN=                            # optional
```
`lib/env.ts` validates **two zod schemas** (server vs `NEXT_PUBLIC_*`); importing a server var into a client component is a type error. `lib/config.ts` holds non-secret config (vertical slugs, pipeline defaults, feature flags). Plan limits live in `lib/billing/plans.ts`.

---

## 10. Risk Register & Open Decisions

### Top risks + mitigations
| # | Risk | Mitigation |
|---|---|---|
| R1 | **No ACID transactions in Appwrite** — partial writes on crash mid-inbound | `$id`-as-natural-key for dedup/outbox (atomic 409); every create is get-or-create; write `ai_traces` + flip event→`processed` **last**; Meta redelivery replays the deterministic pipeline ≈ exactly-once. |
| R2 | **Double-send from overlapping outbox-worker runs** (no `SELECT FOR UPDATE`) | Optimistic `pending→sending` flip + short `nextAttemptAt` lease + idempotent enqueue `$id` + Meta's own message dedup. Optional `claimToken` re-read for stricter exactly-once. |
| R3 | **Disabled member still authorized by Clerk** (no native disabled state) | `publicMetadata.status='disabled'` surfaced via `org_status` session claim; checked in middleware **and** `requireAuthContext` on every protected request; fallback Backend-API check if claim absent. |
| R4 | **Cross-tenant data leak** | Defense-in-depth: query-injected `workspaceId` (primary) + per-org Appwrite Team doc permissions + read-by-id ownership assertion in `withTenant`; isolation test in CI. |
| R5 | **Meta webhook disabled after sustained non-2xx** | Always return 200 except on bad signature (403); per-message failures logged not thrown; fast path enqueues async processing. |
| R6 | **AI-graph behavioral drift from Python** | Port `test_edge_cases.py` + `test_vertical_transitions.py` verbatim; lock `GRAPH_VERSION="0.6.1"`; preserve `_hasKeyword` boundary + duplicate-rule ordering + `confidence:null`. |
| R7 | **Razorpay activation trusted from client** | Activation **only** via webhook with HMAC verify + idempotent `claimEvent`/`releaseEvent`; client handler is UX-only. |
| R8 | **Appwrite string-size limits for large JSON** (`stateCheckpointJson`) | Size attributes generously (up to 1M); large campaign state may need Storage object + ref if it exceeds limits. |
| R9 | **Clerk webhook out-of-order / Backend-API rate limits** (owner-count pagination) | Stub-upsert on out-of-order events; cache org membership counts; offload heavy cascades to a queued Appwrite Function. |
| R10 | **Per-account WhatsApp tokens at scale** (multi-tenant sends) | Tokens in Function env / Appwrite secret keyed by `accessTokenRef`, never in documents; worker selects sender by `payload.sender` (phoneNumberId). |

### Open decisions
1. **Inbound webhook host**: Appwrite Function (`whatsapp-webhook`) vs Next.js Route Handler (`/api/webhooks/whatsapp`). *Recommendation*: Appwrite Function (keeps node SDK + workers co-located, off the Next request path); Route Handler is the fallback if Meta config favors a single Vercel domain.
2. **Tailwind v4 vs v3**. *Recommendation*: v4 (greenfield, native `@custom-variant dark`, fewer moving parts). v3 path documented for parity with the existing repo.
3. **`workspace_invites` collection**: drop entirely (Clerk Invitations only) vs keep as thin mirror for an in-app pending-invites list. *Recommendation*: keep the mirror only if product wants in-app listing; otherwise read from Clerk API.
4. **Realtime transport**: Appwrite Realtime subscriptions (preferred) vs SSE fallback (`/api/inbox/[id]/stream`). *Recommendation*: Appwrite Realtime; SSE only if Realtime channel scoping proves insufficient.
5. **Agency "+" pricing**: single base Razorpay plan (₹14,999) with sales-led custom overage, vs metered. *Recommendation*: single base plan now; revisit metering post-launch.
6. **Starter/Growth/Agency exact limits**: interpolations pending sales sign-off (config in `plans.py`, not code).
7. **LLM provider**: Ollama (current) vs Anthropic Messages API. Both behind the same `chat()` contract; pick per cost/latency without changing degradation behavior.

---

**Ground-truth files verified (absolute):** `/Users/hasanraza/Desktop/CampaignAgenticAI/backend/db/models.py` (24 tables, all unique constraints), `/backend/auth/rbac.py` (5 roles, 11 perms, `can_manage_role`), `/backend/plans.py` (free/pro limits, live metering), `/backend/services/inbound.py` (idempotency keys `optout:`/`clarify:`/`reply:`, routing by `phone_number_id`), `/backend/ai_graph/graph.py` (`GRAPH_VERSION="0.6.1"`), `/backend/ai_graph/guards.py` (`HARD_TERMINAL`, `REVIVE_INTENTS`, `can_ai_update_stage`), `/backend/tools/outbox.py`, `/SALES.md` (5 INR tiers, 14-day trial), `/frontend/src/pages/*` (17 pages), `/frontend/src/lib/{verticals,demoVerticals}.js`.