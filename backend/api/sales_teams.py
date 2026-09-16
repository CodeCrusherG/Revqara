"""
Sales Teams API — named agent groups leads can be routed to.

  GET    /api/sales-teams                       list teams + members
  POST   /api/sales-teams                       create a team
  PATCH  /api/sales-teams/{id}                  rename / re-describe
  DELETE /api/sales-teams/{id}                  delete a team
  POST   /api/sales-teams/{id}/members          add a member {user_id}
  DELETE /api/sales-teams/{id}/members/{user_id}  remove a member
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_auth_context, require_permission
from auth.rbac import P_TEAM_MANAGE
from db.database import get_db
from db.models import Lead, SalesTeam, SalesTeamMember, User, WorkspaceMember

router = APIRouter()


class TeamIn(BaseModel):
    name: str
    description: str | None = None


class TeamPatch(BaseModel):
    name: str | None = None
    description: str | None = None


class TeamMemberIn(BaseModel):
    user_id: str


def _owned_team(db: Session, team_id: str, ws_id: str) -> SalesTeam:
    t = db.query(SalesTeam).filter(SalesTeam.id == team_id, SalesTeam.workspace_id == ws_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Sales team not found")
    return t


def _serialize_team(db: Session, t: SalesTeam) -> dict:
    rows = (db.query(SalesTeamMember, User)
            .outerjoin(User, User.id == SalesTeamMember.user_id)
            .filter(SalesTeamMember.team_id == t.id).all())
    members = [{"user_id": stm.user_id, "email": (u.email if u else None),
                "full_name": (u.full_name if u else None)} for stm, u in rows]
    return {"id": t.id, "name": t.name, "description": t.description,
            "member_count": len(members), "members": members, "created_at": t.created_at}


@router.get("/sales-teams")
def list_teams(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    teams = (db.query(SalesTeam).filter(SalesTeam.workspace_id == ctx.workspace.id)
             .order_by(SalesTeam.created_at.asc()).all())
    return [_serialize_team(db, t) for t in teams]


@router.post("/sales-teams")
def create_team(body: TeamIn, ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)),
                db: Session = Depends(get_db)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Team name is required.")
    if db.query(SalesTeam).filter(SalesTeam.workspace_id == ctx.workspace.id, SalesTeam.name == name).first():
        raise HTTPException(status_code=409, detail="A team with that name already exists.")
    t = SalesTeam(workspace_id=ctx.workspace.id, name=name, description=body.description)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _serialize_team(db, t)


@router.patch("/sales-teams/{team_id}")
def update_team(team_id: str, body: TeamPatch,
                ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)), db: Session = Depends(get_db)):
    t = _owned_team(db, team_id, ctx.workspace.id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Team name cannot be empty.")
        t.name = name
    if body.description is not None:
        t.description = body.description
    db.commit()
    return _serialize_team(db, t)


@router.delete("/sales-teams/{team_id}")
def delete_team(team_id: str, ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)),
                db: Session = Depends(get_db)):
    t = _owned_team(db, team_id, ctx.workspace.id)
    # Unhook any leads routed to this team so nothing dangles.
    db.query(Lead).filter(Lead.workspace_id == ctx.workspace.id, Lead.assigned_to_team_id == t.id) \
        .update({Lead.assigned_to_team_id: None}, synchronize_session=False)
    db.query(SalesTeamMember).filter(SalesTeamMember.team_id == t.id).delete(synchronize_session=False)
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/sales-teams/{team_id}/members")
def add_team_member(team_id: str, body: TeamMemberIn,
                    ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)), db: Session = Depends(get_db)):
    t = _owned_team(db, team_id, ctx.workspace.id)
    # The user must be a member of this workspace.
    wm = (db.query(WorkspaceMember)
          .filter(WorkspaceMember.workspace_id == ctx.workspace.id, WorkspaceMember.user_id == body.user_id,
                  WorkspaceMember.status != "disabled").first())
    if not wm:
        raise HTTPException(status_code=400, detail="That user is not an active member of this workspace.")
    exists = (db.query(SalesTeamMember)
              .filter(SalesTeamMember.team_id == t.id, SalesTeamMember.user_id == body.user_id).first())
    if not exists:
        db.add(SalesTeamMember(workspace_id=ctx.workspace.id, team_id=t.id, user_id=body.user_id))
        db.commit()
    return _serialize_team(db, t)


@router.delete("/sales-teams/{team_id}/members/{user_id}")
def remove_team_member(team_id: str, user_id: str,
                       ctx: AuthContext = Depends(require_permission(P_TEAM_MANAGE)), db: Session = Depends(get_db)):
    t = _owned_team(db, team_id, ctx.workspace.id)
    stm = (db.query(SalesTeamMember)
           .filter(SalesTeamMember.team_id == t.id, SalesTeamMember.user_id == user_id).first())
    if stm:
        db.delete(stm)
        db.commit()
    return _serialize_team(db, t)
