"""
Transactional outbound message outbox.

The AI graph (and opt-out / clarification flows) never call the WhatsApp provider
as a side effect. They `enqueue_message(...)` a durable row; a worker drains the
queue with retry + backoff and marks rows `dead` after `max_attempts`.

The (workspace_id, idempotency_key) unique constraint guarantees the same logical
reply is enqueued at most once, so duplicate webhooks / retries can never cause
duplicate sends.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError

from db.models import InboxMessage, MessageOutbox
from tools import wa_provider

logger = logging.getLogger(__name__)

MAX_BACKOFF_SECONDS = 300


def enqueue_message(db, *, workspace_id, to, text, sender=None,
                    conversation_id=None, contact_id=None, inbox_message_id=None,
                    idempotency_key, channel="whatsapp") -> MessageOutbox:
    """Enqueue an outbound message. Idempotent on (workspace_id, idempotency_key):
    a second call with the same key returns the existing row, never a duplicate."""
    existing = (db.query(MessageOutbox)
                .filter(MessageOutbox.workspace_id == workspace_id,
                        MessageOutbox.idempotency_key == idempotency_key).first())
    if existing:
        return existing

    row = MessageOutbox(
        workspace_id=workspace_id, contact_id=contact_id, conversation_id=conversation_id,
        inbox_message_id=inbox_message_id, channel=channel,
        payload={"to": to, "text": text, "sender": sender},
        idempotency_key=idempotency_key, status="pending", attempts=0,
        next_attempt_at=None,
    )
    try:
        with db.begin_nested():   # SAVEPOINT — a unique clash rolls back only this insert
            db.add(row)
        return row
    except IntegrityError:
        # Lost a race — the row now exists; return it.
        return (db.query(MessageOutbox)
                .filter(MessageOutbox.workspace_id == workspace_id,
                        MessageOutbox.idempotency_key == idempotency_key).first())


def process_outbox(db, *, limit: int = 25, now: datetime | None = None, send_fn=None) -> dict:
    """Drain due rows once. `now` and `send_fn` are injectable for tests."""
    now = now or datetime.utcnow()
    send_fn = send_fn or wa_provider.send_text
    rows = (db.query(MessageOutbox)
            .filter(MessageOutbox.status.in_(["pending", "failed"]),
                    MessageOutbox.attempts < MessageOutbox.max_attempts)
            .filter((MessageOutbox.next_attempt_at.is_(None)) | (MessageOutbox.next_attempt_at <= now))
            .order_by(MessageOutbox.created_at.asc())
            .limit(limit).all())

    stats = {"processed": 0, "sent": 0, "failed": 0, "dead": 0}
    for row in rows:
        stats["processed"] += 1
        row.status = "sending"
        row.attempts += 1
        db.commit()
        try:
            pmid = send_fn(row.payload.get("to"), row.payload.get("text"), row.payload.get("sender"))
            row.status = "sent"
            row.provider_message_id = pmid
            row.sent_at = datetime.utcnow()
            row.last_error = None
            if row.inbox_message_id and pmid:
                msg = db.query(InboxMessage).filter(InboxMessage.id == row.inbox_message_id).first()
                if msg and not msg.wamid:
                    msg.wamid = pmid
            stats["sent"] += 1
        except Exception as exc:
            row.last_error = str(exc)[:1000]
            if row.attempts >= row.max_attempts:
                row.status = "dead"
                stats["dead"] += 1
                logger.warning("[outbox] message %s dead after %s attempts: %s", row.id, row.attempts, exc)
            else:
                row.status = "failed"
                row.next_attempt_at = now + timedelta(seconds=min(MAX_BACKOFF_SECONDS, 2 ** row.attempts))
                stats["failed"] += 1
        db.commit()
    return stats
