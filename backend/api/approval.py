"""
Human-in-the-Loop approval endpoints.

Routes:
  POST /api/campaigns/{id}/approve   — resume LangGraph from execute node
  POST /api/campaigns/{id}/reject    — resume LangGraph from planner node
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Campaign, CampaignStatus, Workspace
from auth.deps import get_current_workspace
from workflows.langgraph_flow import resume_campaign_workflow

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RejectRequest(BaseModel):
    feedback: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/campaigns/{campaign_id}/approve")
def approve_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    ws: Workspace = Depends(get_current_workspace),
    db: Session = Depends(get_db),
):
    """
    Approve a campaign in `pending_approval` state.
    Sets status to `approved` and resumes LangGraph from execute_campaign node.
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.workspace_id == ws.id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.status != CampaignStatus.pending_approval:
        raise HTTPException(
            status_code=400,
            detail=f"Campaign is in '{campaign.status.value}' state — cannot approve.",
        )

    campaign.status = CampaignStatus.approved
    campaign.updated_at = datetime.utcnow()
    db.commit()

    # Resume LangGraph node in background
    background_tasks.add_task(_resume_workflow_async, campaign_id)

    return {
        "campaign_id": campaign_id,
        "status": campaign.status.value,
        "message": "Campaign approved. Execution starting now.",
    }


@router.post("/campaigns/{campaign_id}/reject")
def reject_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    req: RejectRequest = RejectRequest(),
    ws: Workspace = Depends(get_current_workspace),
    db: Session = Depends(get_db),
):
    """
    Reject a campaign that is in `pending_approval` status.
    Accepts optional feedback text and sends it back to the Planner agent
    to regenerate the campaign strategy (Phase 2 re-routes the graph).
    """
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.workspace_id == ws.id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.status != CampaignStatus.pending_approval:
        raise HTTPException(
            status_code=400,
            detail=f"Campaign is in '{campaign.status.value}' state — cannot reject.",
        )

    campaign.status = CampaignStatus.rejected
    campaign.rejection_feedback = req.feedback
    campaign.updated_at = datetime.utcnow()
    db.commit()

    logger.info("Campaign %s rejected (feedback: %s)", campaign_id, req.feedback)

    # Resume LangGraph (routes to reject_handler)
    background_tasks.add_task(_resume_workflow_async, campaign_id)

    return {
        "campaign_id": campaign_id,
        "status": campaign.status.value,
        "feedback": req.feedback,
        "message": "Campaign rejected. Feedback forwarded to the Planner agent.",
    }


# ── Background helpers ─────────────────────────────────────────────────────────

def _resume_workflow_async(campaign_id: str):
    """Background task: resumes LangGraph execution based on current DB status."""
    try:
        resume_campaign_workflow(campaign_id)
    except Exception as exc:
        logger.error("Workflow resumption failed for campaign %s: %s", campaign_id, exc)
