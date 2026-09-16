import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";

import { buildInboundPayload } from "@/features/whatsapp/parse";
import { getRateLimiter, clientKey } from "@/lib/ratelimit";

/**
 * DEV-ONLY signed inbound injector (plan §5 Local dev).
 *
 * Builds a real Meta-shaped webhook payload for {phoneNumberId, from, name,
 * text}, signs it with WHATSAPP_APP_SECRET, and POSTs it to the real webhook
 * route — so local testing exercises the FULL production path, including the
 * HMAC signature check (not a bypass).
 *
 * Guarded twice: refuses outside development AND requires the DEV_INJECT_TOKEN
 * (via `x-dev-inject-token` header or `?token=`). 404 when not enabled so the
 * route is invisible in production.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InjectBody {
  phoneNumberId?: string;
  from?: string;
  name?: string;
  text?: string;
}

function disabled(): boolean {
  return process.env.NODE_ENV === "production" || !process.env.DEV_INJECT_TOKEN;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (disabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const provided =
    req.headers.get("x-dev-inject-token") ?? req.nextUrl.searchParams.get("token");
  if (!provided || provided !== process.env.DEV_INJECT_TOKEN) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Throttle even the dev injector (10 / 60s per IP) so a runaway loop can't
  // flood the local pipeline. In-memory by default; Upstash if configured.
  const limiter = await getRateLimiter({
    tokens: 10,
    windowMs: 60_000,
    prefix: "dev-inject",
  });
  const { success } = await limiter.limit(clientKey(req));
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: InjectBody;
  try {
    body = (await req.json()) as InjectBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { phoneNumberId, from, text } = body;
  if (!phoneNumberId || !from || !text) {
    return NextResponse.json(
      { error: "phoneNumberId, from, and text are required" },
      { status: 400 },
    );
  }

  const payload = buildInboundPayload({
    phoneNumberId,
    from,
    name: body.name ?? null,
    text,
  });
  const raw = JSON.stringify(payload);
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";
  const signature = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");

  // POST to the real webhook so the signed path (incl. verifyMetaSignature) runs.
  const base =
    process.env.APP_BASE_URL ?? req.nextUrl.origin ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: raw,
  });

  const echo = await res.json().catch(() => null);
  return NextResponse.json({
    injected: true,
    webhookStatus: res.status,
    webhookResponse: echo,
  });
}
