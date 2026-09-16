"""
Agent 4: Optimizer

Reads the Analyst's performance report and generates a concrete
next_strategy JSON that instructs the Content Generator how to
improve variants in the next iteration of the optimization loop.
"""
import json
import logging
import os
from datetime import datetime

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import Session

from db.models import AgentLog, Campaign, CampaignStatus
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

OPTIMIZER_SYSTEM_PROMPT = """You are the Optimizer agent for a digital marketing AI system.

You receive the Performance Analyst's report showing open rates, click rates, and weaknesses
for each campaign variant. Your task: produce a concrete, actionable next_strategy for the
Content Generator to improve results in the next iteration.

Strategy guidelines:
- If Open Rate is LOW (<10%): focus on subject line improvement
  → Change tone (urgency/curiosity), shorten subject to 30-50 chars, add a power emoji at start.
- If Click Rate is LOW (<5%): focus on body + CTA
  → Move URL to first third of body, use stronger imperative CTA ("Tap now", "Claim today"),
    reduce body length below 300 chars.
- If both are low: suggest micro-segmentation (split the segment further by City or Income).
- If a segment is performing well: suggest scaling by targeting similar customers.
- Always identify the top-performing characteristics to preserve in the next iteration.

Output JSON only:
{
  "optimization_summary": "...",
  "iteration": <N>,
  "next_strategy": "...",
  "segment_adjustments": {
    "<segment_label>": {
      "subject_instructions": "...",
      "body_instructions": "...",
      "send_time_adjustment": "advance by X hours | keep"
    }
  },
  "segments_to_scale": ["<label>"],
  "segments_to_drop": ["<label>"]
}"""


def run_optimizer(state: CampaignState, db: Session) -> CampaignState:
    """LangGraph node: Optimizer."""
    campaign_id = state["campaign_id"]
    iteration   = state.get("iteration", 1)
    logger.info("[Optimizer] Starting for campaign %s, iteration %d", campaign_id, iteration)

    _update_campaign_status(db, campaign_id, CampaignStatus.optimizing)

    api_metrics  = state.get("api_metrics", {})
    brief        = state.get("brief", "")
    opt_history  = state.get("optimization_history", [])

    llm = _get_llm()
    messages = [
        SystemMessage(content=OPTIMIZER_SYSTEM_PROMPT),
        HumanMessage(content=(
            f"Campaign Brief: {brief}\n\n"
            f"Current iteration: {iteration}\n\n"
            f"Analyst report:\n{json.dumps(api_metrics, indent=2)}\n\n"
            f"Optimization history so far:\n{json.dumps(opt_history, indent=2)}\n\n"
            f"Return ONLY valid JSON."
        )),
    ]

    try:
        response = llm.invoke(messages)
        raw_content = _clean_json(response.content)
        llm_output: dict = json.loads(raw_content)
    except Exception as exc:
        logger.warning("[Optimizer] LLM unavailable/invalid (%s). Using minimal strategy.", exc)
        llm_output = {
            "optimization_summary": "Auto-analysis unavailable",
            "iteration": iteration,
            "next_strategy": "Improve subject lines and add stronger CTAs. Move URL earlier in body.",
        }
        raw_content = json.dumps(llm_output, ensure_ascii=False)

    next_strategy   = llm_output.get("next_strategy", "")
    opt_summary_row = {
        "iteration":            iteration,
        "summary":              llm_output.get("optimization_summary", ""),
        "next_strategy":        next_strategy,
        "segments_to_scale":    llm_output.get("segments_to_scale", []),
        "segments_to_drop":     llm_output.get("segments_to_drop", []),
    }

    # ── Persist checkpoint to Campaign row ───────────────────────────────────
    campaign_row = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if campaign_row:
        checkpoint = campaign_row.state_checkpoint or {}
        checkpoint["iteration"] = iteration + 1
        checkpoint["next_strategy"] = next_strategy
        checkpoint["optimization_history"] = opt_history + [opt_summary_row]
        campaign_row.state_checkpoint = checkpoint
        db.commit()

    # ── Log ───────────────────────────────────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="Optimizer",
        step=5,
        input_payload={"iteration": iteration},
        output_payload=llm_output,
        llm_reasoning=raw_content,
    )

    _update_campaign_status(db, campaign_id, CampaignStatus.generating)

    return {
        **state,
        "status":               "generating",
        "next_strategy":        next_strategy,
        "iteration":            iteration + 1,
        "optimization_history": opt_history + [opt_summary_row],
        "agent_logs": state.get("agent_logs", []) + [{
            "agent":   "Optimizer",
            "step":    5,
            "summary": llm_output.get("optimization_summary", ""),
        }],
    }


def _update_campaign_status(db: Session, campaign_id: str, status: CampaignStatus):
    db.query(Campaign).filter(Campaign.id == campaign_id).update(
        {"status": status, "updated_at": datetime.utcnow()}
    )
    db.commit()


def _write_agent_log(db, campaign_id, agent_name, step, input_payload, output_payload, llm_reasoning):
    log = AgentLog(
        campaign_id=campaign_id, agent_name=agent_name, step=step,
        input_payload=input_payload, output_payload=output_payload,
        llm_reasoning=llm_reasoning,
    )
    db.add(log)
    db.commit()


def _clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _get_llm():
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "glm4:latest"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=0.3,
        num_predict=4096,
    )
