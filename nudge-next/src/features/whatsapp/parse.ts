/**
 * Meta WhatsApp Cloud webhook payload parser.
 *
 * Walks `entry[].changes[].value.messages[]`, attaching the sender profile name
 * from `value.contacts[]`, and DROPS `value.statuses[]` (delivery/read receipts
 * are not inbound messages — mirrors `inbound.py` processing one inbound message
 * per webhook delivery).
 *
 * Only text messages carry `text`; media / unsupported types yield `text:null`
 * so the downstream clarify path (`isMeaningfulText`) handles them, exactly like
 * the Python service. Never throws on a malformed payload — returns [].
 */

export interface InboundMessage {
  /** wamid — used as the provider_event_id for idempotency. */
  id: string;
  /** Tenant's WhatsApp number id this message arrived on (routing key). */
  phoneNumberId: string;
  /** Customer's WhatsApp id (their phone number). */
  from: string;
  /** Customer profile display name, if present. */
  name: string | null;
  /** Text body for `type:"text"`; null for media / unsupported. */
  text: string | null;
  type: string;
}

interface MetaTextMessage {
  id?: unknown;
  from?: unknown;
  type?: unknown;
  text?: { body?: unknown } | null;
}

interface MetaContact {
  wa_id?: unknown;
  profile?: { name?: unknown } | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Parse a full Meta webhook payload into typed inbound messages. */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  if (!payload || typeof payload !== "object") return out;

  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as { value?: unknown })?.value;
      if (!value || typeof value !== "object") continue;

      const v = value as {
        metadata?: { phone_number_id?: unknown } | null;
        messages?: unknown;
        contacts?: unknown;
        // statuses are intentionally ignored.
      };

      const phoneNumberId = asString(v.metadata?.phone_number_id) ?? "";
      const messages = Array.isArray(v.messages) ? v.messages : [];
      if (messages.length === 0) continue; // statuses-only delivery → skip

      // Build a wa_id → profile-name map from contacts[].
      const nameByWaId = new Map<string, string>();
      if (Array.isArray(v.contacts)) {
        for (const c of v.contacts as MetaContact[]) {
          const waId = asString(c?.wa_id);
          const name = asString(c?.profile?.name);
          if (waId && name) nameByWaId.set(waId, name);
        }
      }

      for (const raw of messages as MetaTextMessage[]) {
        const id = asString(raw?.id);
        const from = asString(raw?.from);
        if (!id || !from) continue; // not a processable inbound message

        const type = asString(raw?.type) ?? "unknown";
        const text =
          type === "text" ? asString(raw?.text?.body) : null;

        out.push({
          id,
          phoneNumberId,
          from,
          name: nameByWaId.get(from) ?? null,
          text,
          type,
        });
      }
    }
  }

  return out;
}

/**
 * Build a real, Meta-shaped webhook payload for a single text message — used by
 * the dev-inject route (`/api/dev/inject`) and `scripts/dev-inbound.ts` to
 * exercise the full signed inbound path locally.
 */
export function buildInboundPayload(args: {
  phoneNumberId: string;
  from: string;
  name?: string | null;
  text: string;
  wamid?: string;
}): unknown {
  const wamid = args.wamid ?? `wamid.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "0000000000",
                phone_number_id: args.phoneNumberId,
              },
              contacts: args.name
                ? [{ profile: { name: args.name }, wa_id: args.from }]
                : [{ wa_id: args.from }],
              messages: [
                {
                  from: args.from,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: args.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
