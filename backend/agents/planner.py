"""
Agent 1: Campaign Planner

Uses the enriched CustomerProfile data in PostgreSQL to plan
2-3 A/B test segments with optimal send times and target audiences.
Does NOT re-call the external API (quota conservation).
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from db.models import Segment, Campaign, CampaignStatus, CustomerProfile
from tools.llm_guardrails import build_ollama_llm, invoke_llm_json
from tools.time_utils import format_future_ist_time, normalize_send_time
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

# IST = UTC+5:30
IST_OFFSET = timezone(timedelta(hours=5, minutes=30))
TIER1_CITIES = {
    "delhi", "mumbai", "bangalore", "bengaluru",
    "hyderabad", "chennai", "pune", "kolkata",
    "ahmedabad", "jaipur", "lucknow", "bhopal", "kochi", "indore",
}

CRITERIA_KEY_ALIASES = {
    "age": "age",
    "gender": "gender",
    "city": "city",
    "monthly_income": "monthly_income",
    "monthly income": "monthly_income",
    "credit_score": "credit_score",
    "credit score": "credit_score",
    "kyc_status": "kyc_status",
    "kyc status": "kyc_status",
    "app_installed": "app_installed",
    "app installed": "app_installed",
    "existing_customer": "existing_customer",
    "existing customer": "existing_customer",
    "social_media_active": "social_media_active",
    "social media active": "social_media_active",
    "occupation_type": "occupation_type",
    "occupation type": "occupation_type",
    "marital_status": "marital_status",
    "marital status": "marital_status",
    "family_size": "family_size",
    "family size": "family_size",
    "dependent_count": "dependent_count",
    "dependent count": "dependent_count",
    "kids_in_household": "kids_in_household",
    "kids in household": "kids_in_household",
}

PLANNER_SYSTEM_PROMPT = """You are the Campaign Planner agent for a digital marketing AI system.

Create 2-3 complementary campaign segments from the provided profile summary.

Rules:
- Each segment must include: label, variant_type, criteria, send_time, rationale.
- send_time format must be DD:MM:YY HH:MM:SS (IST) and in the future.
- criteria should use provided profile keys (age, city, monthly_income, existing_customer, etc).
- Do not include customer_ids in output.

Output JSON only:
{
    "strategy_rationale": "...",
    "segments": [
        {
            "label": "Segment A – ...",
            "variant_type": "A",
            "criteria": {"existing_customer": "Y"},
            "send_time": "15:03:26 12:00:00",
            "rationale": "..."
        }
    ]
}
"""

def run_planner(state: CampaignState, db: Session) -> CampaignState:
    """LangGraph node: Campaign Planner."""
    campaign_id = state["campaign_id"]
    logger.info("[Planner] Starting for campaign %s", campaign_id)

    _update_campaign_status(db, campaign_id, CampaignStatus.planning)

    # ── Load enriched profiles from DB (scoped to this campaign's workspace) ──
    _campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    _ws_id = _campaign.workspace_id if _campaign else None
    profile_rows = db.query(CustomerProfile).filter(CustomerProfile.workspace_id == _ws_id).all()
    profiles_summary = [
        {
            "customer_id":       r.customer_id,
            "age":               r.age,
            "gender":            r.gender,
            "city":              r.city,
            "monthly_income":    r.monthly_income,
            "credit_score":      r.credit_score,
            "kyc_status":        r.kyc_status,
            "app_installed":     r.app_installed,
            "existing_customer": r.existing_customer,
            "social_media_active": r.social_media_active,
            "occupation_type":   r.occupation_type,
            "segment_tag":       (r.segment_tags or {}).get("tag", "unclassified"),
        }
        for r in profile_rows
    ]

    segment_taxonomy = state.get("segment_taxonomy", {})
    brief = state.get("brief", "")
    rejection_feedback = ""

    # Inject rejection feedback if this is a re-plan
    campaign_row = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if campaign_row and campaign_row.rejection_feedback:
        rejection_feedback = f"\n\nHUMAN FEEDBACK (must be addressed): {campaign_row.rejection_feedback}"

    # Current IST time for send_time reference
    now_ist = datetime.now(IST_OFFSET)
    now_str  = now_ist.strftime("%d:%m:%y %H:%M:%S")

    compact_taxonomy = {
        k: {
            "description": v.get("description", ""),
            "count": v.get("count", 0),
        }
        for k, v in list((segment_taxonomy or {}).items())[:20]
    }
    compact_profiles = [
        {
            "customer_id": p["customer_id"],
            "age": p["age"],
            "city": p["city"],
            "monthly_income": p["monthly_income"],
            "existing_customer": p["existing_customer"],
            "social_media_active": p["social_media_active"],
            "occupation_type": p["occupation_type"],
            "segment_tag": p["segment_tag"],
        }
        for p in profiles_summary[:5]
    ]

    llm_used = True
    fallback_reason = ""
    try:
        llm = build_ollama_llm(temperature=0.3, num_predict=1600)
        llm_output, raw_content = invoke_llm_json(
            llm,
            messages=[
                SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                HumanMessage(content=(
                    f"Campaign brief: {brief}{rejection_feedback}\n\n"
                    f"Current IST time: {now_str}\n\n"
                    f"Segment taxonomy (compact):\n{json.dumps(compact_taxonomy, indent=2)}\n\n"
                    f"Total customers: {len(profiles_summary)}\n"
                    f"Sample profiles:\n{json.dumps(compact_profiles, indent=2)}"
                )),
            ],
            timeout_seconds=120,
        )
        if not isinstance(llm_output.get("segments"), list) or not llm_output.get("segments"):
            raise ValueError("Planner returned empty segments")
    except Exception as exc:
        llm_used = False
        fallback_reason = str(exc)
        llm_output = _build_deterministic_plan(brief=brief, now_str=now_str)
        raw_content = json.dumps({
            "fallback": "deterministic",
            "reason": fallback_reason,
            "output": llm_output,
        }, ensure_ascii=False)

    planned_segments = llm_output.get("segments", [])

    # ── 100% Coverage Logic (Python side) ─────────────────────────────────────
    assigned_ids = set()
    segment_dicts = []

    # Prepare segments in DB
    old_segments = db.query(Segment).filter(Segment.campaign_id == campaign_id).all()
    for osg in old_segments:
        db.delete(osg)
    db.commit()

    for idx, seg_data in enumerate(planned_segments):
        criteria = seg_data.get("criteria", {})
        
        # Apply filters
        seg_ids = []
        for p in profiles_summary:
            if p["customer_id"] in assigned_ids:
                continue

            if _profile_matches_criteria(p, criteria):
                seg_ids.append(p["customer_id"])
                assigned_ids.add(p["customer_id"])

        # Prevent empty non-final segments when criteria are too strict or noisy.
        if idx < len(planned_segments) - 1 and not seg_ids:
            remaining_ids = [p["customer_id"] for p in profiles_summary if p["customer_id"] not in assigned_ids]
            remaining_segments = max(1, (len(planned_segments) - idx))
            fallback_take = max(1, len(remaining_ids) // remaining_segments)
            fallback_ids = remaining_ids[:fallback_take]
            seg_ids.extend(fallback_ids)
            assigned_ids.update(fallback_ids)

        # If it's the LAST segment, grab any remaining customers to ensure 100% coverage
        if idx == len(planned_segments) - 1:
            for p in profiles_summary:
                if p["customer_id"] not in assigned_ids:
                    seg_ids.append(p["customer_id"])
                    assigned_ids.add(p["customer_id"])

        seg = Segment(
            campaign_id=campaign_id,
            label=seg_data.get("label", "Unnamed"),
            criteria=_sanitize_criteria(criteria),
            customer_ids=seg_ids,
            send_time=normalize_send_time(seg_data.get("send_time")),
        )
        db.add(seg)
        db.flush()

        segment_dicts.append({
            "id":           seg.id,
            "label":        seg.label,
            "variant_type": seg_data.get("variant_type", "A"),
            "criteria":     seg.criteria,
            "customer_ids": seg.customer_ids,
            "send_time":    seg.send_time,
            "rationale":    seg_data.get("rationale", ""),
        })

    db.commit()

    # ── Log ───────────────────────────────────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="CampaignPlanner",
        step=2,
        input_payload={"brief": brief, "total_profiles": len(profiles_summary)},
        output_payload={
            "strategy_rationale": llm_output.get("strategy_rationale", ""),
            "segment_count": len(segment_dicts),
            "llm_used": llm_used,
            "fallback_reason": fallback_reason or None,
        },
        llm_reasoning=raw_content,
    )

    _update_campaign_status(db, campaign_id, CampaignStatus.generating)

    return {
        **state,
        "status": "generating",
        "segments": segment_dicts,
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "CampaignPlanner",
            "step": 2,
            "summary": f"Planned {len(segment_dicts)} segments",
            "rationale": llm_output.get("strategy_rationale", ""),
        }],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sanitize_criteria(criteria: dict) -> dict:
    """Recursively replace Infinity/-Infinity with None for JSON compliance."""
    if not isinstance(criteria, dict):
        return criteria
    
    clean = {}
    for k, v in criteria.items():
        if isinstance(v, float) and (v == float('inf') or v == float('-inf')):
            clean[k] = None
        elif isinstance(v, list):
            clean[k] = [None if isinstance(x, float) and (x == float('inf') or x == float('-inf')) else x for x in v]
        elif isinstance(v, dict):
            clean[k] = _sanitize_criteria(v)
        else:
            clean[k] = v
    return clean


def _profile_matches_criteria(profile: dict, criteria: dict) -> bool:
    """Return True when a customer profile satisfies all planner criteria."""
    for key, criterion in criteria.items():
        normalized_key = _normalize_criteria_key(key)
        profile_value = profile.get(normalized_key)

        # Numeric range criteria, e.g. [200000, null]
        if isinstance(criterion, list) and len(criterion) == 2 and all(
            x is None or isinstance(x, (int, float)) for x in criterion
        ):
            if profile_value is None:
                return False
            low, high = criterion
            if low is not None and profile_value < low:
                return False
            if high is not None and profile_value > high:
                return False
            continue

        # Multi-value criteria, e.g. ["tier1_city", "mumbai"]
        if isinstance(criterion, list):
            if not any(_value_matches(normalized_key, profile_value, c) for c in criterion):
                return False
            continue

        if not _value_matches(normalized_key, profile_value, criterion):
            return False

    return True


def _value_matches(key: str, profile_value, criterion) -> bool:
    """Match one profile value to one criterion with lightweight normalization."""
    if profile_value is None:
        return False

    key_norm = str(key).strip().lower()
    profile_norm = str(profile_value).strip().lower()
    criterion_norm = str(criterion).strip().lower()

    profile_norm = _normalize_boolean_like(profile_norm)
    criterion_norm = _normalize_boolean_like(criterion_norm)

    if key_norm == "city" and criterion_norm in {
        "tier1_city", "tier-1", "tier1", "tier-1 city", "tier1 city", "tier-1 cities", "tier1 cities"
    }:
        return profile_norm in TIER1_CITIES

    if key_norm == "occupation_type" and criterion_norm in {"professional", "salaried", "young professionals", "young professional"}:
        return profile_norm in {"full-time", "full time", "professional", "salaried"}

    if key_norm == "city" and criterion_norm.replace("-", " ") in profile_norm:
        return True

    return profile_norm == criterion_norm


def _normalize_boolean_like(value: str) -> str:
    """Normalize yes/no style variants for matching."""
    v = value.strip().lower()
    if v in {"yes", "true", "1"}:
        return "y"
    if v in {"no", "false", "0"}:
        return "n"
    return v


def _normalize_criteria_key(key: str) -> str:
    """Map planner criteria keys to normalized profile keys."""
    raw = str(key).strip().lower().replace("_", " ")
    return CRITERIA_KEY_ALIASES.get(raw, raw.replace(" ", "_"))


def _update_campaign_status(db: Session, campaign_id: str, status: CampaignStatus):
    db.query(Campaign).filter(Campaign.id == campaign_id).update(
        {"status": status, "updated_at": datetime.utcnow()}
    )
    db.commit()


def _write_agent_log(db, campaign_id, agent_name, step, input_payload, output_payload, llm_reasoning):
    from db.models import AgentLog
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


def _build_deterministic_plan(brief: str, now_str: str) -> dict:
    """Generate a stable 3-segment plan without relying on an external LLM."""
    return {
        "strategy_rationale": (
            "Deterministic fallback strategy balancing young Tier-1 prospects, "
            "high-income digital users, and existing customers."
        ),
        "segments": [
            {
                "label": "Segment A – Young Tier-1 Professionals",
                "variant_type": "A",
                "criteria": {
                    "age": [20, 35],
                    "city": ["tier1_city"],
                    "occupation_type": "professional",
                },
                "send_time": normalize_send_time(format_future_ist_time(45)),
                "rationale": "Acquire young professionals in Tier-1 cities with energetic messaging.",
            },
            {
                "label": "Segment B – High-Income Digital Customers",
                "variant_type": "B",
                "criteria": {
                    "monthly_income": [200000, None],
                    "social_media_active": "Y",
                },
                "send_time": normalize_send_time(format_future_ist_time(90)),
                "rationale": "Target affluent digitally active users with premium value framing.",
            },
            {
                "label": "Segment C – Existing Customers",
                "variant_type": "C",
                "criteria": {
                    "existing_customer": "Y",
                },
                "send_time": normalize_send_time(format_future_ist_time(135)),
                "rationale": "Retain and upsell known customers with trust-based communication.",
            },
        ],
        "metadata": {"brief": brief, "generated_at_ist": now_str},
    }
