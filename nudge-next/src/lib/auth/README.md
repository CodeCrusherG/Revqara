# `lib/auth/` (Phase 2)

Clerk-backed auth + the four RBAC rules Clerk can't express natively.

- `context.ts` — `getRequestContext()` / `requireAuthContext()` (React-`cache`d).
- `rbac.ts` — `ROLE_RANK`, `ROLE_PERMISSIONS`, `hasPermission`, `canManageRole`
  (1:1 port of `backend/auth/rbac.py`).
- `require.ts` — `requirePermission` / `requireRole`.
- `guards.ts` — `activeOwnerCount`, `assertNotLastOwner`.
