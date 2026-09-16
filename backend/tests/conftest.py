"""
Pytest fixtures for the v0.5 hardening suite.

Tests run against the configured Postgres but never pollute it: each test gets a
Session joined to an outer transaction that is rolled back on teardown
(`join_transaction_mode="create_savepoint"` lets the app code call commit()/
begin_nested() freely while everything still rolls back at the end).

The LLM is forced unreachable so the deterministic graph path runs — fast and
fully reproducible.
"""
from __future__ import annotations

import os
import uuid

# Force deterministic graph behavior BEFORE importing graph code.
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:1"  # nothing listens here

import pytest
from sqlalchemy.orm import Session

from db.database import engine
from db.models import Bot, WhatsAppAccount, Workspace


@pytest.fixture()
def db():
    connection = engine.connect()
    trans = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        connection.close()


@pytest.fixture()
def make_workspace(db):
    """Factory: create a workspace + connected number + enabled bot for a vertical."""
    def _make(vertical: str = "custom", *, bot_enabled: bool = True):
        ws = Workspace(name=f"Test {vertical}", plan="pro", vertical=vertical)
        db.add(ws)
        db.flush()
        pnid = f"testpnid-{uuid.uuid4().hex}"
        acct = WhatsAppAccount(workspace_id=ws.id, phone_number_id=pnid, waba_id=pnid,
                               display_phone_number="+10000000000", verified_name=ws.name, status="connected")
        db.add(acct)
        db.add(Bot(workspace_id=ws.id, enabled=bot_enabled, handoff_enabled=True, name=ws.name))
        db.flush()
        return ws, acct
    return _make


@pytest.fixture()
def send_inbound(db):
    """Helper: process one inbound message through the hardened service."""
    from services.inbound import process_inbound_message

    counter = {"n": 0}

    def _send(acct, text, *, wa_id="919000000001", name="Test Customer", event_id=None):
        counter["n"] += 1
        event_id = event_id or f"evt-{uuid.uuid4().hex}"
        return process_inbound_message(
            db, provider="whatsapp_sim", provider_event_id=event_id,
            phone_number_id=acct.phone_number_id, wa_id=wa_id, name=name, text=text,
        )
    return _send
