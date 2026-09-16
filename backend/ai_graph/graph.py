"""
Universal WhatsApp Business Operating Graph.

One graph for every vertical. Given an inbound message + the tenant's vertical
pack + conversation context, it runs the nodes:

    classify_intent → extract_lead_fields → decide_action → generate_response

and returns a decision the inbox applies (reply, lead stage/tags, human handoff).
Each node is LLM-enhanced where useful but has a deterministic, vertical-aware
fallback, so the graph always produces a sensible, on-brand result — even with
no LLM available.
"""
from __future__ import annotations

import json
import logging
import os
import re

logger = logging.getLogger(__name__)

# Bumped when graph decision logic changes — stamped onto every ai_trace.
GRAPH_VERSION = "0.6.1"

# Deterministic intent keywords (checked in priority order).
_INTENT_RULES = [
    ("OPT_OUT", ["stop", "unsubscribe", "opt out", "optout"]),
    ("HUMAN_REQUEST", ["agent", "human", "representative", "talk to someone", "call me", "speak to a"]),
    ("COMPLAINT", ["complaint", "worst", "terrible", "angry", "not working", "cheated", "disappointed", "bad service", "horrible"]),
    ("PAYMENT_QUERY", ["payment", "paid", "invoice", "installment", "emi", "pay link", "upi", "how to pay"]),
    ("RESCHEDULE", ["reschedule", "postpone", "change the time", "change my appointment", "shift my"]),
    ("CANCEL", ["cancel"]),
    ("PRICE_QUERY", ["price", "fee", "fees", "cost", "charge", "rate", "kitna", "how much", "pricing", "quote", "quotation"]),
    ("BOOKING_QUERY", ["book", "appointment", "slot", "schedule", "visit", "demo", "reserve", "booking", "when can"]),
    ("PAYMENT_QUERY", ["pay "]),
    ("SUPPORT_QUERY", ["how do", "where", "timing", "hours", "location", "address", "document", "help", "info", "details", "available", "availability", "refund policy"]),
    ("NOT_INTERESTED", ["not interested", "no thanks", "not now", "maybe later", "leave me"]),
]

_POSITIVE = ["interested", "yes", "tell me", "want", "need", "looking for", "send", "share", "more info", "hi", "hello", "hey"]


def _has_keyword(text: str, keyword: str) -> bool:
    """Match phrases safely. Short tokens like SC/ST should not match inside
    ordinary words such as 'street' or 'worst'."""
    kw = (keyword or "").strip().lower()
    if not kw:
        return False
    if re.fullmatch(r"[a-z0-9]+", kw):
        return re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", text) is not None
    return kw in text


def classify_intent(text: str) -> tuple[str, float]:
    t = (text or "").lower()
    for intent, kws in _INTENT_RULES:
        if any(_has_keyword(t, k) for k in kws):
            return intent, 0.75
    if any(_has_keyword(t, p) for p in _POSITIVE):
        return "NEW_LEAD", 0.55
    return "UNKNOWN", 0.3


def extract_lead_fields(text: str, pack: dict) -> dict:
    """Best-effort field extraction. LLM-extracted when available; otherwise a
    couple of safe heuristics (budget, location)."""
    fields: dict = {}
    t = text or ""
    # budget-like number (e.g. "50000", "5 lakh", "₹2,00,000")
    m = re.search(r"(?:₹|rs\.?\s*)?(\d[\d,]{2,})", t.lower())
    if m and any("budget" in f or "income" in f or "fee" in f for f in pack["lead_fields"]):
        fields["budget"] = m.group(1).replace(",", "")
    # try LLM extraction for the pack's fields
    llm = _llm_extract(text, pack)
    if llm:
        fields.update({k: v for k, v in llm.items() if v})
    return fields


def decide_action(intent: str, text: str, pack: dict) -> dict:
    rules = pack.get("rules", {})
    require_human = [k.lower() for k in rules.get("require_human_for", [])]
    t = (text or "").lower()

    sensitive_match = next((k for k in require_human if _has_keyword(t, k)), None)
    handoff = intent in ("COMPLAINT", "HUMAN_REQUEST") or bool(sensitive_match)
    reason = None
    if handoff:
        reason = "explicit human request" if intent == "HUMAN_REQUEST" else (
            "complaint / risk" if intent == "COMPLAINT" else f"matched require-human rule: {sensitive_match}")

    stage_hint = _stage_for(intent, pack, text)
    next_action = "handoff" if handoff else ("stop" if intent == "OPT_OUT" else "reply")
    tags = [intent.lower()]
    return {"next_action": next_action, "handoff": handoff, "handoff_reason": reason,
            "stage_hint": stage_hint, "tags": tags}


def _stage_for(intent: str, pack: dict, text: str | None = None) -> str | None:
    stages = pack.get("pipeline_stages", [])
    t = (text or "").lower()
    keyword_hints = pack.get("keyword_stage_hints") or {}
    for stage, keywords in keyword_hints.items():
        if stage in stages and any(_has_keyword(t, k) for k in keywords):
            return stage

    pack_hints = (pack.get("stage_hints") or {}).get(intent, [])
    for s in stages:
        if any(w in s.lower() for w in pack_hints):
            return s

    wanted = {
        "PRICE_QUERY": ["fee", "price", "quote", "discuss"],
        "PAYMENT_QUERY": ["fee", "negotiation", "po", "ordered", "booking"],
        "BOOKING_QUERY": ["book", "schedul", "appointment", "demo", "visit", "itinerary"],
        "RESCHEDULE": ["book", "schedul", "appointment", "visit"],
        "NEW_LEAD": ["interest", "requirement", "qualified", "collected", "selected", "browsing", "symptom", "service_selected"],
        "NOT_INTERESTED": ["lost"],
    }.get(intent, [])
    for s in stages:
        if any(w in s.lower() for w in wanted):
            return s
    return None


def generate_response(intent: str, decision: dict, pack: dict, contact_name: str | None,
                      history: list[dict], kb: str | None, message_text: str) -> tuple[str, bool]:
    """Returns (reply_text, used_llm). used_llm is False when the deterministic
    template was used because no LLM was reachable."""
    t = pack["templates"]
    q = pack.get("qualification_questions") or ["What are you looking for?"]
    if decision["handoff"]:
        base = t["handoff"]
    elif intent == "PRICE_QUERY":
        base = t["price_reply"]
    elif intent in ("BOOKING_QUERY", "RESCHEDULE"):
        base = f"Sure — happy to help with that. {q[0]}"
    elif intent == "CANCEL":
        base = "No problem, I can help with that. Could you share your booking details so I can pull it up?"
    elif intent == "PAYMENT_QUERY":
        base = "Sure — I can help with payment. Let me get the details and share a secure link."
    elif intent == "NOT_INTERESTED":
        base = t["lost_lead"]
    elif intent == "FOLLOW_UP_REPLY":
        base = t["follow_up"]
    elif intent == "SUPPORT_QUERY":
        base = (f"Happy to help! Here's what I can share:\n{kb[:300]}" if kb else f"Happy to help! {q[0]}")
    else:  # NEW_LEAD / UNKNOWN
        base = t["greeting"]

    # LLM polish (vertical persona + style), with safe fallback to the template.
    llm = _llm_response(base, intent, pack, contact_name, history, kb, message_text)
    return (llm, True) if llm else (base, False)


# ── Orchestrator (the graph) ──────────────────────────────────────────────────

def run_message_graph(*, pack: dict, message_text: str, contact_name: str | None = None,
                      history: list[dict] | None = None, kb: str | None = None) -> dict:
    history = history or []
    intent, _confidence = classify_intent(message_text)
    fields = extract_lead_fields(message_text, pack)
    decision = decide_action(intent, message_text, pack)
    response, used_llm = generate_response(intent, decision, pack, contact_name, history, kb, message_text)
    return {
        "vertical": pack["vertical"],
        "intent": intent,
        # The classifier is deterministic/rule-based — it has no honest calibrated
        # probability, so confidence is NULL with an explicit source (per spec).
        "confidence": None,
        "confidence_source": "deterministic",
        "extracted_fields": fields,
        "next_action": decision["next_action"],
        "handoff": decision["handoff"],
        "handoff_reason": decision["handoff_reason"],
        "stage_hint": decision["stage_hint"],
        "tags": decision["tags"],
        "response": response,
        "fallback_used": not used_llm,
        "model_used": os.environ.get("OLLAMA_MODEL", "mistral:latest") if used_llm else None,
        "graph_version": GRAPH_VERSION,
    }


# ── LLM helpers (optional; deterministic fallback on any failure) ───────────────

def _llm():
    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "mistral:latest"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=0.3, num_predict=350,
    )


def _llm_response(template: str, intent: str, pack: dict, contact_name, history, kb, message_text) -> str | None:
    try:
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
        forbidden = pack["rules"].get("forbidden_claims", [])
        notes = pack["rules"].get("compliance_notes", [])
        system = (
            f"You are the WhatsApp assistant for a {pack['label']} business. Be warm, concise (1-3 sentences), "
            f"and helpful. The customer's intent is {intent}. Reply in that spirit, matching this reference style: "
            f"\"{template}\". "
            + (f"Knowledge base:\n{kb[:1500]}\n" if kb else "")
            + (f"NEVER claim: {', '.join(forbidden)}. " if forbidden else "")
            + (" ".join(notes))
        )
        msgs = [SystemMessage(content=system)]
        for h in (history or [])[-6:]:
            msgs.append(HumanMessage(content=h["text"]) if h.get("sender") == "customer" else AIMessage(content=h.get("text") or ""))
        msgs.append(HumanMessage(content=message_text or ""))
        out = (_llm().invoke(msgs).content or "").strip()
        return out[:1000] or None
    except Exception as exc:
        logger.debug("[graph] LLM response unavailable (%s) — using template", exc)
        return None


def _llm_extract(text: str, pack: dict) -> dict | None:
    try:
        from langchain_core.messages import SystemMessage, HumanMessage
        fields = pack["lead_fields"]
        system = (
            "Extract any of these fields from the customer's WhatsApp message as flat JSON "
            f"(omit unknowns): {fields}. Return ONLY JSON."
        )
        raw = (_llm().invoke([SystemMessage(content=system), HumanMessage(content=text or "")]).content or "").strip()
        raw = raw[raw.find("{"): raw.rfind("}") + 1]
        data = json.loads(raw)
        return {k: v for k, v in data.items() if k in fields and v}
    except Exception:
        return None
