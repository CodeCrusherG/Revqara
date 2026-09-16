# `features/` — per-domain service layer

Each domain folder owns its server-side logic. UI never imports `lib/appwrite/*`
directly — only through here.

Conventions per feature (filled in later phases):
- `queries.ts` — RSC reads. Starts with `import "server-only"`. Tenant-scoped.
- `actions.ts` — `"use server"` Server Actions for mutations. Enforces
  `requirePermission(...)` and `revalidateTag(...)`.
- `schema.ts` — zod input schemas.
- `types.ts` — domain types.
- `scope.ts` (leads/inbox) — RBAC query filters (agent-sees-assigned).
- `realtime.ts` (inbox) — Appwrite Realtime subscription helpers (client).

Folders: `contacts/ leads/ inbox/ campaigns/ templates/ lists/ team/
salesTeams/ billing/ whatsapp/ workspaces/ ai-graph/`.
