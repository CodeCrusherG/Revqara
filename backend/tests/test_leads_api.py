"""Lead status validation is vertical-aware: invalid stage -> 400."""
import pytest
from fastapi import HTTPException

from api.leads import update_lead, LeadStatusIn
from db.models import Lead


def _make_lead(db, ws):
    lead = Lead(workspace_id=ws.id, name="X", phone="91900", intent="price_query",
                source="bot", status="new")
    db.add(lead)
    db.flush()
    return lead


def test_invalid_stage_returns_400(make_workspace, db):
    ws, _ = make_workspace("coaching")
    lead = _make_lead(db, ws)
    with pytest.raises(HTTPException) as exc:
        update_lead(lead.id, LeadStatusIn(status="not_a_stage"), ws=ws, db=db)
    assert exc.value.status_code == 400


def test_valid_vertical_stage_accepted(make_workspace, db):
    ws, _ = make_workspace("coaching")
    lead = _make_lead(db, ws)
    out = update_lead(lead.id, LeadStatusIn(status="fee_discussed"), ws=ws, db=db)
    assert out["status"] == "fee_discussed"


def test_generic_status_still_accepted(make_workspace, db):
    ws, _ = make_workspace("coaching")
    lead = _make_lead(db, ws)
    out = update_lead(lead.id, LeadStatusIn(status="lost"), ws=ws, db=db)
    assert out["status"] == "lost"
