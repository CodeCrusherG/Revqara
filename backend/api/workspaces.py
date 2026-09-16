"""
Workspaces API — multi-workspace membership and switching.

  GET    /api/workspaces            workspaces the caller belongs to
  POST   /api/workspaces            create a new workspace (caller = owner)
  GET    /api/workspaces/current    the active workspace + caller's role
  PUT    /api/workspaces/{id}       rename / change vertical (needs workspace.edit)
  POST   /api/workspaces/{id}/switch  issue a token scoped to {id} (must be member)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_auth_context
from auth.rbac import P_WORKSPACE_EDIT, has_permission
from auth.security import create_access_token
from db.database import get_db
from db.models import Bot, User, Workspace, WorkspaceMember

router = APIRouter()


class WorkspaceCreate(BaseModel):
    name: str
    vertical: str | None = None


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    vertical: str | None = None


def _resolve_membership(db: Session, user: User, ws_id: str) -> tuple[Workspace, str, WorkspaceMember | None]:
    """Return (workspace, role, membership) for a workspace the user belongs to,
    honoring the legacy owner fallback. Raises 404/403 otherwise."""
    ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    m = (db.query(WorkspaceMember)
         .filter(WorkspaceMember.workspace_id == ws_id, WorkspaceMember.user_id == user.id)
         .first())
    if m is not None:
        if m.status == "disabled":
            raise HTTPException(status_code=403, detail="Your access to this workspace is disabled")
        return ws, m.role, m
    if user.workspace_id == ws_id:
        return ws, (user.role or "owner"), None
    raise HTTPException(status_code=403, detail="You are not a member of this workspace")


def _serialize_ws(ws: Workspace, role: str) -> dict:
    return {"id": ws.id, "name": ws.name, "plan": ws.plan, "plan_status": ws.plan_status,
            "vertical": ws.vertical, "role": role}


@router.get("/workspaces")
def list_workspaces(ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    rows = (db.query(WorkspaceMember, Workspace)
            .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .filter(WorkspaceMember.user_id == ctx.user.id, WorkspaceMember.status != "disabled")
            .all())
    out = {ws.id: _serialize_ws(ws, m.role) for m, ws in rows}
    # Legacy fallback: include the user's primary workspace even without a row.
    if ctx.user.workspace_id not in out:
        ws = db.query(Workspace).filter(Workspace.id == ctx.user.workspace_id).first()
        if ws:
            out[ws.id] = _serialize_ws(ws, ctx.user.role or "owner")
    return {"workspaces": list(out.values()), "current": ctx.workspace.id}


@router.post("/workspaces")
def create_workspace(body: WorkspaceCreate, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    from ai_graph.packs import VERTICAL_PACKS
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Workspace name is required.")
    vertical = body.vertical if body.vertical in VERTICAL_PACKS else "custom"
    ws = Workspace(name=name, plan="free", vertical=vertical)
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=ctx.user.id, role="owner", status="active"))
    db.add(Bot(workspace_id=ws.id, enabled=True, handoff_enabled=True, name=name))
    db.commit()
    db.refresh(ws)
    token = create_access_token(ctx.user.id, ws.id)  # convenience: token for the new workspace
    return {**_serialize_ws(ws, "owner"), "access_token": token}


@router.get("/workspaces/current")
def current_workspace(ctx: AuthContext = Depends(get_auth_context)):
    return _serialize_ws(ctx.workspace, ctx.role)


@router.put("/workspaces/{ws_id}")
def update_workspace(ws_id: str, body: WorkspaceUpdate,
                     ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    from ai_graph.packs import VERTICAL_PACKS
    ws, role, _ = _resolve_membership(db, ctx.user, ws_id)
    if not has_permission(role, P_WORKSPACE_EDIT):
        raise HTTPException(status_code=403, detail="You don't have permission to edit this workspace")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Workspace name cannot be empty.")
        ws.name = name
    if body.vertical is not None:
        if body.vertical not in VERTICAL_PACKS:
            raise HTTPException(status_code=400, detail=f"Unknown vertical. Choose one of: {', '.join(VERTICAL_PACKS)}")
        ws.vertical = body.vertical
    db.commit()
    return _serialize_ws(ws, role)


@router.post("/workspaces/{ws_id}/switch")
def switch_workspace(ws_id: str, ctx: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    ws, role, _ = _resolve_membership(db, ctx.user, ws_id)  # 403 if not a member
    token = create_access_token(ctx.user.id, ws.id)
    return {"access_token": token, "token_type": "bearer", "workspace": _serialize_ws(ws, role)}
