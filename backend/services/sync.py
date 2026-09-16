"""
Reconciliation / sync jobs.

"Sync" means three independent reconciliations, each wrapped in a sync_runs row
so failures and cursors are auditable. Provider-agnostic: the same jobs work
against the simulator today and the WhatsApp Cloud API later.

  message_status_sync   — un-stick outbox rows left mid-send by a crashed worker
  lead_consistency_sync — every active conversation has a contact + lead
  campaign_stats_sync   — recompute Variant sent/open/click from WhatsAppMessage
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from db.models import (
    Contact, Conversation, InboxMessage, Lead, MessageOutbox, SyncRun, Variant, WhatsAppMessage,
)

logger = logging.getLogger(__name__)

STUCK_SENDING_AFTER = timedelta(minutes=2)


def _run(db, sync_type: str, fn, *, workspace_id=None) -> SyncRun:
    run = SyncRun(sync_type=sync_type, workspace_id=workspace_id, status="running",
                  started_at=datetime.utcnow())
    db.add(run)
    db.commit()
    try:
        stats = fn(db, workspace_id)
        run.status = "success"
        run.stats = stats
    except Exception as exc:
        db.rollback()
        run.status = "failed"
        run.error = str(exc)[:1000]
        logger.exception("[sync] %s failed", sync_type)
    run.completed_at = datetime.utcnow()
    db.commit()
    return run


def _ws_filter(query, model, workspace_id):
    return query.filter(model.workspace_id == workspace_id) if workspace_id else query


# ── Jobs ──────────────────────────────────────────────────────────────────────

def _message_status(db, workspace_id):
    cutoff = datetime.utcnow() - STUCK_SENDING_AFTER
    q = db.query(MessageOutbox).filter(MessageOutbox.status == "sending",
                                       MessageOutbox.created_at < cutoff)
    q = _ws_filter(q, MessageOutbox, workspace_id)
    reset = 0
    for row in q.all():
        row.status = "pending"          # let the worker retry it
        row.next_attempt_at = datetime.utcnow()
        reset += 1
    return {"stuck_reset": reset}


def _lead_consistency(db, workspace_id):
    contacts_linked = 0
    leads_created = 0
    q = db.query(Conversation).filter(Conversation.status == "open")
    q = _ws_filter(q, Conversation, workspace_id)
    for convo in q.all():
        if not convo.contact_id and convo.customer_wa_id:
            contact = (db.query(Contact)
                       .filter(Contact.workspace_id == convo.workspace_id,
                               Contact.whatsapp_number == convo.customer_wa_id).first())
            if not contact:
                contact = Contact(workspace_id=convo.workspace_id, whatsapp_number=convo.customer_wa_id,
                                  full_name=convo.customer_name, opt_in_status="opted_in",
                                  opt_in_source="inbound_message", opt_in_at=datetime.utcnow())
                db.add(contact)
                db.flush()
            convo.contact_id = contact.id
            contacts_linked += 1
        has_inbound = (db.query(InboxMessage)
                       .filter(InboxMessage.conversation_id == convo.id,
                               InboxMessage.direction == "inbound").first())
        has_lead = db.query(Lead).filter(Lead.conversation_id == convo.id).first()
        if has_inbound and not has_lead:
            db.add(Lead(workspace_id=convo.workspace_id, conversation_id=convo.id,
                        contact_id=convo.contact_id, name=convo.customer_name,
                        phone=convo.customer_wa_id, source="bot", status="new"))
            leads_created += 1
    return {"contacts_linked": contacts_linked, "leads_created": leads_created}


def _campaign_stats(db, workspace_id):
    variants_updated = 0
    variants = db.query(Variant).filter(Variant.external_campaign_id.isnot(None)).all()
    for v in variants:
        msgs = db.query(WhatsAppMessage).filter(WhatsAppMessage.broadcast_id == v.external_campaign_id).all()
        if not msgs:
            continue
        v.sent_count = len(msgs)
        v.open_count = sum(1 for m in msgs if m.status == "read")
        v.click_count = sum(1 for m in msgs if m.clicked)
        variants_updated += 1
    return {"variants_updated": variants_updated}


def message_status_sync(db, *, workspace_id=None) -> SyncRun:
    return _run(db, "message_status", _message_status, workspace_id=workspace_id)


def lead_consistency_sync(db, *, workspace_id=None) -> SyncRun:
    return _run(db, "contacts", _lead_consistency, workspace_id=workspace_id)


def campaign_stats_sync(db, *, workspace_id=None) -> SyncRun:
    return _run(db, "campaigns", _campaign_stats, workspace_id=workspace_id)


def run_all_syncs(db, *, workspace_id=None) -> dict:
    """Convenience: run all three reconciliations. Returns their stats."""
    return {
        "message_status": message_status_sync(db, workspace_id=workspace_id).stats,
        "contacts": lead_consistency_sync(db, workspace_id=workspace_id).stats,
        "campaigns": campaign_stats_sync(db, workspace_id=workspace_id).stats,
    }
