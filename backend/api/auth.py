"""Authentication + account endpoints: signup, login, me."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_auth_context
from auth.security import create_access_token, hash_password, verify_password
from db.database import get_db
from db.models import User, Workspace, WorkspaceMember

router = APIRouter()


class SignupRequest(BaseModel):
    email: str
    password: str
    workspace_name: str | None = None
    full_name: str | None = None
    vertical: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


def ensure_membership(db: Session, *, workspace_id: str, user_id: str, role: str = "owner") -> WorkspaceMember:
    """Idempotently ensure a WorkspaceMember row exists (used at signup/login so
    directly-seeded accounts gain a membership the team APIs can see)."""
    m = (db.query(WorkspaceMember)
         .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
         .first())
    if not m:
        m = WorkspaceMember(workspace_id=workspace_id, user_id=user_id, role=role, status="active")
        db.add(m)
    return m


def _serialize(user: User, workspace: Workspace, role: str) -> dict:
    return {
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": role},
        "workspace": {"id": workspace.id, "name": workspace.name, "plan": workspace.plan,
                      "plan_status": workspace.plan_status, "vertical": workspace.vertical, "role": role},
    }


@router.post("/auth/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    if not email or not req.password or len(req.password) < 6:
        raise HTTPException(status_code=400, detail="A valid email and a password of at least 6 characters are required.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    from ai_graph.packs import VERTICAL_PACKS
    vertical = req.vertical if req.vertical in VERTICAL_PACKS else "custom"
    workspace = Workspace(name=(req.workspace_name or f"{email.split('@')[0]}'s workspace").strip(), plan="free", vertical=vertical)
    db.add(workspace)
    db.flush()
    user = User(
        workspace_id=workspace.id,
        email=email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        role="owner",
    )
    db.add(user)
    db.flush()
    ensure_membership(db, workspace_id=workspace.id, user_id=user.id, role="owner")
    db.commit()
    db.refresh(user)
    db.refresh(workspace)

    token = create_access_token(user.id, workspace.id)
    return {"access_token": token, "token_type": "bearer", **_serialize(user, workspace, "owner")}


@router.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    workspace = db.query(Workspace).filter(Workspace.id == user.workspace_id).first()
    # Backfill membership for directly-seeded/legacy accounts.
    m = ensure_membership(db, workspace_id=workspace.id, user_id=user.id, role=(user.role or "owner"))
    db.commit()
    token = create_access_token(user.id, workspace.id)
    return {"access_token": token, "token_type": "bearer", **_serialize(user, workspace, m.role)}


@router.get("/auth/me")
def me(ctx: AuthContext = Depends(get_auth_context)):
    return _serialize(ctx.user, ctx.workspace, ctx.role)
