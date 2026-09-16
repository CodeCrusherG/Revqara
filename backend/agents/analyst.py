"""
Agent 3: Performance Analyst

Fetches WhatsApp read/click engagement via the get_report tool (backed by the
webhook-driven WhatsApp CRM), computes a weighted performance score, identifies
winner variants, and produces a structured analysis report.

EO (message read) and EC (CTA clicked) are STRING flags 'Y'|'N' — NOT booleans.
"""
import json
import logging
import os
from datetime import datetime, date

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from sqlalchemy.orm import Session

from db.models import Variant, Segment, AgentLog, Campaign, CampaignStatus, ApiCallLog
from tools.campaign_api_tools import get_campaign_tools
from tools.openapi_tool_factory import quota_key_for_endpoint
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

ANALYST_SYSTEM_PROMPT = """You are the Performance Analyst agent for a digital marketing AI system.

You will receive campaign performance data (open/click metrics per variant).
Your tasks:
1. Identify the winning variant per segment (highest weighted score: click*0.70 + open*0.30).
2. List specific weaknesses of each variant (e.g. "low click rate despite good open rate").
3. Produce actionable recommendations for the Optimizer agent.

Output JSON only:
{
  "analysis_summary": "...",
  "segment_results": {
    "<segment_id>": {
      "winner_variant_id": "...",
      "open_rate": 0.0,
      "click_rate": 0.0,
      "weighted_score": 0.0,
      "weaknesses": ["...", "..."],
      "recommendations": ["...", "..."]
    }
  }
}"""


def run_analyst(state: CampaignState, db: Session) -> CampaignState:
    """LangGraph node: Performance Analyst."""
    campaign_id = state["campaign_id"]
    logger.info("[Analyst] Starting for campaign %s", campaign_id)

    _update_campaign_status(db, campaign_id, CampaignStatus.monitoring)

    tools_map = {t.name: t for t in get_campaign_tools(db)}
    report_tool = tools_map.get("get_report_api_v1_get_report_get")
    report_path = quota_key_for_endpoint("/api/v1/get_report")
    report_log = (
        db.query(ApiCallLog)
        .filter(ApiCallLog.endpoint == report_path, ApiCallLog.date_utc == date.today())
        .first()
    )
    report_calls_used = report_log.call_count if report_log else 0
    can_fetch_live_reports = bool(report_tool and report_calls_used < 100)

    # ── Fetch metrics for all variants ────────────────────────────────────────
    metrics_by_segment: dict[str, dict] = {}

    for seg in db.query(Segment).filter(Segment.campaign_id == campaign_id).all():
        for variant in seg.variants:
            if not variant.external_campaign_id:
                logger.info("[Analyst] Variant %s has no external_campaign_id — skipping", variant.id)
                continue

            total = variant.sent_count or 0
            open_count = variant.open_count or 0
            click_count = variant.click_count or 0
            data_source = "cached"

            try:
                if can_fetch_live_reports:
                    report = report_tool.invoke({
                        "body": None,
                        "query_params": {"campaign_id": variant.external_campaign_id},
                        "campaign_id_for_log": campaign_id,
                    })
                    rows = report.get("data", [])
                    total = report.get("total_rows", len(rows))

                    # EO and EC are STRING flags 'Y'|'N'
                    open_count = sum(1 for r in rows if r.get("EO") == "Y")
                    click_count = sum(1 for r in rows if r.get("EC") == "Y")

                    # Persist to Variant row
                    variant.sent_count = total
                    variant.open_count = open_count
                    variant.click_count = click_count
                    db.commit()
                    data_source = "live"

                open_rate = round(open_count / total, 4) if total else 0.0
                click_rate = round(click_count / total, 4) if total else 0.0
                weighted = round(click_rate * 0.70 + open_rate * 0.30, 4)

                seg_key = str(seg.id)
                if seg_key not in metrics_by_segment:
                    metrics_by_segment[seg_key] = {
                        "segment_label": seg.label,
                        "variants": [],
                    }

                metrics_by_segment[seg_key]["variants"].append({
                    "variant_id":          str(variant.id),
                    "external_campaign_id": variant.external_campaign_id,
                    "total_sent":          total,
                    "open_count":          open_count,
                    "click_count":         click_count,
                    "open_rate":           open_rate,
                    "click_rate":          click_rate,
                    "weighted_score":      weighted,
                    "subject_preview":     (variant.subject or "")[:80],
                    "source":              data_source,
                })

            except Exception as exc:
                if "Rate limit reached" in str(exc):
                    can_fetch_live_reports = False
                logger.warning("[Analyst] Falling back to cached metrics for variant %s: %s", variant.id, exc)

                open_rate = round(open_count / total, 4) if total else 0.0
                click_rate = round(click_count / total, 4) if total else 0.0
                weighted = round(click_rate * 0.70 + open_rate * 0.30, 4)

                seg_key = str(seg.id)
                if seg_key not in metrics_by_segment:
                    metrics_by_segment[seg_key] = {
                        "segment_label": seg.label,
                        "variants": [],
                    }

                metrics_by_segment[seg_key]["variants"].append({
                    "variant_id": str(variant.id),
                    "external_campaign_id": variant.external_campaign_id,
                    "total_sent": total,
                    "open_count": open_count,
                    "click_count": click_count,
                    "open_rate": open_rate,
                    "click_rate": click_rate,
                    "weighted_score": weighted,
                    "subject_preview": (variant.subject or "")[:80],
                    "source": "cached",
                })

    # ── LLM analysis ──────────────────────────────────────────────────────────
    llm = _get_llm()
    messages = [
        SystemMessage(content=ANALYST_SYSTEM_PROMPT),
        HumanMessage(content=(
            f"Campaign: {campaign_id}\n"
            f"Brief: {state.get('brief', '')}\n\n"
            f"Performance metrics:\n{json.dumps(metrics_by_segment, indent=2)}\n\n"
            f"Return ONLY valid JSON."
        )),
    ]

    try:
        response = llm.invoke(messages)
        raw_content = _clean_json(response.content)
        llm_output: dict = json.loads(raw_content)
    except Exception as exc:
        # LLM unreachable or returned invalid JSON — fall back to rule-based
        # analysis so the optimisation loop never stalls.
        logger.warning("[Analyst] LLM unavailable/invalid (%s) — using fallback analysis", exc)
        llm_output = _build_fallback_analysis(metrics_by_segment)
        raw_content = json.dumps(llm_output, ensure_ascii=False)

    # ── Log ───────────────────────────────────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="PerformanceAnalyst",
        step=4,
        input_payload={"segment_count": len(metrics_by_segment)},
        output_payload=llm_output,
        llm_reasoning=raw_content,
    )

    _update_campaign_status(db, campaign_id, CampaignStatus.optimizing)

    return {
        **state,
        "status": "optimizing",
        "api_metrics": {**metrics_by_segment, "analysis": llm_output},
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "PerformanceAnalyst",
            "step": 4,
            "summary": f"Analysed {len(metrics_by_segment)} segments",
            "summary_text": llm_output.get("analysis_summary", ""),
        }],
    }


def _build_fallback_analysis(metrics: dict) -> dict:
    """Simple rule-based fallback if LLM fails."""
    results = {}
    for seg_id, seg_data in metrics.items():
        best = max(seg_data["variants"], key=lambda v: v["weighted_score"], default=None)
        if best:
            results[seg_id] = {
                "winner_variant_id": best["variant_id"],
                "open_rate":         best["open_rate"],
                "click_rate":        best["click_rate"],
                "weighted_score":    best["weighted_score"],
                "weaknesses":        ["Automated analysis unavailable"],
                "recommendations":   ["Review manually"],
            }
    return {"analysis_summary": "Fallback analysis", "segment_results": results}


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
        temperature=0.1,
        num_predict=4096,
    )
