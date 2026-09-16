"""
Per-tenant WhatsApp number connection (the multi-tenant backbone).

Each workspace connects its own WhatsApp number (its own WABA + phone_number_id).
One backend / Meta app serves all tenants; inbound webhooks route to the owning
workspace by phone_number_id (see tools/whatsapp_client.py).

`connect` here mocks Meta's Embedded Signup: in production this row is created
from the credentials the Embedded Signup flow returns. You can also pass real
WABA/phone_number_id/token to bring your own (BSP path).

Endpoints:
  GET    /api/whatsapp/accounts          list connected numbers
  POST   /api/whatsapp/accounts/connect  connect a number (mock signup or BYO)
  DELETE /api/whatsapp/accounts/{id}     disconnect a number
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import get_current_workspace
from db.database import get_db
from db.models import WhatsAppAccount, Workspace
from plans import plan_def

router = APIRouter()


class ConnectRequest(BaseModel):
    # All optional — omit to simulate Embedded Signup provisioning a demo number.
    phone_number_id: str | None = None
    waba_id: str | None = None
    display_phone_number: str | None = None
    verified_name: str | None = None
    access_token: str | None = None


def _serialize(a: WhatsAppAccount) -> dict:
    return {
        "id": a.id,
        "phone_number_id": a.phone_number_id,
        "waba_id": a.waba_id,
        "display_phone_number": a.display_phone_number,
        "verified_name": a.verified_name,
        "status": a.status,
        "created_at": a.created_at,
    }


def get_workspace_sender(db: Session, workspace_id: str) -> WhatsAppAccount | None:
    """The number a workspace sends from (its first connected, active account)."""
    return (
        db.query(WhatsAppAccount)
        .filter(WhatsAppAccount.workspace_id == workspace_id, WhatsAppAccount.status == "connected")
        .order_by(WhatsAppAccount.created_at.asc())
        .first()
    )


@router.get("/whatsapp/accounts")
def list_accounts(ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    rows = db.query(WhatsAppAccount).filter(WhatsAppAccount.workspace_id == ws.id).all()
    return {"accounts": [_serialize(a) for a in rows], "max_numbers": plan_def(ws.plan)["max_numbers"]}


@router.post("/whatsapp/accounts/connect")
def connect_account(body: ConnectRequest, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    limit = plan_def(ws.plan)["max_numbers"]
    if db.query(WhatsAppAccount).filter(WhatsAppAccount.workspace_id == ws.id).count() >= limit:
        raise HTTPException(status_code=402, detail=f"Your {plan_def(ws.plan)['name']} plan allows {limit} WhatsApp number(s). Upgrade to connect more.")

    # Mock Embedded Signup: provision plausible Meta-style identifiers if absent.
    seed = uuid.uuid4().int
    phone_number_id = body.phone_number_id or str(10**14 + (seed % 10**14))
    if db.query(WhatsAppAccount).filter(WhatsAppAccount.phone_number_id == phone_number_id).first():
        raise HTTPException(status_code=409, detail="That phone_number_id is already connected.")
    waba_id = body.waba_id or str(10**14 + ((seed >> 8) % 10**14))
    display = body.display_phone_number or f"+91 {90000 + (seed % 9999):05d} {10000 + ((seed >> 4) % 89999):05d}"

    acct = WhatsAppAccount(
        workspace_id=ws.id,
        phone_number_id=phone_number_id,
        waba_id=waba_id,
        display_phone_number=display,
        verified_name=body.verified_name or ws.name,
        access_token=body.access_token,
        status="connected",
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return _serialize(acct)


@router.delete("/whatsapp/accounts/{account_id}")
def disconnect_account(account_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    acct = db.query(WhatsAppAccount).filter(WhatsAppAccount.id == account_id, WhatsAppAccount.workspace_id == ws.id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(acct)
    db.commit()
    return {"ok": True}
