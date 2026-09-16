"""
Vertical packs API — list available industry packs and set the workspace's pack.

Choosing a vertical instantly reconfigures the universal AI graph's lead fields,
pipeline stages, intents, response templates, tools, and compliance rules.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import get_current_workspace
from db.database import get_db
from db.models import Workspace
from ai_graph.packs import VERTICAL_PACKS, get_pack, list_verticals

router = APIRouter()


class VerticalIn(BaseModel):
    vertical: str


@router.get("/verticals")
def get_verticals(ws: Workspace = Depends(get_current_workspace)):
    """All available packs + the workspace's current selection (with its config)."""
    current = get_pack(ws.vertical)
    return {
        "current": ws.vertical,
        "verticals": list_verticals(),
        "config": {
            "label": current["label"],
            "lead_fields": current["lead_fields"],
            "pipeline_stages": current["pipeline_stages"],
            "templates": current["templates"],
            "rules": current["rules"],
            "analytics": current["analytics"],
        },
    }


@router.put("/verticals")
def set_vertical(body: VerticalIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    if body.vertical not in VERTICAL_PACKS:
        raise HTTPException(status_code=400, detail=f"Unknown vertical. Choose one of: {', '.join(VERTICAL_PACKS)}")
    ws.vertical = body.vertical
    db.commit()
    return {"ok": True, "vertical": ws.vertical, "label": get_pack(ws.vertical)["label"]}
