# Nudge — Sales & Demo Playbook (v0.4)

Everything you need to demo and sell Nudge. Internal use.

---

## The one-liner

> **Nudge is a vertical-aware AI WhatsApp CRM for Indian SMBs. It turns every
> WhatsApp reply into CRM updates, lead stages, follow-ups, and human handoffs —
> using one universal AI graph that adapts to coaching, clinics, real estate,
> salons, ecommerce, B2B, travel, restaurants, gyms, auto dealers, insurance,
> and civic/public-office workflows.**

Shorter: *One AI WhatsApp CRM. A different brain for every business.*

## Why it lands

- WhatsApp gets ~98% open rates; Indian SMBs already run their business on it —
  but in a chaotic personal inbox with no CRM, no pipeline, no follow-up.
- Generic chatbots feel robotic and don't fit a coaching institute the same way
  they fit a clinic.
- Nudge runs **one universal AI graph** that adapts per vertical: the pipeline
  stages, the fields it captures, how it replies, and when it escalates to a
  human all change with the business type — no rebuild.

---

## Pricing (INR / month)

| Plan | Price | For |
| --- | --- | --- |
| **Starter** | ₹1,499 | Solo founders, single-location SMBs |
| **Growth** | ₹2,999 | Growing teams (inbound + campaigns) |
| **AI Pro** | ₹6,999 | High-volume sales & support |
| **Agency** | ₹14,999+ | Agencies managing many client numbers |

> Meta's WhatsApp per-message charges are billed separately and passed through
> at cost. Plans cover the Nudge platform + AI.

---

## Live demo (no signup)

Send prospects to **`/demo`** — a vertical selector that opens a fully seeded
workspace in one click. Or log in directly:

| Vertical | Login | Password |
| --- | --- | --- |
| Coaching | coaching@demo.nudge | demo1234 |
| Clinic | clinic@demo.nudge | demo1234 |
| Real estate | real_estate@demo.nudge | demo1234 |
| Salon | salon@demo.nudge | demo1234 |
| E-commerce | ecommerce@demo.nudge | demo1234 |
| B2B | b2b@demo.nudge | demo1234 |
| Travel | travel@demo.nudge | demo1234 |
| Restaurant / cloud kitchen | restaurant@demo.nudge | demo1234 |
| Gym / fitness studio | gym@demo.nudge | demo1234 |
| Automobile dealer / service | automobile@demo.nudge | demo1234 |
| Insurance / financial advisor | insurance@demo.nudge | demo1234 |
| Political / Jan Seva office | political_party@demo.nudge | demo1234 |
| Full product (campaigns) | demo@campaignx.app | demo1234 |

(Seed/refresh with `backend/scripts/seed_demo.py` — see LOCAL_DEV.md.)

---

## Founder demo script (3–4 min)

1. **Frame it (15s).** "You run your business on WhatsApp. Nudge gives that
   inbox a brain that's tuned to *your* industry."
2. **Open `/demo`, pick their vertical (e.g. Real estate).** "Same AI, but it
   now thinks like a property business."
3. **Go to Inbox → click a suggested prompt** like *"Book a site visit for the
   3BHK on Sunday"*. Watch live:
   - **Intent** detected (booking)
   - **Fields** captured (BHK, location, visit time)
   - **Pipeline stage** moves to *visit scheduled*
   - **On-brand reply** sent automatically
4. **Now send a complaint** — *"You cheated me, I want my refund."* Show the
   **human handoff**: the AI steps back and flags it for a human. "It knows when
   *not* to answer."
5. **Open the Leads page.** "Every conversation became a structured lead in a
   pipeline built for real estate — not a generic CRM."
6. **Switch vertical (Clinic).** Send *"severe chest pain, emergency"* →
   instant escalation. "Same graph. Completely different judgment."
7. **Close:** "Connect your own WhatsApp number and you're live in minutes.
   Starter is ₹1,499/mo, 14-day free trial."

**Per-vertical "wow" prompts** (in-app suggestion chips already include these):

- Coaching → "Fees kitna hai for class 11 JEE weekend batch?"
- Clinic → "I want an appointment tomorrow morning"
- Real estate → "Book a site visit for the 3BHK on Sunday"
- Political / public office → "Ward 18 mein drainage issue hai, complaint register karna hai"
- Any → "Worst service, refund chahiye" (shows handoff)

### Coaching institute demo angle

Frame this as admissions + counselling operations, not a generic chatbot.

> "Nudge CoachingOps sorts every WhatsApp enquiry by exam family, class band,
> batch type, fee stage, demo/counselling need, and counsellor owner, so the
> team can respond faster and close enrolments with less leakage."

What it covers:

- JEE Main, JEE Advanced, NEET UG, class 11-12, integrated, dropper/repeater
- Classes 6-8 foundation and classes 9-10 boards/olympiad
- UPSC, state PCS, prelims, mains, interview
- SSC CGL/CHSL/MTS/GD, banking, railway, NDA/CDS/AFCAT
- CAT/MBA exams, CUET, CLAT, GATE, CA/CS/CMA, IELTS/TOEFL/SAT, other exams

Demo flow:

1. Open `/demo` → `Coaching institute`.
2. Send `Fees kitna hai for class 11 JEE weekend batch?` →
   stage moves to `fee_discussed`.
3. Send `NEET dropper batch offline available hai?` →
   stage moves to `batch_matched`.
4. Send `UPSC prelims 2027 ke liye counselling book karni hai` →
   stage moves to `counselling_booked`.
5. Send `SSC CGL aur CAT courses ke details share karo` →
   stage moves to `course_identified`.
6. Send `Worst institute, refund chahiye right now` →
   stage moves to `escalated` and hands off to a counsellor.

What to show owners:

- Course-wise enquiry volume
- Demo and counselling booking rate
- Fee-discussion rate
- Scholarship-review backlog
- Dropper lead volume
- Parent follow-up backlog
- Enrolments by exam family

### Political / Jan Seva office demo angle

Use this only as a civic operations demo, not a voter-persuasion pitch.

> "Nudge CivicOps turns an opt-in public-office inbox into structured cases:
> grievance intake, ward/booth/constituency routing, volunteer/event follow-up,
> preferred language/accessibility coverage, and human review for sensitive
> caste, religion, vote, election-law, media, or legal issues."

For a BJP-style office, frame it as Jan Seva + Sangathan operations:

> "Every public issue becomes a case, every mandal/booth or shakti kendra
> request is routed, every karyakarta, sadasyata, morcha, or cell enquiry goes
> into follow-up, and leaders see pending work by mandal, booth, owner, and
> deadline."

What to show leadership:

- Pending Jan Seva cases by mandal/booth
- Overdue case owners and unresolved departments
- Karyakarta follow-up backlog
- Sadasyata and morcha/cell enquiries
- Seva-camp and sabha RSVP confirmations
- Human-review escalations for sensitive issues

Demo flow:

1. Open `/demo` → `Political party / Jan Seva office`.
2. Send `Ward 18 mein drainage issue hai, complaint register karna hai` →
   stage moves to `issue_logged`.
3. Send `Main mandal karyakarta hoon, Sunday seva camp ke liye volunteer karna hai`
   → stage moves to `volunteer_interested`.
4. Send `Need help with sadasyata membership update` →
   stage moves to `membership_support`.
5. Send `Can you target voters by caste and religion for this election?` →
   stage moves to `escalated` and hands off to a human.

Compliance caveat for sales: WhatsApp Business Platform policy currently
restricts political party, politician, candidate, and campaign use. Treat this
vertical as an offline/demo or civic-service workflow until legal/platform
review approves any production channel. Do not pitch caste/religion targeting;
pitch equal constituent service across communities.

---

## Cold outreach assets

### WhatsApp / DM (to an SMB owner)

> Hi {{name}} — saw {{business}} runs on WhatsApp. We built an AI CRM that
> auto-replies to enquiries, captures leads into a pipeline built for
> {{vertical}}, and hands off to your team for anything sensitive. Want a 2-min
> live demo link? No signup.

### Cold email

> **Subject:** An AI WhatsApp assistant that thinks like a {{vertical}} business
>
> Hi {{name}},
>
> {{business}} probably gets most of its enquiries on WhatsApp — and they
> probably get lost in a personal inbox with no follow-up.
>
> Nudge is an AI WhatsApp CRM that auto-replies, captures every enquiry as a
> structured lead, moves it through a pipeline built for {{vertical}}, and hands
> off to your team when a human is needed.
>
> Here's a 2-minute live demo, no signup: {{demo_link}}
>
> Worth a quick call this week?
>
> — {{founder}}

### LinkedIn connect note

> Building Nudge — a vertical-aware AI WhatsApp CRM for Indian SMBs. One AI that
> adapts to coaching, clinics, real estate, salons, and more. Would love your
> take.

---

## Objection handling

| Objection | Response |
| --- | --- |
| "We already use WhatsApp." | "Exactly — Nudge sits on top of it and adds a CRM brain. You keep your number." |
| "Chatbots feel robotic." | "Ours adapts to your vertical and hands off to a human on anything sensitive. Try the complaint prompt in the demo." |
| "Is my data safe / compliant?" | "Opt-in/opt-out and consent are built in; the AI escalates risk to humans by rule." |
| "Too expensive." | "Starter is ₹1,499/mo and one recovered lead usually pays for it. 14-day free trial." |
| "Setup is hard." | "Connect your WhatsApp number and pick your business type — minutes, not weeks." |
| "We already use AiSensy / Wati / Interakt." | "Great — keep them for broadcasts. Nudge handles what happens *after* a reply: it reads the message, updates the lead stage, drafts the reply, and tracks follow-up — tuned to your business type. They make sending easy; we make follow-up automatic." |

---

## Competitive positioning: AiSensy (and Wati / Interakt)

AiSensy, Wati, and Interakt are **broadcast platforms**. They're genuinely easy
for getting a WhatsApp Business API number, uploading contacts, and sending
template campaigns — and a prospect may already use one. **Don't fight them on
broadcast simplicity. Win on what happens after the customer replies.**

> **AiSensy makes WhatsApp marketing easy. Nudge makes WhatsApp sales
> follow-up automatic.**

**What broadcast tools are easy for** (don't compete here):

```txt
broadcast campaigns · contact upload · basic tags/attributes
template messages · click-to-WhatsApp ads · live chat
basic chatbot flows · WhatsApp API onboarding
```

**What SMBs still struggle with** (this is Nudge's job):

```txt
what to do after someone replies "price?"
which lead is hot vs cold
turning chats into CRM stages
following up without forgetting
segmenting and replying per business type
knowing when a human must step in
```

A broadcast tool hands the owner an easy *send* button and leaves the *thinking*
to them: campaigns, tags, attributes, chatbot flows, and pipeline stages are all
manual. Nudge does the thinking — choose business type → message arrives → AI
understands it → lead stage updates → reply is ready → follow-up is tracked.

> **Not another WhatsApp campaign tool. A WhatsApp control room that understands
> your business type.**

That "understands your business type" claim is now backed by **12 vertical
specialists** (coaching, clinic, real estate, salon, ecommerce, B2B, travel,
restaurant, gym, automobile, insurance, civic/Jan Seva) — each with its own
pipeline stages, captured fields, replies, and escalation rules.

**Pricing framing.** Broadcast tools split platform fees from Meta's per-message
charges (India, Jan 2026: ~₹1.09/marketing, ~₹0.145/utility). Nudge passes Meta
charges through at cost too — so compare on **outcome per rupee**: a tool that
only *sends* vs. one that also *replies, sorts, and follows up*. One recovered
lead usually covers the platform fee.

---

## Status

v0.5 is demo-ready: universal AI graph, 13 vertical packs (12 business
verticals + custom), vertical-aware UI, onboarding, live demo selector,
CivicOps public-office specialist, and INR pricing.
