"""
Inbound message processing — the heart of the WhatsApp CRM loop, hardened.

`process_inbound_message` is provider-agnostic and DB-driven (no pywa types), so
it is fully unit-testable. The pywa webhook handler is a thin adapter over it.

It guarantees, for every inbound event:
  1. Idempotency — a duplicate (provider, provider_event_id) is recorded and
     ignored, so no duplicate messages / leads / tags / stage moves / replies.
  2. Tenant routing — resolves the owning workspace by phone_number_id.
  3. Consent — opt-out phrases set opted_out and stop the AI.
  4. Edge cases — empty / unsupported (media-only) messages get a safe
     clarification instead of crashing.
  5. Lead capture with a transition guard — the AI never regresses a pipeline,
     overrides a human-owned conversation, or moves out of a terminal stage.
  6. Outbound via the outbox — replies are enqueued (idempotent), never sent as
     a fragile inline side effect.
  7. An ai_trace row auditing exactly what the AI decided.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime

from sqlalchemy.exc import IntegrityError

from db.models import (
    AiTrace, Bot, Contact, Conversation, InboxMessage, Lead, WebhookEvent,
    WhatsAppAccount, WhatsAppMessage, Workspace,
)
from ai_graph.packs import get_pack
from ai_graph.graph import classify_intent, extract_lead_fields, run_message_graph, _stage_for, GRAPH_VERSION
from ai_graph.guards import is_opt_out, is_meaningful_text, can_ai_update_stage
from tools import outbox

logger = logging.getLogger(__name__)

OPT_OUT_REPLY = ("You've been unsubscribed and won't receive further messages. "
                 "Reply START to opt back in.")
CLARIFY_REPLY = ("Sorry, I can only read text messages right now. "
                 "Could you type your question and I'll help?")


def _normalize_phone(s: str | None) -> str | None:
    """Keep digits only (drop +, spaces, dashes) so the same number matches."""
    if not s:
        return s
    digits = re.sub(r"\D", "", s)
    return digits or s


def _record_event(db, *, provider, provider_event_id, message_id, payload):
    """Insert a webhook_events row. Returns (event, is_duplicate)."""
    existing = (db.query(WebhookEvent)
                .filter(WebhookEvent.provider == provider,
                        WebhookEvent.provider_event_id == provider_event_id).first())
    if existing:
        return existing, True
    ev = WebhookEvent(provider=provider, provider_event_id=provider_event_id,
                      message_id=message_id, payload=payload, status="received")
    try:
        with db.begin_nested():
            db.add(ev)
        return ev, False
    except IntegrityError:
        ev = (db.query(WebhookEvent)
              .filter(WebhookEvent.provider == provider,
                      WebhookEvent.provider_event_id == provider_event_id).first())
        return ev, True


def _route_workspace_id(db, phone_number_id: str | None) -> str | None:
    if not phone_number_id:
        return None
    acct = db.query(WhatsAppAccount).filter(WhatsAppAccount.phone_number_id == phone_number_id).first()
    return acct.workspace_id if acct else None


def process_inbound_message(db, *, provider: str, provider_event_id: str,
                            phone_number_id: str | None, wa_id: str, name: str | None,
                            text: str | None, raw_payload: dict | None = None) -> dict:
    """Process one inbound message idempotently. Returns a result dict."""
    # 1. Idempotency — record the event first.
    event, is_dup = _record_event(db, provider=provider, provider_event_id=provider_event_id,
                                  message_id=provider_event_id, payload=raw_payload)
    if is_dup:
        logger.info("[inbound] duplicate event %s/%s ignored", provider, provider_event_id)
        # leave the original event's status untouched; this delivery is a no-op
        if event and event.status == "received":
            event.status = "ignored_duplicate"
            db.commit()
        return {"status": "ignored_duplicate", "event_id": event.id if event else None}

    event.status = "processing"
    db.commit()

    try:
        # 2. Route to the owning workspace.
        workspace_id = _route_workspace_id(db, phone_number_id)
        if not workspace_id:
            event.status = "ignored_duplicate" if False else "failed"
            event.error = "no workspace for phone_number_id"
            event.processed_at = datetime.utcnow()
            db.commit()
            return {"status": "no_workspace"}
        event.workspace_id = workspace_id

        wa_id_norm = _normalize_phone(wa_id) or wa_id

        # 3. Upsert conversation + contact.
        convo = (db.query(Conversation)
                 .filter(Conversation.workspace_id == workspace_id,
                         Conversation.phone_number_id == phone_number_id,
                         Conversation.customer_wa_id == wa_id).first())
        if not convo:
            convo = Conversation(workspace_id=workspace_id, phone_number_id=phone_number_id,
                                 customer_wa_id=wa_id, customer_name=name, auto_reply=True)
            db.add(convo)
            db.flush()
        convo.customer_name = name or convo.customer_name
        convo.last_inbound_at = datetime.utcnow()
        convo.unread = True
        convo.status = "open"

        contact = (db.query(Contact)
                   .filter(Contact.workspace_id == workspace_id,
                           Contact.whatsapp_number == wa_id_norm).first())
        if not contact:
            contact = Contact(workspace_id=workspace_id, whatsapp_number=wa_id_norm, full_name=name)
            db.add(contact)
            db.flush()
        convo.contact_id = contact.id

        # 4. Consent — opt-out short-circuits everything.
        if is_opt_out(text):
            contact.opt_in_status = "opted_out"
            inbound = InboxMessage(workspace_id=workspace_id, conversation_id=convo.id,
                                   direction="inbound", sender="customer", text=text,
                                   wamid=provider_event_id)
            db.add(inbound)
            out = InboxMessage(workspace_id=workspace_id, conversation_id=convo.id,
                               direction="outbound", sender="bot", text=OPT_OUT_REPLY)
            db.add(out)
            db.flush()
            outbox.enqueue_message(db, workspace_id=workspace_id, to=wa_id, text=OPT_OUT_REPLY,
                                   sender=phone_number_id, conversation_id=convo.id,
                                   contact_id=contact.id, inbox_message_id=out.id,
                                   idempotency_key=f"optout:{provider_event_id}")
            event.status = "processed"
            event.processed_at = datetime.utcnow()
            db.commit()
            return {"status": "opted_out", "workspace_id": workspace_id, "conversation_id": convo.id}

        if contact.opt_in_status != "opted_out":
            contact.opt_in_status = "opted_in"
            contact.opt_in_source = contact.opt_in_source or "inbound_message"
            contact.opt_in_at = contact.opt_in_at or datetime.utcnow()

        # 5. Edge case — empty / unsupported (media-only) message.
        if not is_meaningful_text(text):
            inbound = InboxMessage(workspace_id=workspace_id, conversation_id=convo.id,
                                   direction="inbound", sender="customer",
                                   text=text or "[unsupported message]", wamid=provider_event_id)
            db.add(inbound)
            bot = db.query(Bot).filter(Bot.workspace_id == workspace_id).first()
            if convo.auto_reply and (bot.enabled if bot else True):
                out = InboxMessage(workspace_id=workspace_id, conversation_id=convo.id,
                                   direction="outbound", sender="bot", text=CLARIFY_REPLY)
                db.add(out)
                db.flush()
                outbox.enqueue_message(db, workspace_id=workspace_id, to=wa_id, text=CLARIFY_REPLY,
                                       sender=phone_number_id, conversation_id=convo.id,
                                       contact_id=contact.id, inbox_message_id=out.id,
                                       idempotency_key=f"clarify:{provider_event_id}")
            event.status = "processed"
            event.processed_at = datetime.utcnow()
            db.commit()
            return {"status": "unsupported_message", "workspace_id": workspace_id, "conversation_id": convo.id}

        # Store the inbound text message.
        db.add(InboxMessage(workspace_id=workspace_id, conversation_id=convo.id,
                            direction="inbound", sender="customer", text=text,
                            wamid=provider_event_id))

        # Campaign reply attribution.
        recent = (db.query(WhatsAppMessage).filter(WhatsAppMessage.wa_id == wa_id)
                  .order_by(WhatsAppMessage.created_at.desc()).first())
        if recent and not recent.replied:
            recent.replied = True
        db.flush()

        # 6. Lead capture + transition guard.
        ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
        pack = get_pack(ws.vertical if ws else None)
        intent, _conf = classify_intent(text)
        bot = db.query(Bot).filter(Bot.workspace_id == workspace_id).first()
        bot_enabled = bot.enabled if bot else True
        ai_owned = bool(convo.auto_reply and bot_enabled)
        human_owned = not ai_owned

        lead = db.query(Lead).filter(Lead.conversation_id == convo.id).first()
        if not lead:
            lead = Lead(workspace_id=workspace_id, conversation_id=convo.id, contact_id=contact.id,
                        name=convo.customer_name, phone=wa_id_norm, source="bot", status="new")
            db.add(lead)
            db.flush()
        stage_before = lead.status
        lead.intent = intent.lower()
        lead.details = (text or "")[:500]

        proposed_stage = _stage_for(intent, pack, text)
        if can_ai_update_stage(lead.status, proposed_stage, pack, human_owned=human_owned, intent=intent):
            lead.status = proposed_stage
        new_tag = intent.lower()
        contact.tags = list(dict.fromkeys((contact.tags or []) + [new_tag]))

        # 7. Decide / generate the reply.
        result = None
        response_text = None
        if ai_owned:
            history = [{"sender": m.sender, "text": m.text}
                       for m in db.query(InboxMessage).filter(InboxMessage.conversation_id == convo.id)
                       .order_by(InboxMessage.created_at.asc()).all()]
            result = run_message_graph(pack=pack, message_text=text, contact_name=convo.customer_name,
                                       history=history, kb=(bot.knowledge if bot else None))
            if result.get("extracted_fields"):
                lead.details = ", ".join(f"{k}: {v}" for k, v in result["extracted_fields"].items())
            if result["handoff"]:
                convo.auto_reply = False  # hand off to a human
                # Flag the lead as awaiting a human. It stays assignable (we do
                # not auto-assign) so a manager can route it to an agent/team.
                lead.needs_human = True

            response_text = result["response"]
            sender_label = "agent" if result["handoff"] else "bot"
            out = InboxMessage(workspace_id=workspace_id, conversation_id=convo.id,
                               direction="outbound", sender=sender_label, text=response_text)
            db.add(out)
            db.flush()
            outbox.enqueue_message(db, workspace_id=workspace_id, to=wa_id, text=response_text,
                                   sender=phone_number_id, conversation_id=convo.id,
                                   contact_id=contact.id, inbox_message_id=out.id,
                                   idempotency_key=f"reply:{provider_event_id}")

        # 8. Audit trace (always — even when a human owns the thread).
        trace = AiTrace(
            workspace_id=workspace_id, contact_id=contact.id, lead_id=lead.id,
            conversation_id=convo.id, vertical=pack["vertical"], intent=intent,
            confidence=(result or {}).get("confidence"),
            confidence_source=(result or {}).get("confidence_source", "deterministic"),
            extracted_fields=(result or {}).get("extracted_fields") or extract_lead_fields(text, pack),
            stage_before=stage_before, stage_after=lead.status,
            tags_added=[new_tag],
            next_action=((result or {}).get("next_action") if ai_owned else "human_takeover"),
            handoff_required=bool((result or {}).get("handoff")),
            handoff_reason=(result or {}).get("handoff_reason"),
            fallback_used=bool((result or {}).get("fallback_used")),
            model_used=(result or {}).get("model_used"),
            graph_version=GRAPH_VERSION,
        )
        db.add(trace)

        event.status = "processed"
        event.processed_at = datetime.utcnow()
        db.commit()
        return {
            "status": "processed", "workspace_id": workspace_id, "conversation_id": convo.id,
            "lead_id": lead.id, "intent": intent, "stage_before": stage_before,
            "stage_after": lead.status, "ai_owned": ai_owned,
            "handoff": bool((result or {}).get("handoff")), "response": response_text,
        }
    except Exception as exc:
        db.rollback()
        try:
            ev = (db.query(WebhookEvent)
                  .filter(WebhookEvent.provider == provider,
                          WebhookEvent.provider_event_id == provider_event_id).first())
            if ev:
                ev.status = "failed"
                ev.error = str(exc)[:1000]
                ev.processed_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
        logger.exception("[inbound] processing failed for %s/%s", provider, provider_event_id)
        raise
