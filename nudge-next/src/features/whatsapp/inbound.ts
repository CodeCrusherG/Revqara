/**
 * processInboundMessage — an exact TypeScript port of
 * `process_inbound_message` (`backend/services/inbound.py`), over the
 * `WhatsAppRepo` port.
 *
 * Appwrite has no ACID transactions, so parity comes from the
 * `$id`-collision-as-idempotency primitive + careful ordering (plan §5, R1):
 *
 *   1. webhook_events dedup FIRST (createWebhookEventOrNull → null = duplicate
 *      → flip received→ignored_duplicate, return early).
 *   2. Route by phone_number_id → workspaceId; none ⇒ event failed/"no
 *      workspace", return.
 *   3. Upsert conversation + contact (get-or-create); lastInboundAt=now,
 *      unread=true, status=open; contact matched on normalizePhone.
 *   4. Opt-out short-circuit → contact opted_out, store inbound + OPT_OUT_REPLY,
 *      enqueue "optout:<id>", return. Else mark opted_in.
 *   5. Unsupported text (!isMeaningfulText) → store inbound (text||"[unsupported
 *      message]"), and ONLY IF convo.autoReply && (bot.enabled ?? true) enqueue
 *      CLARIFY_REPLY "clarify:<id>", return.
 *   6. Store inbound text; campaign attribution (latest whatsapp_messages for
 *      waId → replied=true).
 *   7. Lead capture + canAiUpdateStage; add tag (deduped).
 *   8. Ownership: aiOwned = autoReply && botEnabled.
 *   9. If aiOwned: build history (asc), runMessageGraph; extracted fields
 *      overwrite details; handoff ⇒ autoReply=false + needsHuman=true; store
 *      outbound (sender = handoff ? "agent" : "bot"); enqueue "reply:<id>".
 *  10. ALWAYS write ai_trace (even human-owned; nextAction="human_takeover").
 *  11. Mark event processed/processedAt LAST.
 *
 * Idempotency keys verbatim: `optout:<id>`, `clarify:<id>`, `reply:<id>` where
 * `<id>` = providerEventId = wamid. Enqueue is get-or-create on
 * `$id = sha256(workspaceId:idempotencyKey)`. Same return shape as Python.
 */
import {
  GRAPH_VERSION,
  classifyIntent,
  extractLeadFields,
  getPack,
  runMessageGraph,
  stageFor,
  canAiUpdateStage,
  isMeaningfulText,
  isOptOut,
} from "@/features/ai-graph";
import type { GraphResult } from "@/features/ai-graph";

import { normalizePhone } from "./normalize";
import type { WhatsAppRepo } from "./repo";

export const OPT_OUT_REPLY =
  "You've been unsubscribed and won't receive further messages. " +
  "Reply START to opt back in.";
export const CLARIFY_REPLY =
  "Sorry, I can only read text messages right now. " +
  "Could you type your question and I'll help?";

export interface InboundParams {
  provider: string;
  providerEventId: string;
  phoneNumberId: string | null;
  waId: string;
  name: string | null;
  text: string | null;
  rawPayload?: unknown;
}

/** Result dict — same keys/shape as the Python `process_inbound_message`. */
export interface InboundResult {
  status:
    | "ignored_duplicate"
    | "no_workspace"
    | "opted_out"
    | "unsupported_message"
    | "processed";
  event_id?: string | null;
  workspace_id?: string;
  conversation_id?: string;
  lead_id?: string;
  intent?: string;
  stage_before?: string;
  stage_after?: string;
  ai_owned?: boolean;
  handoff?: boolean;
  response?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function processInboundMessage(
  repo: WhatsAppRepo,
  params: InboundParams,
): Promise<InboundResult> {
  const {
    provider,
    providerEventId,
    phoneNumberId,
    waId,
    name,
    text,
    rawPayload,
  } = params;

  // 1. Idempotency — record the event first. A $id-409 ⇒ duplicate.
  const event = await repo.createWebhookEventOrNull({
    provider,
    providerEventId,
    messageId: providerEventId,
    payloadJson: rawPayload != null ? JSON.stringify(rawPayload) : null,
  });
  if (event === null) {
    // Duplicate delivery — no-op. Leave the original event untouched unless it
    // is still in the initial "received" state, then flip to ignored_duplicate.
    const existing = await repo.getWebhookEvent(provider, providerEventId);
    if (existing && existing.status === "received") {
      await repo.updateWebhookEvent(existing.$id, { status: "ignored_duplicate" });
    }
    return { status: "ignored_duplicate", event_id: existing?.$id ?? null };
  }

  try {
    await repo.updateWebhookEvent(event.$id, { status: "processing" });

    // 2. Route to the owning workspace.
    const account = phoneNumberId
      ? await repo.getAccountByPhoneNumberId(phoneNumberId)
      : null;
    const workspaceId = account?.workspaceId ?? null;
    if (!workspaceId || !phoneNumberId) {
      await repo.updateWebhookEvent(event.$id, {
        status: "failed",
        error: "no workspace for phone_number_id",
        processedAt: nowIso(),
      });
      return { status: "no_workspace" };
    }
    await repo.updateWebhookEvent(event.$id, { workspaceId });

    const waIdNorm = normalizePhone(waId) || waId;

    // 3. Upsert conversation + contact.
    const convo = await repo.upsertConversation({
      workspaceId,
      phoneNumberId,
      customerWaId: waId,
      customerName: name,
    });
    await repo.updateConversation(convo.$id, {
      customerName: name || convo.customerName,
      lastInboundAt: nowIso(),
      unread: true,
      status: "open",
    });

    const contact = await repo.upsertContact({
      workspaceId,
      whatsappNumber: waIdNorm,
      fullName: name,
    });
    if (convo.contactId !== contact.$id) {
      await repo.updateConversation(convo.$id, { contactId: contact.$id });
    }

    // 4. Consent — opt-out short-circuits everything.
    if (isOptOut(text)) {
      await repo.updateContact(contact.$id, { optInStatus: "opted_out" });
      await repo.addInboxMessage({
        workspaceId,
        conversationId: convo.$id,
        direction: "inbound",
        sender: "customer",
        text,
        wamid: providerEventId,
      });
      const out = await repo.addInboxMessage({
        workspaceId,
        conversationId: convo.$id,
        direction: "outbound",
        sender: "bot",
        text: OPT_OUT_REPLY,
      });
      await repo.enqueueOutboxOrNull({
        workspaceId,
        to: waId,
        text: OPT_OUT_REPLY,
        sender: phoneNumberId,
        conversationId: convo.$id,
        contactId: contact.$id,
        inboxMessageId: out.$id,
        idempotencyKey: `optout:${providerEventId}`,
      });
      await repo.updateWebhookEvent(event.$id, {
        status: "processed",
        processedAt: nowIso(),
      });
      return {
        status: "opted_out",
        workspace_id: workspaceId,
        conversation_id: convo.$id,
      };
    }

    if (contact.optInStatus !== "opted_out") {
      await repo.updateContact(contact.$id, {
        optInStatus: "opted_in",
        optInSource: contact.optInSource || "inbound_message",
        optInAt: contact.optInAt || nowIso(),
      });
    }

    // 5. Edge case — empty / unsupported (media-only) message.
    const bot = await repo.getBot(workspaceId);
    if (!isMeaningfulText(text)) {
      await repo.addInboxMessage({
        workspaceId,
        conversationId: convo.$id,
        direction: "inbound",
        sender: "customer",
        text: text || "[unsupported message]",
        wamid: providerEventId,
      });
      const botEnabled = bot ? bot.enabled : true;
      if (convo.autoReply && botEnabled) {
        const out = await repo.addInboxMessage({
          workspaceId,
          conversationId: convo.$id,
          direction: "outbound",
          sender: "bot",
          text: CLARIFY_REPLY,
        });
        await repo.enqueueOutboxOrNull({
          workspaceId,
          to: waId,
          text: CLARIFY_REPLY,
          sender: phoneNumberId,
          conversationId: convo.$id,
          contactId: contact.$id,
          inboxMessageId: out.$id,
          idempotencyKey: `clarify:${providerEventId}`,
        });
      }
      await repo.updateWebhookEvent(event.$id, {
        status: "processed",
        processedAt: nowIso(),
      });
      return {
        status: "unsupported_message",
        workspace_id: workspaceId,
        conversation_id: convo.$id,
      };
    }

    // Store the inbound text message.
    await repo.addInboxMessage({
      workspaceId,
      conversationId: convo.$id,
      direction: "inbound",
      sender: "customer",
      text,
      wamid: providerEventId,
    });

    // Campaign reply attribution.
    const recent = await repo.getLatestWhatsAppMessageByWaId(waId);
    if (recent && !recent.replied) {
      await repo.markWhatsAppMessageReplied(recent.$id);
    }

    // 6. Lead capture + transition guard.
    const ws = await repo.getWorkspace(workspaceId);
    const pack = getPack(ws?.vertical ?? null);
    const [intent] = classifyIntent(text);
    const botEnabled = bot ? bot.enabled : true;
    const aiOwned = Boolean(convo.autoReply && botEnabled);
    const humanOwned = !aiOwned;

    const lead = await repo.getOrCreateLead({
      workspaceId,
      conversationId: convo.$id,
      contactId: contact.$id,
      name: convo.customerName,
      phone: waIdNorm,
    });
    const stageBefore = lead.status;
    const leadPatch: {
      intent: string;
      details: string;
      status?: string;
      needsHuman?: boolean;
    } = {
      intent: intent.toLowerCase(),
      details: (text || "").slice(0, 500),
    };

    const proposed = stageFor(intent, pack, text);
    if (canAiUpdateStage(lead.status, proposed, pack, { humanOwned, intent })) {
      leadPatch.status = proposed as string;
    }
    const newTag = intent.toLowerCase();
    const tags = Array.from(new Set([...(contact.tags ?? []), newTag]));
    await repo.updateContact(contact.$id, { tags });

    // 7. Decide / generate the reply.
    let result: GraphResult | null = null;
    let responseText: string | null = null;
    if (aiOwned) {
      const history = (await repo.listMessagesAsc(convo.$id)).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));
      result = await runMessageGraph({
        pack,
        messageText: text,
        contactName: convo.customerName,
        history,
        kb: bot?.knowledge ?? null,
      });
      if (
        result.extracted_fields &&
        Object.keys(result.extracted_fields).length > 0
      ) {
        leadPatch.details = Object.entries(result.extracted_fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
      }
      if (result.handoff) {
        await repo.updateConversation(convo.$id, { autoReply: false });
        leadPatch.needsHuman = true;
      }

      responseText = result.response;
      const senderLabel: "agent" | "bot" = result.handoff ? "agent" : "bot";
      const out = await repo.addInboxMessage({
        workspaceId,
        conversationId: convo.$id,
        direction: "outbound",
        sender: senderLabel,
        text: responseText,
      });
      await repo.enqueueOutboxOrNull({
        workspaceId,
        to: waId,
        text: responseText,
        sender: phoneNumberId,
        conversationId: convo.$id,
        contactId: contact.$id,
        inboxMessageId: out.$id,
        idempotencyKey: `reply:${providerEventId}`,
      });
    }

    await repo.updateLead(lead.$id, leadPatch);
    const stageAfter = leadPatch.status ?? stageBefore;

    // 8. Audit trace (always — even when a human owns the thread).
    const extracted =
      result?.extracted_fields &&
      Object.keys(result.extracted_fields).length > 0
        ? result.extracted_fields
        : extractLeadFields(text, pack);
    await repo.addAiTrace({
      workspaceId,
      contactId: contact.$id,
      leadId: lead.$id,
      conversationId: convo.$id,
      vertical: pack.vertical,
      intent,
      confidence: result?.confidence ?? null,
      confidenceSource: result?.confidence_source ?? "deterministic",
      extractedFieldsJson: JSON.stringify(extracted ?? {}),
      stageBefore,
      stageAfter,
      tagsAdded: [newTag],
      nextAction: aiOwned ? result?.next_action ?? null : "human_takeover",
      handoffRequired: Boolean(result?.handoff),
      handoffReason: result?.handoff_reason ?? null,
      fallbackUsed: Boolean(result?.fallback_used),
      modelUsed: result?.model_used ?? null,
      graphVersion: GRAPH_VERSION,
    });

    // 11. Mark event processed LAST.
    await repo.updateWebhookEvent(event.$id, {
      status: "processed",
      processedAt: nowIso(),
    });

    return {
      status: "processed",
      workspace_id: workspaceId,
      conversation_id: convo.$id,
      lead_id: lead.$id,
      intent,
      stage_before: stageBefore,
      stage_after: stageAfter,
      ai_owned: aiOwned,
      handoff: Boolean(result?.handoff),
      response: responseText,
    };
  } catch (err) {
    // Best-effort: mark the event failed (mirrors the Python except branch).
    try {
      const ev = await repo.getWebhookEvent(provider, providerEventId);
      if (ev) {
        await repo.updateWebhookEvent(ev.$id, {
          status: "failed",
          error: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
          processedAt: nowIso(),
        });
      }
    } catch {
      // swallow — original error is re-thrown below
    }
    throw err;
  }
}
