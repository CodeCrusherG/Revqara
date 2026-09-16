"""
Subscription plans + usage metering / enforcement.

Plans are defined in code; a workspace stores only its current plan name. Usage
(contacts, sends/day) is metered live from the database and enforced on contact
import and on campaign sends.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from db.models import Campaign, Contact, WhatsAppMessage

PLANS = {
    "free": {
        "name": "Free",
        "price_usd": 0,
        "max_contacts": 500,
        "max_sends_per_day": 200,
        "max_lists": 5,
        "max_numbers": 1,
        "features": ["1 WhatsApp number", "500 contacts", "200 WhatsApp sends/day", "AI campaign generation"],
    },
    "pro": {
        "name": "Pro",
        "price_usd": 49,
        "max_contacts": 100_000,
        "max_sends_per_day": 50_000,
        "max_lists": 1_000,
        "max_numbers": 10,
        "features": ["10 WhatsApp numbers", "100k contacts", "50k WhatsApp sends/day", "Unlimited lists"],
    },
}

DEFAULT_PLAN = "free"


def plan_def(plan_name: str | None) -> dict:
    return PLANS.get(plan_name or DEFAULT_PLAN, PLANS[DEFAULT_PLAN])


def contact_count(db: Session, workspace_id: str) -> int:
    return db.query(Contact).filter(Contact.workspace_id == workspace_id).count()


def sends_today(db: Session, workspace_id: str) -> int:
    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    # WhatsAppMessage.campaign_id is a string column; collect this workspace's
    # campaign ids (as strings) and match by IN to avoid a uuid=varchar join.
    campaign_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.workspace_id == workspace_id).all()]
    if not campaign_ids:
        return 0
    return (
        db.query(WhatsAppMessage)
        .filter(WhatsAppMessage.campaign_id.in_(campaign_ids), WhatsAppMessage.created_at >= start)
        .count()
    )


def usage(db: Session, workspace) -> dict:
    p = plan_def(workspace.plan)
    contacts = contact_count(db, workspace.id)
    sent = sends_today(db, workspace.id)
    return {
        "plan": workspace.plan,
        "plan_name": p["name"],
        "contacts": {"used": contacts, "limit": p["max_contacts"]},
        "sends_today": {"used": sent, "limit": p["max_sends_per_day"]},
    }


def remaining_contact_slots(db: Session, workspace) -> int:
    p = plan_def(workspace.plan)
    return max(0, p["max_contacts"] - contact_count(db, workspace.id))


def remaining_sends_today(db: Session, workspace) -> int:
    p = plan_def(workspace.plan)
    return max(0, p["max_sends_per_day"] - sends_today(db, workspace.id))
