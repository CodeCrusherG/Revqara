"""
Campaign tool set — WhatsApp CRM edition (multi-tenant).

Provides ``get_campaign_tools(db)`` returning the same three LangChain ``@tool``
objects the agents have always consumed — identical names, invoke signature, and
response shapes — backed by local components:

  - ``get_customer_cohort``  → the workspace's real contacts (optionally filtered
                               to a target list); falls back to a synthetic cohort
                               only when no workspace is supplied.
  - ``send_campaign``        → broadcasts via the ``pywa`` client (offline
                               simulator), to each contact's real WhatsApp number,
                               capped by the workspace's remaining daily send quota.
  - ``get_report``           → per-recipient EO/EC from webhook-updated rows.
"""
from __future__ import annotations

import logging
import os
import uuid

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from db.models import (
    Campaign, Contact, ContactListMember, CustomerProfile, Template,
    WhatsAppAccount, WhatsAppMessage, Workspace,
)
from plans import remaining_sends_today
from tools.openapi_tool_factory import (
    _check_and_increment_quota,
    _write_agent_log,
    quota_key_for_endpoint,
)
from tools.whatsapp_crm import generate_cohort, whatsapp_number
from tools.whatsapp_client import get_whatsapp_client, WA_CTA_TITLE

logger = logging.getLogger(__name__)

WA_MAX_RECIPIENTS = int(os.environ.get("WA_MAX_RECIPIENTS", "40"))

_COHORT_PATH = "/api/v1/get_customer_cohort"
_SEND_PATH   = "/api/v1/send_campaign"
_REPORT_PATH = "/api/v1/get_report"


def _contact_to_cohort(c: Contact) -> dict:
    """Map a Contact row to the cohort dict shape the agents expect."""
    return {
        "customer_id": c.id,
        "Full_name": c.full_name,
        "email": c.email,
        "WhatsApp_Number": c.whatsapp_number,
        "Age": c.age,
        "Gender": c.gender,
        "City": c.city,
        "Occupation type": c.occupation_type,
        "Monthly_Income": c.monthly_income,
        "Credit score": c.credit_score,
        "KYC status": c.kyc_status,
        "App_Installed": c.app_installed,
        "Existing Customer": c.existing_customer,
        "Social_Media_Active": c.social_media_active,
        **(c.attributes or {}),
    }


def _load_contacts(db: Session, workspace_id: str, target_list_id: str | None) -> list[dict]:
    """Load a workspace's contacts (optionally filtered to a target list)."""
    # Compliance: never include opted-out contacts in a campaign audience.
    query = db.query(Contact).filter(
        Contact.workspace_id == workspace_id,
        Contact.opt_in_status != "opted_out",
    )
    if target_list_id:
        query = query.join(ContactListMember, ContactListMember.contact_id == Contact.id).filter(
            ContactListMember.list_id == target_list_id
        )
    return [_contact_to_cohort(c) for c in query.all()]


def _profile_for(db: Session, customer_id: str):
    return db.query(CustomerProfile).filter(CustomerProfile.customer_id == customer_id).first()


def _render_template(body: str, name: str | None) -> str:
    """Substitute WhatsApp template variables ({{1}} = first name)."""
    first = (name or "there").split()[0]
    return (body or "").replace("{{1}}", first).replace("{{name}}", first)


def get_campaign_tools(db: Session) -> list:
    """Build the three campaign tools bound to this DB session."""

    @tool
    def get_customer_cohort_api_v1_get_customer_cohort_get(
        body: dict | None = None,
        query_params: dict | None = None,
        campaign_id_for_log: str | None = None,
    ) -> dict:
        """Fetch the audience for a campaign.

        query_params may include {"workspace_id", "target_list_id"}. Returns
        {"data": [...customer records...], "total_count": int}.
        """
        _check_and_increment_quota(db, quota_key_for_endpoint(_COHORT_PATH))
        qp = query_params or {}
        ws_id = qp.get("workspace_id")
        target_list_id = qp.get("target_list_id")
        if ws_id:
            customers = _load_contacts(db, ws_id, target_list_id)
            source = "workspace_contacts"
        else:
            customers = generate_cohort()
            source = "synthetic_demo"
        result = {"data": customers, "total_count": len(customers)}
        _write_agent_log(
            db=db, campaign_id=campaign_id_for_log, agent_name="WhatsAppCRM",
            operation_id="get_customer_cohort",
            input_payload={"source": source, "target_list_id": target_list_id},
            output_payload={"total_count": len(customers)},
        )
        return result

    @tool
    def send_campaign_api_v1_send_campaign_post(
        body: dict | None = None,
        query_params: dict | None = None,
        campaign_id_for_log: str | None = None,
    ) -> dict:
        """Broadcast a WhatsApp campaign message to a list of customers.

        body: {"body": str, "list_customer_ids": [str], "send_time": str, "subject": str?}
        Returns {"campaign_id": <broadcast uuid>, "messages_sent": int}.
        """
        _check_and_increment_quota(db, quota_key_for_endpoint(_SEND_PATH))
        body = body or {}
        message_body = str(body.get("body", "")).strip()
        subject = str(body.get("subject", "")).strip()

        # Cap recipients by the workspace's remaining daily send quota, and
        # resolve the tenant's own WhatsApp number to send from.
        cap = WA_MAX_RECIPIENTS
        sender_pnid = None
        campaign = (
            db.query(Campaign).filter(Campaign.id == campaign_id_for_log).first()
            if campaign_id_for_log else None
        )
        if campaign and campaign.workspace_id:
            ws = db.query(Workspace).filter(Workspace.id == campaign.workspace_id).first()
            if ws:
                cap = min(cap, remaining_sends_today(db, ws))
            acct = (
                db.query(WhatsAppAccount)
                .filter(WhatsAppAccount.workspace_id == campaign.workspace_id, WhatsAppAccount.status == "connected")
                .order_by(WhatsAppAccount.created_at.asc())
                .first()
            )
            if acct:
                sender_pnid = acct.phone_number_id

        # If the campaign uses an approved template, send the rendered template
        # instead of free-text (WhatsApp requires templates for business-initiated
        # messages). Otherwise fall back to the AI-generated copy.
        template_body = None
        if campaign and campaign.template_id:
            tmpl = db.query(Template).filter(Template.id == campaign.template_id).first()
            if tmpl and tmpl.status == "approved":
                template_body = tmpl.body

        customer_ids = list(body.get("list_customer_ids", []) or [])[:max(0, cap)]
        default_text = f"*{subject}*\n\n{message_body}" if subject else message_body or "Hello from Nudge"

        broadcast_id = uuid.uuid4().hex
        wa = get_whatsapp_client()
        from pywa.types import Button

        sent = 0
        for cid in customer_ids:
            profile = _profile_for(db, cid)
            number = (profile.whatsapp_number if profile else None) or whatsapp_number(cid)
            text = _render_template(template_body, profile.full_name if profile else None) if template_body else default_text
            tracker = f"{broadcast_id}:{cid}"
            try:
                msg = wa.send_message(
                    to=number,
                    text=text,
                    buttons=[Button(title=WA_CTA_TITLE, callback_data=tracker)],
                    tracker=tracker,
                    sender=sender_pnid,   # send from the tenant's own number (None → default)
                )
                wamid = msg.id
            except Exception as exc:  # pragma: no cover
                logger.warning("[send_campaign] send failed for %s: %s", cid, exc)
                wamid = None
            db.add(WhatsAppMessage(
                broadcast_id=broadcast_id,
                campaign_id=campaign_id_for_log,
                customer_id=cid,
                wa_id=number,
                wamid=wamid,
                tracker=tracker,
                status="sent",
            ))
            sent += 1
        db.commit()

        _write_agent_log(
            db=db, campaign_id=campaign_id_for_log, agent_name="WhatsAppCRM",
            operation_id="send_campaign",
            input_payload={"recipients": sent, "subject": subject[:80]},
            output_payload={"campaign_id": broadcast_id, "messages_sent": sent},
        )
        return {"campaign_id": broadcast_id, "messages_sent": sent}

    @tool
    def get_report_api_v1_get_report_get(
        body: dict | None = None,
        query_params: dict | None = None,
        campaign_id_for_log: str | None = None,
    ) -> dict:
        """Fetch the engagement report for a broadcast.

        query_params: {"campaign_id": <broadcast uuid>}
        Returns {"data": [{"customer_id", "EO", "EC"}], "total_rows": int}.
        """
        _check_and_increment_quota(db, quota_key_for_endpoint(_REPORT_PATH))
        broadcast_id = (query_params or {}).get("campaign_id")
        rows = (
            db.query(WhatsAppMessage)
            .filter(WhatsAppMessage.broadcast_id == broadcast_id)
            .all()
        )
        data = [
            {
                "customer_id": r.customer_id,
                "EO": "Y" if r.status == "read" else "N",
                "EC": "Y" if r.clicked else "N",
            }
            for r in rows
        ]
        _write_agent_log(
            db=db, campaign_id=campaign_id_for_log, agent_name="WhatsAppCRM",
            operation_id="get_report",
            input_payload={"campaign_id": broadcast_id},
            output_payload={"total_rows": len(data),
                            "read": sum(1 for d in data if d["EO"] == "Y"),
                            "clicked": sum(1 for d in data if d["EC"] == "Y")},
        )
        return {"data": data, "total_rows": len(data)}

    return [
        get_customer_cohort_api_v1_get_customer_cohort_get,
        send_campaign_api_v1_send_campaign_post,
        get_report_api_v1_get_report_get,
    ]
