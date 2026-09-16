"""
Billing + plan + usage endpoints.

Checkout is mocked (offline) — "upgrading" simply flips the workspace plan, the
same hook a real Stripe webhook would call on a successful subscription. Swap
mock_checkout for a real Stripe session to go live.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import get_current_workspace
from db.database import get_db
from db.models import Workspace
from plans import PLANS, plan_def, usage

router = APIRouter()


class UpgradeRequest(BaseModel):
    plan: str


@router.get("/billing/plans")
def get_plans():
    """Public plan catalogue for the pricing/upgrade page."""
    return {"plans": [{"id": pid, **pdef} for pid, pdef in PLANS.items()]}


@router.get("/billing/usage")
def get_usage(ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    return {**usage(db, ws), "plan_status": ws.plan_status}


@router.post("/billing/checkout")
def checkout(req: UpgradeRequest, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Mock checkout: in production this returns a Stripe Checkout URL."""
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Unknown plan.")
    ws.plan = req.plan
    ws.plan_status = "active"
    db.commit()
    return {
        "ok": True,
        "plan": ws.plan,
        "plan_name": plan_def(ws.plan)["name"],
        "message": f"You're now on the {plan_def(ws.plan)['name']} plan.",
    }


@router.post("/billing/cancel")
def cancel(ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    ws.plan = "free"
    ws.plan_status = "active"
    db.commit()
    return {"ok": True, "plan": ws.plan, "plan_name": plan_def(ws.plan)["name"]}
