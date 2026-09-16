/**
 * Outbound WhatsApp send — the seam between the outbox worker and Meta.
 *
 * Mirrors `backend/tools/wa_provider.send_text(to, text, sender) -> wamid|null`.
 * Real path: POST /{phoneNumberId}/messages on the Meta Cloud API
 * (`{messaging_product, to, type:"text", text:{body}}`, bearer token) and return
 * `messages[0].id` (the wamid).
 *
 * Mock mode (WHATSAPP_MOCK_SEND=1, the local-dev default): logs and returns
 * `mock-<uuid>` — replaces the pywa simulator's send side, so the whole pipeline
 * drains end-to-end with no Meta credentials.
 *
 * A `MessageSender` is `(to, text, sender) => Promise<string|null>` so the
 * outbox worker can be unit-tested with an injected fake (parity with the
 * Python `send_fn`).
 */
import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";

/** Injectable send function. `sender` is the phoneNumberId to send AS. */
export type MessageSender = (
  to: string,
  text: string,
  sender?: string | null,
) => Promise<string | null>;

function isMockSend(): boolean {
  return process.env.WHATSAPP_MOCK_SEND === "1";
}

function graphVersion(): string {
  return process.env.META_GRAPH_VERSION || "v21.0";
}

/**
 * Default sender. In mock mode returns a synthetic wamid; otherwise calls the
 * Meta Cloud API. Never throws an *unhandled* error in mock mode; a real-send
 * failure throws so the outbox worker records it and applies backoff (parity
 * with the Python provider raising → outbox catch).
 */
export const sendText: MessageSender = async (to, text, sender) => {
  if (isMockSend()) {
    const wamid = `mock-${randomUUID()}`;
    logger.info("[whatsapp] mock send", { to, sender, wamid, len: text.length });
    return wamid;
  }

  const phoneNumberId = sender || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "WhatsApp send not configured: set WHATSAPP_ACCESS_TOKEN and a sender phoneNumberId (or WHATSAPP_MOCK_SEND=1).",
    );
  }

  const url = `https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Meta send failed ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json().catch(() => null)) as
    | { messages?: Array<{ id?: string }> }
    | null;
  return data?.messages?.[0]?.id ?? null;
};
