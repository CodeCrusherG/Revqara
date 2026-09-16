"""
Campaign REST endpoints.

Routes:
  POST /api/campaigns/generate        — kick off a new campaign workflow
  GET  /api/campaigns/{id}/status     — poll current state (every 3s by UI)
  GET  /api/campaigns/{id}/metrics    — live open/click metrics
"""
import os
import logging
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import (
    Campaign, CampaignStatus, Segment, Variant, AgentLog, ApiCallLog,
    Contact, ContactList, ContactListMember, Workspace, Template, WhatsAppMessage, Lead,
)
from auth.deps import get_current_workspace
from plans import contact_count
from tools.campaign_api_tools import get_campaign_tools
from tools.openapi_tool_factory import quota_key_for_endpoint
from workflows.langgraph_flow import run_campaign_workflow, resume_campaign_workflow

logger = logging.getLogger(__name__)
router = APIRouter()

class GenerateCampaignRequest(BaseModel):
    brief: str
    name: str | None = None
    target_list_id: str | None = None
    template_id: str | None = None
    scheduled_at: str | None = None   # ISO 8601; future → scheduled, else send now

class GenerateCampaignResponse(BaseModel):
    campaign_id: str
    status: str


def _serialize_campaign_status_summary(campaign: Campaign):
    segments = campaign.segments or []
    variants = [v for s in segments for v in (s.variants or [])]
    return {
        "id": campaign.id,
        "name": campaign.name,
        "status": campaign.status.value,
        "brief": campaign.brief,
        "created_at": campaign.created_at,
        "rejection_feedback": campaign.rejection_feedback,
        "segment_count": len(segments),
        "variant_count": len(variants),
        "has_pending_review": campaign.status == CampaignStatus.pending_approval,
    }

def _serialize_campaign(campaign: Campaign):
    return {
        "id": campaign.id,
        "name": campaign.name,
        "status": campaign.status.value,
        "brief": campaign.brief,
        "created_at": campaign.created_at,
        "state_checkpoint": campaign.state_checkpoint,
        "rejection_feedback": campaign.rejection_feedback,
        "segments": [
            {
                "id": seg.id,
                "label": seg.label,
                "criteria": seg.criteria,
                "customer_ids": seg.customer_ids,
                "send_time": seg.send_time,
                "predicted_open_rate": seg.predicted_open_rate,
                "predicted_click_rate": seg.predicted_click_rate,
                "variants": [
                    {
                        "id": var.id,
                        "external_campaign_id": var.external_campaign_id,
                        "subject": var.subject,
                        "body": var.body,
                        "has_emoji": var.has_emoji,
                        "has_url": var.has_url,
                        "font_styles": var.font_styles,
                        "sent_count": var.sent_count,
                        "open_count": var.open_count,
                        "click_count": var.click_count,
                    }
                    for var in seg.variants
                ]
            }
            for seg in campaign.segments
        ] if campaign.segments else [],
        "agent_logs": [
            {
                "id": log.id,
                "agent_name": log.agent_name,
                "step": log.step,
                "llm_reasoning": log.llm_reasoning,
                "input_payload": log.input_payload,
                "output_payload": log.output_payload,
                "created_at": log.created_at
            }
            for log in campaign.agent_logs
        ] if campaign.agent_logs else []
    }

# ── Workflow runner ───────────────────────────────────────────────────────────

def _run_campaign_workflow(campaign_id: str, brief: str):
    """Background task: runs the real 5-agent LangGraph workflow."""
    try:
        run_campaign_workflow(campaign_id=campaign_id, brief=brief)
    except Exception as exc:
        logger.error("Workflow failed for campaign %s: %s", campaign_id, exc)


def _resume_workflow_async(campaign_id: str):
    """Background task: resumes LangGraph execution."""
    try:
        resume_campaign_workflow(campaign_id)
    except Exception as exc:
        logger.error("Workflow resumption failed for campaign %s: %s", campaign_id, exc)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/campaigns/generate", response_model=GenerateCampaignResponse)
def generate_campaign(
    req: GenerateCampaignRequest,
    background_tasks: BackgroundTasks,
    ws: Workspace = Depends(get_current_workspace),
    db: Session = Depends(get_db),
):
    """
    Accept a natural-language brief and kick off the AI campaign workflow,
    targeting this workspace's contacts (optionally a specific list).
    """
    # Validate there is an audience to target.
    if req.target_list_id:
        lst = db.query(ContactList).filter(
            ContactList.id == req.target_list_id, ContactList.workspace_id == ws.id
        ).first()
        if not lst:
            raise HTTPException(status_code=404, detail="Target list not found")
        members = db.query(ContactListMember).filter(ContactListMember.list_id == req.target_list_id).count()
        if members == 0:
            raise HTTPException(status_code=400, detail="The selected list has no contacts.")
    elif contact_count(db, ws.id) == 0:
        raise HTTPException(status_code=400, detail="Add some contacts (or import a CSV) before launching a campaign.")

    # Optional approved template.
    if req.template_id:
        tmpl = db.query(Template).filter(Template.id == req.template_id, Template.workspace_id == ws.id).first()
        if not tmpl:
            raise HTTPException(status_code=404, detail="Template not found")
        if tmpl.status != "approved":
            raise HTTPException(status_code=400, detail="Template must be approved before it can be sent.")

    # Optional scheduling.
    scheduled_at = None
    if req.scheduled_at:
        try:
            scheduled_at = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail="scheduled_at must be an ISO 8601 datetime.")

    is_future = scheduled_at and scheduled_at > datetime.utcnow()
    campaign = Campaign(
        brief=req.brief, name=req.name, workspace_id=ws.id,
        target_list_id=req.target_list_id, template_id=req.template_id,
        scheduled_at=scheduled_at,
        status=CampaignStatus.scheduled if is_future else CampaignStatus.profiling,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    # Future-dated campaigns wait for the scheduler; otherwise run immediately.
    if not is_future:
        background_tasks.add_task(_run_campaign_workflow, campaign.id, req.brief)

    return GenerateCampaignResponse(campaign_id=campaign.id, status=campaign.status.value)


class TestSendRequest(BaseModel):
    to_number: str
    template_id: str | None = None
    body: str | None = None
    name: str | None = None


@router.post("/campaigns/test-send")
def test_send(req: TestSendRequest, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Send a single test message (template or free-text) to one number, before launching a campaign."""
    from api.contacts import normalize_number
    from tools.campaign_api_tools import _render_template
    from tools.whatsapp_client import get_whatsapp_client
    from db.models import WhatsAppAccount

    number = normalize_number(req.to_number)
    if not number:
        raise HTTPException(status_code=400, detail="A valid WhatsApp number is required.")

    if req.template_id:
        tmpl = db.query(Template).filter(Template.id == req.template_id, Template.workspace_id == ws.id).first()
        if not tmpl:
            raise HTTPException(status_code=404, detail="Template not found")
        text = _render_template(tmpl.body, req.name)
    elif req.body and req.body.strip():
        text = req.body.strip()
    else:
        raise HTTPException(status_code=400, detail="Provide a template_id or message body.")

    acct = (db.query(WhatsAppAccount)
            .filter(WhatsAppAccount.workspace_id == ws.id, WhatsAppAccount.status == "connected")
            .order_by(WhatsAppAccount.created_at.asc()).first())
    sender = acct.phone_number_id if acct else None

    try:
        sent = get_whatsapp_client().send_message(to=number, text=text, sender=sender)
        return {"ok": True, "to": number, "text": text, "wamid": sent.id,
                "from_number": acct.display_phone_number if acct else "default simulator number"}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Send failed: {exc}")


def _owned(db: Session, campaign_id: str, ws: Workspace) -> Campaign:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.workspace_id == ws.id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.get("/campaigns")
def list_campaigns(limit: int = 50, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Return the workspace's most recent campaigns."""
    campaigns = (
        db.query(Campaign)
        .filter(Campaign.workspace_id == ws.id)
        .order_by(Campaign.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_campaign(c) for c in campaigns]


@router.get("/campaigns/{campaign_id}/status")
def get_campaign_status(campaign_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Return full campaign state. Polled by the frontend."""
    return _serialize_campaign(_owned(db, campaign_id, ws))


@router.get("/campaigns/{campaign_id}/status-summary")
def get_campaign_status_summary(campaign_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Lightweight status payload intended for frequent UI polling."""
    return _serialize_campaign_status_summary(_owned(db, campaign_id, ws))


@router.post("/campaigns/{campaign_id}/optimize")
def optimize_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    ws: Workspace = Depends(get_current_workspace),
    db: Session = Depends(get_db),
):
    """Trigger the optimization loop (resumes LangGraph from Analyst/Optimizer)."""
    _owned(db, campaign_id, ws)
    background_tasks.add_task(_resume_workflow_async, campaign_id)
    return {"campaign_id": campaign_id, "status": "optimizing", "message": "Optimization loop started."}


# Indicative WhatsApp marketing rate per delivered message (INR). Configurable.
MARKETING_RATE_INR = float(os.environ.get("WA_MARKETING_RATE_INR", "0.78"))


@router.get("/campaigns/{campaign_id}/analytics")
def get_campaign_analytics(campaign_id: str, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """Campaign funnel: recipients, sent, delivered, read, failed, replies, leads, cost."""
    _owned(db, campaign_id, ws)
    msgs = db.query(WhatsAppMessage).filter(WhatsAppMessage.campaign_id == campaign_id).all()
    recipients = len(msgs)
    delivered = sum(1 for m in msgs if m.status in ("delivered", "read"))
    read = sum(1 for m in msgs if m.status == "read")
    failed = sum(1 for m in msgs if m.status == "failed")
    clicked = sum(1 for m in msgs if m.clicked)
    replies = sum(1 for m in msgs if m.replied)
    wa_ids = {m.wa_id for m in msgs if m.wa_id}

    unsubscribes = 0
    leads = 0
    if wa_ids:
        unsubscribes = db.query(Contact).filter(
            Contact.workspace_id == ws.id,
            Contact.whatsapp_number.in_(wa_ids),
            Contact.opt_in_status == "opted_out",
        ).count()
        leads = db.query(Lead).filter(Lead.workspace_id == ws.id, Lead.phone.in_(wa_ids)).count()

    return {
        "recipients": recipients,
        "sent": recipients,
        "delivered": delivered,
        "read": read,
        "failed": failed,
        "clicked": clicked,
        "replies": replies,
        "reply_rate": round(replies / delivered * 100, 1) if delivered else 0.0,
        "read_rate": round(read / delivered * 100, 1) if delivered else 0.0,
        "unsubscribes": unsubscribes,
        "leads": leads,
        "estimated_cost_inr": round(delivered * MARKETING_RATE_INR, 2),
        "currency": "INR",
    }


@router.get("/campaigns/{campaign_id}/metrics")
def get_campaign_metrics(campaign_id: str, refresh: bool = False, ws: Workspace = Depends(get_current_workspace), db: Session = Depends(get_db)):
    """
    Return open/click metrics for all variants of a campaign.
    By default this serves cached metrics from DB to avoid exhausting API quota.
    Pass refresh=true to re-pull live engagement from the WhatsApp CRM.
    """
    campaign = _owned(db, campaign_id, ws)

    metrics = []
    tools = {t.name: t for t in get_campaign_tools(db)}
    get_report_tool = tools.get("get_report_api_v1_get_report_get")
    report_path = quota_key_for_endpoint("/api/v1/get_report")
    used_row = (
        db.query(ApiCallLog)
        .filter(ApiCallLog.endpoint == report_path, ApiCallLog.date_utc == date.today())
        .first()
    )
    report_calls_used = used_row.call_count if used_row else 0
    quota_exhausted = report_calls_used >= 100
    allow_live_fetch = bool(refresh and get_report_tool and not quota_exhausted)

    dirty = False

    for seg in campaign.segments:
        for variant in seg.variants:
            if not variant.external_campaign_id:
                continue

            total = variant.sent_count or 0
            open_count = variant.open_count or 0
            click_count = variant.click_count or 0
            source = "cached"

            try:
                if allow_live_fetch:
                    report = get_report_tool.invoke({
                        "query_params": {"campaign_id": variant.external_campaign_id},
                        "campaign_id_for_log": campaign_id,
                    })
                    rows = report.get("data", [])
                    open_count  = sum(1 for r in rows if r.get("EO") == "Y")
                    click_count = sum(1 for r in rows if r.get("EC") == "Y")
                    total = report.get("total_rows", len(rows))

                    # Persist refreshed values to DB once per request.
                    variant.sent_count  = total
                    variant.open_count  = open_count
                    variant.click_count = click_count
                    source = "live"
                    dirty = True
            except Exception as exc:
                logger.warning(
                    "Live metrics fetch failed for variant %s, serving cached values instead: %s",
                    variant.id,
                    exc,
                )

            metrics.append({
                "variant_id": variant.id,
                "external_campaign_id": variant.external_campaign_id,
                "segment_label": seg.label,
                "total_sent": total,
                "open_count": open_count,
                "click_count": click_count,
                "open_rate": round(open_count / total * 100, 2) if total else 0,
                "click_rate": round(click_count / total * 100, 2) if total else 0,
                "weighted_score": round(
                    (click_count / total * 100 * 0.70) + (open_count / total * 100 * 0.30), 2
                ) if total else 0,
                "source": source,
            })

    if dirty:
        db.commit()

    return {
        "campaign_id": campaign_id,
        "metrics": metrics,
        "refresh": refresh,
        "live_fetch_enabled": allow_live_fetch,
        "get_report_calls_used_today": report_calls_used,
        "get_report_daily_limit": 100,
    }
