"""
Message templates API (workspace-scoped).

WhatsApp requires pre-approved templates for business-initiated messages outside
the 24-hour customer-service window. Submission/approval is mocked here (a real
integration calls the WhatsApp Business Management API and waits for Meta's
review); `submit` flips the status to approved so the flow is demoable.

  GET    /api/templates          list templates
  POST   /api/templates          create (draft)
  POST   /api/templates/{id}/submit   submit for approval (mock → approved)
  DELETE /api/templates/{id}
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.deps import get_current_workspace
from db.database import get_db
from db.models import Template, Workspace

router = APIRouter()

CATEGORIES = {"marketing", "utility", "authentication", "service"}


class TemplateIn(BaseModel):
    name: str
    body: str
    category: str = "marketing"
    language: str = "en"


def _serialize(t: Template) -> dict:
    return {"id": t.id, "name": t.name, "category": t.category, "language": t.language,
            "body": t.body, "status": t.status, "created_at": t.created_at}


@router.get("/templates")
def list_templates(ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    rows = db.query(Template).filter(Template.workspace_id == ws.id).order_by(Template.created_at.desc()).all()
    return [_serialize(t) for t in rows]


@router.post("/templates")
def create_template(body: TemplateIn, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of {sorted(CATEGORIES)}")
    name = body.name.strip().lower().replace(" ", "_")
    if db.query(Template).filter(Template.workspace_id == ws.id, Template.name == name).first():
        raise HTTPException(status_code=409, detail="A template with that name already exists.")
    t = Template(workspace_id=ws.id, name=name, body=body.body, category=body.category, language=body.language, status="draft")
    db.add(t)
    db.commit()
    db.refresh(t)
    return _serialize(t)


@router.post("/templates/{template_id}/submit")
def submit_template(template_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id, Template.workspace_id == ws.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    # Mock Meta review — approved instantly in the demo.
    t.status = "approved"
    db.commit()
    return _serialize(t)


@router.delete("/templates/{template_id}")
def delete_template(template_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id, Template.workspace_id == ws.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
