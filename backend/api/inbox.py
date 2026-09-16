"""
WhatsApp inbox + AI bot API (workspace-scoped).

  GET  /api/inbox/conversations              list threads
  GET  /api/inbox/conversations/{id}         full thread (messages)
  POST /api/inbox/conversations/{id}/reply   agent reply (human)
  POST /api/inbox/conversations/{id}/auto-reply  toggle bot vs. human takeover
  POST /api/inbox/conversations/{id}/read    mark read
  GET  /api/inbox/bot                         get bot config
  PUT  /api/inbox/bot                         update bot config
  POST /api/inbox/simulate                    fire a demo inbound customer message
"""
from __future__ import annotations

from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_auth_context, get_current_workspace, require_permission
from auth.rbac import P_LEADS_ASSIGN, can_view_all_leads
from db.database import get_db
from db.models import Bot, Contact, Conversation, InboxMessage, Lead, SalesTeamMember, WhatsAppAccount, Workspace
from tools.whatsapp_client import get_whatsapp_client, WA_SIM_URL

router = APIRouter()

SERVICE_WINDOW = timedelta(hours=24)


# ── Conversations ───────────────────────────────────────────────────────────────

def _owned_convo(db: Session, convo_id: str, ws: Workspace) -> Conversation:
    c = db.query(Conversation).filter(Conversation.id == convo_id, Conversation.workspace_id == ws.id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


def _last_text(db: Session, convo_id: str) -> str | None:
    m = (db.query(InboxMessage).filter(InboxMessage.conversation_id == convo_id)
         .order_by(InboxMessage.created_at.desc()).first())
    return m.text if m else None


def _latest_lead(db: Session, convo_id: str) -> Lead | None:
    return (db.query(Lead).filter(Lead.conversation_id == convo_id)
            .order_by(Lead.created_at.desc()).first())


@router.get("/inbox/stats")
def inbox_stats(ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Total chats, leads, and unresolved (open + needs attention)."""
    total = db.query(Conversation).filter(Conversation.workspace_id == ws.id).count()
    unresolved = (db.query(Conversation)
                  .filter(Conversation.workspace_id == ws.id, Conversation.status == "open")
                  .filter((Conversation.auto_reply == False) | (Conversation.unread == True))  # noqa: E712
                  .count())
    leads = db.query(Lead).filter(Lead.workspace_id == ws.id).count()
    return {"total_chats": total, "leads": leads, "unresolved": unresolved}


@router.get("/inbox/conversations")
def list_conversations(assigned: str | None = None, ctx: AuthContext = Depends(get_auth_context),
                       db: Session = Depends(get_db)):
    ws = ctx.workspace
    rows = (db.query(Conversation).filter(Conversation.workspace_id == ws.id)
            .order_by(Conversation.updated_at.desc()).all())
    leads = {l.conversation_id: l for l in
             db.query(Lead).filter(Lead.workspace_id == ws.id, Lead.conversation_id.isnot(None))
             .order_by(Lead.created_at.asc()).all()}  # asc → latest wins on overwrite

    team_ids = set()
    restricted = not can_view_all_leads(ctx.role) and ctx.role != "viewer"
    if restricted:
        team_ids = {r[0] for r in db.query(SalesTeamMember.team_id)
                    .filter(SalesTeamMember.workspace_id == ws.id, SalesTeamMember.user_id == ctx.user.id).all()}

    out = []
    for c in rows:
        lead = leads.get(c.id)
        au = lead.assigned_to_user_id if lead else None
        at = lead.assigned_to_team_id if lead else None
        # Role scoping: agents only see conversations whose lead is theirs / their team's.
        if restricted and not (au == ctx.user.id or (at and at in team_ids)):
            continue
        if assigned == "me" and au != ctx.user.id and not (at and at in team_ids):
            continue
        if assigned == "unassigned" and (au or at):
            continue
        out.append({
            "id": c.id, "customer_wa_id": c.customer_wa_id, "customer_name": c.customer_name,
            "status": c.status, "auto_reply": c.auto_reply, "unread": c.unread,
            "last_inbound_at": c.last_inbound_at, "updated_at": c.updated_at,
            "last_message": _last_text(db, c.id),
            "lead_id": (lead.id if lead else None),
            "assigned_to_user_id": au, "assigned_to_team_id": at,
            "needs_human": (lead.needs_human if lead else False),
        })
    return out


def _parse_fields(details: str | None) -> dict:
    """Best-effort parse of the graph's 'k: v, k2: v2' detail string into a dict."""
    if not details or ":" not in details:
        return {}
    out = {}
    for part in details.split(", "):
        if ": " in part:
            k, v = part.split(": ", 1)
            if k and " " not in k.strip() and v.strip():
                out[k.strip()] = v.strip()
    return out


@router.get("/inbox/conversations/{convo_id}")
def get_conversation(convo_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    from ai_graph.packs import get_pack
    c = _owned_convo(db, convo_id, ws)
    c.unread = False
    db.commit()
    msgs = (db.query(InboxMessage).filter(InboxMessage.conversation_id == c.id)
            .order_by(InboxMessage.created_at.asc()).all())
    within_window = bool(c.last_inbound_at and datetime.utcnow() - c.last_inbound_at <= SERVICE_WINDOW)

    lead = db.query(Lead).filter(Lead.conversation_id == c.id).order_by(Lead.created_at.desc()).first()
    contact = db.query(Contact).filter(Contact.id == c.contact_id).first() if c.contact_id else None
    pack = get_pack(ws.vertical)

    return {
        "id": c.id, "customer_wa_id": c.customer_wa_id, "customer_name": c.customer_name,
        "status": c.status, "auto_reply": c.auto_reply, "within_24h_window": within_window,
        "vertical": pack["vertical"], "vertical_label": pack["label"], "vertical_fields": pack["lead_fields"],
        "tags": (contact.tags if contact else []) or [],
        "lead": ({"id": lead.id, "intent": lead.intent, "stage": lead.status, "details": lead.details,
                  "fields": _parse_fields(lead.details),
                  "assigned_to_user_id": lead.assigned_to_user_id,
                  "assigned_to_team_id": lead.assigned_to_team_id,
                  "needs_human": lead.needs_human} if lead else None),
        "messages": [{"id": m.id, "direction": m.direction, "sender": m.sender, "text": m.text, "created_at": m.created_at} for m in msgs],
    }


class AssignConvoIn(BaseModel):
    user_id: str | None = None
    team_id: str | None = None


@router.post("/inbox/conversations/{convo_id}/assign")
def assign_conversation(convo_id: str, body: AssignConvoIn,
                        ctx: AuthContext = Depends(require_permission(P_LEADS_ASSIGN)), db: Session = Depends(get_db)):
    """Assign the conversation's latest lead to a user and/or team."""
    from api.leads import _apply_assignment, _serialize, _name_maps
    c = _owned_convo(db, convo_id, ctx.workspace)
    lead = _latest_lead(db, c.id)
    if not lead:
        raise HTTPException(status_code=404, detail="No lead on this conversation yet.")
    if not body.user_id and not body.team_id:
        _apply_assignment(db, lead, user_id=None, team_id=None, actor_id=ctx.user.id)
        lead.assigned_to_user_id = None
        lead.assigned_to_team_id = None
    else:
        _apply_assignment(db, lead, user_id=body.user_id, team_id=body.team_id, actor_id=ctx.user.id)
    db.commit()
    db.refresh(lead)
    user_map, team_map = _name_maps(db, ctx.workspace.id)
    return _serialize(lead, user_map=user_map, team_map=team_map)


class ReplyIn(BaseModel):
    text: str


@router.post("/inbox/conversations/{convo_id}/reply")
def reply(convo_id: str, body: ReplyIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = _owned_convo(db, convo_id, ws)
    if not c.last_inbound_at or datetime.utcnow() - c.last_inbound_at > SERVICE_WINDOW:
        raise HTTPException(status_code=400, detail="Outside the 24-hour customer-service window — an approved template is required to re-open this chat.")
    wamid = None
    try:
        sent = get_whatsapp_client().send_message(to=c.customer_wa_id, text=body.text, sender=c.phone_number_id)
        wamid = sent.id
    except Exception:
        pass
    db.add(InboxMessage(workspace_id=ws.id, conversation_id=c.id, direction="outbound", sender="agent", text=body.text, wamid=wamid))
    c.unread = False
    db.commit()
    return {"ok": True}


class AutoReplyIn(BaseModel):
    enabled: bool


@router.post("/inbox/conversations/{convo_id}/auto-reply")
def set_auto_reply(convo_id: str, body: AutoReplyIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = _owned_convo(db, convo_id, ws)
    c.auto_reply = body.enabled
    db.commit()
    return {"ok": True, "auto_reply": c.auto_reply}


@router.post("/inbox/conversations/{convo_id}/read")
def mark_read(convo_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    c = _owned_convo(db, convo_id, ws)
    c.unread = False
    db.commit()
    return {"ok": True}


# ── Bot config ──────────────────────────────────────────────────────────────────

class BotIn(BaseModel):
    enabled: bool | None = None
    handoff_enabled: bool | None = None
    name: str | None = None
    prompt: str | None = None
    knowledge: str | None = None


def _get_or_create_bot(db: Session, ws: Workspace) -> Bot:
    bot = db.query(Bot).filter(Bot.workspace_id == ws.id).first()
    if not bot:
        bot = Bot(workspace_id=ws.id, enabled=True, handoff_enabled=True, name=ws.name)
        db.add(bot)
        db.commit()
        db.refresh(bot)
    return bot


def _serialize_bot(b: Bot) -> dict:
    return {"enabled": b.enabled, "handoff_enabled": b.handoff_enabled, "name": b.name, "prompt": b.prompt, "knowledge": b.knowledge}


@router.get("/inbox/bot")
def get_bot(ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    return _serialize_bot(_get_or_create_bot(db, ws))


@router.put("/inbox/bot")
def update_bot(body: BotIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    bot = _get_or_create_bot(db, ws)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(bot, k, v)
    db.commit()
    return _serialize_bot(bot)


# ── Demo helper: fire an inbound customer message ─────────────────────────────────

class SimulateIn(BaseModel):
    text: str
    from_number: str | None = None
    name: str | None = None


@router.post("/inbox/simulate")
def simulate_inbound(body: SimulateIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    acct = (db.query(WhatsAppAccount)
            .filter(WhatsAppAccount.workspace_id == ws.id, WhatsAppAccount.status == "connected")
            .order_by(WhatsAppAccount.created_at.asc()).first())
    if not acct:
        raise HTTPException(status_code=400, detail="Connect a WhatsApp number first (Settings → Connect WhatsApp).")
    payload = {
        "phone_number_id": acct.phone_number_id,
        "from": body.from_number or "919812345678",
        "name": body.name or "Test Customer",
        "text": body.text,
    }
    try:
        with httpx.Client(timeout=10) as client:
            client.post(f"{WA_SIM_URL.rstrip('/')}/sim/inbound", json=payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Simulator unreachable: {exc}")
    return {"ok": True}
