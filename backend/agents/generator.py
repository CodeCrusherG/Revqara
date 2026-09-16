"""
Agent 2: Content Generator

Generates compliant email subject + body for each planned segment,
using the WhatsApp messaging content rules strictly.

Content rules (Section 6.4 + API schema):
  subject: text + emojis ONLY, max 200 chars, NO URL, NO HTML
  body:     text + emoji (UTF-8) + URL allowed, 1-5000 chars, NO HTML
  send_time: 'DD:MM:YY HH:MM:SS' IST, must be future
"""
import json
import logging
import re
from datetime import datetime, timezone, timedelta

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from db.models import Variant, Segment, AgentLog, Campaign, CampaignStatus
from ml.engagement_predictor import score_segment
from tools.llm_guardrails import build_ollama_llm, invoke_llm_json
from tools.time_utils import format_future_ist_time, normalize_send_time
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

GENERATOR_SYSTEM_PROMPT = """You are the Content Generator agent for a digital marketing AI system.

Create one email variant per input segment.

Rules:
- subject: text + emoji only, <= 200 chars, no URL, no HTML
- body: plain text with optional emoji and URL, <= 5000 chars, no HTML
- allowed URL: https://superbfsi.com/xdeposit/explore/
- send_time must be DD:MM:YY HH:MM:SS in future IST

Output JSON only:
{
    "variants": [
        {
            "target_segment_id": "<uuid>",
            "variant_type": "A",
            "subject": "...",
            "body": "...",
            "send_time": "15:03:26 12:00:00",
            "has_emoji": true,
            "has_url": true,
            "generation_rationale": "..."
        }
    ]
}
"""

def run_generator(state: CampaignState, db: Session) -> CampaignState:
    """LangGraph node: Content Generator."""
    campaign_id = state["campaign_id"]
    logger.info("[Generator] Starting for campaign %s (iteration %d)", campaign_id, state.get("iteration", 1))

    _update_campaign_status(db, campaign_id, CampaignStatus.generating)

    segments = state.get("segments", [])
    next_strategy = state.get("next_strategy", "")
    brief = state.get("brief", "")

    strategy_addendum = ""
    if next_strategy:
        strategy_addendum = f"\n\nOPTIMIZER FEEDBACK (you MUST follow these instructions):\n{next_strategy}"

    # Current IST time for send_time reference
    now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    now_str = now_ist.strftime("%d:%m:%y %H:%M:%S")

    # Strip customer_ids to avoid massive context for LLM
    clean_segments = [{k: v for k, v in s.items() if k != "customer_ids"} for s in segments]

    llm_used = True
    fallback_reason = ""
    try:
        llm = build_ollama_llm(temperature=0.7, num_predict=1800)
        llm_output, raw_content = invoke_llm_json(
            llm,
            messages=[
                SystemMessage(content=GENERATOR_SYSTEM_PROMPT),
                HumanMessage(content=(
                    f"Campaign brief: {brief}{strategy_addendum}\n\n"
                    f"Current IST time: {now_str}\n\n"
                    f"Segments:\n{json.dumps(clean_segments, indent=2)}"
                )),
            ],
            timeout_seconds=120,
        )
        if not isinstance(llm_output.get("variants"), list) or not llm_output.get("variants"):
            raise ValueError("Generator returned empty variants")
    except Exception as exc:
        llm_used = False
        fallback_reason = str(exc)
        llm_output = _build_deterministic_variants(clean_segments)
        raw_content = json.dumps({
            "fallback": "deterministic",
            "reason": fallback_reason,
            "output": llm_output,
        }, ensure_ascii=False)

    raw_variants = llm_output.get("variants", [])

    # ── Persist variants + run heuristic predictor ────────────────────────────
    # Clear old variants for this campaign
    for seg in db.query(Segment).filter(Segment.campaign_id == campaign_id).all():
        for v in seg.variants:
            db.delete(v)
    db.commit()

    variant_dicts = []
    customer_profiles = state.get("customer_profiles", [])

    for v_data in raw_variants:
        seg_id = v_data.get("target_segment_id")
        seg_row = db.query(Segment).filter(Segment.id == seg_id).first()
        if not seg_row:
            logger.warning("[Generator] Segment %s not found in DB — skipping", seg_id)
            continue

        subject = _enforce_subject_rules(v_data.get("subject", ""))
        body    = _enforce_body_rules(v_data.get("body", ""))

        variant = Variant(
            segment_id=seg_id,
            subject=subject,
            body=body,
            has_emoji=v_data.get("has_emoji", False),
            has_url=v_data.get("has_url", False),
            font_styles={"bold": True, "italic": False},
        )
        db.add(variant)
        db.flush()

        # Run heuristic predictor for this segment + variant
        seg_customer_ids = set(seg_row.customer_ids or [])
        seg_profiles = [p for p in customer_profiles if p.get("customer_id") in seg_customer_ids]

        send_time = normalize_send_time(v_data.get("send_time") or seg_row.send_time)
        prediction = score_segment(
            customer_profiles=seg_profiles or customer_profiles[:100],
            variant={"subject": subject, "body": body, "has_emoji": variant.has_emoji, "has_url": variant.has_url},
            send_time=send_time,
        )

        # Store prediction in Segment row
        seg_row.predicted_open_rate  = prediction["mean_open_rate"]
        seg_row.predicted_click_rate = prediction["mean_click_rate"]
        seg_row.send_time = send_time

        variant_dicts.append({
            "id":                variant.id,
            "target_segment_id": seg_id,
            "variant_type":      v_data.get("variant_type", "A"),
            "subject":           subject,
            "body":              body,
            "send_time":         send_time,
            "has_emoji":         variant.has_emoji,
            "has_url":           variant.has_url,
            "prediction":        prediction,
        })

    db.commit()

    # ── Log ───────────────────────────────────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="ContentGenerator",
        step=3,
        input_payload={"segment_count": len(segments), "iteration": state.get("iteration", 1)},
        output_payload={
            "variant_count": len(variant_dicts),
            "llm_used": llm_used,
            "fallback_reason": fallback_reason or None,
        },
        llm_reasoning=raw_content,
    )

    _update_campaign_status(db, campaign_id, CampaignStatus.pending_approval)

    return {
        **state,
        "status": "pending_approval",
        "variants": variant_dicts,
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "ContentGenerator",
            "step": 3,
            "summary": f"Generated {len(variant_dicts)} variants, scored with heuristic predictor",
        }],
    }


# ── Content rule enforcement ──────────────────────────────────────────────────

_URL_PATTERN = re.compile(r'https?://\S+')

def _enforce_subject_rules(subject: str) -> str:
    """Remove URLs from subject. Truncate to 200 chars."""
    subject = _URL_PATTERN.sub("", subject).strip()
    return subject[:200]


def _enforce_body_rules(body: str) -> str:
    """Remove HTML tags, truncate to 5000 chars."""
    body = re.sub(r'<[^>]+>', '', body).strip()
    return body[:5000]


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _build_deterministic_variants(segments: list[dict]) -> dict:
    """Generate one standards-compliant variant per segment without LLM calls."""
    variants = []
    fallback_send_time = format_future_ist_time(60)

    for idx, seg in enumerate(segments):
        label = str(seg.get("label") or f"Segment {idx + 1}")
        seg_id = seg.get("id")
        variant_type = seg.get("variant_type") or chr(ord("A") + idx)
        send_time = normalize_send_time(seg.get("send_time") or fallback_send_time)

        label_lower = label.lower()
        if "high-income" in label_lower or "high income" in label_lower:
            subject = "Premium Deposit Benefits Await You 💼"
            body = (
                "**Grow your wealth with confidence.** Unlock premium deposit benefits "
                "crafted for your goals. **Claim today** at "
                "https://superbfsi.com/xdeposit/explore/"
            )
        elif "existing" in label_lower:
            subject = "Exclusive Deposit Offer for You 🤝"
            body = (
                "**Thanks for banking with us.** Your personalised deposit offer is live. "
                "**Tap now** and activate it at "
                "https://superbfsi.com/xdeposit/explore/"
            )
        else:
            subject = "Start Saving Smarter Today 🚀"
            body = (
                "**Build your future faster.** Discover flexible deposit options and "
                "strong returns. **Explore now** at "
                "https://superbfsi.com/xdeposit/explore/"
            )

        variants.append({
            "target_segment_id": seg_id,
            "variant_type": variant_type,
            "subject": subject,
            "body": body,
            "send_time": send_time,
            "has_emoji": True,
            "has_url": True,
            "generation_rationale": f"Deterministic copy for {label}",
        })

    return {"variants": variants}
