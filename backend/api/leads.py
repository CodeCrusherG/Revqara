"""
Leads API (workspace-scoped) — captured sales/booking enquiries.

Leads are created automatically when the bot detects intent in a conversation
or manually by an agent. Role-aware: agents see only leads assigned to them or
to a sales team they belong to; managers/admins/owners (and read-only viewers)
see all.

  GET   /api/leads                 list leads (role-scoped; filters: assigned, team_id, stage)
  POST  /api/leads                 create a lead manually
  PATCH /api/leads/{id}            update status
  PATCH /api/leads/{id}/assign     assign to a user and/or team
  PATCH /api/leads/{id}/unassign   clear assignment
  GET   /api/me/assigned-leads     leads assigned to the caller (or their teams)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_auth_context, get_current_workspace, require_permission
from auth.rbac import P_LEADS_ASSIGN, can_view_all_leads
from db.database import get_db
from db.models import (
    Conversation, Lead, LeadAssignment, SalesTeam, SalesTeamMember, User,
    Workspace, WorkspaceMember,
)

router = APIRouter()
STATUSES = {"new", "qualified", "won", "lost"}


def _team_ids_for_user(db: Session, workspace_id: str, user_id: str) -> list[str]:
    rows = (db.query(SalesTeamMember.team_id)
            .filter(SalesTeamMember.workspace_id == workspace_id, SalesTeamMember.user_id == user_id).all())
    return [r[0] for r in rows]


def _name_maps(db: Session, workspace_id: str) -> tuple[dict, dict]:
    users = {u.id: (u.full_name or u.email)
             for u in db.query(User).join(WorkspaceMember, WorkspaceMember.user_id == User.id)
             .filter(WorkspaceMember.workspace_id == workspace_id)}
    teams = {t.id: t.name for t in db.query(SalesTeam).filter(SalesTeam.workspace_id == workspace_id)}
    return users, teams


def _serialize(l: Lead, *, user_map: dict | None = None, team_map: dict | None = None) -> dict:
    user_map = user_map or {}
    team_map = team_map or {}
    return {
        "id": l.id, "name": l.name, "phone": l.phone, "intent": l.intent, "details": l.details,
        "source": l.source, "status": l.status, "conversation_id": l.conversation_id,
        "assigned_to_user_id": l.assigned_to_user_id, "assigned_to_team_id": l.assigned_to_team_id,
        "assigned_to_user_name": user_map.get(l.assigned_to_user_id),
        "assigned_to_team_name": team_map.get(l.assigned_to_team_id),
        "needs_human": l.needs_human, "created_at": l.created_at,
    }


class LeadIn(BaseModel):
    name: str | None = None
    phone: str | None = None
    intent: str | None = None
    details: str | None = None
    conversation_id: str | None = None


class LeadStatusIn(BaseModel):
    status: str


class AssignIn(BaseModel):
    user_id: str | None = None
    team_id: str | None = None


@router.get("/leads")
def list_leads(
    assigned: str | None = Query(None, description="me | unassigned"),
    team_id: str | None = None,
    stage: str | None = None,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    q = db.query(Lead).filter(Lead.workspace_id == ctx.workspace.id)

    # Role scoping: agents are limited to their own / their teams' leads.
    # Viewers are read-only but can see the whole pipeline (dashboard role).
    if not can_view_all_leads(ctx.role) and ctx.role != "viewer":
        team_ids = _team_ids_for_user(db, ctx.workspace.id, ctx.user.id)
        conds = [Lead.assigned_to_user_id == ctx.user.id]
        if team_ids:
            conds.append(Lead.assigned_to_team_id.in_(team_ids))
        q = q.filter(or_(*conds))

    if assigned == "me":
        q = q.filter(Lead.assigned_to_user_id == ctx.user.id)
    elif assigned == "unassigned":
        q = q.filter(Lead.assigned_to_user_id.is_(None), Lead.assigned_to_team_id.is_(None))
    if team_id:
        q = q.filter(Lead.assigned_to_team_id == team_id)
    if stage:
        q = q.filter(Lead.status == stage)

    rows = q.order_by(Lead.created_at.desc()).all()
    user_map, team_map = _name_maps(db, ctx.workspace.id)
    return [_serialize(l, user_map=user_map, team_map=team_map) for l in rows]


@router.post("/leads")
def create_lead(body: LeadIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    contact_id = None
    if body.conversation_id:
        convo = db.query(Conversation).filter(Conversation.id == body.conversation_id, Conversation.workspace_id == ws.id).first()
        if convo:
            contact_id = convo.contact_id
            body.name = body.name or convo.customer_name
            body.phone = body.phone or convo.customer_wa_id
    lead = Lead(workspace_id=ws.id, conversation_id=body.conversation_id, contact_id=contact_id,
                name=body.name, phone=body.phone, intent=body.intent or "manual", details=body.details,
                source="agent", status="new")
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return _serialize(lead)


@router.patch("/leads/{lead_id}")
def update_lead(lead_id: str, body: LeadStatusIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    from ai_graph.packs import get_pack
    # Accept the generic statuses OR any stage in the workspace vertical's pipeline.
    allowed = STATUSES | set(get_pack(ws.vertical).get("pipeline_stages", []))
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(allowed)}")
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.workspace_id == ws.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.status = body.status
    db.commit()
    return _serialize(lead)


def _apply_assignment(db: Session, lead: Lead, *, user_id: str | None, team_id: str | None, actor_id: str | None):
    """Set the lead's current assignee and append an audit row, superseding any
    prior active assignment."""
    (db.query(LeadAssignment)
       .filter(LeadAssignment.lead_id == lead.id, LeadAssignment.status == "active")
       .update({LeadAssignment.status: "reassigned"}, synchronize_session=False))
    lead.assigned_to_user_id = user_id
    lead.assigned_to_team_id = team_id
    if user_id or team_id:
        lead.needs_human = False  # a human / team now owns it
        db.add(LeadAssignment(workspace_id=lead.workspace_id, lead_id=lead.id,
                              assigned_to_user_id=user_id, assigned_to_team_id=team_id,
                              assigned_by_user_id=actor_id, status="active"))


@router.patch("/leads/{lead_id}/assign")
def assign_lead(lead_id: str, body: AssignIn,
                ctx: AuthContext = Depends(require_permission(P_LEADS_ASSIGN)), db: Session = Depends(get_db)):
    if not body.user_id and not body.team_id:
        raise HTTPException(status_code=400, detail="Provide a user_id and/or team_id to assign.")
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.workspace_id == ctx.workspace.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if body.user_id:
        ok = (db.query(WorkspaceMember)
              .filter(WorkspaceMember.workspace_id == ctx.workspace.id,
                      WorkspaceMember.user_id == body.user_id, WorkspaceMember.status != "disabled").first())
        if not ok:
            raise HTTPException(status_code=400, detail="That user is not an active member of this workspace.")
    if body.team_id:
        team = db.query(SalesTeam).filter(SalesTeam.id == body.team_id, SalesTeam.workspace_id == ctx.workspace.id).first()
        if not team:
            raise HTTPException(status_code=400, detail="That sales team does not exist in this workspace.")
    _apply_assignment(db, lead, user_id=body.user_id, team_id=body.team_id, actor_id=ctx.user.id)
    db.commit()
    db.refresh(lead)
    user_map, team_map = _name_maps(db, ctx.workspace.id)
    return _serialize(lead, user_map=user_map, team_map=team_map)


@router.patch("/leads/{lead_id}/unassign")
def unassign_lead(lead_id: str, ctx: AuthContext = Depends(require_permission(P_LEADS_ASSIGN)),
                  db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.workspace_id == ctx.workspace.id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    (db.query(LeadAssignment)
       .filter(LeadAssignment.lead_id == lead.id, LeadAssignment.status == "active")
       .update({LeadAssignment.status: "closed"}, synchronize_session=False))
    lead.assigned_to_user_id = None
    lead.assigned_to_team_id = None
    db.commit()
    db.refresh(lead)
    return _serialize(lead)


@router.get("/me/assigned-leads")
def my_assigned_leads(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    team_ids = _team_ids_for_user(db, ctx.workspace.id, ctx.user.id)
    conds = [Lead.assigned_to_user_id == ctx.user.id]
    if team_ids:
        conds.append(Lead.assigned_to_team_id.in_(team_ids))
    rows = (db.query(Lead).filter(Lead.workspace_id == ctx.workspace.id, or_(*conds))
            .order_by(Lead.created_at.desc()).all())
    user_map, team_map = _name_maps(db, ctx.workspace.id)
    return [_serialize(l, user_map=user_map, team_map=team_map) for l in rows]
