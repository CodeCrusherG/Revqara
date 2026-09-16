"""
LangGraph workflow for Nudge.

Graph topology:
  START
    → profiler        (fetch & enrich cohort)
    → planner         (A/B segment strategy)
    → generator       (content creation + heuristic prediction)
    → [HITL PAUSE]    (persist state, wait for human approval/rejection)
    → execute_campaign (call /api/v1/send_campaign for each variant)
    → analyst         (fetch EO/EC metrics from /api/v1/get_report)
    → optimizer       (produce next_strategy)
    → generator       (loop: regenerate with optimizer feedback)

Rejection path:
  reject_handler → planner  (re-plan with human feedback in state)
"""
import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Literal

from langgraph.graph import StateGraph, END, START
from sqlalchemy.orm import Session

import time

from db.database import SessionLocal
from db.models import Campaign, CampaignStatus, Segment, Variant, WhatsAppMessage
from workflows.state import CampaignState
from agents.profiler  import run_profiler
from agents.planner   import run_planner
from agents.generator import run_generator
from agents.analyst   import run_analyst
from agents.optimizer import run_optimizer
from tools.campaign_api_tools import get_campaign_tools
from tools.time_utils import normalize_send_time

logger = logging.getLogger(__name__)

IST_OFFSET = timezone(timedelta(hours=5, minutes=30))

# Maximum optimization loop iterations
MAX_ITERATIONS = 3

# How long to wait for the simulator's engagement webhooks (read/click) to land
# before the Analyst reads the report, and a buffer for clicks (which fire after
# reads). Tunable via env for faster/slower demos.
WA_SETTLE_TIMEOUT = float(os.environ.get("WA_SETTLE_TIMEOUT", "8"))
WA_CLICK_BUFFER   = float(os.environ.get("WA_CLICK_BUFFER", "1.2"))


def _wait_for_engagement(campaign_id: str, timeout: float = WA_SETTLE_TIMEOUT) -> None:
    """
    Poll until every message for this campaign has left the initial 'sent' state
    (delivered/read/failed), then wait a short buffer for late click events.

    Webhook handlers commit from their own sessions, so each poll uses a fresh
    session to observe the latest committed state.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = SessionLocal()
        try:
            total = s.query(WhatsAppMessage).filter(WhatsAppMessage.campaign_id == campaign_id).count()
            pending = (
                s.query(WhatsAppMessage)
                .filter(WhatsAppMessage.campaign_id == campaign_id, WhatsAppMessage.status == "sent")
                .count()
            )
        finally:
            s.close()
        if total > 0 and pending == 0:
            break
        time.sleep(0.3)
    time.sleep(WA_CLICK_BUFFER)


# ── Node wrappers (inject DB session) ────────────────────────────────────────

def _profiler_node(state: CampaignState) -> CampaignState:
    db = SessionLocal()
    try:
        return run_profiler(state, db)
    finally:
        db.close()


def _planner_node(state: CampaignState) -> CampaignState:
    db = SessionLocal()
    try:
        return run_planner(state, db)
    finally:
        db.close()


def _generator_node(state: CampaignState) -> CampaignState:
    db = SessionLocal()
    try:
        return run_generator(state, db)
    finally:
        db.close()


def _execute_campaign_node(state: CampaignState) -> CampaignState:
    """
    Calls /api/v1/send_campaign for every variant in the approved campaign.
    Stores the returned campaign_id UUID in Variant.external_campaign_id.
    """
    db = SessionLocal()
    try:
        campaign_id = state["campaign_id"]
        logger.info("[Execute] Sending campaign %s", campaign_id)

        tools_map = {t.name: t for t in get_campaign_tools(db)}
        send_tool = tools_map.get("send_campaign_api_v1_send_campaign_post")

        if not send_tool:
            raise RuntimeError("send_campaign tool not found in campaign tool set")

        _update_status(db, campaign_id, CampaignStatus.executing)

        for seg in db.query(Segment).filter(Segment.campaign_id == campaign_id).all():
            seg.send_time = normalize_send_time(seg.send_time)
            for variant in seg.variants:
                if not seg.customer_ids:
                    logger.warning("[Execute] Segment %s missing customer_ids — skipping", seg.id)
                    continue

                payload = {
                    "body":             variant.body,
                    "list_customer_ids": seg.customer_ids[:5000],  # API cap
                    "send_time":        seg.send_time,
                }
                if variant.subject:
                    payload["subject"] = variant.subject[:200]

                try:
                    result = send_tool.invoke({
                        "body":                payload,
                        "query_params":        None,
                        "campaign_id_for_log": campaign_id,
                    })
                    ext_id = result.get("campaign_id")
                    if ext_id:
                        variant.external_campaign_id = ext_id
                        variant.sent_count = result.get("messages_sent", len(seg.customer_ids))
                        db.commit()
                        logger.info("[Execute] Sent to segment %s → external_id %s", seg.label, ext_id)
                except Exception as exc:
                    logger.error("[Execute] Failed for segment %s: %s", seg.label, exc)

            db.commit()

        # Give the simulator's webhooks time to record read/click engagement
        # before the Analyst pulls the report.
        _wait_for_engagement(campaign_id)

        _update_status(db, campaign_id, CampaignStatus.monitoring)
        return {**state, "status": "monitoring"}
    finally:
        db.close()


def _analyst_node(state: CampaignState) -> CampaignState:
    db = SessionLocal()
    try:
        return run_analyst(state, db)
    finally:
        db.close()


def _optimizer_node(state: CampaignState) -> CampaignState:
    db = SessionLocal()
    try:
        return run_optimizer(state, db)
    finally:
        db.close()


def _reject_handler_node(state: CampaignState) -> CampaignState:
    """
    Called when human rejects the campaign.
    Injects feedback into brief and routes back to planner.
    """
    db = SessionLocal()
    try:
        campaign_id = state["campaign_id"]
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        feedback = campaign.rejection_feedback if campaign else ""

        updated_brief = state["brief"]
        if feedback:
            updated_brief += f"\n\n[HUMAN FEEDBACK — must address]: {feedback}"

        _update_status(db, campaign_id, CampaignStatus.planning)
        return {**state, "status": "planning", "brief": updated_brief}
    finally:
        db.close()


# ── Routing functions ─────────────────────────────────────────────────────────

def _dispatcher_router(state: CampaignState) -> Literal["profiler", "execute_campaign", "reject_handler", "analyst"]:
    """Route from START based on campaign status."""
    status = state.get("status")
    if status == CampaignStatus.approved:
        return "execute_campaign"
    if status == CampaignStatus.rejected:
        return "reject_handler"
    if status in {CampaignStatus.monitoring, CampaignStatus.optimizing}:
        return "analyst"
    return "profiler"

def _after_generator_router(state: CampaignState) -> Literal["hitl_pause", "generator"]:
    """After generator: pause for human review."""
    return "hitl_pause"


def _after_approval_router(state: CampaignState) -> Literal["execute_campaign", "reject_handler", "__end__"]:
    """After HITL: check if approved or rejected."""
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == state["campaign_id"]).first()
        if not campaign:
            return END
            
        if campaign.status == CampaignStatus.approved:
            return "execute_campaign"
        if campaign.status == CampaignStatus.rejected:
            return "reject_handler"
            
        return END
    finally:
        db.close()


def _after_optimizer_router(state: CampaignState) -> Literal["generator", END]:
    """After optimizer: loop back to generator or stop if max iterations reached."""
    if state.get("iteration", 1) > MAX_ITERATIONS:
        logger.info("[Graph] Max iterations (%d) reached — completing campaign", MAX_ITERATIONS)
        db = SessionLocal()
        try:
            _update_status(db, state["campaign_id"], CampaignStatus.completed)
        finally:
            db.close()
        return END
    return "generator"


# ── HITL pause node ───────────────────────────────────────────────────────────

def _hitl_pause_node(state: CampaignState) -> CampaignState:
    """
    Persist current graph state to PostgreSQL and halt.
    The /approve or /reject endpoint resumes execution.
    """
    db = SessionLocal()
    try:
        campaign_id = state["campaign_id"]

        # Serialise state for cold-start resume (Docker restarts, etc.)
        serializable_state = {k: v for k, v in state.items()
                              if k not in {"customer_profiles"}}  # too large
        db.query(Campaign).filter(Campaign.id == campaign_id).update({
            "status":           CampaignStatus.pending_approval,
            "state_checkpoint": serializable_state,
            "updated_at":       datetime.utcnow(),
        })
        db.commit()
        logger.info("[Graph] Campaign %s paused for HITL review", campaign_id)
        return {**state, "status": "pending_approval"}
    finally:
        db.close()


def _dispatcher_node(state: CampaignState) -> CampaignState:
    """Entry point that decides where to start."""
    return state

# ── Graph builder ─────────────────────────────────────────────────────────────

def build_campaign_graph() -> StateGraph:
    """Build and compile the full LangGraph campaign workflow."""
    graph = StateGraph(CampaignState)

    graph.add_node("dispatcher",        _dispatcher_node)
    graph.add_node("profiler",          _profiler_node)
    graph.add_node("planner",           _planner_node)
    graph.add_node("generator",         _generator_node)
    graph.add_node("hitl_pause",        _hitl_pause_node)
    graph.add_node("execute_campaign",  _execute_campaign_node)
    graph.add_node("analyst",           _analyst_node)
    graph.add_node("optimizer",         _optimizer_node)
    graph.add_node("reject_handler",    _reject_handler_node)

    # Edges: START → dispatcher → profiler/execute/reject
    graph.add_edge(START, "dispatcher")
    graph.add_conditional_edges(
        "dispatcher",
        _dispatcher_router,
        {
            "profiler": "profiler",
            "execute_campaign": "execute_campaign",
            "reject_handler": "reject_handler",
            "analyst": "analyst"
        }
    )
    graph.add_edge("profiler",   "planner")
    graph.add_edge("planner",    "generator")
    graph.add_edge("generator",  "hitl_pause")

    # HITL pause: check approval/rejection status
    graph.add_conditional_edges(
        "hitl_pause",
        _after_approval_router,
        {
            "execute_campaign": "execute_campaign",
            "reject_handler": "reject_handler",
            END: END
        },
    )

    graph.add_edge("reject_handler", "planner")

    # Post-execution: analyst → optimizer → (loop or end)
    graph.add_edge("execute_campaign", "analyst")
    graph.add_edge("analyst",          "optimizer")
    graph.add_conditional_edges(
        "optimizer",
        _after_optimizer_router,
        {"generator": "generator", END: END},
    )

    # Rejection path: reject_handler → planner
    graph.add_edge("reject_handler", "planner")

    return graph.compile()


# ── Public API ────────────────────────────────────────────────────────────────

def run_campaign_workflow(campaign_id: str, brief: str) -> None:
    """
    Entry point for the FastAPI BackgroundTask.
    Runs the full graph until it hits the HITL pause node.
    """
    graph = build_campaign_graph()
    initial_state: CampaignState = {
        "campaign_id":         campaign_id,
        "brief":               brief,
        "status":              "profiling",
        "customer_profiles":   [],
        "segment_taxonomy":    {},
        "segments":            [],
        "variants":            [],
        "ml_predictions":      {},
        "api_metrics":         {},
        "next_strategy":       "",
        "optimization_history": [],
        "agent_logs":          [],
        "iteration":           1,
    }
    try:
        graph.invoke(initial_state)
    except Exception as exc:
        logger.error("[Graph] Campaign %s failed: %s", campaign_id, exc)
        db = SessionLocal()
        try:
            db.query(Campaign).filter(Campaign.id == campaign_id).update(
                {"status": CampaignStatus.rejected, "rejection_feedback": str(exc)}
            )
            db.commit()
        finally:
            db.close()
        raise


def resume_campaign_workflow(campaign_id: str) -> None:
    """Resume graph execution based on DB status."""
    graph = build_campaign_graph()
    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")
        
        checkpoint = campaign.state_checkpoint or {}
        checkpoint["campaign_id"] = campaign_id
        checkpoint["status"] = campaign.status  # Ensure status is passed to dispatcher
    finally:
        db.close()

    try:
        graph.invoke(checkpoint)
    except Exception as exc:
        logger.error("[Graph] Resume failed for campaign %s: %s", campaign_id, exc)
        raise


def _update_status(db: Session, campaign_id: str, status: CampaignStatus):
    db.query(Campaign).filter(Campaign.id == campaign_id).update(
        {"status": status, "updated_at": datetime.utcnow()}
    )
    db.commit()
