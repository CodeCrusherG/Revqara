"""Complaints, refunds, and emergencies must hand off to a human."""
from db.models import AiTrace, Conversation


def _convo(db, convo_id):
    return db.query(Conversation).filter_by(id=convo_id).one()


def test_clinic_emergency_triggers_handoff(make_workspace, send_inbound, db):
    _, acct = make_workspace("clinic")
    result = send_inbound(acct, "My father has severe chest pain, this is an emergency")
    assert result["handoff"] is True
    # Conversation switched to human takeover.
    assert _convo(db, result["conversation_id"]).auto_reply is False
    trace = db.query(AiTrace).filter_by(conversation_id=result["conversation_id"]).one()
    assert trace.handoff_required is True
    assert trace.handoff_reason


def test_refund_complaint_triggers_handoff(make_workspace, send_inbound, db):
    _, acct = make_workspace("coaching")
    result = send_inbound(acct, "worst service, refund chahiye right now")
    assert result["handoff"] is True
    assert _convo(db, result["conversation_id"]).auto_reply is False
