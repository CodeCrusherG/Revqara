import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { drainOutbox } from "@/features/whatsapp/outbox";
import { AppwriteWhatsAppRepo } from "@/features/whatsapp/repo-appwrite";
import { remainingSendsToday } from "@/lib/billing/gating";
import { loadBillingWorkspace } from "@/lib/billing/entitlements";

/**
 * Outbox drain — one worker pass (plan §5 outbox-worker).
 *
 * Protected by a `CRON_SECRET` (header `x-cron-secret` or `Authorization:
 * Bearer <secret>`). Triggered by Vercel Cron (e.g. every minute) or manually.
 *
 * NOTE: this replaces the always-on Python `_outbox_loop` thread with a
 * stateless, idempotent pull. The claim → send → backoff/dead logic (incl. the
 * verbatim backoff cap) lives in `drainOutbox`; re-entrancy is safe because each
 * row's optimistic `sending` flip + idempotent `$id` make double-sends a no-op.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when unconfigured
  const header =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  return header === secret;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "25") || 25;
  try {
    const repo = new AppwriteWhatsAppRepo();
    // Enforce the per-day send cap (§6 'critical') here in the async worker.
    // Memoise the per-workspace remaining budget for this pass.
    const remainingCache = new Map<string, Promise<number>>();
    const stats = await drainOutbox(repo, {
      limit,
      remainingSends: (workspaceId) => {
        let p = remainingCache.get(workspaceId);
        if (!p) {
          p = loadBillingWorkspace(workspaceId).then((ws) =>
            remainingSendsToday(ws, workspaceId),
          );
          remainingCache.set(workspaceId, p);
        }
        return p;
      },
    });
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    logger.error("[cron/outbox] drain failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "drain failed" },
      { status: 500 },
    );
  }
}

// Vercel Cron issues GET requests; accept both.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
