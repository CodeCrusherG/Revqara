"""Outbox: retry with backoff, and idempotency against duplicate sends."""
from datetime import datetime, timedelta

from db.models import Conversation, InboxMessage, MessageOutbox
from tools.outbox import enqueue_message, process_outbox


def _enqueue(db, ws, key, *, inbox_message_id=None):
    return enqueue_message(db, workspace_id=ws.id, to="91900", text="hello",
                           sender="pnid", idempotency_key=key, inbox_message_id=inbox_message_id)


def _convo(db, ws):
    c = Conversation(workspace_id=ws.id, phone_number_id="pnid", customer_wa_id="91900",
                     customer_name="X", auto_reply=True, status="open")
    db.add(c)
    db.flush()
    return c


def test_outbox_retry_then_succeeds(make_workspace, db):
    ws, _ = make_workspace("coaching")
    convo = _convo(db, ws)
    msg = InboxMessage(workspace_id=ws.id, conversation_id=convo.id, direction="outbound",
                       sender="bot", text="hello")
    db.add(msg)
    db.flush()
    _enqueue(db, ws, "retry-key", inbox_message_id=msg.id)

    calls = {"n": 0}

    def flaky(to, text, sender):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("provider down")
        return "wamid-123"

    t0 = datetime(2026, 6, 17, 12, 0, 0)
    s1 = process_outbox(db, now=t0, send_fn=flaky)
    assert s1["failed"] == 1
    row = db.query(MessageOutbox).filter_by(idempotency_key="retry-key").one()
    assert row.status == "failed"
    assert row.attempts == 1
    assert row.next_attempt_at > t0

    # Too soon — not retried yet.
    s2 = process_outbox(db, now=t0, send_fn=flaky)
    assert s2["processed"] == 0

    # After backoff — retried and succeeds.
    s3 = process_outbox(db, now=t0 + timedelta(seconds=60), send_fn=flaky)
    assert s3["sent"] == 1
    db.refresh(row)
    assert row.status == "sent"
    assert row.provider_message_id == "wamid-123"
    db.refresh(msg)
    assert msg.wamid == "wamid-123"


def test_outbox_marks_dead_after_max_attempts(make_workspace, db):
    ws, _ = make_workspace("coaching")
    row = _enqueue(db, ws, "dead-key")
    row.max_attempts = 2
    db.commit()

    def always_fail(to, text, sender):
        raise RuntimeError("nope")

    t = datetime(2026, 6, 17, 12, 0, 0)
    for i in range(5):
        process_outbox(db, now=t + timedelta(seconds=i * 120), send_fn=always_fail)
    db.refresh(row)
    assert row.status == "dead"
    assert row.attempts == 2


def test_outbox_idempotency_prevents_duplicate_sends(make_workspace, db):
    ws, _ = make_workspace("coaching")
    r1 = _enqueue(db, ws, "same-key")
    r2 = _enqueue(db, ws, "same-key")  # duplicate enqueue
    assert r1.id == r2.id
    assert db.query(MessageOutbox).filter_by(workspace_id=ws.id, idempotency_key="same-key").count() == 1

    sends = {"n": 0}

    def counting(to, text, sender):
        sends["n"] += 1
        return f"wamid-{sends['n']}"

    process_outbox(db, now=datetime(2026, 6, 17, 12, 0, 0), send_fn=counting)
    assert sends["n"] == 1  # sent exactly once
