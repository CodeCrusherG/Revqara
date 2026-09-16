"""Duplicate inbound webhooks must be safely ignored — no duplicate state."""
from db.models import AiTrace, InboxMessage, Lead, MessageOutbox, WebhookEvent


def test_duplicate_webhook_is_ignored(make_workspace, send_inbound, db):
    _, acct = make_workspace("coaching")
    eid = "dup-event-1"

    first = send_inbound(acct, "fees kitna hai for weekend batch?", event_id=eid)
    assert first["status"] == "processed"
    convo_id = first["conversation_id"]

    second = send_inbound(acct, "fees kitna hai for weekend batch?", event_id=eid)
    assert second["status"] == "ignored_duplicate"

    # Exactly one of everything — the duplicate created nothing new.
    assert db.query(InboxMessage).filter_by(conversation_id=convo_id, direction="inbound").count() == 1
    assert db.query(Lead).filter_by(conversation_id=convo_id).count() == 1
    assert db.query(AiTrace).filter_by(conversation_id=convo_id).count() == 1
    assert db.query(MessageOutbox).filter_by(conversation_id=convo_id).count() == 1
    assert db.query(WebhookEvent).filter_by(provider_event_id=eid).count() == 1
