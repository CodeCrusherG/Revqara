"""Opt-out marks the contact and removes them from campaign audiences."""
from db.models import Contact
from tools.campaign_api_tools import _load_contacts


def test_optout_blocks_future_campaign_sends(make_workspace, send_inbound, db):
    ws, acct = make_workspace("ecommerce")

    # Contact opts in via a normal message, then opts out.
    send_inbound(acct, "Price of the wireless earbuds?", wa_id="919111000001")
    before = _load_contacts(db, ws.id, None)
    assert any(c["WhatsApp_Number"] == "919111000001" for c in before)

    result = send_inbound(acct, "STOP", wa_id="919111000001")
    assert result["status"] == "opted_out"

    contact = db.query(Contact).filter_by(workspace_id=ws.id, whatsapp_number="919111000001").one()
    assert contact.opt_in_status == "opted_out"

    # Campaign audience builder must now exclude this contact.
    after = _load_contacts(db, ws.id, None)
    assert not any(c["WhatsApp_Number"] == "919111000001" for c in after)
