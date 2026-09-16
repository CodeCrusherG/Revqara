"""Tenant isolation — the scariest SaaS bug. No cross-workspace leakage."""
from db.models import AiTrace, Contact, Conversation, Lead
from tools.campaign_api_tools import _load_contacts


def test_no_cross_workspace_leakage(make_workspace, send_inbound, db):
    wsA, acctA = make_workspace("coaching")
    wsB, acctB = make_workspace("real_estate")

    rA = send_inbound(acctA, "fees kitna hai for weekend batch?", wa_id="918000000001", event_id="ev-a")
    rB = send_inbound(acctB, "Book a site visit for the 3BHK", wa_id="918000000002", event_id="ev-b")

    # Each workspace behaved according to its own vertical pack.
    assert rA["stage_after"] == "fee_discussed"
    assert rB["stage_after"] == "visit_scheduled"

    # Leads are disjoint and correctly scoped.
    leads_a = db.query(Lead).filter_by(workspace_id=wsA.id).all()
    leads_b = db.query(Lead).filter_by(workspace_id=wsB.id).all()
    assert leads_a and leads_b
    assert all(l.workspace_id == wsA.id for l in leads_a)
    assert {l.id for l in leads_a}.isdisjoint({l.id for l in leads_b})

    # Conversations + contacts + traces never cross tenants.
    assert all(c.workspace_id == wsA.id for c in db.query(Conversation).filter_by(workspace_id=wsA.id).all())
    assert all(t.workspace_id == wsA.id for t in db.query(AiTrace).filter_by(workspace_id=wsA.id).all())

    contacts_a = {c["WhatsApp_Number"] for c in _load_contacts(db, wsA.id, None)}
    contacts_b = {c["WhatsApp_Number"] for c in _load_contacts(db, wsB.id, None)}
    assert "918000000001" in contacts_a and "918000000001" not in contacts_b
    assert "918000000002" in contacts_b and "918000000002" not in contacts_a

    # B's contact must not be visible when scoping to A.
    assert db.query(Contact).filter_by(workspace_id=wsA.id, whatsapp_number="918000000002").first() is None
