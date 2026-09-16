"""Sync jobs run, record a sync_runs row, and reconcile state."""
from datetime import datetime, timedelta

from db.models import Lead, MessageOutbox, SyncRun
from services import sync


def test_lead_consistency_creates_missing_lead(make_workspace, send_inbound, db):
    from db.models import Conversation, InboxMessage
    ws, acct = make_workspace("coaching")
    # Create a conversation with an inbound message but NO lead (simulate drift).
    convo = Conversation(workspace_id=ws.id, phone_number_id=acct.phone_number_id,
                         customer_wa_id="919333000001", customer_name="Drift", auto_reply=True, status="open")
    db.add(convo)
    db.flush()
    db.add(InboxMessage(workspace_id=ws.id, conversation_id=convo.id, direction="inbound",
                        sender="customer", text="hi"))
    db.commit()
    assert db.query(Lead).filter_by(conversation_id=convo.id).count() == 0

    run = sync.lead_consistency_sync(db, workspace_id=ws.id)
    assert run.status == "success"
    assert run.stats["leads_created"] >= 1
    assert db.query(Lead).filter_by(conversation_id=convo.id).count() == 1
    assert db.query(SyncRun).filter_by(id=run.id).one().sync_type == "contacts"


def test_message_status_sync_unsticks_sending(make_workspace, db):
    ws, _ = make_workspace("coaching")
    stuck = MessageOutbox(workspace_id=ws.id, payload={"to": "9", "text": "x", "sender": "p"},
                          idempotency_key="stuck-1", status="sending",
                          created_at=datetime.utcnow() - timedelta(minutes=10))
    db.add(stuck)
    db.commit()
    run = sync.message_status_sync(db, workspace_id=ws.id)
    assert run.status == "success"
    db.refresh(stuck)
    assert stuck.status == "pending"


def test_run_all_syncs_smoke(make_workspace, db):
    ws, _ = make_workspace("coaching")
    stats = sync.run_all_syncs(db, workspace_id=ws.id)
    assert set(stats.keys()) == {"message_status", "contacts", "campaigns"}
