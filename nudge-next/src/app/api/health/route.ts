import { NextResponse } from "next/server";

/**
 * Liveness probe — `{ ok, ts, build? }`. No env reads beyond an optional build
 * id, no I/O; always green. Node runtime, never cached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Best-effort build identifier (Vercel commit SHA if present). */
function buildId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    undefined
  );
}

export function GET(): NextResponse {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    ...(buildId() ? { build: buildId() } : {}),
  });
}
