# Nudge — Y Combinator Application (Draft)

> Draft answers to the standard YC application questions, written in YC's
> preferred voice: plain, concrete, specific. Replace every `[bracket]` with your
> real details (names, traction, location, links) before submitting.

---

## Company

**Company name:** Nudge

**Describe what your company does in 50 characters or less.**
AI that runs WhatsApp marketing campaigns for you. *(48)*

**Company URL:** [https://nudge.app]
**Demo video (≤1 min):** [link — see script at the bottom]
**Demo for reviewers:** [url] · sign up free, then click **Load demo data** on the Contacts page to populate sample contacts and run a full campaign in ~2 minutes.

---

## Founders

- **[Founder name]** — [role]. [1 line: why you're the person to build this — domain expertise in marketing/WhatsApp/AI/distribution].
- [Co-founder, if any]
- **How long have you known each other and how did you meet?** [answer]
- **Who writes code / does the technical work?** [answer]

---

## Product

**What is your company going to make? Describe your product and what it does.**

Nudge is an AI marketing platform for WhatsApp. A user types one sentence —
*"promote our new savings account to young professionals in Tier-1 cities"* — and
a pipeline of five AI agents does the work a marketing team would: it profiles the
contact list, derives A/B audience segments, writes compliant WhatsApp messages,
and predicts read/click rates. The user approves in one click, Nudge sends via
the WhatsApp Cloud API, measures real delivery/read/click engagement through
webhooks, and an optimizer rewrites the next round automatically.

It's a full platform, not a chatbot: signup, multi-tenant workspaces, contact CRM
with CSV import, targetable lists, plan-based billing, and a glass-box reasoning
trace so users can see *why* each decision was made. Today it runs end-to-end on
a simulated WhatsApp Cloud API so anyone can try the entire loop in minutes; the
same `pywa` integration points at live WhatsApp Business numbers for production.

---

## Progress

**How far along are you?**
Working product. The full loop runs today: account signup → import contacts →
create a targeted list → generate a campaign with the 5-agent pipeline → human
approval → send → webhook-driven read/click metrics → automatic optimization.
Multi-tenant (isolated workspaces), with Free/Pro plans and usage-enforced limits.

**Tech stack.** FastAPI + PostgreSQL + LangGraph (the 5-agent orchestration) +
`pywa` for the WhatsApp Cloud API; React/Vite frontend; JWT auth; Docker. The
engagement layer is webhook-driven (signed `read`/click events), so it maps 1:1
onto real WhatsApp the day a customer connects their number.

**Are people using it? Revenue?**
[Be honest. e.g. "Launched [date]. [N] signups, [N] activated workspaces,
[N] campaigns sent, [$] MRR. [X] design partners in [industry]."] If pre-launch:
"Private beta with [N] design partners; first paid customer expected [date]."

**What have you learned from users so far?**
[1–3 concrete, specific learnings — e.g. "SMB marketers will pay for 'just write
and send it,' but only if they can approve before it goes out."]

---

## Idea

**Why did you pick this idea? How do you know people need it?**
[Your origin story — e.g. you ran WhatsApp campaigns manually at [company] and it
took days per send.] WhatsApp is the dominant channel in India, LATAM, SEA, and
the Middle East — 2B+ users with 5–10× the open rates of email — but tooling is
either enterprise ($$$, weeks to onboard) or raw API. SMBs and growth teams are
stuck doing it by hand. We make running a great WhatsApp campaign as easy as
typing a sentence.

**Who are your competitors, and what do you understand that they don't?**
Wati, AiSensy, Interakt, Gallabox, Twilio (raw API), Mailchimp (email-first).
They sell *inboxes and broadcast blasters* — the human still segments, writes, and
analyzes. We understand the real work isn't sending, it's the *campaign loop*:
who to target, what to say, and what to change next. That loop is now automatable
with agents, and being AI-native from day one (not an AI feature bolted onto a
2018 broadcast tool) is the wedge.

**How will you make money? How much could you make per year?**
SaaS subscriptions (Free → Pro at \$49/mo today) plus usage-based pricing on send
volume; expansion as contact lists and sends grow. [Market sizing: tens of
millions of SMBs use WhatsApp for business globally; conversational-commerce
software is a multi-\$B and fast-growing market. At [X] customers × [$Y] ARPU =
[$Z] ARR.]

**How will you get users?**
[Founder-led sales to SMBs in [vertical/region]; self-serve free tier as the top
of funnel; partnerships with WhatsApp BSPs/agencies; content + templates for
common campaigns.]

**What's hard about this?**
Making AI output good enough to send to real customers without hand-holding, and
closing the loop on real engagement so the system improves itself. We solved the
second part: a webhook-driven read/click signal feeds the optimizer, and a
human-in-the-loop gate keeps quality and compliance high.

---

## Why now?

Three things just became true at once: (1) LLMs are finally good enough to write
and segment campaigns that a human will actually approve and send; (2) the
WhatsApp Cloud API opened programmatic sending to everyone; (3) WhatsApp became
the default business channel across the highest-growth markets. The team that
makes the *whole campaign loop* autonomous wins the category.

---

## Equity / legal

- **Have you incorporated?** [Yes/No — entity, date, jurisdiction]
- **Cap table summary:** [founders' split]
- **Have you taken any money?** [No / details]

---

## Anything else we should know?

Nudge already runs the complete agentic loop end-to-end (validated, multi-
tenant). We're not asking "can AI do marketing?" — we built it. The ask for YC is
distribution: turning a working product into the default way the world runs
WhatsApp marketing.

---

## 1-minute demo video script

1. **(0:00–0:08)** "Marketing on WhatsApp gets 5× the open rate of email — but
   running a campaign takes a team a day. Watch Nudge do it in 60 seconds."
2. **(0:08–0:20)** Type the brief: *"Promote our new savings account to young
   professionals in Tier-1 cities."* Click **Generate**.
3. **(0:20–0:38)** Show the agents working — segments appear, messages get
   written, read/click predicted. Open the glass-box trace for one decision.
4. **(0:38–0:48)** Click **Approve & send**. Messages go out on WhatsApp.
5. **(0:48–0:58)** Live dashboard: read and click rates climb; the optimizer
   proposes a sharper v2. "It just rewrote the next round on its own."
6. **(0:58–1:00)** "Nudge. WhatsApp campaigns, from one sentence. Start free."
