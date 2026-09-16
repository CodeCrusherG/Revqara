# `lib/appwrite/` (Phase 1)

Server-only Appwrite access. Every file starts with `import "server-only"`.

- `admin.ts` — API-key client (bypasses doc permissions by design).
- `server.ts` — `createServerClient()`: admin + per-request JWT-session clients.
- `collections.ts` — typed COLLECTION ids + DB id (`crm`).
- `tenant.ts` — `withTenant()`: injects `Query.equal('workspaceId', orgId)` into
  every query for defense-in-depth tenancy.

UI must reach this only through `features/*`, never directly.
