"""When a human owns the conversation, the AI must not act."""
from db.models import Conversation, InboxMessage, Lead, MessageOutbox


def test_ai_does_not_override_human_takeover(make_workspace, send_inbound, db):
    _, acct = make_workspace("coaching")

    # First message under AI control.
    first = send_inbound(acct, "hi", wa_id="919222000001", event_id="evt-a")
    convo_id = first["conversation_id"]
    stage_after_first = first["stage_after"]

    # A human takes over.
    convo = db.query(Conversation).filter_by(id=convo_id).one()
    convo.auto_reply = False
    db.commit()

    # Counts after the first (AI-handled) message — that reply legitimately exists.
    outbox_before = db.query(MessageOutbox).filter_by(conversation_id=convo_id).count()
    outbound_before = db.query(InboxMessage).filter_by(conversation_id=convo_id, direction="outbound").count()

    # Customer sends a strong buying signal — but a human owns the thread.
    second = send_inbound(acct, "fees kitna hai for weekend batch?", wa_id="919222000001", event_id="evt-b")
    assert second["ai_owned"] is False
    assert second["response"] is None

    # The human-owned second event produced NO new outbound reply (enqueued or stored).
    assert db.query(MessageOutbox).filter_by(conversation_id=convo_id).count() == outbox_before
    assert db.query(InboxMessage).filter_by(conversation_id=convo_id, direction="outbound").count() == outbound_before
    # The AI did NOT advance the pipeline stage while the human owns the lead.
    lead = db.query(Lead).filter_by(conversation_id=convo_id).one()
    assert lead.status == stage_after_first
