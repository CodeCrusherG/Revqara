"""
Team API — members, invitations, roles (all scoped to the active workspace).

  GET    /api/team/members                 list members
  GET    /api/team/invites                 list pending invites
  POST   /api/team/invites                 create an invite (returns a one-time token)
  POST   /api/team/invites/{token}/accept  accept an invite (authenticated)
  PATCH  /api/team/members/{member_id}     change role / status
  DELETE /api/team/members/{member_id}     remove a member
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_auth_context, require_permission
from auth.rbac import ROLES, P_TEAM_MANAGE, can_manage_role
from db.database import get_db
from db.models import User, Workspace, WorkspaceInvite, WorkspaceMember

router = APIRouter()

INVITE_TTL = timedelta(days=14)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _active_owner_count(db: Session, workspace_id: str, *, exclude_member_id: str | None = None) -> int:
    q = (db.query(WorkspaceMember)
         .filter(WorkspaceMember.workspace_id == workspace_id,
                 WorkspaceMember.role == "owner", WorkspaceMember.status == "active"))
    if exclude_member_id:
        q = q.filter(WorkspaceMember.id != exclude_member_id)
    return q.count()


class InviteIn(BaseModel):
    email: str
    role: str = "agent"


class MemberPatch(BaseModel):
    role: str | None = None
    status: str | None = None   # active | disabled


def _serialize_member(m: WorkspaceMember, user: User | None) -> dict:
    return {"id": m.id, "user_id": m.user_id, "role": m.role, "status": m.status,
            "email": (user.email if user else None), "full_name": (user.full_name if user else None),
            "created_at": m.created_at}


@router.get("/team/members")
def list_members(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    rows = (db.query(WorkspaceMember, User)
            .outerjoin(User, User.id == WorkspaceMember.user_id)
            .filter(WorkspaceMember.workspace_id == ctx.workspace.id)
            .order_by(WorkspaceMember.created_at.asc()).all())
    return [_serialize_member(m, u) for m, u in rows]


@router.get("/team/invites")
def list_invites(ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)), db: Session = Depends(get_db)):
    rows = (db.query(WorkspaceInvite)
            .filter(WorkspaceInvite.workspace_id == ctx.workspace.id, WorkspaceInvite.status == "pending")
            .order_by(WorkspaceInvite.created_at.desc()).all())
    return [{"id": i.id, "email": i.email, "role": i.role, "status": i.status,
             "expires_at": i.expires_at, "created_at": i.created_at} for i in rows]


@router.post("/team/invites")
def create_invite(body: InviteIn, ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)),
                  db: Session = Depends(get_db)):
    email = (body.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required.")
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {', '.join(ROLES)}.")
    if not can_manage_role(ctx.role, body.role):
        raise HTTPException(status_code=403, detail="You can't invite a member at or above your own role.")

    # Already a member?
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        already = (db.query(WorkspaceMember)
                   .filter(WorkspaceMember.workspace_id == ctx.workspace.id,
                           WorkspaceMember.user_id == existing_user.id,
                           WorkspaceMember.status != "disabled").first())
        if already:
            raise HTTPException(status_code=409, detail="That person is already a member of this workspace.")

    raw = secrets.token_urlsafe(32)
    invite = WorkspaceInvite(
        workspace_id=ctx.workspace.id, email=email, role=body.role,
        token_hash=_hash_token(raw), invited_by_user_id=ctx.user.id,
        status="pending", expires_at=datetime.utcnow() + INVITE_TTL,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    # The raw token is returned ONCE (no email infra in this build).
    return {"id": invite.id, "email": invite.email, "role": invite.role,
            "token": raw, "expires_at": invite.expires_at}


@router.post("/team/invites/{token}/accept")
def accept_invite(token: str, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    invite = (db.query(WorkspaceInvite)
              .filter(WorkspaceInvite.token_hash == _hash_token(token)).first())
    if not invite or invite.status != "pending":
        raise HTTPException(status_code=404, detail="This invite is invalid or has already been used.")
    if invite.expires_at and invite.expires_at < datetime.utcnow():
        invite.status = "expired"
        db.commit()
        raise HTTPException(status_code=410, detail="This invite has expired.")
    if (ctx.user.email or "").lower() != invite.email.lower():
        raise HTTPException(status_code=403, detail="This invite was issued to a different email address.")

    member = (db.query(WorkspaceMember)
              .filter(WorkspaceMember.workspace_id == invite.workspace_id,
                      WorkspaceMember.user_id == ctx.user.id).first())
    if member:
        member.role = invite.role
        member.status = "active"
    else:
        member = WorkspaceMember(workspace_id=invite.workspace_id, user_id=ctx.user.id,
                                 role=invite.role, status="active")
        db.add(member)
    invite.status = "accepted"
    invite.accepted_at = datetime.utcnow()
    db.commit()
    ws = db.query(Workspace).filter(Workspace.id == invite.workspace_id).first()
    return {"ok": True, "workspace": {"id": ws.id, "name": ws.name, "role": member.role}}


@router.patch("/team/members/{member_id}")
def update_member(member_id: str, body: MemberPatch,
                  ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)), db: Session = Depends(get_db)):
    m = (db.query(WorkspaceMember)
         .filter(WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == ctx.workspace.id).first())
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    if not can_manage_role(ctx.role, m.role):
        raise HTTPException(status_code=403, detail="You can't manage a member at or above your own role.")

    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {', '.join(ROLES)}.")
        if not can_manage_role(ctx.role, body.role):
            raise HTTPException(status_code=403, detail="You can't assign a role at or above your own.")
        # Don't demote the last owner.
        if m.role == "owner" and body.role != "owner" and _active_owner_count(db, ctx.workspace.id, exclude_member_id=m.id) == 0:
            raise HTTPException(status_code=400, detail="A workspace must keep at least one owner.")
        m.role = body.role
    if body.status is not None:
        if body.status not in ("active", "disabled"):
            raise HTTPException(status_code=400, detail="Status must be 'active' or 'disabled'.")
        if body.status == "disabled" and m.role == "owner" and _active_owner_count(db, ctx.workspace.id, exclude_member_id=m.id) == 0:
            raise HTTPException(status_code=400, detail="A workspace must keep at least one active owner.")
        m.status = body.status
    db.commit()
    user = db.query(User).filter(User.id == m.user_id).first()
    return _serialize_member(m, user)


@router.delete("/team/members/{member_id}")
def remove_member(member_id: str, ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)),
                  db: Session = Depends(get_db)):
    m = (db.query(WorkspaceMember)
         .filter(WorkspaceMember.id == member_id, WorkspaceMember.workspace_id == ctx.workspace.id).first())
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    if not can_manage_role(ctx.role, m.role):
        raise HTTPException(status_code=403, detail="You can't remove a member at or above your own role.")
    if m.role == "owner" and _active_owner_count(db, ctx.workspace.id, exclude_member_id=m.id) == 0:
        raise HTTPException(status_code=400, detail="A workspace must keep at least one owner.")
    db.delete(m)
    db.commit()
    return {"ok": True}
