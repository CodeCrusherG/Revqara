/**
 * Auth/authorization error classes carrying HTTP status codes.
 *
 * These mirror the status codes the FastAPI backend raised:
 *   - 401 Unauthorized  → no authenticated user / no active workspace
 *   - 403 Forbidden     → authenticated but not permitted (RBAC / disabled)
 *   - 402 PaymentRequired → plan/usage gating (billing)
 *
 * Pure module (no Clerk, no Appwrite, no `server-only`). Server Actions / RSC
 * segments throw these; the nearest `error.tsx` (or a Route Handler) maps the
 * `.status` to the wire response.
 */

export class AuthError extends Error {
  /** HTTP status this error maps to. */
  readonly status: number;
  /** Stable machine code for client handling / logging. */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — no authenticated user or no active workspace/organization. */
export class UnauthorizedError extends AuthError {
  constructor(message = "Authentication required.") {
    super(401, "unauthorized", message);
  }
}

/** 403 — authenticated but not permitted (RBAC denial or disabled member). */
export class ForbiddenError extends AuthError {
  constructor(message = "You don't have permission to perform this action.") {
    super(403, "forbidden", message);
  }
}

/** 402 — blocked by plan limits / billing gating. */
export class GatedError extends AuthError {
  constructor(message = "This action exceeds your current plan.") {
    super(402, "payment_required", message);
  }
}

/** Type guard for any of the auth error classes. */
export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}
