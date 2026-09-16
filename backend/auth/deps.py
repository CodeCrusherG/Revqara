"""
FastAPI auth dependencies.

Resolves, from a JWT, the current user AND the *active* workspace (the ``ws``
claim — which a workspace switch changes), validated against the caller's
membership. Roles/permissions come from the WorkspaceMember row.

Backward compatibility: a user with no membership row but whose
``User.workspace_id`` equals the active workspace is treated as its owner, so
pre-migration / directly-seeded accounts keep working.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from auth.rbac import has_permission
from auth.security import decode_access_token
from db.database import get_db
from db.models import User, Workspace, WorkspaceMember

_bearer = HTTPBearer(auto_error=True)


@dataclass
class AuthContext:
    """Everything an endpoint needs to authorize a request."""
    user: User
    workspace: Workspace
    role: str
    membership: WorkspaceMember | None  # None for the legacy owner fallback

    @property
    def user_id(self) -> str:
        return self.user.id

    @property
    def workspace_id(self) -> str:
        return self.workspace.id


def get_auth_context(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> AuthContext:
    payload = decode_access_token(creds.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    ws_id = payload.get("ws") or user.workspace_id
    ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not ws:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Workspace not found")

    membership = (db.query(WorkspaceMember)
                  .filter(WorkspaceMember.workspace_id == ws_id, WorkspaceMember.user_id == user.id)
                  .first())
    if membership is not None:
        if membership.status == "disabled":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your access to this workspace is disabled")
        role = membership.role
    elif user.workspace_id == ws_id:
        # Legacy / directly-seeded account: treat as owner of its own workspace.
        role = user.role or "owner"
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this workspace")

    return AuthContext(user=user, workspace=ws, role=role, membership=membership)


def get_current_user(ctx: AuthContext = Depends(get_auth_context)) -> User:
    return ctx.user


def get_current_workspace(ctx: AuthContext = Depends(get_auth_context)) -> Workspace:
    return ctx.workspace


def require_permission(permission: str):
    """Dependency factory: 403 unless the caller's role grants ``permission``."""
    def _dep(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if not has_permission(ctx.role, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="You don't have permission to perform this action")
        return ctx
    return _dep
