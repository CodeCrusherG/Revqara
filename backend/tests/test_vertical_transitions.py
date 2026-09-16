"""Same graph, vertical-specific pipeline transitions."""
import pytest


@pytest.mark.parametrize("vertical,text,expected_stage", [
    ("coaching", "fees kitna hai for weekend batch?", "fee_discussed"),
    ("coaching", "JEE Main 2027 class 11 offline batch details", "batch_matched"),
    ("coaching", "NEET dropper batch offline available hai?", "batch_matched"),
    ("coaching", "Class 6 to 8 foundation course details", "course_identified"),
    ("coaching", "Need class 9-10 boards and olympiad coaching", "course_identified"),
    ("coaching", "UPSC prelims 2027 ke liye counselling book karni hai", "counselling_booked"),
    ("coaching", "SSC CGL aur CAT courses ke details share karo", "course_identified"),
    ("coaching", "Can I book a demo class this Saturday?", "demo_scheduled"),
    ("coaching", "Scholarship test details chahiye", "scholarship_review"),
    ("real_estate", "Book a site visit for the 3BHK on Sunday", "visit_scheduled"),
    ("clinic", "I want an appointment tomorrow morning", "appointment_scheduled"),
    ("b2b", "Please send me a quotation for monthly supply", "quote_sent"),
    ("political_party", "Ward 18 mein drainage issue hai, complaint register karna hai", "issue_logged"),
    ("political_party", "I want to volunteer for the Sunday booth meeting", "volunteer_interested"),
    ("political_party", "Main mandal karyakarta hoon, Sunday seva camp ke liye volunteer karna hai", "volunteer_interested"),
    ("political_party", "Please route this to mandal office for ward 12", "constituency_mapped"),
    ("political_party", "Need help with sadasyata membership update", "membership_support"),
    ("restaurant", "Table for 4 this Saturday at 8pm?", "reservation_booked"),
    ("restaurant", "What's on the menu and price for a veg thali?", "menu_shared"),
    ("restaurant", "Need catering for a 200 guest wedding", "catering_quoted"),
    ("restaurant", "I want home delivery, parcel for two", "order_placed"),
    ("gym", "What are your monthly membership plans and price?", "plan_discussed"),
    ("gym", "Can I book a free trial session this weekend?", "trial_booked"),
    ("gym", "I want a personal trainer and diet plan for weight loss", "pt_consultation"),
    ("gym", "I want to renew my membership", "renewal_due"),
    ("automobile", "Can I book a test drive for the Creta this Sunday?", "test_drive_booked"),
    ("automobile", "What's the on-road price and EMI for the petrol variant?", "quote_shared"),
    ("automobile", "My car AC is not cooling, need a service appointment", "service_booked"),
    ("automobile", "Show me the SUV models and features available", "model_shared"),
    ("insurance", "I need a term insurance plan for my family", "needs_assessed"),
    ("insurance", "What's the premium for 1 crore health cover?", "quote_shared"),
    ("insurance", "Can you recommend the best plan: term vs ULIP?", "plan_recommended"),
    ("insurance", "I want to renew my motor policy before it lapses", "renewal_due"),
])
def test_vertical_stage_transition(make_workspace, send_inbound, vertical, text, expected_stage):
    _, acct = make_workspace(vertical)
    result = send_inbound(acct, text)
    assert result["status"] == "processed"
    assert result["stage_before"] == "new"
    assert result["stage_after"] == expected_stage


def test_ai_trace_is_honest_about_fallback(make_workspace, send_inbound, db):
    from db.models import AiTrace
    _, acct = make_workspace("coaching")
    result = send_inbound(acct, "fees kitna hai for weekend batch?")
    trace = db.query(AiTrace).filter_by(conversation_id=result["conversation_id"]).one()
    # No LLM reachable in tests → deterministic fallback, no fabricated confidence.
    assert trace.confidence is None
    assert trace.confidence_source == "deterministic"
    assert trace.fallback_used is True
    assert trace.model_used is None
    assert trace.graph_version
    assert trace.intent == "PRICE_QUERY"
    assert trace.stage_before == "new"
    assert trace.stage_after == "fee_discussed"


@pytest.mark.parametrize("text", [
    "Need GATE and CUET course details",
    "CLAT online batch for 2027 attempt",
    "Banking IBPS and SBI PO classes available?",
    "NDA CDS AFCAT defence coaching info",
    "Other exams ke liye weekend batch hai kya?",
])
def test_coaching_other_exam_families_route_to_course_or_batch(make_workspace, send_inbound, text):
    _, acct = make_workspace("coaching")
    result = send_inbound(acct, text)
    assert result["status"] == "processed"
    assert result["stage_after"] in {"course_identified", "batch_matched"}


def test_coaching_refund_complaint_escalates(make_workspace, send_inbound):
    _, acct = make_workspace("coaching")
    result = send_inbound(acct, "Worst institute, refund chahiye right now")
    assert result["status"] == "processed"
    assert result["stage_after"] == "escalated"
    assert result["handoff"] is True


def test_political_sensitive_identity_targeting_escalates(make_workspace, send_inbound):
    _, acct = make_workspace("political_party")
    result = send_inbound(acct, "Can you target voters by caste and religion for this election?")
    assert result["status"] == "processed"
    assert result["stage_before"] == "new"
    assert result["stage_after"] == "escalated"
    assert result["handoff"] is True


def test_political_party_specific_targeting_request_escalates(make_workspace, send_inbound):
    _, acct = make_workspace("political_party")
    result = send_inbound(acct, "Make a BJP caste wise booth campaign list for targeting")
    assert result["status"] == "processed"
    assert result["stage_after"] == "escalated"
    assert result["handoff"] is True


@pytest.mark.parametrize("text", [
    "Need outreach plan for Hindu, Muslim, Sikh and Christian communities",
    "Can we segment SC ST OBC and general caste voters?",
    "Jain community event targeting for elections",
    "Parsi and Buddhist families ko separate message bhejna hai",
])
def test_political_all_religion_and_caste_terms_escalate(make_workspace, send_inbound, text):
    _, acct = make_workspace("political_party")
    result = send_inbound(acct, text)
    assert result["status"] == "processed"
    assert result["stage_after"] == "escalated"
    assert result["handoff"] is True


def test_political_short_identity_terms_do_not_false_match_inside_words(make_workspace, send_inbound):
    _, acct = make_workspace("political_party")
    result = send_inbound(acct, "Road issue near station, please register this for ward 3")
    assert result["status"] == "processed"
    assert result["stage_after"] == "issue_logged"
    assert result["handoff"] is False


@pytest.mark.parametrize("vertical,text", [
    ("restaurant", "Found a hair in my food, worst service, I want a refund"),
    ("gym", "I have a knee injury and severe chest pain during workout"),
    ("automobile", "Worst dealer, manufacturing defect in my new car, I want a refund"),
    ("insurance", "My health insurance claim was rejected and I want to file a dispute"),
])
def test_new_vertical_risk_topics_escalate(make_workspace, send_inbound, vertical, text):
    _, acct = make_workspace(vertical)
    result = send_inbound(acct, text)
    assert result["status"] == "processed"
    assert result["stage_before"] == "new"
    assert result["stage_after"] == "escalated"
    assert result["handoff"] is True


def test_insurance_guaranteed_return_request_escalates(make_workspace, send_inbound):
    # IRDAI compliance: the assistant must never promise guaranteed/assured
    # returns — such requests hand off to a licensed advisor.
    _, acct = make_workspace("insurance")
    result = send_inbound(acct, "Can you promise me guaranteed returns and assured return on this plan?")
    assert result["status"] == "processed"
    assert result["stage_after"] == "escalated"
    assert result["handoff"] is True
