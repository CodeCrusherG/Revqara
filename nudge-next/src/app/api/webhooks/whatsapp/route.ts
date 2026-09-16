import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { verifyChallenge, verifyMetaSignature } from "@/features/whatsapp/verify";
import { parseInboundMessages } from "@/features/whatsapp/parse";
import { processInboundMessage } from "@/features/whatsapp/inbound";
import { AppwriteWhatsAppRepo } from "@/features/whatsapp/repo-appwrite";

/**
 * Meta WhatsApp Cloud inbound webhook (plan §5; §10 open-decision #1).
 *
 * This Route Handler is the deploy surface FOR NOW. NOTE: it can move to the
 * `whatsapp-webhook` Appwrite Function later (which keeps the node SDK + workers
 * co-located off the Next request path); the inbound core
 * (`processInboundMessage` over `WhatsAppRepo`) is host-agnostic and would move
 * unchanged.
 *
 *   GET  — verify-challenge handshake against WHATSAPP_VERIFY_TOKEN.
 *   POST — read the RAW body, timing-safe HMAC-SHA256 verify against
 *          WHATSAPP_APP_SECRET (403 on bad signature — the one new security
 *          step), parse, process each message; ALWAYS 200 except bad signature
 *          (per-message failures are logged, never fail the HTTP response, so
 *          Meta does not disable the webhook).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET: subscription verification ──
export function GET(req: NextRequest): NextResponse {
  const params = req.nextUrl.searchParams;
  const challenge = verifyChallenge(
    {
      mode: params.get("hub.mode"),
      token: params.get("hub.verify_token"),
      challenge: params.get("hub.challenge"),
    },
    process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  );
  if (challenge === null) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  // Meta expects the raw challenge string echoed back.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

// ── POST: inbound messages ──
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read the RAW body — the signature is computed over the exact bytes.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET)) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Malformed JSON from a validly-signed sender — ack so Meta does not retry.
    return NextResponse.json({ ok: true, ignored: "invalid json" });
  }

  const messages = parseInboundMessages(payload);
  const repo = new AppwriteWhatsAppRepo();

  for (const m of messages) {
    try {
      await processInboundMessage(repo, {
        provider: "whatsapp_cloud",
        providerEventId: m.id,
        phoneNumberId: m.phoneNumberId,
        waId: m.from,
        name: m.name,
        text: m.text,
        rawPayload: payload,
      });
    } catch (err) {
      // Per-message failure: log, never fail the HTTP response (R5).
      logger.error("[whatsapp] inbound processing failed", {
        wamid: m.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, received: messages.length });
}
