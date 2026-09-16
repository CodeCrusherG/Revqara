# Nudge — Pitch

**WhatsApp campaigns, from one sentence.**
AI agents that segment your audience, write the messages, send on WhatsApp, and optimize every round — while you stay in control.

> **Not another WhatsApp campaign tool. A WhatsApp control room that understands
> your business type.**
>
> Broadcast tools (AiSensy, Wati, Interakt) make WhatsApp *marketing* easy —
> sending is a button. Nudge makes WhatsApp *sales follow-up* automatic: it
> reads every reply, updates the lead stage, drafts the response, tracks the
> follow-up, and escalates to a human when needed — tuned to 12 business
> verticals out of the box. **They sell an easy send button; we sell the
> outcome after the reply.**

---

## One-pager

**Problem.** WhatsApp is the highest-intent marketing channel on earth — 2B+ users, 5–10× the open rates of email — but running a campaign is a manual slog: clean the contact data, segment the audience, write variants, pick send times, wire the Cloud API, read the analytics. Existing tools (Wati, AiSensy, Interakt, Twilio) are broadcast inboxes; the human still does all the thinking.

**Solution.** Nudge turns one plain-English brief into a complete WhatsApp campaign. A five-agent AI pipeline (Profiler → Planner → Creative → Analyst → Optimizer) builds the segments, writes compliant copy, predicts engagement, and — after a one-click human approval — sends and then rewrites the next round based on real read/click data.

**Product (working today).** Multi-tenant SaaS: signup, contact CRM with CSV import, targetable lists, the agentic campaign loop with a glass-box reasoning trace, webhook-driven read/click metrics, and Free/Pro plans with usage limits. Runs end-to-end on a simulated WhatsApp Cloud API; the same `pywa` integration points at live WhatsApp Business numbers in production.

**Why now.** LLMs are finally good enough to write send-ready campaigns; the WhatsApp Cloud API opened programmatic sending to everyone; WhatsApp became the default business channel across India, LATAM, SEA, and the Middle East. AI-native beats AI-bolted-on.

**Market.** Tens of millions of SMBs and growth teams run business on WhatsApp; conversational-commerce software is a multi-billion-dollar, fast-growing category.

**Business model.** SaaS subscription (Free → Pro \$49/mo) + usage-based pricing on send volume; expansion as contacts and sends grow.

**Moat.** A closed engagement loop (real read/click → optimizer) that compounds with usage, AI-native architecture, and a human-in-the-loop quality gate competitors' broadcast tools can't easily retrofit.

**Traction.** [N signups · N activated workspaces · N campaigns sent · \$ MRR · X design partners — fill in].

**Team.** [Founder(s) + 1-line why-you].

**Ask.** [Raising \$___ to ___ / Applying to YC W26].

---

## Deck outline (10 slides)

1. **Title** — Nudge · "WhatsApp campaigns, from one sentence." · logo · one-line tagline · contact.
2. **Problem** — WhatsApp = best channel, worst workflow. The manual campaign loop (data → segment → write → send → analyze) eats a team's week. Quantify the pain.
3. **Solution** — One brief → full campaign. Show the five agents and the human-approval gate. "We automate the loop, not just the send."
4. **Demo / product** — 3 screenshots: the brief box, the agent trace + predicted engagement, the live read/click dashboard. (Or embed the 60-sec demo.)
5. **Why now** — LLMs good enough + Cloud API open + WhatsApp = default business channel. Three converging curves.
6. **Market** — Bottom-up: # SMBs on WhatsApp × ARPU. Conversational-commerce TAM and growth rate. Beachhead: [vertical/region].
7. **Business model** — Free → Pro \$49/mo + usage. Show unit economics / expansion (contacts & sends grow → revenue grows).
8. **Competition** — 2×2 (AI-native ↔ broadcast-only × full-loop ↔ inbox-only). Nudge top-right; Wati/AiSensy/Twilio/Mailchimp elsewhere. "AiSensy makes marketing easy; Nudge makes follow-up automatic. They sell inboxes and send buttons; we sell the outcome after the reply — a control room that understands your business type."
9. **Traction & moat** — Usage/revenue to date; the self-optimizing engagement loop that compounds; logos/quotes from design partners.
10. **Team & ask** — Founders + why-you; the raise/round and what it unlocks (distribution, live-WhatsApp GTM, hires).

---

## Positioning 2×2 (for the competition slide)

```
              FULL CAMPAIGN LOOP (segment+write+optimize)
                              ▲
                              │      ★ Nudge
                              │
   broadcast-only ────────────┼───────────────► AI-native
        Wati                  │
        AiSensy   Twilio      │
        Interakt   Mailchimp  │
                              ▼
                     SEND / INBOX ONLY
```
