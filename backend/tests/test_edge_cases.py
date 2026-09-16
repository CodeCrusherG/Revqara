"""Graph edge cases: unknown vertical, empty/unsupported messages, guards."""
from ai_graph.packs import get_pack
from ai_graph.guards import can_ai_update_stage, is_opt_out, is_meaningful_text
from db.models import InboxMessage, MessageOutbox


def test_unknown_vertical_falls_back_to_custom():
    assert get_pack("nonsense_vertical")["vertical"] == "custom"
    assert get_pack(None)["vertical"] == "custom"
    assert get_pack("")["vertical"] == "custom"


def test_unknown_vertical_workspace_does_not_crash(make_workspace, send_inbound):
    _, acct = make_workspace("nonsense_vertical")
    result = send_inbound(acct, "hello, what are your prices?")
    assert result["status"] == "processed"  # custom pack handled it


def test_empty_message_asks_for_clarification(make_workspace, send_inbound, db):
    _, acct = make_workspace("salon")
    result = send_inbound(acct, "   ")  # whitespace only
    assert result["status"] == "unsupported_message"
    # A clarification reply was enqueued, but no lead/intent guesswork.
    assert db.query(MessageOutbox).filter_by(conversation_id=result["conversation_id"]).count() == 1


def test_media_only_message_is_handled(make_workspace, send_inbound):
    _, acct = make_workspace("salon")
    result = send_inbound(acct, None)  # media with no text
    assert result["status"] == "unsupported_message"


# ── Transition guard (pure unit) ──────────────────────────────────────────────

def test_guard_blocks_human_owned():
    pack = get_pack("coaching")
    assert can_ai_update_stage("new", "fee_discussed", pack, human_owned=True, intent="PRICE_QUERY") is False


def test_guard_blocks_terminal_state():
    pack = get_pack("coaching")
    assert can_ai_update_stage("enrolled", "fee_discussed", pack, human_owned=False, intent="PRICE_QUERY") is False


def test_guard_blocks_resolved_public_office_case():
    pack = get_pack("political_party")
    assert can_ai_update_stage("resolved", "follow_up", pack, human_owned=False, intent="NEW_LEAD") is False


def test_guard_blocks_regression():
    pack = get_pack("coaching")
    # fee_discussed (idx 5) -> course_identified (idx 1) is a regression.
    assert can_ai_update_stage("fee_discussed", "course_identified", pack, human_owned=False, intent="NEW_LEAD") is False


def test_guard_allows_forward_move():
    pack = get_pack("coaching")
    assert can_ai_update_stage("new", "fee_discussed", pack, human_owned=False, intent="PRICE_QUERY") is True


def test_guard_revives_lost_only_on_new_intent():
    pack = get_pack("coaching")
    assert can_ai_update_stage("lost", "fee_discussed", pack, human_owned=False, intent="PRICE_QUERY") is True
    assert can_ai_update_stage("lost", "fee_discussed", pack, human_owned=False, intent="UNKNOWN") is False


def test_opt_out_detection():
    assert is_opt_out("STOP") is True
    assert is_opt_out("unsubscribe please") is True
    assert is_opt_out("don't message me again") is True
    assert is_opt_out("cancel") is True
    # "cancel my booking" is a CANCEL intent, NOT an opt-out.
    assert is_opt_out("cancel my booking for tomorrow") is False
    assert is_opt_out("what are your prices?") is False


def test_meaningful_text():
    assert is_meaningful_text("hi") is True
    assert is_meaningful_text("   ") is False
    assert is_meaningful_text(None) is False
