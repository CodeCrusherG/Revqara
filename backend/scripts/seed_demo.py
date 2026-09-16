"""
Seed / reset demo data so a fresh deploy is instantly demoable.

Idempotent — safe to run repeatedly.

  1. The primary demo workspace (demo@campaignx.app) — contacts, an approved
     template, and a targeted list, for the campaign side of the product.
  2. One showcase workspace per vertical (coaching, clinic, real_estate, salon,
     ecommerce, b2b, travel, restaurant, gym, automobile, insurance,
     political_party), each with real WhatsApp
     conversations run through the universal AI graph — so "same graph,
     different business brain" is easy to demo. Login as <vertical>@demo.nudge /
     demo1234.

Run:
    cd backend && PYTHONPATH=. python scripts/seed_demo.py
    # or inside docker:  docker compose exec backend python scripts/seed_demo.py
"""
from __future__ import annotations

import uuid
from datetime import datetime

from db.database import SessionLocal
from db.models import (
    Workspace, User, Contact, ContactList, ContactListMember, WhatsAppAccount, Template,
    Conversation, InboxMessage, Lead, Bot,
)
from auth.security import hash_password
from tools.whatsapp_crm import generate_cohort
from ai_graph.packs import get_pack
from ai_graph.graph import run_message_graph, classify_intent, _stage_for

DEMO_EMAIL = "demo@campaignx.app"
DEMO_PASSWORD = "demo1234"
SEED_CONTACTS = 200


def run():
    db = SessionLocal()
    try:
        # 1. Workspace + user
        user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if user:
            ws = db.query(Workspace).filter(Workspace.id == user.workspace_id).first()
        else:
            ws = Workspace(name="Demo Co", plan="pro")
            db.add(ws); db.flush()
            user = User(workspace_id=ws.id, email=DEMO_EMAIL,
                        password_hash=hash_password(DEMO_PASSWORD), full_name="Demo Admin", role="owner")
            db.add(user); db.commit()
        ws.plan = "pro"
        db.commit()

        # 2. WhatsApp number
        if not db.query(WhatsAppAccount).filter(WhatsAppAccount.workspace_id == ws.id).first():
            seed = uuid.uuid4().int
            db.add(WhatsAppAccount(workspace_id=ws.id, phone_number_id=str(10**14 + seed % 10**14),
                                   waba_id=str(10**14 + (seed >> 8) % 10**14),
                                   display_phone_number="+91 93407 75853", verified_name="Demo Co", status="connected"))
            db.commit()

        # 3. Contacts
        if db.query(Contact).filter(Contact.workspace_id == ws.id).count() < 50:
            for rec in generate_cohort(SEED_CONTACTS):
                num = rec["WhatsApp_Number"]
                if db.query(Contact).filter(Contact.workspace_id == ws.id, Contact.whatsapp_number == num).first():
                    continue
                db.add(Contact(
                    workspace_id=ws.id, full_name=rec["Full_name"], whatsapp_number=num, email=rec["email"],
                    age=rec["Age"], gender=rec["Gender"], city=rec["City"], occupation_type=rec["Occupation type"],
                    monthly_income=rec["Monthly_Income"], credit_score=rec["Credit score"], kyc_status=rec["KYC status"],
                    app_installed=rec["App_Installed"], existing_customer=rec["Existing Customer"],
                    social_media_active=rec["Social_Media_Active"],
                    opt_in_status="opted_in", opt_in_source="import", opt_in_at=datetime.utcnow()))
            db.commit()

        # 4. Approved template
        if not db.query(Template).filter(Template.workspace_id == ws.id).first():
            db.add(Template(workspace_id=ws.id, name="welcome_offer", category="marketing", language="en",
                            body="Hi {{1}}, welcome to Demo Co! Enjoy 20% off your first order. Reply YES to claim. 🎉",
                            status="approved"))
            db.commit()

        # 5. Targeted list
        if not db.query(ContactList).filter(ContactList.workspace_id == ws.id, ContactList.name == "VIP Customers").first():
            lst = ContactList(workspace_id=ws.id, name="VIP Customers", description="High-income, opted-in")
            db.add(lst); db.flush()
            top = (db.query(Contact).filter(Contact.workspace_id == ws.id)
                   .order_by(Contact.monthly_income.desc().nullslast()).limit(20).all())
            for c in top:
                db.add(ContactListMember(list_id=lst.id, contact_id=c.id))
            db.commit()

        contacts = db.query(Contact).filter(Contact.workspace_id == ws.id).count()
        print(f"✓ Demo ready — login {DEMO_EMAIL} / {DEMO_PASSWORD}")
        print(f"  workspace={ws.name} plan={ws.plan} contacts={contacts}")
    finally:
        db.close()


# ── Per-vertical showcase workspaces ──────────────────────────────────────────

# (workspace name, [(customer_name, message), ...]) keyed by vertical.
VERTICAL_DEMOS: dict[str, tuple[str, list[tuple[str, str]]]] = {
    "coaching": ("Apex Learning", [
        ("Rohan Sharma", "Fees kitna hai for class 11 JEE weekend batch?"),
        ("Priya Nair", "NEET dropper batch offline available hai?"),
        ("Ananya Singh", "UPSC prelims 2027 ke liye counselling book karni hai"),
        ("Vivek Menon", "SSC CGL aur CAT courses ke details share karo"),
        ("Anil Kumar", "This is the worst institute, I want a refund right now"),
    ]),
    "clinic": ("CarePlus Clinic", [
        ("Meera Iyer", "How much is the consultation fee for a dermatologist?"),
        ("Sanjay Rao", "I'd like to book an appointment for tomorrow morning"),
        ("Farah Khan", "My father has severe chest pain, this is an emergency"),
    ]),
    "real_estate": ("Skyline Realty", [
        ("Vikram Patel", "I want to schedule a visit for the 3BHK on Sunday"),
        ("Neha Gupta", "What's the price range for 2BHK flats in Whitefield?"),
        ("Imran Sheikh", "This is terrible service — you promised me a refund and cheated me"),
    ]),
    "salon": ("Glow Studio", [
        ("Aisha Verma", "How much is the bridal makeup package?"),
        ("Divya Menon", "Can I book a hair spa slot this Friday evening?"),
        ("Ritu Sharma", "I need to reschedule my appointment to next week"),
    ]),
    "ecommerce": ("Trendly", [
        ("Karan Malhotra", "What's the price of the wireless earbuds?"),
        ("Sneha Reddy", "Where is my order? It hasn't arrived yet"),
        ("Amit Joshi", "The product arrived damaged and I want a refund — this is a complaint"),
    ]),
    "b2b": ("BulkSupply Co", [
        ("Rajesh Agarwal", "I need a bulk order of 500 units, what's the rate?"),
        ("Sunita Desai", "Please send me a quotation for monthly supply"),
        ("Manoj Pillai", "Following up on the pending payment for last invoice"),
    ]),
    "travel": ("Wander Tours", [
        ("Pooja Bhatt", "What's the price for the Bali honeymoon package?"),
        ("Arjun Mehta", "Are there any slots available for the Manali trip in July?"),
        ("Leena Thomas", "I want to cancel my booking and get a refund"),
    ]),
    "restaurant": ("Spice Garden", [
        ("Rahul Khanna", "Table for 4 this Saturday at 8pm?"),
        ("Sneha Pillai", "What's on the menu and price for a veg thali?"),
        ("Deepak Rao", "Need catering for a 200 guest wedding"),
        ("Faizal Ahmed", "Found a hair in my food, worst service, I want a refund"),
    ]),
    "gym": ("FitZone Studio", [
        ("Akash Gupta", "What are your monthly membership plans and price?"),
        ("Pooja Shetty", "Can I book a free trial session this weekend?"),
        ("Rohit Verma", "I want a personal trainer and diet plan for weight loss"),
        ("Sameer Khan", "I have a knee injury and severe chest pain during workout"),
    ]),
    "automobile": ("DriveLine Motors", [
        ("Nikhil Joshi", "Can I book a test drive for the Creta this Sunday?"),
        ("Anita Desai", "What's the on-road price and EMI for the petrol variant?"),
        ("Suresh Babu", "My car AC is not cooling, need a service appointment"),
        ("Manish Tiwari", "Worst dealer, manufacturing defect in my new car, I want a refund"),
    ]),
    "insurance": ("SecureLife Advisors", [
        ("Kavya Reddy", "I need a term insurance plan for my family"),
        ("Arvind Nair", "What's the premium for 1 crore health cover?"),
        ("Tina Dsouza", "Can you recommend the best plan: term vs ULIP?"),
        ("Harish Menon", "My health claim was rejected and I want to file a dispute"),
    ]),
    "political_party": ("Jan Seva Office", [
        ("Mahesh Yadav", "Ward 18 mein drainage issue hai, complaint register karna hai"),
        ("Kavita Rao", "Main mandal karyakarta hoon, Sunday seva camp ke liye volunteer karna hai"),
        ("Suresh Patil", "Need help with sadasyata membership update"),
        ("Nadeem Ansari", "Can you target voters by caste and religion for this election?"),
    ]),
}


def _ensure_vertical_ws(db, vertical: str, name: str, v_idx: int) -> Workspace:
    email = f"{vertical}@demo.nudge"
    user = db.query(User).filter(User.email == email).first()
    if user:
        ws = db.query(Workspace).filter(Workspace.id == user.workspace_id).first()
    else:
        ws = Workspace(name=name, plan="pro", vertical=vertical)
        db.add(ws); db.flush()
        db.add(User(workspace_id=ws.id, email=email, password_hash=hash_password(DEMO_PASSWORD),
                    full_name=f"{name} Admin", role="owner"))
        db.commit()
    ws.vertical = vertical
    ws.plan = "pro"
    db.commit()

    if not db.query(WhatsAppAccount).filter(WhatsAppAccount.workspace_id == ws.id).first():
        pnid = str(20_000_000_000_000 + v_idx)
        db.add(WhatsAppAccount(workspace_id=ws.id, phone_number_id=pnid, waba_id=pnid,
                               display_phone_number=f"+91 90000 0{v_idx:04d}", verified_name=name, status="connected"))
        db.commit()
    if not db.query(Bot).filter(Bot.workspace_id == ws.id).first():
        db.add(Bot(workspace_id=ws.id, enabled=True, handoff_enabled=True, name=name))
        db.commit()
    return ws


def _seed_conversation(db, ws: Workspace, pack: dict, cust_name: str, phone: str, message: str):
    acct = db.query(WhatsAppAccount).filter(WhatsAppAccount.workspace_id == ws.id).first()
    if db.query(Conversation).filter(Conversation.workspace_id == ws.id,
                                     Conversation.customer_wa_id == phone).first():
        return  # already seeded

    contact = (db.query(Contact)
               .filter(Contact.workspace_id == ws.id, Contact.whatsapp_number == phone).first())
    if not contact:
        contact = Contact(workspace_id=ws.id, whatsapp_number=phone, full_name=cust_name,
                          opt_in_status="opted_in", opt_in_source="inbound_message", opt_in_at=datetime.utcnow())
        db.add(contact); db.flush()

    convo = Conversation(workspace_id=ws.id, phone_number_id=acct.phone_number_id, customer_wa_id=phone,
                         customer_name=cust_name, contact_id=contact.id, auto_reply=True,
                         status="open", unread=True, last_inbound_at=datetime.utcnow())
    db.add(convo); db.flush()
    db.add(InboxMessage(workspace_id=ws.id, conversation_id=convo.id, direction="inbound",
                        sender="customer", text=message))

    # Run the real graph (deterministic fallback when no LLM is reachable).
    intent, _conf = classify_intent(message)
    lead = Lead(workspace_id=ws.id, conversation_id=convo.id, contact_id=contact.id,
                name=cust_name, phone=phone, source="bot", status="new",
                intent=intent.lower(), details=message[:500])
    stage = _stage_for(intent, pack, message)
    if stage:
        lead.status = stage
    db.add(lead)
    contact.tags = list(dict.fromkeys((contact.tags or []) + [intent.lower()]))

    result = run_message_graph(pack=pack, message_text=message, contact_name=cust_name,
                               history=[{"sender": "customer", "text": message}], kb=None)
    if result.get("extracted_fields"):
        lead.details = ", ".join(f"{k}: {v}" for k, v in result["extracted_fields"].items())
    if result["handoff"]:
        convo.auto_reply = False
    db.add(InboxMessage(workspace_id=ws.id, conversation_id=convo.id, direction="outbound",
                        sender="bot", text=result["response"]))
    db.commit()


def seed_verticals():
    db = SessionLocal()
    try:
        print("\nVertical showcase workspaces (password: demo1234):")
        for v_idx, (vertical, (name, convos)) in enumerate(VERTICAL_DEMOS.items()):
            pack = get_pack(vertical)
            ws = _ensure_vertical_ws(db, vertical, name, v_idx)
            for i, (cust_name, message) in enumerate(convos):
                phone = str(919_900_000_000 + v_idx * 1000 + i)
                _seed_conversation(db, ws, pack, cust_name, phone, message)
            n = db.query(Conversation).filter(Conversation.workspace_id == ws.id).count()
            print(f"  • {vertical:<12} {vertical}@demo.nudge   ({name}, {n} chats)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
    seed_verticals()
