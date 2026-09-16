"""
Vertical packs — industry-specific behavior as config, not code.

The universal AI graph (graph.py) stays the same for every tenant; the vertical
pack swaps lead fields, pipeline stages, intents, qualification questions,
response templates, tools, compliance rules, and analytics. A workspace picks a
vertical and instantly gets an industry-tuned WhatsApp CRM.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Universal intents the classifier always understands.
UNIVERSAL_INTENTS = [
    "NEW_LEAD", "FOLLOW_UP_REPLY", "PRICE_QUERY", "BOOKING_QUERY", "SUPPORT_QUERY",
    "COMPLAINT", "PAYMENT_QUERY", "RESCHEDULE", "CANCEL", "NOT_INTERESTED",
    "OPT_OUT", "HUMAN_REQUEST", "UNKNOWN",
]

# Universal pipeline; packs may override with their own stages.
UNIVERSAL_PIPELINE = ["new", "qualified", "contacted", "interested", "follow_up", "negotiation", "converted", "lost"]


def _pack(**kw) -> dict:
    base = {
        "vertical": "custom",
        "label": "Custom business",
        "lead_fields": ["name", "interest", "budget", "urgency", "location", "preferred_time"],
        "pipeline_stages": UNIVERSAL_PIPELINE,
        "intents": [],
        "qualification_questions": [
            "What are you looking for today?",
            "When would you like to get started?",
        ],
        "templates": {
            "greeting": "Hi! 👋 How can we help you today?",
            "price_reply": "Happy to share pricing — could you tell me a bit more about what you need?",
            "follow_up": "Hi, just checking in — are you still interested? Happy to help.",
            "lost_lead": "No problem at all. We're here whenever you need us. 🙏",
            "booking_confirmation": "Great — that's confirmed. We'll see you then!",
            "handoff": "Thanks! Connecting you with a team member who'll reply here shortly. 🙏",
        },
        "tools": ["crm", "scheduling"],
        "rules": {
            "require_human_for": ["refund", "legal", "complaint", "angry"],
            "forbidden_claims": [],
            "compliance_notes": [],
        },
        "stage_hints": {},
        "keyword_stage_hints": {},
        "analytics": {"conversion_event": "converted", "important_metrics": ["qualified", "converted"]},
    }
    base.update(kw)
    return base


VERTICAL_PACKS: dict[str, dict] = {
    "custom": _pack(),

    "coaching": _pack(
        vertical="coaching", label="Coaching institute",
        lead_fields=[
            "student_name", "phone", "parent_name", "parent_contact",
            "exam_target", "exam_family", "class_level", "class_band", "stream",
            "board", "school_name", "attempt_year", "dropper_status",
            "preferred_batch", "preferred_mode", "center_location", "budget",
            "scholarship_interest", "last_score", "counsellor_owner",
            "follow_up_date",
        ],
        pipeline_stages=[
            "new", "course_identified", "batch_matched", "demo_scheduled",
            "counselling_booked", "fee_discussed", "scholarship_review",
            "document_pending", "follow_up", "enrolled", "escalated", "lost",
        ],
        intents=[
            "course_query", "fees_query", "batch_timing", "demo_request",
            "admission_query", "exam_query", "foundation_query",
            "dropper_query", "scholarship_query", "result_query",
            "parent_counselling", "refund_or_complaint",
        ],
        qualification_questions=[
            "Which exam or class band are you preparing for: JEE, NEET, classes 6-8, 9-10, 11-12, dropper, UPSC, SSC, CAT, or another exam?",
            "Are you looking for online, offline, hybrid, weekday, weekend, or residential batches?",
            "Which attempt year or school board should we plan around?",
        ],
        templates={
            "greeting": "Hi! 👋 Which course are you looking for: JEE, NEET, classes 6-8, 9-10, 11-12, dropper, UPSC, SSC, CAT, or another exam?",
            "price_reply": "Fees depend on the exam, class band, mode, and batch type. Please share the target exam/class and preferred batch so I can route you to the exact fee plan.",
            "follow_up": "Hi! Are you still interested in the upcoming batch? I can help match the right course and arrange counselling.",
            "lost_lead": "No worries — I'll share updates when a new batch starts. 🙏",
            "booking_confirmation": "Your demo/counselling request is noted. The admissions team will confirm the batch details here. ✏️",
            "handoff": "Let me connect you with an admissions counsellor so they can handle this carefully and share verified details.",
        },
        tools=[
            "course_catalog", "exam_course_mapper", "batch_slots",
            "demo_booking", "counselling_booking", "fee_plan",
            "scholarship_test", "lead_scoring", "parent_follow_up",
        ],
        rules={
            "require_human_for": [
                "refund", "scholarship", "discount", "negotiation", "angry",
                "rank guarantee", "guaranteed selection", "fake result",
                "medical", "mental health", "stress", "depression", "suicide",
            ],
            "forbidden_claims": [
                "guaranteed selection", "guaranteed rank", "fake results",
                "unverified topper claims", "certain admission or government job",
            ],
            "compliance_notes": [
                "Avoid misleading rank/result claims; verified outcomes only.",
                "Do not pressure students or parents with fear-based language.",
                "Escalate scholarship, refund, discount, mental-health, and complaint topics to a human.",
            ],
        },
        coaching_catalog={
            "school_foundation": [
                "class_6", "class_7", "class_8", "class_9", "class_10",
                "foundation", "olympiad", "ntse", "boards",
            ],
            "science_competitive": [
                "jee", "jee main", "jee advanced", "neet", "neet ug",
                "class_11", "class_12", "dropper", "repeater", "integrated",
            ],
            "civil_services": [
                "upsc", "ias", "ips", "ifs", "pcs", "state pcs",
                "prelims", "mains", "interview",
            ],
            "government_jobs": [
                "ssc", "ssc cgl", "ssc chsl", "ssc mts", "ssc gd",
                "banking", "ibps", "sbi po", "rrb", "railway", "defence",
                "nda", "cds", "afcat",
            ],
            "mba_and_other_exams": [
                "cat", "xat", "snap", "nmat", "cmat", "cuet", "clat",
                "gate", "ca", "cs", "cma", "ielts", "toefl", "sat",
                "other exams",
            ],
        },
        stage_hints={
            "NEW_LEAD": ["course"],
            "SUPPORT_QUERY": ["course"],
            "BOOKING_QUERY": ["demo", "counselling"],
            "PRICE_QUERY": ["fee"],
            "PAYMENT_QUERY": ["fee"],
            "COMPLAINT": ["escalated"],
            "HUMAN_REQUEST": ["counselling", "escalated"],
            "NOT_INTERESTED": ["lost"],
        },
        keyword_stage_hints={
            "escalated": [
                "refund", "angry", "worst", "fake result", "rank guarantee",
                "guaranteed selection", "depression", "suicide",
            ],
            "scholarship_review": ["scholarship", "discount", "concession", "test scholarship"],
            "document_pending": ["documents", "document", "aadhaar", "marksheet", "photo"],
            "demo_scheduled": ["demo", "trial class", "free class", "sample class"],
            "counselling_booked": [
                "counselling", "counseling", "counsellor", "counselor",
                "parent counselling", "parent counseling", "call me",
            ],
            "fee_discussed": ["fees", "fee", "price", "cost", "kitna", "installment", "emi"],
            "batch_matched": [
                "drop", "dropper", "repeater", "repeat", "11th", "12th",
                "class 11", "class 12", "online", "offline", "hybrid",
                "weekend", "weekday", "residential", "morning batch",
                "evening batch",
            ],
            "course_identified": [
                "jee", "jee main", "jee mains", "jee advanced", "neet",
                "neet ug", "class 6", "class 7", "class 8", "class 9",
                "class 10", "6th", "7th", "8th", "9th", "10th",
                "foundation", "olympiad", "ntse", "boards", "upsc", "ias",
                "pcs", "state pcs", "ssc", "ssc cgl", "ssc chsl", "ssc mts",
                "ssc gd", "cat", "mba", "xat", "snap", "nmat", "cmat",
                "cuet", "clat", "gate", "ca", "cs", "cma", "nda", "cds",
                "afcat", "banking", "ibps", "sbi po", "rrb", "railway",
                "ielts", "toefl", "sat", "other exams",
            ],
        },
        analytics={
            "conversion_event": "enrolled",
            "important_metrics": [
                "course_identified", "batch_matched", "demo_scheduled",
                "counselling_booked", "fee_discussed", "scholarship_review",
                "enrolled", "escalated",
            ],
            "buyer_kpis": [
                "course-wise enquiries", "demo bookings", "counselling bookings",
                "fee-discussion rate", "scholarship-review backlog",
                "dropper lead volume", "parent follow-up backlog",
                "enrolments by exam family",
            ],
        },
    ),

    "clinic": _pack(
        vertical="clinic", label="Clinic / Healthcare",
        lead_fields=["patient_name", "service_needed", "preferred_doctor", "preferred_time", "urgency", "location"],
        pipeline_stages=["new", "symptoms_collected", "appointment_scheduled", "visited", "follow_up", "closed"],
        intents=["appointment_query", "doctor_availability", "fee_query", "location_query", "report_query"],
        qualification_questions=[
            "Which service or doctor would you like to see?",
            "What time would you prefer?",
            "Is this urgent?",
        ],
        templates={
            "greeting": "Hi! 👋 Which doctor or service would you like to book?",
            "price_reply": "Consultation fees depend on the doctor/service. Which one are you looking for?",
            "follow_up": "Hi, would you like me to help confirm your appointment?",
            "lost_lead": "No problem. You can message here anytime to book. Take care. 🙏",
            "booking_confirmation": "Your appointment is confirmed. Please arrive 10 minutes early.",
            "handoff": "Let me connect you with our front desk — they'll assist you shortly.",
        },
        tools=["doctor_slots", "appointment_booking", "clinic_location"],
        rules={
            "require_human_for": ["emergency", "medical advice", "prescription", "diagnosis", "angry"],
            "forbidden_claims": ["diagnosis", "medicine recommendation", "guaranteed cure"],
            "compliance_notes": ["AI must NOT give medical advice or diagnosis"],
        },
        analytics={"conversion_event": "appointment_scheduled", "important_metrics": ["appointment_scheduled", "visited"]},
    ),

    "real_estate": _pack(
        vertical="real_estate", label="Real estate",
        lead_fields=["buyer_name", "budget", "location", "property_type", "bhk", "buy_or_rent", "visit_time"],
        pipeline_stages=["new", "requirements_collected", "property_shared", "visit_scheduled", "negotiation", "closed", "lost"],
        intents=["property_query", "budget_query", "location_query", "visit_request", "negotiation"],
        qualification_questions=[
            "Are you looking to buy or rent?",
            "What's your preferred location?",
            "What budget range are you considering?",
        ],
        templates={
            "greeting": "Hi! 👋 Are you looking to buy or rent a property?",
            "price_reply": "Sure! What budget range are you considering, and which area?",
            "follow_up": "Hi! Should I share more matching properties for you?",
            "lost_lead": "No worries — I'll update you when better matches come up. 🙏",
            "booking_confirmation": "Your property visit is confirmed. Our agent will meet you there.",
            "handoff": "Let me connect you with one of our property agents — they'll reply shortly.",
        },
        tools=["property_search", "visit_booking", "broker_assignment"],
        rules={
            "require_human_for": ["legal", "documents", "token payment", "price negotiation"],
            "forbidden_claims": ["fake availability", "unverified legal clearance", "guaranteed appreciation"],
            "compliance_notes": ["avoid false property promises"],
        },
        analytics={"conversion_event": "visit_scheduled", "important_metrics": ["property_shared", "visit_scheduled", "closed"]},
    ),

    "salon": _pack(
        vertical="salon", label="Salon / Spa",
        lead_fields=["name", "service_type", "preferred_stylist", "preferred_time", "location"],
        pipeline_stages=["new", "service_selected", "booking_scheduled", "visited", "follow_up", "lost"],
        intents=["service_query", "price_query", "booking_query", "availability_query"],
        qualification_questions=[
            "Which service would you like to book?",
            "Any preferred day or time?",
        ],
        templates={
            "greeting": "Hi! 💇 Which service would you like to book today?",
            "price_reply": "Our prices vary by service. Which one are you interested in? I'll share the rate.",
            "follow_up": "Hi! Would you like to book your appointment? We have slots open this week. ✨",
            "lost_lead": "No problem — message us anytime to book. 💅",
            "booking_confirmation": "Your appointment is booked. See you soon! ✨",
            "handoff": "Let me connect you with our front desk to finalise the details.",
        },
        tools=["service_menu", "stylist_slots", "booking"],
        rules={"require_human_for": ["refund", "complaint", "angry"], "forbidden_claims": [], "compliance_notes": []},
        analytics={"conversion_event": "booking_scheduled", "important_metrics": ["booking_scheduled", "visited"]},
    ),

    "ecommerce": _pack(
        vertical="ecommerce", label="E-commerce / D2C",
        lead_fields=["name", "product_interest", "order_id", "budget", "issue_type"],
        pipeline_stages=["new", "browsing", "cart", "ordered", "post_purchase", "lost"],
        intents=["product_query", "price_query", "order_status", "return_refund", "discount_query"],
        qualification_questions=[
            "Which product are you interested in?",
            "Do you have an order ID I can look up?",
        ],
        templates={
            "greeting": "Hi! 🛍️ What are you shopping for today?",
            "price_reply": "Happy to help! Which product would you like the price for?",
            "follow_up": "Hi! Still thinking about your order? Here's a little nudge — want me to share the link?",
            "lost_lead": "No worries — we'll keep your favourites ready whenever you're back. 🛒",
            "booking_confirmation": "Order confirmed! You'll get tracking updates here.",
            "handoff": "Let me connect you with our support team to sort this out.",
        },
        tools=["catalog", "order_lookup", "payment_link"],
        rules={"require_human_for": ["refund", "damaged", "complaint", "chargeback"], "forbidden_claims": ["fake stock", "false delivery promise"], "compliance_notes": []},
        analytics={"conversion_event": "ordered", "important_metrics": ["cart", "ordered", "post_purchase"]},
    ),

    "b2b": _pack(
        vertical="b2b", label="B2B distributor / wholesale",
        lead_fields=["company_name", "contact_name", "product_interest", "order_quantity", "location", "gst_number"],
        pipeline_stages=["new", "requirement_collected", "quote_sent", "negotiation", "po_received", "closed", "lost"],
        intents=["product_query", "quote_query", "moq_query", "credit_terms", "order_query"],
        qualification_questions=[
            "Which products and quantities are you looking for?",
            "What's your business location and GST?",
        ],
        templates={
            "greeting": "Hi! 👋 Which products and quantities can we quote for you?",
            "price_reply": "Pricing is volume-based. What quantity are you looking at? I'll prepare a quote.",
            "follow_up": "Hi! Did you get a chance to review our quote? Happy to revise on volume.",
            "lost_lead": "Understood — we'll reach out with seasonal pricing. 🙏",
            "booking_confirmation": "Noted — our sales rep will follow up to confirm the order.",
            "handoff": "Let me connect you with your account manager for pricing.",
        },
        tools=["price_list", "quote_builder", "credit_check"],
        rules={"require_human_for": ["credit terms", "negotiation", "contract", "legal"], "forbidden_claims": [], "compliance_notes": []},
        analytics={"conversion_event": "po_received", "important_metrics": ["quote_sent", "po_received", "closed"]},
    ),

    "travel": _pack(
        vertical="travel", label="Travel / hospitality",
        lead_fields=["name", "destination", "travel_dates", "travellers", "budget", "package_type"],
        pipeline_stages=["new", "requirements_collected", "itinerary_shared", "booking_in_progress", "booked", "lost"],
        intents=["package_query", "price_query", "availability_query", "booking_query", "itinerary_query"],
        qualification_questions=[
            "Where would you like to travel, and on what dates?",
            "How many travellers, and what's your budget?",
        ],
        templates={
            "greeting": "Hi! ✈️ Where would you like to travel?",
            "price_reply": "Packages depend on dates and group size. Where and when are you planning?",
            "follow_up": "Hi! Should I hold the package before prices change?",
            "lost_lead": "No problem — I'll share deals when they drop. 🏝️",
            "booking_confirmation": "Your booking is confirmed. Get ready for the trip! 🧳",
            "handoff": "Let me connect you with a travel specialist to finalise.",
        },
        tools=["package_catalog", "availability", "booking"],
        rules={"require_human_for": ["refund", "cancellation", "visa", "complaint"], "forbidden_claims": ["fake availability"], "compliance_notes": []},
        analytics={"conversion_event": "booked", "important_metrics": ["itinerary_shared", "booked"]},
    ),

    "political_party": _pack(
        vertical="political_party", label="Political party / Jan Seva office",
        lead_fields=[
            "constituent_name", "phone", "constituency", "assembly_constituency",
            "ward", "booth", "mandal_or_block", "local_unit", "office_role",
            "shakti_kendra", "morcha_or_cell", "membership_id", "pincode",
            "issue_category", "grievance_summary", "department", "case_owner",
            "resolution_deadline", "urgency", "event_name", "volunteer_interest",
            "preferred_language", "accessibility_need", "consent_source",
        ],
        pipeline_stages=[
            "new", "issue_logged", "constituency_mapped", "volunteer_interested",
            "membership_support", "event_rsvp", "case_assigned", "follow_up",
            "resolved", "escalated", "lost",
        ],
        intents=[
            "grievance_intake", "constituency_help", "membership_query",
            "volunteer_signup", "event_rsvp", "booth_office_query",
            "scheme_help", "media_query", "compliance_sensitive",
        ],
        qualification_questions=[
            "Please share your constituency or ward and the issue you need help with.",
            "Is this about a grievance, karyakarta follow-up, event RSVP, or sadasyata/membership support?",
            "Do you consent to this office using these details only to follow up on your request?",
        ],
        templates={
            "greeting": "Namaste. This Jan Seva office helps every constituent equally. Please share your constituency, ward, booth, or mandal/block and the issue/request so we can route it to the right local team.",
            "price_reply": "This office cannot process payments or benefits through chat. Please share the request details and a human will verify the correct official process.",
            "follow_up": "Following up on your request. Could you confirm whether it is resolved or still pending?",
            "lost_lead": "No problem. Message this office again if you need help with a local issue or public-service request.",
            "booking_confirmation": "Your RSVP/request is noted. The local team will confirm the details here.",
            "handoff": "This needs review by a party office team member. I am handing it over so a human can respond respectfully and in line with compliance rules.",
        },
        tools=[
            "constituency_router", "grievance_register", "volunteer_roster",
            "event_rsvp", "membership_support", "mandal_booth_routing",
            "case_assignment", "compliance_review",
        ],
        rules={
            "require_human_for": [
                "caste", "jati", "jaati", "samaj", "community", "religion",
                "religious", "hindu", "muslim", "islam", "christian",
                "catholic", "protestant", "sikh", "buddhist", "jain",
                "parsi", "zoroastrian", "jewish", "tribal faith", "sarna",
                "animist", "lingayat", "dalit", "adivasi", "obc", "ews",
                "general caste", "forward caste", "upper caste", "backward",
                "sc", "st", "scheduled caste", "scheduled tribe", "tribe",
                "minority", "communal", "sect", "denomination", "gotra",
                "riot",
                "violence", "hate", "vote", "voter", "election", "poll",
                "model code", "mcc", "eci", "representation of the people",
                "legal", "defamation", "fake news", "cash", "liquor",
                "gift", "inducement", "bribe", "media", "journalist",
                "opponent", "targeting",
            ],
            "forbidden_claims": [
                "cash, gifts, liquor, or benefits in exchange for votes",
                "religion, caste, or community-targeted persuasion",
                "voter suppression, intimidation, or misinformation",
                "unverified allegations about opponents",
                "impersonating the Election Commission or a government office",
                "guaranteed government benefit, job, ticket, or scheme approval",
            ],
            "compliance_notes": [
                "Use only for opt-in constituent service, grievance intake, event RSVP, membership, and volunteer coordination.",
                "Serve every constituent equally; never prioritize, exclude, persuade, or route differently because of caste, religion, sect, tribe, denomination, or community.",
                "Do not ask for, infer, store, or target people by caste, religion, community, or other sensitive identity. If a user voluntarily raises it, hand off to a human.",
                "Election, Model Code of Conduct, Representation of the People Act, media, law-and-order, or legal-risk topics require human review.",
                "Follow WhatsApp/Meta consent, opt-out, and political messaging policies; do not generate bulk electioneering or attack copy.",
            ],
        },
        inclusion_policy={
            "mode": "universal_constituent_service",
            "identity_data_policy": "do_not_collect_or_target",
            "coverage_use": "Use public aggregate demographics only for language, accessibility, staffing, and grievance-service coverage planning.",
            "supported_service_needs": [
                "preferred_language", "accessibility_need", "grievance_category",
                "department", "constituency", "ward", "booth",
                "mandal_or_block", "shakti_kendra", "morcha_or_cell",
                "local_unit", "pincode", "case_owner", "resolution_deadline",
            ],
            "party_office_terms": [
                "jan seva office", "karyakarta", "mandal", "booth office",
                "shakti kendra", "morcha", "cell", "sangathan",
            ],
            "do_not_segment_by": [
                "religion", "caste", "sub-caste", "tribe", "sect",
                "denomination", "community", "gotra",
            ],
            "source_notes": [
                "Census 2011 remains the official religion table baseline.",
                "Official SC/ST data should be used only for welfare/access coverage, never persuasion.",
                "WhatsApp Business Platform policy restricts political party/candidate/campaign use.",
                "ECI MCC restrictions make caste/religion appeals a human-review risk.",
            ],
        },
        stage_hints={
            "NEW_LEAD": ["issue", "constituency", "mapped"],
            "SUPPORT_QUERY": ["issue", "constituency", "mapped", "case"],
            "BOOKING_QUERY": ["event", "rsvp", "volunteer"],
            "RESCHEDULE": ["event", "rsvp", "follow_up"],
            "COMPLAINT": ["issue"],
            "HUMAN_REQUEST": ["escalated"],
            "NOT_INTERESTED": ["lost"],
        },
        keyword_stage_hints={
            "escalated": [
                "caste", "jati", "jaati", "religion", "religious", "hindu",
                "muslim", "christian", "sikh", "buddhist", "jain", "parsi",
                "sarna", "dalit", "adivasi", "obc", "sc", "st",
                "scheduled caste", "scheduled tribe", "vote", "voter",
                "election", "model code", "mcc", "eci", "cash", "liquor",
                "gift", "target",
            ],
            "volunteer_interested": [
                "volunteer", "karyakarta", "join team", "booth team",
                "sangathan", "morcha", "cell",
            ],
            "membership_support": [
                "membership", "member", "sadasyata", "sadasya",
                "primary member", "active member",
            ],
            "event_rsvp": ["rsvp", "meeting", "sabha", "event", "rally", "seva camp"],
            "issue_logged": [
                "grievance", "complaint", "drainage", "water", "road",
                "ration", "pension", "bijli", "electricity", "sewer",
                "garbage", "scheme", "yojana",
            ],
            "constituency_mapped": [
                "constituency", "assembly", "ward", "booth", "pincode",
                "mandal", "block", "shakti kendra", "local unit",
            ],
        },
        analytics={
            "conversion_event": "resolved",
            "important_metrics": [
                "issue_logged", "constituency_mapped", "volunteer_interested",
                "membership_support", "case_assigned", "resolved", "escalated",
            ],
            "buyer_kpis": [
                "case resolution rate", "pending cases by mandal/booth",
                "karyakarta follow-up backlog", "sadasyata requests",
                "event RSVP confirmations", "human-review escalations",
            ],
        },
    ),

    "restaurant": _pack(
        vertical="restaurant", label="Restaurant / cloud kitchen",
        lead_fields=[
            "name", "phone", "party_size", "reservation_date", "reservation_time",
            "table_preference", "occasion", "cuisine_preference", "order_items",
            "delivery_address", "catering_event", "headcount", "budget",
            "dietary_preference", "follow_up_date",
        ],
        pipeline_stages=[
            "new", "menu_shared", "reservation_booked", "order_placed",
            "catering_quoted", "feedback", "escalated", "lost",
        ],
        intents=[
            "menu_query", "price_query", "reservation_query", "order_query",
            "delivery_query", "catering_query", "timing_query", "offer_query",
            "refund_or_complaint",
        ],
        qualification_questions=[
            "Are you looking to book a table, order for delivery, or plan catering for an event?",
            "How many people, and on which date and time?",
            "Any cuisine, veg/non-veg, or dietary preference we should note?",
        ],
        templates={
            "greeting": "Hi! 🍽️ Welcome! Would you like to book a table, order for delivery, or plan catering for an event?",
            "price_reply": "Happy to share the menu and prices. Are you dining in, ordering delivery, or planning catering? I'll send the right rates.",
            "follow_up": "Hi! Should I go ahead and confirm your table or order? We have slots open today. 🍴",
            "lost_lead": "No problem — message us anytime to book a table or order. 🙏",
            "booking_confirmation": "Your table/order is noted. Our team will confirm the details here shortly. ✅",
            "handoff": "Let me connect you with our manager so they can sort this out right away. 🙏",
        },
        tools=[
            "menu_catalog", "table_reservation", "online_order",
            "delivery_tracking", "catering_quote", "feedback_capture",
        ],
        rules={
            "require_human_for": [
                "refund", "food poisoning", "stale", "spoiled", "rotten",
                "hair in food", "sick", "allergic reaction", "overcharged",
                "worst", "cheated", "complaint", "hygiene", "insect", "cockroach",
            ],
            "forbidden_claims": [
                "false availability of fully-booked slots",
                "health or medical claims about food",
                "hidden charges not disclosed upfront",
            ],
            "compliance_notes": [
                "Confirm allergies/dietary needs honestly; never claim a dish is allergen-free without kitchen confirmation.",
                "Escalate food-safety, hygiene, refund, and overcharge complaints to a human manager.",
                "Disclose taxes and service charges; do not promise slots that are not available.",
            ],
        },
        stage_hints={
            "NEW_LEAD": ["menu"],
            "SUPPORT_QUERY": ["menu"],
            "BOOKING_QUERY": ["reservation", "order", "catering"],
            "PRICE_QUERY": ["menu"],
            "COMPLAINT": ["escalated"],
            "HUMAN_REQUEST": ["escalated"],
            "NOT_INTERESTED": ["lost"],
        },
        keyword_stage_hints={
            "escalated": [
                "refund", "food poisoning", "stale", "spoiled", "rotten",
                "hair in food", "worst", "cheated", "allergic reaction",
                "overcharged", "insect", "cockroach", "hygiene",
            ],
            "catering_quoted": [
                "catering", "bulk order", "party order", "event order",
                "corporate lunch", "wedding catering", "headcount", "plates",
                "large order", "buffet", "function",
            ],
            "reservation_booked": [
                "reservation", "reserve", "book a table", "table for",
                "table booking", "dinner booking", "lunch booking",
                "anniversary dinner", "birthday dinner", "private dining",
            ],
            "order_placed": [
                "order", "delivery", "deliver", "home delivery", "parcel",
                "takeaway", "take away", "pickup order", "online order",
            ],
            "menu_shared": [
                "menu", "price", "rate", "cost", "kitna", "veg", "non-veg",
                "thali", "combo", "dish", "special", "today's special",
                "starters", "dessert",
            ],
        },
        analytics={
            "conversion_event": "order_placed",
            "important_metrics": [
                "menu_shared", "reservation_booked", "order_placed",
                "catering_quoted", "escalated",
            ],
            "buyer_kpis": [
                "table reservations per day", "delivery orders captured",
                "catering enquiries", "average party size", "repeat customers",
                "complaint escalations", "no-show follow-ups",
            ],
        },
    ),

    "gym": _pack(
        vertical="gym", label="Gym / fitness studio",
        lead_fields=[
            "name", "phone", "fitness_goal", "preferred_program", "membership_plan",
            "trial_date", "preferred_time", "batch_preference", "trainer_preference",
            "medical_condition", "budget", "joining_date", "renewal_date",
            "follow_up_date",
        ],
        pipeline_stages=[
            "new", "enquiry_received", "trial_booked", "pt_consultation",
            "plan_discussed", "membership_joined", "renewal_due", "escalated", "lost",
        ],
        intents=[
            "membership_query", "trial_query", "plan_query", "pt_query",
            "class_query", "timing_query", "renewal_query", "diet_query",
            "refund_or_complaint",
        ],
        qualification_questions=[
            "What's your main goal: weight loss, muscle gain, general fitness, or a specific class like yoga or Zumba?",
            "Would you like to start with a free trial, or hear about membership plans?",
            "Any preferred timing — morning, evening, or weekend batches?",
        ],
        templates={
            "greeting": "Hi! 💪 Welcome! What's your fitness goal — weight loss, muscle gain, or general fitness? I can set up a free trial or share membership plans.",
            "price_reply": "Our plans depend on duration and whether you want personal training. Are you looking at monthly, quarterly, or annual? I'll share the exact rates.",
            "follow_up": "Hi! Ready to start your fitness journey? I can block a free trial slot for you this week. 🏋️",
            "lost_lead": "No worries — message us whenever you're ready to start. Stay healthy! 🙏",
            "booking_confirmation": "Your trial/membership is noted. Our team will confirm the details here. ✅",
            "handoff": "Let me connect you with our team so they can help you safely and properly. 🙏",
        },
        tools=[
            "membership_plans", "trial_booking", "class_schedule",
            "pt_assignment", "diet_consultation", "renewal_reminder",
        ],
        rules={
            "require_human_for": [
                "refund", "injury", "injured", "chest pain", "heart",
                "heart condition", "medical emergency", "pregnant", "surgery",
                "worst", "cheated", "fraud", "harassment", "complaint",
                "freeze membership",
            ],
            "forbidden_claims": [
                "guaranteed weight loss in a fixed number of days",
                "guaranteed body transformation",
                "medical, physiotherapy, or treatment advice",
                "steroid or unverified supplement recommendations",
            ],
            "compliance_notes": [
                "Never give medical or physiotherapy advice; escalate injuries, pain, pregnancy, and medical conditions to a human/trainer.",
                "Avoid guaranteed weight-loss or transformation claims.",
                "Escalate refund, membership-freeze, and harassment complaints to a human.",
            ],
        },
        stage_hints={
            "NEW_LEAD": ["enquiry"],
            "SUPPORT_QUERY": ["enquiry"],
            "BOOKING_QUERY": ["trial", "consultation"],
            "PRICE_QUERY": ["plan"],
            "COMPLAINT": ["escalated"],
            "HUMAN_REQUEST": ["escalated"],
            "NOT_INTERESTED": ["lost"],
        },
        keyword_stage_hints={
            "escalated": [
                "refund", "injury", "injured", "chest pain", "heart",
                "medical emergency", "worst", "cheated", "fraud", "harassment",
                "surgery",
            ],
            "renewal_due": [
                "renew", "renewal", "extend membership", "reactivate",
                "membership expired", "expiring",
            ],
            "trial_booked": [
                "trial", "free session", "free class", "demo class",
                "trial session", "day pass", "free trial",
            ],
            "pt_consultation": [
                "personal trainer", "personal training", "diet plan",
                "nutrition plan", "transformation program", "weight loss plan",
                "one on one",
            ],
            "plan_discussed": [
                "membership", "plan", "price", "fee", "fees", "cost", "kitna",
                "rate", "monthly", "quarterly", "annual", "charges", "joining fee",
            ],
            "enquiry_received": [
                "yoga", "zumba", "cardio", "crossfit", "gym", "workout",
                "classes", "batch", "join", "fitness", "weights", "cross fit",
            ],
        },
        analytics={
            "conversion_event": "membership_joined",
            "important_metrics": [
                "enquiry_received", "trial_booked", "pt_consultation",
                "plan_discussed", "membership_joined", "renewal_due", "escalated",
            ],
            "buyer_kpis": [
                "trial bookings", "trial-to-join conversion", "personal-training uptake",
                "plan-discussion rate", "memberships joined", "renewal backlog",
                "complaint escalations",
            ],
        },
    ),

    "automobile": _pack(
        vertical="automobile", label="Automobile dealer / service",
        lead_fields=[
            "name", "phone", "interest_type", "vehicle_model", "variant",
            "fuel_type", "transmission", "budget", "exchange_vehicle",
            "finance_required", "test_drive_date", "preferred_showroom",
            "service_type", "vehicle_reg_number", "service_date", "follow_up_date",
        ],
        pipeline_stages=[
            "new", "model_shared", "test_drive_booked", "quote_shared",
            "service_booked", "booking_confirmed", "escalated", "lost",
        ],
        intents=[
            "model_query", "price_query", "test_drive_query", "finance_query",
            "exchange_query", "service_query", "insurance_query", "offer_query",
            "refund_or_complaint",
        ],
        qualification_questions=[
            "Are you looking to buy a new vehicle, or book a service for an existing one?",
            "Which model or variant are you interested in — and is finance or exchange involved?",
            "Which city/showroom is convenient, and when would you like to visit?",
        ],
        templates={
            "greeting": "Hi! 🚗 Welcome! Are you looking to buy a new vehicle or book a service? Let me know the model or service you need.",
            "price_reply": "Happy to share the on-road price. Which model and variant are you considering, and is exchange or finance involved? I'll prepare the breakup.",
            "follow_up": "Hi! Would you like me to block a test-drive slot or service appointment for you? 🚘",
            "lost_lead": "No problem — I'll reach out when there's a new offer. Drive safe! 🙏",
            "booking_confirmation": "Your test drive / service appointment is noted. Our team will confirm the details here. ✅",
            "handoff": "Let me connect you with our team so they can handle this carefully and share verified details. 🙏",
        },
        tools=[
            "model_catalog", "test_drive_booking", "price_quote",
            "finance_calculator", "exchange_valuation", "service_booking",
        ],
        rules={
            "require_human_for": [
                "refund", "cheated", "fraud", "worst", "manufacturing defect",
                "defect", "lemon", "legal", "consumer court", "accident claim",
                "complaint", "booking cancel", "delivery delay",
            ],
            "forbidden_claims": [
                "guaranteed loan or finance approval",
                "unverified mileage or performance guarantees",
                "false stock availability or delivery dates",
                "guaranteed exchange value without inspection",
            ],
            "compliance_notes": [
                "Quote on-road prices and finance EMIs as indicative; final figures need showroom confirmation.",
                "Never guarantee loan approval or exchange value without inspection.",
                "Escalate manufacturing-defect, refund, accident-claim, and legal topics to a human.",
            ],
        },
        stage_hints={
            "NEW_LEAD": ["model"],
            "SUPPORT_QUERY": ["model", "service"],
            "BOOKING_QUERY": ["test_drive", "service"],
            "PRICE_QUERY": ["quote"],
            "PAYMENT_QUERY": ["quote"],
            "COMPLAINT": ["escalated"],
            "HUMAN_REQUEST": ["escalated"],
            "NOT_INTERESTED": ["lost"],
        },
        keyword_stage_hints={
            "escalated": [
                "refund", "cheated", "fraud", "worst", "manufacturing defect",
                "defect", "lemon", "consumer court", "accident claim",
                "delivery delay",
            ],
            "service_booked": [
                "service", "servicing", "repair", "breakdown", "oil change",
                "periodic maintenance", "vehicle pickup", "not starting",
                "ac not cooling", "brake issue", "general service", "wash",
            ],
            "test_drive_booked": [
                "test drive", "test-drive", "book a drive", "demo drive",
                "test ride", "drive the car",
            ],
            "quote_shared": [
                "on-road price", "on road price", "quotation", "quote", "emi",
                "loan", "finance", "exchange", "downpayment", "down payment",
                "price", "kitna", "cost", "rate", "discount", "offer",
            ],
            "model_shared": [
                "model", "variant", "mileage", "features", "colour", "color",
                "automatic", "manual", "petrol", "diesel", "electric", "suv",
                "sedan", "hatchback", "brochure", "specifications",
            ],
        },
        analytics={
            "conversion_event": "booking_confirmed",
            "important_metrics": [
                "model_shared", "test_drive_booked", "quote_shared",
                "service_booked", "booking_confirmed", "escalated",
            ],
            "buyer_kpis": [
                "test-drive bookings", "quote-to-booking conversion",
                "service appointments", "finance/exchange enquiries",
                "model-wise demand", "complaint escalations",
            ],
        },
    ),

    "insurance": _pack(
        vertical="insurance", label="Insurance / financial advisor",
        lead_fields=[
            "name", "phone", "insurance_type", "coverage_amount", "policy_term",
            "sum_assured", "premium_budget", "age", "annual_income",
            "existing_policy", "nominee", "health_condition", "vehicle_details",
            "policy_number", "renewal_date", "advisor_owner", "follow_up_date",
        ],
        pipeline_stages=[
            "new", "needs_assessed", "quote_shared", "plan_recommended",
            "documents_pending", "policy_issued", "renewal_due", "escalated", "lost",
        ],
        intents=[
            "policy_query", "premium_query", "plan_recommendation", "claim_query",
            "renewal_query", "document_query", "surrender_query", "tax_query",
            "refund_or_complaint",
        ],
        qualification_questions=[
            "What kind of cover are you looking for — term life, health/mediclaim, motor, or an investment plan?",
            "Who needs to be covered, and is there a sum assured or premium budget in mind?",
            "Do you have any existing policy you'd like to review or renew?",
        ],
        templates={
            "greeting": "Hi! 🛡️ Welcome! What cover are you looking for — term life, health/mediclaim, motor, or an investment plan? I'll guide you to the right option.",
            "price_reply": "Premiums depend on age, cover amount, term, and health. Could you share these so I can give an indicative quote? Final premium is confirmed by the insurer.",
            "follow_up": "Hi! Would you like me to share a suitable plan or help renew your existing policy before it lapses? 🛡️",
            "lost_lead": "No problem — I'll share useful options when they fit your needs. Stay protected! 🙏",
            "booking_confirmation": "Noted — a licensed advisor will confirm the plan details and next steps here. ✅",
            "handoff": "This needs a licensed advisor. Let me connect you so they can verify details and handle it correctly. 🙏",
        },
        tools=[
            "needs_analysis", "premium_calculator", "plan_comparison",
            "document_checklist", "policy_issuance", "renewal_reminder",
        ],
        rules={
            "require_human_for": [
                "claim", "claims", "settlement", "rejected", "dispute",
                "mis-sold", "mis sold", "misselling", "surrender", "ombudsman",
                "fraud", "legal", "death claim", "refund", "complaint", "worst",
                "cheated", "guaranteed return", "guaranteed returns",
                "assured return", "tax advice",
            ],
            "forbidden_claims": [
                "guaranteed returns", "assured returns", "risk-free returns",
                "guaranteed doubling of money", "tax-free guaranteed maturity",
                "investment is definitely better than mutual funds",
                "guaranteed claim approval",
            ],
            "compliance_notes": [
                "IRDAI: never promise guaranteed/assured returns; market-linked (ULIP) products carry investment risk that must be disclosed.",
                "Quotes are indicative; the insurer confirms the final premium after underwriting.",
                "Escalate claims, surrender, mis-selling, disputes, and tax advice to a licensed advisor.",
                "Do not give personalised tax or investment advice without proper disclosure and a licensed advisor.",
            ],
        },
        stage_hints={
            "NEW_LEAD": ["needs"],
            "SUPPORT_QUERY": ["needs"],
            "PRICE_QUERY": ["quote"],
            "PAYMENT_QUERY": ["quote"],
            "BOOKING_QUERY": ["needs"],
            "COMPLAINT": ["escalated"],
            "HUMAN_REQUEST": ["escalated"],
            "NOT_INTERESTED": ["lost"],
        },
        keyword_stage_hints={
            "escalated": [
                "claim", "claims", "settlement", "rejected", "dispute",
                "mis-sold", "mis sold", "misselling", "surrender", "ombudsman",
                "fraud", "legal", "death claim", "refund", "worst", "cheated",
                "guaranteed return", "guaranteed returns", "assured return",
            ],
            "renewal_due": [
                "renew", "renewal", "lapse", "lapsed", "reactivate policy",
                "due for renewal", "expiring policy",
            ],
            "documents_pending": [
                "documents", "kyc", "aadhaar", "pan card", "medical test",
                "proposal form", "upload", "paperwork",
            ],
            "plan_recommended": [
                "recommend", "suggest", "which plan", "best plan",
                "compare plans", "term vs", "ulip", "endowment", "money back",
            ],
            "quote_shared": [
                "premium", "quote", "quotation", "sum assured",
                "coverage amount", "illustration", "price", "rate", "kitna",
                "cost", "how much",
            ],
            "needs_assessed": [
                "term insurance", "term plan", "health insurance", "mediclaim",
                "life insurance", "motor insurance", "car insurance",
                "bike insurance", "travel insurance", "family floater",
                "child plan", "retirement", "pension", "investment plan",
                "policy",
            ],
        },
        analytics={
            "conversion_event": "policy_issued",
            "important_metrics": [
                "needs_assessed", "quote_shared", "plan_recommended",
                "documents_pending", "policy_issued", "renewal_due", "escalated",
            ],
            "buyer_kpis": [
                "needs assessed", "quotes shared", "plan recommendations",
                "documents pending backlog", "policies issued", "renewal backlog",
                "claim/surrender escalations",
            ],
        },
    ),
}


def list_verticals() -> list[dict]:
    return [{"vertical": p["vertical"], "label": p["label"],
             "pipeline_stages": p["pipeline_stages"], "lead_fields": p["lead_fields"]}
            for p in VERTICAL_PACKS.values()]


def get_pack(vertical: str | None) -> dict:
    """Resolve a vertical pack. Missing → custom (silent). Unknown non-empty
    vertical → custom + a logged warning (config drift / bad data)."""
    if not vertical:
        return VERTICAL_PACKS["custom"]
    pack = VERTICAL_PACKS.get(vertical)
    if pack is None:
        logger.warning("[packs] unknown vertical %r — falling back to 'custom'", vertical)
        return VERTICAL_PACKS["custom"]
    return pack
