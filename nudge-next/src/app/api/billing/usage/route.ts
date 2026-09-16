import { NextResponse } from "next/server";

import { getRequestContext } from "@/lib/auth/context";
import { usageSummary } from "@/lib/billing/entitlements";
import { isAuthError } from "@/lib/auth/errors";

/**
 * GET /api/billing/usage — the extended live usage shape (contacts / lists /
 * numbers / sends-today vs. the effective-plan limits) for the ACTIVE workspace
 * (plan §6). Parity with the FastAPI `GET /billing/usage`.
 *
 * Auth comes from `getRequestContext()` (active Clerk org); it throws 401/403
 * which we map to the wire status. node runtime, dynamic (per-request).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await getRequestContext();
    const summary = await usageSummary(ctx);
    return NextResponse.json(summary);
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load usage." },
      { status: 500 },
    );
  }
}
