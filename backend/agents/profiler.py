"""
Agent 0: Customer Profiler

Fetches the 1,000-customer cohort from the WhatsApp CRM contact book,
enriches each record with LLM-assigned segment tags, and persists to
the `customer_profiles` PostgreSQL table (upsert on customer_id).

Cohort fields:
  customer_id, Full_name, email, Age, Gender, Marital_Status, Family_Size,
  Dependent count, Occupation, Occupation type, Monthly_Income, KYC status,
  City, Kids_in_Household, App_Installed, Existing Customer,
  Credit score, Social_Media_Active
"""
import json
import logging
from datetime import datetime

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from db.models import CustomerProfile, AgentLog, Campaign, CampaignStatus
from tools.campaign_api_tools import get_campaign_tools
from tools.llm_guardrails import build_ollama_llm, invoke_llm_json
from workflows.state import CampaignState

logger = logging.getLogger(__name__)

PROFILER_SYSTEM_PROMPT = """You are the Customer Profiler agent for a digital marketing AI system.

Given customer records and a campaign brief:
1. Identify useful customer fields.
2. Assign segment tags for customer_ids shown.
3. Provide a compact segment taxonomy with count and sample IDs.

Output JSON only:
{
    "available_fields": ["field1", "field2"],
    "segment_taxonomy": {
        "tag_name": {"description": "...", "count": 10, "sample_customer_ids": ["CUST0001"]}
    },
    "customer_tags": {"CUST0001": "tag_name"}
}
"""


def run_profiler(state: CampaignState, db: Session) -> CampaignState:
    """
    LangGraph node: Customer Profiler.
    Fetches cohort, enriches with LLM segment tags, persists to DB.
    """
    campaign_id = state["campaign_id"]
    logger.info("[Profiler] Starting for campaign %s", campaign_id)

    _update_campaign_status(db, campaign_id, CampaignStatus.profiling)

    # ── 1. Fetch the workspace's targeted contacts from the WhatsApp CRM ──────
    campaign_row = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    workspace_id = campaign_row.workspace_id if campaign_row else None
    target_list_id = campaign_row.target_list_id if campaign_row else None

    tools_map = {t.name: t for t in get_campaign_tools(db)}
    cohort_tool = tools_map.get("get_customer_cohort_api_v1_get_customer_cohort_get")

    if cohort_tool is None:
        raise RuntimeError("Cohort tool not found in campaign tool set")

    cohort_response = cohort_tool.invoke({
        "body": None,
        "query_params": {"workspace_id": workspace_id, "target_list_id": target_list_id},
        "campaign_id_for_log": campaign_id,
    })

    customers: list[dict] = cohort_response.get("data", [])
    total_count = cohort_response.get("total_count", len(customers))
    logger.info("[Profiler] Fetched %d customer records (total_count=%d)", len(customers), total_count)

    # ── 2. LLM-first profiling with deterministic fallback ────────────────────
    sample = customers[:6]
    compact_sample = [
        {
            "customer_id": c.get("customer_id"),
            "Age": c.get("Age"),
            "City": c.get("City"),
            "Monthly_Income": c.get("Monthly_Income"),
            "KYC status": c.get("KYC status"),
            "App_Installed": c.get("App_Installed"),
            "Existing Customer": c.get("Existing Customer"),
            "Social_Media_Active": c.get("Social_Media_Active"),
            "Occupation type": c.get("Occupation type"),
        }
        for c in sample
    ]
    default_fields, default_tags, default_taxonomy = _derive_tags_and_taxonomy(customers)

    llm_used = True
    fallback_reason = ""
    try:
        llm = build_ollama_llm(temperature=0.2, num_predict=1200)
        llm_output, raw_content = invoke_llm_json(
            llm,
            messages=[
                SystemMessage(content=PROFILER_SYSTEM_PROMPT),
                HumanMessage(content=(
                    f"Campaign brief: {state.get('brief', '')}\n\n"
                    f"Records sample ({len(compact_sample)} rows):\n{json.dumps(compact_sample, indent=2)}"
                )),
            ],
            timeout_seconds=90,
        )
        available_fields = llm_output.get("available_fields") if isinstance(llm_output.get("available_fields"), list) else default_fields
        llm_tags = llm_output.get("customer_tags") if isinstance(llm_output.get("customer_tags"), dict) else {}
        customer_tags = {**default_tags, **{k: v for k, v in llm_tags.items() if k in default_tags and isinstance(v, str) and v.strip()}}
        segment_taxonomy = llm_output.get("segment_taxonomy") if isinstance(llm_output.get("segment_taxonomy"), dict) else default_taxonomy
    except Exception as exc:
        llm_used = False
        fallback_reason = str(exc)
        available_fields, customer_tags, segment_taxonomy = default_fields, default_tags, default_taxonomy
        raw_content = json.dumps({
            "fallback": "deterministic",
            "reason": fallback_reason,
            "available_fields": available_fields,
            "segment_taxonomy": segment_taxonomy,
            "customer_tags_preview": dict(list(customer_tags.items())[:30]),
        }, ensure_ascii=False)

    # ── 3. Refresh this workspace's materialised profiles ─────────────────────
    db.query(CustomerProfile).filter(CustomerProfile.workspace_id == workspace_id).delete()
    db.commit()
    _upsert_customers(db, customers, customer_tags, workspace_id)

    # ── 4. Log LLM reasoning to AgentLog ─────────────────────────────────────
    _write_agent_log(
        db=db,
        campaign_id=campaign_id,
        agent_name="CustomerProfiler",
        step=1,
        input_payload={"total_customers": len(customers), "sample_size": len(sample)},
        output_payload={
            "available_fields": available_fields,
            "segment_count": len(segment_taxonomy),
            "taxonomy": segment_taxonomy,
            "llm_used": llm_used,
            "fallback_reason": fallback_reason or None,
        },
        llm_reasoning=raw_content,
    )

    # ── 5. Advance state ──────────────────────────────────────────────────────
    _update_campaign_status(db, campaign_id, CampaignStatus.planning)

    # Load enriched profiles from DB for downstream agents
    enriched = [
        {
            "customer_id": r.customer_id,
            "email": r.email,
            "full_name": r.full_name,
            "age": r.age,
            "gender": r.gender,
            "city": r.city,
            "monthly_income": r.monthly_income,
            "credit_score": r.credit_score,
            "kyc_status": r.kyc_status,
            "app_installed": r.app_installed,
            "existing_customer": r.existing_customer,
            "social_media_active": r.social_media_active,
            "occupation": r.occupation,
            "occupation_type": r.occupation_type,
            "marital_status": r.marital_status,
            "family_size": r.family_size,
            "segment_tags": r.segment_tags,
        }
        for r in db.query(CustomerProfile).filter(CustomerProfile.workspace_id == workspace_id).all()
    ]

    return {
        **state,
        "status": "planning",
        "customer_profiles": enriched,
        "segment_taxonomy": segment_taxonomy,
        "agent_logs": state.get("agent_logs", []) + [{
            "agent": "CustomerProfiler",
            "step": 1,
            "summary": f"Fetched {len(customers)} customers, assigned {len(segment_taxonomy)} segment tags",
        }],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _upsert_customers(db: Session, customers: list[dict], customer_tags: dict[str, str], workspace_id: str | None = None):
    """Upsert customer records — safe to re-run (idempotent)."""
    for record in customers:
        cid = record.get("customer_id")
        if not cid:
            continue
        existing = db.query(CustomerProfile).filter(CustomerProfile.customer_id == cid).first()
        if existing is None:
            existing = CustomerProfile(customer_id=cid)
            db.add(existing)

        existing.workspace_id       = workspace_id
        existing.whatsapp_number    = record.get("WhatsApp_Number")
        existing.email              = record.get("email")
        existing.full_name          = record.get("Full_name")
        existing.age                = _safe_int(record.get("Age"))
        existing.gender             = record.get("Gender")
        existing.marital_status     = record.get("Marital_Status")
        existing.family_size        = _safe_int(record.get("Family_Size"))
        existing.dependent_count    = _safe_int(record.get("Dependent count"))
        existing.kids_in_household  = _safe_int(record.get("Kids_in_Household"))
        existing.city               = record.get("City")
        existing.occupation         = record.get("Occupation")
        existing.occupation_type    = record.get("Occupation type")
        existing.monthly_income     = _safe_int(record.get("Monthly_Income"))
        existing.credit_score       = _safe_int(record.get("Credit score"))
        existing.kyc_status         = record.get("KYC status")
        existing.app_installed      = record.get("App_Installed")
        existing.existing_customer  = record.get("Existing Customer")
        existing.social_media_active= record.get("Social_Media_Active")
        existing.raw_data           = record
        existing.segment_tags       = {"tag": customer_tags.get(cid, "unclassified")}

    db.commit()


def _safe_int(val) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _update_campaign_status(db: Session, campaign_id: str, status: CampaignStatus):
    db.query(Campaign).filter(Campaign.id == campaign_id).update(
        {"status": status, "updated_at": datetime.utcnow()}
    )
    db.commit()


def _write_agent_log(db, campaign_id, agent_name, step, input_payload, output_payload, llm_reasoning):
    log = AgentLog(
        campaign_id=campaign_id,
        agent_name=agent_name,
        step=step,
        input_payload=input_payload,
        output_payload=output_payload,
        llm_reasoning=llm_reasoning,
    )
    db.add(log)
    db.commit()


def _derive_tags_and_taxonomy(customers: list[dict]) -> tuple[list[str], dict[str, str], dict]:
    """Build stable customer tags and taxonomy using cohort fields only."""
    fields = sorted({k for c in customers for k in c.keys()})
    tags_by_customer: dict[str, str] = {}
    taxonomy_buckets: dict[str, list[str]] = {}

    for c in customers:
        cid = c.get("customer_id")
        if not cid:
            continue

        age = _safe_int(c.get("Age"))
        income = _safe_int(c.get("Monthly_Income"))
        city = str(c.get("City") or "").strip().lower()
        app = str(c.get("App_Installed") or "N").strip().upper()
        social = str(c.get("Social_Media_Active") or "N").strip().upper()
        existing = str(c.get("Existing Customer") or "N").strip().upper()
        kyc = str(c.get("KYC status") or "N").strip().upper()

        parts: list[str] = []
        if age is not None and age <= 35:
            parts.append("young")
        elif age is not None and age >= 55:
            parts.append("senior")

        if income is not None and income >= 200000:
            parts.append("high_income")
        elif income is not None and income <= 60000:
            parts.append("low_income")

        if city in {"delhi", "mumbai", "bangalore", "bengaluru", "hyderabad", "chennai", "pune", "kolkata"}:
            parts.append("tier1")

        if app == "Y":
            parts.append("app_user")
        if social == "Y":
            parts.append("social_active")
        if existing == "Y":
            parts.append("existing")
        if kyc == "Y":
            parts.append("kyc")

        tag_parts = parts[:5] if parts else ["unclassified"]
        tag = "_".join(tag_parts)
        tags_by_customer[cid] = tag
        taxonomy_buckets.setdefault(tag, []).append(cid)

    taxonomy = {
        tag: {
            "description": tag.replace("_", " "),
            "count": len(customer_ids),
            "sample_customer_ids": customer_ids[:7],
        }
        for tag, customer_ids in taxonomy_buckets.items()
    }

    return fields, tags_by_customer, taxonomy
